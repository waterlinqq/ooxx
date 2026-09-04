import { MSG } from '../shared/protocol.js';
import { ensureGuestToken } from './guestAuth.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidDeployCells,
} from './rules.js';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export class OnlineClient {
  constructor() {
    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {Map<string, { resolve: Function, reject: Function }>} */
    this.pending = new Map();
    this.listeners = new Set();
    this.authenticated = false;
    this.guestId = null;
    this.nickname = null;
    /** @type {object|null} */
    this.roomState = null;
    /** @type {object|null} */
    this.gameState = null;
    this.yourTeam = null;
    /** @type {{ turnRemainingMs: number, matchRemainingMs: number }|null} */
    this.timers = null;
    this.roomCode = null;
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this.getDisplayState());
  }

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const token = await ensureGuestToken();
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl());
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('WebSocket 連線失敗'));
      this.ws.onclose = () => {
        this.authenticated = false;
        setTimeout(() => this.reconnect().catch(() => {}), 2000);
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    });

    await this.send(MSG.AUTH, { token });
  }

  async reconnect() {
    await this.connect();
    if (this.roomCode || this.gameState) {
      await this.send(MSG.RECONNECT, { roomCode: this.roomCode ?? undefined });
    }
  }

  send(type, payload) {
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ type, payload, reqId }));
      setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          reject(new Error('請求逾時'));
        }
      }, 15000);
    });
  }

  fire(type, payload) {
    const reqId = crypto.randomUUID();
    this.ws.send(JSON.stringify({ type, payload, reqId }));
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, payload, reqId } = msg;

    if (type === MSG.ERROR) {
      if (reqId && this.pending.has(reqId)) {
        this.pending.get(reqId).reject(new Error(payload.message ?? '錯誤'));
        this.pending.delete(reqId);
      }
      this.notifyError(payload.message);
      return;
    }

    if (reqId && this.pending.has(reqId)) {
      this.pending.get(reqId).resolve(payload);
      this.pending.delete(reqId);
    }

    switch (type) {
      case MSG.AUTH_OK:
        this.authenticated = true;
        this.guestId = payload.guestId;
        this.nickname = payload.nickname;
        break;
      case MSG.ROOM_STATE:
        this.roomState = payload;
        this.roomCode = payload.roomCode;
        this.gameState = null;
        break;
      case MSG.GAME_START:
      case MSG.GAME_UPDATE:
        this.applyGamePayload(payload);
        break;
      case MSG.GAME_OVER:
        this.applyGamePayload(payload);
        if (payload.state) {
          this.gameState = payload.state;
          this.gameState.phase = 'gameEnd';
        }
        break;
      default:
        break;
    }

    this.notify();
  }

  applyGamePayload(payload) {
    this.gameState = payload.state;
    this.yourTeam = payload.yourTeam;
    this.timers = payload.timers;
    this.roomCode = payload.roomCode ?? this.roomCode;
    this.roomState = null;
  }

  notifyError(message) {
    if (this.gameState) {
      this.gameState.message = message;
    } else {
      this.lastError = message;
    }
    this.notify();
  }

  getHighlightMoves() {
    if (!this.draggingUnitId || !this.gameState) return [];
    if (this.gameState.actedUnitIds.includes(this.draggingUnitId)) return [];
    const unit = this.gameState.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    return getValidMoves(this.gameState.board, unit, this.gameState.mapProps);
  }

  getHighlightTargets() {
    if (!this.draggingUnitId || !this.gameState) return [];
    if (this.gameState.actedUnitIds.includes(this.draggingUnitId)) return [];
    const unit = this.gameState.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    return getValidAttackTargets(this.gameState.board, unit).map((t) => [t.row, t.col]);
  }

  getHighlightDeploy() {
    if (!this.selectedReserveId || !this.gameState) return [];
    return getValidDeployCells(this.gameState.board, this.gameState.mapProps);
  }

  getDisplayState() {
    if (!this.gameState) {
      return {
        phase: this.roomState ? 'onlineWaiting' : 'onlineLobby',
        boardMode: this.roomState?.boardMode ?? this.selectedBoardMode ?? '3x3',
        roomState: this.roomState,
        roomCode: this.roomCode,
        message: this.lastError ?? '',
        onlineMode: true,
      };
    }

    const gs = this.gameState;
    const myTeam = this.yourTeam ?? 'blue';
    const ownReserveKey = myTeam === 'blue' ? 'blueReserve' : 'redReserve';
    const enemyReserveKey = myTeam === 'blue' ? 'redReserve' : 'blueReserve';

    return {
      ...gs,
      onlineMode: true,
      yourTeam: myTeam,
      isHumanTurn: gs.currentPlayer === myTeam && gs.phase === 'battle',
      blueReserve: gs[ownReserveKey] ?? gs.blueReserve,
      redReserve: gs[enemyReserveKey] ?? gs.redReserve,
      blueRoster: gs.blueRoster,
      redRoster: gs.redRoster,
      validMoves: this.getHighlightMoves(),
      validTargets: this.getHighlightTargets(),
      validDeploy: this.getHighlightDeploy(),
      draggingUnitId: this.draggingUnitId,
      selectedReserveId: this.selectedReserveId,
      inspectedUnitId: this.inspectedUnitId,
      animating: false,
      timers: this.timers,
      roomCode: this.roomCode,
      itemsDisabled: true,
      equippedItem: null,
      itemUsed: true,
      canUseItem: false,
      tutorial: null,
    };
  }

  async createRoom(boardMode, nickname) {
    this.selectedBoardMode = boardMode;
    await this.connect();
    this.lastError = null;
    const payload = await this.send(MSG.CREATE_ROOM, { boardMode, nickname });
    this.roomState = payload;
    this.roomCode = payload.roomCode;
    this.notify();
  }

  async joinRoom(roomCode, nickname) {
    await this.connect();
    this.lastError = null;
    this.roomCode = roomCode.toUpperCase();
    await this.send(MSG.JOIN_ROOM, { roomCode: this.roomCode, nickname });
    this.notify();
  }

  async tryReconnectOnLoad() {
    try {
      await this.connect();
      await this.send(MSG.RECONNECT, {});
    } catch {
      // no active match
    }
  }

  submitAction(action) {
    this.fire(MSG.SUBMIT_ACTION, { action });
  }

  surrender() {
    this.fire(MSG.SURRENDER, {});
  }

  beginDragUnit(unitId) {
    if (!this.getDisplayState().isHumanTurn) return;
    this.draggingUnitId = unitId;
    this.selectedReserveId = null;
    this.notify();
  }

  cancelDrag() {
    this.draggingUnitId = null;
    this.notify();
  }

  selectReserve(unitId) {
    if (!this.getDisplayState().isHumanTurn) return;
    this.selectedReserveId = unitId;
    this.draggingUnitId = null;
    this.notify();
  }

  inspectUnit(unitId) {
    this.inspectedUnitId = unitId;
    this.notify();
  }

  clickCell(row, col) {
    const state = this.getDisplayState();
    if (!state.isHumanTurn || state.phase !== 'battle') return;

    if (this.selectedReserveId) {
      this.submitAction({
        type: 'deploy',
        unitId: this.selectedReserveId,
        row,
        col,
      });
      this.selectedReserveId = null;
      return;
    }
  }

  dropOnCell(row, col) {
    const state = this.getDisplayState();
    if (!this.draggingUnitId || !state.isHumanTurn) return;

    const unit = state.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return;

    const targets = this.getHighlightTargets();
    const moves = this.getHighlightMoves();

    if (targets.some(([r, c]) => r === row && c === col)) {
      this.submitAction({
        type: 'attack',
        unitId: this.draggingUnitId,
        row,
        col,
      });
    } else if (moves.some(([r, c]) => r === row && c === col)) {
      this.submitAction({
        type: 'move',
        unitId: this.draggingUnitId,
        row,
        col,
      });
    }

    this.draggingUnitId = null;
    this.notify();
  }

  leaveOnline() {
    this.roomState = null;
    this.gameState = null;
    this.roomCode = null;
    this.yourTeam = null;
    this.lastError = null;
    this.notify();
  }
}

export const onlineClient = new OnlineClient();
