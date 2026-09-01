import { cloneBoard } from './units.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidDeployCells,
  applyMove,
  applyDeploy,
  applyAttack,
  checkWin,
  isTeamEliminated,
  getWinLines,
} from './rules.js';

function getWinLinesForBoard(board) {
  const size = board.length;
  return getWinLines(size, size);
}

function enemyOf(team) {
  return team === 'blue' ? 'red' : 'blue';
}

function getReserve(state, team) {
  return team === 'blue' ? state.blueReserve : state.redReserve;
}

function scoreLinePotential(board, team, reserveCount) {
  let score = 0;
  const winLines = getWinLinesForBoard(board);
  const winLength = board.length;

  for (const line of winLines) {
    let mine = 0;
    let theirs = 0;
    let empty = 0;
    for (const [r, c] of line) {
      const u = board[r][c];
      if (!u) empty++;
      else if (u.team === team) mine++;
      else theirs++;
    }

    if (theirs === 0 && mine > 0) score += mine * mine * 12 + empty * 2;
    if (mine === 0 && theirs > 0) score -= theirs * theirs * 14;

    const oneShort = winLength - 1;
    if (theirs === 0 && mine === oneShort && empty === 1) score += 90;
    if (mine === 0 && theirs === oneShort && empty === 1) score -= 110;
    if (theirs === 0 && mine === 1 && empty === winLength - 1) score += 20;
    if (mine === 0 && theirs === 1 && empty === winLength - 1) score -= 18;
  }

  score += reserveCount * 3;
  return score;
}

function scoreCellForLines(board, row, col, team) {
  let bonus = 0;
  const winLines = getWinLinesForBoard(board);
  const winLength = board.length;

  for (const line of winLines) {
    if (!line.some(([r, c]) => r === row && c === col)) continue;

    let mine = 0;
    let theirs = 0;
    for (const [r, c] of line) {
      const u = board[r][c];
      if (!u) continue;
      if (u.team === team) mine++;
      else theirs++;
    }

    const oneShort = winLength - 1;
    if (theirs === 0 && mine === oneShort) bonus += 65;
    else if (theirs === 0 && mine === 1) bonus += 22;
    else if (mine === 0 && theirs === oneShort) bonus += 75;
    else if (mine === 0 && theirs === 1) bonus += 18;
  }

  const center = Math.floor(board.length / 2);
  if (row === center && col === center) bonus += 10;
  return bonus;
}

function scoreKills(killed) {
  let bonus = 0;
  for (const unit of killed) {
    bonus += 35 + unit.maxHp * 4 + unit.atk * 10;
  }
  return bonus;
}

function evaluateBoard(board, team, reserve, enemyReserve) {
  let score = scoreLinePotential(board, team, reserve.length);
  const enemy = enemyOf(team);

  for (const row of board) {
    for (const unit of row) {
      if (!unit) continue;
      const value = unit.hp + unit.atk * 2;
      score += unit.team === team ? value : -value;
    }
  }

  if (checkWin(board, team)) score += 1000;
  if (checkWin(board, enemy)) score -= 1000;
  if (isTeamEliminated(board, enemy, enemyReserve)) score += 1000;
  if (isTeamEliminated(board, team, reserve)) score -= 1000;

  return score;
}

function getAllActionsForTeam(board, reserve, team) {
  const actions = [];

  for (const unit of reserve) {
    for (const [r, c] of getValidDeployCells(board)) {
      actions.push({ type: 'deploy', unitId: unit.id, row: r, col: c });
    }
  }

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team) continue;

      for (const [r, c] of getValidMoves(board, unit)) {
        actions.push({ type: 'move', unitId: unit.id, row: r, col: c });
      }

      for (const target of getValidAttackTargets(board, unit)) {
        actions.push({ type: 'attack', unitId: unit.id, targetId: target.id });
      }
    }
  }

  return actions;
}

function simulateActionForTeam(state, action, team) {
  const board = cloneBoard(state.board);
  let blueReserve = [...state.blueReserve];
  let redReserve = [...state.redReserve];
  const reserve = team === 'blue' ? blueReserve : redReserve;
  let killed = [];

  if (action.type === 'deploy') {
    const unit = reserve.find((u) => u.id === action.unitId);
    if (!unit) return null;
    if (team === 'blue') blueReserve = blueReserve.filter((u) => u.id !== action.unitId);
    else redReserve = redReserve.filter((u) => u.id !== action.unitId);
    const result = applyDeploy(board, unit, action.row, action.col);
    return { board: result.board, blueReserve, redReserve, killed };
  }

  const unit = board.flat().find((u) => u?.id === action.unitId);
  if (!unit) return null;

  if (action.type === 'move') {
    const result = applyMove(board, unit, action.row, action.col);
    return { board: result.board, blueReserve, redReserve, killed };
  }

  if (action.type === 'attack') {
    const target = board.flat().find((u) => u?.id === action.targetId);
    if (!target) return null;
    const result = applyAttack(board, unit, target);
    killed = result.killed;
    return { board: result.board, blueReserve, redReserve, killed };
  }

  return null;
}

function isWinningState(board, team, enemyReserve) {
  return checkWin(board, team) || isTeamEliminated(board, enemyOf(team), enemyReserve);
}

function findWinningActions(state, team) {
  const reserve = getReserve(state, team);
  const enemyReserve = getReserve(state, enemyOf(team));
  const actions = getAllActionsForTeam(state.board, reserve, team);

  return actions.filter((action) => {
    const next = simulateActionForTeam(state, action, team);
    if (!next) return false;
    return isWinningState(next.board, team, enemyReserve);
  });
}

function scoreAction(state, action, team = 'red') {
  const next = simulateActionForTeam(state, action, team);
  if (!next) return -Infinity;

  const reserve = team === 'blue' ? next.blueReserve : next.redReserve;
  const enemyReserve = team === 'blue' ? next.redReserve : next.blueReserve;
  let score = evaluateBoard(next.board, team, reserve, enemyReserve);

  if (action.type === 'attack') {
    score += 8 + scoreKills(next.killed);
    if (isWinningState(next.board, team, enemyReserve)) score += 5000;
  }

  if (action.type === 'deploy') {
    score += 5 + scoreCellForLines(state.board, action.row, action.col, team);
    if (isWinningState(next.board, team, enemyReserve)) score += 5000;
  }

  if (action.type === 'move') {
    score += scoreCellForLines(state.board, action.row, action.col, team);
    if (isWinningState(next.board, team, enemyReserve)) score += 5000;
  }

  return score;
}

function pickBestAction(state, actions, team = 'red') {
  let best = actions[0];
  let bestScore = -Infinity;

  for (const action of actions) {
    const score = scoreAction(state, action, team);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }

  return best;
}

export function chooseAiAction(state) {
  const safeState = {
    board: state.board,
    blueReserve: state.blueReserve ?? [],
    redReserve: state.redReserve ?? [],
  };

  const actions = getAllActionsForTeam(safeState.board, safeState.redReserve, 'red');
  if (actions.length === 0) return null;

  // 必勝：能贏就立刻下
  const winActions = findWinningActions(safeState, 'red');
  if (winActions.length > 0) {
    return pickBestAction(safeState, winActions, 'red');
  }

  // 必防：對手下回合能贏時，優先選擇能擋住的走法
  const blueWinActions = findWinningActions(safeState, 'blue');
  if (blueWinActions.length > 0) {
    const blocks = actions.filter((action) => {
      const next = simulateActionForTeam(safeState, action, 'red');
      if (!next) return false;
      const afterState = {
        board: next.board,
        blueReserve: next.blueReserve,
        redReserve: next.redReserve,
      };
      return findWinningActions(afterState, 'blue').length === 0;
    });

    if (blocks.length > 0) {
      return pickBestAction(safeState, blocks, 'red');
    }
  }

  return pickBestAction(safeState, actions, 'red');
}
