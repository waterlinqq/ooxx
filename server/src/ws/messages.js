/** In-memory connection registry and room broadcast helpers. */

/** @type {Map<string, { ws: import('ws').WebSocket, guestId: string, matchId: string|null, team: string|null }>} */
const byGuestId = new Map();

/** @type {Map<string, Set<string>>} matchId -> guestIds */
const matchGuests = new Map();

export function registerConnection(guestId, ws) {
  byGuestId.set(guestId, { ws, guestId, matchId: null, team: null });
}

export function unregisterConnection(guestId) {
  const conn = byGuestId.get(guestId);
  if (conn?.matchId) {
    const set = matchGuests.get(conn.matchId);
    if (set) {
      set.delete(guestId);
      if (set.size === 0) matchGuests.delete(conn.matchId);
    }
  }
  byGuestId.delete(guestId);
}

export function bindMatch(guestId, matchId, team) {
  const conn = byGuestId.get(guestId);
  if (!conn) return;
  conn.matchId = matchId;
  conn.team = team;
  if (!matchGuests.has(matchId)) matchGuests.set(matchId, new Set());
  matchGuests.get(matchId).add(guestId);
}

export function unbindMatch(guestId) {
  const conn = byGuestId.get(guestId);
  if (!conn?.matchId) return;
  const set = matchGuests.get(conn.matchId);
  if (set) {
    set.delete(guestId);
    if (set.size === 0) matchGuests.delete(conn.matchId);
  }
  conn.matchId = null;
  conn.team = null;
}

/** 解除房間內所有連線的 match 綁定（房主取消房間時使用） */
export function unbindAllFromMatch(matchId) {
  const guestIds = matchGuests.get(matchId);
  if (!guestIds) return;
  for (const guestId of [...guestIds]) {
    unbindMatch(guestId);
  }
}

export function getConnection(guestId) {
  return byGuestId.get(guestId) ?? null;
}

export function getMatchConnections(matchId) {
  const guestIds = matchGuests.get(matchId);
  if (!guestIds) return [];
  return [...guestIds].map((id) => byGuestId.get(id)).filter(Boolean);
}

export function send(ws, type, payload, reqId) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ type, payload, reqId }));
}

export function broadcastMatch(matchId, type, payloadFactory) {
  for (const conn of getMatchConnections(matchId)) {
    const payload = typeof payloadFactory === 'function'
      ? payloadFactory(conn)
      : payloadFactory;
    send(conn.ws, type, payload);
  }
}
