import { cloneBoard, FIXED_ROSTER } from './units.js';
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

const ACTIONS_PER_TURN = 2;
const MAX_MINIMAX_CANDIDATES = 32;
const COMBO_FIRST = 12;
const COMBO_SECOND = 8;
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

  score += reserveCount * 2;
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

function inferEnemyComposition(state, enemyTeam = 'blue') {
  const rosterTotals = {};
  for (const classId of FIXED_ROSTER) {
    rosterTotals[classId] = (rosterTotals[classId] ?? 0) + 1;
  }

  const alive = {};
  for (const classId of Object.keys(rosterTotals)) {
    alive[classId] = 0;
  }

  for (const row of state.board) {
    for (const unit of row) {
      if (unit?.team === enemyTeam) {
        alive[unit.classId] = (alive[unit.classId] ?? 0) + 1;
      }
    }
  }

  for (const unit of getReserve(state, enemyTeam)) {
    alive[unit.classId] = (alive[unit.classId] ?? 0) + 1;
  }

  const threat = {};
  for (const [classId, total] of Object.entries(rosterTotals)) {
    const count = alive[classId] ?? 0;
    threat[classId] = {
      total,
      alive: count,
      scarce: count === 1,
    };
  }

  return threat;
}

function threatPriorityBonus(classId, composition) {
  const info = composition[classId];
  if (!info) return 0;

  let bonus = 0;
  if (info.scarce) {
    if (classId === 'mage' || classId === 'archer') bonus += 55;
    else if (classId === 'assassin') bonus += 35;
    else if (classId === 'bomber') bonus += 25;
  }

  if (classId === 'mage' || classId === 'archer') bonus += info.alive * 6;
  if (classId === 'shield' && info.alive > 0) bonus += 10;

  return bonus;
}

function scoreKills(killed) {
  let bonus = 0;
  for (const unit of killed) {
    bonus += 35 + unit.maxHp * 4 + unit.atk * 10;
    if ((unit.deathExplosion ?? 0) > 0) {
      bonus += 12;
    }
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

/** 弓箭手：八方向射線上首個敵方，並避免貼臉 */
function scoreArcherPosition(board, row, col, team, range) {
  const phantom = { row, col, team, type: 'ranged', range };
  let bonus = 0;

  for (const target of getValidAttackTargets(board, phantom)) {
    const dist = chebyshev(row, col, target.row, target.col);
    bonus += 14 + target.atk * 4;
    if (dist === 1) bonus -= 28;
    else if (dist >= 2) bonus += 8;
  }

  bonus -= countMeleeThreats(board, row, col, team) * 16;
  return bonus;
}

/** 炸彈兵：貼敵換子、避開友軍 */
function scoreBomberPosition(board, row, col, team, unit) {
  const size = board.length;
  let bonus = 0;
  let adjacentEnemies = 0;
  let adjacentFriends = 0;
  const enemy = enemyOf(team);
  const critical = findCriticalCells(board, enemy);

  for (const [dr, dc] of [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= size || c < 0 || c >= size) continue;
    const u = board[r][c];
    if (!u) continue;
    if (u.team === team) adjacentFriends++;
    else adjacentEnemies++;
  }

  bonus += adjacentEnemies * 14;
  bonus -= adjacentFriends * 10;

  const crit = critical.get(cellKey(row, col)) ?? 0;
  if (crit >= 50 && adjacentEnemies > 0) bonus += 22;

  if (unit && unit.hp <= 2 && adjacentEnemies >= 2 && adjacentFriends === 0) {
    bonus += 18;
  }

  return bonus;
}

/** 盾牌手／劍士：擋線與延伸 */
function scoreMeleeLinePosition(board, row, col, team, unit) {
  let bonus = 0;
  const { blockEnemy, extendOwn } = getLineRoleAtCell(board, row, col, team);

  if (blockEnemy > 0) {
    if (unit?.classId === 'shield') bonus += 38;
    else bonus += 22;
  }
  if (extendOwn > 0) {
    if (unit?.classId === 'shield') bonus += 26;
    else bonus += 16;
  }

  bonus += scoreCellForLines(board, row, col, team) * 0.4;
  return bonus;
}

/** 魔法師移動：估算落點穿透擊殺價值 */
function scoreMageMovePosition(board, unit, row, col, team) {
  const phantom = { ...unit, row, col };
  let bonus = scoreMeleeLinePosition(board, row, col, team, unit) * 0.5;

  for (const target of getValidAttackTargets(board, phantom)) {
    const hits = getEnemiesOnLine(board, phantom, target.row, target.col);
    for (const hit of hits) {
      if (hit.hp <= phantom.atk) {
        bonus += 28 + hit.maxHp * 3 + hit.atk * 7;
      } else {
        bonus += phantom.atk * 3;
      }
    }
    if (hits.length >= 2) bonus += 20;
  }

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

function scoreBomberDeathRisk(board, attacker, target, team) {
  if ((target.deathExplosion ?? 0) <= 0) return 0;
  if (target.hp > attacker.atk) return 0;

  let bonus = 0;
  const size = board.length;
  const dmg = target.deathExplosion;
  const dist = chebyshev(attacker.row, attacker.col, target.row, target.col);
  const dirs = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  for (const [dr, dc] of dirs) {
    const r = target.row + dr;
    const c = target.col + dc;
    if (r < 0 || r >= size || c < 0 || c >= size) continue;
    const u = board[r][c];
    if (!u) continue;

    if (u.team === team) {
      if (u.hp <= dmg) bonus -= 40 + u.atk * 8;
      else bonus -= 15;
    } else if (u.hp <= dmg) {
      bonus += 25 + u.atk * 6;
    } else {
      bonus += 10;
    }
  }

  if (dist === 1) {
    if (attacker.hp <= dmg) bonus -= 60;
    else bonus -= dmg * 8;
  } else if (dist > 1 && (attacker.type === 'ranged' || attacker.type === 'mage')) {
    bonus += 48 + target.maxHp * 5;
  }

  return bonus;
}

function scoreClassAttack(board, action, killed, team, composition = null) {
  const attacker = board.flat().find((u) => u?.id === action.unitId);
  const target = board.flat().find((u) => u?.id === action.targetId);
  if (!attacker || !target) return 0;

  let bonus = scoreAttackExecution(board, action, killed);

  if (composition) {
    bonus += threatPriorityBonus(target.classId, composition);
    if (target.classId === 'shield' && chebyshev(attacker.row, attacker.col, target.row, target.col) === 1) {
      if (attacker.type === 'melee' && (composition.mage?.alive || composition.archer?.alive)) {
        bonus -= 18;
      }
    }
  }

  if (attacker.type === 'mage') {
    bonus += scoreMageAttack(board, attacker, target, killed);
  }

  if (attacker.classId === 'assassin' && killed.length > 0) {
    bonus += killed.length * 12;
  }

  bonus += scoreBomberDeathRisk(board, attacker, target, team);

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

  if (unit.classId === 'bomber') {
    const size = board.length;
    let adjacentEnemies = 0;
    let adjacentFriends = 0;
    for (const [dr, dc] of [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ]) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const u = board[r][c];
      if (!u) continue;
      if (u.team === team) adjacentFriends++;
      else adjacentEnemies++;
    }
    bonus += adjacentEnemies * 12;
    bonus -= adjacentFriends * 8;
  }

  return bonus;
}

function evaluateBoard(board, team, reserve, enemyReserve, composition = null) {
  let score = scoreLinePotential(board, team, reserve.length);
  const enemy = enemyOf(team);

  for (const row of board) {
    for (const unit of row) {
      if (!unit) continue;
      let value = unit.hp + unit.atk * 2;
      if (unit.team !== team && composition) {
        value += threatPriorityBonus(unit.classId, composition) * 0.15;
      }
      score += unit.team === team ? value : -value;
    }
  }

  if (checkWin(board, team)) score += 1000;
  if (checkWin(board, enemy)) score -= 1000;
  if (isTeamEliminated(board, enemy, enemyReserve)) score += 1000;
  if (isTeamEliminated(board, team, reserve)) score -= 1000;

  return score;
}

function evaluateStateForTeam(state, team) {
  const enemy = enemyOf(team);
  const composition = inferEnemyComposition(state, enemy);
  const reserve = getReserve(state, team);
  const enemyReserve = getReserve(state, enemy);
  return evaluateBoard(state.board, team, reserve, enemyReserve, composition);
}

function getAllActionsForTeam(board, reserve, team, actedUnitIds = new Set(), ownerSeat = undefined) {
  const actions = [];
  const slotReserve =
    ownerSeat !== undefined && ownerSeat !== null
      ? reserve.filter((u) => u.ownerSeat === ownerSeat)
      : reserve;

  for (const unit of slotReserve) {
    if (actedUnitIds.has(unit.id)) continue;
    for (const [r, c] of getValidDeployCells(board)) {
      actions.push({ type: 'deploy', unitId: unit.id, row: r, col: c });
    }
  }

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;
      if (ownerSeat !== undefined && ownerSeat !== null && unit.ownerSeat !== ownerSeat) continue;

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
    killed = [...result.killed, ...result.explosionKilled];
    return { board: result.board, blueReserve, redReserve, killed };
  }

  return null;
}

function toGameState(next, actedUnitIds = new Set()) {
  return {
    board: next.board,
    blueReserve: next.blueReserve,
    redReserve: next.redReserve,
    actedUnitIds: new Set(actedUnitIds),
  };
}

function getSimulatedOutcome(state, action, team) {
  const acted = new Set(getActedUnitIds(state));
  const next = simulateActionForTeam(state, action, team);
  if (!next) return null;

  acted.add(action.unitId);
  const enemy = enemyOf(team);
  const myReserve = getReserve({ ...state, ...next }, team);
  const enemyReserve = getReserve({ ...state, ...next }, enemy);

  const nextState = toGameState(next, acted);
  const won = isWinningState(next.board, team, enemyReserve);
  const lost = isWinningState(next.board, enemy, myReserve);

  return { nextState, killed: next.killed, won, lost };
}

function isWinningState(board, team, enemyReserve) {
  return checkWin(board, team) || isTeamEliminated(board, enemyOf(team), enemyReserve);
}

function getActedUnitIds(state) {
  return state.actedUnitIds ?? new Set();
}

function findWinningActions(state, team, ownerSeat = undefined) {
  const reserve = getReserve(state, team);
  const acted = getActedUnitIds(state);
  const actions = getAllActionsForTeam(state.board, reserve, team, acted, ownerSeat);

  return actions.filter((action) => {
    const outcome = getSimulatedOutcome(state, action, team);
    return outcome?.won === true;
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
    if (unit.classId === 'bomber') {
      return scoreBomberPosition(board, action.row, action.col, team, unit);
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
  if (unit.classId === 'bomber') {
    return scoreBomberPosition(board, action.row, action.col, team, unit);
  }
  if (unit.classId === 'shield' || unit.classId === 'swordsman') {
    return scoreMeleeLinePosition(board, action.row, action.col, team, unit);
  }
  if (unit.classId === 'mage') {
    return scoreMageMovePosition(board, unit, action.row, action.col, team);
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
    score += scoreClassAttack(state.board, action, next.killed, team, inferEnemyComposition(state, enemyOf(team)));
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

function simulateOpponentTurn(state, team = 'blue', maxSteps = ACTIONS_PER_TURN) {
  let current = {
    board: state.board,
    blueReserve: state.blueReserve,
    redReserve: state.redReserve,
    actedUnitIds: new Set(),
  };

  for (let step = 0; step < maxSteps; step++) {
    const reserve = getReserve(current, team);
    const acted = getActedUnitIds(current);
    const actions = getAllActionsForTeam(current.board, reserve, team, acted);
    if (actions.length === 0) break;

    const winActions = findWinningActions(current, team);
    let action;
    if (winActions.length > 0) {
      action = pickBestAction(current, winActions, team);
    } else {
      action = pickBestAction(current, actions, team);
    }

    const outcome = getSimulatedOutcome(current, action, team);
    if (!outcome) break;
    current = outcome.nextState;
    if (outcome.won) break;
  }

  return current;
}

function simulateTeamRemainderThenOpponent(state, team) {
  let current = state;
  const remaining = ACTIONS_PER_TURN - getActedUnitIds(state).size;
  const enemy = enemyOf(team);

  for (let i = 0; i < remaining; i++) {
    const acted = getActedUnitIds(current);
    const actions = getAllActionsForTeam(current.board, getReserve(current, team), team, acted);
    if (actions.length === 0) break;

    const winActions = findWinningActions(current, team);
    const action = winActions.length > 0
      ? pickBestAction(current, winActions, team)
      : pickBestAction(current, actions, team);

    const outcome = getSimulatedOutcome(current, action, team);
    if (!outcome) break;
    current = outcome.nextState;
    if (outcome.won) break;
  }

  return simulateOpponentTurn(
    {
      board: current.board,
      blueReserve: current.blueReserve,
      redReserve: current.redReserve,
      actedUnitIds: new Set(),
    },
    enemy,
    ACTIONS_PER_TURN,
  );
}

function scoreTurnMinimax(state, teamActions, team) {
  let current = state;
  const enemy = enemyOf(team);

  for (const action of teamActions) {
    const outcome = getSimulatedOutcome(current, action, team);
    if (!outcome) return -Infinity;
    if (outcome.won) return 10000;
    if (outcome.lost) return -10000;
    current = outcome.nextState;
  }

  const afterEnemy = simulateOpponentTurn(
    {
      board: current.board,
      blueReserve: current.blueReserve,
      redReserve: current.redReserve,
      actedUnitIds: new Set(),
    },
    enemy,
    ACTIONS_PER_TURN,
  );

  if (isWinningState(afterEnemy.board, enemy, getReserve(afterEnemy, team))) return -8000;
  if (isWinningState(afterEnemy.board, team, getReserve(afterEnemy, enemy))) return 8000;

  return evaluateStateForTeam(afterEnemy, team);
}

function scoreActionMinimax(state, action, team = 'red') {
  const outcome = getSimulatedOutcome(state, action, team);
  if (!outcome) return -Infinity;

  if (outcome.won) return 10000;
  if (outcome.lost) return -10000;

  const afterEnemy = simulateTeamRemainderThenOpponent(outcome.nextState, team);
  const enemy = enemyOf(team);

  if (isWinningState(afterEnemy.board, enemy, getReserve(afterEnemy, team))) return -8000;
  if (isWinningState(afterEnemy.board, team, getReserve(afterEnemy, enemy))) return 8000;

  let score = evaluateStateForTeam(afterEnemy, team);

  if (action.type === 'attack') {
    const composition = inferEnemyComposition(state, enemy);
    score += scoreClassAttack(state.board, action, outcome.killed, team, composition) * 0.22;
    score += scoreEliminationPressure(
      outcome.nextState.board,
      team,
      getReserve(outcome.nextState, enemy),
      outcome.killed,
    ) * 0.25;
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


function topScoringActions(state, actions, team, limit) {
  if (actions.length <= limit) return actions;
  return actions
    .map((action) => ({ action, score: scoreAction(state, action, team) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ action }) => action);
}

function pickBestComboFirstAction(state, actions, team = 'red') {
  const firstCandidates = topScoringActions(state, actions, team, COMBO_FIRST);
  let bestAction = firstCandidates[0];
  let bestScore = -Infinity;

  for (const step1 of firstCandidates) {
    const outcome1 = getSimulatedOutcome(state, step1, team);
    if (!outcome1) continue;

    if (outcome1.won) {
      const winScore = 10000 + scoreAction(state, step1, team) * 0.01;
      if (winScore > bestScore) {
        bestScore = winScore;
        bestAction = step1;
      }
      continue;
    }

    const actedAfter1 = getActedUnitIds(outcome1.nextState);
    const secondActions = getAllActionsForTeam(
      outcome1.nextState.board,
      getReserve(outcome1.nextState, team),
      team,
      actedAfter1,
    );

    if (secondActions.length === 0) {
      const score = scoreTurnMinimax(state, [step1], team);
      if (score > bestScore) {
        bestScore = score;
        bestAction = step1;
      }
      continue;
    }

    const secondCandidates = topScoringActions(outcome1.nextState, secondActions, team, COMBO_SECOND);
    for (const step2 of secondCandidates) {
      const score = scoreTurnMinimax(state, [step1, step2], team);
      if (score > bestScore) {
        bestScore = score;
        bestAction = step1;
      }
    }
  }

  return bestAction;
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

export function chooseAiAction(state, teamOrOptions = 'red') {
  const options =
    typeof teamOrOptions === 'string'
      ? { team: teamOrOptions, ownerSeat: undefined }
      : teamOrOptions;
  const { team, ownerSeat } = options;

  const safeState = {
    board: state.board,
    blueReserve: state.blueReserve ?? [],
    redReserve: state.redReserve ?? [],
    actedUnitIds: state.actedUnitIds ?? new Set(),
  };

  const enemy = enemyOf(team);
  const acted = getActedUnitIds(safeState);
  const actions = getAllActionsForTeam(
    safeState.board,
    getReserve(safeState, team),
    team,
    acted,
    ownerSeat,
  );
  if (actions.length === 0) return null;

  const winActions = findWinningActions(safeState, team, ownerSeat);
  if (winActions.length > 0) {
    return pickBestAction(safeState, winActions, team);
  }

  const enemyWinActions = findWinningActions(safeState, enemy);
  if (enemyWinActions.length > 0) {
    const blocks = actions.filter((action) => {
      const outcome = getSimulatedOutcome(safeState, action, team);
      if (!outcome) return false;
      const enemyWins = findWinningActions(
        {
          board: outcome.nextState.board,
          blueReserve: outcome.nextState.blueReserve,
          redReserve: outcome.nextState.redReserve,
          actedUnitIds: new Set(),
        },
        enemy,
      );
      return enemyWins.length === 0;
    });

    if (blocks.length > 0) {
      return pickBestActionMinimax(safeState, blocks, team);
    }
  }

  const criticalCells = findCriticalCells(safeState.board, enemy);
  if (criticalCells.size > 0) {
    const mitigating = filterThreatResponses(safeState, actions, team, criticalCells);

    if (mitigating.length > 0) {
      return pickBestActionMinimax(safeState, mitigating, team, criticalCells);
    }
  }

  if (acted.size === 0) {
    return pickBestComboFirstAction(safeState, actions, team);
  }

  return pickBestActionMinimax(safeState, actions, team);
}
