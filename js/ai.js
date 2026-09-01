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
  chebyshev,
  getEnemiesOnLine,
  countTeamOnBoard,
} from './rules.js';

const MAX_MINIMAX_CANDIDATES = 24;
const ELIMINATION_PRESSURE_THRESHOLD = 4;

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

function cellKey(row, col) {
  return `${row},${col}`;
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

/** 標記對手連線威脅的關鍵格（差一子、差兩子等） */
function findCriticalCells(board, enemyTeam) {
  const winLength = board.length;
  const oneShort = winLength - 1;
  const twoShort = winLength - 2;
  const critical = new Map();

  for (const line of getWinLinesForBoard(board)) {
    let friendly = 0;
    let enemy = 0;
    const empties = [];

    for (const [r, c] of line) {
      const u = board[r][c];
      if (!u) empties.push([r, c]);
      else if (u.team === enemyTeam) enemy++;
      else friendly++;
    }

    if (friendly > 0) continue;

    let severity = 0;
    if (enemy === oneShort && empties.length >= 1) severity = 100;
    else if (enemy === twoShort && empties.length >= 2) severity = 35;
    else if (enemy === 1 && empties.length === winLength - 1) severity = 12;

    if (severity === 0) continue;

    for (const [r, c] of empties) {
      const key = cellKey(r, c);
      critical.set(key, Math.max(critical.get(key) ?? 0, severity));
    }
  }

  return critical;
}

function getCriticalSeverity(board, enemyTeam) {
  let total = 0;
  for (const severity of findCriticalCells(board, enemyTeam).values()) {
    total += severity;
  }
  return total;
}

function scoreKills(killed) {
  let bonus = 0;
  for (const unit of killed) {
    bonus += 35 + unit.maxHp * 4 + unit.atk * 10;
  }
  return bonus;
}

function countEnemyRemaining(board, enemyTeam, enemyReserve) {
  return countTeamOnBoard(board, enemyTeam) + enemyReserve.length;
}

function scoreEliminationPressure(board, team, enemyReserve, killed) {
  const enemy = enemyOf(team);
  const remaining = countEnemyRemaining(board, enemy, enemyReserve);
  if (remaining > ELIMINATION_PRESSURE_THRESHOLD) return 0;

  let bonus = (ELIMINATION_PRESSURE_THRESHOLD - remaining + 1) * 18;
  bonus += killed.length * (remaining <= 2 ? 55 : 30);
  if (remaining - killed.length <= 0 && enemyReserve.length === 0) bonus += 120;
  return bonus;
}

function countAdjacentEnemies(board, row, col, team) {
  const size = board.length;
  let count = 0;
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < size && c >= 0 && c < size) {
      const u = board[r][c];
      if (u && u.team !== team) count++;
    }
  }
  return count;
}

function countMeleeThreats(board, row, col, team) {
  const size = board.length;
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const u = board[r][c];
      if (u && u.team !== team && chebyshev(row, col, r, c) <= 1) count++;
    }
  }
  return count;
}

/** 弓箭手：覆蓋射程內目標，並避免貼臉 */
function scoreArcherPosition(board, row, col, team, range) {
  const size = board.length;
  let bonus = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const u = board[r][c];
      if (!u || u.team === team) continue;
      const dist = chebyshev(row, col, r, c);
      if (dist > range) continue;
      bonus += 14 + u.atk * 4;
      if (dist === 1) bonus -= 28;
      else if (dist >= 2) bonus += 8;
    }
  }

  bonus -= countMeleeThreats(board, row, col, team) * 16;
  return bonus;
}

/** 刺客跳躍：佔關鍵格、貼近遠程、脫離集火 */
function scoreAssassinMove(board, unit, row, col, team) {
  let bonus = 0;
  const enemy = enemyOf(team);
  const critical = findCriticalCells(board, enemy);

  bonus += (critical.get(cellKey(row, col)) ?? 0) * 0.85;
  bonus += scoreCellForLines(board, row, col, team) * 0.5;

  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const u = board[r][c];
      if (!u || u.team === team) continue;

      const before = chebyshev(unit.row, unit.col, r, c);
      const after = chebyshev(row, col, r, c);
      const isPriority = u.type === 'ranged' || u.type === 'mage';
      const value = u.atk * 10 + u.hp;

      if (isPriority && after < before) bonus += value * 0.45;
      if (isPriority && after === 1) bonus += 22;
      if (u.hp <= unit.atk && after === 1) bonus += 35;
    }
  }

  const threatsBefore = countAdjacentEnemies(board, unit.row, unit.col, team)
    + countMeleeThreats(board, unit.row, unit.col, team);
  const threatsAfter = countAdjacentEnemies(board, row, col, team)
    + countMeleeThreats(board, row, col, team);
  bonus += (threatsBefore - threatsAfter) * 15;

  return bonus;
}

/** 魔法師：模擬穿透線上的傷害與多殺價值 */
function scoreMageAttack(board, attacker, target, killed) {
  const hits = getEnemiesOnLine(board, attacker, target.row, target.col);
  let bonus = 0;

  for (const hit of hits) {
    if (hit.hp <= attacker.atk) {
      bonus += 30 + hit.maxHp * 3 + hit.atk * 8;
    } else {
      bonus += attacker.atk * 4;
    }
  }

  const killCount = killed.length;
  if (killCount >= 2) bonus += 50 + (killCount - 2) * 35;
  if (hits.length >= 2 && killCount === 0) bonus += hits.length * 10;

  let bestLineHits = hits.length;
  for (const alt of getValidAttackTargets(board, attacker)) {
    if (alt.id === target.id) continue;
    bestLineHits = Math.max(
      bestLineHits,
      getEnemiesOnLine(board, attacker, alt.row, alt.col).length,
    );
  }
  if (bestLineHits >= 2 && hits.length < bestLineHits) bonus -= 40;

  return bonus;
}

function scoreClassAttack(board, action, killed, team) {
  const attacker = board.flat().find((u) => u?.id === action.unitId);
  const target = board.flat().find((u) => u?.id === action.targetId);
  if (!attacker || !target) return 0;

  let bonus = scoreAttackExecution(board, action, killed);

  if (attacker.type === 'mage') {
    bonus += scoreMageAttack(board, attacker, target, killed);
  }

  if (attacker.classId === 'assassin' && killed.length > 0) {
    bonus += killed.length * 12;
  }

  return bonus;
}

function scoreAttackExecution(board, action, killed) {
  const attacker = board.flat().find((u) => u?.id === action.unitId);
  const target = board.flat().find((u) => u?.id === action.targetId);
  if (!attacker || !target) return 0;

  let bonus = 8 + scoreKills(killed);
  if (target.hp <= attacker.atk) bonus += 85;
  else if (target.hp <= attacker.atk * 2) bonus += 25;

  return bonus;
}


function countMageLinesFromCell(board, row, col, team) {
  const size = board.length;
  const dirs = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  let enemies = 0;

  for (const [dr, dc] of dirs) {
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < size && c >= 0 && c < size) {
      const u = board[r][c];
      if (u && u.team !== team) enemies++;
      r += dr;
      c += dc;
    }
  }

  return enemies;
}

function getLineRoleAtCell(board, row, col, team) {
  let blockEnemy = 0;
  let extendOwn = 0;
  const winLength = board.length;
  const oneShort = winLength - 1;

  for (const line of getWinLinesForBoard(board)) {
    if (!line.some(([r, c]) => r === row && c === col)) continue;

    let mine = 0;
    let theirs = 0;
    for (const [r, c] of line) {
      const u = board[r][c];
      if (!u) continue;
      if (u.team === team) mine++;
      else theirs++;
    }

    if (mine === 0 && theirs === oneShort) blockEnemy++;
    if (theirs === 0 && mine === oneShort) extendOwn++;
  }

  return { blockEnemy, extendOwn };
}

/** 依職業評估部署到某格的分數 */
function scoreDeployUnit(board, row, col, unit, team) {
  let bonus = 0;
  const lineBonus = scoreCellForLines(board, row, col, team);
  const { blockEnemy, extendOwn } = getLineRoleAtCell(board, row, col, team);

  if (blockEnemy > 0) {
    if (unit.classId === 'shield') bonus += 45;
    else if (unit.classId === 'swordsman') bonus += 25;
    else if (unit.classId === 'assassin') bonus += 20;
    else bonus += 10;
  }

  if (extendOwn > 0) {
    if (unit.classId === 'shield') bonus += 30;
    else if (unit.classId === 'swordsman') bonus += 18;
    else bonus += 12;
  }

  if (unit.classId === 'archer') {
    bonus += scoreArcherPosition(board, row, col, team, unit.range);
  }

  if (unit.classId === 'mage') {
    bonus += countMageLinesFromCell(board, row, col, team) * 8;
  }

  if (unit.classId === 'assassin') {
    if (lineBonus >= 50) bonus += 18;
    bonus += scoreArcherPosition(board, row, col, team, 1) * 0.35;
  }

  if (unit.classId === 'swordsman') {
    const size = board.length;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < size && c >= 0 && c < size) {
        const u = board[r][c];
        if (u && u.team !== team) bonus += 15;
      }
    }
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

function evaluateStateForRed(state) {
  return evaluateBoard(state.board, 'red', state.redReserve, state.blueReserve);
}

function getAllActionsForTeam(board, reserve, team, actedUnitIds = new Set()) {
  const actions = [];

  for (const unit of reserve) {
    if (actedUnitIds.has(unit.id)) continue;
    for (const [r, c] of getValidDeployCells(board)) {
      actions.push({ type: 'deploy', unitId: unit.id, row: r, col: c });
    }
  }

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;

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

function toGameState(next) {
  return {
    board: next.board,
    blueReserve: next.blueReserve,
    redReserve: next.redReserve,
  };
}

function isWinningState(board, team, enemyReserve) {
  return checkWin(board, team) || isTeamEliminated(board, enemyOf(team), enemyReserve);
}

function getActedUnitIds(state) {
  return state.actedUnitIds ?? new Set();
}

function findWinningActions(state, team) {
  const reserve = getReserve(state, team);
  const enemyReserve = getReserve(state, enemyOf(team));
  const acted = team === 'red' ? getActedUnitIds(state) : new Set();
  const actions = getAllActionsForTeam(state.board, reserve, team, acted);

  return actions.filter((action) => {
    const next = simulateActionForTeam(state, action, team);
    if (!next) return false;
    return isWinningState(next.board, team, enemyReserve);
  });
}

function filterThreatResponses(state, actions, team, criticalCells) {
  const maxSeverity = Math.max(0, ...criticalCells.values());
  const urgent = maxSeverity >= 100;
  const enemy = enemyOf(team);

  return actions.filter((action) => {
    if (action.type === 'deploy' || action.type === 'move') {
      const severity = criticalCells.get(cellKey(action.row, action.col)) ?? 0;
      if (severity >= 100) return true;
      if (!urgent && severity > 0) return true;
    }

    const next = simulateActionForTeam(state, action, team);
    if (!next) return false;

    if (urgent) {
      const afterMax = Math.max(0, ...findCriticalCells(next.board, enemy).values());
      return afterMax < 100;
    }

    const before = getCriticalSeverity(state.board, enemy);
    const after = getCriticalSeverity(next.board, enemy);
    return after < before;
  });
}

function scorePositioning(board, state, action, team) {
  if (action.type === 'deploy') {
    const unit = getReserve(state, team).find((u) => u.id === action.unitId);
    if (!unit) return 0;
    if (unit.classId === 'archer') {
      return scoreArcherPosition(board, action.row, action.col, team, unit.range);
    }
    return 0;
  }

  if (action.type !== 'move') return 0;

  const unit = board.flat().find((u) => u?.id === action.unitId);
  if (!unit) return 0;

  if (unit.classId === 'assassin' && unit.jumpMove) {
    return scoreAssassinMove(board, unit, action.row, action.col, team);
  }
  if (unit.classId === 'archer') {
    return scoreArcherPosition(board, action.row, action.col, team, unit.range);
  }
  return 0;
}

function scoreAction(state, action, team = 'red') {
  const next = simulateActionForTeam(state, action, team);
  if (!next) return -Infinity;

  const reserve = team === 'blue' ? next.blueReserve : next.redReserve;
  const enemyReserve = team === 'blue' ? next.redReserve : next.blueReserve;
  let score = evaluateBoard(next.board, team, reserve, enemyReserve);

  if (action.type === 'attack') {
    score += scoreClassAttack(state.board, action, next.killed, team);
    score += scoreEliminationPressure(next.board, team, enemyReserve, next.killed);
    if (isWinningState(next.board, team, enemyReserve)) score += 5000;
  }

  if (action.type === 'deploy') {
    const unit = getReserve(state, team).find((u) => u.id === action.unitId);
    score += 5 + scoreCellForLines(state.board, action.row, action.col, team);
    if (unit) score += scoreDeployUnit(state.board, action.row, action.col, unit, team);
    score += scorePositioning(state.board, state, action, team) * 0.5;
    if (isWinningState(next.board, team, enemyReserve)) score += 5000;
  }

  if (action.type === 'move') {
    score += scoreCellForLines(state.board, action.row, action.col, team);
    score += scorePositioning(state.board, state, action, team);
    if (isWinningState(next.board, team, enemyReserve)) score += 5000;
  }

  return score;
}

function getBestOpponentResponse(state, team) {
  const winActions = findWinningActions(state, team);
  if (winActions.length > 0) {
    const best = pickBestAction(state, winActions, team);
    const next = simulateActionForTeam(state, best, team);
    return next ? toGameState(next) : state;
  }

  const reserve = getReserve(state, team);
  const actions = getAllActionsForTeam(state.board, reserve, team);
  if (actions.length === 0) return state;

  let bestState = state;
  let bestScore = team === 'blue' ? Infinity : -Infinity;

  for (const action of actions) {
    const next = simulateActionForTeam(state, action, team);
    if (!next) continue;
    const afterState = toGameState(next);
    const redScore = evaluateStateForRed(afterState);

    if (team === 'blue') {
      if (redScore < bestScore) {
        bestScore = redScore;
        bestState = afterState;
      }
    }
  }

  return bestState;
}

function scoreActionMinimax(state, action, team = 'red') {
  const next = simulateActionForTeam(state, action, team);
  if (!next) return -Infinity;

  const afterRed = toGameState(next);
  const enemyReserve = afterRed.blueReserve;

  if (isWinningState(afterRed.board, 'red', afterRed.blueReserve)) return 10000;
  if (isWinningState(afterRed.board, 'blue', enemyReserve)) return -10000;

  const afterBlue = getBestOpponentResponse(afterRed, 'blue');

  if (isWinningState(afterBlue.board, 'blue', afterBlue.redReserve)) return -8000;
  if (isWinningState(afterBlue.board, 'red', afterBlue.blueReserve)) return 8000;

  let score = evaluateStateForRed(afterBlue);

  if (action.type === 'attack') {
    score += scoreClassAttack(state.board, action, next.killed, team) * 0.15;
    score += scoreEliminationPressure(next.board, 'red', afterRed.blueReserve, next.killed) * 0.2;
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

function pickBestActionMinimax(state, actions, team = 'red', criticalCells = null) {
  const candidates = actions.length <= MAX_MINIMAX_CANDIDATES
    ? actions
    : actions
        .map((action) => ({ action, score: scoreAction(state, action, team) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_MINIMAX_CANDIDATES)
        .map(({ action }) => action);

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const action of candidates) {
    let score = scoreActionMinimax(state, action, team);

    if (criticalCells && (action.type === 'deploy' || action.type === 'move')) {
      score += (criticalCells.get(cellKey(action.row, action.col)) ?? 0) * 3;
    }

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
    actedUnitIds: state.actedUnitIds ?? new Set(),
  };

  const acted = getActedUnitIds(safeState);
  const actions = getAllActionsForTeam(safeState.board, safeState.redReserve, 'red', acted);
  if (actions.length === 0) return null;

  const winActions = findWinningActions(safeState, 'red');
  if (winActions.length > 0) {
    return pickBestAction(safeState, winActions, 'red');
  }

  const blueWinActions = findWinningActions(safeState, 'blue');
  if (blueWinActions.length > 0) {
    const blocks = actions.filter((action) => {
      const next = simulateActionForTeam(safeState, action, 'red');
      if (!next) return false;
      return findWinningActions(toGameState(next), 'blue').length === 0;
    });

    if (blocks.length > 0) {
      return pickBestActionMinimax(safeState, blocks, 'red');
    }
  }

  const criticalCells = findCriticalCells(safeState.board, 'blue');
  if (criticalCells.size > 0) {
    const mitigating = filterThreatResponses(safeState, actions, 'red', criticalCells);

    if (mitigating.length > 0) {
      return pickBestActionMinimax(safeState, mitigating, 'red', criticalCells);
    }
  }

  return pickBestActionMinimax(safeState, actions, 'red');
}
