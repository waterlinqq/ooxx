import { Group } from 'three';
import { MAP_PROPS } from '../mapProps.js';
import { buildMapPropModel } from './MapPropModels.js';
import { MapPropStoneInstances } from './scenery/mapPropInstances.js';
import { getMapPropStoneMode } from './scenery/sceneryPipeline.js';
import {
  buildBakedStoneGroup,
  disposeBakedStoneGroup,
} from './scenery/mapPropSceneBake.js';

const PROP_BASE_Y = 0.072;

function cellKey(r, c) {
  return `${r},${c}`;
}

function cellSeed(row, col) {
  return (Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663)) >>> 0;
}

export class MapPropManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new Group();
    this.group.name = 'map-props';
    tileGrid.group.parent.add(this.group);
    this.stoneInstances = new MapPropStoneInstances(this.group);
    this.bakedStones = null;
    this.stoneMode = getMapPropStoneMode();
    this.markers = new Map();
    this.effects = new Set();
    this.boardSize = 0;
  }

  sync(mapProps = null) {
    const stoneMode = getMapPropStoneMode();
    if (this.boardSize !== this.tileGrid.boardSize || this.stoneMode !== stoneMode) {
      this.clear();
      this.boardSize = this.tileGrid.boardSize;
      this.stoneMode = stoneMode;
    }

    const desired = new Map();
    const stoneCells = [];

    if (mapProps) {
      for (let r = 0; r < mapProps.length; r++) {
        for (let c = 0; c < mapProps[r].length; c++) {
          const prop = mapProps[r][c];
          if (!prop) continue;
          const key = cellKey(r, c);
          desired.set(key, prop.kind);
          if (prop.kind === 'stone') {
            stoneCells.push({ key, row: r, col: c });
          }
        }
      }
    }

    for (const key of this.markers.keys()) {
      if (!desired.has(key)) this.removeMarker(key);
    }

    this.syncStones(stoneCells);

    for (const [key, kind] of desired) {
      if (kind === 'stone') continue;

      const existing = this.markers.get(key);
      if (existing?.kind === kind) continue;
      if (existing) this.removeMarker(key);
      const [row, col] = key.split(',').map(Number);
      this.addMarker(key, row, col, kind);
    }
  }

  syncStones(cells) {
    if (this.bakedStones) {
      this.group.remove(this.bakedStones);
      disposeBakedStoneGroup(this.bakedStones);
      this.bakedStones = null;
    }
    this.stoneInstances.clear();

    if (cells.length === 0) return;

    if (this.stoneMode === 'instanced') {
      this.stoneInstances.sync(cells, this.tileGrid);
      return;
    }

    this.bakedStones = buildBakedStoneGroup(cells, this.tileGrid, cellSeed);
    this.group.add(this.bakedStones);
  }

  addMarker(key, row, col, kind) {
    const tile = this.tileGrid.getTile(row, col);
    if (!tile) return;

    const seed = cellSeed(row, col);
    const model = buildMapPropModel(kind, seed);
    if (!model) return;

    const { root } = model;
    root.position.set(tile.position.x, PROP_BASE_Y, tile.position.z);
    root.userData.mapPropKind = kind;
    root.userData.mapPropLabel = MAP_PROPS[kind]?.name ?? kind;

    this.group.add(root);
    this.markers.set(key, {
      kind,
      root,
      activate: model.activate ?? null,
      activateMs: model.activateMs ?? 0,
      persistent: model.persistent ?? false,
      effect: null,
      discard: false,
    });
  }

  trigger({ kind, row, col }, ready = Promise.resolve()) {
    const key = cellKey(row, col);
    const marker = this.markers.get(key);
    if (!marker?.activate || marker.kind !== kind) return;

    if (!marker.persistent) this.markers.delete(key);
    marker.effect = { start: null };
    this.effects.add(marker);

    ready.then(() => {
      if (marker.effect) marker.effect.start = performance.now();
    });
  }

  tick() {
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
      if (!marker.persistent || marker.discard) this.disposeMarker(marker);
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
    if (this.bakedStones) {
      this.group.remove(this.bakedStones);
      disposeBakedStoneGroup(this.bakedStones);
      this.bakedStones = null;
    }
    this.stoneInstances.clear();
    for (const marker of new Set([...this.markers.values(), ...this.effects])) {
      marker.effect = null;
      this.disposeMarker(marker);
    }
    this.markers.clear();
    this.effects.clear();
  }
}
