import { Game, CLASSES, BOARD_MODES } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';

const game = new Game();

const boardCanvasHost = document.getElementById('boardCanvas');
const fxLayerEl = document.getElementById('fxLayer');
const boardWrapEl = document.querySelector('.board-wrap');
const lobbyContentEl = document.getElementById('lobbyContent');
const battleContentEl = document.getElementById('battleContent');
const turnTimerEl = document.getElementById('turnTimer');
const turnTimerFillEl = document.getElementById('turnTimerFill');
const classPickerEl = document.getElementById('classPicker');
const classDetailEl = document.getElementById('classDetail');
const reservePanelEl = document.getElementById('reservePanel');
const teammatePanelEl = document.getElementById('teammatePanel');
const teammateListEl = document.getElementById('teammateList');
const enemyPanelEl = document.getElementById('enemyPanel');
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

const TURN_DURATION_MS = 15000;
const TURN_TIMER_TICK_MS = 50;

let turnTimerInterval = null;
let turnTimerRemainingMs = TURN_DURATION_MS;
let turnTimerLastTick = 0;
let turnTimerPaused = false;
let turnTimerHumanTurn = false;

function clearTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  turnTimerPaused = false;
  turnTimerHumanTurn = false;
  turnTimerLastTick = 0;
}

function updateTurnTimerBar() {
  const pct = Math.max(0, turnTimerRemainingMs / TURN_DURATION_MS);
  turnTimerFillEl.style.width = `${pct * 100}%`;
  turnTimerEl.classList.toggle('turn-timer-low', pct <= 0.25 && pct > 0);
}

function startTurnTimer() {
  clearTurnTimer();
  turnTimerHumanTurn = true;
  turnTimerRemainingMs = TURN_DURATION_MS;
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
    startTurnTimer();
    return;
  }

  turnTimerPaused = false;
}

let activeNav = 'battle';
let selectedClassId = 'swordsman';
let lastPhase = 'roster';

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
  if (state.phase !== 'roster') {
    board3d.setVisible(navId === 'battle');
    if (navId === 'battle') {
      board3d.sync(state);
    }
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

  classDetailEl.innerHTML = `
    <div class="detail-icon">${cls.icon}</div>
    <h2 class="detail-name">${cls.name}</h2>
    <p class="detail-desc">${cls.desc}</p>
    <dl class="detail-stats">
      <div><dt>HP</dt><dd>${cls.hp}</dd></div>
      <div><dt>ATK</dt><dd>${cls.atk}</dd></div>
      <div><dt>特性</dt><dd>${formatClassTrait(cls)}</dd></div>
    </dl>
  `;
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

function renderModePicker(state) {
  modeButtonsEl.innerHTML = '';
  const canPick = state.phase === 'roster';

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
  const inRoster = state.phase === 'roster';
  confirmRosterBtn.classList.toggle('hidden', !inRoster);
  if (inRoster) {
    confirmRosterBtn.textContent = state.startButtonLabel;
  }
}

function filterUnitsBySeat(units, seat) {
  return units.filter((u) => u.ownerSeat === seat);
}

function renderUnitList(container, units, { emptyHint = '已空', interactive = false, canPick = false, onSelect = null, selectedId = null }) {
  container.innerHTML = '';

  if (units.length === 0) {
    container.innerHTML = `<div class="empty-hint">${emptyHint}</div>`;
    return;
  }

  for (const unit of units) {
    const cls = CLASSES[unit.classId];
    if (interactive) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'reserve-item';
      if (selectedId === unit.id) item.classList.add('selected');
      if (!canPick) item.classList.add('disabled');
      item.innerHTML = `<span>${cls.icon} ${cls.name}</span>`;
      item.addEventListener('click', () => {
        if (canPick && onSelect) onSelect(unit.id);
      });
      container.appendChild(item);
    } else {
      const item = document.createElement('div');
      item.className = 'enemy-item';
      item.innerHTML = `<span class="enemy-item-main">${cls.icon} ${cls.name}</span>`;
      container.appendChild(item);
    }
  }
}

function renderTeammate(state) {
  if (state.matchFormat !== '2v2') {
    teammatePanelEl.classList.add('hidden');
    return;
  }

  teammatePanelEl.classList.remove('hidden');
  const boardUnits = state.board.flat().filter((u) => u?.team === 'blue' && u.ownerSeat === 1);
  const reserveUnits = filterUnitsBySeat(state.blueReserve, 1);
  const units = [...boardUnits, ...reserveUnits];

  renderUnitList(teammateListEl, units, {
    emptyHint: '隊友單位已空',
    interactive: false,
  });
}

function renderBattlePanels(state) {
  const showEnd = state.phase === 'gameEnd';

  reservePanelEl.classList.add('hidden');
  enemyPanelEl.classList.add('hidden');
  endPanelEl.classList.toggle('hidden', !showEnd);

  restartBtn.classList.toggle('hidden', state.phase !== 'gameEnd');

  if (showEnd) {
    endResultEl.textContent = state.message;
  }
}

function render(state) {
  syncTurnTimer(state);

  boardWrapEl.classList.toggle('blue-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  boardWrapEl.classList.toggle('red-turn', state.phase === 'battle' && state.currentPlayer === 'red');

  const inBattleFlow = state.phase !== 'roster';
  lobbyContentEl.classList.toggle('hidden', inBattleFlow);
  battleContentEl.classList.toggle('hidden', !inBattleFlow);

  if (state.phase !== lastPhase && inBattleFlow) {
    switchNav('battle');
  }
  lastPhase = state.phase;

  renderBattlePanels(state);
  renderLobbyFooter(state);

  const showBoard = inBattleFlow && activeNav === 'battle';
  board3d.setVisible(showBoard);

  if (showBoard) {
    board3d.sync(state);
  } else if (!inBattleFlow) {
    board3d.clear();
  }

  renderModePicker(state);
  renderClassPicker();
  renderTeammate(state);
}

bottomNavEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn || btn.disabled) return;
  switchNav(btn.dataset.nav);
  render(game.getState());
});

confirmRosterBtn.addEventListener('click', () => game.confirmBlueRoster());
restartBtn.addEventListener('click', () => game.restartSeries());

game.subscribe(render);
render(game.getState());
