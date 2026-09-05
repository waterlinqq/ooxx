import { MSG, MATCHMAKING_TIMEOUT_MS } from '@ooxx/shared/protocol.js';
import { ensureGuestToken, refreshGuestToken } from './guestAuth.js';
import { wsUrl } from './config.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidDeployCells,
} from './rules.js';
import { buildAttackFx } from './actionFx.js';
import {
  remapBoardForView,
  remapMessageForView,
  remapTeamForView,
} from './onlineView.js';
import { GAME_END_REVEAL_MS } from './game.js';

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
    this.animating = false;
    this.playAttackFx = null;
    this.playMapPropFx = null;
    this.playBlessFx = null;
    /** @type {Promise<void>|null} */
    this.connecting = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.reconnectTimer = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.matchmakingTimer = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    this.matchmakingTick = null;
    this.matchmakingUntil = 0;
    this.matchmakingGen = 0;
    this.aiFallbackPending = false;
    /** @type {((boardMode: string) => void)|null} */
    this.onAiFallback = null;
    /** @type {Map<string, { draggingUnitId: string|null, selectedReserveId: string|null }>} */
    this.pendingFire = new Map();
    this._gameEndRevealGen = 0;
  }

  canSend() {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this.getDisplayState());
  }

  async connect() {
    if (this.canSend()) return;
    if (this.connecting) return this.connecting;

    this.connecting = this._connectOnce();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async _connectOnce() {
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve, reject) => {
        const ws = this.ws;
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('連線逾時'));
        }, 5000);
        const onOpen = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('WebSocket 連線失敗')); };
        const cleanup = () => {
          clearTimeout(timer);
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('error', onError);
        };
        ws.addEventListener('open', onOpen);
        ws.addEventListener('error', onError);
      });
      if (this.canSend()) return;
    }

    if (this.ws?.readyState === WebSocket.OPEN && !this.authenticated) {
      // stale socket — fall through to re-auth
    } else if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    let token = await ensureGuestToken();
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl());
      const timer = setTimeout(() => {
        this.ws.onclose = null;
        this.ws.close();
        reject(new Error('連線逾時'));
      }, 5000);
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
      this.ws.onopen = () => {
        clearTimeout(timer);
        this.ws.onclose = () => {
          this.authenticated = false;
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.reconnect().catch(() => {});
          }, 2000);
        };
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('WebSocket 連線失敗'));
      };
    });

    try {
      await this._auth(token);
    } catch (e) {
      const msg = e?.message ?? '';
      if (msg.includes('無效') || msg.includes('token')) {
        token = await refreshGuestToken();
        await this._auth(token);
      } else {
        throw e;
      }
    }
  }

  async _auth(token) {
    await this.send(MSG.AUTH, { token });
  }

  async reconnect() {
    await this.connect();
    if (this.roomCode || this.gameState) {
      await this.send(MSG.RECONNECT, { roomCode: this.roomCode ?? undefined });
    }
  }

  send(type, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('連線中，請稍後再試'));
    }
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
    if (!this.canSend()) {
      this.notifyError('連線中，請稍後再試');
      return null;
    }
    const reqId = crypto.randomUUID();
    this.ws.send(JSON.stringify({ type, payload, reqId }));
    return reqId;
  }

  restorePendingInteraction(reqId) {
    const snap = this.pendingFire.get(reqId);
    if (!snap) return;
    this.draggingUnitId = snap.draggingUnitId;
    this.selectedReserveId = snap.selectedReserveId;
    this.pendingFire.delete(reqId);
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
      if (reqId) this.restorePendingInteraction(reqId);
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
        if (payload.left) {
          this.roomState = null;
          this.roomCode = null;
          this.clearMatchmakingWatch();
          this.gameState = null;
          if (this.aiFallbackPending) return;
        } else {
          this.roomState = payload;
          this.roomCode = payload.roomCode;
          if (payload.matchmaking) this.startMatchmakingWatch(payload);
          else this.clearMatchmakingWatch();
        }
        this.gameState = null;
        break;
      case MSG.GAME_START:
        this.aiFallbackPending = false;
        this.clearMatchmakingWatch();
        this.applyGamePayload(payload);
        break;
      case MSG.GAME_UPDATE:
        this.handleGamePayload(payload).catch(console.error);
        return;
      case MSG.GAME_OVER:
        this.handleGamePayload(payload, { gameEnd: true }).catch(console.error);
        return;
      default:
        break;
    }

    this.notify();
  }

  applyGamePayload(payload) {
    this.gameState = payload.state;
    this.yourTeam = payload.yourTeam;
    if (payload.timers) {
      const now = Date.now();
      this.timers = {
        ...payload.timers,
        turnDeadlineAt: now + payload.timers.turnRemainingMs,
        matchDeadlineAt: now + payload.timers.matchRemainingMs,
      };
    } else {
      this.timers = null;
    }
    this.roomCode = payload.roomCode ?? this.roomCode;
    this.roomState = null;
  }

  refreshTimerRemaining() {
    if (!this.timers) return;
    const now = Date.now();
    this.timers.turnRemainingMs = Math.max(0, this.timers.turnDeadlineAt - now);
    this.timers.matchRemainingMs = Math.max(0, this.timers.matchDeadlineAt - now);
  }

  async playAttackAnimationIfNeeded(payload) {
    const lastAction = payload.lastAction;
    if (!lastAction || lastAction.type !== 'attack' || !this.gameState?.board || !this.playAttackFx) {
      return;
    }

    const fx = buildAttackFx(this.gameState.board, lastAction);
    if (!fx) return;

    const attacker = this.gameState.board.flat().find((u) => u?.id === lastAction.unitId);
    if (attacker) {
      fx.team = remapTeamForView(attacker.team, this.yourTeam ?? 'blue');
    }

    this.animating = true;
    this.notify();
    try {
      await this.playAttackFx(fx);
    } finally {
      this.animating = false;
    }
  }

  async playSecondaryFxIfNeeded(payload) {
    const fx = payload.actionFx;
    if (!fx) return;

    if (fx.terrain && this.playMapPropFx) {
      this.playMapPropFx(fx.terrain);
    }

    if (fx.blessing?.targets?.length && this.playBlessFx) {
      this.animating = true;
      this.notify();
      try {
        await this.playBlessFx(fx.blessing);
      } finally {
        this.animating = false;
      }
    }
  }

  async handleGamePayload(payload, { gameEnd = false } = {}) {
    await this.playAttackAnimationIfNeeded(payload);
    this.pendingFire.clear();
    this.applyGamePayload(payload);
    await this.playSecondaryFxIfNeeded(payload);

    if (gameEnd && this.gameState?.phase === 'gameEnd') {
      const endMessage = this.gameState.message;
      const revealGen = ++this._gameEndRevealGen;
      this.gameState.phase = 'battle';
      this.gameState.message = '';
      this.animating = true;
      this.notify();
      await new Promise((resolve) => setTimeout(resolve, GAME_END_REVEAL_MS));
      if (revealGen !== this._gameEndRevealGen || !this.gameState) {
        this.animating = false;
        this.notify();
        return;
      }
      this.gameState.phase = 'gameEnd';
      this.gameState.message = endMessage;
      this.animating = false;
    }

    this.notify();
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
        matchmaking: Boolean(this.roomState?.matchmaking),
        matchmakingRemainingMs: this.roomState?.matchmaking
          ? Math.max(0, this.matchmakingUntil - Date.now())
          : 0,
      };
    }

    const gs = this.gameState;
    const myTeam = this.yourTeam ?? 'blue';
    const ownReserveKey = myTeam === 'blue' ? 'blueReserve' : 'redReserve';
    const enemyReserveKey = myTeam === 'blue' ? 'redReserve' : 'blueReserve';

    return {
      ...gs,
      board: remapBoardForView(gs.board, myTeam),
      currentPlayer: remapTeamForView(gs.currentPlayer, myTeam),
      winner: gs.winner ? remapTeamForView(gs.winner, myTeam) : gs.winner,
      message: remapMessageForView(gs.message, myTeam),
      onlineMode: true,
      yourTeam: 'blue',
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
      animating: this.animating,
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

  async findMatch(boardMode, nickname) {
    this.selectedBoardMode = boardMode;
    this.lastError = null;
    this.beginLocalMatchmaking(boardMode);
    void this.tryServerMatch(boardMode, nickname);
  }

  async tryServerMatch(boardMode, nickname) {
    const gen = this.matchmakingGen;
    try {
      await this.connect();
      if (gen !== this.matchmakingGen || this.gameState) return;
      await this.send(MSG.FIND_MATCH, { boardMode, nickname });
    } catch (e) {
      if (gen !== this.matchmakingGen) return;
      if (String(e?.message ?? '').includes('已在其他房間')) {
        this.matchmakingGen += 1;
        this.aiFallbackPending = false;
        this.clearMatchmakingWatch();
        this.roomState = null;
        this.roomCode = null;
        this.notifyError(e.message);
      }
    }
  }

  beginLocalMatchmaking(boardMode) {
    this.roomState = {
      matchmaking: true,
      boardMode,
      createdAt: new Date().toISOString(),
      players: [],
      status: 'waiting',
    };
    this.startMatchmakingWatch(this.roomState);
    this.notify();
  }

  clearMatchmakingWatch() {
    if (this.matchmakingTimer) {
      clearTimeout(this.matchmakingTimer);
      this.matchmakingTimer = null;
    }
    if (this.matchmakingTick) {
      clearInterval(this.matchmakingTick);
      this.matchmakingTick = null;
    }
  }

  startMatchmakingWatch() {
    if (this.matchmakingTimer) return;

    this.matchmakingUntil = Date.now() + MATCHMAKING_TIMEOUT_MS;
    this.matchmakingGen += 1;
    const gen = this.matchmakingGen;
    const remaining = this.matchmakingUntil - Date.now();
    if (remaining <= 0) {
      this.handleMatchmakingTimeout(gen);
      return;
    }
    this.matchmakingTimer = setTimeout(() => this.handleMatchmakingTimeout(gen), remaining);
    this.matchmakingTick = setInterval(() => this.notify(), 1000);
  }

  async handleMatchmakingTimeout(gen) {
    this.clearMatchmakingWatch();
    if (gen !== this.matchmakingGen) return;
    if (this.gameState) return;
    if (!this.roomState?.matchmaking) return;

    const boardMode = this.roomState.boardMode ?? this.selectedBoardMode ?? '3x3';
    this.aiFallbackPending = true;
    let leaveBlocked = false;
    if (this.canSend()) {
      try {
        await this.send(MSG.LEAVE_ROOM, {});
      } catch (e) {
        leaveBlocked = String(e?.message ?? '').includes('進行中');
      }
    }

    if (gen !== this.matchmakingGen) {
      this.aiFallbackPending = false;
      return;
    }
    if (this.gameState || leaveBlocked) {
      this.aiFallbackPending = false;
      return;
    }

    this.roomState = null;
    this.roomCode = null;
    this.aiFallbackPending = false;
    this.onAiFallback?.(boardMode);
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
    const reqId = this.fire(MSG.SUBMIT_ACTION, { action });
    if (!reqId) return;
    this.pendingFire.set(reqId, {
      draggingUnitId: this.draggingUnitId,
      selectedReserveId: this.selectedReserveId,
    });
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
      const valid = this.getHighlightDeploy();
      if (!valid.some(([r, c]) => r === row && c === col)) return;

      this.submitAction({
        type: 'deploy',
        unitId: this.selectedReserveId,
        row,
        col,
      });
      this.selectedReserveId = null;
      this.notify();
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
      this.draggingUnitId = null;
    } else if (moves.some(([r, c]) => r === row && c === col)) {
      this.submitAction({
        type: 'move',
        unitId: this.draggingUnitId,
        row,
        col,
      });
      this.draggingUnitId = null;
    }

    this.notify();
  }

  async leaveOnline() {
    this._gameEndRevealGen += 1;
    this.matchmakingGen += 1;
    this.aiFallbackPending = false;
    this.clearMatchmakingWatch();
    try {
      await this.connect();
      await this.send(MSG.LEAVE_ROOM, {});
    } catch {
      // 可能本來就沒有房間，仍清除本地狀態
    }
    this.roomState = null;
    this.gameState = null;
    this.roomCode = null;
    this.yourTeam = null;
    this.lastError = null;
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.animating = false;
    this.notify();
  }
}

export const onlineClient = new OnlineClient();
