import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCore, loadWorld } from '../server/core.mjs';
import { Room, readJoin } from '../shared/room.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const addedNames = ['Alpha1', 'Alpha2', 'Alpha3', 'Early Bedrock'];

test('all runtimes share fourteen maps and preserve the original ten indices and data', () => {
  const core = createCore();
  assert.deepEqual(plain(core.minMaps.slice(0, 10)), read('research/agent/maps-20190519.json'));
  assert.deepEqual(plain(core.minMaps.slice(10).map(m => m.name)), addedNames);
  const context = vm.createContext({ BABYLON: core.BABYLON, window: {}, console });
  vm.runInContext(fs.readFileSync('public/src/headless.js', 'utf8'), context);
  assert.deepEqual(plain(context.createShellCore().minMaps), plain(core.minMaps));
  const shipped = fs.readFileSync('public/src/shellshock.js', 'utf8');
  const append = shipped.match(/minMaps\.push\.apply\(minMaps,(\[.*?\])\);globalThis\.shell2019=/);
  assert.ok(append, 'browser client appends recovered maps before its menu initializes');
  assert.deepEqual(JSON.parse(append[1]), plain(core.minMaps.slice(10)));
});

test('conversion preserves every recovered tile coordinate and rotation with matching models', () => {
  const maps = read('public/maps/historical.json');
  const manifest = read('research/maps-before-may2019/recovered-maps.json');
  const mapping = { '1/0': 'generic.grass.full', '1/1': 'generic.pavement.full', '1/2': 'generic.concrete.full',
    '2/3': 'generic.brown-block.full', '4/0': 'generic.barricade.aabb', '5/0': 'generic.stairs.wedge',
    '5/2': 'generic.metal-ramp.wedge', '6/0': 'generic.metal-ladder.ladder' };
  for (const [index, map] of maps.entries()) {
    const native = read('research/maps-before-may2019/' + manifest[index].native_map_file);
    assert.deepEqual([map.width, map.height, map.depth], [native.width, native.height, native.depth]);
    const expected = [];
    for (const [cat, decs] of Object.entries(native.data)) for (const [dec, cells] of Object.entries(decs)) {
      for (const c of cells) expected.push([mapping[cat + '/' + dec], c.x, c.y, c.z, c.dir || 0].join('|'));
    }
    const actual = Object.entries(map.data).filter(([name]) => !name.startsWith('SPECIAL.')).flatMap(([name, cells]) =>
      cells.map(c => [name, c.x, c.y, c.z, c.ry || 0].join('|')));
    assert.deepEqual(actual.sort(), expected.sort(), map.name);
  }
});

for (let index = 10; index < 14; index++) test(`${addedNames[index - 10]} supports safe spawns, joining and all three modes`, async () => {
  const core = createCore(), world = await loadWorld(core, index), B = core.BABYLON;
  try {
    assert.ok(world.spawnPoints[1].length > 5 && world.spawnPoints[2].length > 5);
    for (const mode of [0, 1, 2]) {
      const room = new Room(core, world, { mapIndex: index, mode, bots: 0 });
      try {
        const out = new core.Comm.output(24);
        for (const value of [15, 255, 23, mode, index]) out.packInt8(value);
        out.packInt16(0); out.packInt16(0);
        for (const value of [0, 0, 0, 0, 0, 0]) out.packInt8(value);
        out.packString('Maps');
        const request = readJoin(core, out.buffer);
        assert.equal(request.mapIndex, index);
        const session = room.makeSession(request), messages = [];
        session.socket = { send: bytes => messages.push(new Uint8Array(bytes)) };
        room.join(session); room.ready(session); room.spawn(session.player);
        assert.equal(messages[0][8], index, 'handshake selects the recovered map');
        for (const p of world.spawnPoints[0]) {
          assert.equal(core.Collider.meshCollidesWithMap(core.Collider.playerCollisionMesh, new B.Vector3(p.x, p.y, p.z)), false,
            `spawn must clear the real player collider: ${JSON.stringify(p)}`);
        }
        for (let tick = 0; tick < 90; tick++) room.tick();
        const player = session.player;
        assert.ok(player.playing && player.hp === 100);
        assert.ok([player.x, player.y, player.z].every(Number.isFinite));
        assert.ok(player.y >= 1 && player.y < world.map.height, 'player settles on a solid surface');
        assert.equal(Boolean(room.spatula), mode === 2);
        if (room.spatula) assert.ok([room.spatula.x, room.spatula.y, room.spatula.z].every(Number.isFinite));
      } finally { room.stop(); }
    }
  } finally { world.engine.dispose(); }
});
