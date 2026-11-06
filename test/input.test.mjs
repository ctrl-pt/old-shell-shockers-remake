import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createCore, loadWorld } from '../server/core.mjs';
import { Room } from '../shared/room.mjs';

function event(type, properties = {}) {
  return Object.assign(new Event(type, { cancelable: true }), properties);
}

async function setup({ localSimulation = false } = {}) {
  const core = createCore(), world = await loadWorld(core, 0);
  const room = new Room(core, world, { bots: 0, localSimulation });
  const session = room.makeSession({ name: 'Input test', classIndex: 0, primary: 0, secondary: 0 });
  session.ready = true; session.socket = { send() {} };
  const player = session.player;
  let spawn;
  for (let x = 2; x < world.map.width - 2 && !spawn; x++) for (let z = 2; z < world.map.depth - 2; z++) {
    if (world.map.data[x][0][z].idx && [-1, 0, 1].every(d =>
      !world.map.data[x + d][1][z].idx && !world.map.data[x][1][z + d].idx)) {
      spawn = { x: x + .5, y: 1, z: z + .5 }; break;
    }
  }
  assert.ok(spawn, 'original map has a clear movement test location');
  player.respawn(spawn.x, spawn.y, spawn.z); player.disableShield();
  const doc = new EventTarget(), win = new EventTarget();
  doc.pointerLockElement = null;
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const el = new EventTarget();
      Object.assign(el, { id, tagName: 'DIV', style: { display: 'none' }, dataset: {}, tabIndex: -1,
        focus() { doc.activeElement = el; }, setAttribute(name, value) { el[name] = value; } });
      elements.set(id, el);
    }
    return elements.get(id);
  }
  const canvas = element('canvas'); canvas.tagName = 'CANVAS';
  canvas.requestPointerLock = () => Promise.reject(new Error('Pointer Lock denied'));
  doc.getElementById = id => ['footerlinks', 'currentBalanceContainer'].includes(id) ? null : element(id);
  const sent = [];
  const context = vm.createContext({ document: doc, canvas, console, window: null,
    addEventListener: win.addEventListener.bind(win),
    localStorage: { getItem() { return null; }, setItem() {} },
    extern: { respawn() {} }, s2019Practice: true, me: player, meId: player.id, Player: core.Player,
    CONTROL: core.CONTROL, Comm: core.Comm, CommCode: core.CommCode, inGame: true, chatting: false,
    settings: { mouseSensitivity: 5, mouseInvert: 1, holdToAim: true },
    inputToControlMap: { W: 'up', S: 'down', A: 'left', D: 'right', SPACE: 'jump', 'MOUSE 0': 'fire' },
    Math: Object.assign(Object.create(Math), { radAdd: (a, b) => (a + b + 2 * Math.PI) % (2 * Math.PI),
      clamp: (x, min, max) => Math.max(min, Math.min(max, x)) }),
    playerAccount: {}, ws: { send: data => sent.push(new Uint8Array(data)) },
    doFirstPersonCamera() {}, reticle: { show() {}, hide() {} }, addCanvasListeners() {},
    hideSpinner() {}, hideDarkOverlay() {}, showCornerButtons() {}, removeCanvasListeners() {},
    timeout: { set() {} }, notify() {}, updateLogic() {},
  });
  context.window = context;
  context.shell2019 = { run: source => vm.runInContext(source, context), getState: () => ({ me: player }) };
  const archived = fs.readFileSync('archive/client/shellshock.min.js', 'utf8');
  vm.runInContext(archived.slice(archived.indexOf('function showGameMenu()'), archived.indexOf('function setRespawnTime(')), context);
  vm.runInContext(fs.readFileSync('public/src/gameplayTips.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public/src/input.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('public/src/restore.js', 'utf8'), context);
  context.onload(); context.preservationControls.activate();
  context.preservationControls.requestCapture(); await Promise.resolve();
  return { core, world, room, player, spawn, doc, win, canvas, context, sent, element };
}

test('WASD changes real archived player position without Pointer Lock', async () => {
  const s = await setup();
  try {
    assert.equal(s.doc.activeElement, s.canvas);
    assert.equal(s.canvas.tabIndex, 0);
    for (const [key, field, sign] of [['w', 'z', 1], ['s', 'z', -1], ['a', 'x', -1], ['d', 'x', 1]]) {
      s.player.respawn(s.spawn.x, s.spawn.y, s.spawn.z);
      const before = s.player[field];
      const down = event('keydown', { key, code: 'Key' + key.toUpperCase() });
      s.doc.dispatchEvent(down);
      assert.equal(down.defaultPrevented, true);
      for (let tick = 0; tick < 12; tick++) {
        s.player.stateBuffer[s.player.stateIdx].controlKeys = s.player.controlKeys;
        s.player.update();
      }
      assert.ok((s.player[field] - before) * sign > .3, key + ' moves the player');
      s.doc.dispatchEvent(event('keyup', { key }));
      assert.equal(s.player.controlKeys, 0);
    }
  } finally { s.room.stop(); }
});

test('Space raises the real egg and mouse movement rotates yaw/pitch with no button held', async () => {
  const s = await setup();
  try {
    const before = s.player.y;
    const jump = event('keydown', { key: ' ', code: 'Space' }); s.doc.dispatchEvent(jump);
    assert.equal(jump.defaultPrevented, true);
    assert.equal(s.sent.at(-1)[0], 7);
    for (let tick = 0; tick < 4; tick++) s.player.update();
    assert.ok(s.player.y > before + .25);
    s.doc.dispatchEvent(event('keyup', { key: ' ', code: 'Space' }));
    s.player.actor = { scope: false };
    const yaw = s.player.yaw, pitch = s.player.pitch;
    s.canvas.dispatchEvent(event('mousemove', { clientX: 100, clientY: 100, buttons: 0 }));
    s.canvas.dispatchEvent(event('mousemove', { clientX: 180, clientY: 140, buttons: 0 }));
    assert.ok(Math.abs(s.player.yaw - yaw) > .2);
    assert.ok(s.player.pitch > pitch + .1);
    s.player.actor = null;
  } finally { s.room.stop(); }
});

test('blur and Escape release movement and resume restores canvas focus', async () => {
  const s = await setup();
  try {
    s.doc.dispatchEvent(event('keydown', { key: 'w' }));
    assert.equal(s.player.controlKeys, 1);
    s.win.dispatchEvent(event('blur')); assert.equal(s.player.controlKeys, 0);
    s.doc.dispatchEvent(event('keydown', { key: 'd' }));
    s.doc.dispatchEvent(event('keydown', { key: 'Escape' }));
    assert.equal(s.player.controlKeys, 0); assert.equal(s.element('gameMenu').style.display, 'block');
    assert.ok(s.element('gameplayTip').innerHTML, 'the original menu can load its gameplay tip');
    s.doc.dispatchEvent(event('keydown', { key: 'w' })); assert.equal(s.player.controlKeys, 0);
    s.context.extern.respawn(); assert.equal(s.doc.activeElement, s.canvas);
    s.doc.dispatchEvent(event('keydown', { key: 'w' })); assert.equal(s.player.controlKeys, 1);
  } finally { s.room.stop(); }
});

test('practice retains every movement packet when browser timers deliver a burst', async () => {
  const s = await setup({ localSimulation: true });
  try {
    const before = s.player.z;
    for (let frame = 3; frame <= 30; frame += 3) {
      const packet = new s.core.Comm.output(18);
      packet.packInt8(6); packet.packInt8(frame); packet.packInt8(0);
      for (let i = 0; i < 3; i++) { packet.packInt8(1); packet.packRadU(0); packet.packRad(0); }
      s.room.receive(s.room.sessions.get(s.player.id), packet.buffer);
    }
    assert.ok(s.player.z - before > 1, 'all thirty input frames are simulated');
    assert.equal(s.player.stateIdx, 30);
  } finally { s.room.stop(); }
});
