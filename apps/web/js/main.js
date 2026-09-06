import { Game, CLASSES, BOARD_MODES, GAME_END_MODAL_MS, GAME_END_FADE_MS } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';
import { CharacterPreviewScene } from './board3d/CharacterPreviewScene.js';
import { generateUnitThumbnails, fillUnitIcon, fillCopyCardIcon, fillFragmentCardIcon } from './board3d/UnitThumbnails.js';
import { generateNavThumbnails, applyNavIcons } from './board3d/NavThumbnails.js';
import { NavIconAnimator } from './board3d/NavIconAnimator.js';
import { ITEMS, SHOP_PRICES, ITEM_IDS, FRAGMENT_PRICE } from './items.js';
import { generateItemThumbnails, fillItemIcon, generateMapPropThumbnails, fillMapPropIcon } from './board3d/ItemThumbnails.js';
import { CLASS_IDS, getRosterLimit, getMaxPerClass, isCastleUnit, modeHasAutoCastle, getCastleHpForMode, getDeployableRoster, hasPlayableRoster, isSurvivalMode, isLocalOnlyMode, getClassCombatStats, getClassLevelLabel, getClassLevelBonuses, getUpgradeCopyCost, FRAGMENTS_PER_COPY, CLASS_LEVEL_MIN, CLASS_LEVEL_MAX } from './units.js';
import { createStatBadge, renderStatBadgeHtml } from './statIcons.js';
import { mountUiIcons, setCurrencyMeta, renderCurrencyMetaHtml } from './uiIcons.js';
import { MAP_PROPS, MAP_PROP_KINDS } from './mapProps.js';
import { CODEX_TABS } from './codex.js';
import { getClassDiamondPrice } from './unlocks.js';
import {
  loadSave,
  buyItem,
  buyClass,
  buyFragment,
  synthesizeCopy,
  upgradeClass,
  canAfford,
  canAffordClass,
  isClassOwned,
  isTutorialDone,
  initCloudSave,
  getSaveSnapshot,
  getSavedRostersByMode,
  getSavedEquippedItem,
  getOwnedClassLevels,
  claimDailyQuest,
} from './save.js';
import { onlineClient } from './online.js';
import {
  hideTimedOverlay,
  revealOverlay,
  showAlert,
  showConfirm,
  showTimedOverlay,
} from './ui.js';
import {
  REACTIONS,
  REACTION_DISPLAY_MS,
  REACTION_COOLDOWN_MS,
  fillReactionIcon,
} from './reactions.js';
import { getDailyQuestDefinitions } from './dailyQuests.js';

loadSave();

// Block browser pinch / trackpad zoom so gestures stay on the board.
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

const game = new Game();

const appEl = document.querySelector('.app');
const boardCanvasHost = document.getElementById('boardCanvas');
const fxLayerEl = document.getElementById('fxLayer');
const boardWrapEl = document.querySelector('.board-wrap');
const lobbyContentEl = document.getElementById('lobbyContent');
const battleContentEl = document.getElementById('battleContent');
const formationModeButtonsEl = document.getElementById('formationModeButtons');
const formationCountEl = document.getElementById('formationCount');
const formationLineupEl = document.getElementById('formationLineup');
const formationPoolEl = document.getElementById('formationPool');
const turnTimerEl = document.getElementById('turnTimer');
const turnTimerFillEl = document.getElementById('turnTimerFill');
const matchTimerEl = document.getElementById('matchTimer');
const matchTimerFillEl = document.getElementById('matchTimerFill');
const matchTimerTextEl = document.getElementById('matchTimerText');
const codexTabsEl = document.getElementById('codexTabs');
const codexPickerEl = document.getElementById('codexPicker');
const codexDetailInfoEl = document.getElementById('codexDetailInfo');
const codexPreviewHostEl = document.getElementById('codexPreviewHost');
const codexRangeLegendEl = document.getElementById('codexRangeLegend');
const endResultEl = document.getElementById('endResult');
const gameEndOverlayEl = document.getElementById('gameEndOverlay');
const modeButtonsEl = document.getElementById('onlineModeButtons');
const dailyQuestListEl = document.getElementById('dailyQuestList');
const onlineLobbyActionsEl = document.getElementById('onlineLobbyActions');
const onlineWaitingEl = document.getElementById('onlineWaiting');
const waitingRoomCodeEl = document.getElementById('waitingRoomCode');
const waitingRoomCodeLineEl = document.getElementById('waitingRoomCodeLine');
const onlineMatchIndicatorEl = document.getElementById('onlineMatchIndicator');
const onlineMatchLabelTextEl = document.getElementById('onlineMatchLabelText');
const findMatchBtn = document.getElementById('findMatchBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const cancelRoomBtn = document.getElementById('cancelRoomBtn');
const surrenderBtn = document.getElementById('surrender');
const battleActionMenuEl = document.getElementById('battleActionMenu');
const battleActionSheetEl = document.getElementById('battleActionSheet');
const battleActionFabEl = document.getElementById('battleActionFab');
const battleActionEmojisEl = document.getElementById('battleActionEmojis');
const reactionBubbleEl = document.getElementById('reactionBubble');
const reactionBubbleIconEl = document.getElementById('reactionBubbleIcon');
const reactionBubbleOwnEl = document.getElementById('reactionBubbleOwn');
const reactionBubbleOwnIconEl = document.getElementById('reactionBubbleOwnIcon');
const bottomNavEl = document.getElementById('bottomNav');
const winConditionToastEl = document.getElementById('winConditionToast');
const turnToastEl = document.getElementById('turnToast');
const turnToastTextEl = document.getElementById('turnToastText');
const winConditionTextEl = document.getElementById('winConditionText');
const coinBalanceEl = document.getElementById('coinBalance');
const diamondBalanceEl = document.getElementById('diamondBalance');
const coinBalanceAmountEl = coinBalanceEl?.querySelector('.currency-amount');
const diamondBalanceAmountEl = diamondBalanceEl?.querySelector('.currency-amount');
const purchaseToastEl = document.getElementById('purchaseToast');
const purchaseToastTextEl = document.getElementById('purchaseToastText');
const formationItemsEl = document.getElementById('formationItems');
const formationItemSectionEl = document.getElementById('formationItemSection');
const startSurvivalBtnEl = document.getElementById('startSurvivalBtn');
const survivalLobbyActionsEl = document.getElementById('survivalLobbyActions');
const startSurvivalLobbyBtnEl = document.getElementById('startSurvivalLobbyBtn');
const survivalRoundEl = document.getElementById('survivalRound');
const shopGridEl = document.getElementById('shopGrid');
const itemBattleBtnEl = document.getElementById('itemBattleBtn');
const itemBattleIconEl = document.getElementById('itemBattleIcon');
const startTutorialBtn = document.getElementById('startTutorial');
const tutorialPanelEl = document.getElementById('tutorialPanel');
const tutorialStepEl = document.getElementById('tutorialStep');
const tutorialTitleEl = document.getElementById('tutorialTitle');
const tutorialSkipBtn = document.getElementById('tutorialSkip');
const enemyReserveBarEl = document.getElementById('enemyReserveBar');
const enemyReserveCardsEl = document.getElementById('enemyReserveCards');
const ownReserveBarEl = document.getElementById('ownReserveBar');
const ownReserveCardsEl = document.getElementById('ownReserveCards');
const reserveTutorialPointerEl = document.getElementById('reserveTutorialPointer');

const NAV_SCREENS = {
  battle: document.getElementById('screenBattle'),
  formation: document.getElementById('screenFormation'),
  codex: document.getElementById('screenCodex'),
  quests: document.getElementById('screenQuests'),
  shop: document.getElementById('screenShop'),
};

const DEFAULT_TURN_DURATION_MS = 15000;
const DEFAULT_TURN_BONUS_MS = 5000;
const TURN_TIMER_TICK_MS = 50;
const MATCH_TIMER_TICK_MS = 100;

let turnTimerInterval = null;
let turnTimerRemainingMs = DEFAULT_TURN_DURATION_MS;
let turnTimerBarMaxMs = DEFAULT_TURN_DURATION_MS;
let turnTimerBonusMs = DEFAULT_TURN_BONUS_MS;
let turnTimerLastTick = 0;
let turnTimerPaused = false;
let turnTimerHumanTurn = false;
let turnTimerLastActedCount = 0;
let matchTimerInterval = null;
let matchTimerDurationMs = 0;
let matchTimerRemainingMs = 0;
let matchTimerLastTick = 0;
let matchTimerActive = false;

function formatClock(durationMs) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clearMatchTimer() {
  if (matchTimerInterval) {
    clearInterval(matchTimerInterval);
    matchTimerInterval = null;
  }
  matchTimerActive = false;
  matchTimerLastTick = 0;
}

const timerFillAnim = new WeakMap();

function timerFillPct(remainingMs, maxMs) {
  return maxMs > 0 ? Math.min(1, Math.max(0, remainingMs / maxMs)) : 0;
}

function freezeTimerFill(el, pct) {
  el.style.transition = 'none';
  el.style.width = `${pct * 100}%`;
  timerFillAnim.set(el, { remainingAtStart: null, startedAt: 0, paused: true });
}

function drainTimerFill(el, remainingMs, maxMs) {
  const pct = timerFillPct(remainingMs, maxMs);
  if (remainingMs <= 0 || pct <= 0) {
    freezeTimerFill(el, 0);
    return;
  }

  const now = performance.now();
  const prev = timerFillAnim.get(el);
  const expectedRemaining = prev && !prev.paused && prev.remainingAtStart != null
    ? prev.remainingAtStart - (now - prev.startedAt)
    : null;
  const increased = expectedRemaining != null && remainingMs > expectedRemaining + 200;
  const drifted = expectedRemaining != null && Math.abs(expectedRemaining - remainingMs) > 1200;
  const needsRestart = !prev || prev.paused || expectedRemaining == null || increased || drifted;

  if (!needsRestart) return;

  el.style.transition = 'none';
  el.style.width = `${pct * 100}%`;
  void el.offsetWidth;
  // A CSS width transition started while display:none jumps to 0% and never
  // restarts (remaining time only decreases). Wait until the bar is laid out.
  if (el.getClientRects().length === 0) {
    freezeTimerFill(el, pct);
    return;
  }

  timerFillAnim.set(el, {
    remainingAtStart: remainingMs,
    startedAt: now,
    paused: false,
  });

  el.style.transition = `width ${remainingMs}ms linear, background 0.25s ease`;
  el.style.width = '0%';
}

function updateMatchTimer() {
  const pct = timerFillPct(matchTimerRemainingMs, matchTimerDurationMs);
  matchTimerTextEl.textContent = formatClock(matchTimerRemainingMs);
  matchTimerEl.classList.toggle('match-timer-low', pct <= 0.1 && pct > 0);
  drainTimerFill(matchTimerFillEl, matchTimerRemainingMs, matchTimerDurationMs);
}

function startMatchTimer(durationMs) {
  clearMatchTimer();
  matchTimerActive = true;
  matchTimerDurationMs = durationMs;
  matchTimerRemainingMs = durationMs;
  matchTimerLastTick = performance.now();
  matchTimerEl.classList.remove('hidden');
  matchTimerEl.setAttribute('aria-hidden', 'false');
  updateMatchTimer();

  matchTimerInterval = setInterval(() => {
    const now = performance.now();
    matchTimerRemainingMs -= now - matchTimerLastTick;
    matchTimerLastTick = now;

    if (matchTimerRemainingMs <= 0) {
      matchTimerRemainingMs = 0;
      updateMatchTimer();
      game.endMatchByTime();
      return;
    }

    updateMatchTimer();
  }, MATCH_TIMER_TICK_MS);
}

function syncMatchTimer(state) {
  // The tutorial follows a script, so neither clock may cut a step short.
  if (state.phase !== 'battle' || state.tutorial || state.isSurvivalMode || !state.matchDurationMs) {
    matchTimerEl.classList.add('hidden');
    matchTimerEl.setAttribute('aria-hidden', 'true');
    clearMatchTimer();
    return;
  }

  if (!matchTimerActive) {
    startMatchTimer(state.matchDurationMs);
  }
}

function clearTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  turnTimerPaused = false;
  turnTimerHumanTurn = false;
  turnTimerLastTick = 0;
  turnTimerLastActedCount = 0;
}

function updateTurnTimerBar() {
  const pct = timerFillPct(turnTimerRemainingMs, turnTimerBarMaxMs);
  turnTimerEl.classList.toggle('turn-timer-low', pct <= 0.25 && pct > 0);
  if (turnTimerPaused) {
    freezeTimerFill(turnTimerFillEl, pct);
    return;
  }
  drainTimerFill(turnTimerFillEl, turnTimerRemainingMs, turnTimerBarMaxMs);
}

function addTurnTimerBonus(actionCount = 1) {
  // Modes with a single action per turn end before the bonus could ever be spent.
  if (turnTimerBonusMs <= 0) return;
  turnTimerRemainingMs += actionCount * turnTimerBonusMs;
  turnTimerBarMaxMs = Math.max(turnTimerBarMaxMs, turnTimerRemainingMs);
  updateTurnTimerBar();
}

function startTurnTimer(
  actedCount = 0,
  durationMs = DEFAULT_TURN_DURATION_MS,
  bonusMs = DEFAULT_TURN_BONUS_MS,
) {
  clearTurnTimer();
  turnTimerHumanTurn = true;
  turnTimerRemainingMs = durationMs;
  turnTimerBarMaxMs = durationMs;
  turnTimerBonusMs = bonusMs;
  turnTimerLastActedCount = actedCount;
  turnTimerLastTick = performance.now();
  turnTimerEl.classList.remove('hidden');
  turnTimerEl.setAttribute('aria-hidden', 'false');
  updateTurnTimerBar();

  turnTimerInterval = setInterval(() => {
    if (turnTimerPaused) {
      turnTimerLastTick = performance.now();
      return;
    }

    const now = performance.now();
    turnTimerRemainingMs -= now - turnTimerLastTick;
    turnTimerLastTick = now;

    if (turnTimerRemainingMs <= 0) {
      turnTimerRemainingMs = 0;
      updateTurnTimerBar();
      clearTurnTimer();
      turnTimerEl.classList.add('hidden');
      turnTimerEl.setAttribute('aria-hidden', 'true');
      game.endTurnEarly();
      return;
    }

    updateTurnTimerBar();
  }, TURN_TIMER_TICK_MS);
}

function syncTurnTimer(state) {
  const active = state.phase === 'battle'
    && state.isHumanTurn
    && !state.tutorial
    && !state.isSurvivalMode
    && state.turnDurationMs > 0;

  if (!active) {
    turnTimerEl.classList.add('hidden');
    turnTimerEl.setAttribute('aria-hidden', 'true');
    clearTurnTimer();
    return;
  }

  if (state.animating) {
    if (!turnTimerPaused) {
      turnTimerPaused = true;
      updateTurnTimerBar();
    }
    return;
  }

  if (!turnTimerHumanTurn) {
    startTurnTimer(state.actedUnitIds.length, state.turnDurationMs, state.turnBonusMs);
    return;
  }

  if (!state.animating) {
    const actedCount = state.actedUnitIds.length;
    if (actedCount > turnTimerLastActedCount) {
      addTurnTimerBonus(actedCount - turnTimerLastActedCount);
      turnTimerLastActedCount = actedCount;
    }
  }

  const wasPaused = turnTimerPaused;
  turnTimerPaused = false;
  if (wasPaused) updateTurnTimerBar();
}

let onlineModeActive = true;
let selectedOnlineMode = '4x4';
let onlineTimerInterval = null;

function getRosterForMode(modeId) {
  game.syncFormationMode(modeId);
  return [...game.blueRoster];
}

function prepareRosterForMatch(modeId) {
  return getRosterForMode(modeId);
}

function ensureRosterForMatch(modeId) {
  const roster = prepareRosterForMatch(modeId);
  if (!hasPlayableRoster(roster, modeId)) return null;
  return roster;
}

async function alertNeedRosterThenOpenFormation() {
  await showAlert('請先編組至少一名角色');
  switchNav('formation');
  render(getAppState());
}

function getMatchClassLevels() {
  return getOwnedClassLevels();
}

function isLocalMatchActive(local = game.getState()) {
  return local.tutorial
    || local.phase === 'battle'
    || local.phase === 'gameEnd'
    || local.phase === 'formation';
}

function getAppState() {
  const local = game.getState();
  if (isLocalMatchActive(local)) {
    return local;
  }

  if (onlineClient.gameState || onlineClient.roomState) {
    const state = onlineClient.getDisplayState();
    return { ...state, ...getSaveSnapshot() };
  }

  if (onlineModeActive) {
    const modeId = selectedOnlineMode;
    const blueRoster = getRosterForMode(modeId);
    const rosterLimit = getRosterLimit(modeId);
    return {
      phase: 'onlineLobby',
      boardMode: modeId,
      ...getSaveSnapshot(),
      onlineMode: true,
      blueRoster,
      rosterLimit,
      maxPerClass: getMaxPerClass(modeId),
      formationReady: getDeployableRoster(blueRoster, modeId).length === rosterLimit,
      equippedItem: game.equippedItem,
    };
  }
  return local;
}

function isOnlinePlaying() {
  return onlineModeActive && Boolean(onlineClient.gameState);
}

/** @type {'off' | 'shown' | 'fading' | 'leaving'} */
let gameEndOverlayStage = 'off';
/** @type {ReturnType<typeof setTimeout>[]} */
let gameEndLeaveTimers = [];

function clearGameEndLeaveTimers() {
  for (const timerId of gameEndLeaveTimers) clearTimeout(timerId);
  gameEndLeaveTimers = [];
}

function hideGameEndOverlay() {
  clearGameEndLeaveTimers();
  gameEndOverlayStage = 'off';
  hideTimedOverlay(gameEndOverlayEl);
}

function beginGameEndOverlay(message) {
  if (gameEndOverlayStage !== 'off') return;
  gameEndOverlayStage = 'shown';
  revealOverlay(gameEndOverlayEl, () => {
    endResultEl.textContent = message || '';
  });

  gameEndLeaveTimers.push(window.setTimeout(() => {
    gameEndOverlayStage = 'fading';
    gameEndOverlayEl.classList.remove('ui-visible');
    gameEndOverlayEl.classList.add('ui-dismiss');
    gameEndLeaveTimers.push(window.setTimeout(() => {
      hideTimedOverlay(gameEndOverlayEl);
      returnToHome();
    }, GAME_END_FADE_MS));
  }, GAME_END_MODAL_MS));
}

let gameEndReturning = false;

function returnToHome() {
  if (gameEndReturning) return;
  gameEndReturning = true;
  clearGameEndLeaveTimers();
  gameEndOverlayStage = 'leaving';
  hideTimedOverlay(gameEndOverlayEl);
  if (isOnlinePlaying() || onlineClient.roomState) {
    onlineClient.leaveOnline().then(() => {
      hideGameEndOverlay();
      gameEndReturning = false;
      render(getAppState());
    });
    return;
  }
  game.backToLobby();
  hideGameEndOverlay();
  gameEndReturning = false;
  render(getAppState());
}

function withOnlineOrLocal(onlineFn, localFn) {
  if (isOnlinePlaying()) onlineFn();
  else localFn();
}

let activeNav = 'battle';
let selectedClassId = 'swordsman';
let codexPreviewLevel = CLASS_LEVEL_MIN;
let codexPreviewLevelForClass = null;
let activeCodexTab = 'units';
let selectedItemId = ITEM_IDS[0];
let selectedMechanismId = MAP_PROP_KINDS[0];
let lastPhase = 'lobby';
let lastInCombat = false;

const WIN_CONDITION_SHOW_MS = 2800;
const WIN_CONDITION_FADE_MS = 450;

const TURN_TOAST_SHOW_MS = 1400;
const TURN_TOAST_FADE_MS = 900;
const PURCHASE_FEEDBACK_MS = 450;
const PURCHASE_TOAST_SHOW_MS = 1600;
const PURCHASE_TOAST_FADE_MS = 400;

/** @type {{ clear: () => void } | null} */
let turnToastController = null;
let battleMenuOpen = false;
/** @type {ReturnType<typeof createReactionBubble>|null} */
let opponentReactionBubble = null;
/** @type {ReturnType<typeof createReactionBubble>|null} */
let ownReactionBubble = null;
let reactionButtonsReady = false;
let lastReactionCooldownUntil = 0;
/** @type {{ clear: () => void } | null} */
let winConditionController = null;
/** @type {{ clear: () => void } | null} */
let purchaseToastController = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let purchaseNotifyTimer = null;
let lastTurnToastPlayer = null;
let lastTurnToastPhase = null;

function clearTurnToast() {
  turnToastController?.clear();
  turnToastController = null;
}

function showTurnToast(text, player) {
  const variant = player === 'blue' ? 'ui-card--blue' : 'ui-card--red';
  turnToastController = showTimedOverlay(turnToastEl, {
    showMs: TURN_TOAST_SHOW_MS,
    fadeMs: TURN_TOAST_FADE_MS,
    variantClasses: [variant],
    setup: () => {
      turnToastTextEl.textContent = text;
    },
  });
}

function syncTurnToast(state) {
  if (state.phase !== 'battle' || state.tutorial) {
    if (state.phase !== 'battle') {
      lastTurnToastPlayer = null;
      lastTurnToastPhase = null;
      clearTurnToast();
    }
    return;
  }

  const player = state.currentPlayer;
  const battleJustStarted = lastTurnToastPhase !== 'battle';
  lastTurnToastPhase = state.phase;

  if (!battleJustStarted && player === lastTurnToastPlayer) return;
  lastTurnToastPlayer = player;

  const text = player === 'blue' ? '我方回合' : '對手回合';
  const delay = battleJustStarted ? WIN_CONDITION_SHOW_MS + 250 : 0;
  if (delay > 0) {
    setTimeout(() => showTurnToast(text, player), delay);
  } else {
    showTurnToast(text, player);
  }
}

function clearWinConditionToast() {
  winConditionController?.clear();
  winConditionController = null;
}

function showWinConditionToast(winCount, boardMode) {
  winConditionController = showTimedOverlay(winConditionToastEl, {
    showMs: WIN_CONDITION_SHOW_MS,
    fadeMs: WIN_CONDITION_FADE_MS,
    setup: () => {
      if (boardMode === '6x6') {
        winConditionTextEl.textContent = '撐過越多回合越好 · 卡牌全滅即結束';
      } else if (boardMode === '5x5') {
        winConditionTextEl.textContent = `連成 ${winCount} 子 · 全滅對手 · 攻破城堡`;
      } else {
        winConditionTextEl.textContent = `連成 ${winCount} 子 · 全滅對手`;
      }
    },
  });
}

const BATTLE_PHASES = new Set(['battle', 'gameEnd']);

function isBottomNavLocked(state) {
  return state.phase === 'battle' || state.phase === 'gameEnd' || state.phase === 'onlineWaiting';
}

function canControlUnit(state, unit) {
  if (state.phase !== 'battle' || state.animating) return false;
  const myTeam = state.yourTeam ?? 'blue';
  if (unit.team !== myTeam) return false;
  if (isCastleUnit(unit)) return false;
  if (state.actedUnitIds.includes(unit.id)) return false;
  if (!state.isHumanTurn) return false;
  if (state.tutorial) {
    const actor = state.tutorialActorCell;
    return Boolean(actor) && actor.row === unit.row && actor.col === unit.col;
  }
  return true;
}

const board3d = new BoardScene(boardCanvasHost, fxLayerEl, {
  onCellClick: (row, col) => {
    if (isOnlinePlaying()) onlineClient.clickCell(row, col);
    else game.clickCell(row, col);
  },
  onUnitDragStart: (unitId) => {
    if (isOnlinePlaying()) onlineClient.beginDragUnit(unitId);
    else game.beginDragUnit(unitId);
  },
  onUnitDrop: (row, col) => {
    if (isOnlinePlaying()) onlineClient.dropOnCell(row, col);
    else game.dropOnCell(row, col);
  },
  onDragCancel: () => {
    if (isOnlinePlaying()) onlineClient.cancelDrag();
    else game.cancelDrag();
  },
  onReserveSelect: (unitId) => {
    if (isOnlinePlaying()) onlineClient.selectReserve(unitId);
    else game.selectReserve(unitId);
  },
  onUnitInspect: (unitId) => {
    if (isOnlinePlaying()) onlineClient.inspectUnit(unitId);
    else game.inspectUnit(unitId);
  },
  onItemTarget: (row, col) => {
    if (isOnlinePlaying()) return;
    game.tryItemTarget(row, col);
  },
  canControlUnit,
});

const unitPreview = new CharacterPreviewScene(codexPreviewHostEl);

const unitThumbnails = generateUnitThumbnails(Object.keys(CLASSES));
const itemThumbnails = generateItemThumbnails(ITEM_IDS);
const mapPropThumbnails = generateMapPropThumbnails(MAP_PROP_KINDS);
const navThumbnails = generateNavThumbnails();
applyNavIcons(bottomNavEl, navThumbnails);
mountUiIcons();
const navIconAnimator = new NavIconAnimator(bottomNavEl);
navIconAnimator.onNavChange(activeNav);

function setUnitIcon(container, classId) {
  const cls = CLASSES[classId];
  fillUnitIcon(container, classId, unitThumbnails, cls?.icon ?? '?', cls?.name ?? classId);
}

function setCopyCardIcon(container, classId) {
  const cls = CLASSES[classId];
  fillCopyCardIcon(container, classId, unitThumbnails, cls?.icon ?? '?', `${cls?.name ?? classId}複本`);
}

function setFragmentCardIcon(container, classId) {
  const cls = CLASSES[classId];
  fillFragmentCardIcon(container, classId, unitThumbnails, cls?.icon ?? '?', `${cls?.name ?? classId}碎片`);
}

function setItemIcon(container, item) {
  if (!item?.id) {
    container.textContent = item?.icon ?? '➖';
    return;
  }
  fillItemIcon(container, item.id, itemThumbnails, item.icon ?? '?', item.name ?? item.id);
}

function setMapPropIcon(container, kind) {
  const prop = MAP_PROPS[kind];
  fillMapPropIcon(container, kind, mapPropThumbnails, prop?.icon ?? '?', prop?.name ?? kind);
}

function updateCodexPreviewVisibility() {
  const showUnit3d = activeNav === 'codex' && activeCodexTab === 'units';
  unitPreview.setVisible(showUnit3d);
  codexPreviewHostEl?.classList.toggle('hidden', !showUnit3d);
  if (showUnit3d) {
    unitPreview.setClass(selectedClassId);
  }
}

function switchCodexTab(tab) {
  if (!CODEX_TABS.includes(tab)) return;
  activeCodexTab = tab;
}

function renderCodexTabs() {
  if (!codexTabsEl) return;
  for (const btn of codexTabsEl.querySelectorAll('[data-codex-tab]')) {
    const tab = btn.dataset.codexTab;
    const active = tab === activeCodexTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
}

function createCodexPickBtn({ active, title, onClick, fillIcon }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'class-pick-btn' + (active ? ' active' : '');
  btn.title = title;
  fillIcon(btn);
  btn.addEventListener('click', onClick);
  return btn;
}

function renderCodexItemDetail(itemId) {
  const item = ITEMS[itemId];
  if (!item) return;

  codexDetailInfoEl.innerHTML = `
    <h2 class="detail-name">${item.name}</h2>
    <p class="codex-desc">${item.desc}</p>
  `;
}

function renderCodexMechanismDetail(kind) {
  const prop = MAP_PROPS[kind];
  if (!prop) return;

  codexDetailInfoEl.innerHTML = `
    <h2 class="detail-name">${prop.name}</h2>
    <p class="codex-desc">${prop.desc}</p>
  `;
}

function renderCodexUnits() {
  for (const cls of Object.values(CLASSES)) {
    codexPickerEl.appendChild(createCodexPickBtn({
      active: cls.id === selectedClassId,
      title: cls.name,
      onClick: () => selectClass(cls.id),
      fillIcon: (btn) => setUnitIcon(btn, cls.id),
    }));
  }
  renderClassDetail(selectedClassId);
}

function renderCodexItems() {
  for (const item of Object.values(ITEMS)) {
    codexPickerEl.appendChild(createCodexPickBtn({
      active: item.id === selectedItemId,
      title: item.name,
      onClick: () => selectCodexItem(item.id),
      fillIcon: (btn) => setItemIcon(btn, item),
    }));
  }
  renderCodexItemDetail(selectedItemId);
}

function renderCodexMechanisms() {
  for (const kind of MAP_PROP_KINDS) {
    const prop = MAP_PROPS[kind];
    codexPickerEl.appendChild(createCodexPickBtn({
      active: kind === selectedMechanismId,
      title: prop.name,
      onClick: () => selectCodexMechanism(kind),
      fillIcon: (btn) => setMapPropIcon(btn, kind),
    }));
  }
  renderCodexMechanismDetail(selectedMechanismId);
}

function renderCodex() {
  if (!codexPickerEl || !codexDetailInfoEl) return;

  renderCodexTabs();
  codexPickerEl.innerHTML = '';

  if (activeCodexTab === 'units') {
    renderCodexUnits();
  } else if (activeCodexTab === 'items') {
    renderCodexItems();
  } else {
    renderCodexMechanisms();
  }

  updateCodexPreviewVisibility();
}

function selectCodexItem(itemId) {
  selectedItemId = itemId;
  render(getAppState());
}

function selectCodexMechanism(kind) {
  selectedMechanismId = kind;
  render(getAppState());
}

game.playAttackFx = (fx) => board3d.playAttackFx(fx);
onlineClient.playAttackFx = (fx) => board3d.playAttackFx(fx);
game.playBlessFx = (fx) => board3d.playBlessFx(fx);
onlineClient.playBlessFx = (fx) => board3d.playBlessFx(fx);
game.playMapPropFx = (fx) => board3d.playMapPropFx(fx);
game.playLandmineFx = (fx) => board3d.playLandmineFx(fx);
onlineClient.playMapPropFx = (fx) => board3d.playMapPropFx(fx);
onlineClient.playLandmineFx = (fx) => board3d.playLandmineFx(fx);

function switchNav(navId) {
  if (!NAV_SCREENS[navId]) return;
  const state = getAppState();
  if (isBottomNavLocked(state) && navId !== 'battle') return;
  const replay = activeNav === navId;
  activeNav = navId;

  for (const [id, screen] of Object.entries(NAV_SCREENS)) {
    screen.classList.toggle('active', id === navId);
  }

  for (const btn of bottomNavEl.querySelectorAll('.nav-item')) {
    btn.classList.toggle('active', btn.dataset.nav === navId);
  }

  navIconAnimator.onNavChange(navId, { replay });

  if (navId === 'formation') {
    game.syncFormationMode(state.boardMode);
  }

  if (BATTLE_PHASES.has(state.phase)) {
    board3d.setVisible(navId === 'battle');
    if (navId === 'battle') {
      board3d.sync(state);
    }
  }

  if (navId === 'codex') {
    updateCodexPreviewVisibility();
  } else {
    unitPreview.setVisible(false);
  }
}

function formatClassTrait(cls) {
  if (cls.type === 'castle') return '堡壘 · 友方踏入回收 · 攻破獲勝';
  if (cls.diagonalOnly) return '僅斜角移動與攻擊 · 無法上下左右';
  if (cls.poisonOnHit) return '上下左右近戰 · 命中使敵中毒';
  if (cls.possessionOnKill) return '上下左右近戰 · 擊殺附身敵人';
  if (cls.deathExplosion) return `上下左右近戰 · 亡語自爆 ${cls.deathExplosion} 傷（周圍八格）`;
  if (cls.shadowCloneOnMove) return '上下左右近戰 · 移動時原格留下影分身佔位一回合';
  if (cls.jumpMove) return cls.jumpRange ? `可跳躍至周遭 ${cls.jumpRange} 格` : '可跳躍至任意空格';
  if (cls.moveRange === Infinity) return '移動距離無限';
  if (cls.type === 'mage') return '上下左右光束穿透攻擊';
  if (cls.type === 'artillery') return '上下左右第二格 · 無法近戰';
  if (cls.type === 'ranged') return `上下左右射線 · 射程 ${cls.range}`;
  if (cls.type === 'tower') return `上下左右齊射 · 射程 ${cls.range}`;
  if (cls.passiveBlessing) return '上下左右祝福 · 恢復 1 生命';
  return '上下左右近戰';
}

function isClassOwnedInState(state, classId) {
  return state.ownedClasses?.includes(classId) ?? isClassOwned(classId);
}

function getProgressFromState(state, classId) {
  return state.classProgress?.[classId] ?? { level: 1, copies: 0, fragments: 0 };
}

function renderClassDetail(classId, state = getAppState()) {
  const cls = CLASSES[classId];
  if (!cls) return;

  const owned = isClassOwnedInState(state, classId);
  const progress = getProgressFromState(state, classId);
  const ownedLevel = owned ? progress.level : CLASS_LEVEL_MIN;

  if (codexPreviewLevelForClass !== classId) {
    codexPreviewLevel = ownedLevel;
    codexPreviewLevelForClass = classId;
  }

  const previewLevel = Math.max(CLASS_LEVEL_MIN, Math.min(CLASS_LEVEL_MAX, codexPreviewLevel));
  const stats = getClassCombatStats(classId, previewLevel);
  const siegeCastleHp = getCastleHpForMode('5x5') + getClassLevelBonuses('castle', previewLevel).hp;
  const hpDisplay = cls.id === 'castle'
    ? `${renderStatBadgeHtml('hp', stats.hp)} <span class="codex-stat-note">（攻城戰 ${renderStatBadgeHtml('hp', siegeCastleHp)}）</span>`
    : renderStatBadgeHtml('hp', stats.hp);
  const previewingHigher = owned && previewLevel > ownedLevel;
  const previewingUnowned = !owned;

  const previewHint = previewingHigher || previewingUnowned
    ? ' <span class="codex-level-hint">預覽</span>'
    : '';

  codexDetailInfoEl.innerHTML = `
    <div class="codex-detail-head">
      <h2 class="detail-name">${cls.name}${previewHint}</h2>
      <div class="codex-level-picker" role="group" aria-label="等級預覽"></div>
    </div>
    <div class="codex-stat-row" aria-label="能力數值">
      <div class="codex-stat-chip">
        <span class="codex-stat-label">等級</span>
        <span class="codex-stat-value">${renderStatBadgeHtml('level', previewLevel)}</span>
      </div>
      <div class="codex-stat-chip">
        <span class="codex-stat-label">HP</span>
        <span class="codex-stat-value">${hpDisplay || '—'}</span>
      </div>
      <div class="codex-stat-chip">
        <span class="codex-stat-label">ATK</span>
        <span class="codex-stat-value">${renderStatBadgeHtml('atk', stats.atk) || '—'}</span>
      </div>
    </div>
    <p class="codex-trait"><span class="codex-trait-label">特性</span>${formatClassTrait(cls)}</p>
  `;

  const picker = codexDetailInfoEl.querySelector('.codex-level-picker');
  for (let level = CLASS_LEVEL_MIN; level <= CLASS_LEVEL_MAX; level++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'codex-level-btn' + (level === previewLevel ? ' active' : '');
    if (owned && level === ownedLevel) btn.classList.add('owned');
    btn.innerHTML = renderStatBadgeHtml('level', level, { size: 12 });
    btn.addEventListener('click', () => {
      codexPreviewLevel = level;
      renderClassDetail(classId, getAppState());
    });
    picker.appendChild(btn);
  }

  if (activeNav === 'codex' && activeCodexTab === 'units') {
    unitPreview.setClass(classId);
  }
}

function selectClass(classId) {
  selectedClassId = classId;
  const state = getAppState();
  const owned = isClassOwnedInState(state, classId);
  const progress = getProgressFromState(state, classId);
  codexPreviewLevel = owned ? progress.level : CLASS_LEVEL_MIN;
  codexPreviewLevelForClass = classId;
  render(getAppState());
}

function createItemChip(item, { count, equipped, onSelect }) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'item-chip';
  if (equipped) chip.classList.add('item-equipped');

  const owned = count ?? 0;
  if (item.id !== null && owned <= 0) chip.disabled = true;
  chip.title = item.name ?? '';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-chip-icon';
  setItemIcon(iconWrap, item);

  chip.append(iconWrap);
  if (item.id !== null && owned > 0) {
    const badge = document.createElement('span');
    badge.className = 'item-chip-badge';
    badge.textContent = String(owned);
    chip.appendChild(badge);
  }
  chip.addEventListener('click', () => onSelect(item.id));
  return chip;
}

function createClassUnlockRow(cls, { owned, price, onBuy }) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-row-icon item-row-icon-unit item-row-icon-copy';
  setCopyCardIcon(iconWrap, cls.id);

  const body = document.createElement('div');
  body.className = 'item-row-body';
  body.innerHTML = `<span class="item-row-name">${cls.name}</span>`;

  row.append(iconWrap, body);

  const priceEl = document.createElement('span');
  priceEl.className = 'item-row-meta';
  setCurrencyMeta(priceEl, 'diamond', price);
  row.appendChild(priceEl);

  const canBuy = canAffordClass(cls.id);
  attachShopRowClick(row, {
    enabled: canBuy,
    currency: 'diamond',
    onActivate: onBuy ? (rowEl) => onBuy(cls.id, rowEl) : null,
  });

  return row;
}

function createFragmentRow(cls, { count, price, canBuy, onBuy }) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-row-icon item-row-icon-unit item-row-icon-fragment';
  setFragmentCardIcon(iconWrap, cls.id);

  const body = document.createElement('div');
  body.className = 'item-row-body';
  body.innerHTML = `<span class="item-row-name">${cls.name}碎片</span>`;

  row.append(iconWrap, body);

  const meta = document.createElement('span');
  meta.className = 'item-row-meta item-row-meta-owned';
  meta.textContent = `持有 ×${count}`;
  row.appendChild(meta);

  const priceEl = document.createElement('span');
  priceEl.className = 'item-row-meta';
  setCurrencyMeta(priceEl, 'coin', price);
  row.appendChild(priceEl);

  attachShopRowClick(row, {
    enabled: canBuy,
    currency: 'coin',
    onActivate: onBuy ? (rowEl) => onBuy(cls.id, rowEl) : null,
  });

  return row;
}

function createItemRow(item, { count, price, onBuy }) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const canBuy = price != null && canAfford(item.id);

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-row-icon item-row-icon-unit';
  setItemIcon(iconWrap, item);

  const body = document.createElement('div');
  body.className = 'item-row-body';
  body.innerHTML = `<span class="item-row-name">${item.name}</span>`;

  row.append(iconWrap, body);
  if (count != null) {
    const meta = document.createElement('span');
    meta.className = 'item-row-meta item-row-meta-owned';
    meta.textContent = `持有 ×${count}`;
    row.appendChild(meta);
  }
  if (price != null) {
    const meta = document.createElement('span');
    meta.className = 'item-row-meta';
    setCurrencyMeta(meta, 'coin', price);
    row.appendChild(meta);
  }

  attachShopRowClick(row, {
    enabled: canBuy,
    currency: 'coin',
    onActivate: onBuy ? (rowEl) => onBuy(item.id, rowEl) : null,
  });

  return row;
}

function createDailyQuestRow(quest, { isReady, isClaimed }) {
  const mode = BOARD_MODES[quest.modeId];
  const row = document.createElement('div');
  row.className = 'item-row';
  if (isClaimed) row.classList.add('item-row--muted');
  if (isReady) row.classList.add('item-row--ready');

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-row-icon item-row-icon-mode';
  if (mode) iconWrap.dataset.mode = mode.id;
  const modeIcon = createModeGridIcon(mode?.size ?? 3);
  modeIcon.classList.add('item-row-mode-icon');
  iconWrap.appendChild(modeIcon);

  const body = document.createElement('div');
  body.className = 'item-row-body';
  const statusText = isClaimed ? '今日已領取' : isReady ? '可領取獎勵' : '完成一場對戰';
  body.innerHTML = `
    <span class="item-row-name">${quest.label}</span>
    <span class="item-row-desc">${statusText}</span>
  `;

  row.append(iconWrap, body);

  const rewardMeta = document.createElement('span');
  rewardMeta.className = 'item-row-meta';
  setCurrencyMeta(rewardMeta, 'diamond', quest.reward);
  row.appendChild(rewardMeta);

  if (isClaimed) {
    const doneMeta = document.createElement('span');
    doneMeta.className = 'item-row-meta item-row-meta-owned';
    doneMeta.textContent = '✓';
    row.appendChild(doneMeta);
  } else if (isReady) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary item-row-btn';
    btn.textContent = '領取';
    btn.addEventListener('click', () => handleClaimDailyQuest(quest.modeId, btn));
    row.appendChild(btn);
  }

  return row;
}

function renderCurrencyBalances(state) {
  if (coinBalanceAmountEl) coinBalanceAmountEl.textContent = String(state.coins ?? 0);
  if (diamondBalanceAmountEl) diamondBalanceAmountEl.textContent = String(state.diamonds ?? 0);
}

function clearPurchaseNotifyTimer() {
  if (purchaseNotifyTimer) {
    clearTimeout(purchaseNotifyTimer);
    purchaseNotifyTimer = null;
  }
}

function playCurrencyInsufficientAnimation(currency) {
  const badgeEl = currency === 'diamond' ? diamondBalanceEl : coinBalanceEl;
  const insufficientClass = currency === 'diamond' ? 'diamond-insufficient' : 'coin-insufficient';
  if (!badgeEl) return;

  badgeEl.classList.remove(insufficientClass);
  void badgeEl.offsetWidth;
  badgeEl.classList.add(insufficientClass);
  window.setTimeout(() => badgeEl.classList.remove(insufficientClass), 600);
}

function playCurrencySpendAnimation(currency, price) {
  const badgeEl = currency === 'diamond' ? diamondBalanceEl : coinBalanceEl;
  const spentClass = currency === 'diamond' ? 'diamond-spent' : 'coin-spent';
  const floatClass = currency === 'diamond' ? 'diamond-spend-float' : 'coin-spend-float';
  if (!badgeEl) return;

  badgeEl.classList.remove(spentClass);
  void badgeEl.offsetWidth;
  badgeEl.classList.add(spentClass);
  window.setTimeout(() => badgeEl.classList.remove(spentClass), 600);

  if (!price) return;
  const floater = document.createElement('span');
  floater.className = floatClass;
  floater.textContent = `-${price}`;
  badgeEl.appendChild(floater);
  window.setTimeout(() => floater.remove(), 750);
}

function playCoinSpendAnimation(price) {
  playCurrencySpendAnimation('coin', price);
}

function playDiamondSpendAnimation(price) {
  playCurrencySpendAnimation('diamond', price);
}

function playDiamondEarnAnimation(amount) {
  if (!diamondBalanceEl || !amount) return;

  diamondBalanceEl.classList.remove('diamond-earned');
  void diamondBalanceEl.offsetWidth;
  diamondBalanceEl.classList.add('diamond-earned');
  window.setTimeout(() => diamondBalanceEl.classList.remove('diamond-earned'), 600);

  const floater = document.createElement('span');
  floater.className = 'diamond-earn-float';
  floater.textContent = `+${amount}`;
  diamondBalanceEl.appendChild(floater);
  window.setTimeout(() => floater.remove(), 750);
}

function showPurchaseToast(message, { success = true, html = false } = {}) {
  const variant = success ? 'ui-card--success' : 'ui-card--error';
  purchaseToastController = showTimedOverlay(purchaseToastEl, {
    showMs: PURCHASE_TOAST_SHOW_MS,
    fadeMs: PURCHASE_TOAST_FADE_MS,
    variantClasses: [variant],
    setup: () => {
      if (html) purchaseToastTextEl.innerHTML = message;
      else purchaseToastTextEl.textContent = message;
    },
  });
}

function handlePurchaseSuccess({ name, price, rowEl, kind = 'item', currency = 'coin', unlocked = false }) {
  rowEl?.classList.add('purchase-success');
  playCurrencySpendAnimation(currency, price);
  let prefix = '已購買';
  if (kind === 'class') prefix = unlocked ? '已解鎖' : '已購買複本';
  else if (kind === 'fragment') prefix = '已購買';
  else if (kind === 'synth') prefix = unlocked ? '已合成解鎖' : '已合成複本';
  showPurchaseToast(`${prefix} ${name}`);
  renderCurrencyBalances(getAppState());
  clearPurchaseNotifyTimer();
  purchaseNotifyTimer = window.setTimeout(() => {
    purchaseNotifyTimer = null;
    game.notify();
  }, PURCHASE_FEEDBACK_MS);
}

function handlePurchaseFailure(reason, rowEl, currency = 'coin') {
  if (reason === '金幣不足' || reason === '鑽石不足') {
    playCurrencyInsufficientAnimation(currency);
    return;
  }
  rowEl?.classList.remove('purchase-fail');
  void rowEl?.offsetWidth;
  rowEl?.classList.add('purchase-fail');
  window.setTimeout(() => rowEl?.classList.remove('purchase-fail'), 450);
  showPurchaseToast(reason, { success: false });
}

function attachShopRowClick(row, { enabled, currency, onActivate }) {
  if (!onActivate) return;

  row.classList.add('item-row--interactive');
  if (!enabled) row.classList.add('item-row--disabled');

  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  const activate = () => {
    if (enabled) onActivate(row);
    else playCurrencyInsufficientAnimation(currency);
  };
  row.addEventListener('click', activate);
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
}

function renderFormationItems(state) {
  const hideItems = isSurvivalMode(state.boardMode);
  formationItemSectionEl?.classList.toggle('hidden', hideItems);
  if (hideItems) return;

  formationItemsEl.innerHTML = '';

  for (const item of Object.values(ITEMS)) {
    formationItemsEl.appendChild(createItemChip(item, {
      count: state.inventory[item.id] ?? 0,
      equipped: state.equippedItem === item.id,
      onSelect: (id) => game.selectEquippedItem(id),
    }));
  }
}

function renderShop(state) {
  shopGridEl.innerHTML = '';

  const classTitle = document.createElement('div');
  classTitle.className = 'section-title section-title-compact';
  classTitle.textContent = '角色';
  shopGridEl.appendChild(classTitle);

  for (const classId of CLASS_IDS) {
    const cls = CLASSES[classId];
    const owned = isClassOwnedInState(state, classId);
    const price = getClassDiamondPrice(classId);
    shopGridEl.appendChild(createClassUnlockRow(cls, {
      owned,
      price,
      onBuy: async (id, rowEl) => {
        const message = owned
          ? `確定花費 ${price} 鑽石購買「${cls.name}」複本？`
          : `確定花費 ${price} 鑽石解鎖「${cls.name}」？`;
        if (!(await showConfirm(message))) return;

        const result = buyClass(id);
        if (result.ok) {
          handlePurchaseSuccess({
            name: cls.name,
            price,
            rowEl,
            kind: 'class',
            currency: 'diamond',
            unlocked: result.unlocked,
          });
          return;
        }
        handlePurchaseFailure(result.reason, rowEl, 'diamond');
      },
    }));
  }

  const fragTitle = document.createElement('div');
  fragTitle.className = 'section-title section-title-compact';
  fragTitle.textContent = '角色碎片';
  shopGridEl.appendChild(fragTitle);

  for (const classId of CLASS_IDS) {
    const cls = CLASSES[classId];
    const progress = getProgressFromState(state, classId);
    shopGridEl.appendChild(createFragmentRow(cls, {
      count: progress.fragments,
      price: FRAGMENT_PRICE,
      canBuy: (state.coins ?? 0) >= FRAGMENT_PRICE,
      onBuy: async (id, rowEl) => {
        if (!(await showConfirm(`確定花費 ${FRAGMENT_PRICE} 金幣購買「${cls.name}碎片」？`))) return;

        const result = buyFragment(id);
        if (result.ok) {
          handlePurchaseSuccess({
            name: `${cls.name}碎片`,
            price: FRAGMENT_PRICE,
            rowEl,
            kind: 'fragment',
          });
          return;
        }
        handlePurchaseFailure(result.reason, rowEl, 'coin');
      },
    }));
  }

  const itemTitle = document.createElement('div');
  itemTitle.className = 'section-title section-title-compact';
  itemTitle.textContent = '消耗品';
  shopGridEl.appendChild(itemTitle);

  for (const item of Object.values(ITEMS)) {
    shopGridEl.appendChild(createItemRow(item, {
      count: state.inventory[item.id] ?? 0,
      price: SHOP_PRICES[item.id],
      onBuy: async (id, rowEl) => {
        const price = SHOP_PRICES[id];
        if (!(await showConfirm(`確定花費 ${price} 金幣購買「${item.name}」？`))) return;

        const result = buyItem(id);
        if (result.ok) {
          handlePurchaseSuccess({
            name: item.name,
            price,
            rowEl,
          });
          return;
        }
        handlePurchaseFailure(result.reason, rowEl, 'coin');
      },
    }));
  }
}

function renderBattleItem(state) {
  const inStock = state.equippedItem && (state.inventory[state.equippedItem] ?? 0) > 0;
  const show = state.phase === 'battle' && inStock && state.itemDef && !state.tutorial && !state.isSurvivalMode;
  itemBattleBtnEl.classList.toggle('hidden', !show);
  if (!show) return;

  itemBattleIconEl.className = 'item-battle-icon item-battle-icon-thumb';
  setItemIcon(itemBattleIconEl, state.itemDef);

  const targeting = Boolean(state.itemTargeting);
  const used = Boolean(state.itemUsed);
  itemBattleBtnEl.classList.toggle('item-battle-targeting', targeting);
  itemBattleBtnEl.classList.toggle('item-battle-used', used);

  itemBattleBtnEl.disabled = used || state.animating || (!targeting && !state.canUseItem);
  itemBattleBtnEl.title = state.itemDef.name;
}

function renderFormation(state) {
  const limit = state.rosterLimit;
  const picked = state.blueRoster;
  const autoCastle = modeHasAutoCastle(state.boardMode);

  const deployablePicked = autoCastle ? picked.filter((id) => id !== 'castle') : picked;

  formationCountEl.textContent = autoCastle
    ? `${deployablePicked.length} / ${limit} 人 · 固定城堡`
    : `${picked.length} / ${limit} 人`;

  formationLineupEl.classList.toggle('full', deployablePicked.length === limit);
  formationLineupEl.innerHTML = '';

  if (autoCastle) {
    const castleChip = document.createElement('div');
    castleChip.className = 'roster-chip roster-chip-locked';
    castleChip.title = `城堡（固定 · HP ${getCastleHpForMode('5x5')}）`;
    setUnitIcon(castleChip, 'castle');
    formationLineupEl.appendChild(castleChip);
  }

  if (picked.length > 0) {
    const lineup = deployablePicked;
    lineup.forEach((classId) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'roster-chip';
      chip.title = `移除 ${CLASSES[classId].name}`;
      setUnitIcon(chip, classId);
      chip.addEventListener('click', () => {
        const rosterIndex = picked.indexOf(classId);
        if (rosterIndex >= 0) game.removeFromFormation(rosterIndex);
      });
      formationLineupEl.appendChild(chip);
    });
  }

  formationPoolEl.innerHTML = '';
  for (const cls of Object.values(CLASSES)) {
    const isFixedCastle = autoCastle && cls.id === 'castle';
    if (!isClassOwnedInState(state, cls.id) && !isFixedCastle) continue;

    const selected = picked.includes(cls.id);
    const soldOut = !isFixedCastle && !selected && picked.length >= limit;
    const progress = getProgressFromState(state, cls.id);
    const stats = getClassCombatStats(cls.id, progress.level);
    const hpDisplay = cls.id === 'castle' && autoCastle
      ? getCastleHpForMode(state.boardMode) + getClassLevelBonuses('castle', progress.level).hp
      : stats.hp;
    const upgradeCost = getUpgradeCopyCost(progress.level);
    const canSynth = progress.fragments >= FRAGMENTS_PER_COPY;
    const canUpgrade = upgradeCost != null && progress.copies >= upgradeCost;

    const card = document.createElement('div');
    card.className = 'class-card' + (selected ? ' selected' : '') + (soldOut || isFixedCastle ? ' class-card-locked' : '');

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'class-card-select';
    selectBtn.disabled = soldOut || isFixedCastle;
    if (isFixedCastle) selectBtn.title = '攻城戰固定城堡';
    const iconWrap = document.createElement('span');
    iconWrap.className = 'class-icon';
    setUnitIcon(iconWrap, cls.id);
    selectBtn.append(iconWrap);
    selectBtn.insertAdjacentHTML('beforeend', `
      <span class="class-name">${cls.name} · ${renderStatBadgeHtml('level', progress.level)}</span>
      <span class="class-meta">${renderStatBadgeHtml('hp', hpDisplay)} · ${renderStatBadgeHtml('atk', stats.atk)}</span>
    `);
    if (!isFixedCastle) {
      selectBtn.addEventListener('click', () => game.addToFormation(cls.id));
    }

    const actions = document.createElement('div');
    actions.className = 'class-card-actions';

    const synthBtn = document.createElement('button');
    synthBtn.type = 'button';
    synthBtn.className = 'btn class-card-action';
    synthBtn.textContent = `合成 ${progress.fragments}/${FRAGMENTS_PER_COPY}`;
    synthBtn.disabled = !canSynth;
    if (!canSynth) synthBtn.title = `需 ${FRAGMENTS_PER_COPY} 碎片`;
    synthBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const result = synthesizeCopy(cls.id);
      if (!result.ok) {
        handlePurchaseFailure(result.reason, synthBtn);
        return;
      }
      showPurchaseToast(result.unlocked ? `已合成解鎖 ${cls.name}` : `已合成 ${cls.name}複本`);
      game.notify();
    });

    const upgradeBtn = document.createElement('button');
    upgradeBtn.type = 'button';
    upgradeBtn.className = 'btn class-card-action';
    upgradeBtn.textContent = upgradeCost == null ? 'MAX' : `升級 ${progress.copies}/${upgradeCost}`;
    upgradeBtn.disabled = !canUpgrade;
    if (upgradeCost == null) upgradeBtn.title = '已達最大等級';
    else if (!canUpgrade) upgradeBtn.title = `需 ${upgradeCost} 複本`;
    upgradeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const result = upgradeClass(cls.id);
      if (!result.ok) {
        handlePurchaseFailure(result.reason, upgradeBtn);
        return;
      }
      showPurchaseToast(`${cls.name} ${getClassLevelLabel(result.level)}`);
      game.notify();
    });

    actions.append(synthBtn, upgradeBtn);
    card.append(selectBtn, actions);
    formationPoolEl.appendChild(card);
  }
}

function tutorialAllowsReserve(state, unit) {
  const allowed = state.tutorialSelectableClassIds;
  return !allowed || allowed.includes(unit.classId);
}

function createReserveCard(unit, { side, state }) {
  const cls = CLASSES[unit.classId];
  const pct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  const selected = state.selectedReserveId === unit.id;
  const inspected = state.inspectedUnitId === unit.id;
  const itemTargeting = Boolean(state.itemTargeting);
  const itemReserveTarget = side === 'blue'
    && state.itemTargeting === 'potion'
    && (state.validItemReserveTargets ?? []).includes(unit.id);
  const potionTargeting = side === 'blue' && state.itemTargeting === 'potion';
  const deploySelectable = side === 'blue'
    && state.isHumanTurn
    && tutorialAllowsReserve(state, unit)
    && !itemTargeting;
  const selectable = deploySelectable || potionTargeting;

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'reserve-card';
  card.dataset.unitId = unit.id;
  if (side === 'enemy') card.classList.add('reserve-card-enemy');
  card.classList.toggle('selected', selected);
  card.classList.toggle('inspected', inspected);
  card.classList.toggle('item-target', itemReserveTarget);
  card.classList.toggle('disabled', side === 'blue' && !selectable && !itemReserveTarget);
  card.classList.toggle(
    'tutorial-focus',
    side === 'blue' && deploySelectable && !selected && state.tutorialSelectableClassIds != null,
  );
  if (side === 'blue' && !selectable && !itemReserveTarget) card.disabled = true;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'reserve-card-icon';
  setUnitIcon(iconWrap, unit.classId);

  const nameEl = document.createElement('span');
  nameEl.className = 'reserve-card-name';
  nameEl.textContent = cls.name;

  const hpBar = document.createElement('div');
  hpBar.className = 'reserve-card-hp-bar';
  const hpFill = document.createElement('div');
  hpFill.className = 'reserve-card-hp-fill';
  hpFill.style.width = `${pct}%`;
  hpBar.appendChild(hpFill);

  const vitals = document.createElement('div');
  vitals.className = 'reserve-card-vitals';

  vitals.append(
    createStatBadge('level', unit.level ?? CLASS_LEVEL_MIN),
    createStatBadge('hp', unit.hp),
    createStatBadge('atk', unit.atk),
  );
  card.append(iconWrap, nameEl, hpBar, vitals);

  if (side === 'enemy') {
    card.addEventListener('click', () => {
      withOnlineOrLocal(
        () => onlineClient.inspectUnit(unit.id),
        () => game.inspectUnit(unit.id),
      );
    });
  } else {
    card.addEventListener('click', () => {
      withOnlineOrLocal(
        () => onlineClient.selectReserve(unit.id),
        () => {
          if (game.itemTargeting) {
            game.selectReserve(unit.id);
            return;
          }
          if (!game.canHumanAct()) return;
          const allowed = game.getTutorialSelectableClassIds();
          if (allowed && !allowed.includes(unit.classId)) {
            game.rejectTutorialAction();
            return;
          }
          game.selectReserve(unit.id);
        },
      );
    });
  }

  return card;
}

function syncReserveTutorialPointer(state) {
  const target = state.tutorialPointer;
  const show = Boolean(target?.kind === 'reserve') && state.phase === 'battle';
  reserveTutorialPointerEl.classList.toggle('hidden', !show);
  if (!show) return;

  const card = ownReserveCardsEl.querySelector(`[data-unit-id="${CSS.escape(target.unitId)}"]`);
  if (!card) {
    reserveTutorialPointerEl.classList.add('hidden');
    return;
  }

  const barRect = ownReserveBarEl.getBoundingClientRect();
  const icon = card.querySelector('.reserve-card-icon');
  const targetRect = (icon ?? card).getBoundingClientRect();
  reserveTutorialPointerEl.style.left = `${targetRect.left + targetRect.width / 2 - barRect.left}px`;
  reserveTutorialPointerEl.style.top = `${targetRect.top + targetRect.height / 2 - barRect.top}px`;
}

function scheduleReserveTutorialPointer(state) {
  requestAnimationFrame(() => {
    syncReserveTutorialPointer(state);
    requestAnimationFrame(() => syncReserveTutorialPointer(state));
  });
}

function renderReserveBars(state) {
  const inBattle = state.phase === 'battle';
  const showEnemy = inBattle && state.redReserve.length > 0;
  const showOwn = inBattle && state.blueReserve.length > 0;

  enemyReserveBarEl.classList.toggle('hidden', !showEnemy);
  ownReserveBarEl.classList.toggle('hidden', !showOwn);
  if (!inBattle) return;

  enemyReserveCardsEl.replaceChildren();
  for (const unit of state.redReserve) {
    enemyReserveCardsEl.appendChild(createReserveCard(unit, { side: 'enemy', state }));
  }

  ownReserveCardsEl.replaceChildren();
  for (const unit of state.blueReserve) {
    ownReserveCardsEl.appendChild(createReserveCard(unit, { side: 'blue', state }));
  }

  scheduleReserveTutorialPointer(state);
}

function refreshOnlineTimerRemaining() {
  onlineClient.refreshTimerRemaining();
}

function syncOnlineTimers(state) {
  if (!state.onlineMode || !state.timers || state.phase !== 'battle') {
    if (onlineTimerInterval) {
      clearInterval(onlineTimerInterval);
      onlineTimerInterval = null;
    }
    turnTimerEl.classList.add('hidden');
    matchTimerEl.classList.add('hidden');
    return;
  }

  refreshOnlineTimerRemaining();

  const update = () => {
    const t = state.timers;
    if (!t) return;

    const paused = Boolean(t.timersPaused);
    const turnMaxMs = Math.max(state.turnDurationMs || 0, t.turnRemainingMs);
    const turnPct = timerFillPct(t.turnRemainingMs, turnMaxMs);
    turnTimerEl.classList.remove('hidden');
    turnTimerEl.setAttribute('aria-hidden', 'false');
    turnTimerEl.classList.toggle('turn-timer-low', turnPct <= 0.25 && turnPct > 0);
    if (paused) freezeTimerFill(turnTimerFillEl, turnPct);
    else drainTimerFill(turnTimerFillEl, t.turnRemainingMs, turnMaxMs);

    const matchPct = timerFillPct(t.matchRemainingMs, state.matchDurationMs);
    matchTimerTextEl.textContent = formatClock(t.matchRemainingMs);
    matchTimerEl.classList.remove('hidden');
    matchTimerEl.setAttribute('aria-hidden', 'false');
    matchTimerEl.classList.toggle('match-timer-low', matchPct <= 0.1 && matchPct > 0);
    if (paused) freezeTimerFill(matchTimerFillEl, matchPct);
    else drainTimerFill(matchTimerFillEl, t.matchRemainingMs, state.matchDurationMs);
  };

  update();
  if (!onlineTimerInterval) {
    onlineTimerInterval = setInterval(() => {
      if (onlineClient.timers && !onlineClient.timers.timersPaused) {
        refreshOnlineTimerRemaining();
      }
      render(getAppState());
    }, 250);
  }
}

function createModeGridIcon(size) {
  const wrap = document.createElement('span');
  wrap.className = 'mode-btn-icon';
  wrap.setAttribute('aria-hidden', 'true');

  const grid = document.createElement('span');
  grid.className = 'mode-grid';
  grid.style.setProperty('--grid-size', String(size));

  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement('span');
    cell.className = 'mode-grid-cell';
    grid.appendChild(cell);
  }

  wrap.appendChild(grid);
  return wrap;
}

function createModeButton(mode, isActive, canPick, onSelect) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn mode-btn' + (isActive ? ' active' : '');
  btn.dataset.mode = mode.id;
  btn.setAttribute('aria-label', mode.label);
  btn.appendChild(createModeGridIcon(mode.size));
  const label = document.createElement('span');
  label.className = 'mode-btn-label';
  label.textContent = mode.label;
  btn.appendChild(label);
  btn.disabled = !canPick;
  btn.addEventListener('click', onSelect);
  return btn;
}

function renderFormationModePicker(state) {
  formationModeButtonsEl.innerHTML = '';
  const canPick = activeNav === 'formation' && game.canEditRoster();

  for (const mode of Object.values(BOARD_MODES)) {
    formationModeButtonsEl.appendChild(createModeButton(
      mode,
      state.boardMode === mode.id,
      canPick,
      () => {
        selectedOnlineMode = mode.id;
        game.syncFormationMode(mode.id);
        render(getAppState());
      },
    ));
  }

  renderFormationActions(state);
}

function renderFormationActions(state) {
  if (!startSurvivalBtnEl) return;
  const showSurvival = state.boardMode === '6x6' && state.phase === 'formation';
  startSurvivalBtnEl.classList.toggle('hidden', !showSurvival);
  startSurvivalBtnEl.disabled = !game.canEditRoster();
}

function renderSurvivalRound(state) {
  if (!survivalRoundEl) return;
  const show = state.phase === 'battle' && state.isSurvivalMode;
  survivalRoundEl.classList.toggle('hidden', !show);
  if (show) {
    survivalRoundEl.textContent = `第 ${state.survivalRound} 回合`;
  }
}

function renderModePicker(state) {
  modeButtonsEl.innerHTML = '';
  const canPick = state.phase === 'onlineLobby' || state.phase === 'lobby';

  for (const mode of Object.values(BOARD_MODES)) {
    modeButtonsEl.appendChild(createModeButton(
      mode,
      selectedOnlineMode === mode.id,
      canPick,
      () => {
        selectedOnlineMode = mode.id;
        game.syncFormationMode(mode.id);
        render(getAppState());
      },
    ));
  }
}

function renderSurvivalLobbyActions(state) {
  const inLobby = state.phase === 'onlineLobby' || state.phase === 'lobby';
  const survivalSelected = selectedOnlineMode === '6x6';
  const show = inLobby && survivalSelected;

  survivalLobbyActionsEl?.classList.toggle('hidden', !show);
  if (!show || !startSurvivalLobbyBtnEl) return;

  startSurvivalLobbyBtnEl.disabled = false;
  startSurvivalLobbyBtnEl.textContent = '開始生存戰';
}

function renderOnlineLobby(state) {
  const inLobby = state.phase === 'onlineLobby';
  const waiting = state.phase === 'onlineWaiting';
  const survivalSelected = selectedOnlineMode === '6x6';

  onlineLobbyActionsEl.classList.toggle('hidden', !inLobby || survivalSelected);
  renderSurvivalLobbyActions(state);
  onlineWaitingEl.classList.toggle('hidden', !waiting);

  if (waiting) {
    const matching = Boolean(state.matchmaking);
    waitingRoomCodeLineEl.classList.toggle('hidden', matching);
    onlineMatchIndicatorEl.classList.remove('hidden');
    if (onlineMatchLabelTextEl) {
      onlineMatchLabelTextEl.textContent = matching ? '匹配中' : '等待中';
    }

    if (!matching) {
      waitingRoomCodeEl.textContent = state.roomCode ?? '';
    }
  }
}

function renderLobbyFooter(state) {
  const inLobby = state.phase === 'onlineLobby' || state.phase === 'lobby';
  startTutorialBtn.classList.toggle('hidden', !(inLobby && !isTutorialDone()));
}

function renderDailyQuests(state) {
  if (!dailyQuestListEl || activeNav !== 'quests') return;

  const ready = new Set(state.dailyQuests?.ready ?? []);
  const claimed = new Set(state.dailyQuests?.claimed ?? []);
  dailyQuestListEl.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'section-title section-title-compact';
  title.textContent = '每日任務';
  dailyQuestListEl.appendChild(title);

  for (const quest of getDailyQuestDefinitions()) {
    dailyQuestListEl.appendChild(createDailyQuestRow(quest, {
      isReady: ready.has(quest.modeId),
      isClaimed: claimed.has(quest.modeId),
    }));
  }
}

function handleClaimDailyQuest(modeId, btn) {
  const result = claimDailyQuest(modeId);
  if (!result.ok) {
    handlePurchaseFailure(result.reason, btn);
    return;
  }

  const quest = getDailyQuestDefinitions().find((q) => q.modeId === modeId);
  playDiamondEarnAnimation(result.awarded);
  showPurchaseToast(`已領取 ${quest?.label ?? '任務'} ${renderCurrencyMetaHtml('diamond', result.awarded, { prefix: '+' })}`, { html: true });
  render(getAppState());
}

function renderTutorialPanel(state) {
  const tutorial = state.tutorial;
  const show = Boolean(tutorial) && state.phase === 'battle';
  tutorialPanelEl.classList.toggle('hidden', !show);
  if (!show) return;

  tutorialStepEl.textContent = `${tutorial.stepNumber} / ${tutorial.totalSteps}`;
  tutorialTitleEl.textContent = tutorial.waitingForEnemy ? '…' : tutorial.title;
  tutorialPanelEl.classList.toggle('waiting', tutorial.waitingForEnemy);
}

function renderBattlePanels(state) {
  renderBattleActionMenu(state);
}

function ensureReactionButtons() {
  if (reactionButtonsReady || !battleActionEmojisEl) return;
  reactionButtonsReady = true;
  battleActionEmojisEl.innerHTML = '';
  for (const reaction of REACTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'battle-action-emoji';
    btn.dataset.reactionId = reaction.id;
    btn.title = reaction.label;
    btn.setAttribute('aria-label', reaction.label);
    const icon = document.createElement('span');
    icon.className = 'battle-action-emoji-icon';
    fillReactionIcon(icon, reaction.id, 42);
    btn.appendChild(icon);
    btn.addEventListener('click', () => sendBattleReaction(reaction.id));
    battleActionEmojisEl.appendChild(btn);
  }
}

function setBattleMenuOpen(open) {
  battleMenuOpen = open;
  battleActionSheetEl.classList.toggle('hidden', !open);
  battleActionSheetEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  battleActionFabEl.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeBattleMenu() {
  if (!battleMenuOpen) return;
  setBattleMenuOpen(false);
}

function canSendBattleReaction(state) {
  return state.phase === 'battle' && !state.tutorial && !state.animating;
}

function sendBattleReaction(reactionId) {
  const state = getAppState();
  if (!canSendBattleReaction(state)) return;

  const now = Date.now();
  if (now < lastReactionCooldownUntil) return;

  const sent = isOnlinePlaying()
    ? onlineClient.sendReaction(reactionId)
    : game.sendReaction(reactionId);

  if (!sent) return;

  lastReactionCooldownUntil = now + REACTION_COOLDOWN_MS;
  updateReactionButtonCooldown();
  closeBattleMenu();
}

function updateReactionButtonCooldown() {
  if (!battleActionEmojisEl) return;
  const remaining = Math.max(0, lastReactionCooldownUntil - Date.now());
  const disabled = remaining > 0;
  for (const btn of battleActionEmojisEl.querySelectorAll('.battle-action-emoji')) {
    btn.disabled = disabled;
  }
  if (disabled) {
    setTimeout(updateReactionButtonCooldown, remaining + 30);
  }
}

function renderBattleActionMenu(state) {
  ensureReactionButtons();

  const inBattle = state.phase === 'battle';
  const inTutorial = Boolean(state.tutorial);
  const showMenu = inBattle && !inTutorial;

  battleActionMenuEl.classList.toggle('hidden', !showMenu);
  if (!showMenu) {
    closeBattleMenu();
    return;
  }

  battleActionFabEl.disabled = state.animating;
  surrenderBtn.classList.toggle('hidden', !showMenu);
  surrenderBtn.disabled = !inBattle || state.animating;

  updateReactionButtonCooldown();
}

function clearReactionOnEngine(kind) {
  const engine = isOnlinePlaying() ? onlineClient : game;
  if (kind === 'incoming') engine.clearIncomingReaction();
  else engine.clearOutgoingReaction();
}

function createReactionBubble(rootEl, iconEl, kind) {
  let lastShownAt = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let dismissTimer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let hideTimer = null;

  function dismiss() {
    if (!rootEl || rootEl.classList.contains('hidden')) return;
    rootEl.classList.remove('is-visible');
    rootEl.classList.add('is-dismissing');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      rootEl.classList.add('hidden');
      rootEl.classList.remove('is-dismissing');
      rootEl.setAttribute('aria-hidden', 'true');
      clearReactionOnEngine(kind);
    }, 350);
  }

  function show(reaction) {
    if (!rootEl || !iconEl || !reaction?.id) return;
    if (reaction.at <= lastShownAt) return;
    lastShownAt = reaction.at;

    if (dismissTimer) clearTimeout(dismissTimer);
    if (hideTimer) clearTimeout(hideTimer);

    fillReactionIcon(iconEl, reaction.id, 104);
    rootEl.classList.remove('hidden', 'is-dismissing');
    rootEl.classList.add('is-visible');
    rootEl.setAttribute('aria-hidden', 'false');

    dismissTimer = setTimeout(dismiss, REACTION_DISPLAY_MS);
  }

  return { show };
}

function ensureReactionBubbles() {
  if (!opponentReactionBubble && reactionBubbleEl && reactionBubbleIconEl) {
    opponentReactionBubble = createReactionBubble(reactionBubbleEl, reactionBubbleIconEl, 'incoming');
  }
  if (!ownReactionBubble && reactionBubbleOwnEl && reactionBubbleOwnIconEl) {
    ownReactionBubble = createReactionBubble(reactionBubbleOwnEl, reactionBubbleOwnIconEl, 'outgoing');
  }
}

function renderReactions(state) {
  ensureReactionBubbles();
  if (state.incomingReaction) opponentReactionBubble?.show(state.incomingReaction);
  if (state.outgoingReaction) ownReactionBubble?.show(state.outgoingReaction);
}

function updateBottomNav(state) {
  const lockNav = isBottomNavLocked(state);
  bottomNavEl.classList.toggle('hidden', lockNav);
  bottomNavEl.setAttribute('aria-hidden', lockNav ? 'true' : 'false');
  for (const btn of bottomNavEl.querySelectorAll('.nav-item')) {
    const isBattle = btn.dataset.nav === 'battle';
    btn.disabled = lockNav && !isBattle;
  }
  if (lockNav) navIconAnimator.deactivate();
}

function render(state) {
  boardWrapEl.classList.toggle('blue-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  boardWrapEl.classList.toggle('red-turn', state.phase === 'battle' && state.currentPlayer === 'red');

  const inFormation = state.phase === 'formation';
  const inBattle = state.phase === 'battle';
  const inBattleFlow = BATTLE_PHASES.has(state.phase);
  const inOnlineLobby = state.phase === 'onlineLobby' || state.phase === 'onlineWaiting';

  if (isBottomNavLocked(state) && activeNav !== 'battle') {
    switchNav('battle');
  } else if (state.phase !== lastPhase && inBattleFlow) {
    switchNav('battle');
  }
  if (state.phase !== lastPhase && inFormation) {
    switchNav('formation');
  }

  const inCombat = (inBattle || state.phase === 'gameEnd') && activeNav === 'battle';

  appEl.classList.toggle('in-combat', inCombat);
  appEl.classList.toggle('game-end', state.phase === 'gameEnd');
  battleContentEl.classList.toggle('in-combat', inCombat);
  battleContentEl.classList.toggle('has-tutorial', inCombat && Boolean(state.tutorial));
  battleContentEl.classList.toggle('game-end', state.phase === 'gameEnd');
  lobbyContentEl.classList.toggle('hidden', !inOnlineLobby && state.phase !== 'lobby');
  battleContentEl.classList.toggle('hidden', !inBattleFlow);

  if (state.onlineMode && state.timers) {
    syncOnlineTimers(state);
  } else {
    syncMatchTimer(state);
    syncTurnTimer(state);
  }
  if (state.phase !== lastPhase && state.phase === 'battle' && !state.tutorial) {
    showWinConditionToast(state.winCount, state.boardMode);
  } else if (state.phase !== 'battle' && state.phase !== 'gameEnd') {
    clearWinConditionToast();
  }
  lastPhase = state.phase;

  if (state.phase === 'gameEnd') {
    beginGameEndOverlay(state.message);
  } else if (gameEndOverlayStage !== 'off') {
    hideGameEndOverlay();
  }

  renderBattlePanels(state);
  renderTutorialPanel(state);
  renderLobbyFooter(state);
  renderOnlineLobby(state);
  renderCurrencyBalances(state);
  syncTurnToast(state);
  if (inFormation || (activeNav === 'formation' && game.canEditRoster())) {
    renderFormation(state);
    renderFormationItems(state);
    renderFormationActions(state);
  }
  if (activeNav === 'formation' && game.canEditRoster()) {
    renderFormationModePicker(state);
  }
  if (inBattleFlow) renderBattleItem(state);
  if (inBattleFlow) renderReactions(state);
  if (inBattleFlow) renderReserveBars(state);
  renderSurvivalRound(state);
  if (activeNav === 'quests') renderDailyQuests(state);
  if (activeNav === 'shop') renderShop(state);

  const showBoard = inBattleFlow && activeNav === 'battle';
  board3d.setVisible(showBoard);

  if (showBoard) {
    board3d.sync(state);
    scheduleReserveTutorialPointer(state);
    if (inCombat !== lastInCombat) {
      board3d.scheduleResize();
    }
  } else if (!inBattleFlow) {
    board3d.clear();
  }
  lastInCombat = inCombat;

  renderModePicker(state);
  if (activeNav === 'codex') renderCodex();
  updateBottomNav(state);
}

bottomNavEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn || btn.disabled) return;
  switchNav(btn.dataset.nav);
  render(getAppState());
});

codexTabsEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-codex-tab]');
  if (!btn) return;
  switchCodexTab(btn.dataset.codexTab);
  render(getAppState());
});

function getOnlineBoardMode() {
  return isLocalOnlyMode(selectedOnlineMode) ? '4x4' : selectedOnlineMode;
}

findMatchBtn.addEventListener('click', async () => {
  const boardMode = getOnlineBoardMode();
  const roster = ensureRosterForMatch(boardMode);
  if (!roster) {
    await alertNeedRosterThenOpenFormation();
    return;
  }
  findMatchBtn.disabled = true;
  try {
    await onlineClient.findMatch(boardMode, undefined, roster, getMatchClassLevels());
    render(getAppState());
  } catch (e) {
    await showAlert(e.message ?? '匹配失敗');
  } finally {
    findMatchBtn.disabled = false;
  }
});

createRoomBtn.addEventListener('click', async () => {
  const boardMode = getOnlineBoardMode();
  const roster = ensureRosterForMatch(boardMode);
  if (!roster) {
    await alertNeedRosterThenOpenFormation();
    return;
  }
  createRoomBtn.disabled = true;
  try {
    await onlineClient.createRoom(boardMode, undefined, roster, getMatchClassLevels());
    render(getAppState());
  } catch (e) {
    await showAlert(e.message ?? '建立房間失敗');
  } finally {
    createRoomBtn.disabled = false;
  }
});

joinRoomBtn.addEventListener('click', async () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    await showAlert('請輸入 6 位房間碼');
    return;
  }
  const boardMode = getOnlineBoardMode();
  const roster = ensureRosterForMatch(boardMode);
  if (!roster) {
    await alertNeedRosterThenOpenFormation();
    return;
  }
  joinRoomBtn.disabled = true;
  try {
    await onlineClient.joinRoom(code, undefined, roster, getMatchClassLevels());
  } catch (e) {
    await showAlert(e.message ?? '加入失敗');
  } finally {
    joinRoomBtn.disabled = false;
  }
});

cancelRoomBtn.addEventListener('click', () => {
  onlineClient.leaveOnline().then(() => render(getAppState()));
});

surrenderBtn.addEventListener('click', () => {
  closeBattleMenu();
  if (isOnlinePlaying()) onlineClient.surrender();
  else game.surrender();
});
battleActionFabEl.addEventListener('click', () => {
  setBattleMenuOpen(!battleMenuOpen);
});
itemBattleBtnEl.addEventListener('click', () => {
  closeBattleMenu();
  game.beginUseItem();
});
document.addEventListener('click', (event) => {
  if (!battleMenuOpen) return;
  const target = event.target;
  if (battleActionMenuEl.contains(target)) return;
  closeBattleMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;
  if (battleMenuOpen) {
    closeBattleMenu();
    return;
  }
  if (isOnlinePlaying() || !game.itemTargeting) return;
  game.cancelItemTargeting();
});
async function beginSurvivalBattle() {
  const modeId = '6x6';
  if (!ensureRosterForMatch(modeId)) {
    await alertNeedRosterThenOpenFormation();
    return;
  }
  hideGameEndOverlay();
  game.startSurvivalBattle();
  if (game.phase !== 'battle') return;
  switchNav('battle');
  render(getAppState());
}

startSurvivalBtnEl?.addEventListener('click', () => { beginSurvivalBattle(); });
startSurvivalLobbyBtnEl?.addEventListener('click', () => { beginSurvivalBattle(); });
startTutorialBtn.addEventListener('click', () => game.startTutorial());
tutorialSkipBtn.addEventListener('click', () => game.skipTutorial());

let appReady = false;

function renderWhenReady() {
  if (!appReady) return;
  render(getAppState());
}

game.subscribe(() => {
  if (isLocalMatchActive() || (!onlineClient.gameState && !onlineClient.roomState)) {
    renderWhenReady();
  }
});
initCloudSave()
  .then(() => {
    game.rostersByMode = getSavedRostersByMode();
    game.equippedItem = getSavedEquippedItem();
    game.blueRoster = game.sanitizeRosterForMode([...(game.rostersByMode[game.boardMode] ?? [])]);
    return onlineClient.tryReconnectOnLoad();
  })
  .then(() => {
    appReady = true;
    render(getAppState());
  })
  .catch(() => {
    appReady = true;
    render(getAppState());
  });
onlineClient.onAiFallback = (boardMode) => {
  game.startQuickAiBattle(boardMode);
};
onlineClient.subscribe(() => renderWhenReady());

window.addEventListener('resize', () => {
  scheduleReserveTutorialPointer(getAppState());
});
