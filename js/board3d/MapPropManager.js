import { Group } from 'three';
import { MAP_PROPS } from '../mapProps.js';
import { buildMapPropModel } from './MapPropModels.js';

// Props sit on the tile surface, matching the ground plane the unit models use.
const PROP_BASE_Y = 0.072;

function cellKey(r, c) {
  return `${r},${c}`;
}

// Stable per-cell seed, so a boulder keeps its shape across re-syncs.
function cellSeed(row, col) {
  return (Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663)) >>> 0;
}

export class MapPropManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new Group();
    this.group.name = 'map-props';
    tileGrid.group.parent.add(this.group);
    this.markers = new Map();
    this.effects = new Set();
    this.boardSize = 0;
  }

  sync(mapProps = null) {
    // Tile world positions shift when the board resizes, so surviving markers
    // cannot be reused as-is.
    if (this.boardSize !== this.tileGrid.boardSize) {
      this.clear();
      this.boardSize = this.tileGrid.boardSize;
    }

    const desired = new Map();

    if (mapProps) {
      for (let r = 0; r < mapProps.length; r++) {
        for (let c = 0; c < mapProps[r].length; c++) {
          const prop = mapProps[r][c];
          if (!prop) continue;
          desired.set(cellKey(r, c), prop.kind);
        }
      }
    }

    for (const key of this.markers.keys()) {
      if (!desired.has(key)) this.removeMarker(key);
    }

    for (const [key, kind] of desired) {
      const existing = this.markers.get(key);
      if (existing?.kind === kind) continue;
      if (existing) this.removeMarker(key);
      const [row, col] = key.split(',').map(Number);
      this.addMarker(key, row, col, kind);
    }
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

  /**
   * Play a prop's trigger animation. `ready` is awaited first so the trap fires
   * as the unit lands on it rather than the moment the move is committed.
   */
  trigger({ kind, row, col }, ready = Promise.resolve()) {
    const key = cellKey(row, col);
    const marker = this.markers.get(key);
    if (!marker?.activate || marker.kind !== kind) return;

    // A consumed prop is already gone from the game state, so take it out of the
    // synced set now: otherwise the next sync deletes the mesh mid-animation.
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
    // A marker mid-trigger owns itself until the animation ends.
    if (marker.effect) {
      marker.discard = true;
      return;
    }
    this.disposeMarker(marker);
  }

  disposeMarker(marker) {
    this.group.remove(marker.root);
    // Geometry is cached and reused between props; materials never are, because
    // each prop drives its own emissive and opacity during a trigger.
    marker.root.traverse((child) => {
      if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  clear() {
    // A persistent prop mid-trigger sits in both collections.
    for (const marker of new Set([...this.markers.values(), ...this.effects])) {
      marker.effect = null;
      this.disposeMarker(marker);
    }
    this.markers.clear();
    this.effects.clear();
  }
}
