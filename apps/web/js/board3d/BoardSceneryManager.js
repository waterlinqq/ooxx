import { Group } from 'three';
import { buildBoardBorder } from './SceneryModels.js';
import { SceneryInstancePool } from './scenery/SceneryInstancePool.js';
import {
  isSceneryInstanceKind,
  sceneryVariantIndex,
  sceneryPrototypeKey,
  buildSceneryPrototype,
} from './scenery/sceneryInstanceConfig.js';
import {
  boardHalfExtent,
  slotSeed,
  slotRotationY,
  collectBoardScenerySlots,
  isSceneryUniqueKind,
  buildScenerySlotRoot,
  SCENERY_BASE_Y,
} from './scenery/boardScenerySlots.js';
import { getSceneryRenderMode } from './scenery/sceneryPipeline.js';
import {
  buildBakedSceneryGroup,
  disposeBakedSceneryGroup,
} from './scenery/scenerySceneBake.js';
import { disposeBakedSource } from './scenery/sceneryBake.js';

function collectInstanceSlots(boardSize, slots) {
  const groups = new Map();

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!isSceneryInstanceKind(slot.kind)) continue;

    const seed = slotSeed(boardSize, i);
    const variant = sceneryVariantIndex(seed, slot.kind);
    const key = sceneryPrototypeKey(slot.kind, variant);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      x: slot.x,
      y: SCENERY_BASE_Y,
      z: slot.z,
      rotateY: slotRotationY(slot),
      scale: slot.scale ?? 1,
    });
  }

  return groups;
}

function buildInstanceDecor(pool, boardSize, slots) {
  const groups = collectInstanceSlots(boardSize, slots);

  for (const [key, transforms] of groups) {
    const [kind, variantStr] = key.split(':');
    const variant = Number(variantStr);
    const batch = pool.createBatch(
      key,
      () => buildSceneryPrototype(kind, variant),
      transforms.length,
    );
    if (!batch) continue;

    for (const transform of transforms) {
      batch.addInstance(transform);
    }
    batch.finalize();
  }
}

function buildBakedDecor(group, boardSize, slots) {
  const slotRoots = [];
  for (let i = 0; i < slots.length; i++) {
    const root = buildScenerySlotRoot(boardSize, slots[i], i);
    if (root) slotRoots.push(root);
  }

  const halfExtent = boardHalfExtent(boardSize);
  const border = buildBoardBorder(halfExtent);
  const baked = buildBakedSceneryGroup({
    borderRoot: border?.root ?? null,
    slotRoots,
  });

  group.add(baked);

  for (const root of slotRoots) disposeBakedSource(root);
  if (border?.root) disposeBakedSource(border.root);

  return baked;
}

export class BoardSceneryManager {
  constructor(boardPivot) {
    this.group = new Group();
    this.group.name = 'board-scenery';
    this.group.userData.decorative = true;
    boardPivot.add(this.group);
    this.instancePool = new SceneryInstancePool(this.group);
    this.bakedRoot = null;
    this.boardSize = 0;
    this.renderMode = getSceneryRenderMode();
  }

  ensureSize(boardSize) {
    const mode = getSceneryRenderMode();
    if (this.boardSize === boardSize && this.renderMode === mode) return;

    this.clear();
    this.boardSize = boardSize;
    this.renderMode = mode;
    if (!boardSize) return;

    const halfExtent = boardHalfExtent(boardSize);
    const slots = collectBoardScenerySlots(boardSize, halfExtent);

    if (mode === 'baked') {
      this.bakedRoot = buildBakedDecor(this.group, boardSize, slots);
      return;
    }

    const border = buildBoardBorder(halfExtent);
    if (border?.root) this.group.add(border.root);

    buildInstanceDecor(this.instancePool, boardSize, slots);

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (isSceneryInstanceKind(slot.kind)) continue;
      if (!isSceneryUniqueKind(slot.kind)) continue;

      const root = buildScenerySlotRoot(boardSize, slot, i);
      if (root) this.group.add(root);
    }
  }

  clear() {
    this.instancePool.clearBatches();

    if (this.bakedRoot) {
      this.group.remove(this.bakedRoot);
      disposeBakedSceneryGroup(this.bakedRoot);
      this.bakedRoot = null;
    }

    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.traverse((obj) => {
        if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of materials) {
            if (!mat.userData?.shared) mat.dispose();
          }
        }
      });
    }
    this.boardSize = 0;
  }
}
