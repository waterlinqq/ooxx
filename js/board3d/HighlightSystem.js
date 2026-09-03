import * as THREE from 'three';
import { TILE_SIZE } from './TileGrid.js';

const HIGHLIGHT = {
  move: { color: 0x22c55e, opacity: 0.42, emissive: 0x166534 },
  attack: { color: 0xef4444, opacity: 0.48, emissive: 0x991b1b },
  deploy: { color: 0x3b82f6, opacity: 0.42, emissive: 0x1d4ed8 },
  win: { color: 0xfbbf24, opacity: 0.55, emissive: 0xb45309 },
  item: { color: 0xa855f7, opacity: 0.45, emissive: 0x6b21a8 },
};

function cellKey(r, c) {
  return `${r},${c}`;
}

export class HighlightSystem {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new THREE.Group();
    this.group.name = 'highlights';
    tileGrid.group.parent.add(this.group);
    this.overlays = new Map();
  }

  update(state) {
    const boardSize = state.boardSize;
    const desired = new Map();

    const moves = new Set(state.validMoves.map(([r, c]) => cellKey(r, c)));
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
        else if (moves.has(key)) type = 'move';
        if (type) desired.set(key, type);
      }
    }

    for (const key of this.overlays.keys()) {
      if (!desired.has(key)) {
        this.removeOverlay(key);
      }
    }

    for (const [key, type] of desired) {
      const existing = this.overlays.get(key);
      if (existing && existing.userData.highlightType === type) continue;
      if (existing) this.removeOverlay(key);
      this.addOverlay(key, type);
    }
  }

  addOverlay(key, type) {
    const [row, col] = key.split(',').map(Number);
    const tile = this.tileGrid.getTile(row, col);
    if (!tile) return;

    const spec = HIGHLIGHT[type];
    const geometry = new THREE.PlaneGeometry(TILE_SIZE * 0.92, TILE_SIZE * 0.92);
    const material = new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.emissive,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(tile.position);
    mesh.position.y = 0.09;
    mesh.userData.highlightType = type;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.overlays.set(key, mesh);
  }

  removeOverlay(key) {
    const mesh = this.overlays.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.overlays.delete(key);
  }

  clear() {
    for (const key of [...this.overlays.keys()]) {
      this.removeOverlay(key);
    }
  }
}
