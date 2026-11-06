import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import vm from 'node:vm';
import fs from 'node:fs';
import { createGameServer } from '../server/app.mjs';
import { createCore } from '../server/core.mjs';

function network() {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync('public/src/network.js', 'utf8'), context);
  return context.shellNetwork;
}
function join(core, { type = 21, id = 0, key = 0, map = 10, name = 'Guest' } = {}) {
  const out = new core.Comm.output(16 + name.length * 2);
  for (const n of [15, 255, type, 0, map]) out.packInt8(n);
  out.packInt16(id); out.packInt16(key);
  for (const n of [0, 0, 0, 0, 0, 0]) out.packInt8(n);
  out.packString(name); return out.buffer;
}
function exchange(socket, data, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Packet timed out: ' + code)); }, 8000);
    function cleanup() { clearTimeout(timer); socket.off('message', message); socket.off('close', closed); }
    function message(bytes) { if (bytes[0] === code) { cleanup(); resolve(new Uint8Array(bytes)); } }
    function closed(n, reason) { cleanup(); reject(new Error(`Connection closed ${n}: ${reason}`)); }
    socket.on('message', message); socket.on('close', closed); socket.send(data);
  });
}
async function connect(url) {
  const socket = new WebSocket(url); await once(socket, 'open'); socket.on('error', () => {}); return socket;
}

test('invite links keep secure server routing and fixed-width room codes', () => {
  const n = network(), backend = 'wss://test.trycloudflare.com/game?key=invite-only';
  assert.equal(n.gameCode(0, 1, 1), '000101');
  const url = new URL(n.inviteUrl('https://game.example/?practice&diagnostics#old', backend, n.gameCode(0, 1, 1), 2));
  assert.equal(url.searchParams.get('server'), backend); assert.equal(url.hash, '#000101');
  assert.equal(url.searchParams.get('mode'), '2'); assert.equal(url.searchParams.has('practice'), false);
  assert.equal(parseInt(url.hash.slice(2, 5), 36), 1);
  assert.equal(parseInt(url.hash.slice(5), 36), 1);
  assert.throws(() => n.backendUrl('ws://localhost:3000/game', true), /secure/);
  assert.throws(() => n.backendUrl('https://example.com', true), /Invalid/);
});

test('ten remote clients join one room; the eleventh is refused and slots are released', { timeout: 20000 }, async () => {
  const app = createGameServer({ port: 0, accessKey: 'test-access-key', logger: { log() {}, warn() {} } });
  const address = await app.listen(), url = `ws://127.0.0.1:${address.port}/game?key=test-access-key`;
  const clients = [], core = createCore();
  try {
    const owner = await connect(url); clients.push(owner);
    const header = await exchange(owner, join(core, { type: 23, name: 'Host' }), 0);
    const input = new core.Comm.input(header);
    for (let i = 0; i < 4; i++) input.unPackInt8U();
    const id = input.unPackInt16U(), key = input.unPackInt16U();
    assert.equal(input.unPackInt8U(), 10); assert.equal(input.unPackInt8U(), 10);
    await exchange(owner, new Uint8Array([18]), 18); await exchange(owner, new Uint8Array([19]), 13);
    for (let i = 1; i < 10; i++) {
      const socket = await connect(url); clients.push(socket);
      const joined = await exchange(socket, join(core, { type: 22, id, key, name: 'Guest' + i }), 0);
      assert.equal(joined[8], 10); assert.equal(joined[9], 10);
      await exchange(socket, new Uint8Array([18]), 18); await exchange(socket, new Uint8Array([19]), 13);
    }
    assert.deepEqual(app.status(), { status: 'ok', players: 10, maxPlayers: 10, rooms: 1 });
    const extra = await connect(url); clients.push(extra);
    const closed = once(extra, 'close'); extra.send(join(core, { type: 23 }));
    assert.equal((await closed)[0], 4001);
    assert.equal(app.status().rooms, 1, 'capacity cannot be bypassed by creating another room');
    const departed = clients.pop(); departed.terminate();
    const leaving = clients[9]; leaving.close(); await once(leaving, 'close');
    for (let i = 0; app.status().players === 10 && i < 30; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const replacement = await connect(url); clients.push(replacement);
    await exchange(replacement, join(core, { type: 22, id, key }), 0);
    assert.equal(app.status().players, 10);
  } finally { for (const client of clients) client.terminate(); await app.close(); }
});

test('a host session rejects missing keys and only exposes public game files', { timeout: 10000 }, async () => {
  const app = createGameServer({ port: 0, accessKey: 'private-session', logger: { log() {}, warn() {} } });
  const address = await app.listen(), origin = `http://127.0.0.1:${address.port}`;
  try {
    const socket = new WebSocket(origin.replace('http:', 'ws:') + '/game');
    await assert.rejects(once(socket, 'open'), /401/);
    const health = await fetch(origin + '/health');
    assert.equal(health.headers.get('access-control-allow-origin'), '*');
    assert.equal((await health.json()).maxPlayers, 10);
    assert.equal((await fetch(origin + '/server/app.mjs')).status, 404);
    assert.equal((await fetch(origin + '/.host/session.json')).status, 404);
    assert.equal((await fetch(origin + '/')).status, 200);
  } finally { await app.close(); }
});
