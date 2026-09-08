import {
  buildDecorRock,
  buildDecorTree,
  buildFlowerPatch,
  buildGrassClump,
  buildHedge,
  buildWildflowers,
  buildMushrooms,
  buildReeds,
} from '../SceneryModels.js';

/** Kinds rendered via InstancedMesh (Level 1+2). */
export const SCENERY_INSTANCE_KINDS = {
  grass: { variants: 4, builder: buildGrassClump },
  rock: { variants: 3, builder: buildDecorRock },
  wildflowers: { variants: 4, builder: buildWildflowers },
  flowers: { variants: 4, builder: buildFlowerPatch },
  mushrooms: { variants: 3, builder: buildMushrooms },
  reeds: { variants: 3, builder: buildReeds },
  tree: { variants: 3, builder: buildDecorTree },
  hedge: { variants: 2, builder: buildHedge },
};

export function isSceneryInstanceKind(kind) {
  return Boolean(SCENERY_INSTANCE_KINDS[kind]);
}

export function sceneryVariantIndex(seed, kind) {
  const config = SCENERY_INSTANCE_KINDS[kind];
  if (!config) return 0;
  return seed % config.variants;
}

export function sceneryPrototypeKey(kind, variant) {
  return `${kind}:${variant}`;
}

export function buildSceneryPrototype(kind, variant) {
  const config = SCENERY_INSTANCE_KINDS[kind];
  if (!config) return null;
  const seed = (variant + 1) * 9973;
  const model = config.builder(seed);
  return model?.root ?? null;
}
