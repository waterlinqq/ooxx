import { Group } from 'three';
import { TILE_PITCH, TILE_SIZE } from './TileGrid.js';
import {
  buildBoardBorder,
  buildDecorTree,
  buildHedge,
  buildDecorRock,
  buildFlowerPatch,
  buildGrassClump,
  buildWildflowers,
  buildPond,
  buildGardenPath,
  buildReeds,
  buildStump,
  buildMushrooms,
} from './SceneryModels.js';

const SCENERY_BASE_Y = 0.0;

function boardHalfExtent(boardSize) {
  return ((boardSize - 1) * TILE_PITCH + TILE_SIZE) / 2;
}

function slotSeed(boardSize, slotIndex) {
  return (Math.imul(boardSize + 3, 2654435761) ^ Math.imul(slotIndex + 1, 1597334677)) >>> 0;
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const BUILDERS = {
  tree: buildDecorTree,
  hedge: buildHedge,
  rock: buildDecorRock,
  flowers: buildFlowerPatch,
  grass: buildGrassClump,
  wildflowers: buildWildflowers,
  pond: buildPond,
  path: buildGardenPath,
  reeds: buildReeds,
  stump: buildStump,
  mushrooms: buildMushrooms,
};

const RING = {
  corner: 0.34,
  edge: 0.28,
};

const NORTH_SOUTH_KINDS = ['hedge', 'flowers', 'rock', 'wildflowers', 'grass', 'flowers'];

// Different palettes per side so the meadow never mirrors itself.
const NORTH_MEADOW = [
  { kind: 'pond', weight: 2 },
  { kind: 'path', weight: 3 },
  { kind: 'tree', weight: 2 },
  { kind: 'grass', weight: 6 },
  { kind: 'wildflowers', weight: 4 },
  { kind: 'flowers', weight: 3 },
  { kind: 'reeds', weight: 3 },
  { kind: 'rock', weight: 2 },
  { kind: 'hedge', weight: 1 },
];

const SOUTH_MEADOW = [
  { kind: 'wildflowers', weight: 6 },
  { kind: 'mushrooms', weight: 4 },
  { kind: 'grass', weight: 7 },
  { kind: 'flowers', weight: 4 },
  { kind: 'path', weight: 2 },
  { kind: 'stump', weight: 3 },
  { kind: 'pond', weight: 1 },
  { kind: 'rock', weight: 2 },
  { kind: 'reeds', weight: 2 },
];

function pickWeighted(rng, table) {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return table[table.length - 1].kind;
}

function cornerSlots(halfExtent) {
  const d = halfExtent + RING.corner;
  return [
    { kind: 'tree', x: -d * 0.65, z: -d },
    { kind: 'tree', x: d * 0.65, z: -d },
    { kind: 'tree', x: -d * 0.65, z: d },
    { kind: 'tree', x: d * 0.65, z: d },
  ];
}

function northSouthCount(boardSize) {
  if (boardSize <= 3) return 3;
  if (boardSize <= 4) return 4;
  if (boardSize <= 5) return 5;
  return 6;
}

function meadowScatterCount(boardSize) {
  if (boardSize <= 3) return 18;
  if (boardSize <= 4) return 26;
  if (boardSize <= 5) return 34;
  return 42;
}

function edgeSlots(boardSize, halfExtent) {
  const d = halfExtent + RING.edge;
  const slots = [];
  const span = halfExtent * 0.78;
  const nsCount = northSouthCount(boardSize);

  for (let side = 0; side < 2; side++) {
    const z = side === 0 ? -d : d;
    for (let i = 0; i < nsCount; i++) {
      const t = nsCount === 1 ? 0 : (i / (nsCount - 1)) * 2 - 1;
      const x = t * span + (side === 0 ? -0.08 : 0.12) * (i % 2 === 0 ? 1 : -1);
      const kind = NORTH_SOUTH_KINDS[(side * nsCount + i) % NORTH_SOUTH_KINDS.length];
      slots.push({ kind, x, z, rotate: false });
    }
  }

  for (const x of [-d, d]) {
    slots.push({ kind: 'rock', x, z: 0, rotate: true });
  }

  return slots;
}

// Fill the portrait letterbox bands above/below the board with irregular meadow
// scatter. Positions are jittered — never mirrored between north and south.
function meadowSlots(boardSize, halfExtent, side) {
  const north = side === 'north';
  const rng = seededRng(slotSeed(boardSize, north ? 800 : 801));
  const table = north ? NORTH_MEADOW : SOUTH_MEADOW;
  const count = meadowScatterCount(boardSize);
  const slots = [];

  const zSign = north ? -1 : 1;
  const zNear = halfExtent + 0.38;
  const zFar = halfExtent + 3.4 + boardSize * 0.22;
  const xSpan = halfExtent * 1.55;

  // One feature anchor per side — pond or path — offset so it never centres.
  const anchorKind = north
    ? (rng() > 0.35 ? 'pond' : 'path')
    : (rng() > 0.55 ? 'path' : 'stump');
  slots.push({
    kind: anchorKind,
    x: (rng() - 0.5) * xSpan * 1.1,
    z: zSign * (zNear + rng() * (zFar - zNear) * 0.55),
    rotate: rng() * Math.PI * 2,
    scale: 1.1 + rng() * 0.35,
  });

  for (let i = 0; i < count; i++) {
    const layer = rng();
    const xBias = north ? -0.15 : 0.2;
    const x = (rng() * 2 - 1 + xBias) * xSpan * (0.55 + rng() * 0.5);
    const z = zSign * (zNear + layer * layer * (zFar - zNear) * (0.65 + rng() * 0.55));
    const kind = pickWeighted(rng, table);

    slots.push({
      kind,
      x,
      z,
      rotate: rng() * Math.PI * 2,
      scale: 0.75 + rng() * 0.55,
    });
  }

  return slots;
}

export class BoardSceneryManager {
  constructor(boardPivot) {
    this.group = new Group();
    this.group.name = 'board-scenery';
    this.group.userData.decorative = true;
    boardPivot.add(this.group);
    this.boardSize = 0;
  }

  ensureSize(boardSize) {
    if (this.boardSize === boardSize) return;
    this.clear();
    this.boardSize = boardSize;
    if (!boardSize) return;

    const halfExtent = boardHalfExtent(boardSize);

    const border = buildBoardBorder(halfExtent);
    if (border?.root) this.group.add(border.root);

    const slots = [
      ...cornerSlots(halfExtent),
      ...edgeSlots(boardSize, halfExtent),
      ...meadowSlots(boardSize, halfExtent, 'north'),
      ...meadowSlots(boardSize, halfExtent, 'south'),
    ];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const builder = BUILDERS[slot.kind];
      if (!builder) continue;

      const model = builder(slotSeed(boardSize, i));
      if (!model?.root) continue;

      model.root.position.set(slot.x, SCENERY_BASE_Y, slot.z);
      if (slot.rotate === true) model.root.rotation.y += Math.PI / 2;
      else if (typeof slot.rotate === 'number') model.root.rotation.y += slot.rotate;
      if (slot.scale) model.root.scale.multiplyScalar(slot.scale);
      this.group.add(model.root);
    }
  }

  clear() {
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
