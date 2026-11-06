// Parse archived scripts as inert syntax. No archived JavaScript is evaluated.
import { parse } from '../../tools/rea/node_modules/@babel/parser/lib/index.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
function literal(node) {
  if (['NumericLiteral', 'StringLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'UnaryExpression' && node.operator === '-') return -literal(node.argument);
  if (node.type === 'ObjectExpression') {
    return Object.fromEntries(node.properties.map(p => {
      if (p.type !== 'ObjectProperty' || p.computed) throw Error('Nonliteral map property');
      return [p.key.name ?? p.key.value, literal(p.value)];
    }));
  }
  throw Error(`Unsupported inert value ${node.type}`);
}
function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) visit(child, fn); return; }
  if (typeof node.type === 'string') fn(node);
  for (const [key, child] of Object.entries(node)) if (!['loc', 'extra', 'comments', 'tokens'].includes(key)) visit(child, fn);
}
const inventory = [];
for (const filename of fs.readdirSync(path.join(dir, 'clients')).filter(p => p.endsWith('.js'))) {
  const sourcePath = path.join(dir, 'clients', filename);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const ast = parse(source, { sourceType: 'script' });
  const candidates = [];
  visit(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.name === 'minMaps') candidates.push(node.init);
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && node.left.name === 'minMaps') candidates.push(node.right);
  });
  for (const node of candidates) {
    const maps = literal(node);
    const dest = path.join(dir, 'extracted', filename.replace(/\.js$/, '.maps.json'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(maps, null, 2) + '\n');
    const mapsInfo = maps.map((map, index) => ({ index, name: map.name, width: map.width, height: map.height, depth: map.depth,
      sha256: crypto.createHash('sha256').update(JSON.stringify(map)).digest('hex'),
      categories: Object.fromEntries(Object.entries(map.data).map(([cat, decs]) => [cat, Array.isArray(decs) ? decs.length : Object.fromEntries(Object.entries(decs).map(([dec, cells]) => [dec, cells.length]))])) }));
    const meta = JSON.parse(fs.readFileSync(sourcePath + '.meta.json', 'utf8'));
    const item = { file: filename, resolved_url: meta.resolved_url, source_sha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
      literal_range: { start: node.start, end: node.end }, count: maps.length, maps: mapsInfo };
    inventory.push(item);
    console.log(JSON.stringify(item));
  }
}
fs.writeFileSync(path.join(dir, 'map-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
