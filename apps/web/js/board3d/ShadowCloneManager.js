import { Group } from 'three';
import { disposeUnitMaterials } from './UnitModels.js';
import { resolveUnitModel } from './units/resolveUnitModel.js';
import { playerFacingYaw } from './CameraFacing.js';

const SHADOW_CLONE_BASE_Y = 0.072;
const SHADOW_OPACITY = 0.38;

function cellKey(r, c) {
  return `${r},${c}`;
}

function createShadowCloneMesh(team) {
  const model = resolveUnitModel('assassin', team);
  model.root.position.y = SHADOW_CLONE_BASE_Y;
  model.root.rotation.y = playerFacingYaw(team);

  if (model.ring) model.ring.visible = false;
  if (model.shadow) model.shadow.visible = false;

  for (const mat of model.materials) {
    if (mat.userData?.skipTint) continue;
    mat.transparent = true;
    mat.opacity = SHADOW_OPACITY;
    mat.depthWrite = false;
    if (mat.emissive) mat.emissiveIntensity *= 0.25;
  }

  return model;
}

export class ShadowCloneManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new Group();
    this.group.name = 'shadow-clones';
    tileGrid.group.parent.add(this.group);
    this.markers = new Map();
    this.boardSize = 0;
  }

  sync(shadowClones = []) {
    if (this.boardSize !== this.tileGrid.boardSize) {
      this.clear();
      this.boardSize = this.tileGrid.boardSize;
    }

    const desired = new Map();
    for (const clone of shadowClones ?? []) {
      desired.set(cellKey(clone.row, clone.col), clone.team);
    }

    for (const key of this.markers.keys()) {
      if (!desired.has(key)) this.removeMarker(key);
    }

    for (const [key, team] of desired) {
      const existing = this.markers.get(key);
      if (existing?.team === team) continue;
      if (existing) this.removeMarker(key);
      const [row, col] = key.split(',').map(Number);
      this.addMarker(key, row, col, team);
    }
  }

  addMarker(key, row, col, team) {
    const tile = this.tileGrid.getTile(row, col);
    if (!tile) return;

    const model = createShadowCloneMesh(team);
    model.root.position.set(tile.position.x, SHADOW_CLONE_BASE_Y, tile.position.z);
    this.group.add(model.root);
    this.markers.set(key, { team, root: model.root, materials: model.materials, animation: model.animation });
  }

  removeMarker(key) {
    const marker = this.markers.get(key);
    if (!marker) return;
    this.markers.delete(key);
    marker.animation?.dispose?.();
    this.group.remove(marker.root);
    marker.root.traverse((child) => {
      if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose();
    });
    if (marker.materials) disposeUnitMaterials(marker.materials);
  }

  clear() {
    for (const key of [...this.markers.keys()]) this.removeMarker(key);
  }
}
