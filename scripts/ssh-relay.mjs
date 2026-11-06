import ssh2 from 'ssh2';
import net from 'node:net';
import path from 'node:path';
import { readFile, appendFile } from 'node:fs/promises';

export function openSshRelay({ root, port, log, onClose, signal }) {
  const client = new ssh2.Client(), sockets = new Set();
  let seen = '', ready = false, intentional = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.destroy(); reject(new Error('HTTPS relay startup timed out')); }, 45000);
    signal?.addEventListener('abort', () => { intentional = true; clearTimeout(timer); client.destroy(); reject(new Error('Hosting cancelled')); }, { once: true });
    function observe(chunk) {
      if (!log.writableEnded) log.write(chunk);
      seen = (seen + chunk.toString()).slice(-16000);
      const match = seen.match(/https:\/\/[a-z0-9-]+\.lhr\.life\b/i);
      if (match && !ready) {
        ready = true; clearTimeout(timer);
        resolve({ origin: match[0], close() { intentional = true; for (const socket of sockets) socket.destroy(); client.end(); } });
      }
    }
    client.on('tcp connection', (info, accept, refuse) => {
      if (info.destPort !== 80) { refuse(); return; }
      const channel = accept(), socket = net.connect(port, '127.0.0.1');
      sockets.add(socket);
      socket.on('error', () => channel.destroy()); channel.on('error', () => socket.destroy());
      socket.on('close', () => { sockets.delete(socket); channel.destroy(); });
      channel.on('close', () => socket.destroy());
      channel.pipe(socket); socket.pipe(channel);
    });
    client.on('ready', () => {
      // localhost.run streams its banner without acknowledging the shell request.
      // ssh2 1.17.0 otherwise withholds the readable channel forever. Send this
      // non-interactive shell request with wantReply=false and finish its local
      // callback. Authentication and pinned host-key verification are unchanged.
      const sendShell = client._protocol.shell;
      client._protocol.shell = function (remoteId) {
        const channel = Object.values(client._chanMgr._channels).find(channel => channel?.outgoing?.id === remoteId);
        if (!channel?._callbacks?.length) throw new Error('Unsupported SSH client shell interface');
        sendShell.call(this, remoteId, false);
        const callback = channel._callbacks.shift(); queueMicrotask(() => callback(false));
      };
      client.forwardIn('localhost', 80, error => {
        if (error) { reject(error); client.end(); return; }
      });
      client.shell(false, (error, stream) => {
        if (error) { reject(error); client.end(); return; }
        stream.on('data', observe); stream.stderr.on('data', observe);
      });
    });
    client.on('error', error => { clearTimeout(timer); if (!ready) reject(error); });
    client.on('close', () => {
      clearTimeout(timer); for (const socket of sockets) socket.destroy();
      if (!ready) reject(new Error('HTTPS relay closed during startup'));
      else if (!intentional) onClose();
    });
    client.connect({ host: 'localhost.run', port: 22, username: 'nokey', authHandler: ['none'],
      debug: process.env.HOST_TUNNEL_DEBUG ? message => { if (!log.writableEnded) log.write(message + '\n'); } : undefined,
      algorithms: { serverHostKey: ['ssh-ed25519'] }, keepaliveInterval: 30000, keepaliveCountMax: 3,
      readyTimeout: 20000,
      hostVerifier(key, callback) {
        const file = path.join(root, '.host/known_hosts'), encoded = key.toString('base64');
        (async () => {
          let saved = '';
          try { saved = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          const entry = saved.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(parts => parts[0].split(',').includes('localhost.run'));
          if (entry) return entry[1] === 'ssh-ed25519' && entry[2] === encoded;
          await appendFile(file, `localhost.run ssh-ed25519 ${encoded}\n`, { mode: 0o600 });
          return true;
        })().then(callback, () => callback(false));
      },
    });
  });
}
