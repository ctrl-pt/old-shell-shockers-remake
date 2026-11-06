import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../server/app.mjs';
import { ensureCloudflared } from './install-tunnel.mjs';
import { openSshRelay } from './ssh-relay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
let config = {};
try { config = JSON.parse(await readFile(path.join(root, 'host.config.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const website = value('--site') || process.env.PUBLIC_SITE_URL || config.publicSiteUrl;
const provider = value('--tunnel') || config.tunnel || 'localhost.run';
if (!['localhost.run', 'cloudflare'].includes(provider)) throw new Error('Unknown tunnel provider');
if (website && new URL(website).protocol !== 'https:') throw new Error('The public website URL must use https://');
const statePath = path.join(root, '.host/session.json');
const accessKey = randomBytes(24).toString('hex'), controlKey = randomBytes(24).toString('hex');
const app = createGameServer({ port: Number(value('--port') ?? 31415), maxPlayers: 10, bots: 0, accessKey });
const startupAbort = new AbortController();
let tunnel, control, log, playerTimer, stateWritten = false, stopped = false, finish;
const finished = new Promise(resolve => { finish = resolve; });
async function stop() {
  if (stopped) return;
  stopped = true; clearInterval(playerTimer); startupAbort.abort();
  tunnel?.kill(); log?.end();
  await app.close();
  if (control?.listening) await new Promise(resolve => control.close(resolve));
  if (stateWritten) await rm(statePath, { force: true });
  console.log('Hosting stopped. Friends can no longer connect.'); finish();
}
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  const binary = provider === 'cloudflare' ? await ensureCloudflared(root) : null;
  const address = await app.listen();
  await mkdir(path.dirname(statePath), { recursive: true });
  log = createWriteStream(path.join(root, '.host/tunnel.log'), { flags: 'w' });
  console.log('Opening a secure tunnel to this PC...');
  let tunnelOrigin;
  if (provider === 'localhost.run') {
    const relay = await openSshRelay({ root, port: address.port, log, signal: startupAbort.signal, onClose: () => { if (!stopped) void stop(); } });
    tunnel = { kill: () => relay.close() }; tunnelOrigin = relay.origin;
  } else {
  tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${address.port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  tunnelOrigin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tunnel startup timed out. Check .host/tunnel.log.')), 60000);
    let seen = '';
    function observe(chunk) {
      if (!log.writableEnded) log.write(chunk); seen = (seen + chunk.toString()).slice(-16000);
      const match = seen.match(/https:\/\/(?=[a-z0-9-]*-)[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    }
    tunnel.stdout.on('data', observe); tunnel.stderr.on('data', observe);
    tunnel.once('error', error => { clearTimeout(timeout); reject(error); });
    tunnel.once('exit', code => { clearTimeout(timeout); reject(new Error('Tunnel exited: ' + code)); if (stateWritten && !stopped) void stop(); });
  });
  }
  let reachable = false;
  for (let attempt = 0; attempt < 30 && !stopped; attempt++) {
    try {
      const response = await fetch(tunnelOrigin + '/health', { signal: AbortSignal.timeout(3000) });
      if (response.ok && (await response.json()).maxPlayers === 10) { reachable = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!reachable || stopped) throw new Error('The public tunnel did not become reachable. Check .host/tunnel.log.');
  const backend = new URL('/game', tunnelOrigin); backend.protocol = 'wss:'; backend.searchParams.set('key', accessKey);
  const guestLink = new URL(website || tunnelOrigin); guestLink.search = ''; guestLink.hash = '';
  guestLink.searchParams.set('server', backend.href); guestLink.searchParams.set('mode', '0');
  // Separate loopback-only management port; the public tunnel cannot forward it.
  control = http.createServer((req, res) => {
    const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + controlKey);
    if (req.method !== 'POST' || req.url !== '/stop' || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(403).end(); return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"stopping":true}');
    setImmediate(() => void stop());
  });
  await new Promise((resolve, reject) => { control.once('error', reject); control.listen(0, '127.0.0.1', resolve); });
  await writeFile(statePath, JSON.stringify({ pid: process.pid, port: address.port, provider, tunnelOrigin, guestLink: guestLink.href,
    controlPort: control.address().port, controlKey, startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  stateWritten = true;
  console.log('\nHOST ONLINE — up to 10 players, no accounts required.');
  console.log('Share this session link:\n' + guestLink.href);
  console.log('\nChoose the same game mode to join a public room. For a chosen map, use Create, then the in-game Invite friends button.');
  console.log('Keep this window open. Press Ctrl+C or run Stop Hosting.bat to stop.');
  let lastPlayers = -1;
  playerTimer = setInterval(() => { const players = app.status().players; if (players !== lastPlayers) { console.log(`Players: ${players}/10`); lastPlayers = players; } }, 2000);
  if (!args.includes('--no-open')) {
    const child = process.platform === 'win32'
      ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', guestLink.href], { windowsHide: true, stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [guestLink.href], { stdio: 'ignore' });
    child.on('error', () => console.log('Open the session link above in your browser.')); child.unref();
  }
  await finished;
} catch (error) {
  if (!stopped) { console.error('Unable to host:', error.message); process.exitCode = 1; }
  await stop();
}
