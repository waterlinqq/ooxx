import { CLASSES, TEAM, BOARD_MODES, FIXED_ROSTER, getBoardMode, createUnit, createEmptyBoard } from './units.js';
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

const ACTIONS_PER_TURN = 2;

export class Game {
  constructor() {
    this.boardMode = '3x3';
    this.phase = 'roster';
    this.currentPlayer = 'blue';
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.applyFixedRosters();
    this.blueReserve = [];
    this.redReserve = [];
    this.blueScore = 0;
    this.redScore = 0;
    this.round = 1;
    this.lastRoundWinner = null;
    this.message = '請選擇棋盤模式，然後開始系列賽';
    this.lastWinLine = null;
    this.animating = false;
    this.actionsRemaining = ACTIONS_PER_TURN;
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

  setBoardMode(modeId) {
    if (this.phase !== 'roster') return;
    if (!BOARD_MODES[modeId]) return;
    this.boardMode = modeId;
    this.board = createEmptyBoard(this.getModeConfig().size);
    const mode = this.getModeConfig();
    this.message = `已選 ${mode.label} 模式 — 按開始系列賽`;
    this.notify();
  }
  getState() {
    const mode = this.getModeConfig();
    return {
      boardMode: this.boardMode,
      boardSize: mode.size,
      rosterLimit: FIXED_ROSTER.length,
      winCount: mode.size,
      phase: this.phase,
      currentPlayer: this.currentPlayer,
      draggingUnitId: this.draggingUnitId,
      selectedReserveId: this.selectedReserveId,
      board: this.board,
      blueRoster: this.blueRoster,
      redRoster: this.redRoster,
      blueReserve: this.blueReserve,
      redReserve: this.redReserve,
      blueScore: this.blueScore,
      redScore: this.redScore,
      round: this.round,
      message: this.message,
      lastWinLine: this.lastWinLine,
      validMoves: this.getHighlightMoves(),
      validTargets: this.getHighlightTargets(),
      validDeploy: this.getHighlightDeploy(),
      animating: this.animating,
      actionsRemaining: this.actionsRemaining,
      actionsPerTurn: ACTIONS_PER_TURN,
      actedUnitIds: [...this.actedUnitIds],
    };
  }

  resetTurnActions() {
    this.actionsRemaining = ACTIONS_PER_TURN;
    this.actedUnitIds = new Set();
  }

  getPlayerTurnMessage() {
    const team = TEAM[this.currentPlayer];
    if (this.currentPlayer === 'blue') {
      return `藍隊回合（剩餘 ${this.actionsRemaining}/${ACTIONS_PER_TURN} 次行動）：拖曳單位移動或攻擊，或點後備再點空格部署`;
    }
    return `${team.name}回合（剩餘 ${this.actionsRemaining}/${ACTIONS_PER_TURN} 次行動）`;
  }

  hasValidActionsForTeam(team = this.currentPlayer) {
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
    if (this.round === 1) return 'blue';
    if (this.round === 2) return 'red';
    return this.lastRoundWinner === 'blue' ? 'red' : 'blue';
  }

  startRound() {
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.blueReserve = this.blueRoster.map((id) => createUnit(id, 'blue'));
    this.redReserve = this.redRoster.map((id) => createUnit(id, 'red'));
    this.currentPlayer = this.getRoundFirstPlayer();
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.lastWinLine = null;
    this.phase = 'battle';
    this.resetTurnActions();

    const first = TEAM[this.currentPlayer].name;
    if (this.currentPlayer === 'blue') {
      this.message = `第 ${this.round} 局 — ${first}先攻：每回合 ${ACTIONS_PER_TURN} 次行動，同一單位只能行動一次`;
    } else {
      this.message = `第 ${this.round} 局 — ${first}先攻`;
    }

    this.notify();

    if (this.currentPlayer === 'red') {
      setTimeout(() => this.runAiTurn(), 500);
    }
  }

  selectReserve(unitId) {
    if (this.phase !== 'battle' || this.currentPlayer !== 'blue' || this.animating) return;
    const unit = this.getCurrentReserve().find((u) => u.id === unitId);
    if (!unit) return;
    this.draggingUnitId = null;
    this.selectedReserveId = unitId;
    this.message = `點選空格部署 ${CLASSES[unit.classId].name}`;
    this.notify();
  }

  beginDragUnit(unitId) {
    if (this.phase !== 'battle' || this.currentPlayer !== 'blue' || this.animating) return;
    if (this.actedUnitIds.has(unitId)) return;
    const unit = this.board.flat().find((u) => u?.id === unitId);
    if (!unit || unit.team !== 'blue') return;
    this.selectedReserveId = null;
    this.draggingUnitId = unitId;
    this.message = '拖曳至綠格移動、紅格攻擊';
    this.notify();
  }

  cancelDrag() {
    if (!this.draggingUnitId) return;
    this.draggingUnitId = null;
    this.message = this.getPlayerTurnMessage();
    this.notify();
  }

  dropOnCell(row, col) {
    if (this.phase !== 'battle' || this.currentPlayer !== 'blue' || this.animating) return;
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
    if (this.phase !== 'battle' || this.currentPlayer !== 'blue' || this.animating) return;
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.actionsRemaining = 0;
    this.switchPlayer();
  }

  getCurrentReserve() {
    return this.currentPlayer === 'blue' ? this.blueReserve : this.redReserve;
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
    if (this.currentPlayer === 'red') return;

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

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === 'blue' ? 'red' : 'blue';
    this.resetTurnActions();
    this.message = this.getPlayerTurnMessage();
    this.notify();

    if (this.currentPlayer === 'red') {
      setTimeout(() => this.runAiTurn(), 500);
    }
  }

  runAiTurn() {
    if (this.phase !== 'battle' || this.currentPlayer !== 'red' || this.animating) return;

    const action = chooseAiAction({
      board: this.board,
      redReserve: this.redReserve,
      blueReserve: this.blueReserve,
      actedUnitIds: this.actedUnitIds,
    });

    if (!action) {
      if (this.actionsRemaining > 0) {
        this.switchPlayer();
      }
      return;
    }

    if (action.type === 'deploy') {
      const unit = this.redReserve.find((u) => u.id === action.unitId);
      const result = applyDeploy(this.board, unit, action.row, action.col);
      this.board = result.board;
      this.redReserve = this.redReserve.filter((u) => u.id !== unit.id);
      this.endAction(`紅隊部署 ${CLASSES[unit.classId].name}`, unit.id);
      return;
    }

    if (action.type === 'move') {
      const unit = this.board.flat().find((u) => u?.id === action.unitId);
      const result = applyMove(this.board, unit, action.row, action.col);
      this.board = result.board;
      this.endAction('紅隊移動', action.unitId);
      return;
    }

    if (action.type === 'attack') {
      const unit = this.board.flat().find((u) => u?.id === action.unitId);
      const target = this.board.flat().find((u) => u?.id === action.targetId);
      this.resolveAttack(unit, target, '紅隊攻擊');
    }
  }

  handleRoundWin(winner, detail) {
    if (winner === 'blue') this.blueScore++;
    else this.redScore++;
    this.lastRoundWinner = winner;

    const seriesOver = this.blueScore >= 2 || this.redScore >= 2;
    this.phase = seriesOver ? 'seriesEnd' : 'roundEnd';
    this.message = `${detail} — ${TEAM[winner].name}拿下第 ${this.round} 局！`;

    if (seriesOver) {
      this.message += ` 系列賽結束：${TEAM[winner].name}三戰兩勝！`;
    } else {
      this.message += ` 比分 藍 ${this.blueScore} : ${this.redScore} 紅`;
    }

    this.notify();
  }

  nextRound() {
    if (this.phase !== 'roundEnd') return;
    this.round++;
    this.startRound();
  }

  restartSeries() {
    this.phase = 'roster';
    this.applyFixedRosters();
    this.blueScore = 0;
    this.redScore = 0;
    this.round = 1;
    this.lastRoundWinner = null;
    this.boardMode = '3x3';
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.message = '請選擇棋盤模式，然後開始系列賽';
    this.notify();
  }
}

export { CLASSES, TEAM, BOARD_MODES };
