import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  classifySceneryMaterialBucket,
  getSceneryBucketMaterial,
} from './scenerySharedMaterials.js';

const _color = new THREE.Color();

function geometryWithVertexColor(geometry, color, matrix) {
  const baked = geometry.clone();
  baked.applyMatrix4(matrix);

  const count = baked.attributes.position.count;
  _color.set(color);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  baked.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return baked;
}

export function appendRootToBakeBuckets(root, buckets, { skipTransparent = true } = {}) {
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const material = obj.material;
    if (skipTransparent && material?.transparent) return;

    const bucket = classifySceneryMaterialBucket(material);
    if (!bucket) return;

    obj.updateWorldMatrix(true, false);
    const geometry = geometryWithVertexColor(obj.geometry, material.color, obj.matrixWorld);

    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(geometry);
  });
}

export function buildBakedSceneryGroup({ borderRoot = null, slotRoots = [] }) {
  const buckets = new Map();

  if (borderRoot) appendRootToBakeBuckets(borderRoot, buckets);
  for (const root of slotRoots) appendRootToBakeBuckets(root, buckets);

  const group = new THREE.Group();
  group.name = 'board-scenery-baked';
  group.userData.decorative = true;

  for (const [bucket, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;

    const mesh = new THREE.Mesh(merged, getSceneryBucketMaterial(bucket));
    mesh.name = `scenery-bake-${bucket}`;
    mesh.castShadow = bucket !== 'water';
    mesh.receiveShadow = bucket === 'stone';
    mesh.userData.decorative = true;
    group.add(mesh);
  }

  return group;
}

export function disposeBakedSceneryGroup(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    obj.geometry = null;
    obj.material = null;
  });
}
