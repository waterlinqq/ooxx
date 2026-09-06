import * as THREE from 'three';
import { resolveUnitColor } from '../units.js';
import { playerFacingYaw } from './CameraFacing.js';

const SHADOW_CLONE_BASE_Y = 0.072;
const SHADOW_OPACITY = 0.38;

const BODY_GEO = new THREE.CylinderGeometry(0.12, 0.17, 0.4, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.11, 8, 8);
BODY_GEO.userData.shared = true;
HEAD_GEO.userData.shared = true;

const TEAM_MATERIALS = new Map();

function shadowCloneMaterial(team) {
  let material = TEAM_MATERIALS.get(team);
  if (material) return material;

  const teamColor = new THREE.Color(resolveUnitColor(team));
  material = new THREE.MeshStandardMaterial({
    color: teamColor.clone().lerp(new THREE.Color(0x0b1220), 0.62),
    emissive: teamColor,
    emissiveIntensity: 0.32,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0.05,
  });
  TEAM_MATERIALS.set(team, material);
  return material;
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function createShadowCloneMesh(team) {
  const root = new THREE.Group();
  const material = shadowCloneMaterial(team);

  const body = new THREE.Mesh(BODY_GEO, material);
  body.position.y = 0.24;

  const head = new THREE.Mesh(HEAD_GEO, material);
  head.position.y = 0.5;

  root.add(body, head);
  root.position.y = SHADOW_CLONE_BASE_Y;
  root.rotation.y = playerFacingYaw(team);
  return root;
}

export class ShadowCloneManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new THREE.Group();
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

    const root = createShadowCloneMesh(team);
    root.position.set(tile.position.x, SHADOW_CLONE_BASE_Y, tile.position.z);
    this.group.add(root);
    this.markers.set(key, { team, root });
  }

  removeMarker(key) {
    const marker = this.markers.get(key);
    if (!marker) return;
    this.markers.delete(key);
    this.group.remove(marker.root);
  }

  clear() {
    for (const key of [...this.markers.keys()]) this.removeMarker(key);
  }
}
