// Static evaluation, always from the perspective of one team and strictly zero-sum:
// evaluate(ctx, 'red') === -evaluate(ctx, 'blue') for the same position.
//
// The old evaluator scored *actions* with a pile of per-class heuristics computed on the
// pre-action board. This scores *positions* only, so effects that used to need bespoke
// handling — bomber blast losses, vacating a line, a move opening a firing lane — now fall
// out of the resulting board for free.
import { enemyOf, hasCompletedLine, isEliminated, getWinLinesForSize } from './board.js';
import { buildThreatMap, isLethalAt, coverageAt, damageAt } from './threat.js';

export const WIN_SCORE = 1000000;

const HP_WEIGHT = 6;
const ATK_WEIGHT = 10;
// Small per-class adjustments for utility that hp/atk alone miss.
const CLASS_BONUS = {
  shield: 6,
  swordsman: 0,
  archer: 8,
  tower: 6,
  mage: 10,
  assassin: 6,
  bomber: 6,
  eagle: 8,
  priest: 8,
};

// A reserve unit is real material but contributes nothing to lines until it lands.
const RESERVE_FRACTION = 0.8;

const POSITION_WEIGHT = 3;

// Fraction of a unit's value written off when the opponent can kill it in one hit, and
// the discount applied when its own side moves next and can answer the threat.
const LETHAL_FRACTION = 0.55;
const OWN_TURN_DISCOUNT = 0.45;
const CHIP_WEIGHT = 3;

// Value of a line by how many actions the owner still needs to complete it. Index 0 is
// unused: a zero-cost line is already a win and handled as terminal.
const COST_VALUE = [0, 300, 150, 60, 25, 10, 4, 2];
// Lines completable inside a single turn deserve extra weight.
const URGENT_MULTIPLIER = 1.6;
const TEMPO_MULTIPLIER = 1.25;
// Two separate one-action wins cannot both be answered by one block.
const FORK_BONUS = 520;
const ELIMINATION_STEP = 120;
const ELIMINATION_THRESHOLD = 3;

const UNREACHABLE = 99;

const layoutCache = new Map();

/**
 * Per-cell positional weight and a flat cell -> [row, col] table.
 *
 * Centrality is derived from how many win lines pass through a cell, which stays
 * symmetric on even boards — the old `row === center && col === center` test only ever
 * rewarded one of the four middle cells of a 4x4.
 */
function getLayout(size) {
  let layout = layoutCache.get(size);
  if (layout) return layout;

  const { linesByCell } = getWinLinesForSize(size);
  const cells = size * size;
  const coords = new Array(cells);
  const weight = new Int16Array(cells);
  const mid = (size - 1) / 2;
  const maxDist = Math.floor(mid) * 2;

  for (let cell = 0; cell < cells; cell++) {
    const row = Math.floor(cell / size);
    const col = cell % size;
    coords[cell] = [row, col];
    const dist = Math.abs(row - mid) + Math.abs(col - mid);
    weight[cell] = linesByCell[cell].length * 3 + Math.max(0, maxDist - dist);
  }

  layout = { coords, weight };
  layoutCache.set(size, layout);
  return layout;
}

/** Positional weight per cell, shared with the search's move ordering. */
export function getCellWeights(size) {
  return getLayout(size).weight;
}

export function materialValue(unit) {
  return unit.hp * HP_WEIGHT + unit.atk * ATK_WEIGHT + (CLASS_BONUS[unit.classId] ?? 0);
}

function fullMaterialValue(unit) {
  return unit.maxHp * HP_WEIGHT + unit.atk * ATK_WEIGHT + (CLASS_BONUS[unit.classId] ?? 0);
}

function costValue(cost) {
  if (cost >= COST_VALUE.length) return 1;
  return COST_VALUE[cost];
}

/** Actions needed to remove a blocker, given the strongest hit available against it. */
function clearCost(hp, damage) {
  if (damage <= 0) return UNREACHABLE;
  return Math.ceil(hp / damage);
}

/**
 * Cost, in actions, for each side to complete every win line, plus the fork check.
 *
 * A line held by the opponent is not automatically dead: this is a game where attacking
 * empties a cell, so "kill the blocker, then refill it" is a real two-action win. Costing
 * the blockers by how hard they actually are to remove is what lets the evaluation see
 * that, instead of writing the line off the moment any friendly unit stands on it.
 */
function scoreLines(ctx, team, myThreat, theirThreat) {
  const { lines, board, size, actionsPerTurn } = ctx;
  const { coords } = getLayout(size);
  const enemy = enemyOf(team);
  let score = 0;
  let myWinCells = null;
  let theirWinCells = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let mine = 0;
    let theirs = 0;
    let empty = 0;
    let myClearCost = 0;
    let theirClearCost = 0;
    let lastEmptyCell = -1;

    for (let j = 0; j < line.length; j++) {
      const cell = line[j];
      const [row, col] = coords[cell];
      const unit = board[row][col];
      if (!unit) {
        empty++;
        lastEmptyCell = cell;
      } else if (unit.team === team) {
        mine++;
        theirClearCost += clearCost(unit.hp, damageAt(theirThreat, cell, unit.isFlying));
      } else {
        theirs++;
        myClearCost += clearCost(unit.hp, damageAt(myThreat, cell, unit.isFlying));
      }
    }

    const myCost = empty + myClearCost;
    const theirCost = empty + theirClearCost;

    if (myCost > 0 && myCost < UNREACHABLE) {
      let value = costValue(myCost);
      if (myCost <= actionsPerTurn) value *= URGENT_MULTIPLIER;
      if (ctx.turn === team) value *= TEMPO_MULTIPLIER;
      score += value;
      if (myCost === 1 && theirs === 0 && lastEmptyCell >= 0) {
        (myWinCells ??= new Set()).add(lastEmptyCell);
      }
    }

    if (theirCost > 0 && theirCost < UNREACHABLE) {
      let value = costValue(theirCost);
      if (theirCost <= actionsPerTurn) value *= URGENT_MULTIPLIER;
      if (ctx.turn === enemy) value *= TEMPO_MULTIPLIER;
      score -= value;
      if (theirCost === 1 && mine === 0 && lastEmptyCell >= 0) {
        (theirWinCells ??= new Set()).add(lastEmptyCell);
      }
    }
  }

  if (myWinCells && myWinCells.size >= 2) score += FORK_BONUS;
  if (theirWinCells && theirWinCells.size >= 2) score -= FORK_BONUS;

  return score;
}

function scoreUnits(ctx, team, myThreat, theirThreat) {
  const { board, size } = ctx;
  const { weight } = getLayout(size);
  let score = 0;

  for (let row = 0; row < size; row++) {
    const boardRow = board[row];
    for (let col = 0; col < size; col++) {
      const unit = boardRow[col];
      if (!unit) continue;

      const cell = row * size + col;
      const own = unit.team === team;
      const sign = own ? 1 : -1;
      const value = materialValue(unit);

      let contribution = value + weight[cell] * POSITION_WEIGHT;

      const hostile = own ? theirThreat : myThreat;
      if (isLethalAt(hostile, cell, unit.hp, unit.isFlying)) {
        // Its own side moving next can retreat, block, or trade first.
        const discount = ctx.turn === unit.team ? OWN_TURN_DISCOUNT : 1;
        contribution -= value * LETHAL_FRACTION * discount;
      } else if (coverageAt(hostile, cell, unit.isFlying) > 0) {
        contribution -= damageAt(hostile, cell, unit.isFlying) * CHIP_WEIGHT;
      }

      score += sign * contribution;
    }
  }

  return score;
}

function scoreReserves(ctx, team) {
  let score = 0;
  for (const unit of ctx.reserves[team]) {
    score += fullMaterialValue(unit) * RESERVE_FRACTION;
  }
  for (const unit of ctx.reserves[enemyOf(team)]) {
    score -= fullMaterialValue(unit) * RESERVE_FRACTION;
  }
  return score;
}

function scoreElimination(ctx, team) {
  const enemy = enemyOf(team);
  const mine = ctx.onBoard[team] + ctx.reserves[team].length;
  const theirs = ctx.onBoard[enemy] + ctx.reserves[enemy].length;
  let score = 0;
  if (theirs <= ELIMINATION_THRESHOLD) score += (ELIMINATION_THRESHOLD + 1 - theirs) * ELIMINATION_STEP;
  if (mine <= ELIMINATION_THRESHOLD) score -= (ELIMINATION_THRESHOLD + 1 - mine) * ELIMINATION_STEP;
  return score;
}

/**
 * Terminal check shared by the search so both agree on what counts as decided.
 * Returns WIN_SCORE, -WIN_SCORE, 0 for a genuine tie, or null when play continues.
 */
export function terminalScore(ctx, team) {
  const enemy = enemyOf(team);
  const teamWon = hasCompletedLine(ctx, team) || isEliminated(ctx, enemy);
  const enemyWon = hasCompletedLine(ctx, enemy) || isEliminated(ctx, team);

  if (teamWon && enemyWon) {
    // Reachable: killing the opponent's last unit can be a bomber whose blast takes our
    // last unit with it. js/game.js checks the acting team's win first, so they take it.
    if (ctx.lastMover === team) return WIN_SCORE;
    if (ctx.lastMover === enemy) return -WIN_SCORE;
    return 0;
  }
  if (teamWon) return WIN_SCORE;
  if (enemyWon) return -WIN_SCORE;
  return null;
}

export function evaluate(ctx, team) {
  const terminal = terminalScore(ctx, team);
  if (terminal !== null) return terminal;

  const myThreat = buildThreatMap(ctx, team);
  const theirThreat = buildThreatMap(ctx, enemyOf(team));

  return Math.round(
    scoreUnits(ctx, team, myThreat, theirThreat)
    + scoreReserves(ctx, team)
    + scoreLines(ctx, team, myThreat, theirThreat)
    + scoreElimination(ctx, team),
  );
}
