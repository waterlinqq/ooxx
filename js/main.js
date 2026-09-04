import { Game, CLASSES, BOARD_MODES } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';
import { CharacterPreviewScene } from './board3d/CharacterPreviewScene.js';
import { generateUnitThumbnails, fillUnitIcon } from './board3d/UnitThumbnails.js';
import { ITEMS, SHOP_PRICES } from './items.js';
import { loadSave, buyItem, canAfford, isTutorialDone } from './save.js';

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
const formationContentEl = document.getElementById('formationContent');
const battleContentEl = document.getElementById('battleContent');
const formationCountEl = document.getElementById('formationCount');
const formationLineupEl = document.getElementById('formationLineup');
const formationPoolEl = document.getElementById('formationPool');
const formationBackBtn = document.getElementById('formationBack');
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
const modeButtonsEl = document.getElementById('modeButtons');
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
const tutorialTextEl = document.getElementById('tutorialText');
const tutorialNoteEl = document.getElementById('tutorialNote');
const tutorialSkipBtn = document.getElementById('tutorialSkip');

const NAV_SCREENS = {
  battle: document.getElementById('screenBattle'),
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

function updateMatchTimer() {
  const pct = matchTimerDurationMs > 0
    ? Math.min(1, matchTimerRemainingMs / matchTimerDurationMs)
    : 0;
  matchTimerFillEl.style.width = `${pct * 100}%`;
  matchTimerTextEl.textContent = formatClock(matchTimerRemainingMs);
  matchTimerEl.classList.toggle('match-timer-low', pct <= 0.1 && pct > 0);
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
  const pct = turnTimerBarMaxMs > 0
    ? Math.min(1, turnTimerRemainingMs / turnTimerBarMaxMs)
    : 0;
  turnTimerFillEl.style.width = `${pct * 100}%`;
  turnTimerEl.classList.toggle('turn-timer-low', pct <= 0.25 && pct > 0);
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
    turnTimerPaused = true;
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

  turnTimerPaused = false;
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
  winConditionTextEl.textContent = `連成 ${winCount} 子 · 全滅對手 · 時間到比總分`;
  winConditionToastEl.classList.remove('hidden', 'dismissing');

  winConditionHideTimer = setTimeout(() => {
    winConditionToastEl.classList.add('dismissing');
    winConditionHideTimer = setTimeout(() => {
      clearWinConditionToast();
    }, WIN_CONDITION_FADE_MS);
  }, WIN_CONDITION_SHOW_MS);
}

const BATTLE_PHASES = new Set(['battle', 'gameEnd']);

function canControlUnit(state, unit) {
  if (state.phase !== 'battle' || state.animating) return false;
  if (unit.team !== 'blue') return false;
  if (state.actedUnitIds.includes(unit.id)) return false;
  if (!state.isHumanTurn) return false;
  if (state.tutorial) {
    const actor = state.tutorialActorCell;
    return Boolean(actor) && actor.row === unit.row && actor.col === unit.col;
  }
  return true;
}

const board3d = new BoardScene(boardCanvasHost, fxLayerEl, {
  onCellClick: (row, col) => game.clickCell(row, col),
  onUnitDragStart: (unitId) => game.beginDragUnit(unitId),
  onUnitDrop: (row, col) => game.dropOnCell(row, col),
  onDragCancel: () => game.cancelDrag(),
  onReserveSelect: (unitId) => game.selectReserve(unitId),
  onUnitInspect: (unitId) => game.inspectUnit(unitId),
  onItemTarget: (row, col) => game.tryItemTarget(row, col),
  canControlUnit,
});

const characterPreview = new CharacterPreviewScene(classPreviewHostEl);

const unitThumbnails = generateUnitThumbnails(Object.keys(CLASSES));

function setUnitIcon(container, classId) {
  const cls = CLASSES[classId];
  fillUnitIcon(container, classId, unitThumbnails, cls?.icon ?? '?', cls?.name ?? classId);
}

game.playAttackFx = (fx) => board3d.playAttackFx(fx);
game.playBlessFx = (fx) => board3d.playBlessFx(fx);

function switchNav(navId) {
  if (!NAV_SCREENS[navId]) return;
  activeNav = navId;

  for (const [id, screen] of Object.entries(NAV_SCREENS)) {
    screen.classList.toggle('active', id === navId);
  }

  for (const btn of bottomNavEl.querySelectorAll('.nav-item')) {
    btn.classList.toggle('active', btn.dataset.nav === navId);
  }

  const state = game.getState();
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
  if (cls.poisonOnHit) return '上下左右近戰 · 命中使敵中毒';
  if (cls.possessionOnKill) return '上下左右近戰 · 擊殺附身敵人';
  if (cls.deathExplosion) return `上下左右近戰 · 亡語自爆 ${cls.deathExplosion} 傷（周圍八格）`;
  if (cls.jumpMove) return cls.jumpRange ? `可跳躍至周遭 ${cls.jumpRange} 格` : '可跳躍至任意空格';
  if (cls.moveRange === Infinity) return '移動距離無限';
  if (cls.type === 'mage') return '上下左右光束穿透攻擊';
  if (cls.type === 'artillery') return '上下左右第二格 · 無法近戰';
  if (cls.type === 'ranged') return `上下左右射線 · 射程 ${cls.range}`;
  if (cls.type === 'tower') return `上下左右齊射 · 射程 ${cls.range}`;
  if (cls.passiveBlessing) return '上下左右祝福 · 恢復 1 生命';
  return '上下左右近戰';
}

function renderClassDetail(classId) {
  const cls = CLASSES[classId];
  if (!cls) return;

  classDetailInfoEl.innerHTML = `
    <h2 class="detail-name">${cls.name}</h2>
    <p class="detail-desc">${cls.desc}</p>
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
  render(game.getState());
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
  chip.title = item.desc ?? item.name ?? '';

  const label = item.id === null ? '無' : item.name;
  const badge = item.id !== null && owned > 0 ? `<span class="item-chip-badge">${owned}</span>` : '';

  chip.innerHTML = `
    <span class="item-chip-icon">${item.icon ?? '➖'}</span>
    <span class="item-chip-label">${label}</span>
    ${badge}
  `;
  chip.addEventListener('click', () => onSelect(item.id));
  return chip;
}

function createItemRow(item, { count, price, onBuy }) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const canBuy = price != null && canAfford(item.id);
  row.innerHTML = `
    <span class="item-row-icon">${item.icon}</span>
    <div class="item-row-body">
      <span class="item-row-name">${item.name}</span>
      <span class="item-row-desc">${item.desc}</span>
    </div>
    ${count != null ? `<span class="item-row-meta">×${count}</span>` : ''}
    ${price != null ? `<span class="item-row-meta">💰 ${price}</span>` : ''}
  `;

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
  const showStatus = state.phase === 'battle';
  statusMessageEl.textContent = showStatus ? (state.message ?? '') : '';
  statusMessageEl.classList.toggle('hidden', !showStatus || !state.message);

  // In the tutorial the step panel already carries the instruction, so the pill would
  // just repeat it over the board.
  const inBattle = state.phase === 'battle' && !state.tutorial;
  battleStatusPillEl.classList.toggle('hidden', !inBattle);
  if (inBattle) {
    battleStatusTextEl.textContent = state.message ?? '';
  }
}

function renderFormationItems(state) {
  formationItemsEl.innerHTML = '';

  const noneItem = { id: null, name: '無', icon: '➖', desc: '不帶道具' };
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

  itemBattleIconEl.textContent = state.itemDef.icon;
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

  if (picked.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'roster-lineup-empty';
    empty.textContent = '尚未選擇任何單位';
    formationLineupEl.appendChild(empty);
  } else {
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
}

function renderModePicker(state) {
  modeButtonsEl.innerHTML = '';
  const canPick = state.phase === 'lobby';

  for (const mode of Object.values(BOARD_MODES)) {
    const minutes = mode.matchDurationMs / 60000;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mode-btn' + (state.boardMode === mode.id ? ' active' : '');
    btn.innerHTML = `
      <span class="mode-btn-label">${mode.label}</span>
      <span class="mode-btn-sub">限時 ${minutes} 分鐘</span>
    `;
    btn.disabled = !canPick;
    btn.addEventListener('click', () => game.setBoardMode(mode.id));
    modeButtonsEl.appendChild(btn);
  }
}

function renderLobbyFooter(state) {
  const inLobby = state.phase === 'lobby';
  confirmRosterBtn.classList.toggle('hidden', !inLobby);
  startTutorialBtn.classList.toggle('hidden', !inLobby);
  if (inLobby) {
    confirmRosterBtn.textContent = state.startButtonLabel;
  }
}

function renderTutorialPanel(state) {
  const tutorial = state.tutorial;
  const show = Boolean(tutorial) && state.phase === 'battle';
  tutorialPanelEl.classList.toggle('hidden', !show);
  if (!show) return;

  tutorialStepEl.textContent = `${tutorial.stepNumber} / ${tutorial.totalSteps}`;
  tutorialTitleEl.textContent = tutorial.title;
  tutorialTextEl.textContent = tutorial.waitingForEnemy ? '紅隊行動中…' : tutorial.text;
  tutorialPanelEl.classList.toggle('waiting', tutorial.waitingForEnemy);

  tutorialNoteEl.classList.toggle('hidden', !tutorial.note);
  tutorialNoteEl.textContent = tutorial.note ?? '';
}

function renderBattlePanels(state) {
  const inBattle = state.phase === 'battle';
  const showEnd = state.phase === 'gameEnd';
  const inTutorial = Boolean(state.tutorial);

  surrenderBtn.classList.toggle('hidden', !inBattle || inTutorial);
  surrenderBtn.disabled = !inBattle || state.animating;

  endPanelEl.classList.toggle('hidden', !showEnd);
  restartBtn.classList.toggle('hidden', !showEnd || inTutorial);
  backToLobbyBtn.classList.toggle('hidden', !showEnd);

  if (!inTutorial) {
    restartBtn.textContent = '再來一局';
    backToLobbyBtn.textContent = '換模式';
  } else {
    backToLobbyBtn.textContent = '開始遊戲';
  }

  if (showEnd) {
    const coinLine = state.lastCoinReward > 0
      ? `\n💰 +${state.lastCoinReward} 金幣`
      : '';
    endResultEl.textContent = state.message + coinLine;
  }
}

function render(state) {
  syncMatchTimer(state);
  syncTurnTimer(state);

  boardWrapEl.classList.toggle('blue-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  boardWrapEl.classList.toggle('red-turn', state.phase === 'battle' && state.currentPlayer === 'red');

  const inFormation = state.phase === 'formation';
  const inBattle = state.phase === 'battle';
  const inBattleFlow = BATTLE_PHASES.has(state.phase);
  const inCombat = inBattle && activeNav === 'battle';

  appEl.classList.toggle('in-combat', inCombat);
  battleContentEl.classList.toggle('in-combat', inCombat);
  battleContentEl.classList.toggle('game-end', state.phase === 'gameEnd');
  lobbyContentEl.classList.toggle('hidden', state.phase !== 'lobby');
  formationContentEl.classList.toggle('hidden', !inFormation);
  battleContentEl.classList.toggle('hidden', !inBattleFlow);

  if (state.phase !== lastPhase && inBattleFlow) {
    switchNav('battle');
  }
  if (state.phase !== lastPhase && state.phase === 'battle' && !state.tutorial) {
    showWinConditionToast(state.winCount);
  } else if (state.phase !== 'battle' && state.phase !== 'gameEnd') {
    clearWinConditionToast();
  }
  lastPhase = state.phase;

  renderBattlePanels(state);
  renderTutorialPanel(state);
  renderLobbyFooter(state);
  renderCoinBalance(state);
  if (inFormation) {
    renderFormation(state);
    renderFormationItems(state);
  }
  if (inBattleFlow) renderBattleItem(state);
  if (activeNav === 'bag') renderBag(state);
  if (activeNav === 'shop') renderShop(state);

  const showBoard = inBattleFlow && activeNav === 'battle';
  board3d.setVisible(showBoard);

  if (showBoard) {
    board3d.sync(state);
    if (inCombat !== lastInCombat) {
      board3d.scheduleResize();
    }
  } else if (!inBattleFlow) {
    board3d.clear();
  }
  lastInCombat = inCombat;

  renderModePicker(state);
  renderClassPicker();

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
  render(game.getState());
});

confirmRosterBtn.addEventListener('click', () => game.openFormation());
formationBackBtn.addEventListener('click', () => game.backToLobby());
startBattleBtn.addEventListener('click', () => game.startBattle());
restartBtn.addEventListener('click', () => game.restartSeries());
backToLobbyBtn.addEventListener('click', () => game.backToLobby());
surrenderBtn.addEventListener('click', () => game.surrender());
useItemBtn.addEventListener('click', () => game.beginUseItem());
cancelItemBtn.addEventListener('click', () => game.cancelItemTargeting());
startTutorialBtn.addEventListener('click', () => game.startTutorial());
tutorialSkipBtn.addEventListener('click', () => game.skipTutorial());

game.subscribe(render);
render(game.getState());

// First-time players land straight in the scripted tutorial instead of the mode picker.
if (!isTutorialDone()) {
  game.startTutorial();
}
