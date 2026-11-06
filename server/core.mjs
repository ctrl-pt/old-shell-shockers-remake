import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../shared/world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = fs.readFileSync(path.join(root, 'archive/client/shellshock.min.js'), 'utf8');
const coreEnd = original.indexOf('var bigAdIdx');
const sharedSource = original.slice(0, coreEnd).replace(/this\.actor=new \w+Actor\([^()]*\)/g, 'this.actor=null');
const require = createRequire(import.meta.url);

/** Isolated copies of the archived engine, physics, weapons and map data per room. */
export function createCore() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error: console.error },
    performance, setTimeout, clearTimeout, setInterval, clearInterval,
    require(name) {
      if (name !== 'fs') return require(name);
      return { ...fs, readFileSync(p, enc) {
        return fs.readFileSync(path.isAbsolute(p) ? p : path.join(root, 'public/models', p), enc);
      } };
    },
  });
  const codec = original.slice(3124375, 3126298);
  if (!codec.startsWith('Comm=')) throw new Error('Archived codec boundary changed');
  const expose = `var ${codec};
    var players=[],playerLimit=20,map,gameScene,now=Date.now(),teamScore=[0,0,0],
      munitionsManager,mathSeed=0,spatula=null,engineCaps={},shadowGen=null;
    function sendToAll(buffer){hooks.broadcast(buffer)}
    function sendToOthers(buffer,id){hooks.broadcast(buffer,id)}
    function checkExplosionCollisions(projectile){hooks.explosion(projectile)}
    function sendSpatulaState(){hooks.spatula(spatula)}
    var hooks={broadcast:function(){},explosion:function(){},spatula:function(){}};
    return {BABYLON:BABYLON,Player:Player,Bullet:Bullet,Rocket:Rocket,Grenade:Grenade,
      Spatula:Spatula,Collider:Collider,Comm:Comm,CommCode:CommCode,CONTROL:CONTROL,
      catalog:catalog,classes:classes,minMaps:minMaps,Items:Items,GameType:GameType,
      MunitionsManager:MunitionsManager,make3DArray:make3DArray,loadMeshes:loadMeshes,
      weapons:{Eggk47:Eggk47,DozenGauge:DozenGauge,CSG1:CSG1,Cluck9mm:Cluck9mm,RPEGG:RPEGG,SMG:SMG,M24:M24},
      run:function(source){return eval(source)},
      configure:function(config){players=config.players;playerLimit=config.limit||20;
        map=config.map;mapMeshes=config.meshes;gameScene=config.scene;hooks=config.hooks;
        munitionsManager=new MunitionsManager(config.scene);return munitionsManager;},
      setNow:function(time){now=time},setSpatula:function(s){spatula=s}
    };}();`;
  vm.runInContext(sharedSource + expose, context, { filename: 'archived-core.js', timeout: 20000 });
  return context.extern;
}

export async function loadWorld(core, index) {
  const model = JSON.parse(fs.readFileSync(path.join(root, 'public/models/map.babylon'), 'utf8'));
  return buildWorld(core, index, model);
}
