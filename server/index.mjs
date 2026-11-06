import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createCore, loadWorld } from './core.mjs';
import { Room, readJoin } from '../shared/room.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const rooms = new Map(), pendingRooms = new Map();
let nextId = 1;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.babylon': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', rooms: rooms.size })); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname.endsWith('.manifest')) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': pathname.endsWith('.babylon') || pathname.endsWith('.mp3') ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
});
const wss = new WebSocketServer({ server, path: '/game', maxPayload: 2048 });
const codecCore = createCore();

async function getRoom(request) {
  if (request.joinType === 22) {
    const room = rooms.get(request.gameId);
    if (!room || room.key !== request.gameKey) throw Object.assign(new Error('Game not found'), { closeCode: 4000 });
    return room;
  }
  if (request.joinType === 21) {
    const found = [...rooms.values()].find(room => !room.private && room.mode === request.mode && room.sessions.size < 14);
    if (found) return found;
  }
  const pendingKey = request.joinType === 23 ? Symbol('private') : request.mode;
  if (pendingRooms.has(pendingKey)) return pendingRooms.get(pendingKey);
  const job = (async () => {
    const core = createCore();
    const mapIndex = request.joinType === 23 ? request.mapIndex : Math.floor(Math.random() * core.minMaps.length);
    const world = await loadWorld(core, mapIndex);
    const room = new Room(core, world, { id: nextId++, key: Math.floor(Math.random() * 1295) + 1, mapIndex,
      mode: request.mode, bots: Number(process.env.BOTS ?? 5) });
    room.private = request.joinType === 23; rooms.set(room.id, room);
    console.log(`Room ${room.id}: ${core.minMaps[mapIndex].name}, mode ${room.mode}`);
    return room;
  })();
  pendingRooms.set(pendingKey, job);
  try { return await job; } finally { pendingRooms.delete(pendingKey); }
}

wss.on('connection', socket => {
  let room, session, joining = false, count = 0, lastWindow = Date.now();
  socket.on('message', async (data, binary) => {
    try {
      if (!binary || data.length > 2048) { socket.close(1003, 'Binary packets required'); return; }
      if (Date.now() - lastWindow > 1000) { lastWindow = Date.now(); count = 0; }
      if (++count > 80) { socket.close(1008, 'Too many messages'); return; }
      const bytes = new Uint8Array(data);
      if (bytes[0] === 16) { socket.send(new Uint8Array([16])); return; }
      if (!session) {
        if (joining || bytes[0] !== 15) return;
        joining = true;
        const request = readJoin(codecCore, bytes);
        room = await getRoom(request);
        if (socket.readyState !== WebSocket.OPEN) return;
        session = room.makeSession(request); session.socket = socket; room.join(session);
      } else room.receive(session, bytes);
    } catch (error) {
      console.error('Game connection:', error.message);
      socket.close(error.closeCode || 1008, error.message.slice(0, 100));
    }
  });
  socket.on('close', () => { if (session) { room.leave(session); if (!room.sessions.size) rooms.delete(room.id); } });
  socket.on('error', error => console.warn('Socket:', error.message));
});
server.listen(port, '0.0.0.0', () => console.log(`Shell Shockers May 2019 · http://localhost:${port}`));
function stop() { for (const room of rooms.values()) room.stop(); wss.close(); server.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
