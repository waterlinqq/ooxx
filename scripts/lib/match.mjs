// Shared AI-vs-AI match runner. Mirrors the turn/slot bookkeeping in js/game.js so
// simulations and arena runs measure the same game the player actually sees.
import {
  SLOT_ORDER,
  createUnit,
  createEmptyBoard,
  parseSlot,
} from '../../js/units.js';
import {
  applyDeploy,
  applyMove,
  applyAttack,
  checkWin,
  isTeamEliminated,
  getValidDeployCells,
  getValidMoves,
  getValidAttackTargets,
} from '../../js/rules.js';

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

export function createSimUnit(classId, teamId, counter, ownerSeat = null) {
  const unit = createUnit(classId, teamId, ownerSeat);
  unit.id = `${teamId}-${classId}-${counter}`;
  return unit;
}

// Mirrors createTeamReserve's alternating seat split so simulations match live matches.
export function createSimReserve(roster, teamId, counterStart, matchFormat) {
  return roster.map((classId, index) => {
    const ownerSeat = matchFormat === '2v2' ? index % 2 : null;
    return createSimUnit(classId, teamId, counterStart + index, ownerSeat);
  });
}

// A null ownerSeat means the unit belongs to the whole team (1v1), so it passes every
// seat filter; only 2v2 rosters carry a real seat.
function ownedBySeat(unit, seat) {
  return unit.ownerSeat == null || unit.ownerSeat === seat;
}

export function hasValidActionsForSlot(board, reserve, slot, actedUnitIds) {
  const { team, seat } = parseSlot(slot);
  const slotReserve = reserve.filter((u) => ownedBySeat(u, seat));

  if (getValidDeployCells(board).length > 0 && slotReserve.length > 0) return true;

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;
      if (!ownedBySeat(unit, seat)) continue;
      if (getValidMoves(board, unit).length > 0) return true;
      if (getValidAttackTargets(board, unit).length > 0) return true;
    }
  }
  return false;
}

export function hasValidActions(board, reserve, team, actedUnitIds) {
  if (getValidDeployCells(board).length > 0 && reserve.length > 0) return true;

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;
      if (getValidMoves(board, unit).length > 0) return true;
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

function applyAiAction(state, action, team) {
  // Snapshot identities before the board mutates so the log can name the actors.
  const reserves = { blue: state.blueReserve, red: state.redReserve };
  const detail = serializeAction(action, state.board, reserves);

  if (action.type === 'deploy') {
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;
    const unit = reserve.find((u) => u.id === action.unitId);
    state.board = applyDeploy(state.board, unit, action.row, action.col).board;
    if (team === 'blue') state.blueReserve = state.blueReserve.filter((u) => u.id !== unit.id);
    else state.redReserve = state.redReserve.filter((u) => u.id !== unit.id);
    return { label: 'deploy', detail, landedAt: { row: action.row, col: action.col } };
  }

  if (action.type === 'move') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    state.board = applyMove(state.board, unit, action.row, action.col).board;
    return { label: 'move', detail, landedAt: { row: action.row, col: action.col } };
  }

  if (action.type === 'attack') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    const target = state.board.flat().find((u) => u?.id === action.targetId);
    const result = applyAttack(state.board, unit, target);
    state.board = result.board;
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
  const winLine = checkWin(state.board, actingTeam);

  if (winLine) return { winner: actingTeam, reason: 'line', winLine };
  if (isTeamEliminated(state.board, enemy, enemyReserve)) {
    return { winner: actingTeam, reason: 'elimination', winLine: null };
  }
  return null;
}

function advanceSlot(currentSlot, slotOrder) {
  const idx = slotOrder.indexOf(currentSlot);
  return slotOrder[(idx + 1) % slotOrder.length];
}

function findNextActiveSlot(state, slotOrder) {
  const reserveByTeam = { blue: state.blueReserve, red: state.redReserve };
  let slot = state.currentSlot;
  for (let i = 0; i < slotOrder.length; i++) {
    slot = advanceSlot(slot, slotOrder);
    const { team } = parseSlot(slot);
    if (hasValidActionsForSlot(state.board, reserveByTeam[team], slot, state.actedUnitIds)) {
      return slot;
    }
  }
  return advanceSlot(state.currentSlot, slotOrder);
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
 * `agents` maps a team (1v1) or a slot (2v2) to `{ choose, options }`, where `choose`
 * has the `chooseAiAction(state, options)` signature. That indirection is what lets the
 * arena put two different AI builds on opposite sides of the same board.
 */
export function runMatch({
  mode,
  round = 1,
  firstPlayer = 'blue',
  firstSlot = null,
  unitCounterStart = 0,
  agents,
  rosters = null,
  maxTurns = MAX_TURNS,
  recordMoves = true,
}) {
  const { size, matchFormat, actionsPerTurn } = mode;
  const is2v2 = matchFormat === '2v2';
  // Live matches let each side pick its own lineup, so the runner accepts a per-team
  // override and only falls back to the mode's preset roster.
  const blueRoster = rosters?.blue ?? mode.roster;
  const redRoster = rosters?.red ?? mode.roster;
  let unitCounter = unitCounterStart;

  const state = {
    board: createEmptyBoard(size),
    blueReserve: createSimReserve(blueRoster, 'blue', unitCounter, matchFormat),
    redReserve: createSimReserve(redRoster, 'red', unitCounter + blueRoster.length, matchFormat),
    currentPlayer: is2v2 ? 'blue' : firstPlayer,
    currentSlot: firstSlot ?? `${firstPlayer}-0`,
    actionsRemaining: actionsPerTurn,
    actedUnitIds: new Set(),
  };
  unitCounter += blueRoster.length + redRoster.length;

  const moves = [];
  const stats = createStats();
  const slotOrder = [...SLOT_ORDER];
  let turn = 1;
  let moveCount = 0;

  const resolveAgent = (team, slot) => agents[is2v2 ? slot : team];

  const finish = (winner, reason, winLine) => ({
    round,
    firstPlayer: is2v2 ? 'blue' : firstPlayer,
    firstSlot: firstSlot ?? `${firstPlayer}-0`,
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
    const team = is2v2 ? parseSlot(state.currentSlot).team : state.currentPlayer;
    const seat = is2v2 ? parseSlot(state.currentSlot).seat : undefined;
    state.currentPlayer = team;
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;

    const canAct = is2v2
      ? hasValidActionsForSlot(state.board, reserve, state.currentSlot, state.actedUnitIds)
      : hasValidActions(state.board, reserve, team, state.actedUnitIds);

    if (!canAct) {
      if (is2v2) state.currentSlot = findNextActiveSlot(state, slotOrder);
      else state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const agent = resolveAgent(team, state.currentSlot);
    const started = performance.now();
    const action = agent.choose(
      {
        board: state.board,
        blueReserve: state.blueReserve,
        redReserve: state.redReserve,
        actedUnitIds: state.actedUnitIds,
      },
      {
        ...agent.options,
        team,
        ownerSeat: seat,
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
      if (is2v2) state.currentSlot = findNextActiveSlot(state, slotOrder);
      else state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const { landedAt, ...applied } = applyAiAction(state, action, team);
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
        ...(is2v2 ? { slot: state.currentSlot } : {}),
        actionRemainingAfter: state.actionsRemaining,
        ...applied,
      });
    }

    const end = checkRoundEnd(state, team);
    if (end) return finish(end.winner, end.reason, end.winLine);

    if (is2v2) {
      // game.js hands the board to the next seat after every single action.
      state.currentSlot = findNextActiveSlot(state, slotOrder);
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const exhausted = state.actionsRemaining <= 0
      || !hasValidActions(state.board, reserve, team, state.actedUnitIds);
    if (exhausted) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
    }
  }

  return finish(null, 'turn_limit', null);
}
