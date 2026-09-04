import * as THREE from 'three';
import { TILE_SIZE } from './TileGrid.js';
import { MAP_PROPS } from '../mapProps.js';

function cellKey(r, c) {
  return `${r},${c}`;
}

function createPropMesh(kind) {
  let mesh;

  if (kind === 'potion') {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(TILE_SIZE * 0.1, TILE_SIZE * 0.12, TILE_SIZE * 0.22, 10),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0x991b1b,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.15,
      }),
    );
    body.position.y = 0;
    mesh = new THREE.Group();
    mesh.add(body);
  } else if (kind === 'spikes') {
    mesh = new THREE.Mesh(
      new THREE.ConeGeometry(TILE_SIZE * 0.14, TILE_SIZE * 0.24, 4),
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        emissive: 0x1e293b,
        emissiveIntensity: 0.25,
        roughness: 0.55,
        metalness: 0.35,
      }),
    );
  } else if (kind === 'web') {
    mesh = new THREE.Mesh(
      new THREE.CircleGeometry(TILE_SIZE * 0.28, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0x94a3b8,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
  } else if (kind === 'stone') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.28, TILE_SIZE * 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        emissive: 0x334155,
        emissiveIntensity: 0.12,
        roughness: 0.85,
        metalness: 0.05,
      }),
    );
  } else {
    return null;
  }

  mesh.userData.mapPropKind = kind;
  mesh.renderOrder = 2;
  return mesh;
}

export class MapPropManager {
  constructor(tileGrid) {
    this.tileGrid = tileGrid;
    this.group = new THREE.Group();
    this.group.name = 'map-props';
    tileGrid.group.parent.add(this.group);
    this.markers = new Map();
  }

  sync(mapProps = null) {
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
      if (existing?.userData.mapPropKind === kind) continue;
      if (existing) this.removeMarker(key);
      const [row, col] = key.split(',').map(Number);
      this.addMarker(key, row, col, kind);
    }
  }

  addMarker(key, row, col, kind) {
    const tile = this.tileGrid.getTile(row, col);
    if (!tile) return;

    const mesh = createPropMesh(kind);
    if (!mesh) return;

    mesh.position.copy(tile.position);
    if (kind === 'potion') {
      mesh.position.y = TILE_SIZE * 0.14;
    } else if (kind === 'spikes') {
      mesh.position.y = TILE_SIZE * 0.14;
    } else if (kind === 'web') {
      mesh.position.y = 0.04;
    } else if (kind === 'stone') {
      mesh.position.y = TILE_SIZE * 0.16;
    }
    mesh.userData.mapPropKind = kind;
    mesh.userData.mapPropLabel = MAP_PROPS[kind]?.name ?? kind;
    this.group.add(mesh);
    this.markers.set(key, mesh);
  }

  removeMarker(key) {
    const mesh = this.markers.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.markers.delete(key);
  }

  clear() {
    for (const key of [...this.markers.keys()]) {
      this.removeMarker(key);
    }
  }
}
