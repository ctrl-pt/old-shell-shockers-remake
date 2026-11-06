import { createGameServer } from './app.mjs';

const app = createGameServer({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1',
  maxPlayers: 10, bots: Number(process.env.BOTS || 0), accessKey: process.env.GAME_ACCESS_KEY || '' });
const address = await app.listen();
console.log(`Shell Shockers · http://${address.address}:${address.port} · up to 10 players`);
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await app.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
