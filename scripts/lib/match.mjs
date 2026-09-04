// Shared AI-vs-AI match runner. Mirrors the turn bookkeeping in js/game.js so
// simulations and arena runs measure the same game the player actually sees.
import {
  createUnit,
  createEmptyBoard,
} from '../../js/units.js';
import {
  applyDeploy,
  applyMove,
  applyAttack,
  applyTeamPriestBlessings,
  checkWin,
  isTeamEliminated,
  getValidDeployCells,
  getValidMoves,
  getValidAttackTargets,
} from '../../js/rules.js';
import { generateMapProps, resolveMapPropOnEnter } from '../../js/mapProps.js';
import { isObstacleCell } from '../../js/mapPropUtils.js';

export const MAX_TURNS = 800;

/** Deterministic 32-bit PRNG so a seed reproduces an entire batch of matches. */
export function createRng(seed = 1) {
  let state = (seed | 0) || 1;
  return function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return ((state >>> 0) % 0x100000000) / 0x100000000;
  };
}

export function createSimUnit(classId, teamId, counter) {
  const unit = createUnit(classId, teamId);
  unit.id = `${teamId}-${classId}-${counter}`;
  return unit;
}

export function createSimReserve(roster, teamId, counterStart) {
  return roster.map((classId, index) =>
    createSimUnit(classId, teamId, counterStart + index)
  );
}

export function hasValidActions(board, reserve, team, actedUnitIds, mapProps = null) {
  if (getValidDeployCells(board, mapProps).length > 0 && reserve.length > 0) return true;

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;
      if (getValidMoves(board, unit, mapProps).length > 0) return true;
      if (getValidAttackTargets(board, unit).length > 0) return true;
    }
  }
  return false;
}

/** Can any enemy unit kill `unit` outright with a single attack right now? */
export function isImmediatelyKillable(board, unit) {
  for (const row of board) {
    for (const other of row) {
      if (!other || other.team === unit.team) continue;
      if (unit.hp > other.atk) continue;
      for (const target of getValidAttackTargets(board, other)) {
        if (target.id === unit.id) return true;
      }
    }
  }
  return false;
}

function serializeAction(action, board, reserves) {
  const allUnits = [...board.flat().filter(Boolean), ...reserves.blue, ...reserves.red];
  const byId = new Map(allUnits.map((u) => [u.id, u]));

  if (action.type === 'deploy') {
    const unit = byId.get(action.unitId);
    return {
      type: 'deploy',
      classId: unit?.classId ?? null,
      row: action.row,
      col: action.col,
    };
  }

  if (action.type === 'move') {
    const unit = byId.get(action.unitId);
    return {
      type: 'move',
      classId: unit?.classId ?? null,
      from: unit ? { row: unit.row, col: unit.col } : null,
      to: { row: action.row, col: action.col },
    };
  }

  if (action.type === 'attack') {
    const unit = byId.get(action.unitId);
    const target = byId.get(action.targetId);
    return {
      type: 'attack',
      classId: unit?.classId ?? null,
      targetClassId: target?.classId ?? null,
      from: unit ? { row: unit.row, col: unit.col } : null,
      target: target ? { row: target.row, col: target.col } : null,
    };
  }

  return action;
}

function triggerPassiveBlessings(state, team, excludePriestIds = []) {
  const blessing = applyTeamPriestBlessings(state.board, team, excludePriestIds);
  state.board = blessing.board;
}

function triggerMapPropAfterLanding(state, row, col, unitId) {
  const result = resolveMapPropOnEnter(state.board, state.mapProps, row, col, unitId);
  state.board = result.board;
  state.mapProps = result.mapProps;
}

function applyAiAction(state, action, team) {
  if (
    (action.type === 'deploy' || action.type === 'move')
    && isObstacleCell(state.mapProps, action.row, action.col)
  ) {
    return { label: 'blocked', detail: null, skipped: true };
  }

  const reserves = { blue: state.blueReserve, red: state.redReserve };
  const detail = serializeAction(action, state.board, reserves);

  if (action.type === 'deploy') {
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;
    const unit = reserve.find((u) => u.id === action.unitId);
    state.board = applyDeploy(state.board, unit, action.row, action.col).board;
    if (team === 'blue') state.blueReserve = state.blueReserve.filter((u) => u.id !== unit.id);
    else state.redReserve = state.redReserve.filter((u) => u.id !== unit.id);
    triggerMapPropAfterLanding(state, action.row, action.col, unit.id);
    triggerPassiveBlessings(state, team, unit.passiveBlessing ? [unit.id] : []);
    return { label: 'deploy', detail, landedAt: { row: action.row, col: action.col } };
  }

  if (action.type === 'move') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    state.board = applyMove(state.board, unit, action.row, action.col).board;
    triggerMapPropAfterLanding(state, action.row, action.col, action.unitId);
    triggerPassiveBlessings(state, team);
    return { label: 'move', detail, landedAt: { row: action.row, col: action.col } };
  }

  if (action.type === 'attack') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    const target = state.board.flat().find((u) => u?.id === action.targetId);
    const result = applyAttack(state.board, unit, target);
    state.board = result.board;
    triggerPassiveBlessings(state, team);
    return {
      label: 'attack',
      detail,
      kills: result.killed.length,
      selfLosses: result.explosionKilled?.length ?? 0,
    };
  }

  return null;
}

function checkRoundEnd(state, actingTeam) {
  const enemy = actingTeam === 'blue' ? 'red' : 'blue';
  const enemyReserve = enemy === 'blue' ? state.blueReserve : state.redReserve;
  const winLine = checkWin(state.board, actingTeam, state.mapProps);

  if (winLine) return { winner: actingTeam, reason: 'line', winLine };
  if (isTeamEliminated(state.board, enemy, enemyReserve)) {
    return { winner: actingTeam, reason: 'elimination', winLine: null };
  }
  return null;
}

function createStats() {
  return {
    blue: { decisions: 0, timeMs: 0, maxTimeMs: 0, placements: 0, exposedPlacements: 0, kills: 0, selfLosses: 0 },
    red: { decisions: 0, timeMs: 0, maxTimeMs: 0, placements: 0, exposedPlacements: 0, kills: 0, selfLosses: 0 },
  };
}

/**
 * Plays one round to completion.
 *
 * `agents` maps each team to `{ choose, options }`, where `choose` has the
 * `chooseAiAction(state, options)` signature.
 */
export function runMatch({
  mode,
  round = 1,
  firstPlayer = 'blue',
  unitCounterStart = 0,
  agents,
  rosters = null,
  maxTurns = MAX_TURNS,
  recordMoves = true,
  mapPropRng = null,
}) {
  const { size, actionsPerTurn } = mode;
  const blueRoster = rosters?.blue ?? mode.roster;
  const redRoster = rosters?.red ?? mode.roster;
  let unitCounter = unitCounterStart;
  const propRng = mapPropRng ?? createRng(unitCounterStart + size * 7919);

  const state = {
    board: createEmptyBoard(size),
    mapProps: generateMapProps(size, propRng),
    blueReserve: createSimReserve(blueRoster, 'blue', unitCounter),
    redReserve: createSimReserve(redRoster, 'red', unitCounter + blueRoster.length),
    currentPlayer: firstPlayer,
    actionsRemaining: actionsPerTurn,
    actedUnitIds: new Set(),
  };
  unitCounter += blueRoster.length + redRoster.length;

  const moves = [];
  const stats = createStats();
  let turn = 1;
  let moveCount = 0;

  const finish = (winner, reason, winLine) => ({
    round,
    firstPlayer,
    rosters: { blue: blueRoster, red: redRoster },
    winner,
    reason,
    winLine,
    totalTurns: turn,
    totalMoves: moveCount,
    moves,
    stats,
    unitCounterEnd: unitCounter,
  });

  while (turn <= maxTurns) {
    const team = state.currentPlayer;
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;

    if (!hasValidActions(state.board, reserve, team, state.actedUnitIds, state.mapProps)) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const agent = agents[team];
    const started = performance.now();
    const action = agent.choose(
      {
        board: state.board,
        mapProps: state.mapProps,
        blueReserve: state.blueReserve,
        redReserve: state.redReserve,
        actedUnitIds: state.actedUnitIds,
      },
      {
        ...agent.options,
        team,
        actionsPerTurn,
        rosters: { blue: blueRoster, red: redRoster },
      },
    );
    const elapsed = performance.now() - started;

    const teamStats = stats[team];
    teamStats.decisions++;
    teamStats.timeMs += elapsed;
    teamStats.maxTimeMs = Math.max(teamStats.maxTimeMs, elapsed);

    if (!action) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const { landedAt, ...applied } = applyAiAction(state, action, team);
    if (applied.skipped) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }
    state.actedUnitIds.add(action.unitId);
    state.actionsRemaining--;

    teamStats.kills += applied.kills ?? 0;
    teamStats.selfLosses += applied.selfLosses ?? 0;
    if (landedAt) {
      const landed = state.board[landedAt.row][landedAt.col];
      if (landed) {
        teamStats.placements++;
        if (isImmediatelyKillable(state.board, landed)) teamStats.exposedPlacements++;
      }
    }

    moveCount++;
    if (recordMoves) {
      moves.push({
        turn,
        team,
        actionRemainingAfter: state.actionsRemaining,
        ...applied,
      });
    }

    const end = checkRoundEnd(state, team);
    if (end) return finish(end.winner, end.reason, end.winLine);

    const exhausted = state.actionsRemaining <= 0
      || !hasValidActions(state.board, reserve, team, state.actedUnitIds, state.mapProps);
    if (exhausted) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
    }
  }

  return finish(null, 'turn_limit', null);
}
