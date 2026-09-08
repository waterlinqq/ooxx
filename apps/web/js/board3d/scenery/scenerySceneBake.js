import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  classifySceneryMaterialBucket,
  getSceneryBucketMaterial,
} from './scenerySharedMaterials.js';

const _color = new THREE.Color();

function applyContactAO(geometry, bucket) {
  const pos = geometry.attributes.position;
  const colors = geometry.attributes.color;
  const count = pos.count;

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const span = Math.max(0.04, maxY - minY);
  const water = bucket === 'water';

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const ground = THREE.MathUtils.clamp(y / 0.14, 0, 1);
    const local = (y - minY) / span;
    let ao = 0.56 + 0.44 * Math.min(1, ground * 0.55 + local * 0.72);
    if (water) ao = 0.82 + 0.18 * ao;
    colors.setX(i, colors.getX(i) * ao);
    colors.setY(i, colors.getY(i) * ao);
    colors.setZ(i, colors.getZ(i) * ao);
  }
  colors.needsUpdate = true;
}

function geometryWithVertexColor(geometry, color, matrix, bucket) {
  let baked = geometry.clone();
  if (baked.index) {
    const nonIndexed = baked.toNonIndexed();
    baked.dispose();
    baked = nonIndexed;
  }
  baked.applyMatrix4(matrix);

  const count = baked.attributes.position.count;
  _color.set(color);
  const colors = new Float32Array(count * 3);
  const existing = baked.attributes.color;

  for (let i = 0; i < count; i++) {
    let r = _color.r;
    let g = _color.g;
    let b = _color.b;
    if (existing) {
      r *= existing.getX(i);
      g *= existing.getY(i);
      b *= existing.getZ(i);
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  baked.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  applyContactAO(baked, bucket);
  return baked;
}

function isUnderLiveGroup(obj) {
  let node = obj;
  while (node) {
    if (node.userData?.sceneryLive) return true;
    node = node.parent;
  }
  return false;
}

export function extractLiveSceneryGroups(root) {
  const lives = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj.userData?.sceneryLive) lives.push(obj);
  });

  for (const live of lives) {
    live.updateMatrixWorld(true);
    const world = live.matrixWorld.clone();
    live.parent?.remove(live);
    world.decompose(live.position, live.quaternion, live.scale);
    live.matrixAutoUpdate = true;
  }

  return lives;
}

export function appendRootToBakeBuckets(root, buckets, { skipTransparent = true } = {}) {
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (!obj.isMesh || isUnderLiveGroup(obj)) return;

    const material = obj.material;
    if (skipTransparent && material?.transparent) return;

    const bucket = classifySceneryMaterialBucket(material);
    if (!bucket) return;

    obj.updateWorldMatrix(true, false);
    const geometry = geometryWithVertexColor(obj.geometry, material.color, obj.matrixWorld, bucket);

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
