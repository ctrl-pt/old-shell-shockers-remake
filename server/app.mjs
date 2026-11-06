import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createCore, loadWorld } from './core.mjs';
import { Room, readJoin } from '../shared/room.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.babylon': 'application/json', '.ico': 'image/x-icon' };

export function createGameServer({ port = 3000, host = '127.0.0.1', maxPlayers = 10, bots = 0, accessKey = '', logger = console } = {}) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 10) throw new Error('Player limit must be between 1 and 10');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid server port');
  if (!Number.isInteger(bots) || bots < 0 || bots >= maxPlayers) throw new Error('Bot count must be below the player limit');
  const publicRoot = path.join(root, 'public'), rooms = new Map(), pendingRooms = new Map();
  const codec = createCore();
  let nextId = 1, pendingJoins = 0, shuttingDown = false;
  const playerCount = () => [...rooms.values()].reduce((n, room) => n + room.sessions.size, 0);
  const status = () => ({ status: 'ok', players: playerCount(), maxPlayers, rooms: rooms.size });
  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end(); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (url.pathname === '/health') {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'no-store');
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(status())); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (pathname.endsWith('.manifest') || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(404).end(); return; }
    const file = path.resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
        'cache-control': pathname.endsWith('.babylon') || pathname.endsWith('.mp3') ? 'public, max-age=86400' : 'no-cache' });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    const supplied = Buffer.from(url.searchParams.get('key') || ''), expected = Buffer.from(accessKey);
    const authorized = !accessKey || (supplied.length === expected.length && timingSafeEqual(supplied, expected));
    if (url.pathname !== '/game' || !authorized || shuttingDown) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return;
    }
    if (wss.clients.size >= 32) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  const removeEmptyRooms = () => {
    if (pendingJoins) return;
    for (const [id, room] of rooms) if (!room.sessions.size) { room.stop(); rooms.delete(id); }
  };
  async function getRoom(request) {
    if (request.joinType === 22) {
      const room = rooms.get(request.gameId);
      if (!room || room.key !== request.gameKey) throw Object.assign(new Error('Game not found'), { closeCode: 4000 });
      return room;
    }
    if (request.joinType === 21) {
      const found = [...rooms.values()].find(room => !room.private && room.mode === request.mode && room.players.filter(Boolean).length < room.limit);
      if (found) return found;
    }
    const pendingKey = request.joinType === 23 ? Symbol('private') : request.mode;
    if (pendingRooms.has(pendingKey)) return pendingRooms.get(pendingKey);
    const job = (async () => {
      const core = createCore();
      const mapIndex = request.joinType === 23 ? request.mapIndex : randomInt(core.minMaps.length);
      const world = await loadWorld(core, mapIndex);
      if (shuttingDown) { world.engine.dispose(); throw new Error('Host is stopping'); }
      while (rooms.has(nextId)) nextId = nextId % 46655 + 1;
      const id = nextId; nextId = nextId % 46655 + 1;
      const room = new Room(core, world, { id, key: randomInt(1, 1296), mapIndex, mode: request.mode, bots, limit: maxPlayers });
      room.private = request.joinType === 23; rooms.set(room.id, room);
      logger.log(`Room ${room.id}: ${core.minMaps[mapIndex].name}, mode ${room.mode}`);
      return room;
    })();
    pendingRooms.set(pendingKey, job);
    try { return await job; } finally { pendingRooms.delete(pendingKey); }
  }
  wss.on('connection', socket => {
    let room, session, joining = false, count = 0, lastWindow = Date.now();
    const handshakeTimer = setTimeout(() => { if (!session) socket.close(1008, 'Join timed out'); }, 15000);
    handshakeTimer.unref();
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
          if (playerCount() + pendingJoins >= maxPlayers) { socket.close(4001, `Host is full (${maxPlayers} players)`); return; }
          pendingJoins++;
          try {
            const request = readJoin(codec, bytes);
            if (![21, 22, 23].includes(request.joinType)) throw new Error('Invalid join type');
            room = await getRoom(request);
            if (socket.readyState !== WebSocket.OPEN) return;
            session = room.makeSession(request); session.socket = socket; clearTimeout(handshakeTimer); room.join(session);
          } finally { pendingJoins--; removeEmptyRooms(); }
        } else room.receive(session, bytes);
      } catch (error) {
        logger.warn('Game connection:', error.message);
        socket.close(error.closeCode || 1008, error.message.slice(0, 100));
      }
    });
    socket.on('close', () => { clearTimeout(handshakeTimer); if (session) room.leave(session); removeEmptyRooms(); });
    socket.on('error', error => logger.warn('Socket:', error.message));
  });
  return {
    server, wss, status,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
      });
    },
    async close() {
      shuttingDown = true;
      for (const socket of wss.clients) socket.terminate();
      await Promise.allSettled([...pendingRooms.values()]);
      for (const room of rooms.values()) room.stop();
      rooms.clear();
      await new Promise(resolve => wss.close(resolve));
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}
