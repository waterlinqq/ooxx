import { Group } from 'three';
import { buildMapPropModel } from '../MapPropModels.js';
import {
  appendRootToBakeBuckets,
  disposeBakedSceneryGroup,
} from './scenerySceneBake.js';
import { disposeBakedSource } from './sceneryBake.js';
import { getSceneryBucketMaterial } from './scenerySharedMaterials.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

const PROP_BASE_Y = 0.072;

export function buildBakedStoneGroup(cells, tileGrid, cellSeed) {
  const geometries = [];

  for (const { row, col } of cells) {
    const tile = tileGrid.getTile(row, col);
    if (!tile) continue;

    const model = buildMapPropModel('stone', cellSeed(row, col));
    if (!model?.root) continue;

    model.root.position.set(tile.position.x, PROP_BASE_Y, tile.position.z);
    const buckets = new Map();
    appendRootToBakeBuckets(model.root, buckets, { skipTransparent: true });
    disposeBakedSource(model.root);

    for (const bucketGeometries of buckets.values()) {
      geometries.push(...bucketGeometries);
    }
  }

  const group = new Group();
  group.name = 'map-props-stones-baked';
  if (geometries.length === 0) return group;

  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return group;

  const mesh = new THREE.Mesh(merged, getSceneryBucketMaterial('stone'));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.decorative = true;
  group.add(mesh);
  return group;
}

export { disposeBakedSceneryGroup as disposeBakedStoneGroup };
