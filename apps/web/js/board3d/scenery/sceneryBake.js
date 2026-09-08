import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _rootInv = new THREE.Matrix4();
const _local = new THREE.Matrix4();

function materialKey(material) {
  if (!material) return null;
  return material.uuid;
}

/**
 * Bake a procedural scenery group into merged geometry layers (one mesh per material).
 * Transparent decals (contact shadows) are skipped — they do not instance well.
 */
export function bakeGroupToLayers(root, { skipTransparent = true } = {}) {
  root.updateMatrixWorld(true);
  _rootInv.copy(root.matrixWorld).invert();

  const byMaterial = new Map();

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const material = obj.material;
    if (skipTransparent && material?.transparent) return;

    const key = materialKey(material);
    if (!key) return;

    obj.updateWorldMatrix(true, false);
    _local.multiplyMatrices(_rootInv, obj.matrixWorld);

    const geometry = obj.geometry.clone();
    geometry.applyMatrix4(_local);

    if (!byMaterial.has(key)) {
      byMaterial.set(key, {
        material,
        geometries: [],
        castShadow: false,
        receiveShadow: false,
        renderOrder: 0,
      });
    }

    const entry = byMaterial.get(key);
    entry.geometries.push(geometry);
    entry.castShadow = entry.castShadow || obj.castShadow;
    entry.receiveShadow = entry.receiveShadow || obj.receiveShadow;
    entry.renderOrder = Math.max(entry.renderOrder, obj.renderOrder);
  });

  const layers = [];
  for (const entry of byMaterial.values()) {
    const merged = mergeGeometries(entry.geometries, false);
    for (const geometry of entry.geometries) {
      if (!geometry.userData?.shared) geometry.dispose();
    }
    if (!merged) continue;

    merged.userData.shared = true;
    if (!entry.material.userData.shared) entry.material.userData.shared = true;

    layers.push({
      geometry: merged,
      material: entry.material,
      castShadow: entry.castShadow,
      receiveShadow: entry.receiveShadow,
      renderOrder: entry.renderOrder,
    });
  }

  return layers;
}

/** Dispose a temporary prototype root after baking. Keeps shared geometry/materials. */
export function disposeBakedSource(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        if (mat && !mat.userData?.shared) mat.dispose();
      }
    }
  });
}

export function countMeshes(root) {
  let meshes = 0;
  root.traverse((obj) => {
    if (obj.isMesh) meshes++;
  });
  return meshes;
}
