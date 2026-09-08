import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import manifest from '../../../assets/units/manifest.json';
import { applyTeamTintToMaterials, collectMeshMaterials, normalizeGltfMaterials, finalizeGltfMeshes } from './teamTint.js';
import {
  resolveRigFromScene,
  findBodyNode,
  findShadowNode,
  findRingNode,
} from './rigNames.js';
import { UnitAnimationController } from './UnitAnimationController.js';

const gltfLoader = new GLTFLoader();
const templateCache = new Map();

function cloneMeshMaterials(root) {
  const bySlot = new Map();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const share = (material) => {
      if (!material) return material;
      const slot = material.name ?? '';
      const key = slot || material.uuid;
      if (!bySlot.has(key)) bySlot.set(key, material.clone());
      return bySlot.get(key);
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(share);
      return;
    }
    child.material = share(child.material);
  });
}

class UnitAssetLoader {
  constructor() {
    this.ready = false;
    this.initPromise = null;
    this.failed = new Set();
  }

  init(classIds = Object.keys(manifest.units)) {
    if (!this.initPromise) {
      this.initPromise = this._preload(classIds).then(() => {
        this.ready = true;
      });
    }
    return this.initPromise;
  }

  canInstantiate(classId) {
    return templateCache.has(classId) && !this.failed.has(classId);
  }

  async _preload(classIds) {
    await Promise.all(classIds.map((classId) => this._loadTemplate(classId).catch(() => {
      this.failed.add(classId);
    })));
  }

  async _loadTemplate(classId) {
    if (templateCache.has(classId)) return;
    const spec = manifest.units[classId];
    if (!spec) throw new Error(`Unknown unit manifest entry: ${classId}`);
    const gltf = await gltfLoader.loadAsync(`/units/${spec.file}`);
    templateCache.set(classId, gltf);
  }

  getManifestEntry(classId) {
    return manifest.units[classId] ?? null;
  }

  instantiate(classId, team) {
    const spec = manifest.units[classId];
    const gltf = templateCache.get(classId);
    if (!spec || !gltf) return null;

    const root = gltf.scene.clone(true);
    cloneMeshMaterials(root);

    const materials = collectMeshMaterials(root);
    normalizeGltfMaterials(materials);
    applyTeamTintToMaterials(materials, team, spec.teamTintMaterials);
    finalizeGltfMeshes(root);

    const body = findBodyNode(root);
    const shadow = findShadowNode(root);
    const ring = findRingNode(root);
    if (shadow) shadow.renderOrder = 1;
    const rig = resolveRigFromScene(root, classId, spec.legSegments ?? null);
    const animation = new UnitAnimationController(root, gltf.animations ?? [], spec.clips ?? {});

    const bounds = new THREE.Box3().setFromObject(body ?? root);

    return {
      root,
      body: body ?? root,
      rig,
      shadow,
      ring,
      height: bounds.max.y,
      materials,
      spawnStyle: spec.spawnStyle ?? 'drop',
      animation,
    };
  }
}

let singleton = null;

export function getUnitAssetLoader() {
  if (!singleton) singleton = new UnitAssetLoader();
  return singleton;
}
