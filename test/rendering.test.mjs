import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCore } from '../server/core.mjs';

// Execute the shipped actor/camera routines with real archived Babylon matrices.
// Only asset loading, weapon animation and UI are stubbed out.
function setup() {
  const B = createCore().BABYLON;
  const engine = new B.NullEngine(), scene = new B.Scene(engine);
  const camera = new B.TargetCamera('view', B.Vector3.Zero(), scene);
  scene.activeCamera = camera;
  const material = new B.ShaderMaterial('eggShell', scene, {}, {});
  scene.cloneMesh = (name, parent) => {
    const mesh = new B.Mesh(name, scene); mesh.parent = parent;
    mesh.setRenderingGroupId = id => { mesh.renderingGroupId = id; };
    return mesh;
  };
  scene.cloneSkeleton = () => ({ bones: [{}, {}], getBoneIndexByName: name => name === 'gripHand' ? 0 : 1 });
  scene.getMaterialByName = () => material;
  // Reproduce hosted practice: its non-rendering engine becomes Babylon's default.
  const practiceEngine = new B.NullEngine(), practiceScene = new B.Scene(practiceEngine);
  const math = Object.assign(Object.create(Math), {
    radDifference: (a, b) => a - b, length3: (x, y, z) => Math.hypot(x, y, z),
  });
  const context = vm.createContext({ BABYLON: B, Math: math, camera, meId: 0, inGame: true,
    myTeam: 0, stampTexture: null, shake: 0, shadowGen: null, playOffline: false,
    teamColors: { outline: [B.Color3.White()] }, isMeshVisible: () => true,
  });
  const shipped = fs.readFileSync('public/src/shellshock.js', 'utf8');
  const fragment = (start, end) => {
    const first = shipped.indexOf(start), last = shipped.indexOf(end, first);
    assert.ok(first >= 0 && last > first, start);
    return shipped.slice(first, last);
  };
  vm.runInContext(fragment('function PlayerActor(player)', 'function RocketActor('), context);
  vm.runInContext(fragment('PlayerActor.prototype.update=function', ',PlayerActor.prototype.showNameSprite='), context);
  vm.runInContext(fragment('function doFirstPersonCamera(player)', 'function startRendering()'), context);
  vm.runInContext(fragment('BABYLON.TransformNode.prototype.setVisible=function', ',BABYLON.AbstractMesh.prototype.setMaterial='), context);
  for (const method of ['setupStowAnims', 'setShellColor', 'updateTeam', 'wearHat', 'applyStamp', 'hideNameSprite']) {
    context.PlayerActor.prototype[method] = function () {};
  }
  context.PlayerActor.prototype.setupNameSprite = function () {};
  context.PlayerActor.prototype.showNameSprite = function () {
    this.nameSprite ||= { width: .6, height: .3, position: B.Vector3.Zero() };
  };
  function player(id) {
    const p = { id, scene, x: 2, y: 1, z: 3, yaw: 0, pitch: 0, bobble: 0, shield: 0,
      team: 0, dx: 0, dy: 0, dz: 0, jumping: false, weapon: { actor: null } };
    p.actor = new context.PlayerActor(p); return p;
  }
  const me = player(0); context.me = me;
  const bot = player(1);
  vm.runInContext('doFirstPersonCamera()', context);
  function render() {
    for (const p of [me, bot]) p.actor.update(.5);
    scene.render();
  }
  return { B, scene, camera, practiceScene, me, bot, render,
    dispose() { engine.dispose(); practiceEngine.dispose(); } };
}

test('visual player hierarchy belongs to the rendered scene after practice creates a second engine', () => {
  const s = setup();
  try {
    for (const p of [s.me, s.bot]) for (const name of ['mesh', 'head', 'gunContainer', 'eye', 'bodyMesh', 'hands']) {
      assert.ok(p.actor[name].getScene() === s.scene, name + ' must use the visible scene');
    }
  } finally { s.dispose(); }
});

test('rendered egg, nametag and first person camera follow walking, jumping, falling and respawn', () => {
  const s = setup();
  const close = (a, b, label) => assert.ok(Math.abs(a - b) < .001, `${label}: ${a} vs ${b}`);
  try {
    s.render();
    const initial = s.camera.globalPosition.clone();
    for (const [x, y, z] of [[5, 1, 8], [5, 2.4, 8], [5, 1, 8], [12, 4, 7]]) {
      for (const p of [s.me, s.bot]) Object.assign(p, { x, y, z });
      for (let frame = 0; frame < 20; frame++) s.render();
      for (const p of [s.me, s.bot]) {
        const body = p.actor.bodyMesh.getWorldMatrix().getTranslation();
        close(body.x, x, 'egg world x'); close(body.y, y + .32, 'egg world y'); close(body.z, z, 'egg world z');
      }
      const eye = s.me.actor.eye.getWorldMatrix().getTranslation();
      close(s.camera.globalPosition.x, x, 'camera x');
      close(s.camera.globalPosition.y, y + .4, 'camera y');
      close(s.camera.globalPosition.z, z, 'camera z');
      close(s.camera.globalPosition.y, eye.y, 'camera follows eye');
      // The original name sprite floats above, and 0.4 units toward the camera.
      const label = s.bot.actor.nameSprite.position;
      assert.ok(Math.abs(label.x - x) <= .401 && Math.abs(label.z - z) <= .401);
      const anchor = new s.B.Vector3(x, y + .5 * s.bot.actor.nameSprite.height + .65, z);
      close(label.subtract(anchor).length(), .4, 'nametag offset from the egg');
    }
    assert.ok(s.camera.globalPosition.subtract(initial).length() > 5);
    const view = s.camera.getViewMatrix().clone();
    Object.assign(s.me, { yaw: .8, pitch: .4 });
    s.render();
    assert.ok(s.camera.getViewMatrix().m.some((v, i) => Math.abs(v - view.m[i]) > .01), 'mouse look changes the rendered view matrix');
    const forward = s.B.Vector3.TransformNormal(new s.B.Vector3(0, 0, 1), s.camera.getWorldMatrix()).normalize();
    close(forward.x, Math.sin(s.me.yaw) * Math.cos(s.me.pitch), 'camera yaw');
    close(forward.y, -Math.sin(s.me.pitch), 'camera pitch');
    close(forward.z, Math.cos(s.me.yaw) * Math.cos(s.me.pitch), 'camera forward direction');
  } finally { s.dispose(); }
});
