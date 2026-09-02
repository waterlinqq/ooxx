// Attack coverage map.
//
// The old evaluator only had ad-hoc danger terms for archers and bombers, so it happily
// deployed a 3 HP archer next to a 3 ATK swordsman. This builds the real thing: for every
// cell, the strongest single hit the given team could land on a unit standing there.
//
// Reach mirrors js/rules.js exactly:
//   melee  - the four orthogonal neighbours (getAdjacentCells), never the diagonals
//   ranged - eight rays, up to `range` steps, stopping at the first occupied cell
//   mage   - eight rays to the board edge, piercing everything (getEnemiesOnLine ignores
//            both `range` and blockers)
//
// An empty cell counts as covered when a unit standing there *would* be reachable, which
// is why ranged rays mark the blocking cell itself and then stop.
//
// Flying units (canAttackTarget in js/rules.js) can only be hit by ranged and mage, so
// coverage is tracked twice: the plain lanes for grounded units and the flying lanes fed
// only by ranged and mage. That is what makes an eagle correctly unclearable — and its
// line therefore dead — for a team with no ranged or mage left.

const ORTHOGONAL = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const ALL_DIRS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function createMap(cells) {
  return {
    damage: new Int8Array(cells),
    count: new Int8Array(cells),
    pierce: new Int8Array(cells),
    flyingDamage: new Int8Array(cells),
    flyingCount: new Int8Array(cells),
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
  map.flyingDamage.fill(0);
  map.flyingCount.fill(0);
  return map;
}

function mark(map, cell, atk, piercing, canHitFlying = false) {
  if (atk > map.damage[cell]) map.damage[cell] = atk;
  if (map.count[cell] < 127) map.count[cell]++;
  if (piercing) map.pierce[cell] = 1;
  if (canHitFlying) {
    if (atk > map.flyingDamage[cell]) map.flyingDamage[cell] = atk;
    if (map.flyingCount[cell] < 127) map.flyingCount[cell]++;
  }
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

      if (unit.type === 'melee') {
        for (const [dr, dc] of ORTHOGONAL) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          mark(map, nr * size + nc, unit.atk, false);
        }
        continue;
      }

      if (unit.type === 'ranged') {
        const reach = unit.range ?? size;
        for (const [dr, dc] of ALL_DIRS) {
          let nr = r + dr;
          let nc = c + dc;
          for (let step = 0; step < reach; step++) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            const cell = nr * size + nc;
            mark(map, cell, unit.atk, false, true);
            if (board[nr][nc]) break;
            nr += dr;
            nc += dc;
          }
        }
        continue;
      }

      if (unit.type === 'mage') {
        for (const [dr, dc] of ALL_DIRS) {
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            mark(map, nr * size + nc, unit.atk, true, true);
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
export function isLethalAt(map, cell, hp, isFlying = false) {
  const count = isFlying ? map.flyingCount : map.count;
  const damage = isFlying ? map.flyingDamage : map.damage;
  return count[cell] > 0 && hp <= damage[cell];
}

export function coverageAt(map, cell, isFlying = false) {
  return (isFlying ? map.flyingCount : map.count)[cell];
}

export function damageAt(map, cell, isFlying = false) {
  return (isFlying ? map.flyingDamage : map.damage)[cell];
}
