import * as THREE from 'three';

export const TILE_SIZE = 0.88;
export const TILE_GAP = 0.12;
export const TILE_PITCH = TILE_SIZE + TILE_GAP;

const BASE_COLOR = 0x1e293b;
const BASE_EMISSIVE = 0x0f172a;

export function tileWorldPosition(row, col, boardSize) {
  const offset = ((boardSize - 1) * TILE_PITCH) / 2;
  return {
    x: col * TILE_PITCH - offset,
    y: 0,
    z: row * TILE_PITCH - offset,
  };
}

function createTileMesh(row, col) {
  const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.14, TILE_SIZE);
  const material = new THREE.MeshStandardMaterial({
    color: BASE_COLOR,
    emissive: BASE_EMISSIVE,
    emissiveIntensity: 0.35,
    roughness: 0.65,
    metalness: 0.15,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData = { kind: 'tile', row, col };

  const edgeGeo = new THREE.EdgesGeometry(geometry);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.6 });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  mesh.add(edges);

  return mesh;
}

export class TileGrid {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'tileGrid';
    scene.add(this.group);
    this.tiles = new Map();
    this.boardSize = 0;
  }

  ensureSize(boardSize) {
    if (this.boardSize === boardSize) return;
    this.clear();
    this.boardSize = boardSize;

    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const key = `${r},${c}`;
        const mesh = createTileMesh(r, c);
        const pos = tileWorldPosition(r, c, boardSize);
        mesh.position.set(pos.x, pos.y, pos.z);
        this.group.add(mesh);
        this.tiles.set(key, mesh);
      }
    }
  }

  getTile(row, col) {
    return this.tiles.get(`${row},${col}`) ?? null;
  }

  getTileAtWorld(x, z) {
    for (const mesh of this.tiles.values()) {
      const { row, col } = mesh.userData;
      const pos = tileWorldPosition(row, col, this.boardSize);
      const half = TILE_SIZE / 2;
      if (
        x >= pos.x - half &&
        x <= pos.x + half &&
        z >= pos.z - half &&
        z <= pos.z + half
      ) {
        return mesh;
      }
    }
    return null;
  }

  clear() {
    for (const mesh of this.tiles.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.children.forEach((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
    }
    this.tiles.clear();
    this.boardSize = 0;
  }
}
