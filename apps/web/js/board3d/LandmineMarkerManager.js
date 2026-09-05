import * as THREE from 'three';
import { TILE_SIZE } from './TileGrid.js';
import { buildLandmineBoardMarker } from './UnitModels.js';

function cellKey(r, c) {
  return `${r},${c}`;
}

export class LandmineMarkerManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new THREE.Group();
    this.group.name = 'landmine-markers';
    tileGrid.group.parent.add(this.group);
    this.markers = new Map();
    this.effects = new Set();
    this.visible = true;
  }

  sync(pendingLandmines = [], visible = true) {
    this.visible = visible;

    if (!visible) {
      this.clear();
      return;
    }

    const desired = new Set(pendingLandmines.map(({ row, col }) => cellKey(row, col)));

    for (const key of this.markers.keys()) {
      if (!desired.has(key)) this.removeMarker(key);
    }

    for (const { row, col } of pendingLandmines) {
      const key = cellKey(row, col);
      if (this.markers.has(key)) continue;
      this.addMarker(key, row, col);
    }
  }

  addMarker(key, row, col) {
    const tile = this.tileGrid.getTile(row, col);
    if (!tile) return;

    const model = buildLandmineBoardMarker();
    model.root.position.copy(tile.position);
    model.root.position.y = 0.06;
    model.root.renderOrder = 3;
    this.group.add(model.root);

    this.markers.set(key, {
      row,
      col,
      root: model.root,
      led: model.led,
      activate: model.activate,
      activateMs: model.activateMs,
      effect: null,
      discard: false,
    });
  }

  trigger({ row, col }, ready = Promise.resolve()) {
    const key = cellKey(row, col);
    const marker = this.markers.get(key);
    if (!marker?.activate) return;

    this.markers.delete(key);
    marker.effect = { start: null };
    this.effects.add(marker);

    ready.then(() => {
      if (marker.effect) marker.effect.start = performance.now();
    });
  }

  tick(elapsed) {
    for (const marker of this.markers.values()) {
      if (!marker.led?.material) continue;
      const pulse = 0.55 + Math.sin(elapsed * 4.2) * 0.35;
      marker.led.material.emissiveIntensity = pulse;
    }

    if (this.effects.size === 0) return;
    const now = performance.now();

    for (const marker of [...this.effects]) {
      const { start } = marker.effect;
      if (start === null) continue;

      const p = Math.min(1, (now - start) / marker.activateMs);
      marker.activate(p);
      if (p < 1) continue;

      this.effects.delete(marker);
      marker.effect = null;
      this.disposeMarker(marker);
    }
  }

  removeMarker(key) {
    const marker = this.markers.get(key);
    if (!marker) return;
    this.markers.delete(key);
    if (marker.effect) {
      marker.discard = true;
      return;
    }
    this.disposeMarker(marker);
  }

  disposeMarker(marker) {
    this.group.remove(marker.root);
    marker.root.traverse((child) => {
      if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  clear() {
    for (const marker of new Set([...this.markers.values(), ...this.effects])) {
      marker.effect = null;
      this.disposeMarker(marker);
    }
    this.markers.clear();
    this.effects.clear();
  }
}
