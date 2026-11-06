/** Original map geometry and cell colliders, usable in Node and a browser practice room. */
export async function buildWorld(core, index, rawModel) {
  const B = core.BABYLON, engine = new B.NullEngine(), scene = new B.Scene(engine);
  core.Collider.init(scene);
  const model = { ...rawModel, materials: [], multiMaterials: [], textures: [] };
  await new Promise((resolve, reject) => B.SceneLoader.ImportMesh('', '', 'data:' + JSON.stringify(model), scene, resolve, null,
    (_, message, error) => reject(error || new Error(message))));
  const meshes = [null];
  for (const mesh of scene.meshes.slice()) {
    if (mesh.parent || !mesh.name.includes('.')) continue;
    mesh.setEnabled(false); meshes.push(mesh);
    const [theme, name, colliderType, softness] = mesh.name.split('.');
    Object.assign(mesh, { theme, colliderType, softness, originalName: mesh.name });
    mesh.colliderMesh = mesh.getChildMeshes()[0] || mesh;
    for (const child of mesh.getChildMeshes()) { child.setEnabled(false); child.freezeWorldMatrix(); }
  }
  const barrier = B.MeshBuilder.CreateBox('SPECIAL.barrier.full.verysoft', { size: 1 }, scene);
  barrier.setEnabled(false);
  Object.assign(barrier, { theme: 'SPECIAL', colliderType: 'full', softness: 'verysoft', originalName: barrier.name });
  meshes.push(barrier);
  const source = core.minMaps[index];
  if (!source) throw new Error('Unknown map index');
  const map = { width: source.width, height: source.height + 1, depth: source.depth, surfaceArea: source.surfaceArea };
  map.data = core.make3DArray(map.width, map.height, map.depth);
  const spawnPoints = [[], [], []], spatulaPoints = [];
  const byName = new Map(meshes.slice(1).map((mesh, i) => [mesh.originalName, { mesh, idx: i + 1 }]));
  for (const [name, cells] of Object.entries(source.data)) {
    if (name.startsWith('SPECIAL.spawn')) {
      for (const cell of Object.values(cells)) {
        const p = { x: cell.x + .5, y: cell.y, z: cell.z + .5 };
        spawnPoints[0].push(p); spawnPoints[name.includes('blue') ? 1 : 2].push(p);
      }
      continue;
    }
    if (name.startsWith('SPECIAL.spatula')) {
      for (const cell of Object.values(cells)) spatulaPoints.push({ x: cell.x + .5, y: cell.y + .1, z: cell.z + .5 });
      continue;
    }
    const found = byName.get(name);
    if (!found) throw new Error('Missing original map mesh: ' + name);
    const { mesh, idx } = found;
    let colliderMesh, colliderPrecise = false, colliderChildren = false;
    switch (mesh.colliderType) {
      case 'full': colliderMesh = core.Collider.fullCollisionMesh; break;
      case 'wedge': colliderMesh = core.Collider.wedgeCollisionMesh; colliderPrecise = true; break;
      case 'iwedge': colliderMesh = core.Collider.iwedgeCollisionMesh; colliderPrecise = true; break;
      case 'ladder': colliderMesh = mesh.colliderMesh; break;
      case 'aabb': colliderMesh = mesh.colliderMesh; colliderChildren = true; break;
      case 'obb': colliderMesh = mesh.colliderMesh; colliderPrecise = colliderChildren = true; break;
      default: colliderMesh = mesh.colliderMesh;
    }
    for (const cell of Object.values(cells)) {
      const rx = (cell.rx || 0) * Math.PI / 2, ry = (cell.ry || 0) * Math.PI / 2, rz = (cell.rz || 0) * Math.PI / 2;
      map.data[cell.x][cell.y][cell.z] = { idx, mesh, colliderMesh, colliderPrecise, colliderChildren,
        colliderMatrix: B.Matrix.RotationYawPitchRoll(-ry, -rx, -rz), rx, ry, rz };
    }
  }
  if (!spawnPoints[0].length) throw new Error('Map has no preserved spawn points');
  return { engine, scene, map, meshes, spawnPoints, spatulaPoints };
}
