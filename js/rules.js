import { CLASSES, createEmptyBoard, cloneBoard } from './units.js';

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

const ORTHOGONAL_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
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

export function canAttackTarget(attacker, target) {
  return Boolean(attacker && target && attacker.team !== target.team);
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

export function getMageLines(unit, size = 3) {
  const { row, col } = unit;
  const lines = [];

  for (const [dr, dc] of ORTHOGONAL_DIRS) {
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

/** Every enemy along the ray, ignoring blockers and range: the mage beam pierces all. */
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
    if (cell && canAttackTarget(unit, cell)) enemies.push(cell);
    r += dr;
    c += dc;
  }

  return enemies;
}

/**
 * The last cell reached by each of the tower's four arrows. An occupied cell blocks
 * the ray, including a friendly unit; otherwise the arrow travels up to tower range.
 */
export function getTowerVolleyEndpoints(board, unit) {
  if (unit.row < 0) return [];

  const size = boardSize(board);
  const reach = unit.range ?? size;
  const endpoints = [];

  for (const [dr, dc] of ORTHOGONAL_DIRS) {
    let r = unit.row;
    let c = unit.col;
    let end = null;

    for (let step = 0; step < reach; step++) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isInBounds(nr, nc, size)) break;
      r = nr;
      c = nc;
      end = [r, c];
      if (board[r][c]) break;
    }

    if (end) endpoints.push(end);
  }

  return endpoints;
}

/** First attackable unit on each of the tower's four blocked rays. */
export function getTowerTargets(board, unit) {
  const targets = [];
  for (const [r, c] of getTowerVolleyEndpoints(board, unit)) {
    const target = board[r][c];
    if (target && canAttackTarget(unit, target)) targets.push(target);
  }
  return targets;
}

/** Enemies on the second orthogonal cell; adjacent cells are never valid targets. */
export function getArtilleryTargets(board, unit) {
  if (unit.row < 0) return [];

  const size = boardSize(board);
  const targets = [];

  for (const [dr, dc] of ORTHOGONAL_DIRS) {
    const r = unit.row + dr * 2;
    const c = unit.col + dc * 2;
    if (!isInBounds(r, c, size)) continue;

    const target = board[r][c];
    if (target && canAttackTarget(unit, target)) targets.push(target);
  }

  return targets;
}

function unitAttackType(unit) {
  return unit.type ?? CLASSES[unit.classId]?.type;
}

export function getValidAttackTargets(board, unit) {
  if (unit.row < 0) return [];

  const size = boardSize(board);
  const targets = [];
  const type = unitAttackType(unit);

  if (type === 'melee' || type === 'support') {
    const attackCells = unit.classId === 'bomber'
      ? getAdjacentCells8(unit.row, unit.col, size)
      : getAdjacentCells(unit.row, unit.col, size);
    for (const [r, c] of attackCells) {
      const target = board[r][c];
      if (target && canAttackTarget(unit, target)) targets.push(target);
    }
    return targets;
  }

  if (type === 'ranged') {
    const seen = new Set();
    for (const [dr, dc] of ORTHOGONAL_DIRS) {
      let r = unit.row + dr;
      let c = unit.col + dc;
      let steps = 0;
      while (isInBounds(r, c, size) && steps < unit.range) {
        const cell = board[r][c];
        if (cell) {
          if (canAttackTarget(unit, cell) && !seen.has(cell.id)) {
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

  if (type === 'artillery') {
    return getArtilleryTargets(board, unit);
  }

  if (type === 'tower') {
    return getTowerTargets(board, unit);
  }

  if (type === 'mage') {
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

export function getPriestBlessingTargets(board, priest) {
  if (priest.row < 0 || !priest.passiveBlessing) return [];

  return getAdjacentCells(priest.row, priest.col, boardSize(board))
    .map(([r, c]) => board[r][c])
    .filter((target) => target && target.team === priest.team && target.id !== priest.id);
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

export function applyPriestBlessing(board, priest) {
  const next = cloneBoard(board);
  const sourceTargets = getPriestBlessingTargets(board, priest);
  const targets = sourceTargets.map((target) => {
    const blessed = next[target.row][target.col];
    blessed.hp = Math.min(blessed.maxHp, blessed.hp + 1);
    return blessed;
  });
  return { board: next, unit: next[priest.row]?.[priest.col] ?? null, targets };
}

/** Team-wide priest passives: each ally heals at most once per action, even if overlapping. */
export function applyTeamPriestBlessings(board, team, excludePriestIds = []) {
  const next = cloneBoard(board);
  const excluded = new Set(excludePriestIds);
  const priests = [];
  const blessedIds = new Set();
  const targets = [];

  for (const row of board) {
    for (const unit of row) {
      if (unit?.team === team && unit.passiveBlessing && unit.row >= 0 && !excluded.has(unit.id)) {
        priests.push(unit);
      }
    }
  }

  for (const priest of priests) {
    for (const target of getPriestBlessingTargets(board, priest)) {
      if (blessedIds.has(target.id)) continue;

      const blessed = next[target.row][target.col];
      const prevHp = blessed.hp;
      blessed.hp = Math.min(blessed.maxHp, blessed.hp + 1);
      if (blessed.hp <= prevHp) continue;

      blessedIds.add(target.id);
      targets.push({ ...blessed });
    }
  }

  return { board: next, targets };
}

export const POISON_ATK_PENALTY = 1;

/** Applies poison debuff if the unit is not already poisoned. Returns true when newly poisoned. */
export function applyPoisonEffect(unit) {
  if (unit.poisoned) return false;
  unit.poisoned = true;
  unit.poisonFresh = true;
  const base = unit.baseAtk ?? unit.atk;
  unit.atk = Math.max(1, base - POISON_ATK_PENALTY);
  return true;
}

export function clearPoison(unit) {
  if (!unit.poisoned) return;
  unit.poisoned = false;
  unit.poisonFresh = false;
  unit.atk = unit.baseAtk ?? unit.atk;
}

/** Resolves poison damage when a team's turn ends. Skips the tick on the turn poison was applied. */
export function applyPoisonTurnTicks(board, team) {
  const next = cloneBoard(board);
  const ticks = [];
  const killed = [];

  for (let r = 0; r < next.length; r++) {
    for (let c = 0; c < next[r].length; c++) {
      const unit = next[r][c];
      if (!unit?.poisoned || unit.team !== team) continue;
      if (unit.poisonFresh) {
        unit.poisonFresh = false;
        continue;
      }
      unit.hp -= 1;
      ticks.push({ row: r, col: c, unit: { ...unit } });
      if (unit.hp <= 0) {
        killed.push({ ...unit, hp: unit.hp, row: r, col: c });
        next[r][c] = null;
      }
    }
  }

  const explosion = resolveDeathExplosions(next, killed);
  return {
    board: explosion.board,
    ticks,
    killed,
    explosionKilled: explosion.explosionKilled,
    explosions: explosion.explosions,
  };
}

/** Transforms attacker into the possessed form of victim, keeping ghost hp and taking victim atk. */
export function applyPossession(attacker, victim) {
  const cls = CLASSES[victim.classId];
  const prev = {
    classId: attacker.classId,
    hp: attacker.hp,
    maxHp: attacker.maxHp,
    atk: attacker.atk,
    baseAtk: attacker.baseAtk,
    range: attacker.range,
    minRange: attacker.minRange ?? null,
    moveRange: attacker.moveRange,
    jumpMove: attacker.jumpMove,
    jumpRange: attacker.jumpRange,
    type: attacker.type,
    deathExplosion: attacker.deathExplosion,
    passiveBlessing: attacker.passiveBlessing,
    possessionOnKill: attacker.possessionOnKill,
    poisonOnHit: attacker.poisonOnHit,
    poisoned: attacker.poisoned,
    poisonFresh: attacker.poisonFresh,
  };

  attacker.classId = victim.classId;
  attacker.hp = prev.hp;
  attacker.maxHp = prev.hp;
  attacker.atk = cls.atk;
  attacker.baseAtk = cls.atk;
  attacker.range = cls.range;
  attacker.minRange = cls.minRange ?? null;
  attacker.moveRange = cls.moveRange ?? 1;
  attacker.jumpMove = cls.jumpMove ?? false;
  attacker.jumpRange = cls.jumpRange ?? null;
  attacker.type = cls.type;
  attacker.deathExplosion = cls.deathExplosion ?? 0;
  attacker.passiveBlessing = cls.passiveBlessing ?? false;
  attacker.possessionOnKill = false;
  attacker.poisonOnHit = cls.poisonOnHit ?? false;
  clearPoison(attacker);

  return prev;
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
  let hits;
  if (unitAttackType(attacker) === 'mage') {
    hits = getEnemiesOnLine(board, attacker, target.row, target.col);
  } else if (unitAttackType(attacker) === 'tower') {
    hits = getTowerTargets(board, attacker);
  } else if (unitAttackType(attacker) === 'artillery') {
    hits = getArtilleryTargets(board, attacker).filter((hit) => hit.id === target.id);
  } else {
    hits = canAttackTarget(attacker, target) ? [target] : [];
  }

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

  const possessed = [];
  const poisoned = [];
  const attackerOnBoard = next[attacker.row]?.[attacker.col];
  if (attackerOnBoard?.poisonOnHit) {
    for (const hit of hits) {
      const cell = next[hit.row]?.[hit.col];
      if (!cell || cell.team === attacker.team) continue;
      if (applyPoisonEffect(cell)) {
        poisoned.push({ row: hit.row, col: hit.col, unit: { ...cell } });
      }
    }
  }
  if (attackerOnBoard?.possessionOnKill && canAttackTarget(attacker, target)) {
    const victimIdx = killed.findIndex((k) => k.id === target.id);
    if (victimIdx >= 0) {
      const victim = killed[victimIdx];
      applyPossession(attackerOnBoard, victim);
      next[attacker.row][attacker.col] = null;
      next[victim.row][victim.col] = attackerOnBoard;
      killed.splice(victimIdx, 1);
      possessed.push({
        from: { row: attacker.row, col: attacker.col },
        unit: attackerOnBoard,
        victimClassId: victim.classId,
      });
    }
  }

  const explosion = resolveDeathExplosions(next, killed);

  return {
    board: explosion.board,
    hits,
    killed,
    possessed,
    poisoned,
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

export function getValidPotionTargets(board, team, filterFn = () => true) {
  const cells = [];
  const size = boardSize(board);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const unit = board[r][c];
      if (unit?.team === team && filterFn(unit) && unit.hp < unit.maxHp) {
        cells.push([r, c]);
      }
    }
  }
  return cells;
}

export function getValidBombCells(board) {
  return getValidDeployCells(board);
}

export function healUnitAt(board, row, col, amount) {
  const next = cloneBoard(board);
  const unit = next[row][col];
  if (!unit) return { board, unit: null };
  unit.hp = Math.min(unit.maxHp, unit.hp + amount);
  return { board: next, unit };
}

export function applyTrapDamage(board, row, col, damage) {
  const next = cloneBoard(board);
  const unit = next[row][col];
  if (!unit) return { board: next, hit: null, killed: null };

  unit.hp -= damage;
  const hit = { ...unit };
  let killed = null;
  if (unit.hp <= 0) {
    killed = { ...unit, hp: unit.hp };
    next[row][col] = null;
  }
  return { board: next, hit, killed };
}
