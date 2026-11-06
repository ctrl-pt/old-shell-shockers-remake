import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const state = JSON.parse(await readFile(path.join(root, '.host/session.json'), 'utf8'));
  if (!Number.isInteger(state.controlPort) || state.controlPort < 1 || state.controlPort > 65535 || !/^[a-f0-9]{48}$/.test(state.controlKey)) throw new Error('Invalid host state');
  const response = await fetch(`http://127.0.0.1:${state.controlPort}/stop`, {
    method: 'POST', headers: { authorization: 'Bearer ' + state.controlKey }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('The running host rejected the stop request');
  console.log('Stopping hosting...');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'No active hosting session.' : error.message); process.exitCode = 1;
}
