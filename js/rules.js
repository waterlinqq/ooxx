import { createEmptyBoard, cloneBoard } from './units.js';

const LINES = [
  [[0, 0], [0, 1], [0, 2]],
  [[1, 0], [1, 1], [1, 2]],
  [[2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 2], [1, 1], [2, 0]],
];

export function chebyshev(r1, c1, r2, c2) {
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

export function manhattan(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

export function isInBounds(row, col) {
  return row >= 0 && row < 3 && col >= 0 && col < 3;
}

export function getUnitAt(board, row, col) {
  if (!isInBounds(row, col)) return null;
  return board[row][col];
}

export function getAdjacentCells(row, col) {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].filter(([r, c]) => isInBounds(r, c));
}

export function getValidMoves(board, unit) {
  if (unit.row < 0) return [];

  const maxSteps = unit.moveRange ?? 1;
  const moves = [];
  const visited = new Set([`${unit.row},${unit.col}`]);
  let frontier = [[unit.row, unit.col, 0]];

  while (frontier.length) {
    const nextFrontier = [];
    for (const [r, c, steps] of frontier) {
      if (steps >= maxSteps) continue;
      for (const [nr, nc] of getAdjacentCells(r, c)) {
        const key = `${nr},${nc}`;
        if (board[nr][nc] || visited.has(key)) continue;
        visited.add(key);
        moves.push([nr, nc]);
        nextFrontier.push([nr, nc, steps + 1]);
      }
    }
    frontier = nextFrontier;
  }

  return moves;
}

export function getMageLines(unit) {
  const { row, col } = unit;
  const lines = [];

  for (let c = col + 1; c < 3; c++) lines.push([[row, col], [row, c]]);
  for (let c = col - 1; c >= 0; c--) lines.push([[row, col], [row, c]]);
  for (let r = row + 1; r < 3; r++) lines.push([[row, col], [r, col]]);
  for (let r = row - 1; r >= 0; r--) lines.push([[row, col], [r, col]]);

  return lines;
}

export function getEnemiesOnLine(board, unit, targetRow, targetCol) {
  const dr = Math.sign(targetRow - unit.row);
  const dc = Math.sign(targetCol - unit.col);
  if (dr === 0 && dc === 0) return [];

  const enemies = [];
  let r = unit.row + dr;
  let c = unit.col + dc;

  while (isInBounds(r, c)) {
    const cell = board[r][c];
    if (cell && cell.team !== unit.team) enemies.push(cell);
    r += dr;
    c += dc;
  }

  return enemies;
}

export function getValidAttackTargets(board, unit) {
  if (unit.row < 0) return [];

  const targets = [];

  if (unit.type === 'melee') {
    for (const [r, c] of getAdjacentCells(unit.row, unit.col)) {
      const target = board[r][c];
      if (target && target.team !== unit.team) targets.push(target);
    }
    return targets;
  }

  if (unit.type === 'ranged') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const target = board[r][c];
        if (target && target.team !== unit.team && chebyshev(unit.row, unit.col, r, c) <= unit.range) {
          targets.push(target);
        }
      }
    }
    return targets;
  }

  if (unit.type === 'mage') {
    const seen = new Set();
    for (const line of getMageLines(unit)) {
      const end = line[1];
      const enemies = getEnemiesOnLine(board, unit, end[0], end[1]);
      for (const enemy of enemies) {
        if (!seen.has(enemy.id)) {
          seen.add(enemy.id);
          targets.push(enemy);
        }
      }
    }
    return targets;
  }

  return targets;
}

export function getValidDeployCells(board) {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!board[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

export function checkWin(board, team) {
  for (const line of LINES) {
    const units = line.map(([r, c]) => board[r][c]).filter(Boolean);
    if (units.length === 3 && units.every((u) => u.team === team)) {
      return line;
    }
  }
  return null;
}

export function isTeamEliminated(board, team, reserve) {
  return countTeamOnBoard(board, team) === 0 && reserve.length === 0;
}

export function applyMove(board, unit, row, col) {
  const next = cloneBoard(board);
  next[unit.row][unit.col] = null;
  const moved = { ...unit, row, col };
  next[row][col] = moved;
  return { board: next, unit: moved };
}

export function applyDeploy(board, unit, row, col) {
  const next = cloneBoard(board);
  const deployed = { ...unit, row, col };
  next[row][col] = deployed;
  return { board: next, unit: deployed };
}

export function applyAttack(board, attacker, target) {
  const next = cloneBoard(board);
  const hits = attacker.type === 'mage'
    ? getEnemiesOnLine(board, attacker, target.row, target.col)
    : [target];

  const killed = [];
  for (const hit of hits) {
    const cell = next[hit.row][hit.col];
    if (!cell) continue;
    cell.hp -= attacker.atk;
    if (cell.hp <= 0) {
      killed.push(cell);
      next[hit.row][hit.col] = null;
    }
  }

  return { board: next, hits, killed };
}

export function countTeamOnBoard(board, team) {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell?.team === team) count++;
    }
  }
  return count;
}

export function resetBoardState() {
  return {
    board: createEmptyBoard(),
    blueReserve: [],
    redReserve: [],
  };
}
