import { Game, CLASSES, BOARD_MODES } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';
import { CharacterPreviewScene } from './board3d/CharacterPreviewScene.js';
import { generateUnitThumbnails, fillUnitIcon } from './board3d/UnitThumbnails.js';
import { ITEMS, SHOP_PRICES } from './items.js';
import { loadSave, buyItem, canAfford } from './save.js';

loadSave();

// Block browser pinch / trackpad zoom so gestures stay on the board.
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

const game = new Game();

const boardCanvasHost = document.getElementById('boardCanvas');
const fxLayerEl = document.getElementById('fxLayer');
const boardWrapEl = document.querySelector('.board-wrap');
const lobbyContentEl = document.getElementById('lobbyContent');
const formationContentEl = document.getElementById('formationContent');
const battleContentEl = document.getElementById('battleContent');
const formationHintEl = document.getElementById('formationHint');
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
const coinBalanceEl = document.getElementById('coinBalance');
const formationItemsEl = document.getElementById('formationItems');
const bagGridEl = document.getElementById('bagGrid');
const shopGridEl = document.getElementById('shopGrid');
const itemBattleBarEl = document.getElementById('itemBattleBar');
const itemBattleIconEl = document.getElementById('itemBattleIcon');
const itemBattleNameEl = document.getElementById('itemBattleName');
const useItemBtn = document.getElementById('useItemBtn');
const cancelItemBtn = document.getElementById('cancelItemBtn');

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
  if (state.phase !== 'battle') {
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
  const active = state.phase === 'battle' && state.isHumanTurn;

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
  if (state.matchFormat === '2v2') return unit.ownerSeat === 0;
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
  if (cls.deathExplosion) return `八向近戰 · 亡語自爆 ${cls.deathExplosion} 傷`;
  if (cls.jumpMove) return cls.jumpRange ? `可跳躍至周遭 ${cls.jumpRange} 格` : '可跳躍至任意空格';
  if (cls.moveRange === Infinity) return '移動距離無限';
  if (cls.type === 'mage') return '上下左右光束穿透攻擊';
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

function createItemCard(item, { count, price, equipped, readonly, onSelect, onBuy }) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'item-card';
  if (equipped) card.classList.add('item-equipped');

  const owned = count ?? 0;
  const canBuy = price != null && canAfford(item.id);

  if (onBuy) {
    card.disabled = !canBuy;
    if (!canBuy) card.title = '金幣不足';
  } else if (onSelect && item.id !== null && owned <= 0) {
    card.disabled = true;
  }

  card.innerHTML = `
    <span class="item-icon">${item.icon ?? '📦'}</span>
    <span class="item-name">${item.name ?? '不帶道具'}</span>
    <span class="item-desc">${item.desc ?? '本場不攜帶任何道具'}</span>
    ${price != null ? `<span class="item-price">💰 ${price}</span>` : ''}
    ${count != null && item.id ? `<span class="item-count">×${owned}</span>` : ''}
    ${onBuy ? '<span class="item-action">購買</span>' : ''}
  `;

  if (onSelect) card.addEventListener('click', () => onSelect(item.id));
  if (onBuy) card.addEventListener('click', () => onBuy(item.id));

  if (readonly) card.disabled = false;

  return card;
}

function renderCoinBalance(state) {
  coinBalanceEl.textContent = String(state.coins ?? 0);
  statusMessageEl.textContent = state.message ?? '';
}

function renderFormationItems(state) {
  formationItemsEl.innerHTML = '';

  const noneItem = { id: null, name: '不帶道具', icon: '➖', desc: '本場不攜帶任何道具' };
  const noneCard = createItemCard(noneItem, {
    equipped: state.equippedItem === null,
    onSelect: (id) => game.selectEquippedItem(id),
  });
  formationItemsEl.appendChild(noneCard);

  for (const item of Object.values(ITEMS)) {
    const count = state.inventory[item.id] ?? 0;
    const card = createItemCard(item, {
      count,
      equipped: state.equippedItem === item.id,
      onSelect: (id) => game.selectEquippedItem(id),
    });
    formationItemsEl.appendChild(card);
  }
}

function renderBag(state) {
  bagGridEl.innerHTML = '';

  for (const item of Object.values(ITEMS)) {
    const count = state.inventory[item.id] ?? 0;
    const card = createItemCard(item, { count, readonly: true });
    card.disabled = false;
    bagGridEl.appendChild(card);
  }
}

function renderShop(state) {
  shopGridEl.innerHTML = '';

  for (const item of Object.values(ITEMS)) {
    const card = createItemCard(item, {
      price: SHOP_PRICES[item.id],
      onBuy: (id) => {
        const result = buyItem(id);
        if (result.ok) {
          game.notify();
        }
      },
    });
    shopGridEl.appendChild(card);
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

  formationHintEl.textContent = state.message;
  formationCountEl.textContent = `${picked.length} / ${limit} 人 · 同職業上限 ${state.maxPerClass}`;

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
    const used = picked.filter((id) => id === cls.id).length;
    const soldOut = used >= state.maxPerClass || picked.length >= limit;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'class-card';
    card.disabled = soldOut;
    const iconWrap = document.createElement('span');
    iconWrap.className = 'class-icon';
    setUnitIcon(iconWrap, cls.id);

    card.append(iconWrap);
    card.insertAdjacentHTML('beforeend', `
      <span class="class-name">${cls.name}</span>
      <span class="class-meta">HP ${cls.hp} · ATK ${cls.atk}</span>
      <span class="class-count">${used} / ${state.maxPerClass}</span>
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mode-btn' + (state.boardMode === mode.id ? ' active' : '');
    const format = mode.matchFormat === '2v2' ? '2v2 · ' : '';
    const minutes = Math.round(mode.matchDurationMs / 60000);
    btn.innerHTML = `
      <span class="mode-btn-label">${mode.label}</span>
      <span class="mode-btn-sub">${format}限時 ${minutes} 分鐘</span>
    `;
    btn.disabled = !canPick;
    btn.addEventListener('click', () => game.setBoardMode(mode.id));
    modeButtonsEl.appendChild(btn);
  }
}

function renderLobbyFooter(state) {
  const inLobby = state.phase === 'lobby';
  confirmRosterBtn.classList.toggle('hidden', !inLobby);
  if (inLobby) {
    confirmRosterBtn.textContent = state.startButtonLabel;
  }
}

function renderBattlePanels(state) {
  const inBattle = state.phase === 'battle';
  const showEnd = state.phase === 'gameEnd';

  surrenderBtn.classList.toggle('hidden', !inBattle);
  surrenderBtn.disabled = !inBattle || state.animating;

  endPanelEl.classList.toggle('hidden', !showEnd);
  restartBtn.classList.toggle('hidden', !showEnd);
  backToLobbyBtn.classList.toggle('hidden', !showEnd);

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
  const inBattleFlow = BATTLE_PHASES.has(state.phase);
  lobbyContentEl.classList.toggle('hidden', state.phase !== 'lobby');
  formationContentEl.classList.toggle('hidden', !inFormation);
  battleContentEl.classList.toggle('hidden', !inBattleFlow);

  if (state.phase !== lastPhase && inBattleFlow) {
    switchNav('battle');
  }
  if (state.phase !== lastPhase && state.phase === 'battle') {
    showWinConditionToast(state.winCount);
  } else if (state.phase !== 'battle' && state.phase !== 'gameEnd') {
    clearWinConditionToast();
  }
  lastPhase = state.phase;

  renderBattlePanels(state);
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
  } else if (!inBattleFlow) {
    board3d.clear();
  }

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

game.subscribe(render);
render(game.getState());
