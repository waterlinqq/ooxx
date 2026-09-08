import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NODE, gltfNodeName } from './rigNames.js';

const _parentInv = new THREE.Matrix4();
const _local = new THREE.Matrix4();

const SKIP_PARENTS = new Set([
  gltfNodeName(NODE.SHADOW),
  gltfNodeName(NODE.RING),
]);

function materialKey(material) {
  if (!material) return null;
  return material.name || `uuid:${material.uuid}`;
}

function bakeMeshGeometry(mesh, parent) {
  mesh.updateWorldMatrix(true, false);
  _local.multiplyMatrices(_parentInv, mesh.matrixWorld);
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(_local);
  return geometry;
}

/** Count drawable meshes in a scene graph (approximates draw calls for opaque passes). */
export function countMeshes(root) {
  let meshes = 0;
  root.traverse((obj) => {
    if (obj.isMesh) meshes++;
  });
  return meshes;
}

/**
 * Merge sibling meshes that share a material under the same parent.
 * Rig nodes stay intact; only static geometry batches are combined.
 */
export function mergeBakeMeshes(root) {
  root.updateMatrixWorld(true);

  const nodes = [];
  root.traverse((node) => nodes.push(node));

  let mergedGroups = 0;
  for (const parent of nodes) {
    if (SKIP_PARENTS.has(parent.name)) continue;

    const meshChildren = parent.children.filter((child) => child.isMesh);
    if (meshChildren.length < 2) continue;

    const byMaterial = new Map();
    for (const mesh of meshChildren) {
      const key = materialKey(mesh.material);
      if (!key) continue;
      if (!byMaterial.has(key)) byMaterial.set(key, []);
      byMaterial.get(key).push(mesh);
    }

    parent.updateWorldMatrix(true, false);
    _parentInv.copy(parent.matrixWorld).invert();

    for (const group of byMaterial.values()) {
      if (group.length < 2) continue;

      const geometries = [];
      for (const mesh of group) {
        geometries.push(bakeMeshGeometry(mesh, parent));
      }

      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) {
        if (!geometry.userData?.shared) geometry.dispose();
      }
      if (!merged) continue;

      const combined = new THREE.Mesh(merged, group[0].material);
      combined.castShadow = group.some((mesh) => mesh.castShadow);
      combined.receiveShadow = group.some((mesh) => mesh.receiveShadow);
      combined.renderOrder = Math.max(...group.map((mesh) => mesh.renderOrder));

      for (const mesh of group) {
        parent.remove(mesh);
        if (!mesh.geometry.userData?.shared) mesh.geometry.dispose();
      }
      parent.add(combined);
      mergedGroups++;
    }
  }

  return { mergedGroups, meshCount: countMeshes(root) };
}
