import {
  CLASSES,
  TEAM,
  BOARD_MODES,
  FIXED_ROSTER,
  SLOT_ORDER,
  getBoardMode,
  createEmptyBoard,
  createTeamReserve,
  parseSlot,
  formatSlotLabel,
} from './units.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidDeployCells,
  applyMove,
  applyDeploy,
  applyAttack,
  checkWin,
  isTeamEliminated,
} from './rules.js';
import { chooseAiAction } from './ai.js';

export class Game {
  constructor() {
    this.boardMode = '3x3';
    this.phase = 'roster';
    this.currentPlayer = 'blue';
    this.currentSlot = 'blue-0';
    this.humanSlot = 'blue-0';
    this.slotOrder = [...SLOT_ORDER];
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.applyFixedRosters();
    this.blueReserve = [];
    this.redReserve = [];
    this.message = '請選擇棋盤模式，然後開始對戰';
    this.lastWinLine = null;
    this.animating = false;
    this.actionsRemaining = this.getActionsPerTurn();
    this.actedUnitIds = new Set();
    this.playAttackFx = null;
    this.listeners = [];
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  notify() {
    for (const fn of this.listeners) fn(this.getState());
  }

  getModeConfig() {
    return getBoardMode(this.boardMode);
  }

  is2v2() {
    return this.getModeConfig().matchFormat === '2v2';
  }

  getActionsPerTurn() {
    return this.getModeConfig().actionsPerTurn;
  }

  getRosterLimit() {
    return FIXED_ROSTER.length;
  }

  applyFixedRosters() {
    this.blueRoster = [...FIXED_ROSTER];
    this.redRoster = [...FIXED_ROSTER];
  }

  getWinCountLabel() {
    return this.getModeConfig().size;
  }

  getStartButtonLabel() {
    return '開始對戰';
  }

  setBoardMode(modeId) {
    if (this.phase !== 'roster') return;
    if (!BOARD_MODES[modeId]) return;
    this.boardMode = modeId;
    this.board = createEmptyBoard(this.getModeConfig().size);
    const mode = this.getModeConfig();
    const startHint = '按開始對戰';
    const extra = mode.matchFormat === '2v2' ? ' · 2v2 單局' : '';
    this.message = `已選 ${mode.label} 模式${extra} — ${startHint}`;
    this.notify();
  }

  getState() {
    const mode = this.getModeConfig();
    return {
      boardMode: this.boardMode,
      boardSize: mode.size,
      matchFormat: mode.matchFormat,
      rosterLimit: FIXED_ROSTER.length,
      winCount: mode.size,
      phase: this.phase,
      currentPlayer: this.currentPlayer,
      currentSlot: this.currentSlot,
      humanSlot: this.humanSlot,
      isHumanTurn: this.canHumanAct(),
      slotLabel: formatSlotLabel(this.currentSlot),
      draggingUnitId: this.draggingUnitId,
      selectedReserveId: this.selectedReserveId,
      inspectedUnitId: this.inspectedUnitId,
      board: this.board,
      blueRoster: this.blueRoster,
      redRoster: this.redRoster,
      blueReserve: this.blueReserve,
      redReserve: this.redReserve,
      message: this.message,
      lastWinLine: this.lastWinLine,
      validMoves: this.getHighlightMoves(),
      validTargets: this.getHighlightTargets(),
      validDeploy: this.getHighlightDeploy(),
      animating: this.animating,
      actionsRemaining: this.actionsRemaining,
      actionsPerTurn: this.getActionsPerTurn(),
      actedUnitIds: [...this.actedUnitIds],
      startButtonLabel: this.getStartButtonLabel(),
    };
  }

  resetTurnActions() {
    this.actionsRemaining = this.getActionsPerTurn();
    this.actedUnitIds = new Set();
  }

  canHumanAct() {
    if (this.phase !== 'battle' || this.animating) return false;
    if (this.is2v2()) return this.currentSlot === this.humanSlot;
    return this.currentPlayer === 'blue';
  }

  ownsHumanUnit(unit) {
    if (!unit || unit.team !== 'blue') return false;
    if (!this.is2v2()) return true;
    const { seat } = parseSlot(this.humanSlot);
    return unit.ownerSeat === seat;
  }

  syncCurrentPlayerFromSlot() {
    this.currentPlayer = parseSlot(this.currentSlot).team;
  }

  getPlayerTurnMessage() {
    const mode = this.getModeConfig();
    if (this.is2v2()) {
      const label = formatSlotLabel(this.currentSlot);
      if (this.canHumanAct()) {
        return `${label} 回合 · 你的回合：拖曳單位移動或攻擊，點後備區再點空格部署，點敵方單位查看資訊`;
      }
      return `${label} 回合 · AI 思考中`;
    }

    const team = TEAM[this.currentPlayer];
    const actionsPerTurn = mode.actionsPerTurn;
    if (this.currentPlayer === 'blue') {
      return `藍隊回合（剩餘 ${this.actionsRemaining}/${actionsPerTurn} 次行動）：拖曳單位移動或攻擊，點後備區再點空格部署，點敵方單位查看資訊`;
    }
    return `${team.name}回合（剩餘 ${this.actionsRemaining}/${actionsPerTurn} 次行動）`;
  }

  hasValidActionsForSlot(slot = this.currentSlot) {
    const { team, seat } = parseSlot(slot);
    const reserve = team === 'blue' ? this.blueReserve : this.redReserve;
    const slotReserve = this.is2v2() ? reserve.filter((u) => u.ownerSeat === seat) : reserve;
    const deployCells = getValidDeployCells(this.board);
    if (deployCells.length > 0 && slotReserve.length > 0) return true;

    for (const row of this.board) {
      for (const unit of row) {
        if (!unit || unit.team !== team) continue;
        if (this.is2v2() && unit.ownerSeat !== seat) continue;
        if (this.actedUnitIds.has(unit.id)) continue;
        if (getValidMoves(this.board, unit).length > 0) return true;
        if (getValidAttackTargets(this.board, unit).length > 0) return true;
      }
    }
    return false;
  }

  hasValidActionsForTeam(team = this.currentPlayer) {
    if (this.is2v2()) {
      return this.slotOrder.some((slot) => {
        const parsed = parseSlot(slot);
        return parsed.team === team && this.hasValidActionsForSlot(slot);
      });
    }

    const reserve = team === 'blue' ? this.blueReserve : this.redReserve;
    const deployCells = getValidDeployCells(this.board);
    if (deployCells.length > 0 && reserve.length > 0) return true;

    for (const row of this.board) {
      for (const unit of row) {
        if (!unit || unit.team !== team || this.actedUnitIds.has(unit.id)) continue;
        if (getValidMoves(this.board, unit).length > 0) return true;
        if (getValidAttackTargets(this.board, unit).length > 0) return true;
      }
    }
    return false;
  }

  confirmBlueRoster() {
    if (this.phase !== 'roster') return;
    this.applyFixedRosters();
    this.startRound();
  }

  getRoundFirstPlayer() {
    return 'blue';
  }

  getRoundFirstSlot() {
    if (this.is2v2()) return 'blue-0';
    const team = this.getRoundFirstPlayer();
    return `${team}-0`;
  }

  startRound() {
    const mode = this.getModeConfig();
    this.board = createEmptyBoard(mode.size);
    this.blueReserve = createTeamReserve(this.blueRoster, 'blue', mode.matchFormat);
    this.redReserve = createTeamReserve(this.redRoster, 'red', mode.matchFormat);
    this.currentSlot = this.getRoundFirstSlot();
    this.syncCurrentPlayerFromSlot();
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.lastWinLine = null;
    this.phase = 'battle';
    this.resetTurnActions();

    if (this.is2v2()) {
      this.message = `2v2 單局 — ${formatSlotLabel(this.currentSlot)} 先攻：藍1 為你，其餘由 AI 代打`;
    } else {
      const first = TEAM[this.currentPlayer].name;
      if (this.currentPlayer === 'blue') {
        this.message = `${first}先攻：每回合 ${mode.actionsPerTurn} 次行動，同一單位只能行動一次`;
      } else {
        this.message = `${first}先攻`;
      }
    }

    this.notify();
    this.scheduleAiIfNeeded();
  }

  scheduleAiIfNeeded() {
    if (this.phase !== 'battle' || this.animating) return;
    if (this.is2v2()) {
      if (this.currentSlot !== this.humanSlot) {
        setTimeout(() => this.runAiTurn(), 500);
      }
      return;
    }
    if (this.currentPlayer === 'red') {
      setTimeout(() => this.runAiTurn(), 500);
    }
  }

  selectReserve(unitId) {
    if (!this.canHumanAct()) return;
    const unit = this.getCurrentReserve().find((u) => u.id === unitId);
    if (!unit || !this.ownsHumanUnit(unit)) return;
    this.draggingUnitId = null;
    this.inspectedUnitId = null;
    this.selectedReserveId = unitId;
    this.message = `點選空格部署 ${CLASSES[unit.classId].name}`;
    this.notify();
  }

  inspectUnit(unitId) {
    if (this.phase !== 'battle' || this.animating) return;
    const unit = this.findUnitById(unitId);
    if (!unit || unit.team === 'blue') return;
    if (this.inspectedUnitId === unitId) {
      this.inspectedUnitId = null;
      this.message = this.getPlayerTurnMessage();
    } else {
      this.inspectedUnitId = unitId;
      const cls = CLASSES[unit.classId];
      const onBoard = this.board.flat().some((u) => u?.id === unitId);
      const where = onBoard ? '場上' : '後備';
      this.message = `${cls.name}（${where}）HP ${unit.hp}/${unit.maxHp} · ATK ${unit.atk}`;
    }
    this.notify();
  }

  findUnitById(unitId) {
    const onBoard = this.board.flat().find((u) => u?.id === unitId);
    if (onBoard) return onBoard;
    return [...this.blueReserve, ...this.redReserve].find((u) => u.id === unitId) ?? null;
  }

  beginDragUnit(unitId) {
    if (!this.canHumanAct()) return;
    if (this.actedUnitIds.has(unitId)) return;
    const unit = this.board.flat().find((u) => u?.id === unitId);
    if (!unit || !this.ownsHumanUnit(unit)) return;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.draggingUnitId = unitId;
    this.message = '點選或拖曳至綠格移動、紅格攻擊';
    this.notify();
  }

  cancelDrag() {
    if (!this.draggingUnitId) return;
    this.draggingUnitId = null;
    this.message = this.getPlayerTurnMessage();
    this.notify();
  }

  dropOnCell(row, col) {
    if (!this.canHumanAct()) return;
    if (!this.draggingUnitId) return;

    const unit = this.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) {
      this.draggingUnitId = null;
      return;
    }

    const target = this.board[row][col];
    const unitId = this.draggingUnitId;

    if (!target) {
      if (this.tryMoveTo(unitId, row, col)) {
        this.draggingUnitId = null;
      } else {
        this.resetPlayerTurn();
      }
      return;
    }

    if (target.team !== unit.team) {
      if (this.tryAttackTarget(unitId, row, col)) {
        this.draggingUnitId = null;
      } else {
        this.resetPlayerTurn();
      }
      return;
    }

    this.resetPlayerTurn();
  }

  resetPlayerTurn() {
    this.draggingUnitId = null;
    this.message = this.getPlayerTurnMessage();
    this.notify();
  }

  endTurnEarly() {
    if (!this.canHumanAct()) return;
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    if (this.is2v2()) {
      this.advanceSlot();
      return;
    }
    this.actionsRemaining = 0;
    this.switchPlayer();
  }

  getCurrentReserve() {
    const reserve = this.currentPlayer === 'blue' ? this.blueReserve : this.redReserve;
    if (this.is2v2()) {
      const { seat } = parseSlot(this.currentSlot);
      return reserve.filter((u) => u.ownerSeat === seat);
    }
    return reserve;
  }

  getHighlightMoves() {
    if (!this.draggingUnitId) return [];
    if (this.actedUnitIds.has(this.draggingUnitId)) return [];
    const unit = this.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    return getValidMoves(this.board, unit);
  }

  getHighlightTargets() {
    if (!this.draggingUnitId) return [];
    if (this.actedUnitIds.has(this.draggingUnitId)) return [];
    const unit = this.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    return getValidAttackTargets(this.board, unit).map((t) => [t.row, t.col]);
  }

  getHighlightDeploy() {
    if (this.selectedReserveId) {
      return getValidDeployCells(this.board);
    }
    return [];
  }

  clickCell(row, col) {
    if (this.phase !== 'battle' || this.animating) return;
    if (!this.canHumanAct()) return;

    if (this.selectedReserveId) {
      this.tryDeploy(row, col);
    }
  }

  tryDeploy(row, col) {
    const reserve = this.getCurrentReserve();
    const unit = reserve.find((u) => u.id === this.selectedReserveId);
    if (!unit || this.board[row][col]) return;

    const result = applyDeploy(this.board, unit, row, col);
    this.board = result.board;
    if (this.currentPlayer === 'blue') {
      this.blueReserve = this.blueReserve.filter((u) => u.id !== unit.id);
    } else {
      this.redReserve = this.redReserve.filter((u) => u.id !== unit.id);
    }

    this.endAction(`部署 ${CLASSES[unit.classId].name}`, unit.id);
  }

  tryMoveTo(unitId, row, col) {
    const unit = this.board.flat().find((u) => u?.id === unitId);
    if (!unit) return false;
    if (this.actedUnitIds.has(unitId)) return false;
    const valid = getValidMoves(this.board, unit);
    if (!valid.some(([r, c]) => r === row && c === col)) return false;

    const result = applyMove(this.board, unit, row, col);
    this.board = result.board;
    this.endAction('移動', unitId);
    return true;
  }

  async resolveAttack(unit, target, label) {
    const result = applyAttack(this.board, unit, target);
    const directKilledIds = new Set(result.killed.map((k) => k.id));
    const fx = {
      from: { row: unit.row, col: unit.col },
      targets: result.hits.map((h) => ({
        row: h.row,
        col: h.col,
        killed: directKilledIds.has(h.id),
      })),
      team: unit.team,
      type: unit.type,
      damage: unit.atk,
      explosions: result.explosions ?? [],
    };

    this.animating = true;
    if (this.playAttackFx) {
      await this.playAttackFx(fx);
    }

    this.board = result.board;
    this.animating = false;

    let detail = `${label}（命中 ${result.hits.length} 個目標`;
    if (result.explosions?.length > 0) {
      const blastHits = result.explosions.reduce((n, e) => n + e.targets.length, 0);
      detail += `，自爆波及 ${blastHits} 人`;
    }
    detail += '）';
    this.endAction(detail, unit.id);
  }

  tryAttackTarget(unitId, row, col) {
    const unit = this.board.flat().find((u) => u?.id === unitId);
    const target = this.board[row][col];
    if (!unit || !target || target.team === unit.team) return false;
    if (this.actedUnitIds.has(unitId)) return false;

    const valid = getValidAttackTargets(this.board, unit);
    if (!valid.some((t) => t.id === target.id)) return false;

    this.resolveAttack(unit, target, '攻擊');
    return true;
  }

  endAction(actionLabel, unitId) {
    const team = TEAM[this.currentPlayer];
    const enemy = this.currentPlayer === 'blue' ? 'red' : 'blue';
    const enemyReserve = enemy === 'blue' ? this.blueReserve : this.redReserve;

    this.actedUnitIds.add(unitId);
    this.actionsRemaining--;
    this.draggingUnitId = null;
    this.selectedReserveId = null;

    const winLine = checkWin(this.board, this.currentPlayer);

    if (winLine) {
      this.lastWinLine = winLine;
      this.handleRoundWin(this.currentPlayer, `${team.name} ${actionLabel}後連成 ${this.getWinCountLabel()} 子！`);
      return;
    }

    if (isTeamEliminated(this.board, enemy, enemyReserve)) {
      this.lastWinLine = null;
      this.handleRoundWin(this.currentPlayer, `${team.name} ${actionLabel}後全滅對手！`);
      return;
    }

    if (this.is2v2()) {
      this.message = actionLabel;
      this.advanceSlot();
      return;
    }

    if (this.actionsRemaining > 0) {
      if (!this.hasValidActionsForTeam()) {
        this.message = `${actionLabel} — 無更多可行動，換 ${TEAM[enemy].name}回合`;
        this.notify();
        this.switchPlayer();
        return;
      }
      this.message = `${actionLabel} — 還可行動 ${this.actionsRemaining} 次`;
      this.notify();
      if (this.currentPlayer === 'red') {
        setTimeout(() => this.runAiTurn(), 500);
      }
      return;
    }

    this.message = actionLabel;
    this.switchPlayer();
  }

  advanceSlot() {
    const order = this.slotOrder;
    const startIdx = order.indexOf(this.currentSlot);

    for (let i = 1; i <= order.length; i++) {
      const nextSlot = order[(startIdx + i) % order.length];
      this.currentSlot = nextSlot;
      this.syncCurrentPlayerFromSlot();
      this.resetTurnActions();

      if (this.hasValidActionsForSlot(nextSlot)) {
        this.message = this.getPlayerTurnMessage();
        this.notify();
        this.scheduleAiIfNeeded();
        return;
      }
    }

    this.message = this.getPlayerTurnMessage();
    this.notify();
    this.scheduleAiIfNeeded();
  }

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === 'blue' ? 'red' : 'blue';
    this.resetTurnActions();
    this.message = this.getPlayerTurnMessage();
    this.notify();
    this.scheduleAiIfNeeded();
  }

  getAiTurnContext() {
    if (this.is2v2()) {
      const { team, seat } = parseSlot(this.currentSlot);
      return { team, ownerSeat: seat, slotLabel: formatSlotLabel(this.currentSlot) };
    }
    return { team: 'red', ownerSeat: undefined, slotLabel: TEAM.red.name };
  }

  runAiTurn() {
    if (this.phase !== 'battle' || this.animating) return;

    if (this.is2v2() && this.currentSlot === this.humanSlot) return;
    if (!this.is2v2() && this.currentPlayer !== 'red') return;

    const { team, ownerSeat, slotLabel } = this.getAiTurnContext();
    const action = chooseAiAction(
      {
        board: this.board,
        redReserve: this.redReserve,
        blueReserve: this.blueReserve,
        actedUnitIds: this.actedUnitIds,
      },
      { team, ownerSeat },
    );

    if (!action) {
      if (this.is2v2()) {
        this.advanceSlot();
      } else if (this.actionsRemaining > 0) {
        this.switchPlayer();
      }
      return;
    }

    const reserve = team === 'blue' ? this.blueReserve : this.redReserve;

    if (action.type === 'deploy') {
      const unit = reserve.find((u) => u.id === action.unitId);
      const result = applyDeploy(this.board, unit, action.row, action.col);
      this.board = result.board;
      if (team === 'blue') {
        this.blueReserve = this.blueReserve.filter((u) => u.id !== unit.id);
      } else {
        this.redReserve = this.redReserve.filter((u) => u.id !== unit.id);
      }
      this.endAction(`${slotLabel} 部署 ${CLASSES[unit.classId].name}`, unit.id);
      return;
    }

    if (action.type === 'move') {
      const unit = this.board.flat().find((u) => u?.id === action.unitId);
      const result = applyMove(this.board, unit, action.row, action.col);
      this.board = result.board;
      this.endAction(`${slotLabel} 移動`, action.unitId);
      return;
    }

    if (action.type === 'attack') {
      const unit = this.board.flat().find((u) => u?.id === action.unitId);
      const target = this.board.flat().find((u) => u?.id === action.targetId);
      this.resolveAttack(unit, target, `${slotLabel} 攻擊`);
    }
  }

  handleRoundWin(winner, detail) {
    this.phase = 'gameEnd';
    this.message = `${detail} — ${TEAM[winner].name}獲勝！`;
    this.notify();
  }

  restartSeries() {
    const savedMode = this.boardMode;
    this.phase = 'roster';
    this.applyFixedRosters();
    this.boardMode = savedMode;
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.message = '請選擇棋盤模式，然後按開始對戰';
    this.notify();
  }
}

export { CLASSES, TEAM, BOARD_MODES };
