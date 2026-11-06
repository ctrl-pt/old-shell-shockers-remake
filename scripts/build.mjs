import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'archive/client/shellshock.min.js'), 'utf8');
const historicalMaps = await readFile(path.join(root, 'public/maps/historical.json'), 'utf8');
const first = source.indexOf('var Items='), end = source.indexOf('var bigAdIdx');
const shared = source.slice(first, end).replace(/this\.actor=new \w+Actor\([^()]*\)/g, 'this.actor=null');
const codec = source.slice(3124375, 3126298);
const exports = `var ${codec};
var players=[],playerLimit=20,map,gameScene,now=Date.now(),teamScore=[0,0,0],munitionsManager,mathSeed=0,spatula=null,engineCaps={},shadowGen=null,colliderMesh;
var hooks={broadcast:function(){},explosion:function(){},spatula:function(){}};
function sendToAll(buffer){hooks.broadcast(buffer)}function sendToOthers(buffer,id){hooks.broadcast(buffer,id)}
function checkExplosionCollisions(projectile){hooks.explosion(projectile)}function sendSpatulaState(){hooks.spatula(spatula)}
return {BABYLON:BABYLON,Player:Player,Bullet:Bullet,Rocket:Rocket,Grenade:Grenade,Spatula:Spatula,Collider:Collider,Comm:Comm,CommCode:CommCode,CONTROL:CONTROL,catalog:catalog,classes:classes,minMaps:minMaps,Items:Items,GameType:GameType,MunitionsManager:MunitionsManager,make3DArray:make3DArray,
configure:function(config){players=config.players;playerLimit=config.limit||20;map=config.map;mapMeshes=config.meshes;gameScene=config.scene;hooks=config.hooks;munitionsManager=new MunitionsManager(config.scene);return munitionsManager},
setNow:function(time){now=time},setSpatula:function(s){spatula=s}};
`;
await writeFile(path.join(root, 'public/src/headless.js'), `/* Extracted unchanged physics and weapon tuning; recovered historical maps appended. */\nglobalThis.createShellCore=function(){var BABYLON=globalThis.BABYLON,Math=Object.create(globalThis.Math);${shared}minMaps.push.apply(minMaps,${historicalMaps});${exports}};`);
await cp(path.join(root, 'shared/room.mjs'), path.join(root, 'public/src/room.mjs'));
await cp(path.join(root, 'shared/world.mjs'), path.join(root, 'public/src/world.mjs'));
await mkdir(path.join(root, 'dist'), { recursive: true });
await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true });
console.log('Built the original client, shared physics, and browser practice server.');
