import * as THREE from 'three';
import { TILE_SIZE } from './TileGrid.js';

const HIGHLIGHT = {
  move: { color: 0x22c55e, opacity: 0.42, emissive: 0x166534 },
  recycle: { color: 0xfacc15, opacity: 0.5, emissive: 0xca8a04 },
  attack: { color: 0xef4444, opacity: 0.48, emissive: 0x991b1b },
  deploy: { color: 0x3b82f6, opacity: 0.42, emissive: 0x1d4ed8 },
  win: { color: 0xfbbf24, opacity: 0.55, emissive: 0xb45309 },
  item: { color: 0xa855f7, opacity: 0.45, emissive: 0x6b21a8 },
};

const HIGHLIGHT_TYPES = Object.keys(HIGHLIGHT);
const MAX_HIGHLIGHTS = 49;
const HIGHLIGHT_Y = 0.09;
const TMP_MATRIX = new THREE.Matrix4();
const HIGHLIGHT_ROTATION = new THREE.Euler(-Math.PI / 2, 0, 0);

function cellKey(r, c) {
  return `${r},${c}`;
}

export class HighlightSystem {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new THREE.Group();
    this.group.name = 'highlights';
    tileGrid.group.parent.add(this.group);

    this.planeGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.92, TILE_SIZE * 0.92);
    this.instancedByType = new Map();

    for (const type of HIGHLIGHT_TYPES) {
      const spec = HIGHLIGHT[type];
      const material = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.emissive,
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(this.planeGeometry, material, MAX_HIGHLIGHTS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.instancedByType.set(type, mesh);
      this.group.add(mesh);
    }
  }

  update(state) {
    const boardSize = state.boardSize;
    const desired = new Map();

    const moves = new Set(state.validMoves.map(([r, c]) => cellKey(r, c)));
    const recycle = new Set((state.validRecycleMoves || []).map(([r, c]) => cellKey(r, c)));
    const targets = new Set(state.validTargets.map(([r, c]) => cellKey(r, c)));
    const deploy = new Set(state.validDeploy.map(([r, c]) => cellKey(r, c)));
    const items = new Set((state.validItemTargets || []).map(([r, c]) => cellKey(r, c)));
    const win = new Set((state.lastWinLine || []).map(([r, c]) => cellKey(r, c)));

    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const key = cellKey(r, c);
        let type = null;
        if (win.has(key)) type = 'win';
        else if (items.has(key)) type = 'item';
        else if (deploy.has(key)) type = 'deploy';
        else if (targets.has(key)) type = 'attack';
        else if (recycle.has(key)) type = 'recycle';
        else if (moves.has(key)) type = 'move';
        if (type) desired.set(key, type);
      }
    }

    const keysByType = new Map();
    for (const type of HIGHLIGHT_TYPES) keysByType.set(type, []);

    for (const [key, type] of desired) {
      keysByType.get(type).push(key);
    }

    for (const type of HIGHLIGHT_TYPES) {
      const mesh = this.instancedByType.get(type);
      const keys = keysByType.get(type);
      mesh.count = keys.length;

      for (let i = 0; i < keys.length; i++) {
        const [row, col] = keys[i].split(',').map(Number);
        const tile = this.tileGrid.getTile(row, col);
        if (!tile) continue;

        TMP_MATRIX.makeRotationFromEuler(HIGHLIGHT_ROTATION);
        TMP_MATRIX.setPosition(tile.position.x, HIGHLIGHT_Y, tile.position.z);
        mesh.setMatrixAt(i, TMP_MATRIX);
      }

      mesh.instanceMatrix.needsUpdate = keys.length > 0;
    }
  }

  clear() {
    for (const mesh of this.instancedByType.values()) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.clear();
    this.planeGeometry.dispose();
    for (const mesh of this.instancedByType.values()) {
      mesh.material.dispose();
      this.group.remove(mesh);
    }
    this.instancedByType.clear();
  }
}
