import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// IDs corroborated against unchanged Blue/Two Towers cells and the archived
// LegacyShell old-map-converter.js. Quarter-turn rotations have the same sign.
const tiles = {
  1: { 0: 'generic.grass.full', 1: 'generic.pavement.full', 2: 'generic.concrete.full' },
  2: { 3: 'generic.brown-block.full' },
  4: { 0: 'generic.barricade.aabb' },
  5: { 0: 'generic.stairs.wedge', 2: 'generic.metal-ramp.wedge' },
  6: { 0: 'generic.metal-ladder.ladder' },
};

export async function loadHistoricalMaps(root) {
  const research = path.join(root, 'research/maps-before-may2019');
  const manifest = JSON.parse(await readFile(path.join(research, 'recovered-maps.json'), 'utf8'));
  return Promise.all(manifest.map(async (record, index) => {
    const bytes = await readFile(path.join(research, record.native_map_file));
    if (createHash('sha256').update(bytes).digest('hex') !== record.export_sha256) {
      throw new Error('Recovered map digest mismatch: ' + record.id);
    }
    const original = JSON.parse(bytes), data = {}, occupied = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    for (const [category, decorations] of Object.entries(original.data)) {
      for (const [decoration, cells] of Object.entries(decorations)) {
        const name = tiles[category]?.[decoration];
        if (!name) throw new Error(`Unknown recovered tile: ${record.id} ${category}/${decoration}`);
        for (const cell of cells) {
          const converted = { x: cell.x, y: cell.y, z: cell.z };
          if (cell.dir) converted.ry = cell.dir;
          (data[name] ||= []).push(converted);
          occupied.set(key(cell.x, cell.y, cell.z), { category: Number(category), ...converted });
        }
      }
    }

    // These pre-marker maps had server-chosen spawns. Reconstruct distributed
    // points above solid surfaces, with two empty cells and an inset map edge.
    const candidates = [];
    for (let x = 1; x < original.width - 1; x++) for (let z = 1; z < original.depth - 1; z++) {
      for (let y = original.height - 1; y >= 0; y--) {
        const support = occupied.get(key(x, y, z));
        if (support && [1, 2].includes(support.category) &&
            !occupied.has(key(x, y + 1, z)) && !occupied.has(key(x, y + 2, z))) {
          candidates.push({ x, y: y + 1, z }); break;
        }
      }
    }
    const centerDistance = p => (p.x + .5 - original.width / 2) ** 2 + (p.z + .5 - original.depth / 2) ** 2;
    candidates.sort((a, b) => centerDistance(a) - centerDistance(b) || a.y - b.y || a.x - b.x || a.z - b.z);
    const spawns = [candidates.shift()];
    if (!spawns[0]) throw new Error('Recovered map has no safe spawn: ' + record.id);
    while (candidates.length && spawns.length < 48) {
      let best = -1, bestDistance = 0;
      for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i];
        const distance = Math.min(...spawns.map(s => (s.x - p.x) ** 2 + (s.z - p.z) ** 2));
        if (distance > bestDistance) { best = i; bestDistance = distance; }
      }
      if (bestDistance < 6.25) break;
      spawns.push(candidates.splice(best, 1)[0]);
    }
    const axis = original.width >= original.depth ? 'x' : 'z';
    const midpoint = original[axis === 'x' ? 'width' : 'depth'] / 2;
    data['SPECIAL.spawn-blue.none'] = spawns.filter(p => p[axis] + .5 < midpoint);
    data['SPECIAL.spawn-red.none'] = spawns.filter(p => p[axis] + .5 >= midpoint);
    data['SPECIAL.spatula.none'] = [{ ...spawns[0] }];

    return {
      fileVersion: 1, name: index < 3 ? `Alpha${index + 1}` : 'Early Bedrock',
      width: original.width, height: original.height, depth: original.depth,
      surfaceArea: original.surfaceArea || candidates.length + spawns.length,
      sun: { direction: { x: .355987548828125, y: .8115030527114868, z: -.46339571475982666 } },
      skybox: 'default', modes: { FFA: true, Teams: true, Spatula: true },
      availability: 'both', numPlayers: '18', data,
      preservation: { id: record.id, era: index < 3 ? 'December 2017' : 'Early 2018',
        nativeSha256: record.export_sha256, sourceUrl: record.source.resolved_url,
        spawns: 'Reconstructed from recovered geometry', spatula: 'Reconstructed central spawn' },
    };
  }));
}
