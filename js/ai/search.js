// Alpha-beta negamax over individual actions.
//
// A turn is several actions by the same side, so plies alternate sides only when the
// action budget runs out: after makeAction, if the mover is unchanged we recurse as a max
// node with the same window, otherwise we negate. Counting depth in *actions* means a
// depth-4 search on a 2-action board already covers a full exchange, which is what lets
// two-action wins and two-action defences (kill the blocker, then refill the cell) be
// found by search instead of by the special-case branches the old AI needed.
import {
  createSearchContext,
  makeAction,
  unmakeAction,
  passTurn,
  unpassTurn,
  hashKey,
  currentSeat,
  enemyOf,
} from './board.js';
import { evaluate, terminalScore, materialValue, getCellWeights, WIN_SCORE } from './evaluate.js';
import { buildThreatMap, isLethalAt } from './threat.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidBlessTargets,
  getValidDeployCells,
  getEnemiesOnLine,
  getTowerTargets,
} from '../rules.js';

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;

// Branching is wide (a 4x4 opening has ~100 distinct actions), so deeper plies only look
// at the best-ordered candidates. The root is never truncated.
const CANDIDATE_CAP = [Infinity, 36, 26, 20, 16, 14, 12, 10];

const TT_LIMIT = 300000;

const DIFFICULTY = {
  easy: { maxDepth: 2, timeFactor: 0.15, noise: 160 },
  normal: { maxDepth: 4, timeFactor: 0.5, noise: 35 },
  hard: { maxDepth: 10, timeFactor: 1, noise: 0 },
};

// Per-decision budget by board size, in ms. The search runs synchronously on the main
// thread, so these double as the ceiling on how long the UI can stall for one AI action.
const TIME_BUDGET_MS = { 3: 120, 4: 400, 5: 600 };

class SearchAbort extends Error {}

function capForPly(ply) {
  return ply < CANDIDATE_CAP.length ? CANDIDATE_CAP[ply] : CANDIDATE_CAP[CANDIDATE_CAP.length - 1];
}

function ownedByCurrentSeat(unit, seat) {
  return seat == null || unit.ownerSeat == null || unit.ownerSeat === seat;
}

/**
 * All legal actions for whoever is on the move.
 *
 * Reserve units of the same class are interchangeable — they are always at full hp — so
 * only one representative per class is expanded. On a 4x4 opening that removes 64 of 160
 * candidates without losing a single distinct position.
 */
function generateActions(ctx) {
  const team = ctx.turn;
  const seat = currentSeat(ctx);
  const actions = [];

  const reserve = ctx.reserves[team];
  if (reserve.length > 0) {
    const deployCells = getValidDeployCells(ctx.board);
    if (deployCells.length > 0) {
      const seenClasses = new Set();
      for (const unit of reserve) {
        if (!ownedByCurrentSeat(unit, seat)) continue;
        if (seenClasses.has(unit.classId)) continue;
        seenClasses.add(unit.classId);
        for (const [row, col] of deployCells) {
          actions.push({ type: 'deploy', unitId: unit.id, row, col });
        }
      }
    }
  }

  const { board, size } = ctx;
  for (let r = 0; r < size; r++) {
    const boardRow = board[r];
    for (let c = 0; c < size; c++) {
      const unit = boardRow[c];
      if (!unit || unit.team !== team) continue;
      if (ctx.acted.has(unit.searchIndex)) continue;
      if (!ownedByCurrentSeat(unit, seat)) continue;

      for (const [row, col] of getValidMoves(board, unit)) {
        actions.push({ type: 'move', unitId: unit.id, row, col });
      }
      const attackTargets = getValidAttackTargets(board, unit);
      // Every tower target triggers the same four-way volley, so one search action is enough.
      const uniqueAttackTargets = unit.type === 'tower'
        ? attackTargets.slice(0, 1)
        : attackTargets;
      for (const target of uniqueAttackTargets) {
        actions.push({ type: 'attack', unitId: unit.id, targetId: target.id });
      }
      for (const target of getValidBlessTargets(board, unit)) {
        actions.push({ type: 'bless', unitId: unit.id, targetId: target.id });
      }
    }
  }

  return actions;
}

function sameAction(a, b) {
  if (!a || !b || a.type !== b.type || a.unitId !== b.unitId) return false;
  if (a.type === 'attack' || a.type === 'bless') return a.targetId === b.targetId;
  return a.row === b.row && a.col === b.col;
}

function scoreAttackOrder(ctx, action, team) {
  const attacker = ctx.unitsById.get(action.unitId);
  const target = ctx.unitsById.get(action.targetId);
  if (!attacker || !target) return -Infinity;

  let score = 500;
  let hits;
  if (attacker.type === 'mage') {
    hits = getEnemiesOnLine(ctx.board, attacker, target.row, target.col);
  } else if (attacker.type === 'tower') {
    hits = getTowerTargets(ctx.board, attacker);
  } else {
    hits = [target];
  }

  for (const hit of hits) {
    if (hit.hp <= attacker.atk) {
      score += 320 + materialValue(hit);
      // Killing a blocker on a line we have otherwise filled empties the cell we need.
      const cell = hit.row * ctx.size + hit.col;
      for (const lineIdx of ctx.linesByCell[cell]) {
        if (ctx.lineCount[team][lineIdx] === ctx.winLength - 1) score += 900;
      }
    } else {
      score += attacker.atk * 8;
    }
  }

  return score;
}

function scoreBlessOrder(ctx, action) {
  const target = ctx.unitsById.get(action.targetId);
  if (!target) return -Infinity;
  const healing = target.hp < target.maxHp ? 60 : 0;
  return 180 + healing + target.atk * 4;
}

function scorePlacementOrder(ctx, action, team, hostile, unit, weights) {
  const enemy = enemyOf(team);
  const cell = action.row * ctx.size + action.col;
  let score = 0;

  for (const lineIdx of ctx.linesByCell[cell]) {
    const mine = ctx.lineCount[team][lineIdx];
    const theirs = ctx.lineCount[enemy][lineIdx];
    if (theirs === 0 && mine === ctx.winLength - 1) score += 4000;
    else if (mine === 0 && theirs === ctx.winLength - 1) score += 1500;
    else if (theirs === 0) score += mine * 30;
  }

  if (action.type === 'move') {
    // Leaving a line we were building on has a real cost the destination must justify.
    const from = unit.row * ctx.size + unit.col;
    for (const lineIdx of ctx.linesByCell[from]) {
      if (ctx.lineCount[enemy][lineIdx] === 0 && ctx.lineCount[team][lineIdx] >= 2) {
        score -= ctx.lineCount[team][lineIdx] * 25;
      }
    }
  }

  score += weights[cell] * 4;
  // Landing somewhere the opponent can kill outright is almost never worth it. The leaf
  // evaluation is what confirms that; this only keeps such moves from filling the
  // candidate cap ahead of better ones.
  if (isLethalAt(hostile, cell, unit.hp, unit.isFlying)) {
    score -= 300 + materialValue(unit);
  }

  return score;
}

function orderActions(ctx, actions, ttAction, ply) {
  const team = ctx.turn;
  const hostile = buildThreatMap(ctx, enemyOf(team));
  const weights = getCellWeights(ctx.size);
  const scored = new Array(actions.length);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let score;
    if (action.type === 'attack') {
      score = scoreAttackOrder(ctx, action, team);
    } else if (action.type === 'bless') {
      score = scoreBlessOrder(ctx, action);
    } else {
      const unit = ctx.unitsById.get(action.unitId);
      score = scorePlacementOrder(ctx, action, team, hostile, unit, weights);
    }
    if (ttAction && sameAction(action, ttAction)) score = Infinity;
    scored[i] = { action, score };
  }

  scored.sort((a, b) => b.score - a.score);

  const cap = capForPly(ply);
  const limit = Math.min(scored.length, cap === Infinity ? scored.length : cap);
  const ordered = new Array(limit);
  for (let i = 0; i < limit; i++) ordered[i] = scored[i].action;
  return ordered;
}

function ttMove(action) {
  return {
    type: action.type,
    unitId: action.unitId,
    row: action.row,
    col: action.col,
    targetId: action.targetId,
  };
}

function negamax(engine, depth, ply, alphaIn, beta) {
  const { ctx } = engine;
  let alpha = alphaIn;

  engine.nodes++;
  if ((engine.nodes & 255) === 0 && performance.now() > engine.deadline) throw engine.abort;

  const terminal = terminalScore(ctx, ctx.turn);
  if (terminal !== null) {
    // Prefer the fastest win and the slowest loss.
    if (terminal > 0) return WIN_SCORE - ply;
    if (terminal < 0) return -WIN_SCORE + ply;
    return 0;
  }
  if (depth <= 0) return evaluate(ctx, ctx.turn);

  const key = hashKey(ctx);
  const entry = engine.tt.get(key);
  let ttAction = null;
  if (entry) {
    ttAction = entry.action;
    if (entry.depth >= depth) {
      if (entry.flag === EXACT) return entry.score;
      if (entry.flag === LOWER && entry.score >= beta) return entry.score;
      if (entry.flag === UPPER && entry.score <= alpha) return entry.score;
    }
  }

  const actions = generateActions(ctx);
  if (actions.length === 0) {
    // js/game.js hands the turn over when a side cannot use its remaining actions.
    const undo = passTurn(ctx);
    const score = -negamax(engine, depth - 1, ply + 1, -beta, -alpha);
    unpassTurn(ctx, undo);
    return score;
  }

  const ordered = orderActions(ctx, actions, ttAction, ply);
  let bestScore = -Infinity;
  let bestAction = ordered[0];

  for (const action of ordered) {
    const undo = makeAction(ctx, action);
    const sameSide = ctx.turn === undo.turn;
    const score = sameSide
      ? negamax(engine, depth - 1, ply + 1, alpha, beta)
      : -negamax(engine, depth - 1, ply + 1, -beta, -alpha);
    unmakeAction(ctx, undo);

    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) break;
  }

  if (engine.tt.size < TT_LIMIT) {
    const flag = bestScore <= alphaIn ? UPPER : (bestScore >= beta ? LOWER : EXACT);
    engine.tt.set(key, { depth, score: bestScore, flag, action: ttMove(bestAction) });
  }

  return bestScore;
}

function searchRoot(engine, rootActions, depth) {
  const { ctx } = engine;
  const results = [];
  let best = -Infinity;

  for (const action of rootActions) {
    const undo = makeAction(ctx, action);
    const sameSide = ctx.turn === undo.turn;
    // One point below the incumbent, so a move that merely *ties* still returns its exact
    // score rather than failing low. Randomised tie-breaking needs that distinction.
    const alpha = best === -Infinity ? -Infinity : best - 1;
    const score = sameSide
      ? negamax(engine, depth - 1, 1, alpha, Infinity)
      : -negamax(engine, depth - 1, 1, -Infinity, -alpha);
    unmakeAction(ctx, undo);

    results.push({ action, score });
    if (score > best) best = score;
  }

  return results;
}

function pickResult(results, noise, rng) {
  let best = -Infinity;
  for (const result of results) {
    if (result.score > best) best = result.score;
  }

  // Never randomise away a forced win or a forced loss.
  const decisive = Math.abs(best) > WIN_SCORE - 1000;
  const tolerance = decisive ? 0 : noise;
  const pool = results.filter((r) => r.score >= best - tolerance);
  if (pool.length === 1 || !rng) return pool[0];
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/**
 * Picks an action for `options.team`.
 *
 * @param {object} state public game state (board, reserves, actedUnitIds)
 * @param {object} options team, ownerSeat, actionsPerTurn, difficulty, rng, timeBudgetMs
 * @returns {object|null} an action in the `{type, unitId, row?, col?, targetId?}` shape
 */
export function searchBestAction(state, options) {
  const {
    team,
    ownerSeat = null,
    actionsPerTurn = 2,
    difficulty = 'hard',
    rng = null,
    timeBudgetMs = null,
  } = options;

  const ctx = createSearchContext(state, { team, actionsPerTurn, ownerSeat });
  const preset = DIFFICULTY[difficulty] ?? DIFFICULTY.hard;
  const budget = timeBudgetMs
    ?? Math.round((TIME_BUDGET_MS[ctx.size] ?? 450) * preset.timeFactor);

  const engine = {
    ctx,
    tt: new Map(),
    nodes: 0,
    deadline: performance.now() + budget,
    abort: new SearchAbort(),
  };

  const initial = generateActions(ctx);
  if (initial.length === 0) return null;
  if (initial.length === 1) return initial[0];

  let rootActions = orderActions(ctx, initial, null, 0);
  let bestResults = null;

  for (let depth = 1; depth <= preset.maxDepth; depth++) {
    let results;
    try {
      results = searchRoot(engine, rootActions, depth);
    } catch (error) {
      if (error !== engine.abort) throw error;
      break;
    }

    bestResults = results;
    rootActions = [...results].sort((a, b) => b.score - a.score).map((r) => r.action);

    const best = Math.max(...results.map((r) => r.score));
    // A proven win or loss will not change by looking further.
    if (Math.abs(best) > WIN_SCORE - 1000) break;
    if (performance.now() > engine.deadline) break;
  }

  if (!bestResults) return rootActions[0];
  return pickResult(bestResults, preset.noise, rng).action;
}
