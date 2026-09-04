import { MSG } from '../../../shared/protocol.js';
import { pool } from '../db.js';
import * as room from './messages.js';
import {
  joinRoom,
  createWaitingRoom,
  getActiveMatchForGuest,
  getMatchById,
  applyGameAction,
  surrender,
  endTurnEarly,
  endMatchByTime,
  persistActionResult,
  serializePublicState,
  computeTimers,
  guestTeam,
  initMatchService,
} from '../services/match.js';
import { updateGuestNickname } from '../services/guest.js';

/** @type {Map<string, ReturnType<typeof setInterval>>} */
const timerLoops = new Map();

/** @type {Map<string, number>} disconnectedAt guestId -> timestamp */
const disconnectedAt = new Map();

function parseState(match) {
  if (typeof match.state === 'string') return JSON.parse(match.state);
  return match.state ?? {};
}

function err(ws, message, code = 'ERROR', reqId) {
  room.send(ws, MSG.ERROR, { code, message }, reqId);
}

function roomStatePayload(match, guests) {
  const players = [];
  if (match.blue_guest_id) {
    const g = guests.find((x) => x.id === match.blue_guest_id);
    players.push({ guestId: match.blue_guest_id, nickname: g?.nickname ?? '玩家 1', slot: 'host' });
  }
  if (match.red_guest_id) {
    const g = guests.find((x) => x.id === match.red_guest_id);
    players.push({ guestId: match.red_guest_id, nickname: g?.nickname ?? '玩家 2', slot: 'guest' });
  }
  return {
    roomCode: match.room_code,
    boardMode: match.board_mode,
    status: match.status,
    players,
  };
}

async function fetchGuestNicknames(match) {
  const ids = [match.blue_guest_id, match.red_guest_id].filter(Boolean);
  if (ids.length === 0) return [];
  const { rows } = await pool.query(
    'SELECT id, nickname FROM guests WHERE id = ANY($1)',
    [ids],
  );
  return rows;
}

function gamePayload(match, state, team) {
  return {
    state: serializePublicState(state, team),
    yourTeam: team,
    timers: computeTimers(match, state),
    roomCode: match.room_code,
  };
}

function stopTimerLoop(matchId) {
  const id = timerLoops.get(matchId);
  if (id) {
    clearInterval(id);
    timerLoops.delete(matchId);
  }
}

async function finishFromTimers(matchId) {
  const match = await getMatchById(matchId);
  if (!match || match.status !== 'playing') return;

  const state = parseState(match);
  if (state.phase !== 'battle') return;

  await endMatchByTime(state);
  const updated = await persistActionResult(matchId, state, { ended: true });
  stopTimerLoop(matchId);

  room.broadcastMatch(matchId, MSG.GAME_OVER, (conn) => ({
    ...gamePayload(updated, state, conn.team),
    winner: state.winner,
    reason: state.endReason,
  }));
}

async function handleTurnTimeout(matchId) {
  const match = await getMatchById(matchId);
  if (!match || match.status !== 'playing') return;

  const state = parseState(match);
  if (state.phase !== 'battle') return;

  const team = state.currentPlayer;
  const result = endTurnEarly(state, team);
  if (!result.ok) return;

  const updated = await persistActionResult(matchId, state, {
    turnEnded: result.turnEnded,
    ended: result.ended,
  });

  if (result.ended) {
    stopTimerLoop(matchId);
    room.broadcastMatch(matchId, MSG.GAME_OVER, (conn) => ({
      ...gamePayload(updated, state, conn.team),
      winner: state.winner,
      reason: state.endReason,
    }));
    return;
  }

  room.broadcastMatch(matchId, MSG.GAME_UPDATE, (conn) => ({
    ...gamePayload(updated, state, conn.team),
    lastAction: { type: 'turn_timeout', team },
  }));
}

function ensureTimerLoop(matchId) {
  if (timerLoops.has(matchId)) return;

  const interval = setInterval(async () => {
    try {
      const match = await getMatchById(matchId);
      if (!match || match.status !== 'playing') {
        stopTimerLoop(matchId);
        return;
      }

      if (match.timers_paused) return;

      const state = parseState(match);
      const timers = computeTimers(match, state);

      if (timers.matchRemainingMs <= 0) {
        await finishFromTimers(matchId);
        return;
      }

      if (timers.turnRemainingMs <= 0) {
        await handleTurnTimeout(matchId);
      }
    } catch (e) {
      console.error('Timer loop error', e);
    }
  }, 1000);

  timerLoops.set(matchId, interval);
}

async function setTimersPaused(matchId, paused) {
  await pool.query('UPDATE matches SET timers_paused = $1 WHERE id = $2', [paused, matchId]);
}

function countConnected(matchId) {
  return room.getMatchConnections(matchId).filter((c) => c.ws.readyState === c.ws.OPEN).length;
}

async function onDisconnect(guestId) {
  const conn = room.getConnection(guestId);
  if (!conn?.matchId) return;

  disconnectedAt.set(guestId, Date.now());
  const match = await getMatchById(conn.matchId);
  if (!match || match.status !== 'playing') return;

  const others = room.getMatchConnections(conn.matchId).filter((c) => c.guestId !== guestId);
  const othersOnline = others.some((c) => c.ws.readyState === c.ws.OPEN);
  if (!othersOnline) {
    await setTimersPaused(conn.matchId, true);
  }
}

async function onReconnectBind(guestId, matchId) {
  disconnectedAt.delete(guestId);
  const match = await getMatchById(matchId);
  if (match?.status === 'playing') {
    await setTimersPaused(matchId, false);
    ensureTimerLoop(matchId);
  }
}

export async function handleWsMessage(ws, guest, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    err(ws, '無效的 JSON');
    return;
  }

  const { type, payload = {}, reqId } = msg;

  switch (type) {
    case MSG.CREATE_ROOM: {
      const boardMode = payload.boardMode;
      if (!['3x3', '4x4', '5x5'].includes(boardMode)) {
        err(ws, '無效的棋盤模式', 'INVALID_MODE', reqId);
        return;
      }

      const existing = await getActiveMatchForGuest(guest.id);
      if (existing) {
        err(ws, '你已在其他房間', 'ALREADY_IN_ROOM', reqId);
        return;
      }

      if (payload.nickname) await updateGuestNickname(guest.id, payload.nickname);

      const match = await createWaitingRoom(guest.id, boardMode, payload.nickname);
      room.bindMatch(guest.id, match.id, null);
      const guests = await fetchGuestNicknames(match);
      room.send(ws, MSG.ROOM_STATE, roomStatePayload(match, guests), reqId);
      break;
    }

    case MSG.JOIN_ROOM: {
      const code = String(payload.roomCode ?? '').toUpperCase();
      if (!code) {
        err(ws, '請輸入房間碼', 'INVALID_CODE', reqId);
        return;
      }

      const existing = await getActiveMatchForGuest(guest.id);
      if (existing && existing.room_code !== code) {
        err(ws, '你已在其他房間', 'ALREADY_IN_ROOM', reqId);
        return;
      }

      const result = await joinRoom(guest.id, code, payload.nickname);
      if (!result.ok) {
        err(ws, result.error, 'JOIN_FAILED', reqId);
        return;
      }

      const { match, teams } = result;
      const state = parseState(match);

      for (const [guestId, team] of Object.entries(teams)) {
        room.bindMatch(guestId, match.id, team);
        await onReconnectBind(guestId, match.id);
      }

      ensureTimerLoop(match.id);

      for (const conn of room.getMatchConnections(match.id)) {
        room.send(
          conn.ws,
          MSG.GAME_START,
          gamePayload(match, state, conn.team),
          conn.guestId === guest.id ? reqId : undefined,
        );
      }
      break;
    }

    case MSG.SUBMIT_ACTION: {
      const conn = room.getConnection(guest.id);
      if (!conn?.matchId || !conn.team) {
        err(ws, '尚未加入對局', 'NOT_IN_GAME', reqId);
        return;
      }

      const match = await getMatchById(conn.matchId);
      if (!match || match.status !== 'playing') {
        err(ws, '對局未進行中', 'NOT_PLAYING', reqId);
        return;
      }

      const state = parseState(match);
      const result = applyGameAction(state, payload.action, conn.team);
      if (!result.ok) {
        err(ws, result.error, 'INVALID_ACTION', reqId);
        return;
      }

      const updated = await persistActionResult(conn.matchId, state, {
        turnEnded: result.turnEnded,
        ended: result.ended,
      });

      if (result.ended) {
        stopTimerLoop(conn.matchId);
        room.broadcastMatch(conn.matchId, MSG.GAME_OVER, (c) => ({
          ...gamePayload(updated, state, c.team),
          winner: state.winner,
          reason: state.endReason,
        }));
        break;
      }

      room.broadcastMatch(conn.matchId, MSG.GAME_UPDATE, (c) => ({
        ...gamePayload(updated, state, c.team),
        lastAction: payload.action,
      }));
      break;
    }

    case MSG.SURRENDER: {
      const conn = room.getConnection(guest.id);
      if (!conn?.matchId || !conn.team) {
        err(ws, '尚未加入對局', 'NOT_IN_GAME', reqId);
        return;
      }

      const match = await getMatchById(conn.matchId);
      const state = parseState(match);
      const result = surrender(state, conn.team);
      if (!result.ok) {
        err(ws, result.error, 'SURRENDER_FAILED', reqId);
        return;
      }

      const updated = await persistActionResult(conn.matchId, state, { ended: true });
      stopTimerLoop(conn.matchId);

      room.broadcastMatch(conn.matchId, MSG.GAME_OVER, (c) => ({
        ...gamePayload(updated, state, c.team),
        winner: state.winner,
        reason: state.endReason,
      }));
      break;
    }

    case MSG.RECONNECT: {
      let match = await getActiveMatchForGuest(guest.id);
      if (!match && payload.roomCode) {
        const { rows } = await pool.query(
          "SELECT * FROM matches WHERE room_code = $1 AND status IN ('waiting','playing')",
          [String(payload.roomCode).toUpperCase()],
        );
        match = rows[0] ?? null;
      }

      if (!match) {
        err(ws, '找不到可重連的對局', 'NO_MATCH', reqId);
        return;
      }

      const team = guestTeam(match, guest.id);
      if (!team && match.status === 'playing') {
        err(ws, '你不屬於此對局', 'NOT_MEMBER', reqId);
        return;
      }

      room.bindMatch(guest.id, match.id, team);
      await onReconnectBind(guest.id, match.id);

      if (match.status === 'waiting') {
        const guests = await fetchGuestNicknames(match);
        room.send(ws, MSG.ROOM_STATE, roomStatePayload(match, guests), reqId);
        break;
      }

      const state = parseState(match);
      if (state.phase === 'gameEnd' || match.status === 'finished') {
        room.send(ws, MSG.GAME_OVER, {
          ...gamePayload(match, state, team),
          winner: state.winner ?? match.winner,
          reason: state.endReason ?? match.end_reason,
        }, reqId);
        break;
      }

      ensureTimerLoop(match.id);
      room.send(ws, MSG.GAME_START, gamePayload(match, state, team), reqId);
      break;
    }

    default:
      err(ws, `未知訊息類型: ${type}`, 'UNKNOWN', reqId);
  }
}

export { onDisconnect, initMatchService };
