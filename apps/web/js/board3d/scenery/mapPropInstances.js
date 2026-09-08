import { buildMapPropModel } from '../MapPropModels.js';
import { SceneryInstancePool } from './SceneryInstancePool.js';

const STONE_VARIANTS = 8;
const PROP_BASE_Y = 0.072;

function stonePrototypeKey(variant) {
  return `map-stone:${variant}`;
}

function buildStonePrototype(variant) {
  const seed = (variant + 1) * 48271;
  const model = buildMapPropModel('stone', seed);
  return model?.root ?? null;
}

/**
 * Survival-border stones and other static stone props, batched via InstancedMesh.
 */
export class MapPropStoneInstances {
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    this.pool = new SceneryInstancePool(parentGroup);
    this.variantByKey = new Map();
  }

  sync(cells, tileGrid) {
    this.pool.clearBatches();
    this.variantByKey.clear();

    const groups = new Map();
    for (const { key, row, col } of cells) {
      const seed = (Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663)) >>> 0;
      const variant = seed % STONE_VARIANTS;
      const batchKey = stonePrototypeKey(variant);
      if (!groups.has(batchKey)) groups.set(batchKey, []);
      groups.get(batchKey).push({ key, row, col, variant });
    }

    for (const [batchKey, entries] of groups) {
      const variant = Number(batchKey.split(':')[1]);
      const batch = this.pool.createBatch(
        batchKey,
        () => buildStonePrototype(variant),
        entries.length,
      );
      if (!batch) continue;

      for (const { key, row, col } of entries) {
        const tile = tileGrid.getTile(row, col);
        if (!tile) continue;
        batch.addInstance({
          x: tile.position.x,
          y: PROP_BASE_Y,
          z: tile.position.z,
        });
        this.variantByKey.set(key, variant);
      }
      batch.finalize();
    }
  }

  getVariant(key) {
    return this.variantByKey.get(key);
  }

  clear() {
    this.pool.clearBatches();
    this.variantByKey.clear();
  }

  dispose() {
    this.pool.dispose();
    this.variantByKey.clear();
  }
}

export { STONE_VARIANTS };
