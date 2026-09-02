import { createEmptyBoard, cloneBoard } from './units.js';

export function getWinLines(size, winLength = size) {
  const lines = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      lines.push(Array.from({ length: winLength }, (_, i) => [r, c + i]));
    }
  }

  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - winLength; r++) {
      lines.push(Array.from({ length: winLength }, (_, i) => [r + i, c]));
    }
  }

  for (let r = 0; r <= size - winLength; r++) {
    for (let c = 0; c <= size - winLength; c++) {
      lines.push(Array.from({ length: winLength }, (_, i) => [r + i, c + i]));
    }
  }

  for (let r = 0; r <= size - winLength; r++) {
    for (let c = winLength - 1; c < size; c++) {
      lines.push(Array.from({ length: winLength }, (_, i) => [r + i, c - i]));
    }
  }

  return lines;
}

function boardSize(board) {
  return board.length;
}

const MAGE_DIRS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function chebyshev(r1, c1, r2, c2) {
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

export function manhattan(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

export function isInBounds(row, col, size = 3) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

export function getUnitAt(board, row, col) {
  const size = boardSize(board);
  if (!isInBounds(row, col, size)) return null;
  return board[row][col];
}

export function getAdjacentCells(row, col, size = 3) {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].filter(([r, c]) => isInBounds(r, c, size));
}

export function getAdjacentCells8(row, col, size = 3) {
  const cells = [];
  for (const [dr, dc] of MAGE_DIRS) {
    const r = row + dr;
    const c = col + dc;
    if (isInBounds(r, c, size)) cells.push([r, c]);
  }
  return cells;
}

export function getValidMoves(board, unit) {
  if (unit.row < 0) return [];

  const size = boardSize(board);

  if (unit.jumpMove) {
    const maxJump = unit.jumpRange ?? size;
    const moves = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] || (r === unit.row && c === unit.col)) continue;
        if (chebyshev(unit.row, unit.col, r, c) <= maxJump) moves.push([r, c]);
      }
    }
    return moves;
  }

  const maxSteps = unit.moveRange ?? 1;
  const moves = [];
  const visited = new Set([`${unit.row},${unit.col}`]);
  let frontier = [[unit.row, unit.col, 0]];

  while (frontier.length) {
    const nextFrontier = [];
    for (const [r, c, steps] of frontier) {
      if (steps >= maxSteps) continue;
      for (const [nr, nc] of getAdjacentCells(r, c, size)) {
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

export function isOnMageLine(fromRow, fromCol, toRow, toCol) {
  const dr = toRow - fromRow;
  const dc = toCol - fromCol;
  if (dr === 0 && dc === 0) return false;
  if (dr === 0 || dc === 0) return true;
  return Math.abs(dr) === Math.abs(dc);
}

export function getMageLines(unit, size = 3) {
  const { row, col } = unit;
  const lines = [];

  for (const [dr, dc] of MAGE_DIRS) {
    let r = row + dr;
    let c = col + dc;
    while (isInBounds(r, c, size)) {
      lines.push([[row, col], [r, c]]);
      r += dr;
      c += dc;
    }
  }

  return lines;
}

export function getFirstEnemyOnLine(board, unit, targetRow, targetCol) {
  const size = boardSize(board);
  const dr = Math.sign(targetRow - unit.row);
  const dc = Math.sign(targetCol - unit.col);
  if (dr === 0 && dc === 0) return null;
  if (!isOnMageLine(unit.row, unit.col, targetRow, targetCol)) return null;

  const maxRange = unit.range ?? size;
  let r = unit.row + dr;
  let c = unit.col + dc;
  let steps = 0;

  while (isInBounds(r, c, size) && steps < maxRange) {
    const cell = board[r][c];
    if (cell) return cell.team !== unit.team ? cell : null;
    r += dr;
    c += dc;
    steps++;
  }

  return null;
}

export function getEnemiesOnLine(board, unit, targetRow, targetCol) {
  const size = boardSize(board);
  const dr = Math.sign(targetRow - unit.row);
  const dc = Math.sign(targetCol - unit.col);
  if (dr === 0 && dc === 0) return [];

  const enemies = [];
  let r = unit.row + dr;
  let c = unit.col + dc;

  while (isInBounds(r, c, size)) {
    const cell = board[r][c];
    if (cell && cell.team !== unit.team) enemies.push(cell);
    r += dr;
    c += dc;
  }

  return enemies;
}

export function getValidAttackTargets(board, unit) {
  if (unit.row < 0) return [];

  const size = boardSize(board);
  const targets = [];

  if (unit.type === 'melee') {
    for (const [r, c] of getAdjacentCells(unit.row, unit.col, size)) {
      const target = board[r][c];
      if (target && target.team !== unit.team) targets.push(target);
    }
    return targets;
  }

  if (unit.type === 'ranged') {
    const seen = new Set();
    for (const [dr, dc] of MAGE_DIRS) {
      let r = unit.row + dr;
      let c = unit.col + dc;
      let steps = 0;
      while (isInBounds(r, c, size) && steps < unit.range) {
        const cell = board[r][c];
        if (cell) {
          if (cell.team !== unit.team && !seen.has(cell.id)) {
            seen.add(cell.id);
            targets.push(cell);
          }
          break;
        }
        r += dr;
        c += dc;
        steps++;
      }
    }
    return targets;
  }

  if (unit.type === 'mage') {
    const seen = new Set();
    for (const line of getMageLines(unit, size)) {
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
  const size = boardSize(board);
  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!board[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

export function checkWin(board, team) {
  const size = boardSize(board);
  const winLength = size;
  for (const line of getWinLines(size, winLength)) {
    const units = line.map(([r, c]) => board[r][c]).filter(Boolean);
    if (units.length === winLength && units.every((u) => u.team === team)) {
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

export function resolveDeathExplosions(board, killedUnits) {
  const bombers = killedUnits.filter((u) => (u.deathExplosion ?? 0) > 0);
  if (bombers.length === 0) {
    return { board, explosionHits: [], explosionKilled: [], explosions: [] };
  }

  const next = cloneBoard(board);
  const explosionHits = [];
  const explosionKilled = [];
  const explosions = [];

  for (const bomber of bombers) {
    const size = boardSize(next);
    const damage = bomber.deathExplosion;
    const targets = [];

    for (const [r, c] of getAdjacentCells8(bomber.row, bomber.col, size)) {
      const cell = next[r][c];
      if (!cell || cell.team === bomber.team) continue;

      cell.hp -= damage;
      explosionHits.push(cell);
      const killed = cell.hp <= 0;
      if (killed) {
        explosionKilled.push({ ...cell, hp: cell.hp });
        next[r][c] = null;
      }
      targets.push({ row: r, col: c, killed });
    }

    if (targets.length > 0) {
      explosions.push({
        from: { row: bomber.row, col: bomber.col },
        damage,
        targets,
      });
    }
  }

  return { board: next, explosionHits, explosionKilled, explosions };
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
      killed.push({ ...cell, hp: cell.hp });
      next[hit.row][hit.col] = null;
    }
  }

  const explosion = resolveDeathExplosions(next, killed);

  return {
    board: explosion.board,
    hits,
    killed,
    explosionKilled: explosion.explosionKilled,
    explosions: explosion.explosions,
  };
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
