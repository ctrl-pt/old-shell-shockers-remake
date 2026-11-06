import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const release = '2026.10.7';
const checksum = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343';
export async function ensureCloudflared(root) {
  if (process.env.CLOUDFLARED_PATH) return path.resolve(process.env.CLOUDFLARED_PATH);
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Set CLOUDFLARED_PATH to your installed cloudflared executable on this platform.');
  const binary = path.join(root, '.host/bin/cloudflared.exe');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  try { if (hash(await readFile(binary)) === checksum) return binary; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log(`Downloading official Cloudflare Tunnel ${release} (first launch only)...`);
  const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${release}/cloudflared-windows-amd64.exe`, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error('Tunnel download failed: HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== checksum) throw new Error('Cloudflare Tunnel checksum verification failed');
  await mkdir(path.dirname(binary), { recursive: true }); await writeFile(binary, bytes);
  console.log('Cloudflare Tunnel download verified.');
  return binary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await ensureCloudflared(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
