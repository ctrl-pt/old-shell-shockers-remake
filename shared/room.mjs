const TAU = Math.PI * 2;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const cleanName = text => String(text).replace(/[<>\x00-\x1f]/g, '').slice(0, 24) || 'Anonymous';

export function readJoin(core, bytes) {
  if (bytes.length < 16 || bytes[0] !== 15) throw new Error('Invalid join packet');
  const input = new core.Comm.input(bytes);
  input.unPackInt8U(); input.unPackInt8U();
  const request = { joinType: input.unPackInt8U(), mode: input.unPackInt8U(), mapIndex: input.unPackInt8U(),
    gameId: input.unPackInt16U(), gameKey: input.unPackInt16U(), classIndex: input.unPackInt8U(),
    primary: input.unPackInt8U(), secondary: input.unPackInt8U(), color: input.unPackInt8U(),
    hat: input.unPackInt8U(), stamp: input.unPackInt8U() };
  const length = bytes[15];
  if (length > 24 || bytes.length < 16 + length * 2 || request.mode > 2 || request.classIndex > 5) throw new Error('Invalid loadout');
  request.name = cleanName(input.unPackString(24));
  if (request.mapIndex >= core.minMaps.length) request.mapIndex = 0;
  return request;
}

export class Room {
  constructor(core, world, options = {}) {
    Object.assign(this, { core, world, id: options.id || 1, key: options.key || 1,
      mapIndex: options.mapIndex || 0, mode: options.mode || 0, limit: 20,
      players: [], sessions: new Map(), tickIndex: 0, lastActive: Date.now(), items: [], botCount: options.bots ?? 5,
      localSimulation: options.localSimulation === true });
    this.munitions = core.configure({ ...world, players: this.players, limit: this.limit, hooks: {
      broadcast: (data, except) => this.broadcast(data, except), explosion: projectile => this.explode(projectile),
      spatula: () => this.sendSpatula(),
    } });
    const room = this;
    core.Bullet.prototype.collidesWithPlayer = function (target, normal) {
      if (!this.active) return;
      const velocity = new core.BABYLON.Vector3(this.dx, this.dy, this.dz).normalize();
      const dot = .9 * -core.BABYLON.Vector3.Dot(velocity, normal) + .1;
      // HP application was removed from the browser build. Preserve the recovered
      // angular exponent and the release note's minimum 10% edge-hit damage.
      room.damage(target, this.player, this.damage * Math.max(.1, Math.pow(Math.max(0, dot), 4)), velocity);
      this.remove();
    };
    core.Rocket.prototype.collidesWithPlayer = function () {
      if (this.active) this.minRange <= 0 ? this.explode() : this.poof();
    };
    // This original method is initialized just beyond the shared-code boundary.
    core.Spatula.prototype.collidesWithMap = function () {
      core.Spatula.v1.set(this.x, this.y, this.z);
      return core.Collider.meshCollidesWithMap(core.Collider.playerCollisionMesh, core.Spatula.v1);
    };
    for (let i = 0; i < this.botCount; i++) this.addBot(i);
    if (this.mode === 2 && world.spatulaPoints.length) {
      this.spatula = new core.Spatula(world.scene, world.spatulaPoints[0]);
      core.setSpatula(this.spatula);
    }
    this.createItems();
    this.timer = setInterval(() => this.tick(), 1000 / 30);
    this.timer.unref?.();
  }

  packet(size, write) {
    const out = new this.core.Comm.output(size); write(out); return out.buffer;
  }
  send(session, data) { if (session.socket) session.socket.send(data); }
  broadcast(data, except) {
    for (const session of this.sessions.values()) if (session.ready && session.player.id !== except) this.send(session, data);
  }
  selectTeam() {
    if (!this.mode) return 0;
    const counts = [0, 0, 0]; for (const p of this.players) if (p) counts[p.team]++;
    return counts[1] <= counts[2] ? 1 : 2;
  }
  makePlayer(request, id) {
    const catalog = this.core.catalog, classIndex = request.classIndex;
    const primary = catalog.findItemBy8BitItemId(3, classIndex, request.primary) || catalog.forClass[classIndex].primaryWeapons[0];
    const secondary = catalog.findItemBy8BitItemId(4, classIndex, request.secondary) || catalog.forClass[classIndex].secondaryWeapons[0];
    return new this.core.Player({ id, uniqueId: id + 1, name: cleanName(request.name), charClass: classIndex,
      team: this.selectTeam(), primaryWeaponItem: primary, secondaryWeaponItem: secondary,
      shellColor: clamp(request.color || 0, 0, 6), hatItem: catalog.findItemBy8BitItemId(1, classIndex, request.hat || 0),
      stampItem: catalog.findItemBy8BitItemId(2, classIndex, request.stamp || 0),
      x: 1.5, y: 2, z: 1.5, dx: 0, dy: 0, dz: 0, controlKeys: 0, yaw: 0, pitch: 0,
      score: 0, kills: 0, deaths: 0, streak: 0, totalKills: 0, totalDeaths: 0, bestGameStreak: 0,
      bestOverallStreak: 0, shield: 0, hp: 0, playing: false, weaponIdx: 0, randomSeed: 0, upgradeProductId: 0 }, this.world.scene);
  }
  makeSession(request) {
    let id = this.players.findIndex(p => !p);
    if (id < 0) id = this.players.length;
    if (id >= this.limit) throw new Error('Game is full');
    const player = this.makePlayer(request, id);
    this.players[id] = player;
    const session = { player, request, ready: false, socket: null, lastSync: 0, respawnAt: 0, chatAt: 0 };
    this.sessions.set(id, session); return session;
  }
  join(session) {
    const p = session.player;
    p.isGameOwner = this.sessions.size === 1;
    this.send(session, this.packet(15, out => {
      out.packInt8(0); out.packInt8(p.id); out.packInt8(p.team); out.packInt8(this.mode);
      out.packInt16(this.id); out.packInt16(this.key); out.packInt8(this.mapIndex); out.packInt8(this.limit);
      out.packInt8(p.isGameOwner ? 1 : 0); out.packInt16(0); out.packInt16(0);
    }));
    this.lastActive = Date.now();
  }
  playerPacket(p) {
    const c = this.core.catalog;
    return this.packet(58 + 2 * p.name.length, out => {
      out.packInt8(1); out.packInt8(p.id); out.packInt16(p.uniqueId); out.packString(p.name);
      for (const value of [p.charClass, p.team, c.get8BitItemId(p.primaryWeaponItem, p.charClass),
        c.get8BitItemId(p.secondaryWeaponItem, p.charClass), p.shellColor,
        c.get8BitItemId(p.hatItem, p.charClass), c.get8BitItemId(p.stampItem, p.charClass)]) out.packInt8(value);
      for (const value of [p.x, p.y, p.z, p.dx, p.dy, p.dz]) out.packFloat(value);
      out.packRadU(p.yaw); out.packRad(p.pitch); out.packInt32(p.score);
      for (const value of [p.kills, p.deaths, p.streak]) out.packInt16(value);
      out.packInt32(p.totalKills); out.packInt32(p.totalDeaths);
      out.packInt16(p.bestGameStreak); out.packInt16(p.bestOverallStreak);
      for (const value of [p.shield, Math.ceil(p.hp), p.playing ? 1 : 0, p.weaponIdx, p.controlKeys]) out.packInt8(value);
      out.packInt16(p.randomSeed); out.packInt8(0);
    });
  }
  ready(session) {
    if (session.ready) return;
    for (const p of this.players) if (p) this.send(session, this.playerPacket(p));
    this.broadcast(this.playerPacket(session.player));
    session.ready = true;
    for (const item of this.items) if (item.active) this.send(session, this.itemPacket(item));
    if (this.spatula) this.send(session, this.spatulaPacket());
    this.send(session, new Uint8Array([18]));
  }
  receive(session, bytes) {
    if (!bytes.length || bytes.length > 2048) throw new Error('Invalid packet size');
    const input = new this.core.Comm.input(bytes), code = input.unPackInt8U(), p = session.player;
    this.lastActive = Date.now();
    if (code === 16) { this.send(session, new Uint8Array([16])); return; }
    if (code === 18) { this.ready(session); return; }
    if (!session.ready) return;
    switch (code) {
      case 6: {
        if (bytes.length !== 18 || !p.playing) return;
        const now = Date.now();
        if (!this.localSimulation && now - session.lastSync < 45) return;
        session.lastSync = now;
        const next = input.unPackInt8U(), shots = Math.min(input.unPackInt8U(), 5);
        const states = [];
        for (let i = 0; i < 3; i++) states.push({ controlKeys: input.unPackInt8U() & 63,
          yaw: input.unPackRadU() % TAU, pitch: clamp(input.unPackRad(), -1.5, 1.5) });
        const start = { x: p.x, y: p.y, z: p.z, climbing: p.climbing };
        p.stateIdx = (next + 253) % 256;
        if (shots) p.disableShield();
        p.shotsQueued = Math.min(p.shotsQueued + shots, 5);
        for (const state of states) {
          Object.assign(p.stateBuffer[p.stateIdx], state);
          p.update();
        }
        this.broadcast(this.syncPacket(p, next, states, start), p.id);
        this.send(session, this.syncPacket(p, next, states, p));
        break;
      }
      case 7: if (p.playing && p.jump()) this.broadcast(new Uint8Array([7, p.id]), p.id); break;
      case 19: if (Date.now() >= session.respawnAt && !p.playing) this.spawn(p); break;
      case 14:
        if (bytes.length !== 2) return;
        p.equipWeaponIdx = bytes[1] & 1; p.weaponSwapsQueued = 1; break;
      case 33: p.reloadsQueued = 1; break;
      case 20:
        if (bytes.length !== 3 || !p.playing) return;
        p.queueGrenade(clamp(input.unPackFloat(), 0, 1)); break;
      case 30:
        p.removeFromPlay(); session.respawnAt = Date.now() + 5000;
        this.broadcast(new Uint8Array([30, p.id])); break;
      case 25:
        if (!this.mode) return;
        if (this.spatula?.controlledBy === p.id) this.spatula.drop();
        p.team = p.team === 1 ? 2 : 1; p.removeFromPlay();
        this.broadcast(new Uint8Array([25, p.id, p.team])); break;
      case 27: {
        if (bytes.length !== 7) return;
        const classIndex = bytes[1]; if (classIndex > 5) return;
        const c = this.core.catalog;
        const primary = c.findItemBy8BitItemId(3, classIndex, bytes[2]) || c.forClass[classIndex].primaryWeapons[0];
        const secondary = c.findItemBy8BitItemId(4, classIndex, bytes[3]) || c.forClass[classIndex].secondaryWeapons[0];
        p.changeCharacter(classIndex, primary, secondary, clamp(bytes[4], 0, 6),
          c.findItemBy8BitItemId(1, classIndex, bytes[5]), c.findItemBy8BitItemId(2, classIndex, bytes[6]));
        break;
      }
      case 3: {
        if (Date.now() - session.chatAt < 500 || bytes.length < 2 || bytes[1] > 100 || bytes.length !== 2 + 2 * bytes[1]) return;
        session.chatAt = Date.now();
        const text = input.unPackString(100).replace(/[<>\x00-\x1f]/g, '');
        if (text) this.broadcast(this.packet(3 + 2 * text.length, out => { out.packInt8(3); out.packInt8(p.id); out.packString(text); }));
        break;
      }
    }
  }
  syncPacket(p, next, states, position) {
    return this.packet(25, out => {
      out.packInt8(6); out.packInt8(p.id); out.packInt8(next);
      out.packFloat(position.x); out.packFloat(position.y); out.packFloat(position.z); out.packInt8(position.climbing ? 1 : 0);
      for (const state of states) { out.packInt8(state.controlKeys); out.packRadU(state.yaw); out.packRad(state.pitch); }
    });
  }
  spawn(p) {
    const points = this.world.spawnPoints[p.team].length ? this.world.spawnPoints[p.team] : this.world.spawnPoints[0];
    // Prefer a spawn away from active enemies. Pre-marker maps use reconstructed markers.
    let best = points[0], bestScore = -1;
    for (const point of points.slice().sort(() => Math.random() - .5)) {
      let score = Infinity;
      for (const other of this.players) if (other?.playing && other.id !== p.id && (!p.team || other.team !== p.team))
        score = Math.min(score, Math.hypot(other.x - point.x, other.z - point.z));
      if (score > bestScore) { best = point; bestScore = score; }
    }
    p.dx = p.dy = p.dz = 0;
    p.respawn(best.x, best.y, best.z);
    this.broadcast(this.packet(8, out => { out.packInt8(13); out.packInt8(p.id); out.packFloat(p.x); out.packFloat(p.y); out.packFloat(p.z); }));
  }
  damage(target, attacker, amount, direction) {
    if (!target?.playing || target.shield > 0 || !Number.isFinite(amount) || amount <= 0) return;
    if (target.id !== attacker.id && target.team && target.team === attacker.team) return;
    target.hp = Math.max(0, target.hp - amount);
    const hit = this.packet(3, out => { out.packInt8(9); out.packInt8(target.id); out.packInt8(Math.ceil(target.hp)); });
    this.broadcast(hit, target.id);
    const session = this.sessions.get(target.id);
    if (session) this.send(session, this.packet(6, out => { out.packInt8(10); out.packInt8(Math.ceil(target.hp)); out.packFloat(direction.x); out.packFloat(direction.z); }));
    if (target.hp <= 0) {
      if (this.spatula?.controlledBy === target.id) this.spatula.drop();
      target.die(); target.respawnAt = Date.now() + 5000;
      if (attacker !== target && attacker.playing) attacker.scoreKill();
      if (session) session.respawnAt = target.respawnAt;
      this.broadcast(new Uint8Array([8, target.id, attacker.id, 5]));
    }
  }
  explode(projectile) {
    const B = this.core.BABYLON, origin = new B.Vector3(projectile.x, projectile.y, projectile.z);
    for (const target of this.players) {
      if (!target?.playing) continue;
      const delta = new B.Vector3(target.x, target.y + .32, target.z).subtract(origin), distance = delta.length();
      if (distance >= projectile.radius) continue;
      const wall = this.core.Collider.rayCollidesWithMap(origin, delta, this.core.Collider.projectileCollidesWithCell);
      if (wall && B.Vector3.Distance(origin, wall.pick.pickedPoint) + .05 < distance) continue;
      this.damage(target, projectile.player, projectile.damage * (1 - distance / projectile.radius), delta.normalize());
    }
  }
  addBot(index) {
    const p = this.makePlayer({ classIndex: index % 6, name: ['Scrambled [BOT]', 'Sunny [BOT]', 'Poacher [BOT]', 'Yolk [BOT]', 'Shelly [BOT]'][index % 5], color: index % 7 }, index);
    p.bot = true; p.nextDecision = 0; this.players[index] = p; this.spawn(p);
  }
  updateBot(p, now) {
    if (!p.playing) { if (now >= (p.respawnAt || 0)) this.spawn(p); return; }
    const enemies = this.players.filter(other => other?.playing && other.id !== p.id && (!p.team || other.team !== p.team));
    let target, distance = Infinity;
    for (const other of enemies) { const d = Math.hypot(other.x - p.x, other.y - p.y, other.z - p.z); if (d < distance) { target = other; distance = d; } }
    if (target) {
      p.yaw = (Math.atan2(target.x - p.x, target.z - p.z) + TAU) % TAU;
      p.pitch = -Math.atan2(target.y - p.y, Math.max(.01, Math.hypot(target.x - p.x, target.z - p.z)));
      p.controlKeys = distance > 5 ? 1 : 4;
      const B = this.core.BABYLON, origin = new B.Vector3(p.x, p.y + .3, p.z), dir = new B.Vector3(target.x - p.x, target.y - p.y, target.z - p.z);
      const wall = this.core.Collider.rayCollidesWithMap(origin, dir, this.core.Collider.projectileCollidesWithCell);
      const visible = !wall || B.Vector3.Distance(origin, wall.pick.pickedPoint) > distance - .3;
      if (visible && distance < p.weapon.subClass.range && this.tickIndex % 5 === 0) { p.disableShield(); p.shotsQueued = 1; }
    }
    if (this.tickIndex % 45 === p.id * 3 && p.jump()) this.broadcast(new Uint8Array([7, p.id]));
    if (!p.weapon.ammo.rounds) p.reloadsQueued = 1;
    Object.assign(p.stateBuffer[p.stateIdx], { controlKeys: p.controlKeys, yaw: p.yaw, pitch: p.pitch });
    p.update();
    if (this.tickIndex % 3 === 0) {
      const state = { controlKeys: p.controlKeys, yaw: p.yaw, pitch: p.pitch };
      this.broadcast(this.syncPacket(p, p.stateIdx, [state, state, state], p));
    }
  }
  createItems() {
    let id = 0;
    const points = this.world.spawnPoints[0];
    for (let i = 0; i < Math.min(18, points.length); i++) {
      const p = points[i];
      this.items.push({ id: id++, kind: i % 4 === 0 ? 1 : 0, x: p.x, y: p.y + .15, z: p.z, active: true, respawnAt: 0 });
    }
  }
  itemPacket(item) {
    return this.packet(10, out => { out.packInt8(12); out.packInt16(item.id); out.packInt8(item.kind); out.packFloat(item.x); out.packFloat(item.y); out.packFloat(item.z); });
  }
  updateItems(now) {
    for (const item of this.items) {
      if (!item.active) { if (now >= item.respawnAt) { item.active = true; this.broadcast(this.itemPacket(item)); } continue; }
      for (const p of this.players) if (p?.playing && Math.hypot(p.x - item.x, p.y - item.y, p.z - item.z) < .5) {
        // Original ItemManager kinds: ammo=0, grenade=1.
        const collected = item.kind === 1 ? (p.grenadeCount < 3 && (++p.grenadeCount, true)) : p.weapon.collectAmmo();
        if (!collected) continue;
        item.active = false; item.respawnAt = now + 12000;
        this.broadcast(this.packet(6, out => { out.packInt8(11); out.packInt8(p.id); out.packInt8(item.kind); out.packInt8(p.weaponIdx); out.packInt16(item.id); })); break;
      }
    }
  }
  spatulaPacket() {
    const s = this.spatula;
    return this.packet(9, out => { out.packInt8(44); out.packFloat(s.x); out.packFloat(s.y); out.packFloat(s.z); out.packInt8(s.controlledBy); out.packInt8(s.controlledByTeam); });
  }
  sendSpatula() { if (this.spatula) this.broadcast(this.spatulaPacket()); }
  tick() {
    const now = Date.now(); this.core.setNow(now); this.tickIndex++;
    for (const p of this.players) if (p?.bot) this.updateBot(p, now);
    this.munitions.updateLogic();
    this.spatula?.update();
    this.updateItems(now);
  }
  leave(session) {
    if (this.spatula?.controlledBy === session.player.id) this.spatula.drop();
    this.players[session.player.id] = null; this.sessions.delete(session.player.id);
    this.broadcast(new Uint8Array([2, session.player.id])); this.lastActive = Date.now();
    if (!this.sessions.size) this.stop();
  }
  stop() { clearInterval(this.timer); this.world.engine.dispose(); }
}
