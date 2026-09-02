import * as THREE from 'three';

const TILE_SIZE = 0.88;
const TILE_PITCH = 1.0;
const CONTENT_HEIGHT = 1.35;
const FRAME_PADDING = 0.12;
const MAX_RESERVE_UNITS = 8;
const ROW_SPACING = TILE_PITCH * 0.92;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(8, 8.5, 8);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const inv = camera.matrixWorld.clone().invert();

const forward = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
const down = new THREE.Vector3().crossVectors(forward, right).normalize();
right.set(right.x, 0, right.z).normalize();
down.set(down.x, 0, down.z).normalize();

function sceneAspect(boardSize, rowStep) {
  const half = (boardSize * TILE_PITCH) / 2;
  const pts = [
    [-half, -half], [-half, half], [half, -half], [half, half],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const boardHalf = ((boardSize - 1) * TILE_PITCH) / 2;
  const bandBase = boardHalf + TILE_PITCH * 0.85 + TILE_SIZE * 0.45;
  const frontRow = Math.ceil(MAX_RESERVE_UNITS / 2);
  const lateral = ((frontRow - 1) / 2) * ROW_SPACING + TILE_SIZE * 0.6;
  const depth = bandBase + rowStep + TILE_SIZE * 0.6;

  for (const ds of [-1, 1]) {
    for (const ls of [-1, 1]) {
      pts.push(new THREE.Vector3(
        down.x * depth * ds + right.x * lateral * ls,
        0,
        down.z * depth * ds + right.z * lateral * ls
      ));
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const p of pts) {
    for (const y of [0, CONTENT_HEIGHT]) {
      v.set(p.x, y, p.z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
  }
  const halfW = (maxX - minX) / 2 + FRAME_PADDING;
  const halfH = (maxY - minY) / 2 + FRAME_PADDING;
  return { halfW, halfH, aspect: halfW / halfH };
}

for (const size of [3, 4, 5]) {
  const rows = [];
  for (const step of [1.12, 1.4, 1.6, 1.8, 2.0]) {
    const r = sceneAspect(size, TILE_PITCH * step);
    rows.push({ size, step, halfW: +r.halfW.toFixed(2), halfH: +r.halfH.toFixed(2), aspect: +r.aspect.toFixed(3) });
  }
  console.table(rows);
}
