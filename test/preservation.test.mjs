import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createCore, loadWorld } from '../server/core.mjs';
import { Room, readJoin } from '../shared/room.mjs';

test('archived executable and all 115 recovered assets match recorded digests', () => {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(fs.readFileSync('archive/client/shellshock.min.js')), '4721a0eb11762ff8d7bd949cfd6f18c79ae596499f65f07c1ba4ea286dadad11');
  const manifest = JSON.parse(fs.readFileSync('research/assets-manifest.json', 'utf8'));
  for (const [file, item] of Object.entries(manifest)) if (item.sha256) assert.equal(hash(fs.readFileSync('public/' + file)), item.sha256, file);
});

test('final archived tuning includes both new weapons and the late overrides', () => {
  const core = createCore(), w = core.weapons;
  assert.deepEqual(Object.fromEntries(Object.entries(w).map(([name, weapon]) => [name, weapon.damage])),
    { Eggk47: 30, DozenGauge: 8.5, CSG1: 105, Cluck9mm: 26, RPEGG: 140, SMG: 23, M24: 170 });
  assert.equal(w.SMG.rof, 2); assert.equal(w.M24.rof, 15); assert.equal(w.RPEGG.radius, 2.75);
  const player = { scene: null }, smg = new w.SMG(player), m24 = new w.M24(player);
  assert.equal(smg.ammo.rounds, 50); assert.equal(m24.ammo.rounds, 1);
  assert.equal(m24.longReloadTime, 120); assert.equal(smg.longReloadTime, 225);
});

test('all ten embedded maps load original colliders and spawn points', async () => {
  const core = createCore();
  assert.equal(core.minMaps.length, 10);
  for (let i = 0; i < core.minMaps.length; i++) {
    const world = await loadWorld(core, i);
    assert.ok(world.spawnPoints[0].length > 10, core.minMaps[i].name);
    assert.ok(world.meshes.length > 100);
    world.engine.dispose();
  }
});

function request(core, name = 'Preserver', classIndex = 5) {
  const out = new core.Comm.output(16 + name.length * 2);
  for (const value of [15, 255, 21, 0, 0]) out.packInt8(value);
  out.packInt16(0); out.packInt16(0);
  for (const value of [classIndex, 0, 0, 0, 0, 0]) out.packInt8(value);
  out.packString(name); return out.buffer;
}

test('join, ready, spawn, hit, death and room isolation follow the original client protocol', async () => {
  const core = createCore(), world = await loadWorld(core, 0), room = new Room(core, world, { bots: 0 });
  try {
    const make = (name, cls) => {
      const session = room.makeSession(readJoin(core, request(core, name, cls)));
      const messages = []; session.socket = { send: bytes => messages.push(new Uint8Array(bytes)) };
      room.join(session); return { session, messages };
    };
    const a = make('M2DZ', 5), b = make('SMEGG', 4);
    assert.equal(a.messages[0].length, 15); assert.equal(a.messages[0][0], 0);
    room.receive(a.session, new Uint8Array([18])); room.receive(b.session, new Uint8Array([18]));
    assert.equal(a.messages[1][0], 1); assert.equal(a.messages[1].length, 58 + 8);
    assert.ok(a.messages.some(bytes => bytes[0] === 18));
    room.receive(a.session, new Uint8Array([19])); room.receive(b.session, new Uint8Array([19]));
    assert.equal(a.session.player.playing, true); assert.equal(b.session.player.hp, 100);
    const p = a.session.player, target = b.session.player;
    target.disableShield();
    const bullet = room.munitions.bulletPool.retrieve();
    Object.assign(bullet, { player: p, dx: 0, dy: 0, dz: 1, damage: 170 });
    bullet.collidesWithPlayer(target, new core.BABYLON.Vector3(0, 0, -1));
    assert.equal(target.hp, 0); assert.equal(target.playing, false); assert.equal(p.kills, 1);
    assert.ok(b.messages.some(bytes => bytes[0] === 10)); assert.ok(a.messages.some(bytes => bytes[0] === 8));
    const other = createCore(); assert.notEqual(other.Player, core.Player);
  } finally { room.stop(); }
});

test('server rejects malformed joins and preserves angular glancing-hit damage', async () => {
  const core = createCore();
  assert.throws(() => readJoin(core, new Uint8Array([15])));
  const invalid = request(core); invalid[9] = 250; assert.throws(() => readJoin(core, invalid));
  const room = new Room(core, await loadWorld(core, 0), { bots: 0 });
  try {
    const a = room.makeSession(readJoin(core, request(core, 'a'))), b = room.makeSession(readJoin(core, request(core, 'b')));
    room.spawn(a.player); room.spawn(b.player); b.player.disableShield();
    const bullet = room.munitions.bulletPool.retrieve();
    Object.assign(bullet, { player: a.player, dx: 0, dy: 0, dz: 1, damage: 170 });
    bullet.collidesWithPlayer(b.player, new core.BABYLON.Vector3(1, 0, 0));
    assert.equal(b.player.hp, 83);
  } finally { room.stop(); }
});

test('spatula mode and every original projectile survive extended simulation', async () => {
  const core = createCore(), room = new Room(core, await loadWorld(core, 1), { bots: 5, mode: 2 });
  try {
    for (let tick = 0; tick < 900; tick++) room.tick();
    assert.ok(room.spatula);
    for (const p of room.players) assert.ok([p.x, p.y, p.z, p.hp].every(Number.isFinite));
    const player = room.players[0];
    player.disableShield();
    const B = core.BABYLON;
    room.munitions.throwGrenade(player, new B.Vector3(player.x, player.y + .5, player.z), new B.Vector3(0, .15, .2));
    core.Rocket.fire(player, new B.Vector3(player.x, player.y + .5, player.z), new B.Vector3(0, 0, 20), core.weapons.RPEGG);
    for (let tick = 0; tick < 100; tick++) room.tick();
    assert.equal(room.munitions.grenadePool.numActive, 0);
  } finally { room.stop(); }
});
