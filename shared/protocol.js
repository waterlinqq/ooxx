/** WebSocket message type constants (client ↔ server). */

export const MSG = {
  // client → server
  AUTH: 'auth',
  CREATE_ROOM: 'create_room',
  FIND_MATCH: 'find_match',
  JOIN_ROOM: 'join_room',
  SUBMIT_ACTION: 'submit_action',
  SURRENDER: 'surrender',
  SEND_REACTION: 'send_reaction',
  RECONNECT: 'reconnect',
  LEAVE_ROOM: 'leave_room',

  // server → client
  AUTH_OK: 'auth_ok',
  ROOM_STATE: 'room_state',
  GAME_START: 'game_start',
  GAME_UPDATE: 'game_update',
  GAME_OVER: 'game_over',
  REACTION: 'reaction',
  ERROR: 'error',
};

/** Valid in-match emoji reaction ids (client ↔ server). */
export const REACTION_IDS = ['happy', 'angry', 'cry', 'evil'];

export const MATCH_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

/** 匹配佇列等待秒數；逾時則客戶端改打 AI */
export const MATCHMAKING_TIMEOUT_MS = 10_000;
