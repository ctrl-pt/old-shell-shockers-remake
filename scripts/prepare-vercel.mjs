// Publish only the compiled browser files; no private GitHub access is needed.
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '.vercel/output');
if (path.dirname(output) !== path.join(root, '.vercel')) throw new Error('Unexpected deployment output path');
await readFile(path.join(root, 'dist/index.html'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'dist'), path.join(output, 'static'), { recursive: true });
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, continue: true },
  { handle: 'filesystem' },
] }, null, 2));
console.log('Prepared a static-only Vercel deployment. Private source is excluded.');
