import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BOARD_MODES,
  TEAM,
  CLASSES,
  getBoardMode,
  createEmptyBoard,
  createTeamReserve,
} from '../../../shared/units.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidDeployCells,
  applyMove,
  applyDeploy,
  applyAttack,
  applyTeamPriestBlessings,
  applyPoisonTurnTicks,
  checkWin,
  isTeamEliminated,
  resolveDeathExplosions,
} from '../../../shared/rules.js';
import { isObstacleCell } from '../../../shared/mapPropUtils.js';
import { MATCHMAKING_TIMEOUT_MS } from '../../../shared/protocol.js';
import { pool } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

async function loadMapProps() {
  const mod = await import(pathToFileURL(path.join(repoRoot, 'apps/web/js/mapProps.js')).href);
  return mod;
}

async function loadAiEvaluate() {
  const boardMod = await import(pathToFileURL(path.join(repoRoot, 'apps/web/js/ai/board.js')).href);
  const evalMod = await import(pathToFileURL(path.join(repoRoot, 'apps/web/js/ai/evaluate.js')).href);
  return { createSearchContext: boardMod.createSearchContext, evaluate: evalMod.evaluate };
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WAITING_TTL_MS = 10 * 60 * 1000;
const MATCHMAKING_TTL_MS = MATCHMAKING_TIMEOUT_MS + 5000;
const FINISHED_TTL_MS = 24 * 60 * 60 * 1000;
const RECONNECT_WINDOW_MS = 30 * 60 * 1000;

let mapPropsModule = null;
let aiEvaluate = null;

async function ensureDeps() {
  if (!mapPropsModule) mapPropsModule = await loadMapProps();
  if (!aiEvaluate) aiEvaluate = await loadAiEvaluate();
  return { mapPropsModule, aiEvaluate };
}

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
  }
  return code;
}

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function createGameState(boardMode, rng = Math.random) {
  const mode = getBoardMode(boardMode);
  const roster = [...mode.roster];
  const { generateMapProps } = mapPropsModule;

  return {
    boardMode,
    phase: 'battle',
    currentPlayer: 'blue',
    board: createEmptyBoard(mode.size),
    mapProps: generateMapProps(mode.size, rng),
    blueRoster: [...roster],
    redRoster: [...roster],
    blueReserve: createTeamReserve(roster, 'blue'),
    redReserve: createTeamReserve(roster, 'red'),
    actedUnitIds: [],
    actionsRemaining: mode.actionsPerTurn,
    message: `${TEAM.blue.name}先攻：每回合 ${mode.actionsPerTurn} 次行動`,
    lastWinLine: null,
    endReason: null,
    finalScores: null,
  };
}

export function serializePublicState(state, viewerTeam = null) {
  const mode = getBoardMode(state.boardMode);
  return {
    ...state,
    boardSize: mode.size,
    winCount: mode.size,
    turnDurationMs: mode.turnDurationMs,
    turnBonusMs: mode.turnBonusMs,
    matchDurationMs: mode.matchDurationMs,
    actionsPerTurn: mode.actionsPerTurn,
    isHumanTurn: viewerTeam ? state.currentPlayer === viewerTeam && state.phase === 'battle' : false,
    yourTeam: viewerTeam,
    onlineMode: true,
    itemsDisabled: true,
  };
}

function getMode(state) {
  return getBoardMode(state.boardMode);
}

function hasValidActionsForTeam(state, team) {
  const reserve = team === 'blue' ? state.blueReserve : state.redReserve;
  const deployCells = getValidDeployCells(state.board, state.mapProps);
  if (deployCells.length > 0 && reserve.length > 0) return true;

  for (const row of state.board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || state.actedUnitIds.includes(unit.id)) continue;
      if (getValidMoves(state.board, unit, state.mapProps).length > 0) return true;
      if (getValidAttackTargets(state.board, unit).length > 0) return true;
    }
  }
  return false;
}

function applyTerrainAfterLanding(state, unitId, row, col) {
  const { resolveMapPropOnEnter } = mapPropsModule;
  const result = resolveMapPropOnEnter(state.board, state.mapProps, row, col, unitId);
  state.board = result.board;
  state.mapProps = result.mapProps;
  return { events: result.events ?? [], trigger: result.trigger ?? null };
}

function packActionFx(terrainTrigger, blessingFx) {
  return {
    terrain: terrainTrigger ?? null,
    blessing: blessingFx ?? null,
  };
}

function buildBlessingFx(targets) {
  if (!targets?.length) return null;
  return {
    targets: targets.map((t) => ({ row: t.row, col: t.col, amount: 1 })),
  };
}

function checkWinAfterEffect(state, detail) {
  if (state.phase !== 'battle') return true;

  const winLine = checkWin(state.board, state.currentPlayer, state.mapProps);
  if (winLine) {
    state.lastWinLine = winLine;
    finishGame(state, state.currentPlayer, `${TEAM[state.currentPlayer].name} ${detail}後連成 ${getMode(state).size} 子！`, 'line');
    return true;
  }

  const enemy = state.currentPlayer === 'blue' ? 'red' : 'blue';
  const enemyReserve = enemy === 'blue' ? state.blueReserve : state.redReserve;
  if (isTeamEliminated(state.board, enemy, enemyReserve)) {
    state.lastWinLine = null;
    finishGame(state, state.currentPlayer, `${TEAM[state.currentPlayer].name} ${detail}後全滅對手！`, 'elimination');
    return true;
  }

  state.message = detail;
  return false;
}

function applyTurnBoundaryEffects(state, endedTeam) {
  const bombs = state.pendingBombs ?? [];
  if (bombs.length > 0) {
    state.pendingBombs = [];
    // Online MVP: no item bombs
  }

  const hasPoisoned = state.board.some((row) =>
    row.some((unit) => unit?.poisoned && unit.team === endedTeam),
  );
  if (!hasPoisoned) return false;

  const result = applyPoisonTurnTicks(state.board, endedTeam);
  state.board = result.board;

  const labels = result.ticks.map(({ unit }) => {
    const cls = CLASSES[unit.classId];
    return `${cls?.name ?? '單位'} -1（中毒）`;
  });
  if (result.explosions?.length > 0) {
    const blastHits = result.explosions.reduce((n, e) => n + e.targets.length, 0);
    labels.push(`自爆波及 ${blastHits} 人`);
  }

  const detail = labels.length > 0 ? `☠️ 中毒結算：${labels.join('、')}` : '☠️ 中毒結算';
  return checkWinAfterEffect(state, detail);
}

function switchPlayer(state) {
  const endedTeam = state.currentPlayer;
  state.currentPlayer = state.currentPlayer === 'blue' ? 'red' : 'blue';
  const mode = getMode(state);
  state.actionsRemaining = mode.actionsPerTurn;
  state.actedUnitIds = [];

  if (applyTurnBoundaryEffects(state, endedTeam)) return;

  state.message = `${TEAM[state.currentPlayer].name}回合（剩餘 ${state.actionsRemaining}/${mode.actionsPerTurn} 次行動）`;
}

function finishGame(state, winner, detail, reason) {
  state.phase = 'gameEnd';
  state.endReason = reason;
  state.message = winner ? detail : detail;
  state.winner = winner;
}

function endAction(state, actionLabel, unitId, { isDeploy = false } = {}) {
  const team = state.currentPlayer;
  const enemy = team === 'blue' ? 'red' : 'blue';
  const enemyReserve = enemy === 'blue' ? state.blueReserve : state.redReserve;

  const actingUnit = state.board.flat().find((u) => u?.id === unitId);
  const excludePriestIds = isDeploy && actingUnit?.passiveBlessing ? [unitId] : [];
  const blessing = applyTeamPriestBlessings(state.board, team, excludePriestIds);
  const blessingFx = buildBlessingFx(blessing.targets);
  if (blessing.targets.length > 0) {
    actionLabel += ` · 祝福 ${blessing.targets.length} 名友軍`;
    state.board = blessing.board;
  }

  const withFx = (result) => ({ ...result, actionFx: packActionFx(null, blessingFx) });

  state.actedUnitIds.push(unitId);
  state.actionsRemaining -= 1;

  const winLine = checkWin(state.board, team, state.mapProps);
  if (winLine) {
    state.lastWinLine = winLine;
    finishGame(state, team, `${TEAM[team].name} ${actionLabel}後連成 ${getMode(state).size} 子！`, 'line');
    return withFx({ ok: true, ended: true });
  }

  if (isTeamEliminated(state.board, enemy, enemyReserve)) {
    state.lastWinLine = null;
    finishGame(state, team, `${TEAM[team].name} ${actionLabel}後全滅對手！`, 'elimination');
    return withFx({ ok: true, ended: true });
  }

  if (state.actionsRemaining > 0) {
    if (!hasValidActionsForTeam(state, team)) {
      state.message = `${actionLabel} — 無更多可行動，換 ${TEAM[enemy].name}回合`;
      switchPlayer(state);
      return withFx({ ok: true, ended: state.phase === 'gameEnd', turnEnded: true });
    }
    state.message = `${actionLabel} — 還可行動 ${state.actionsRemaining} 次`;
    return withFx({ ok: true, ended: false });
  }

  state.message = actionLabel;
  switchPlayer(state);
  return withFx({ ok: true, ended: state.phase === 'gameEnd', turnEnded: true });
}

export function applyGameAction(state, action, team) {
  if (state.phase !== 'battle') {
    return { ok: false, error: '對局已結束' };
  }
  if (state.currentPlayer !== team) {
    return { ok: false, error: '尚未輪到你' };
  }

  if (action.type === 'deploy') {
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;
    const unit = reserve.find((u) => u.id === action.unitId);
    if (!unit) return { ok: false, error: '無此後備單位' };
    if (state.board[action.row]?.[action.col] || isObstacleCell(state.mapProps, action.row, action.col)) {
      return { ok: false, error: '無法部署於此' };
    }
    if (state.actedUnitIds.includes(unit.id)) return { ok: false, error: '此單位已行動' };

    const result = applyDeploy(state.board, unit, action.row, action.col);
    state.board = result.board;
    if (team === 'blue') {
      state.blueReserve = state.blueReserve.filter((u) => u.id !== unit.id);
    } else {
      state.redReserve = state.redReserve.filter((u) => u.id !== unit.id);
    }

    const terrain = applyTerrainAfterLanding(state, unit.id, action.row, action.col);
    const label = `部署 ${CLASSES[unit.classId].name}`;
    const detail = terrain.events.length > 0 ? `${label} · ${terrain.events.join('、')}` : label;
    if (checkWinAfterEffect(state, detail)) {
      return { ok: true, ended: true, actionFx: packActionFx(terrain.trigger, null) };
    }
    const endResult = endAction(state, detail, unit.id, { isDeploy: true });
    return {
      ...endResult,
      actionFx: packActionFx(terrain.trigger, endResult.actionFx?.blessing),
    };
  }

  if (action.type === 'move') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    if (!unit || unit.team !== team) return { ok: false, error: '無此單位' };
    if (state.actedUnitIds.includes(unit.id)) return { ok: false, error: '此單位已行動' };

    const valid = getValidMoves(state.board, unit, state.mapProps);
    if (!valid.some(([r, c]) => r === action.row && c === action.col)) {
      return { ok: false, error: '無法移動至此' };
    }

    const result = applyMove(state.board, unit, action.row, action.col);
    state.board = result.board;
    const terrain = applyTerrainAfterLanding(state, unit.id, action.row, action.col);
    const detail = terrain.events.length > 0 ? `移動 · ${terrain.events.join('、')}` : '移動';
    if (checkWinAfterEffect(state, detail)) {
      return { ok: true, ended: true, actionFx: packActionFx(terrain.trigger, null) };
    }
    const endResult = endAction(state, detail, unit.id);
    return {
      ...endResult,
      actionFx: packActionFx(terrain.trigger, endResult.actionFx?.blessing),
    };
  }

  if (action.type === 'attack') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    const target = state.board[action.row]?.[action.col];
    if (!unit || unit.team !== team) return { ok: false, error: '無此單位' };
    if (!target || target.team === unit.team) return { ok: false, error: '無效目標' };
    if (state.actedUnitIds.includes(unit.id)) return { ok: false, error: '此單位已行動' };

    const valid = getValidAttackTargets(state.board, unit);
    if (!valid.some((t) => t.id === target.id)) {
      return { ok: false, error: '無法攻擊此目標' };
    }

    const result = applyAttack(state.board, unit, target);
    state.board = result.board;

    let detail = `攻擊（命中 ${result.hits.length} 個目標`;
    if (result.possessed?.length > 0) detail += '，幽魂附身';
    if (result.poisoned?.length > 0) detail += `，${result.poisoned.length} 人中毒`;
    if (result.explosions?.length > 0) {
      const blastHits = result.explosions.reduce((n, e) => n + e.targets.length, 0);
      detail += `，自爆波及 ${blastHits} 人`;
    }
    detail += '）';

    return endAction(state, detail, unit.id);
  }

  return { ok: false, error: '未知行動' };
}

export function endTurnEarly(state, team) {
  if (state.phase !== 'battle' || state.currentPlayer !== team) {
    return { ok: false, error: '無法結束回合' };
  }
  state.actionsRemaining = 0;
  switchPlayer(state);
  return { ok: true, ended: state.phase === 'gameEnd', turnEnded: true };
}

export function surrender(state, team) {
  if (state.phase !== 'battle') return { ok: false, error: '對局已結束' };
  const winner = team === 'blue' ? 'red' : 'blue';
  finishGame(state, winner, `${TEAM[team].name}投降`, 'surrender');
  return { ok: true, ended: true };
}

export function forfeitDisconnect(state, team) {
  if (state.phase !== 'battle') return { ok: false, error: '對局已結束' };
  const winner = team === 'blue' ? 'red' : 'blue';
  finishGame(state, winner, `${TEAM[team].name}斷線逾時`, 'disconnect');
  return { ok: true, ended: true };
}

export async function endMatchByTime(state) {
  const { createSearchContext, evaluate } = aiEvaluate;
  const mode = getMode(state);
  const context = createSearchContext(
    {
      board: state.board,
      mapProps: state.mapProps,
      blueReserve: state.blueReserve,
      redReserve: state.redReserve,
      actedUnitIds: new Set(state.actedUnitIds),
    },
    {
      team: state.currentPlayer,
      actionsPerTurn: mode.actionsPerTurn,
    },
  );
  const blueScore = evaluate(context, 'blue');
  const redScore = evaluate(context, 'red');
  const winner = blueScore === redScore ? null : blueScore > redScore ? 'blue' : 'red';

  state.finalScores = { blue: blueScore, red: redScore };
  finishGame(
    state,
    winner,
    `時間到 · 最終分數：藍隊 ${blueScore}｜紅隊 ${redScore}`,
    'timeout',
  );
  return { ok: true, ended: true };
}

export function computeTimers(matchRow, state) {
  const mode = getBoardMode(state.boardMode);
  const now = Date.now();

  if (matchRow.status !== 'playing' || state.phase !== 'battle') {
    return { turnRemainingMs: 0, matchRemainingMs: 0, timersPaused: false };
  }

  const turnDeadline = matchRow.turn_deadline_at
    ? new Date(matchRow.turn_deadline_at).getTime()
    : now + mode.turnDurationMs;
  const matchDeadline = matchRow.match_deadline_at
    ? new Date(matchRow.match_deadline_at).getTime()
    : now + mode.matchDurationMs;

  return {
    turnRemainingMs: Math.max(0, turnDeadline - now),
    matchRemainingMs: Math.max(0, matchDeadline - now),
    timersPaused: Boolean(matchRow.timers_paused),
  };
}

export function resetTurnDeadline(mode, actedCount = 0) {
  const bonus = actedCount * (mode.turnBonusMs ?? 0);
  const duration = mode.turnDurationMs + bonus;
  const now = new Date();
  return {
    turn_started_at: now,
    turn_deadline_at: new Date(now.getTime() + duration),
    turn_bonus_ms: bonus,
  };
}

export async function createWaitingRoom(guestId, boardMode, nickname, options = {}) {
  await ensureDeps();
  const { matchmaking = false, q = pool } = options;

  let roomCode = generateRoomCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await q.query(
      "SELECT id FROM matches WHERE room_code = $1 AND status = 'waiting'",
      [roomCode],
    );
    if (existing.rows.length === 0) break;
    roomCode = generateRoomCode();
  }

  const ttl = matchmaking ? MATCHMAKING_TTL_MS : WAITING_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const state = { waiting: true, hostGuestId: guestId, boardMode, matchmaking };

  const { rows } = await q.query(
    `INSERT INTO matches (room_code, board_mode, status, blue_guest_id, state, expires_at)
     VALUES ($1, $2, 'waiting', $3, $4, $5)
     RETURNING *`,
    [roomCode, boardMode, guestId, JSON.stringify(state), expiresAt],
  );

  if (nickname) {
    await q.query('UPDATE guests SET nickname = $1 WHERE id = $2', [nickname, guestId]);
  }

  return rows[0];
}

export async function joinRoom(guestId, roomCode, nickname, q = pool) {
  await ensureDeps();

  const { rows } = await q.query(
    "SELECT * FROM matches WHERE room_code = $1 AND status = 'waiting' FOR UPDATE",
    [roomCode.toUpperCase()],
  );
  const match = rows[0];
  if (!match) return { ok: false, error: '房間不存在或已開始' };
  if (match.blue_guest_id === guestId) return { ok: false, error: '你已在房間中' };
  if (match.red_guest_id) return { ok: false, error: '房間已滿' };

  if (nickname) {
    await q.query('UPDATE guests SET nickname = $1 WHERE id = $2', [nickname, guestId]);
  }

  const seed = crypto.createHash('sha256').update(match.id).digest();
  const seedNum = seed.readUInt32BE(0);
  const rng = seededRng(seedNum);
  const blueGuestId = match.blue_guest_id;
  const redGuestId = guestId;

  const gameState = createGameState(match.board_mode, rng);
  const mode = getBoardMode(match.board_mode);
  const now = new Date();
  const matchDeadline = new Date(now.getTime() + mode.matchDurationMs);
  const turnFields = resetTurnDeadline(mode, 0);

  const { rows: updated } = await q.query(
    `UPDATE matches SET
       status = 'playing',
       blue_guest_id = $1,
       red_guest_id = $2,
       state = $3,
       match_started_at = $4,
       match_deadline_at = $5,
       turn_started_at = $6,
       turn_deadline_at = $7,
       turn_bonus_ms = $8,
       expires_at = $9
     WHERE id = $10
     RETURNING *`,
    [
      blueGuestId,
      redGuestId,
      JSON.stringify(gameState),
      now,
      matchDeadline,
      turnFields.turn_started_at,
      turnFields.turn_deadline_at,
      turnFields.turn_bonus_ms,
      new Date(now.getTime() + RECONNECT_WINDOW_MS),
      match.id,
    ],
  );

  return {
    ok: true,
    match: updated[0],
    teams: {
      [blueGuestId]: 'blue',
      [redGuestId]: 'red',
    },
  };
}

export async function findMatch(guestId, boardMode, nickname) {
  await ensureDeps();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM matches
       WHERE status IN ('waiting', 'playing')
         AND (blue_guest_id = $1 OR red_guest_id = $1)
       LIMIT 1`,
      [guestId],
    );
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, error: '你已在其他房間' };
    }

    const { rows } = await client.query(
      `SELECT * FROM matches
       WHERE status = 'waiting'
         AND board_mode = $1
         AND (state->>'matchmaking') = 'true'
         AND blue_guest_id IS DISTINCT FROM $2
         AND red_guest_id IS NULL
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [boardMode, guestId],
    );

    if (rows[0]) {
      const result = await joinRoom(guestId, rows[0].room_code, nickname, client);
      if (!result.ok) {
        await client.query('ROLLBACK');
        return result;
      }
      await client.query('COMMIT');
      return result;
    }

    const match = await createWaitingRoom(guestId, boardMode, nickname, {
      matchmaking: true,
      q: client,
    });
    await client.query('COMMIT');
    return { ok: true, waiting: true, match };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // already rolled back or connection lost
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function getMatchById(matchId) {
  const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [matchId]);
  return rows[0] ?? null;
}

export async function getActiveMatchForGuest(guestId) {
  const { rows } = await pool.query(
    `SELECT * FROM matches
     WHERE status IN ('waiting', 'playing')
       AND (blue_guest_id = $1 OR red_guest_id = $1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [guestId],
  );
  return rows[0] ?? null;
}

/** 取消 waiting 房間（房主刪除房間；加入者僅解除綁定） */
export async function cancelWaitingRoom(guestId) {
  const match = await getActiveMatchForGuest(guestId);
  if (!match) return { ok: true, hadRoom: false };
  if (match.status !== 'waiting') {
    return { ok: false, error: '對局進行中，無法取消房間' };
  }

  if (match.blue_guest_id === guestId) {
    await pool.query('DELETE FROM matches WHERE id = $1 AND status = $2', [match.id, 'waiting']);
    return { ok: true, hadRoom: true, matchId: match.id, cancelled: true };
  }

  if (match.red_guest_id === guestId) {
    await pool.query(
      'UPDATE matches SET red_guest_id = NULL WHERE id = $1 AND status = $2',
      [match.id, 'waiting'],
    );
    return { ok: true, hadRoom: true, matchId: match.id, leftAsGuest: true };
  }

  return { ok: true, hadRoom: false };
}

export async function updateMatchState(matchId, state, extra = {}) {
  const fields = ['state = $2'];
  const values = [matchId, JSON.stringify(state)];
  let idx = 3;

  for (const key of ['turn_started_at', 'turn_deadline_at', 'match_deadline_at', 'status', 'winner', 'end_reason', 'expires_at', 'timers_paused']) {
    if (extra[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(extra[key]);
      idx += 1;
    }
  }

  const { rows } = await pool.query(
    `UPDATE matches SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0];
}

export async function persistActionResult(matchId, state, { turnEnded = false, ended = false } = {}) {
  const mode = getBoardMode(state.boardMode);
  const extra = { state: JSON.stringify(state) };

  if (ended) {
    extra.status = 'finished';
    extra.winner = state.winner ?? null;
    extra.end_reason = state.endReason;
    extra.expires_at = new Date(Date.now() + FINISHED_TTL_MS);
  } else if (turnEnded) {
    const turnFields = resetTurnDeadline(mode, 0);
    extra.turn_started_at = turnFields.turn_started_at;
    extra.turn_deadline_at = turnFields.turn_deadline_at;
    extra.turn_bonus_ms = turnFields.turn_bonus_ms;
  } else {
    const actedCount = state.actedUnitIds.length;
    const turnFields = resetTurnDeadline(mode, actedCount);
    extra.turn_started_at = turnFields.turn_started_at;
    extra.turn_deadline_at = turnFields.turn_deadline_at;
    extra.turn_bonus_ms = turnFields.turn_bonus_ms;
  }

  const sets = ['state = $2'];
  const values = [matchId, JSON.stringify(state)];
  let idx = 3;
  for (const [key, val] of Object.entries(extra)) {
    if (key === 'state') continue;
    sets.push(`${key} = $${idx}`);
    values.push(val);
    idx += 1;
  }

  const { rows } = await pool.query(
    `UPDATE matches SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0];
}

export async function cleanupExpiredMatches() {
  await pool.query(
    `DELETE FROM matches
     WHERE (status = 'waiting' AND expires_at < now())
        OR (status = 'finished' AND expires_at < now())`,
  );
}

export function guestTeam(match, guestId) {
  if (match.blue_guest_id === guestId) return 'blue';
  if (match.red_guest_id === guestId) return 'red';
  return null;
}

export async function initMatchService() {
  await ensureDeps();
}
