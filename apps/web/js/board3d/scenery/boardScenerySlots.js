import { TILE_PITCH, TILE_SIZE } from '../TileGrid.js';
import {
  buildPond,
  buildLake,
  buildGardenPath,
  buildStump,
} from '../SceneryModels.js';
import {
  isSceneryInstanceKind,
  sceneryVariantIndex,
  SCENERY_INSTANCE_KINDS,
} from './sceneryInstanceConfig.js';

export const SCENERY_BASE_Y = 0.0;

const UNIQUE_BUILDERS = {
  pond: buildPond,
  lake: buildLake,
  path: buildGardenPath,
  stump: buildStump,
};

const RING = {
  corner: 0.34,
  edge: 0.28,
};

const NORTH_SOUTH_KINDS = ['rock', 'flowers', 'bush', 'wildflowers', 'path', 'flowers'];
const EAST_WEST_KINDS = ['rock', 'bush', 'path', 'debris', 'flowers'];

const NORTH_MEADOW = [
  { kind: 'path', weight: 3 },
  { kind: 'tree', weight: 2 },
  { kind: 'bush', weight: 3 },
  { kind: 'reeds', weight: 5 },
  { kind: 'rock', weight: 4 },
  { kind: 'wildflowers', weight: 3 },
  { kind: 'debris', weight: 3 },
  { kind: 'mound', weight: 3 },
  { kind: 'grass', weight: 2 },
];

const SOUTH_MEADOW = [
  { kind: 'wildflowers', weight: 6 },
  { kind: 'flowers', weight: 6 },
  { kind: 'mushrooms', weight: 4 },
  { kind: 'rock', weight: 4 },
  { kind: 'debris', weight: 4 },
  { kind: 'path', weight: 3 },
  { kind: 'stump', weight: 2 },
  { kind: 'reeds', weight: 3 },
  { kind: 'mound', weight: 3 },
  { kind: 'bush', weight: 2 },
  { kind: 'grass', weight: 2 },
];

const CLUSTER_KINDS = new Set([
  'grass',
  'flowers',
  'wildflowers',
  'mushrooms',
  'debris',
  'reeds',
]);

export function boardHalfExtent(boardSize) {
  return ((boardSize - 1) * TILE_PITCH + TILE_SIZE) / 2;
}

export function slotSeed(boardSize, slotIndex) {
  return (Math.imul(boardSize + 3, 2654435761) ^ Math.imul(slotIndex + 1, 1597334677)) >>> 0;
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickWeighted(rng, table) {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return table[table.length - 1].kind;
}

function pushSlot(slots, kind, x, z, rng, extras = {}) {
  slots.push({
    kind,
    x,
    z,
    rotate: extras.rotate ?? rng() * Math.PI * 2,
    scale: extras.scale ?? (0.8 + rng() * 0.45),
  });
}

function pushCluster(slots, kind, x, z, rng, count) {
  for (let i = 0; i < count; i++) {
    pushSlot(
      slots,
      kind,
      x + (rng() - 0.5) * 0.3,
      z + (rng() - 0.5) * 0.3,
      rng,
      { scale: 0.7 + rng() * 0.45 },
    );
  }
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
  if (boardSize <= 3) return 4;
  if (boardSize <= 4) return 5;
  if (boardSize <= 5) return 6;
  return 7;
}

function eastWestCount(boardSize) {
  if (boardSize <= 3) return 3;
  if (boardSize <= 4) return 4;
  return 5;
}

function meadowScatterCount(boardSize) {
  if (boardSize <= 3) return 28;
  if (boardSize <= 4) return 38;
  if (boardSize <= 5) return 48;
  return 58;
}

function edgeSlots(boardSize, halfExtent) {
  const d = halfExtent + RING.edge;
  const slots = [];
  const span = halfExtent * 0.78;
  const nsCount = northSouthCount(boardSize);
  const rng = seededRng(slotSeed(boardSize, 90));

  for (let side = 0; side < 2; side++) {
    const z = side === 0 ? -d : d;
    for (let i = 0; i < nsCount; i++) {
      const t = nsCount === 1 ? 0 : (i / (nsCount - 1)) * 2 - 1;
      const x = t * span + (side === 0 ? -0.08 : 0.12) * (i % 2 === 0 ? 1 : -1);
      const kind = NORTH_SOUTH_KINDS[(side * nsCount + i) % NORTH_SOUTH_KINDS.length];
      slots.push({ kind, x, z, rotate: false });
    }
  }

  const ewCount = eastWestCount(boardSize);
  for (const x of [-d, d]) {
    for (let i = 0; i < ewCount; i++) {
      const t = ewCount === 1 ? 0 : (i / (ewCount - 1)) * 2 - 1;
      const z = t * span * 0.74 + (i % 2 === 0 ? 0.1 : -0.08);
      slots.push({
        kind: EAST_WEST_KINDS[i % EAST_WEST_KINDS.length],
        x: x + (x > 0 ? 0.05 : -0.05),
        z,
        rotate: true,
      });
    }

    const west = x < 0;
    slots.push({
      kind: west ? 'lantern' : 'fence',
      x: x * 1.12,
      z: west ? -0.38 : 0.32,
      rotate: true,
      scale: 1.08,
    });
    slots.push({
      kind: west ? 'bush' : 'rock',
      x: x * 1.05,
      z: west ? 0.42 : -0.4,
      rotate: true,
      scale: 1.02,
    });
  }

  if (rng() > 0.25) {
    slots.push({
      kind: 'debris',
      x: d * 0.15,
      z: d,
      rotate: rng() * Math.PI * 2,
      scale: 0.9,
    });
  }

  return slots;
}

function meadowSlots(boardSize, halfExtent, side) {
  const north = side === 'north';
  const rng = seededRng(slotSeed(boardSize, north ? 800 : 801));
  const table = north ? NORTH_MEADOW : SOUTH_MEADOW;
  const density = north ? 0.82 : 1.22;
  const count = Math.round(meadowScatterCount(boardSize) * density);
  const slots = [];

  const zSign = north ? -1 : 1;
  const zNear = halfExtent + 0.38;
  const zFar = halfExtent + 3.4 + boardSize * 0.22;
  const xSpan = halfExtent * 1.55;

  if (north) {
    slots.push({
      kind: 'lake',
      x: (rng() - 0.5) * xSpan * 0.35,
      z: zSign * (zNear + 0.7),
      rotate: (rng() - 0.5) * 0.4,
      scale: 1,
    });
    slots.push({
      kind: 'pond',
      x: xSpan * (rng() > 0.5 ? 0.62 : -0.62),
      z: zSign * (zNear + (zFar - zNear) * 0.22),
      rotate: rng() * Math.PI * 2,
      scale: 1.05,
    });
  } else {
    slots.push({
      kind: rng() > 0.45 ? 'statue' : 'stump',
      x: (rng() - 0.5) * xSpan * 0.7,
      z: zSign * (zNear + (zFar - zNear) * 0.2),
      rotate: rng() * Math.PI * 2,
      scale: 1.1 + rng() * 0.2,
    });
    if (rng() > 0.25) {
      slots.push({
        kind: 'pond',
        x: xSpan * (rng() > 0.5 ? 0.55 : -0.55),
        z: zSign * (zNear + (zFar - zNear) * 0.45),
        rotate: rng() * Math.PI * 2,
        scale: 1.08,
      });
    }
  }

  slots.push({
    kind: north ? 'lantern' : 'bush',
    x: (rng() - 0.5) * xSpan * 0.7,
    z: zSign * (zNear + rng() * (zFar - zNear) * 0.4),
    rotate: rng() * Math.PI * 2,
    scale: 1.05 + rng() * 0.2,
  });

  if (north) {
    slots.push({
      kind: 'tree',
      x: (rng() - 0.5) * xSpan * 0.9,
      z: zSign * (zNear + (zFar - zNear) * 0.72),
      rotate: rng() * Math.PI * 2,
      scale: 1.12,
    });
  }

  for (let i = 0; i < count; i++) {
    const layer = north ? Math.sqrt(rng()) : rng() * rng();
    const xBias = north ? -0.12 : 0.16;
    const x = (rng() * 2 - 1 + xBias) * xSpan * (0.5 + rng() * 0.5);
    const z = zSign * (zNear + layer * (zFar - zNear) * (0.6 + rng() * 0.5));
    const kind = pickWeighted(rng, table);

    if (CLUSTER_KINDS.has(kind) && rng() > 0.42) {
      pushCluster(slots, kind, x, z, rng, 3 + Math.floor(rng() * 3));
      continue;
    }

    pushSlot(slots, kind, x, z, rng);
  }

  return slots;
}

export function slotRotationY(slot) {
  if (slot.rotate === true) return Math.PI / 2;
  if (typeof slot.rotate === 'number') return slot.rotate;
  return 0;
}

export function collectBoardScenerySlots(boardSize, halfExtent) {
  const sideLake = {
    kind: 'lake',
    x: -(halfExtent + 1.25),
    z: 0.2,
    rotate: 0.2,
    scale: 0.68,
  };
  return [
    ...cornerSlots(halfExtent),
    ...edgeSlots(boardSize, halfExtent),
    ...meadowSlots(boardSize, halfExtent, 'north'),
    ...meadowSlots(boardSize, halfExtent, 'south'),
    sideLake,
  ];
}

export function isSceneryUniqueKind(kind) {
  return Boolean(UNIQUE_BUILDERS[kind]);
}

export function buildScenerySlotRoot(boardSize, slot, slotIndex) {
  const kind = slot.kind;
  let builder;
  let seed;

  if (isSceneryInstanceKind(kind)) {
    const config = SCENERY_INSTANCE_KINDS[kind];
    const variant = sceneryVariantIndex(slotSeed(boardSize, slotIndex), kind);
    builder = config.builder;
    seed = (variant + 1) * 9973;
  } else {
    builder = UNIQUE_BUILDERS[kind];
    seed = slotSeed(boardSize, slotIndex);
  }

  if (!builder) return null;

  const model = builder(seed);
  if (!model?.root) return null;

  const root = model.root;
  root.position.set(slot.x, SCENERY_BASE_Y, slot.z);
  root.rotation.y += slotRotationY(slot);
  if (slot.scale) root.scale.multiplyScalar(slot.scale);
  return root;
}
