import { CLASSES } from '../units.js';

// Attack coverage map.
//
// The old evaluator only had ad-hoc danger terms for archers and bombers, so it happily
// deployed a 3 HP archer next to a 3 ATK swordsman. This builds the real thing: for every
// cell, the strongest single hit the given team could land on a unit standing there.
//
// Reach mirrors js/rules.js exactly:
//   melee/support - four neighbouring cells (diagonalOnly: four diagonal cells)
//   ranged - four rays, up to `range` steps, stopping at the first occupied cell
//   artillery - four orthogonal cells exactly two steps away (no melee on adjacent cells)
//   tower  - four orthogonal rays, up to `range` steps, stopping at the first occupied cell
//   mage   - four rays to the board edge, piercing everything (getEnemiesOnLine ignores
//            both `range` and blockers)
//
// An empty cell counts as covered when a unit standing there *would* be reachable, which
// is why ranged rays mark the blocking cell itself and then stop.
//
const ALL_DIRS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const ORTHOGONAL_DIRS = ALL_DIRS.slice(0, 4);
const DIAGONAL_DIRS = ALL_DIRS.slice(4);

function createMap(cells) {
  return {
    damage: new Int8Array(cells),
    count: new Int8Array(cells),
    pierce: new Int8Array(cells),
  };
}

/** Scratch maps live on the context: evaluation is not reentrant, so two suffice. */
function getScratch(ctx, team) {
  ctx.threatMaps ??= {};
  let map = ctx.threatMaps[team];
  if (!map) {
    map = createMap(ctx.size * ctx.size);
    ctx.threatMaps[team] = map;
  }
  map.damage.fill(0);
  map.count.fill(0);
  map.pierce.fill(0);
  return map;
}

function mark(map, cell, atk, piercing) {
  if (atk > map.damage[cell]) map.damage[cell] = atk;
  if (map.count[cell] < 127) map.count[cell]++;
  if (piercing) map.pierce[cell] = 1;
}

/**
 * Coverage that `attackerTeam` currently projects onto every cell of the board.
 * The returned object is scratch memory owned by `ctx` and is overwritten by the next
 * call for the same team.
 */
export function buildThreatMap(ctx, attackerTeam) {
  const { board, size } = ctx;
  const map = getScratch(ctx, attackerTeam);

  for (let r = 0; r < size; r++) {
    const row = board[r];
    for (let c = 0; c < size; c++) {
      const unit = row[c];
      if (!unit || unit.team !== attackerTeam) continue;

      if (unit.type === 'melee' || unit.type === 'support') {
        const dirs = (unit.diagonalOnly ?? CLASSES[unit.classId]?.diagonalOnly)
          ? DIAGONAL_DIRS
          : ORTHOGONAL_DIRS;
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          mark(map, nr * size + nc, unit.atk, false);
        }
        continue;
      }

      if (unit.type === 'ranged' || unit.type === 'tower') {
        const reach = unit.range ?? size;
        const directions = ORTHOGONAL_DIRS;
        for (const [dr, dc] of directions) {
          let nr = r + dr;
          let nc = c + dc;
          for (let step = 0; step < reach; step++) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            const cell = nr * size + nc;
            mark(map, cell, unit.atk, false);
            if (board[nr][nc]) break;
            nr += dr;
            nc += dc;
          }
        }
        continue;
      }

      if (unit.type === 'artillery') {
        for (const [dr, dc] of ORTHOGONAL_DIRS) {
          const nr = r + dr * 2;
          const nc = c + dc * 2;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          mark(map, nr * size + nc, unit.atk, false);
        }
        continue;
      }

      if (unit.type === 'mage') {
        for (const [dr, dc] of ORTHOGONAL_DIRS) {
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            mark(map, nr * size + nc, unit.atk, true);
            nr += dr;
            nc += dc;
          }
        }
      }
    }
  }

  return map;
}

/** Would a unit of this profile die to the single strongest hit aimed at that cell? */
export function isLethalAt(map, cell, hp) {
  return map.count[cell] > 0 && hp <= map.damage[cell];
}

export function coverageAt(map, cell) {
  return map.count[cell];
}

export function damageAt(map, cell) {
  return map.damage[cell];
}
