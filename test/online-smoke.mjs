// Explicit internet test against the running host; excluded from npm test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createCore } from '../server/core.mjs';
const state = JSON.parse(fs.readFileSync('.host/session.json', 'utf8'));
const url = new URL(state.guestLink).searchParams.get('server');
const core = createCore(), clients = [], roomIds = new Set();
async function connect() { const ws = new WebSocket(url, { handshakeTimeout: 12000 }); await once(ws, 'open'); ws.on('error', error => console.log('Internet socket error:', error.message)); clients.push(ws); return ws; }
function packet(ws, data, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', message); reject(new Error('Public tunnel packet timed out: ' + code + ', state ' + ws.readyState)); }, 12000);
    function message(bytes) { if (bytes[0] === code) { clearTimeout(timer); ws.off('message', message); resolve(new Uint8Array(bytes)); } }
    ws.on('message', message); ws.send(data);
  });
}
function join(index) {
  const name = 'Internet' + index, out = new core.Comm.output(16 + name.length * 2);
  for (const value of [15, 255, 21, 0, 0]) out.packInt8(value);
  out.packInt16(0); out.packInt16(0);
  for (const value of [0, 0, 0, 0, 0, 0]) out.packInt8(value);
  out.packString(name); return out.buffer;
}
try {
  for (let i = 0; i < 10; i++) {
    const ws = await connect(), header = await packet(ws, join(i), 0);
    console.log('Joined internet player', i + 1); assert.equal(header[9], 10);
    roomIds.add(header[4] + ',' + header[5]);
    await packet(ws, new Uint8Array([18]), 18);
    await packet(ws, new Uint8Array([19]), 13);
  }
  assert.equal(roomIds.size, 1);
  const health = await (await fetch(state.tunnelOrigin + '/health', { signal: AbortSignal.timeout(10000) })).json();
  assert.equal(health.players, 10);
  const extra = await connect(), closed = once(extra, 'close'); extra.send(join(10));
  assert.equal((await closed)[0], 4001);
  console.log(JSON.stringify({ publicWebSocket: true, spawnedPlayers: 10, sharedRooms: roomIds.size, eleventhRejected: true, relay: state.provider }));
} finally {
  await Promise.all(clients.map(ws => ws.readyState === WebSocket.CLOSED ? undefined : new Promise(resolve => { ws.once('close', resolve); ws.close(1000); })));
}
