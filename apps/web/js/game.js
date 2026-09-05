import {
  CLASSES,
  TEAM,
  BOARD_MODES,
  getBoardMode,
  getRosterLimit,
  getMaxPerClass,
  canAddToRoster,
  sortRosterByClass,
  createRandomRoster,
  createEmptyBoard,
  createTeamReserve,
  placeModeCastles,
  isCastleUnit,
  getDeployableRoster,
  modeHasAutoCastle,
} from './units.js';
import {
  getValidMoves,
  getValidAttackTargets,
  getValidDeployCells,
  getTowerVolleyEndpoints,
  applyMove,
  applyDeploy,
  applyAttack,
  applyTeamPriestBlessings,
  applyPoisonTurnTicks,
  expireShadowClonesForTurnStart,
  checkWin,
  checkCastleVictory,
  isTeamEliminated,
  getValidBombCells,
  healUnitAt,
  applyTrapDamage,
  resolveDeathExplosions,
  isFriendlyCastleCell,
} from './rules.js';
import { chooseAiAction } from './ai.js';
import { createSearchContext } from './ai/board.js';
import { evaluate } from './ai/evaluate.js';
import { getItem, getCoinReward } from './items.js';
import {
  getSaveSnapshot,
  addCoins,
  getInventoryCount,
  consumeItem,
  markTutorialDone,
  isClassOwned,
  persistRostersByMode,
  getSavedEquippedItem,
  persistEquippedItem,
} from './save.js';
import {
  TUTORIAL_BOARD_MODE,
  TUTORIAL_BLUE_ROSTER,
  TUTORIAL_RED_ROSTER,
  TUTORIAL_STEP_COUNT,
  getTutorialStep,
  matchesTutorialGoal,
} from './tutorial.js';
import {
  createEmptyMapProps,
  generateMapPropsForMode,
  resolveMapPropOnEnter,
  isObstacleCell,
  cloneMapProps,
} from './mapProps.js';

export const GAME_END_REVEAL_MS = 1000;
export const GAME_END_MODAL_MS = 3000;
export const GAME_END_FADE_MS = 450;

export class Game {
  constructor() {
    this.boardMode = '3x3';
    this.phase = 'lobby';
    this.currentPlayer = 'blue';
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.mapProps = createEmptyMapProps(this.getModeConfig().size);
    this.blueRoster = [];
    this.redRoster = [];
    /** @type {Record<string, string[]>} */
    this.rostersByMode = {};
    this.blueReserve = [];
    this.redReserve = [];
    this.message = '';
    this.lastWinLine = null;
    this.endReason = null;
    this.finalScores = null;
    this.animating = false;
    this.actionsRemaining = this.getActionsPerTurn();
    this.actedUnitIds = new Set();
    this.playAttackFx = null;
    this.playBlessFx = null;
    this.playMapPropFx = null;
    this.playLandmineFx = null;
    this.listeners = [];
    this.equippedItem = null;
    this.itemUsed = false;
    this.itemTargeting = null;
    this.pendingBombs = [];
    this.pendingLandmines = [];
    this.shadowClones = [];
    this.lastCoinReward = 0;
    this._endRevealTimer = null;
    this._endRevealPending = false;
    /** @type {{ stepIndex: number, stage: 'player'|'enemy'|'done' } | null} */
    this.tutorial = null;
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

  getActionsPerTurn() {
    return this.getModeConfig().actionsPerTurn;
  }

  getRosterLimit() {
    return getRosterLimit(this.boardMode);
  }

  getMaxPerClass() {
    return getMaxPerClass(this.boardMode);
  }

  getWinCountLabel() {
    return this.getModeConfig().size;
  }

  getStartButtonLabel() {
    return '下一步：選擇編隊';
  }

  canEditRoster() {
    return this.phase === 'lobby' || this.phase === 'formation' || this.phase === 'gameEnd';
  }

  syncFormationMode(modeId) {
    if (!BOARD_MODES[modeId] || !this.canEditRoster()) return;

    this.rostersByMode[this.boardMode] = this.sanitizeRosterForMode(this.blueRoster);
    if (this.boardMode === modeId) {
      persistRostersByMode(this.rostersByMode);
      return;
    }

    this.boardMode = modeId;
    this.blueRoster = this.sanitizeRosterForMode(this.rostersByMode[modeId] ?? [], modeId);
    this.redRoster = [];
    persistRostersByMode(this.rostersByMode);
  }

  setBoardMode(modeId) {
    if (!this.canEditRoster()) return;
    if (!BOARD_MODES[modeId]) return;
    this.syncFormationMode(modeId);
    const mode = this.getModeConfig();
    this.board = createEmptyBoard(mode.size);
    this.mapProps = createEmptyMapProps(mode.size);
    this.notify();
  }

  isFormationReady() {
    return getDeployableRoster(this.blueRoster, this.boardMode).length === this.getRosterLimit();
  }

  sanitizeRosterForMode(roster, modeId = this.boardMode) {
    return sortRosterByClass(getDeployableRoster(roster, modeId));
  }

  openFormation() {
    if (this.phase !== 'lobby') return;
    this.phase = 'formation';
    this.message = '';
    this.notify();
  }

  backToLobby() {
    const leavingAfterWin = this.phase === 'gameEnd' || this._endRevealPending;
    if (this.phase === 'battle' && !leavingAfterWin) return;

    this.clearEndSequence();
    this.animating = false;
    this.tutorial = null;
    this.phase = 'lobby';
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.mapProps = createEmptyMapProps(this.getModeConfig().size);
    this.lastWinLine = null;
    this.endReason = null;
    this.finalScores = null;
    this.restoreEquippedItemPreference();
    this.message = '';
    this.notify();
  }

  restoreEquippedItemPreference() {
    this.equippedItem = getSavedEquippedItem();
  }

  addToFormation(classId) {
    if (!this.canEditRoster()) return;
    if (!CLASSES[classId]) return;
    if (modeHasAutoCastle(this.boardMode) && classId === 'castle') return;

    const existing = this.blueRoster.indexOf(classId);
    if (existing >= 0) {
      this.blueRoster = this.blueRoster.filter((id) => id !== classId);
      this.blueRoster = this.sanitizeRosterForMode(this.blueRoster);
      this.rostersByMode[this.boardMode] = [...this.blueRoster];
      persistRostersByMode(this.rostersByMode);
      this.message = '';
      this.notify();
      return;
    }

    if (!isClassOwned(classId)) {
      this.message = '尚未解鎖此職業';
      this.notify();
      return;
    }

    if (!canAddToRoster(this.blueRoster, classId, this.boardMode)) {
      this.message = '編隊已滿';
      this.notify();
      return;
    }
    this.blueRoster = sortRosterByClass([...this.blueRoster, classId]);
    this.blueRoster = this.sanitizeRosterForMode(this.blueRoster);
    this.rostersByMode[this.boardMode] = [...this.blueRoster];
    persistRostersByMode(this.rostersByMode);
    this.message = '';
    this.notify();
  }

  removeFromFormation(index) {
    if (!this.canEditRoster()) return;
    if (index < 0 || index >= this.blueRoster.length) return;
    if (modeHasAutoCastle(this.boardMode) && this.blueRoster[index] === 'castle') return;
    this.blueRoster = this.blueRoster.filter((_, i) => i !== index);
    this.blueRoster = this.sanitizeRosterForMode(this.blueRoster);
    this.rostersByMode[this.boardMode] = [...this.blueRoster];
    persistRostersByMode(this.rostersByMode);
    this.message = '';
    this.notify();
  }

  selectEquippedItem(itemId) {
    if (!this.canEditRoster()) return;

    if (itemId === null) {
      this.equippedItem = null;
      persistEquippedItem(null);
      this.message = '';
      this.notify();
      return;
    }

    const item = getItem(itemId);
    if (!item) return;

    if (getInventoryCount(itemId) <= 0) {
      this.message = `背包沒有 ${item.name}`;
      this.notify();
      return;
    }

    if (this.equippedItem === itemId) {
      this.equippedItem = null;
      persistEquippedItem(null);
      this.message = '';
      this.notify();
      return;
    }

    this.equippedItem = itemId;
    persistEquippedItem(itemId);
    this.message = '';
    this.notify();
  }

  canUseItem() {
    return this.phase === 'battle'
      && this.canHumanAct()
      && !this.animating
      && this.equippedItem
      && getInventoryCount(this.equippedItem) > 0
      && !this.itemUsed
      && !this.itemTargeting;
  }

  getOccupiedTrapCells() {
    const occupied = new Set();
    for (const { row, col } of this.pendingBombs) occupied.add(`${row},${col}`);
    for (const { row, col } of this.pendingLandmines) occupied.add(`${row},${col}`);
    return occupied;
  }

  getEmptyItemDropCells() {
    const occupied = this.getOccupiedTrapCells();
    return getValidBombCells(this.board, this.mapProps)
      .filter(([r, c]) => !occupied.has(`${r},${c}`));
  }

  getHighlightItemTargets() {
    if (!this.itemTargeting) return [];

    if (this.itemTargeting === 'potion') {
      const cells = this.getEmptyItemDropCells();
      const size = this.board.length;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const unit = this.board[r][c];
          if (unit && this.ownsHumanUnit(unit)) cells.push([r, c]);
        }
      }
      return cells;
    }

    if (this.itemTargeting === 'bomb' || this.itemTargeting === 'landmine') {
      return this.getEmptyItemDropCells();
    }

    return [];
  }

  getValidPotionReserveTargetIds() {
    if (this.itemTargeting !== 'potion') return [];
    return this.blueReserve
      .filter((u) => this.ownsHumanUnit(u))
      .map((u) => u.id);
  }

  beginUseItem() {
    if (this.itemTargeting) {
      this.cancelItemTargeting();
      return;
    }

    if (!this.canUseItem()) return;

    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;

    this.itemTargeting = this.equippedItem;
    this.message = this.getPlayerTurnMessage();
    this.notify();
  }

  cancelItemTargeting() {
    if (!this.itemTargeting) return;
    this.itemTargeting = null;
    this.message = this.getPlayerTurnMessage();
    this.notify();
  }

  tryItemTarget(row, col) {
    if (!this.itemTargeting || this.phase !== 'battle' || !this.canHumanAct()) return;

    if (this.itemTargeting === 'potion') {
      const unit = this.board[row]?.[col];
      if (unit && this.ownsHumanUnit(unit)) {
        const amount = getItem('potion')?.effect?.amount ?? 3;
        if (unit.hp < unit.maxHp) {
          const result = healUnitAt(this.board, row, col, amount);
          this.board = result.board;
          this.playBlessFx?.({
            targets: [{ row, col, amount }],
          });
        }
        this.finishItemUse();
        return;
      }

      if (!unit && !isObstacleCell(this.mapProps, row, col)) {
        const next = cloneMapProps(this.mapProps);
        next[row][col] = { kind: 'potion' };
        this.mapProps = next;
        this.finishItemUse();
      }
      return;
    }

    if (this.itemTargeting === 'bomb') {
      if (this.board[row]?.[col] || isObstacleCell(this.mapProps, row, col)) return;
      if (this.getOccupiedTrapCells().has(`${row},${col}`)) return;

      this.pendingBombs.push({ row, col });
      this.finishItemUse();
      return;
    }

    if (this.itemTargeting === 'landmine') {
      if (this.board[row]?.[col] || isObstacleCell(this.mapProps, row, col)) return;
      if (this.getOccupiedTrapCells().has(`${row},${col}`)) return;

      this.pendingLandmines.push({ row, col });
      this.finishItemUse();
    }
  }

  tryItemTargetReserve(unitId) {
    if (!this.itemTargeting || this.phase !== 'battle' || !this.canHumanAct()) return;
    if (this.itemTargeting !== 'potion') return;

    const unit = this.blueReserve.find((u) => u.id === unitId);
    if (!unit || !this.ownsHumanUnit(unit)) return;

    const amount = getItem('potion')?.effect?.amount ?? 3;
    if (unit.hp < unit.maxHp) {
      unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    }
    this.finishItemUse();
  }

  finishItemUse() {
    consumeItem(this.equippedItem);
    this.itemUsed = true;
    this.itemTargeting = null;

    if (!this.checkWinAfterItemEffect('')) {
      this.message = this.getPlayerTurnMessage();
      this.notify();
    }
  }

  checkWinAfterItemEffect(detail) {
    for (const team of ['blue', 'red']) {
      const winLine = checkWin(this.board, team, this.mapProps);
      if (winLine) {
        this.lastWinLine = winLine;
        this.handleRoundWin(team, `連 ${this.getWinCountLabel()} 子`);
        return true;
      }
    }

    for (const team of ['blue', 'red']) {
      const enemy = team === 'blue' ? 'red' : 'blue';
      const enemyReserve = enemy === 'blue' ? this.blueReserve : this.redReserve;
      if (isTeamEliminated(this.board, enemy, enemyReserve)) {
        this.lastWinLine = null;
        this.handleRoundWin(team, '全滅');
        return true;
      }
    }

    for (const team of ['blue', 'red']) {
      if (checkCastleVictory(this.board, team, this.boardMode)) {
        this.lastWinLine = null;
        this.handleRoundWin(team, '攻破城堡', 'castle');
        return true;
      }
    }

    this.message = detail;
    this.notify();
    return false;
  }

  resolvePendingBombs() {
    if (this.pendingBombs.length === 0) return false;

    const bombs = [...this.pendingBombs];
    this.pendingBombs = [];
    let board = this.board;
    const labels = [];
    const allKilled = [];

    const damage = getItem('bomb')?.effect?.damage ?? 3;
    for (const { row, col } of bombs) {
      const result = applyTrapDamage(board, row, col, damage);
      board = result.board;
      if (result.hit) {
        const cls = CLASSES[result.hit.classId];
        labels.push(`${cls?.name ?? '單位'} -${damage}`);
      }
      if (result.killed) allKilled.push(result.killed);
    }

    if (allKilled.length > 0) {
      const explosion = resolveDeathExplosions(board, allKilled);
      board = explosion.board;
    }

    this.board = board;
    const detail = labels.length > 0 ? `💣 炸彈引爆：${labels.join('、')}` : '💣 炸彈引爆';
    return this.checkWinAfterItemEffect(detail);
  }

  resetBattleItemState() {
    this.itemUsed = false;
    this.itemTargeting = null;
    this.pendingBombs = [];
    this.pendingLandmines = [];
    this.lastCoinReward = 0;
    this.clearEndSequence();
  }

  clearEndSequence() {
    if (this._endRevealTimer) {
      clearTimeout(this._endRevealTimer);
      this._endRevealTimer = null;
    }
    this._endRevealPending = false;
  }

  clearEndRevealTimer() {
    this.clearEndSequence();
  }

  applyTurnBoundaryEffects(endedTeam) {
    if (this.resolvePendingBombs()) return true;
    if (this.resolvePoisonTicks(endedTeam)) return true;
    return false;
  }

  resolvePoisonTicks(endedTeam) {
    const hasPoisoned = this.board.some((row) =>
      row.some((unit) => unit?.poisoned && unit.team === endedTeam),
    );
    if (!hasPoisoned) return false;

    const result = applyPoisonTurnTicks(this.board, endedTeam);
    this.board = result.board;

    const labels = result.ticks.map(({ unit }) => {
      const cls = CLASSES[unit.classId];
      return `${cls?.name ?? '單位'} -1（中毒）`;
    });
    if (result.explosions?.length > 0) {
      const blastHits = result.explosions.reduce((n, e) => n + e.targets.length, 0);
      labels.push(`自爆波及 ${blastHits} 人`);
    }

    const detail = labels.length > 0 ? `☠️ 中毒結算：${labels.join('、')}` : '☠️ 中毒結算';
    return this.checkWinAfterItemEffect(detail);
  }

  getState() {
    const mode = this.getModeConfig();
    const save = getSaveSnapshot();
    const equippedItem = this.equippedItem;
    return {
      boardMode: this.boardMode,
      boardSize: mode.size,
      rosterLimit: this.getRosterLimit(),
      maxPerClass: this.getMaxPerClass(),
      formationReady: this.isFormationReady(),
      winCount: mode.size,
      turnDurationMs: mode.turnDurationMs,
      turnBonusMs: mode.turnBonusMs,
      matchDurationMs: mode.matchDurationMs,
      phase: this.phase,
      currentPlayer: this.currentPlayer,
      isHumanTurn: this.canHumanAct(),
      draggingUnitId: this.draggingUnitId,
      selectedReserveId: this.selectedReserveId,
      inspectedUnitId: this.inspectedUnitId,
      board: this.board,
      mapProps: this.mapProps,
      shadowClones: this.shadowClones,
      blueRoster: this.blueRoster,
      redRoster: this.redRoster,
      blueReserve: this.blueReserve,
      redReserve: this.redReserve,
      message: this.message,
      lastWinLine: this.lastWinLine,
      endReason: this.endReason,
      finalScores: this.finalScores,
      validMoves: this.getHighlightMoves(),
      validRecycleMoves: this.getHighlightRecycleMoves(),
      validTargets: this.getHighlightTargets(),
      validDeploy: this.getHighlightDeploy(),
      animating: this.animating,
      actionsRemaining: this.actionsRemaining,
      actionsPerTurn: this.getActionsPerTurn(),
      actedUnitIds: [...this.actedUnitIds],
      startButtonLabel: this.getStartButtonLabel(),
      equippedItem,
      itemUsed: this.itemUsed,
      itemTargeting: this.itemTargeting,
      validItemTargets: this.getHighlightItemTargets(),
      validItemReserveTargets: this.getValidPotionReserveTargetIds(),
      pendingBombs: this.pendingBombs.map((b) => ({ ...b })),
      pendingLandmines: this.pendingLandmines.map((m) => ({ ...m })),
      showLandmines: true,
      coins: save.coins,
      inventory: save.inventory,
      ownedClasses: save.ownedClasses,
      lastCoinReward: this.lastCoinReward,
      canUseItem: this.canUseItem(),
      itemDef: equippedItem ? getItem(equippedItem) : null,
      tutorial: this.getTutorialView(),
      tutorialSelectableClassIds: this.getTutorialSelectableClassIds(),
      tutorialActorCell: this.getTutorialActorCell(),
      tutorialPointer: this.getTutorialPointer(),
    };
  }

  resetTurnActions() {
    this.actionsRemaining = this.getActionsPerTurn();
    this.actedUnitIds = new Set();
  }

  canHumanAct() {
    if (this.phase !== 'battle' || this.animating) return false;
    return this.currentPlayer === 'blue';
  }

  ownsHumanUnit(unit) {
    return Boolean(unit && unit.team === 'blue');
  }

  getPlayerTurnMessage() {
    if (this.tutorial) return '';
    return this.currentPlayer === 'blue' ? '我方回合' : '對手回合';
  }

  hasValidActionsForTeam(team = this.currentPlayer) {
    const reserve = team === 'blue' ? this.blueReserve : this.redReserve;
    const deployCells = getValidDeployCells(this.board, this.mapProps, this.shadowClones);
    if (deployCells.length > 0 && reserve.length > 0) return true;

    for (const row of this.board) {
      for (const unit of row) {
        if (!unit || unit.team !== team || this.actedUnitIds.has(unit.id)) continue;
        if (getValidMoves(this.board, unit, this.mapProps, this.shadowClones).length > 0) return true;
        if (getValidAttackTargets(this.board, unit).length > 0) return true;
      }
    }
    return false;
  }

  applyTerrainAfterLanding(unitId, row, col) {
    const result = resolveMapPropOnEnter(this.board, this.mapProps, row, col, unitId);
    this.board = result.board;
    this.mapProps = result.mapProps;
    // The trap animation waits for the unit's mesh to finish walking in, so this
    // runs alongside the rest of the turn instead of blocking it.
    if (result.trigger) this.playMapPropFx?.(result.trigger);

    const landmineEvents = this.resolveLandmineOnEnter(unitId, row, col);
    return [...result.events, ...landmineEvents];
  }

  resolveLandmineOnEnter(unitId, row, col) {
    const idx = this.pendingLandmines.findIndex((m) => m.row === row && m.col === col);
    if (idx === -1) return [];

    const damage = getItem('landmine')?.effect?.damage ?? 2;
    this.pendingLandmines.splice(idx, 1);

    const damaged = applyTrapDamage(this.board, row, col, damage);
    this.board = damaged.board;

    if (!damaged.hit) return [];

    let events = [`🪤 地雷 -${damage}`];
    if (damaged.killed) {
      const explosion = resolveDeathExplosions(this.board, [damaged.killed]);
      this.board = explosion.board;
    }

    this.playLandmineFx?.({
      row,
      col,
      unitId,
      damage,
      killed: Boolean(damaged.killed),
    });

    return events;
  }

  appendTerrainToLabel(actionLabel, terrainEvents) {
    if (terrainEvents.length === 0) return actionLabel;
    return `${actionLabel} · ${terrainEvents.join('、')}`;
  }

  completeRecycleMove(movedUnit) {
    const recycled = { ...movedUnit, row: -1, col: -1 };
    if (movedUnit.team === 'blue') {
      this.blueReserve = [...this.blueReserve, recycled];
    } else {
      this.redReserve = [...this.redReserve, recycled];
    }
  }

  finishRecycleMove(unitId, label = '移動 · 回收') {
    this.endAction(label, unitId);
    return true;
  }

  finishMoveAction(unitId, row, col, baseLabel) {
    const terrainEvents = this.applyTerrainAfterLanding(unitId, row, col);
    let label = this.appendTerrainToLabel(baseLabel, terrainEvents);
    if (this.checkTerrainOutcome(baseLabel, terrainEvents)) return true;
    this.endAction(label, unitId);
    return true;
  }

  checkTerrainOutcome(actionLabel, terrainEvents) {
    if (terrainEvents.length === 0) return false;
    return this.checkWinAfterItemEffect(this.appendTerrainToLabel(actionLabel, terrainEvents));
  }

  // The tutorial replays a fixed script (js/tutorial.js) instead of consulting the AI.
  // Player input is narrowed to the one action the current step asks for, so a first-time
  // player cannot wander off the rails.

  startTutorial() {
    if (this.phase === 'battle' && !this.tutorial) return;

    this.boardMode = TUTORIAL_BOARD_MODE;
    this.blueRoster = [...TUTORIAL_BLUE_ROSTER];
    this.redRoster = [...TUTORIAL_RED_ROSTER];
    this.equippedItem = null;
    this.animating = false;
    this.tutorial = { stepIndex: 0, stage: 'player' };
    this.startRound();
  }

  exitTutorial(message) {
    markTutorialDone();
    this.tutorial = null;
    this.phase = 'lobby';
    this.animating = false;
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.mapProps = createEmptyMapProps(this.getModeConfig().size);
    this.blueRoster = [];
    this.redRoster = [];
    this.blueReserve = [];
    this.redReserve = [];
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.lastWinLine = null;
    this.endReason = null;
    this.finalScores = null;
    this.restoreEquippedItemPreference();
    this.message = message;
    this.notify();
  }

  skipTutorial() {
    if (!this.tutorial) return;
    this.exitTutorial('');
  }

  getTutorialStepDef() {
    if (!this.tutorial) return null;
    return getTutorialStep(this.tutorial.stepIndex);
  }

  /** The action the player still owes this step, or null when it's red's turn to reply. */
  getTutorialGoal() {
    if (!this.tutorial || this.tutorial.stage !== 'player') return null;
    return this.getTutorialStepDef()?.goal ?? null;
  }

  isTutorialActionAllowed(action) {
    if (!this.tutorial) return true;
    return matchesTutorialGoal(this.getTutorialGoal(), action);
  }

  rejectTutorialAction() {
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.message = '';
    this.notify();
  }

  /** Reserve classes the player may pick up right now; [] locks the whole bench. */
  getTutorialSelectableClassIds() {
    if (!this.tutorial) return null;
    const goal = this.getTutorialGoal();
    return goal?.type === 'deploy' ? [goal.classId] : [];
  }

  /** The only board unit the player may act with this step. */
  getTutorialActorCell() {
    const goal = this.getTutorialGoal();
    if (!goal || goal.type === 'deploy') return null;
    return { ...goal.from };
  }

  /** What the pointing finger sits on: reserve unit first, then the target cell. */
  getTutorialPointer() {
    const goal = this.getTutorialGoal();
    if (!goal) return null;

    if (goal.type === 'deploy') {
      if (this.selectedReserveId) return { kind: 'cell', row: goal.row, col: goal.col };
      const unit = this.getCurrentReserve().find((u) => u.classId === goal.classId);
      return unit ? { kind: 'reserve', unitId: unit.id } : null;
    }

    const cell = this.draggingUnitId ? goal.to : goal.from;
    return { kind: 'cell', row: cell.row, col: cell.col };
  }

  getTutorialView() {
    if (!this.tutorial) return null;
    const done = this.tutorial.stage === 'done';
    const step = this.getTutorialStepDef();
    return {
      stepNumber: Math.min(this.tutorial.stepIndex + 1, TUTORIAL_STEP_COUNT),
      totalSteps: TUTORIAL_STEP_COUNT,
      title: done ? '教學完成' : step?.title ?? '',
      waitingForEnemy: this.tutorial.stage === 'enemy',
      done,
    };
  }

  advanceTutorial() {
    if (this.currentPlayer === 'blue') {
      this.tutorial.stage = 'enemy';
      return;
    }
    this.tutorial.stepIndex += 1;
    this.tutorial.stage = 'player';
  }

  runTutorialEnemyTurn() {
    if (!this.tutorial || this.phase !== 'battle' || this.animating) return;
    if (this.currentPlayer !== 'red') return;

    const enemy = this.getTutorialStepDef()?.enemy;
    if (!enemy) {
      // Defensive: a step with no scripted reply would otherwise stall on red's turn.
      this.advanceTutorial();
      this.switchPlayer();
      return;
    }

    if (enemy.type === 'deploy') {
      const unit = this.redReserve.find((u) => u.classId === enemy.classId);
      if (!unit) return;
      const result = applyDeploy(this.board, unit, enemy.row, enemy.col);
      this.board = result.board;
      this.redReserve = this.redReserve.filter((u) => u.id !== unit.id);
      const terrainEvents = this.applyTerrainAfterLanding(unit.id, enemy.row, enemy.col);
      if (this.checkTerrainOutcome(enemy.label, terrainEvents)) return;
      this.endAction(this.appendTerrainToLabel(enemy.label, terrainEvents), unit.id, { isDeploy: true });
      return;
    }

    const attacker = this.board[enemy.from.row]?.[enemy.from.col];
    if (!attacker) return;

    if (enemy.type === 'move') {
      const result = applyMove(this.board, attacker, enemy.to.row, enemy.to.col, this.shadowClones);
      this.board = result.board;
      this.shadowClones = result.shadowClones ?? this.shadowClones;
      if (result.recycleMove) {
        this.completeRecycleMove(result.unit);
        this.endAction(`${enemy.label} · 回收`, attacker.id);
        return;
      }
      const terrainEvents = this.applyTerrainAfterLanding(attacker.id, enemy.to.row, enemy.to.col);
      if (this.checkTerrainOutcome(enemy.label, terrainEvents)) return;
      this.endAction(this.appendTerrainToLabel(enemy.label, terrainEvents), attacker.id);
      return;
    }

    const target = this.board[enemy.to.row]?.[enemy.to.col];
    if (!target) return;

    this.resolveAttack(attacker, target, enemy.label);
  }

  /** 匹配逾時：用玩家編組（若未完成則退回預設）立刻開打 AI */
  startQuickAiBattle(boardMode) {
    if (!BOARD_MODES[boardMode]) return;
    this.tutorial = null;
    this.syncFormationMode(boardMode);
    if (!this.isFormationReady()) {
      this.blueRoster = [...this.getModeConfig().roster];
    }
    this.itemUsed = false;
    this.itemTargeting = null;
    this.pendingBombs = [];
    this.pendingLandmines = [];
    this.animating = false;
    this.redRoster = createRandomRoster(this.boardMode);
    this.startRound();
  }

  getRoundFirstPlayer() {
    return 'blue';
  }

  startRound() {
    const mode = this.getModeConfig();
    this.board = createEmptyBoard(mode.size);
    this.mapProps = generateMapPropsForMode(this.boardMode);
    this.board = placeModeCastles(this.board, this.boardMode);
    this.shadowClones = [];
    this.blueReserve = createTeamReserve(this.blueRoster, 'blue', this.boardMode);
    this.redReserve = createTeamReserve(this.redRoster, 'red', this.boardMode);
    this.currentPlayer = this.getRoundFirstPlayer();
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.lastWinLine = null;
    this.endReason = null;
    this.finalScores = null;
    this.phase = 'battle';
    this.resetTurnActions();
    this.resetBattleItemState();

    this.message = this.tutorial ? '' : this.getPlayerTurnMessage();

    this.notify();
    this.scheduleAiIfNeeded();
  }

  scheduleAiIfNeeded() {
    if (this.phase !== 'battle' || this.animating) return;
    if (this.tutorial) {
      if (this.currentPlayer === 'red') {
        setTimeout(() => this.runTutorialEnemyTurn(), 800);
      }
      return;
    }
    if (this.currentPlayer === 'red') {
      setTimeout(() => this.runAiTurn(), 500);
    }
  }

  selectReserve(unitId) {
    if (!this.canHumanAct()) return;
    if (this.itemTargeting) {
      this.selectedReserveId = null;
      this.tryItemTargetReserve(unitId);
      return;
    }
    const unit = this.getCurrentReserve().find((u) => u.id === unitId);
    if (!unit || !this.ownsHumanUnit(unit)) return;
    const selectable = this.getTutorialSelectableClassIds();
    if (selectable && !selectable.includes(unit.classId)) {
      this.rejectTutorialAction();
      return;
    }
    this.draggingUnitId = null;
    this.inspectedUnitId = null;
    this.selectedReserveId = unitId;
    this.message = `部署 ${CLASSES[unit.classId].name}`;
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
      this.message = `${cls.name} ${unit.hp}/${unit.maxHp} · ${unit.atk}`;
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
    if (this.itemTargeting) {
      this.cancelItemTargeting();
      return;
    }
    if (this.actedUnitIds.has(unitId)) return;
    const unit = this.board.flat().find((u) => u?.id === unitId);
    if (!unit || !this.ownsHumanUnit(unit) || isCastleUnit(unit)) return;
    if (this.tutorial) {
      const actor = this.getTutorialActorCell();
      if (!actor || actor.row !== unit.row || actor.col !== unit.col) {
        this.rejectTutorialAction();
        return;
      }
    }
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.draggingUnitId = unitId;
    this.message = '選目標格';
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

    if (target.team === unit.team) {
      if (isCastleUnit(target) && this.tryMoveTo(unitId, row, col)) {
        this.draggingUnitId = null;
        return;
      }
      this.resetPlayerTurn();
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
    // The script has no notion of a skipped turn, and the tutorial runs without a clock.
    if (this.tutorial) return;
    if (this.itemTargeting) this.cancelItemTargeting();
    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.actionsRemaining = 0;
    this.switchPlayer();
  }

  getCurrentReserve() {
    return this.currentPlayer === 'blue' ? this.blueReserve : this.redReserve;
  }

  getRecycleMovesForUnit(unit) {
    return getValidMoves(this.board, unit, this.mapProps, this.shadowClones)
      .filter(([row, col]) => isFriendlyCastleCell(this.board, row, col, unit.team));
  }

  getHighlightMoves() {
    if (!this.draggingUnitId) return [];
    if (this.actedUnitIds.has(this.draggingUnitId)) return [];
    const unit = this.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    return this.narrowToTutorialGoal(getValidMoves(this.board, unit, this.mapProps, this.shadowClones), 'move');
  }

  getHighlightRecycleMoves() {
    if (!this.draggingUnitId) return [];
    if (this.actedUnitIds.has(this.draggingUnitId)) return [];
    const unit = this.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    const recycleMoves = this.getRecycleMovesForUnit(unit);
    return this.narrowToTutorialGoal(recycleMoves, 'move');
  }

  getHighlightTargets() {
    if (!this.draggingUnitId) return [];
    if (this.actedUnitIds.has(this.draggingUnitId)) return [];
    const unit = this.board.flat().find((u) => u?.id === this.draggingUnitId);
    if (!unit) return [];
    const targets = getValidAttackTargets(this.board, unit).map((t) => [t.row, t.col]);
    return this.narrowToTutorialGoal(targets, 'attack');
  }

  getHighlightDeploy() {
    if (!this.selectedReserveId) return [];
    return this.narrowToTutorialGoal(getValidDeployCells(this.board, this.mapProps, this.shadowClones), 'deploy');
  }

  /** During tutorial, only highlight the one cell the current step asks for. */
  narrowToTutorialGoal(cells, actionType) {
    if (!this.tutorial) return cells;
    const goal = this.getTutorialGoal();
    if (!goal || goal.type !== actionType) return [];

    if (actionType === 'deploy') {
      const match = cells.filter(([r, c]) => r === goal.row && c === goal.col);
      return match.length > 0 ? match : cells;
    }

    const match = cells.filter(([r, c]) => r === goal.to.row && c === goal.to.col);
    return match.length > 0 ? match : cells;
  }

  clickCell(row, col) {
    if (this.phase !== 'battle' || this.animating) return;
    if (!this.canHumanAct()) return;

    if (this.itemTargeting) {
      this.tryItemTarget(row, col);
      return;
    }

    if (this.selectedReserveId) {
      this.tryDeploy(row, col);
    }
  }

  tryDeploy(row, col) {
    const reserve = this.getCurrentReserve();
    const unit = reserve.find((u) => u.id === this.selectedReserveId);
    if (!unit || this.board[row][col] || isObstacleCell(this.mapProps, row, col)) return;
    if (!this.isTutorialActionAllowed({ type: 'deploy', classId: unit.classId, row, col })) {
      this.rejectTutorialAction();
      return;
    }

    const result = applyDeploy(this.board, unit, row, col);
    this.board = result.board;
    if (this.currentPlayer === 'blue') {
      this.blueReserve = this.blueReserve.filter((u) => u.id !== unit.id);
    } else {
      this.redReserve = this.redReserve.filter((u) => u.id !== unit.id);
    }

    const terrainEvents = this.applyTerrainAfterLanding(unit.id, row, col);
    const label = `部署 ${CLASSES[unit.classId].name}`;
    if (this.checkTerrainOutcome(label, terrainEvents)) return;
    this.endAction(this.appendTerrainToLabel(label, terrainEvents), unit.id, { isDeploy: true });
  }

  tryMoveTo(unitId, row, col) {
    const unit = this.board.flat().find((u) => u?.id === unitId);
    if (!unit) return false;
    if (this.actedUnitIds.has(unitId)) return false;
    const valid = getValidMoves(this.board, unit, this.mapProps, this.shadowClones);
    if (!valid.some(([r, c]) => r === row && c === col)) return false;
    const move = { type: 'move', from: { row: unit.row, col: unit.col }, to: { row, col } };
    if (!this.isTutorialActionAllowed(move)) return false;

    const result = applyMove(this.board, unit, row, col, this.shadowClones);
    this.board = result.board;
    this.shadowClones = result.shadowClones ?? this.shadowClones;
    if (result.recycleMove) {
      this.completeRecycleMove(result.unit);
      return this.finishRecycleMove(unitId);
    }
    return this.finishMoveAction(unitId, row, col, '移動');
  }

  async resolveAttack(unit, target, label) {
    const volleyEndpoints = unit.type === 'tower'
      ? getTowerVolleyEndpoints(this.board, unit)
      : [];
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
      type: unit.type === 'support' ? 'melee' : unit.type === 'artillery' ? 'ranged' : unit.type,
      damage: unit.atk,
      volleyEndpoints,
      explosions: result.explosions ?? [],
    };

    this.animating = true;
    if (this.playAttackFx) {
      await this.playAttackFx(fx);
    }

    if (this.phase !== 'battle') {
      this.animating = false;
      return;
    }

    this.board = result.board;
    this.animating = false;

    let detail = `${label}（命中 ${result.hits.length} 個目標`;
    if (result.possessed?.length > 0) {
      const victimName = CLASSES[result.possessed[0].victimClassId]?.name ?? '敵人';
      detail += `，幽魂附身 ${victimName}`;
    }
    if (result.poisoned?.length > 0) {
      detail += `，${result.poisoned.length} 人中毒`;
    }
    if (result.explosions?.length > 0) {
      const blastHits = result.explosions.reduce((n, e) => n + e.targets.length, 0);
      detail += `，自爆波及 ${blastHits} 人`;
    }
    detail += '）';
    await this.endAction(detail, unit.id);
  }

  tryAttackTarget(unitId, row, col) {
    const unit = this.board.flat().find((u) => u?.id === unitId);
    const target = this.board[row][col];
    if (!unit || !target || target.team === unit.team) return false;
    if (this.actedUnitIds.has(unitId)) return false;

    const valid = getValidAttackTargets(this.board, unit);
    if (!valid.some((t) => t.id === target.id)) return false;
    const attack = { type: 'attack', from: { row: unit.row, col: unit.col }, to: { row, col } };
    if (!this.isTutorialActionAllowed(attack)) return false;

    this.resolveAttack(unit, target, '攻擊');
    return true;
  }

  async endAction(actionLabel, unitId, { isDeploy = false } = {}) {
    const team = TEAM[this.currentPlayer];
    const enemy = this.currentPlayer === 'blue' ? 'red' : 'blue';
    const enemyReserve = enemy === 'blue' ? this.blueReserve : this.redReserve;

    const actingUnit = this.board.flat().find((u) => u?.id === unitId);
    const excludePriestIds = isDeploy && actingUnit?.passiveBlessing ? [unitId] : [];
    const blessing = applyTeamPriestBlessings(this.board, this.currentPlayer, excludePriestIds);
    if (blessing.targets.length > 0) {
      actionLabel += ` · 祝福 ${blessing.targets.length} 名友軍`;
      if (this.playBlessFx) {
        this.animating = true;
        await this.playBlessFx({
          targets: blessing.targets.map((target) => ({
            row: target.row,
            col: target.col,
            amount: 1,
          })),
        });
        this.animating = false;
      }
      this.board = blessing.board;
    }

    this.actedUnitIds.add(unitId);
    this.actionsRemaining--;
    this.draggingUnitId = null;
    this.selectedReserveId = null;

    if (this.tutorial) this.advanceTutorial();

    const winLine = checkWin(this.board, this.currentPlayer, this.mapProps);

    if (winLine) {
      this.lastWinLine = winLine;
      this.handleRoundWin(this.currentPlayer, `連 ${this.getWinCountLabel()} 子`);
      return;
    }

    if (isTeamEliminated(this.board, enemy, enemyReserve)) {
      this.lastWinLine = null;
      this.handleRoundWin(this.currentPlayer, '全滅');
      return;
    }

    if (checkCastleVictory(this.board, this.currentPlayer, this.boardMode)) {
      this.lastWinLine = null;
      this.handleRoundWin(this.currentPlayer, '攻破城堡', 'castle');
      return;
    }

    if (this.actionsRemaining > 0) {
      if (!this.hasValidActionsForTeam()) {
        this.switchPlayer();
        return;
      }
      this.message = this.getPlayerTurnMessage();
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
    const endedTeam = this.currentPlayer;
    this.currentPlayer = this.currentPlayer === 'blue' ? 'red' : 'blue';
    this.shadowClones = expireShadowClonesForTurnStart(this.shadowClones, this.currentPlayer);
    this.resetTurnActions();

    if (this.applyTurnBoundaryEffects(endedTeam)) return;

    this.message = this.getPlayerTurnMessage();
    this.notify();
    this.scheduleAiIfNeeded();
  }

  runAiTurn() {
    if (this.phase !== 'battle' || this.animating) return;
    if (this.tutorial) {
      this.runTutorialEnemyTurn();
      return;
    }

    if (this.currentPlayer !== 'red') return;

    const mode = this.getModeConfig();
    const action = chooseAiAction(
      {
        board: this.board,
        boardMode: this.boardMode,
        mapProps: this.mapProps,
        shadowClones: this.shadowClones,
        redReserve: this.redReserve,
        blueReserve: this.blueReserve,
        actedUnitIds: this.actedUnitIds,
      },
      {
        team: 'red',
        actionsPerTurn: mode.actionsPerTurn,
        rosters: { blue: this.blueRoster, red: this.redRoster },
      },
    );

    if (!action) {
      if (this.actionsRemaining > 0) {
        this.switchPlayer();
      }
      return;
    }

    const teamLabel = TEAM.red.name;

    if (action.type === 'deploy') {
      const unit = this.redReserve.find((u) => u.id === action.unitId);
      if (!unit) return;
      if (isObstacleCell(this.mapProps, action.row, action.col)) {
        this.endAction(`${teamLabel} 略過`, action.unitId);
        return;
      }
      const result = applyDeploy(this.board, unit, action.row, action.col);
      this.board = result.board;
      this.redReserve = this.redReserve.filter((u) => u.id !== unit.id);
      const deployLabel = `${teamLabel} 部署 ${CLASSES[unit.classId].name}`;
      const terrainEvents = this.applyTerrainAfterLanding(unit.id, action.row, action.col);
      if (this.checkTerrainOutcome(deployLabel, terrainEvents)) return;
      this.endAction(this.appendTerrainToLabel(deployLabel, terrainEvents), unit.id, { isDeploy: true });
      return;
    }

    if (action.type === 'move') {
      const unit = this.board.flat().find((u) => u?.id === action.unitId);
      if (!unit) return;
      const valid = getValidMoves(this.board, unit, this.mapProps, this.shadowClones);
      if (!valid.some(([r, c]) => r === action.row && c === action.col)) {
        this.endAction(`${teamLabel} 略過`, action.unitId);
        return;
      }
      const result = applyMove(this.board, unit, action.row, action.col, this.shadowClones);
      this.board = result.board;
      this.shadowClones = result.shadowClones ?? this.shadowClones;
      if (result.recycleMove) {
        this.completeRecycleMove(result.unit);
        this.endAction(`${teamLabel} 移動 · 回收`, action.unitId);
        return;
      }
      const moveLabel = `${teamLabel} 移動`;
      const terrainEvents = this.applyTerrainAfterLanding(action.unitId, action.row, action.col);
      if (this.checkTerrainOutcome(moveLabel, terrainEvents)) return;
      this.endAction(this.appendTerrainToLabel(moveLabel, terrainEvents), action.unitId);
      return;
    }

    if (action.type === 'attack') {
      const unit = this.board.flat().find((u) => u?.id === action.unitId);
      const target = this.board.flat().find((u) => u?.id === action.targetId);
      this.resolveAttack(unit, target, `${teamLabel} 攻擊`);
    }
  }

  surrender() {
    if (this.phase !== 'battle' || this.animating) return;
    if (this.tutorial) return;

    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.lastWinLine = null;
    this.handleRoundWin('red', `${TEAM.blue.name}投降`);
  }

  endMatchByTime() {
    if (this.phase !== 'battle') return;
    if (this.tutorial) return;

    const mode = this.getModeConfig();
    const context = createSearchContext(
      {
        board: this.board,
        mapProps: this.mapProps,
        blueReserve: this.blueReserve,
        redReserve: this.redReserve,
        actedUnitIds: this.actedUnitIds,
      },
      {
        team: this.currentPlayer,
        actionsPerTurn: mode.actionsPerTurn,
      },
    );
    const blueScore = evaluate(context, 'blue');
    const redScore = evaluate(context, 'red');
    const winner = blueScore === redScore
      ? null
      : blueScore > redScore ? 'blue' : 'red';

    this.draggingUnitId = null;
    this.selectedReserveId = null;
    this.inspectedUnitId = null;
    this.lastWinLine = null;
    this.animating = false;
    this.endReason = 'timeout';
    this.finalScores = { blue: blueScore, red: redScore };

    const detail = `時間到 ${blueScore}:${redScore}`;
    this.handleRoundWin(winner, detail, 'timeout');
  }

  handleRoundWin(winner, detail, reason = 'victory') {
    this.endReason = reason;
    this.animating = true;

    let endMessage;
    if (this.tutorial) {
      // No coin payout: the tutorial is a fixed script and would otherwise be farmable.
      this.tutorial.stage = 'done';
      this.lastCoinReward = 0;
      markTutorialDone();
      endMessage = winner === 'blue' ? '教學完成！' : detail;
    } else {
      const didWin = winner === 'blue';
      const isDraw = winner === null;
      const reward = isDraw
        ? getCoinReward(this.boardMode, false)
        : getCoinReward(this.boardMode, didWin);

      addCoins(reward);
      this.lastCoinReward = reward;

      const coinText = reward > 0 ? ` +${reward}` : '';
      endMessage = winner
        ? `${TEAM[winner].name}獲勝${coinText}`
        : `平手${coinText}`;
    }

    this.clearEndSequence();
    this._endRevealPending = true;
    this.notify();

    this._endRevealTimer = setTimeout(() => {
      this._endRevealTimer = null;
      if (!this._endRevealPending) return;
      this._endRevealPending = false;
      this.phase = 'gameEnd';
      this.message = endMessage;
      this.animating = false;
      this.notify();
    }, GAME_END_REVEAL_MS);
  }

  restartSeries() {
    // Back to formation rather than the mode picker: the lineup is the interesting
    // thing to retune between games, and it survives so a rematch is one tap away.
    this.clearEndSequence();
    this.phase = 'formation';
    this.board = createEmptyBoard(this.getModeConfig().size);
    this.mapProps = createEmptyMapProps(this.getModeConfig().size);
    this.lastWinLine = null;
    this.endReason = null;
    this.finalScores = null;
    this.blueReserve = [];
    this.redReserve = [];
    this.message = '';
    this.notify();
  }
}

export { CLASSES, TEAM, BOARD_MODES };
