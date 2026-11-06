import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'archive/client/shellshock.min.js'), 'utf8');
const expected = '4721a0eb11762ff8d7bd949cfd6f18c79ae596499f65f07c1ba4ea286dadad11';
if (createHash('sha256').update(source).digest('hex') !== expected) throw new Error('Archived client digest mismatch');

// A narrow bridge into the archived closure; gameplay and rendering stay original.
const insertion = source.indexOf('return SoundPool.v1=');
if (insertion < 0) throw new Error('Archived export boundary changed');
const bridge = `globalThis.shell2019={run:function(source){return eval(source)},getState:function(){return {me:me,players:players,map:map,minMaps:minMaps,gameScene:gameScene,inGame:inGame,customizer:customizer,playerAccount:playerAccount}},weapons:{Eggk47:Eggk47,DozenGauge:DozenGauge,CSG1:CSG1,Cluck9mm:Cluck9mm,RPEGG:RPEGG,SMG:SMG,M24:M24}};`;
await mkdir(path.join(root, 'public/src'), { recursive: true });
const compatible = (source.slice(0, insertion) + bridge + source.slice(insertion))
  .replaceAll('new BABYLON.Engine(this.canvas,!0,null,!1)', 'new BABYLON.Engine(this.canvas,!0,{disableWebGL2Support:true},!1)')
  .replaceAll('new BABYLON.Engine(canvas,!0,null,!1)', 'new BABYLON.Engine(canvas,!0,{disableWebGL2Support:true},!1)')
  .replace('a.src="https://www.google-analytics.com/analytics.js",m.parentNode.insertBefore(a,m),', '');
await writeFile(path.join(root, 'public/src/shellshock.js'), compatible);

// Retain the HTML body and language table from the closest recovered May page.
const html = await readFile(path.join(root, 'archive/index-2019-05-19.html'), 'utf8');
const languageScript = html.match(/<script[^>]*>([\s\S]*?var csv[\s\S]*?)<\/script>/i);
if (!languageScript) throw new Error('Original language table missing');
let body = html.slice(html.indexOf('<body>'));
body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
body = body.replace(/<div id="changelog"[\s\S]*?<\/div>/, `<div id="changelog" class="hideme"><ul><li>NEW WEAPONS: M2DZ bolt-action rifle and SMEGG submachine gun.<li>Weapon balancing, faster bullets, Castle jump fix, and shell edge damage.</ul><p>Recovered May 2019 client. <a href="/preservation.html" target="_blank">Preservation notes</a></p></div>`);
body = body.replace(/v\s*<\/a>/, 'v 0.20.1-era</a>');
const closingBody = body.lastIndexOf('</body>');
body = body.slice(0, closingBody) + '<script src="src/restore.js"></script>' + body.slice(closingBody);
const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shell Shockers — May 2019</title><meta name="description" content="Playable preservation of the classic May 2019 Shell Shockers client."><link rel="icon" href="img/favicon.png"><link rel="stylesheet" href="includes/fonts.css"><link rel="stylesheet" href="includes/stylesheet.css"><link rel="stylesheet" href="includes/game.css"><link rel="stylesheet" href="includes/restore.css"><script>${languageScript[1]}</script><script src="src/bootstrap.js"></script><script src="src/servers.js"></script><script src="src/gameplayTips.js"></script><script src="src/shellshock.js"></script></head>`;
await writeFile(path.join(root, 'public/index.html'), head + body);
console.log('Prepared the original client and May UI.');
