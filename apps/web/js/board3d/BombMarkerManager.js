import * as THREE from 'three';
import { TILE_SIZE } from './TileGrid.js';

function cellKey(r, c) {
  return `${r},${c}`;
}

export class BombMarkerManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new THREE.Group();
    this.group.name = 'bomb-markers';
    tileGrid.group.parent.add(this.group);
    this.markers = new Map();
  }

  sync(pendingBombs = []) {
    const desired = new Set(pendingBombs.map(({ row, col }) => cellKey(row, col)));

    for (const key of this.markers.keys()) {
      if (!desired.has(key)) this.removeMarker(key);
    }

    for (const { row, col } of pendingBombs) {
      const key = cellKey(row, col);
      if (this.markers.has(key)) continue;
      this.addMarker(key, row, col);
    }
  }

  addMarker(key, row, col) {
    const tile = this.tileGrid.getTile(row, col);
    if (!tile) return;

    const geometry = new THREE.TorusGeometry(TILE_SIZE * 0.18, TILE_SIZE * 0.04, 8, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xc2410c,
      emissiveIntensity: 0.8,
      roughness: 0.45,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(tile.position);
    mesh.position.y = 0.16;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.markers.set(key, mesh);
  }

  removeMarker(key) {
    const mesh = this.markers.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.markers.delete(key);
  }

  clear() {
    for (const key of [...this.markers.keys()]) {
      this.removeMarker(key);
    }
  }
}
