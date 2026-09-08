import * as THREE from 'three';

const BUCKET_SPECS = {
  foliage: {
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
  },
  stone: {
    roughness: 1,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  },
  water: {
    roughness: 0.16,
    metalness: 0.14,
    flatShading: false,
    vertexColors: true,
  },
  accent: {
    roughness: 0.72,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
  },
};

const materialCache = new Map();

export function getSceneryBucketMaterial(bucket) {
  let material = materialCache.get(bucket);
  if (material) return material;

  const spec = BUCKET_SPECS[bucket] ?? BUCKET_SPECS.stone;
  material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    ...spec,
  });
  material.userData.shared = true;
  material.userData.sceneryBucket = bucket;
  materialCache.set(bucket, material);
  return material;
}

/** Group procedural materials into a few shared buckets for scene baking. */
export function classifySceneryMaterialBucket(material) {
  if (!material || material.transparent) return null;

  const tagged = material.userData?.sceneryBucket;
  if (tagged && BUCKET_SPECS[tagged]) return tagged;

  const roughness = material.roughness ?? 1;
  const metalness = material.metalness ?? 0;

  if (metalness >= 0.1 && roughness <= 0.25) return 'water';

  const { r, g, b } = material.color ?? { r: 0.5, g: 0.5, b: 0.5 };
  if (g > r * 1.08 && g > b * 1.02) return 'foliage';
  if (r > 0.55 && g > 0.45 && b < 0.55 && roughness < 0.9) return 'accent';
  if (roughness >= 0.96 || material.flatShading) return 'stone';
  if (roughness >= 0.85) return 'foliage';
  return 'accent';
}
