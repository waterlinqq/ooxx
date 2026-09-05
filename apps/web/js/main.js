import { Game, CLASSES, BOARD_MODES, GAME_END_MODAL_MS, GAME_END_FADE_MS } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';
import { CharacterPreviewScene } from './board3d/CharacterPreviewScene.js';
import { generateUnitThumbnails, fillUnitIcon } from './board3d/UnitThumbnails.js';
import { generateNavThumbnails, applyNavIcons } from './board3d/NavThumbnails.js';
import { ITEMS, SHOP_PRICES, ITEM_IDS } from './items.js';
import { generateItemThumbnails, fillItemIcon } from './board3d/ItemThumbnails.js';
import { CLASS_IDS, getRosterLimit, getMaxPerClass } from './units.js';
import { isUnlockable } from './unlocks.js';
import {
  loadSave,
  buyItem,
  buyClass,
  canAfford,
  canAffordClass,
  isClassOwned,
  isTutorialDone,
  initCloudSave,
  getSaveSnapshot,
  getSavedRostersByMode,
} from './save.js';
import { onlineClient } from './online.js';

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
const formationFooterEl = document.getElementById('formationFooter');
const formationCountEl = document.getElementById('formationCount');
const formationLineupEl = document.getElementById('formationLineup');
const formationPoolEl = document.getElementById('formationPool');
const startBattleBtn = document.getElementById('startBattle');
const backToLobbyBtn = document.getElementById('backToLobby');
const turnTimerEl = document.getElementById('turnTimer');
const turnTimerFillEl = document.getElementById('turnTimerFill');
const matchTimerEl = document.getElementById('matchTimer');
const matchTimerFillEl = document.getElementById('matchTimerFill');
const matchTimerTextEl = document.getElementById('matchTimerText');
const classPickerEl = document.getElementById('classPicker');
const classDetailInfoEl = document.getElementById('classDetailInfo');
const classPreviewHostEl = document.getElementById('classPreviewHost');
const endPanelEl = document.getElementById('endPanel');
const endResultEl = document.getElementById('endResult');
const gameEndOverlayEl = document.getElementById('gameEndOverlay');
const modeButtonsEl = document.getElementById('onlineModeButtons');
const onlineLobbyActionsEl = document.getElementById('onlineLobbyActions');
const onlineWaitingEl = document.getElementById('onlineWaiting');
const waitingRoomCodeEl = document.getElementById('waitingRoomCode');
const waitingRoomCodeLineEl = document.getElementById('waitingRoomCodeLine');
const onlineMatchIndicatorEl = document.getElementById('onlineMatchIndicator');
const findMatchBtn = document.getElementById('findMatchBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const cancelRoomBtn = document.getElementById('cancelRoomBtn');
const confirmRosterBtn = document.getElementById('confirmRoster');
const restartBtn = document.getElementById('restart');
const surrenderBtn = document.getElementById('surrender');
const bottomNavEl = document.getElementById('bottomNav');
const winConditionToastEl = document.getElementById('winConditionToast');
const winConditionTextEl = document.getElementById('winConditionText');
const statusMessageEl = document.getElementById('statusMessage');
const battleStatusPillEl = document.getElementById('battleStatusPill');
const battleStatusTextEl = document.getElementById('battleStatusText');
const coinBalanceEl = document.getElementById('coinBalance');
const formationItemsEl = document.getElementById('formationItems');
const formationItemHintEl = document.getElementById('formationItemHint');
const bagGridEl = document.getElementById('bagGrid');
const shopGridEl = document.getElementById('shopGrid');
const itemBattleBarEl = document.getElementById('itemBattleBar');
const itemBattleIconEl = document.getElementById('itemBattleIcon');
const itemBattleNameEl = document.getElementById('itemBattleName');
const useItemBtn = document.getElementById('useItemBtn');
const cancelItemBtn = document.getElementById('cancelItemBtn');
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
  characters: document.getElementById('screenCharacters'),
  bag: document.getElementById('screenBag'),
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
  if (state.phase !== 'battle' || state.tutorial) {
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
  const active = state.phase === 'battle' && state.isHumanTurn && !state.tutorial;

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
let selectedOnlineMode = '3x3';
let onlineTimerInterval = null;

function getRosterForMode(modeId) {
  game.syncFormationMode(modeId);
  return [...game.blueRoster];
}

function prepareRosterForMatch(modeId) {
  return getRosterForMode(modeId);
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
      formationReady: blueRoster.length === rosterLimit,
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
  gameEndOverlayEl.classList.add('hidden');
  gameEndOverlayEl.classList.remove('dismissing');
}

function beginGameEndOverlay(message) {
  if (gameEndOverlayStage !== 'off') return;
  gameEndOverlayStage = 'shown';
  endResultEl.textContent = message || '';
  gameEndOverlayEl.classList.remove('dismissing');
  gameEndOverlayEl.classList.remove('hidden');

  gameEndLeaveTimers.push(window.setTimeout(() => {
    gameEndOverlayStage = 'fading';
    gameEndOverlayEl.classList.add('dismissing');
    gameEndLeaveTimers.push(window.setTimeout(() => {
      returnToHome();
    }, GAME_END_FADE_MS));
  }, GAME_END_MODAL_MS));
}

function returnToHome() {
  clearGameEndLeaveTimers();
  gameEndOverlayStage = 'leaving';
  gameEndOverlayEl.classList.add('hidden');
  gameEndOverlayEl.classList.remove('dismissing');
  if (isOnlinePlaying() || onlineClient.roomState) {
    onlineClient.leaveOnline().then(() => {
      hideGameEndOverlay();
      render(getAppState());
    });
    return;
  }
  game.backToLobby();
  hideGameEndOverlay();
  render(getAppState());
}

function withOnlineOrLocal(onlineFn, localFn) {
  if (isOnlinePlaying()) onlineFn();
  else localFn();
}

let activeNav = 'battle';
let selectedClassId = 'swordsman';
let lastPhase = 'lobby';
let lastInCombat = false;
let winConditionHideTimer = null;

const WIN_CONDITION_SHOW_MS = 2800;
const WIN_CONDITION_FADE_MS = 450;

function clearWinConditionToast() {
  if (winConditionHideTimer) {
    clearTimeout(winConditionHideTimer);
    winConditionHideTimer = null;
  }
  winConditionToastEl.classList.add('hidden');
  winConditionToastEl.classList.remove('dismissing');
}

function showWinConditionToast(winCount) {
  clearWinConditionToast();
  winConditionTextEl.textContent = `連成 ${winCount} 子 · 全滅對手`;
  winConditionToastEl.classList.remove('hidden', 'dismissing');

  winConditionHideTimer = setTimeout(() => {
    winConditionToastEl.classList.add('dismissing');
    winConditionHideTimer = setTimeout(() => {
      clearWinConditionToast();
    }, WIN_CONDITION_FADE_MS);
  }, WIN_CONDITION_SHOW_MS);
}

const BATTLE_PHASES = new Set(['battle', 'gameEnd']);

function isBottomNavLocked(state) {
  return state.phase === 'battle' || state.phase === 'gameEnd' || state.phase === 'onlineWaiting';
}

function canControlUnit(state, unit) {
  if (state.phase !== 'battle' || state.animating) return false;
  const myTeam = state.yourTeam ?? 'blue';
  if (unit.team !== myTeam) return false;
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

const characterPreview = new CharacterPreviewScene(classPreviewHostEl);

const unitThumbnails = generateUnitThumbnails(Object.keys(CLASSES));
const itemThumbnails = generateItemThumbnails(ITEM_IDS);
const navThumbnails = generateNavThumbnails();
applyNavIcons(bottomNavEl, navThumbnails);

function setUnitIcon(container, classId) {
  const cls = CLASSES[classId];
  fillUnitIcon(container, classId, unitThumbnails, cls?.icon ?? '?', cls?.name ?? classId);
}

function setItemIcon(container, item) {
  if (!item?.id) {
    container.textContent = item?.icon ?? '➖';
    return;
  }
  fillItemIcon(container, item.id, itemThumbnails, item.icon ?? '?', item.name ?? item.id);
}

game.playAttackFx = (fx) => board3d.playAttackFx(fx);
onlineClient.playAttackFx = (fx) => board3d.playAttackFx(fx);
game.playBlessFx = (fx) => board3d.playBlessFx(fx);
onlineClient.playBlessFx = (fx) => board3d.playBlessFx(fx);
game.playMapPropFx = (fx) => board3d.playMapPropFx(fx);
onlineClient.playMapPropFx = (fx) => board3d.playMapPropFx(fx);

function switchNav(navId) {
  if (!NAV_SCREENS[navId]) return;
  const state = getAppState();
  if (isBottomNavLocked(state) && navId !== 'battle') return;
  activeNav = navId;

  for (const [id, screen] of Object.entries(NAV_SCREENS)) {
    screen.classList.toggle('active', id === navId);
  }

  for (const btn of bottomNavEl.querySelectorAll('.nav-item')) {
    btn.classList.toggle('active', btn.dataset.nav === navId);
  }

  if (navId === 'formation') {
    game.syncFormationMode(state.boardMode);
  }

  if (BATTLE_PHASES.has(state.phase)) {
    board3d.setVisible(navId === 'battle');
    if (navId === 'battle') {
      board3d.sync(state);
    }
  }

  const showCharacterPreview = navId === 'characters';
  characterPreview.setVisible(showCharacterPreview);
  if (showCharacterPreview) {
    characterPreview.setClass(selectedClassId);
  }
}

function formatClassTrait(cls) {
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

function renderClassDetail(classId) {
  const cls = CLASSES[classId];
  if (!cls) return;

  classDetailInfoEl.innerHTML = `
    <h2 class="detail-name">${cls.name}</h2>
    <dl class="detail-stats">
      <div><dt>HP</dt><dd>${cls.hp}</dd></div>
      <div><dt>ATK</dt><dd>${cls.atk}</dd></div>
      <div><dt>特性</dt><dd>${formatClassTrait(cls)}</dd></div>
    </dl>
  `;

  if (activeNav === 'characters') {
    characterPreview.setClass(classId);
  }
}

function selectClass(classId) {
  selectedClassId = classId;
  render(getAppState());
}

function renderClassPicker() {
  classPickerEl.innerHTML = '';

  for (const cls of Object.values(CLASSES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'class-pick-btn' + (cls.id === selectedClassId ? ' active' : '');
    btn.title = cls.name;
    setUnitIcon(btn, cls.id);
    btn.addEventListener('click', () => selectClass(cls.id));
    classPickerEl.appendChild(btn);
  }

  renderClassDetail(selectedClassId);
}

function createItemChip(item, { count, equipped, onSelect }) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'item-chip';
  if (equipped) chip.classList.add('item-equipped');

  const owned = count ?? 0;
  if (item.id !== null && owned <= 0) chip.disabled = true;
  chip.title = item.name ?? '';

  const label = item.id === null ? '無' : item.name;
  const badge = item.id !== null && owned > 0 ? `<span class="item-chip-badge">${owned}</span>` : '';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-chip-icon';
  setItemIcon(iconWrap, item);

  chip.append(iconWrap);
  chip.insertAdjacentHTML('beforeend', `
    <span class="item-chip-label">${label}</span>
    ${badge}
  `);
  chip.addEventListener('click', () => onSelect(item.id));
  return chip;
}

function createClassUnlockRow(cls, { onBuy }) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'item-row-icon item-row-icon-unit';
  setUnitIcon(iconWrap, cls.id);

  const body = document.createElement('div');
  body.className = 'item-row-body';
  body.innerHTML = `<span class="item-row-name">${cls.name}</span>`;

  row.append(iconWrap, body);

  const canBuy = canAffordClass(cls.id);
  if (onBuy) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn item-row-btn';
    btn.textContent = '購買';
    btn.disabled = !canBuy;
    if (!canBuy) btn.title = '金幣不足';
    btn.addEventListener('click', () => onBuy(cls.id));
    row.appendChild(btn);
  }

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
    meta.className = 'item-row-meta';
    meta.textContent = `×${count}`;
    row.appendChild(meta);
  }
  if (price != null) {
    const meta = document.createElement('span');
    meta.className = 'item-row-meta';
    meta.textContent = `💰 ${price}`;
    row.appendChild(meta);
  }

  if (onBuy) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn item-row-btn';
    btn.textContent = '購買';
    btn.disabled = !canBuy;
    if (!canBuy) btn.title = '金幣不足';
    btn.addEventListener('click', () => onBuy(item.id));
    row.appendChild(btn);
  }

  return row;
}

function renderCoinBalance(state) {
  coinBalanceEl.textContent = String(state.coins ?? 0);
  statusMessageEl.classList.add('hidden');

  const inBattle = state.phase === 'battle' && !state.tutorial;
  battleStatusPillEl.classList.toggle('hidden', !inBattle);
  if (inBattle) {
    battleStatusTextEl.textContent = state.message ?? '';
  }
}

function renderFormationItems(state) {
  formationItemsEl.innerHTML = '';

  const totalItems = ITEM_IDS.reduce((sum, id) => sum + (state.inventory[id] ?? 0), 0);
  if (formationItemHintEl) {
    if (totalItems <= 0) {
      formationItemHintEl.textContent = '背包沒有道具，請先到商店購買';
      formationItemHintEl.classList.remove('hidden');
    } else if (!state.equippedItem) {
      formationItemHintEl.textContent = '選一個道具帶入對戰，開戰後可按「使用道具」';
      formationItemHintEl.classList.remove('hidden');
    } else {
      formationItemHintEl.classList.add('hidden');
    }
  }

  const noneItem = { id: null, name: '無', icon: '➖' };
  formationItemsEl.appendChild(createItemChip(noneItem, {
    equipped: state.equippedItem === null,
    onSelect: (id) => game.selectEquippedItem(id),
  }));

  for (const item of Object.values(ITEMS)) {
    formationItemsEl.appendChild(createItemChip(item, {
      count: state.inventory[item.id] ?? 0,
      equipped: state.equippedItem === item.id,
      onSelect: (id) => game.selectEquippedItem(id),
    }));
  }
}

function renderBag(state) {
  bagGridEl.innerHTML = '';

  for (const item of Object.values(ITEMS)) {
    bagGridEl.appendChild(createItemRow(item, {
      count: state.inventory[item.id] ?? 0,
    }));
  }
}

function renderShop(state) {
  shopGridEl.innerHTML = '';

  const unlockable = CLASS_IDS.filter((classId) => {
    if (!isUnlockable(classId)) return false;
    return !isClassOwnedInState(state, classId);
  });

  if (unlockable.length > 0) {
    const unlockTitle = document.createElement('div');
    unlockTitle.className = 'section-title section-title-compact';
    unlockTitle.textContent = '角色解鎖';
    shopGridEl.appendChild(unlockTitle);

    for (const classId of unlockable) {
      const cls = CLASSES[classId];
      shopGridEl.appendChild(createClassUnlockRow(cls, {
        onBuy: (id) => {
          const result = buyClass(id);
          if (result.ok) game.notify();
        },
      }));
    }
  }

  const itemTitle = document.createElement('div');
  itemTitle.className = 'section-title section-title-compact';
  itemTitle.textContent = '消耗品';
  shopGridEl.appendChild(itemTitle);

  for (const item of Object.values(ITEMS)) {
    shopGridEl.appendChild(createItemRow(item, {
      price: SHOP_PRICES[item.id],
      onBuy: (id) => {
        const result = buyItem(id);
        if (result.ok) game.notify();
      },
    }));
  }
}

function renderBattleItem(state) {
  const show = state.phase === 'battle' && state.equippedItem && state.itemDef;
  itemBattleBarEl.classList.toggle('hidden', !show);
  if (!show) return;

  itemBattleIconEl.className = 'item-battle-icon item-battle-icon-thumb';
  setItemIcon(itemBattleIconEl, state.itemDef);
  itemBattleNameEl.textContent = state.itemDef.name;

  const targeting = Boolean(state.itemTargeting);
  cancelItemBtn.classList.toggle('hidden', !targeting);
  useItemBtn.classList.toggle('hidden', targeting || state.itemUsed);

  if (state.itemUsed) {
    useItemBtn.disabled = true;
    useItemBtn.textContent = '已使用';
    return;
  }

  useItemBtn.textContent = '使用道具';
  useItemBtn.disabled = !state.canUseItem || state.animating;
}

function renderFormation(state) {
  const limit = state.rosterLimit;
  const picked = state.blueRoster;

  formationCountEl.textContent = `${picked.length} / ${limit} 人`;

  formationLineupEl.classList.toggle('full', picked.length === limit);
  formationLineupEl.innerHTML = '';

  if (picked.length > 0) {
    picked.forEach((classId, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'roster-chip';
      chip.title = `移除 ${CLASSES[classId].name}`;
      setUnitIcon(chip, classId);
      chip.addEventListener('click', () => game.removeFromFormation(index));
      formationLineupEl.appendChild(chip);
    });
  }

  formationPoolEl.innerHTML = '';
  for (const cls of Object.values(CLASSES)) {
    if (!isClassOwnedInState(state, cls.id)) continue;

    const selected = picked.includes(cls.id);
    const soldOut = !selected && picked.length >= limit;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'class-card' + (selected ? ' selected' : '');
    card.disabled = soldOut;
    const iconWrap = document.createElement('span');
    iconWrap.className = 'class-icon';
    setUnitIcon(iconWrap, cls.id);

    card.append(iconWrap);
    card.insertAdjacentHTML('beforeend', `
      <span class="class-name">${cls.name}</span>
      <span class="class-meta">HP ${cls.hp} · ATK ${cls.atk}</span>
      <span class="class-count">${selected ? '已選' : ''}</span>
    `);
    card.addEventListener('click', () => game.addToFormation(cls.id));
    formationPoolEl.appendChild(card);
  }

  startBattleBtn.disabled = !state.formationReady;
  formationFooterEl.classList.toggle(
    'hidden',
    state.phase !== 'formation' && state.phase !== 'onlineLobby',
  );
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
  const selectable = side === 'blue' && state.isHumanTurn && tutorialAllowsReserve(state, unit);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'reserve-card';
  card.dataset.unitId = unit.id;
  if (side === 'enemy') card.classList.add('reserve-card-enemy');
  card.classList.toggle('selected', selected);
  card.classList.toggle('inspected', inspected);
  card.classList.toggle('disabled', side === 'blue' && !selectable);
  card.classList.toggle(
    'tutorial-focus',
    side === 'blue' && selectable && !selected && state.tutorialSelectableClassIds != null,
  );
  if (side === 'blue' && !selectable) card.disabled = true;

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

  const hpText = document.createElement('span');
  hpText.className = 'reserve-card-hp-text';
  hpText.textContent = String(unit.hp);

  const atkText = document.createElement('span');
  atkText.className = 'reserve-card-atk-text';
  atkText.textContent = `ATK ${unit.atk}`;

  vitals.append(hpText, atkText);
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
      if (!selectable) return;
      withOnlineOrLocal(
        () => onlineClient.selectReserve(unit.id),
        () => game.selectReserve(unit.id),
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

function renderFormationModePicker(state) {
  formationModeButtonsEl.innerHTML = '';
  const canPick = activeNav === 'formation' && game.canEditRoster();

  for (const mode of Object.values(BOARD_MODES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mode-btn' + (state.boardMode === mode.id ? ' active' : '');
    btn.setAttribute('aria-label', `${mode.size}×${mode.size}`);
    btn.appendChild(createModeGridIcon(mode.size));
    btn.disabled = !canPick;
    btn.addEventListener('click', () => {
      selectedOnlineMode = mode.id;
      game.syncFormationMode(mode.id);
      render(getAppState());
    });
    formationModeButtonsEl.appendChild(btn);
  }
}

function renderModePicker(state) {
  modeButtonsEl.innerHTML = '';
  const canPick = state.phase === 'onlineLobby';

  for (const mode of Object.values(BOARD_MODES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mode-btn' + (selectedOnlineMode === mode.id ? ' active' : '');
    btn.setAttribute('aria-label', `${mode.size}×${mode.size}`);
    btn.appendChild(createModeGridIcon(mode.size));
    btn.disabled = !canPick;
    btn.addEventListener('click', () => {
      selectedOnlineMode = mode.id;
      game.syncFormationMode(mode.id);
      render(getAppState());
    });
    modeButtonsEl.appendChild(btn);
  }
}

function renderOnlineLobby(state) {
  const inLobby = state.phase === 'onlineLobby';
  const waiting = state.phase === 'onlineWaiting';

  onlineLobbyActionsEl.classList.toggle('hidden', !inLobby);
  onlineWaitingEl.classList.toggle('hidden', !waiting);

  if (waiting) {
    const matching = Boolean(state.matchmaking);
    waitingRoomCodeLineEl.classList.toggle('hidden', matching);
    onlineMatchIndicatorEl.classList.toggle('hidden', !matching);

    if (!matching) {
      waitingRoomCodeEl.textContent = state.roomCode ?? '';
    }
  }
}

function renderLobbyFooter(state) {
  const inLobby = state.phase === 'onlineLobby' || state.phase === 'lobby';
  startTutorialBtn.classList.toggle('hidden', !(inLobby && !isTutorialDone()));
  if (confirmRosterBtn) confirmRosterBtn.classList.add('hidden');
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
  const inBattle = state.phase === 'battle';
  const inTutorial = Boolean(state.tutorial);

  surrenderBtn.classList.toggle('hidden', !inBattle || inTutorial);
  surrenderBtn.disabled = !inBattle || state.animating;

  endPanelEl.classList.add('hidden');
  restartBtn.classList.add('hidden');
  backToLobbyBtn.classList.add('hidden');
}

function updateBottomNav(state) {
  const lockNav = isBottomNavLocked(state);
  bottomNavEl.classList.toggle('hidden', lockNav);
  bottomNavEl.setAttribute('aria-hidden', lockNav ? 'true' : 'false');
  for (const btn of bottomNavEl.querySelectorAll('.nav-item')) {
    const isBattle = btn.dataset.nav === 'battle';
    btn.disabled = lockNav && !isBattle;
  }
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
    showWinConditionToast(state.winCount);
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
  renderCoinBalance(state);
  if (inFormation || (activeNav === 'formation' && game.canEditRoster())) {
    renderFormation(state);
    renderFormationItems(state);
  }
  if (activeNav === 'formation' && game.canEditRoster()) {
    renderFormationModePicker(state);
  }
  if (inBattleFlow) renderBattleItem(state);
  if (inBattleFlow) renderReserveBars(state);
  if (activeNav === 'bag') renderBag(state);
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
  renderClassPicker();
  updateBottomNav(state);

  const showCharacterPreview = activeNav === 'characters';
  characterPreview.setVisible(showCharacterPreview);
  if (showCharacterPreview) {
    characterPreview.setClass(selectedClassId);
  }
}

bottomNavEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn || btn.disabled) return;
  switchNav(btn.dataset.nav);
  render(getAppState());
});

findMatchBtn.addEventListener('click', async () => {
  const roster = prepareRosterForMatch(selectedOnlineMode);
  findMatchBtn.disabled = true;
  try {
    await onlineClient.findMatch(selectedOnlineMode, undefined, roster);
    render(getAppState());
  } catch (e) {
    alert(e.message ?? '匹配失敗');
  } finally {
    findMatchBtn.disabled = false;
  }
});

createRoomBtn.addEventListener('click', async () => {
  const roster = prepareRosterForMatch(selectedOnlineMode);
  createRoomBtn.disabled = true;
  try {
    await onlineClient.createRoom(selectedOnlineMode, undefined, roster);
    render(getAppState());
  } catch (e) {
    alert(e.message ?? '建立房間失敗');
  } finally {
    createRoomBtn.disabled = false;
  }
});

joinRoomBtn.addEventListener('click', async () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    alert('請輸入 6 位房間碼');
    return;
  }
  const roster = prepareRosterForMatch(selectedOnlineMode);
  joinRoomBtn.disabled = true;
  try {
    await onlineClient.joinRoom(code, undefined, roster);
  } catch (e) {
    alert(e.message ?? '加入失敗');
  } finally {
    joinRoomBtn.disabled = false;
  }
});

cancelRoomBtn.addEventListener('click', () => {
  onlineClient.leaveOnline().then(() => render(getAppState()));
});

if (confirmRosterBtn) confirmRosterBtn.addEventListener('click', () => {
  game.openFormation();
  switchNav('formation');
});
startBattleBtn.addEventListener('click', () => game.startBattle());
restartBtn.addEventListener('click', () => {
  if (isOnlinePlaying() || onlineClient.roomState) return;
  game.restartSeries();
});
backToLobbyBtn.addEventListener('click', () => returnToHome());
surrenderBtn.addEventListener('click', () => {
  if (isOnlinePlaying()) onlineClient.surrender();
  else game.surrender();
});
useItemBtn.addEventListener('click', () => game.beginUseItem());
cancelItemBtn.addEventListener('click', () => game.cancelItemTargeting());
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
    game.blueRoster = [...(game.rostersByMode[game.boardMode] ?? [])];
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
