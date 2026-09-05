// Search-side board layer.
//
// The public game state (js/game.js) stays immutable, but a search that clones the board
// for every candidate action spends most of its budget in the allocator. So the search
// deep-copies the position exactly once into a SearchContext and from then on applies
// actions in place with an undo record, keeping the same 2D-array-of-units shape that
// js/rules.js reads. Win lines and the cells that feed them are memoized per board size
// and the per-line occupancy counters are maintained incrementally.
import { CLASSES, CLASS_IDS } from '../units.js';
import { isFlagCell, cloneMapProps, getMapPropAt } from '../mapPropUtils.js';
import {
  getWinLines,
  getAdjacentCells,
  getAdjacentCells8,
  getEnemiesOnLine,
  getTowerTargets,
  getArtilleryTargets,
  canAttackTarget,
  applyPossession,
  applyPoisonEffect,
  cloneShadowClones,
  placeShadowClone,
  expireShadowClonesForTurnStart,
} from '../rules.js';

const CLASS_INDEX = new Map(CLASS_IDS.map((id, i) => [id, i]));
const MAX_HP = Math.max(...CLASS_IDS.map((id) => CLASSES[id].hp));

const linesCache = new Map();

/** Win lines for a board size, as flat cell indices. Memoized: the shape never changes. */
export function getWinLinesForSize(size) {
  let cached = linesCache.get(size);
  if (!cached) {
    const lines = getWinLines(size, size).map((line) => line.map(([r, c]) => r * size + c));
    const linesByCell = Array.from({ length: size * size }, () => []);
    lines.forEach((line, lineIdx) => {
      for (const cell of line) linesByCell[cell].push(lineIdx);
    });
    cached = { lines, linesByCell, winLength: size };
    linesCache.set(size, cached);
  }
  return cached;
}

/**
 * Zobrist keys. Two 32-bit lanes are xor-accumulated and folded into one 53-bit safe
 * integer so transposition keys stay usable as plain Map keys without BigInt.
 */
const zobristCache = new Map();

function randomLane(rng) {
  return (rng() * 0x100000000) | 0;
}

function makeLanePair(rng) {
  return [randomLane(rng), randomLane(rng)];
}

function createZobrist(size) {
  // Fixed internal PRNG: the keys must be stable across calls within a process, but they
  // never need to be reproducible across versions.
  let state = 0x9e3779b9;
  const rng = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return (state >>> 0) / 0x100000000;
  };

  const cells = size * size;
  const cellUnit = Array.from({ length: cells }, () => (
    Array.from({ length: 2 }, () => (
      Array.from({ length: CLASS_IDS.length }, () => (
        Array.from({ length: MAX_HP + 1 }, () => makeLanePair(rng))
      ))
    ))
  ));
  const reserveCount = Array.from({ length: 2 }, () => (
    Array.from({ length: CLASS_IDS.length }, () => (
      Array.from({ length: 32 }, () => makeLanePair(rng))
    ))
  ));
  const side = [makeLanePair(rng), makeLanePair(rng)];
  const actionsLeft = Array.from({ length: 8 }, () => makeLanePair(rng));
  const acted = Array.from({ length: 64 }, () => makeLanePair(rng));

  return { cellUnit, reserveCount, side, actionsLeft, acted };
}

function getZobrist(size) {
  let table = zobristCache.get(size);
  if (!table) {
    table = createZobrist(size);
    zobristCache.set(size, table);
  }
  return table;
}

const TEAM_INDEX = { blue: 0, red: 1 };

export function enemyOf(team) {
  return team === 'blue' ? 'red' : 'blue';
}

function cloneUnit(unit, searchIndex) {
  return {
    id: unit.id,
    classId: unit.classId,
    team: unit.team,
    hp: unit.hp,
    maxHp: unit.maxHp,
    atk: unit.atk,
    baseAtk: unit.baseAtk ?? CLASSES[unit.classId].atk,
    range: unit.range,
    minRange: unit.minRange ?? null,
    moveRange: unit.moveRange ?? 1,
    jumpMove: unit.jumpMove ?? false,
    jumpRange: unit.jumpRange ?? null,
    shadowCloneOnMove: unit.shadowCloneOnMove ?? false,
    deathExplosion: unit.deathExplosion ?? 0,
    passiveBlessing: unit.passiveBlessing ?? false,
    possessionOnKill: unit.possessionOnKill ?? false,
    poisonOnHit: unit.poisonOnHit ?? false,
    diagonalOnly: unit.diagonalOnly ?? CLASSES[unit.classId]?.diagonalOnly ?? false,
    poisoned: unit.poisoned ?? false,
    poisonFresh: unit.poisonFresh ?? false,
    immobilized: unit.immobilized ?? false,
    type: unit.type,
    row: unit.row,
    col: unit.col,
    searchIndex,
  };
}

/**
 * Snapshots a public game state into a mutable search context.
 *
 * @param {{board: Array, mapProps?: Array, blueReserve: Array, redReserve: Array, actedUnitIds: Set<string>}} state
 * @param {{team: string, actionsPerTurn: number}} options
 */
export function createSearchContext(state, { team, actionsPerTurn }) {
  const size = state.board.length;
  const { lines, linesByCell } = getWinLinesForSize(size);
  const zobrist = getZobrist(size);

  const board = Array.from({ length: size }, () => Array(size).fill(null));
  const unitsById = new Map();
  let searchIndex = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const source = state.board[r][c];
      if (!source) continue;
      const unit = cloneUnit(source, searchIndex++);
      unit.row = r;
      unit.col = c;
      board[r][c] = unit;
      unitsById.set(unit.id, unit);
    }
  }

  const reserves = { blue: [], red: [] };
  for (const key of ['blue', 'red']) {
    const source = key === 'blue' ? state.blueReserve : state.redReserve;
    for (const item of source ?? []) {
      const unit = cloneUnit(item, searchIndex++);
      unit.row = -1;
      unit.col = -1;
      reserves[key].push(unit);
      unitsById.set(unit.id, unit);
    }
  }

  const ctx = {
    size,
    board,
    // Cloned, not shared: potions and spikes are consumed as the search tries actions.
    mapProps: state.mapProps ? cloneMapProps(state.mapProps) : null,
    shadowClones: cloneShadowClones(state.shadowClones),
    reserves,
    unitsById,
    lines,
    linesByCell,
    winLength: size,
    zobrist,
    // Per-line occupancy, maintained incrementally by place/lift.
    lineCount: {
      blue: new Int8Array(lines.length),
      red: new Int8Array(lines.length),
    },
    flagLineCount: new Int8Array(lines.length),
    onBoard: { blue: 0, red: 0 },
    turn: team,
    actionsPerTurn,
    // The caller only asks for an action when at least one is still available.
    actionsLeft: Math.max(1, actionsPerTurn - (state.actedUnitIds?.size ?? 0)),
    acted: new Set(),
    actedStack: [],
    lastMover: null,
    hashHi: 0,
    hashLo: 0,
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const unit = board[r][c];
      if (unit) registerOnBoard(ctx, unit);
      if (isFlagCell(ctx.mapProps, r, c)) {
        const cell = r * size + c;
        for (const lineIdx of linesByCell[cell]) ctx.flagLineCount[lineIdx]++;
      }
    }
  }

  for (const id of state.actedUnitIds ?? []) {
    const unit = unitsById.get(id);
    if (unit) ctx.acted.add(unit.searchIndex);
  }

  return ctx;
}

function xorHash(ctx, pair) {
  ctx.hashHi ^= pair[0];
  ctx.hashLo ^= pair[1];
}

function unitCellKey(ctx, unit, row, col) {
  const cell = row * ctx.size + col;
  const hp = Math.max(0, Math.min(MAX_HP, unit.hp));
  return ctx.zobrist.cellUnit[cell][TEAM_INDEX[unit.team]][CLASS_INDEX.get(unit.classId)][hp];
}

function mix32(value) {
  let mixed = value | 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed | 0;
}

function unitAttackKey(ctx, unit, row, col) {
  const cell = row * ctx.size + col;
  const seed = Math.imul(cell + 1, 0x9e3779b9)
    ^ Math.imul(TEAM_INDEX[unit.team] + 1, 0x85ebca6b)
    ^ Math.imul(unit.atk + 1, 0xc2b2ae35);
  return [mix32(seed), mix32(seed ^ 0x27d4eb2f)];
}

function unitStateKey(ctx, unit, row, col) {
  const flags = (unit.poisoned ? 1 : 0)
    | (unit.poisonFresh ? 2 : 0)
    | (unit.immobilized ? 4 : 0);
  if (flags === 0) return [0, 0];
  const cell = row * ctx.size + col;
  const seed = Math.imul(cell + 1, 0x9e3779b9)
    ^ Math.imul(flags + 1, 0x85ebca6b);
  return [mix32(seed), mix32(seed ^ 0x27d4eb2f)];
}

function xorUnitHash(ctx, unit, row, col) {
  xorHash(ctx, unitCellKey(ctx, unit, row, col));
  xorHash(ctx, unitAttackKey(ctx, unit, row, col));
  xorHash(ctx, unitStateKey(ctx, unit, row, col));
}

const CONSUMED_PROP_KINDS = ['potion', 'spikes', 'web'];

/** Marks a cell whose one-shot prop has been used up, so transpositions stay distinct. */
function xorPropHash(ctx, cell, kind) {
  const seed = Math.imul(cell + 1, 0x2545f491)
    ^ Math.imul(CONSUMED_PROP_KINDS.indexOf(kind) + 1, 0xc2b2ae35);
  xorHash(ctx, [mix32(seed), mix32(seed ^ 0x165667b1)]);
}

function reserveCountKey(ctx, team, classId, count) {
  const table = ctx.zobrist.reserveCount[TEAM_INDEX[team]][CLASS_INDEX.get(classId)];
  return table[Math.min(table.length - 1, count)];
}

function countReserveClass(ctx, team, classId) {
  let n = 0;
  for (const unit of ctx.reserves[team]) if (unit.classId === classId) n++;
  return n;
}

/** Adds a unit that is already sitting on board[row][col] to all derived indices. */
function registerOnBoard(ctx, unit) {
  const cell = unit.row * ctx.size + unit.col;
  for (const lineIdx of ctx.linesByCell[cell]) ctx.lineCount[unit.team][lineIdx]++;
  ctx.onBoard[unit.team]++;
  xorUnitHash(ctx, unit, unit.row, unit.col);
}

function place(ctx, unit, row, col) {
  ctx.board[row][col] = unit;
  unit.row = row;
  unit.col = col;
  registerOnBoard(ctx, unit);
}

function lift(ctx, unit) {
  const { row, col } = unit;
  xorUnitHash(ctx, unit, row, col);
  const cell = row * ctx.size + col;
  for (const lineIdx of ctx.linesByCell[cell]) ctx.lineCount[unit.team][lineIdx]--;
  ctx.onBoard[unit.team]--;
  ctx.board[row][col] = null;
  unit.row = -1;
  unit.col = -1;
}

/** Applies damage in place, returning true when the unit died. */
function damage(ctx, unit, amount) {
  xorUnitHash(ctx, unit, unit.row, unit.col);
  unit.hp -= amount;
  if (unit.hp > 0) {
    xorUnitHash(ctx, unit, unit.row, unit.col);
    return false;
  }
  // Re-xor with the pre-damage hp key already removed above; the unit is leaving the
  // board so only the line/occupancy bookkeeping remains.
  const cell = unit.row * ctx.size + unit.col;
  for (const lineIdx of ctx.linesByCell[cell]) ctx.lineCount[unit.team][lineIdx]--;
  ctx.onBoard[unit.team]--;
  ctx.board[unit.row][unit.col] = null;
  unit.deadRow = unit.row;
  unit.deadCol = unit.col;
  unit.row = -1;
  unit.col = -1;
  return true;
}

/** Restores hp in place, returning the amount actually gained. */
function heal(ctx, unit, amount) {
  const next = Math.min(unit.maxHp, unit.hp + amount);
  if (next === unit.hp) return 0;
  xorUnitHash(ctx, unit, unit.row, unit.col);
  const gained = next - unit.hp;
  unit.hp = next;
  xorUnitHash(ctx, unit, unit.row, unit.col);
  return gained;
}

function restoreDamaged(ctx, record) {
  const { unit, prevHp, row, col, died } = record;
  if (died) {
    unit.hp = prevHp;
    unit.row = row;
    unit.col = col;
    ctx.board[row][col] = unit;
    const cell = row * ctx.size + col;
    for (const lineIdx of ctx.linesByCell[cell]) ctx.lineCount[unit.team][lineIdx]++;
    ctx.onBoard[unit.team]++;
    xorUnitHash(ctx, unit, row, col);
    return;
  }
  xorUnitHash(ctx, unit, row, col);
  unit.hp = prevHp;
  xorUnitHash(ctx, unit, row, col);
}

/** Reverses poison ticks (and any chained blasts) applied when the turn ended. */
/** Reverses damage the action itself dealt: attacks, blast chains and spike landings. */
function restoreActionDamage(ctx, undo) {
  for (let i = undo.damageRecords.length - 1; i >= 0; i--) {
    restoreDamaged(ctx, undo.damageRecords[i]);
  }
}

function restoreEndOfTurnEffects(ctx, undo) {
  for (let i = undo.turnEndDamage.length - 1; i >= 0; i--) {
    restoreDamaged(ctx, undo.turnEndDamage[i]);
  }
  for (const rec of undo.poisonSkipRecords) {
    xorUnitHash(ctx, rec.unit, rec.unit.row, rec.unit.col);
    rec.unit.poisonFresh = true;
    xorUnitHash(ctx, rec.unit, rec.unit.row, rec.unit.col);
  }
}

function removeFromReserve(ctx, unit) {
  const list = ctx.reserves[unit.team];
  const index = list.indexOf(unit);
  const before = countReserveClass(ctx, unit.team, unit.classId);
  list.splice(index, 1);
  xorHash(ctx, reserveCountKey(ctx, unit.team, unit.classId, before));
  xorHash(ctx, reserveCountKey(ctx, unit.team, unit.classId, before - 1));
  return index;
}

function insertIntoReserve(ctx, unit, index) {
  const list = ctx.reserves[unit.team];
  const before = countReserveClass(ctx, unit.team, unit.classId);
  list.splice(index, 0, unit);
  xorHash(ctx, reserveCountKey(ctx, unit.team, unit.classId, before));
  xorHash(ctx, reserveCountKey(ctx, unit.team, unit.classId, before + 1));
}

export function findUnit(ctx, unitId) {
  return ctx.unitsById.get(unitId) ?? null;
}

export function isOnBoard(unit) {
  return unit.row >= 0;
}

/**
 * Resolves the chain of bomber death explosions exactly as js/rules.js does: only units
 * on the *opposing* side of each dead bomber take damage, and bombers killed by a blast
 * do not detonate in turn.
 */
function resolveExplosions(ctx, directKills, records, casualties) {
  for (const bomber of directKills) {
    if ((bomber.deathExplosion ?? 0) <= 0) continue;
    const row = bomber.deadRow;
    const col = bomber.deadCol;
    for (const [r, c] of getAdjacentCells8(row, col, ctx.size)) {
      const victim = ctx.board[r][c];
      if (!victim || victim.team === bomber.team) continue;
      const record = { unit: victim, prevHp: victim.hp, row: r, col: c, died: false };
      record.died = damage(ctx, victim, bomber.deathExplosion);
      records.push(record);
      if (record.died) casualties.push(victim);
    }
  }
}

/**
 * Terrain the unit just walked into, mirroring resolveMapPropOnEnter in js/mapProps.js.
 *
 * Without this the search reads a fresh 3 hp archer dropped onto spikes as a healthy
 * unit, when the board hands it over at 1 hp for the opponent to pick off. Spike damage
 * goes into `damageRecords` so it unwinds in the same LIFO pass as everything else that
 * hurt a unit during this action.
 */
function applyTerrainOnEnter(ctx, unit, undo) {
  const prop = getMapPropAt(ctx.mapProps, unit.row, unit.col);
  if (!prop) return;

  const { row, col } = unit;
  const cell = row * ctx.size + col;
  const { kind } = prop;

  if (kind === 'potion') {
    const gained = heal(ctx, unit, 2);
    undo.terrainRecords.push({ kind, row, col, prop, unit, gained });
  } else if (kind === 'spikes') {
    const record = { unit, prevHp: unit.hp, row, col, died: false };
    record.died = damage(ctx, unit, 2);
    undo.damageRecords.push(record);
    if (record.died) {
      undo.selfLosses.push(unit);
      resolveExplosions(ctx, [unit], undo.damageRecords, undo.selfLosses);
    }
    undo.terrainRecords.push({ kind, row, col, prop, unit, gained: 0 });
  } else if (kind === 'web') {
    xorUnitHash(ctx, unit, row, col);
    unit.immobilized = true;
    xorUnitHash(ctx, unit, row, col);
    undo.terrainRecords.push({ kind, row, col, prop, unit, gained: 0 });
  } else {
    // stone and flag are impassable, so getValidDeployCells/getValidMoves never land here.
    return;
  }

  ctx.mapProps[row][col] = null;
  xorPropHash(ctx, cell, kind);
}

function restoreTerrain(ctx, undo) {
  for (let i = undo.terrainRecords.length - 1; i >= 0; i--) {
    const record = undo.terrainRecords[i];
    const { kind, row, col, prop, unit } = record;

    ctx.mapProps[row][col] = prop;
    xorPropHash(ctx, row * ctx.size + col, kind);

    if (kind === 'potion' && record.gained > 0) {
      xorUnitHash(ctx, unit, unit.row, unit.col);
      unit.hp -= record.gained;
      xorUnitHash(ctx, unit, unit.row, unit.col);
    } else if (kind === 'web') {
      xorUnitHash(ctx, unit, row, col);
      unit.immobilized = false;
      xorUnitHash(ctx, unit, row, col);
    }
  }
}

function applyPoisonTicksInPlace(ctx, damageRecords, selfLosses, skipRecords) {
  const { board, size } = ctx;
  const directKills = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const unit = board[r][c];
      if (!unit?.poisoned || unit.team !== ctx.turn) continue;
      if (unit.poisonFresh) {
        xorUnitHash(ctx, unit, r, c);
        unit.poisonFresh = false;
        xorUnitHash(ctx, unit, r, c);
        skipRecords.push({ unit });
        continue;
      }
      const record = { unit, prevHp: unit.hp, row: r, col: c, died: false };
      record.died = damage(ctx, unit, 1);
      damageRecords.push(record);
      if (record.died) directKills.push(unit);
    }
  }

  if (directKills.length > 0) {
    resolveExplosions(ctx, directKills, damageRecords, selfLosses);
  }
}

function applyPassivePriestBlessings(ctx, team, records, excludePriestIds = []) {
  const excluded = new Set(excludePriestIds);
  const priests = [];
  for (const row of ctx.board) {
    for (const unit of row) {
      if (unit?.team === team && unit.passiveBlessing && !excluded.has(unit.id)) {
        priests.push(unit);
      }
    }
  }

  const blessedIds = new Set();
  for (const priest of priests) {
    for (const [r, c] of getAdjacentCells(priest.row, priest.col, ctx.size)) {
      const target = ctx.board[r][c];
      if (!target || target.team !== priest.team || target.id === priest.id) continue;
      if (blessedIds.has(target.id)) continue;

      const nextHp = Math.min(target.maxHp, target.hp + 1);
      if (nextHp === target.hp) continue;

      blessedIds.add(target.id);
      records.push({ target, prevHp: target.hp });
      xorUnitHash(ctx, target, r, c);
      target.hp = nextHp;
      xorUnitHash(ctx, target, r, c);
    }
  }
}

/**
 * Applies an action in place.
 *
 * The returned undo record must be passed to unmakeAction in LIFO order. `enemyKills`
 * holds units of the *opposing* team that died, `selfLosses` holds our own units caught
 * in a bomber blast — conflating the two is what made the old evaluator reward suiciding
 * into bombers.
 */
export function makeAction(ctx, action) {
  const actor = ctx.unitsById.get(action.unitId);
  const team = actor.team;
  const undo = {
    action,
    actor,
    team,
    turn: ctx.turn,
    lastMover: ctx.lastMover,
    actionsLeft: ctx.actionsLeft,
    actedAdded: false,
    reserveIndex: -1,
    fromRow: actor.row,
    fromCol: actor.col,
    damageRecords: [],
    // Kept apart from damageRecords: the poison tick lands *after* priest blessings, so a
    // unit that was blessed and then ticked only unwinds to the right hp if the tick is
    // reversed before the blessing.
    turnEndDamage: [],
    terrainRecords: [],
    blessRecords: [],
    possessUndo: null,
    poisonRecords: [],
    poisonSkipRecords: [],
    enemyKills: [],
    selfLosses: [],
  };

  if (action.type === 'deploy') {
    undo.reserveIndex = removeFromReserve(ctx, actor);
    place(ctx, actor, action.row, action.col);
    applyTerrainOnEnter(ctx, actor, undo);
  } else if (action.type === 'move') {
    lift(ctx, actor);
    if (actor.shadowCloneOnMove && undo.fromRow >= 0) {
      const prev = (ctx.shadowClones ?? []).find(
        (clone) => clone.row === undo.fromRow && clone.col === undo.fromCol,
      ) ?? null;
      ctx.shadowClones = placeShadowClone(ctx.shadowClones ?? [], undo.fromRow, undo.fromCol, actor.team);
      undo.shadowCloneUndo = { row: undo.fromRow, col: undo.fromCol, prev };
    }
    place(ctx, actor, action.row, action.col);
    applyTerrainOnEnter(ctx, actor, undo);
  } else if (action.type === 'attack') {
    const target = ctx.unitsById.get(action.targetId);
    let hits;
    if (actor.type === 'mage') {
      hits = getEnemiesOnLine(ctx.board, actor, target.row, target.col);
    } else if (actor.type === 'tower') {
      hits = getTowerTargets(ctx.board, actor);
    } else if (actor.type === 'artillery') {
      hits = getArtilleryTargets(ctx.board, actor).filter((hit) => hit.id === target.id);
    } else {
      hits = canAttackTarget(actor, target) ? [target] : [];
    }

    const directKills = [];
    for (const hit of hits) {
      if (!isOnBoard(hit)) continue;
      const record = { unit: hit, prevHp: hit.hp, row: hit.row, col: hit.col, died: false };
      record.died = damage(ctx, hit, actor.atk);
      undo.damageRecords.push(record);
      if (record.died) {
        directKills.push(hit);
        undo.enemyKills.push(hit);
      }
    }

    if (actor.possessionOnKill) {
      const killIdx = directKills.findIndex((k) => k.id === target.id);
      if (killIdx >= 0) {
        const victim = directKills[killIdx];
        const victimRow = victim.deadRow;
        const victimCol = victim.deadCol;
        // Lift first: applyPossession rewrites the ghost's class, hp and atk, and the
        // hash keys are keyed on those, so xoring it out afterwards would remove an
        // identity that was never xored in.
        lift(ctx, actor);
        undo.possessUndo = {
          actorPrev: applyPossession(actor, victim),
          fromRow: undo.fromRow,
          fromCol: undo.fromCol,
          victimRow,
          victimCol,
        };
        directKills.splice(killIdx, 1);
        undo.enemyKills = undo.enemyKills.filter((k) => k.id !== target.id);
        place(ctx, actor, victimRow, victimCol);
      }
    }

    resolveExplosions(ctx, directKills, undo.damageRecords, undo.selfLosses);

    if (actor.poisonOnHit) {
      for (const hit of hits) {
        if (!isOnBoard(hit) || hit.poisoned) continue;
        const prevPoisoned = hit.poisoned;
        const prevPoisonFresh = hit.poisonFresh;
        const prevAtk = hit.atk;
        xorUnitHash(ctx, hit, hit.row, hit.col);
        applyPoisonEffect(hit);
        xorUnitHash(ctx, hit, hit.row, hit.col);
        undo.poisonRecords.push({
          unit: hit,
          prevPoisoned,
          prevPoisonFresh,
          prevAtk,
        });
      }
    }
  }

  const excludePriestIds = action.type === 'deploy' && actor.passiveBlessing ? [actor.id] : [];
  applyPassivePriestBlessings(ctx, team, undo.blessRecords, excludePriestIds);

  if (!ctx.acted.has(actor.searchIndex)) {
    ctx.acted.add(actor.searchIndex);
    undo.actedAdded = true;
    xorHash(ctx, ctx.zobrist.acted[actor.searchIndex % ctx.zobrist.acted.length]);
  }

  ctx.lastMover = team;
  advanceTurn(ctx, undo);
  return undo;
}

function xorActed(ctx) {
  for (const index of ctx.acted) {
    xorHash(ctx, ctx.zobrist.acted[index % ctx.zobrist.acted.length]);
  }
}

function xorActionsLeft(ctx) {
  xorHash(ctx, ctx.zobrist.actionsLeft[Math.min(ctx.actionsLeft, 7)]);
}

function flipSide(ctx, undo = null) {
  xorHash(ctx, ctx.zobrist.side[TEAM_INDEX[ctx.turn]]);
  ctx.turn = enemyOf(ctx.turn);
  xorHash(ctx, ctx.zobrist.side[TEAM_INDEX[ctx.turn]]);
  const expired = (ctx.shadowClones ?? []).filter((clone) => clone.expiresOnTeamTurnStart === ctx.turn);
  ctx.shadowClones = expireShadowClonesForTurnStart(ctx.shadowClones ?? [], ctx.turn);
  if (undo && expired.length > 0) undo.expiredShadowClones = expired;
  ctx.actionsLeft = ctx.actionsPerTurn;
  xorActed(ctx);
  ctx.actedStack.push(ctx.acted);
  ctx.acted = new Set();
}

function unflipSide(ctx, previousTurn, undo = null) {
  if (undo?.expiredShadowClones?.length) {
    ctx.shadowClones = [...(ctx.shadowClones ?? []), ...undo.expiredShadowClones];
  }
  ctx.acted = ctx.actedStack.pop();
  xorActed(ctx);
  xorHash(ctx, ctx.zobrist.side[TEAM_INDEX[ctx.turn]]);
  ctx.turn = previousTurn;
  xorHash(ctx, ctx.zobrist.side[TEAM_INDEX[ctx.turn]]);
}

function advanceTurn(ctx, undo) {
  xorActionsLeft(ctx);
  ctx.actionsLeft--;
  if (ctx.actionsLeft <= 0) {
    applyPoisonTicksInPlace(ctx, undo.turnEndDamage, undo.selfLosses, undo.poisonSkipRecords);
    flipSide(ctx, undo);
  }
  xorActionsLeft(ctx);
}

function rewindTurn(ctx, undo) {
  xorActionsLeft(ctx);
  if (ctx.turn !== undo.turn) unflipSide(ctx, undo.turn, undo);
  ctx.actionsLeft = undo.actionsLeft;
  xorActionsLeft(ctx);
}

/**
 * Forces the turn over. js/game.js does the same when a side still has actions left but
 * no legal way to use them, so the search has to model it rather than treat it as a
 * terminal position.
 */
export function passTurn(ctx) {
  const undo = {
    turn: ctx.turn,
    actionsLeft: ctx.actionsLeft,
    turnEndDamage: [],
    selfLosses: [],
    poisonSkipRecords: [],
  };
  xorActionsLeft(ctx);
  applyPoisonTicksInPlace(ctx, undo.turnEndDamage, undo.selfLosses, undo.poisonSkipRecords);
  flipSide(ctx, undo);
  xorActionsLeft(ctx);
  return undo;
}

export function unpassTurn(ctx, undo) {
  xorActionsLeft(ctx);
  unflipSide(ctx, undo.turn, undo);
  ctx.actionsLeft = undo.actionsLeft;
  for (const rec of undo.poisonSkipRecords) {
    xorUnitHash(ctx, rec.unit, rec.unit.row, rec.unit.col);
    rec.unit.poisonFresh = true;
    xorUnitHash(ctx, rec.unit, rec.unit.row, rec.unit.col);
  }
  for (let i = undo.turnEndDamage.length - 1; i >= 0; i--) {
    restoreDamaged(ctx, undo.turnEndDamage[i]);
  }
  xorActionsLeft(ctx);
}

export function unmakeAction(ctx, undo) {
  rewindTurn(ctx, undo);
  ctx.lastMover = undo.lastMover;

  if (undo.actedAdded) {
    ctx.acted.delete(undo.actor.searchIndex);
    xorHash(ctx, ctx.zobrist.acted[undo.actor.searchIndex % ctx.zobrist.acted.length]);
  }

  const { action, actor } = undo;

  // Strictly reverse chronological: end-of-turn ticks, then blessings, then the action.
  restoreEndOfTurnEffects(ctx, undo);

  for (let i = undo.blessRecords.length - 1; i >= 0; i--) {
    const { target, prevHp } = undo.blessRecords[i];
    xorUnitHash(ctx, target, target.row, target.col);
    target.hp = prevHp;
    xorUnitHash(ctx, target, target.row, target.col);
  }

  for (let i = undo.poisonRecords.length - 1; i >= 0; i--) {
    const rec = undo.poisonRecords[i];
    xorUnitHash(ctx, rec.unit, rec.unit.row, rec.unit.col);
    rec.unit.poisoned = rec.prevPoisoned;
    rec.unit.poisonFresh = rec.prevPoisonFresh;
    rec.unit.atk = rec.prevAtk;
    xorUnitHash(ctx, rec.unit, rec.unit.row, rec.unit.col);
  }

  if (action.type === 'deploy') {
    restoreActionDamage(ctx, undo);
    restoreTerrain(ctx, undo);
    lift(ctx, actor);
    insertIntoReserve(ctx, actor, undo.reserveIndex);
    return;
  }

  if (action.type === 'move') {
    restoreActionDamage(ctx, undo);
    restoreTerrain(ctx, undo);
    lift(ctx, actor);
    place(ctx, actor, undo.fromRow, undo.fromCol);
    if (undo.shadowCloneUndo) {
      const { row, col, prev } = undo.shadowCloneUndo;
      ctx.shadowClones = (ctx.shadowClones ?? []).filter((clone) => !(clone.row === row && clone.col === col));
      if (prev) ctx.shadowClones.push(prev);
    }
    return;
  }

  if (undo.possessUndo) {
    lift(ctx, actor);
    Object.assign(actor, undo.possessUndo.actorPrev);
    place(ctx, actor, undo.possessUndo.fromRow, undo.possessUndo.fromCol);
  }

  restoreActionDamage(ctx, undo);
}

/** Folds the two hash lanes into one 53-bit-safe integer usable as a Map key. */
export function hashKey(ctx) {
  return (ctx.hashHi & 0x1fffff) * 0x100000000 + (ctx.hashLo >>> 0);
}

export function lineOccupancy(ctx, lineIdx, team) {
  const mine = ctx.lineCount[team][lineIdx];
  const theirs = ctx.lineCount[enemyOf(team)][lineIdx];
  const flags = ctx.flagLineCount[lineIdx];
  return { mine: mine + flags, theirs, empty: ctx.winLength - mine - theirs - flags };
}

/** A completed line may combine a team's units with neutral red-blue flags. */
export function hasCompletedLine(ctx, team) {
  const counts = ctx.lineCount[team];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] + ctx.flagLineCount[i] === ctx.winLength) return true;
  }
  return false;
}

export function isEliminated(ctx, team) {
  return ctx.onBoard[team] === 0 && ctx.reserves[team].length === 0;
}

export function forEachUnit(ctx, callback) {
  const { board, size } = ctx;
  for (let r = 0; r < size; r++) {
    const row = board[r];
    for (let c = 0; c < size; c++) {
      const unit = row[c];
      if (unit) callback(unit, r, c);
    }
  }
}
