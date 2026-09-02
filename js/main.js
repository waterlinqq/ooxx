import { Game, CLASSES, BOARD_MODES } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';
import { CharacterPreviewScene } from './board3d/CharacterPreviewScene.js';

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
const formationRandomBtn = document.getElementById('formationRandom');
const formationClearBtn = document.getElementById('formationClear');
const formationBackBtn = document.getElementById('formationBack');
const startBattleBtn = document.getElementById('startBattle');
const backToLobbyBtn = document.getElementById('backToLobby');
const turnTimerEl = document.getElementById('turnTimer');
const turnTimerFillEl = document.getElementById('turnTimerFill');
const classPickerEl = document.getElementById('classPicker');
const classDetailInfoEl = document.getElementById('classDetailInfo');
const classPreviewHostEl = document.getElementById('classPreviewHost');
const endPanelEl = document.getElementById('endPanel');
const endResultEl = document.getElementById('endResult');
const modeButtonsEl = document.getElementById('modeButtons');
const confirmRosterBtn = document.getElementById('confirmRoster');
const restartBtn = document.getElementById('restart');
const bottomNavEl = document.getElementById('bottomNav');

const NAV_SCREENS = {
  battle: document.getElementById('screenBattle'),
  characters: document.getElementById('screenCharacters'),
  bag: document.getElementById('screenBag'),
  shop: document.getElementById('screenShop'),
};

const DEFAULT_TURN_DURATION_MS = 15000;
const DEFAULT_TURN_BONUS_MS = 5000;
const TURN_TIMER_TICK_MS = 50;

let turnTimerInterval = null;
let turnTimerRemainingMs = DEFAULT_TURN_DURATION_MS;
let turnTimerBarMaxMs = DEFAULT_TURN_DURATION_MS;
let turnTimerBonusMs = DEFAULT_TURN_BONUS_MS;
let turnTimerLastTick = 0;
let turnTimerPaused = false;
let turnTimerHumanTurn = false;
let turnTimerLastActedCount = 0;

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
  canControlUnit,
});

const characterPreview = new CharacterPreviewScene(classPreviewHostEl);

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
  if (cls.deathExplosion) return `近戰 · 亡語自爆 ${cls.deathExplosion} 傷`;
  if (cls.jumpMove) return cls.jumpRange ? `可跳躍至周遭 ${cls.jumpRange} 格` : '可跳躍至任意空格';
  if (cls.type === 'mage') return '八方向光束穿透攻擊';
  if (cls.type === 'ranged') return `八方向射線 · 射程 ${cls.range}`;
  return '近戰';
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
    btn.textContent = cls.icon;
    btn.title = cls.name;
    btn.addEventListener('click', () => selectClass(cls.id));
    classPickerEl.appendChild(btn);
  }

  renderClassDetail(selectedClassId);
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
      chip.textContent = CLASSES[classId].icon;
      chip.title = `移除 ${CLASSES[classId].name}`;
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
    card.innerHTML = `
      <span class="class-icon">${cls.icon}</span>
      <span class="class-name">${cls.name}</span>
      <span class="class-meta">HP ${cls.hp} · ATK ${cls.atk}</span>
      <span class="class-count">${used} / ${state.maxPerClass}</span>
    `;
    card.addEventListener('click', () => game.addToFormation(cls.id));
    formationPoolEl.appendChild(card);
  }

  formationClearBtn.disabled = picked.length === 0;
  startBattleBtn.disabled = !state.formationReady;
}

function renderModePicker(state) {
  modeButtonsEl.innerHTML = '';
  const canPick = state.phase === 'lobby';

  for (const mode of Object.values(BOARD_MODES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mode-btn' + (state.boardMode === mode.id ? ' active' : '');
    const subtitle = mode.matchFormat === '2v2' ? '2v2 單局' : '';
    btn.innerHTML = subtitle
      ? `<span class="mode-btn-label">${mode.label}</span><span class="mode-btn-sub">${subtitle}</span>`
      : mode.label;
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
  const showEnd = state.phase === 'gameEnd';

  endPanelEl.classList.toggle('hidden', !showEnd);
  restartBtn.classList.toggle('hidden', !showEnd);
  backToLobbyBtn.classList.toggle('hidden', !showEnd);

  if (showEnd) {
    endResultEl.textContent = state.message;
  }
}

function render(state) {
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
  lastPhase = state.phase;

  renderBattlePanels(state);
  renderLobbyFooter(state);
  if (inFormation) renderFormation(state);

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
formationRandomBtn.addEventListener('click', () => game.randomizeFormation());
formationClearBtn.addEventListener('click', () => game.clearFormation());
formationBackBtn.addEventListener('click', () => game.backToLobby());
startBattleBtn.addEventListener('click', () => game.startBattle());
restartBtn.addEventListener('click', () => game.restartSeries());
backToLobbyBtn.addEventListener('click', () => game.backToLobby());

game.subscribe(render);
render(game.getState());
