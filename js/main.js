import { Game, CLASSES, TEAM, BOARD_MODES } from './game.js';
import { BoardScene } from './board3d/BoardScene.js';

const game = new Game();

const boardCanvasHost = document.getElementById('boardCanvas');
const fxLayerEl = document.getElementById('fxLayer');
const boardWrapEl = document.querySelector('.board-wrap');
const lobbyContentEl = document.getElementById('lobbyContent');
const battleContentEl = document.getElementById('battleContent');
const blueScoreEl = document.getElementById('blueScore');
const redScoreEl = document.getElementById('redScore');
const roundBadgeEl = document.getElementById('roundBadge');
const classPickerEl = document.getElementById('classPicker');
const classDetailEl = document.getElementById('classDetail');
const actionPanelEl = document.getElementById('actionPanel');
const reservePanelEl = document.getElementById('reservePanel');
const reservePanelTitleEl = document.getElementById('reservePanelTitle');
const teammatePanelEl = document.getElementById('teammatePanel');
const teammateListEl = document.getElementById('teammateList');
const enemyPanelEl = document.getElementById('enemyPanel');
const endPanelEl = document.getElementById('endPanel');
const endResultEl = document.getElementById('endResult');
const reserveListEl = document.getElementById('reserveList');
const enemyListEl = document.getElementById('enemyList');
const modeButtonsEl = document.getElementById('modeButtons');
const confirmRosterBtn = document.getElementById('confirmRoster');
const nextRoundBtn = document.getElementById('nextRound');
const restartBtn = document.getElementById('restart');
const endTurnBtn = document.getElementById('endTurn');
const phaseChipEl = document.getElementById('phaseChip');
const turnBadgeEl = document.getElementById('turnBadge');
const bottomNavEl = document.getElementById('bottomNav');

const NAV_SCREENS = {
  battle: document.getElementById('screenBattle'),
  characters: document.getElementById('screenCharacters'),
  bag: document.getElementById('screenBag'),
  shop: document.getElementById('screenShop'),
};

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
  if (cls.jumpMove) return '可跳躍至任意空格';
  if (cls.type === 'mage') return '任意角度穿透攻擊';
  if (cls.type === 'ranged') return `遠程 · 射程 ${cls.range}`;
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
    const subtitle =
      mode.matchFormat === '2v2'
        ? '2v2 單局'
        : mode.seriesFormat === 'best_of_3'
          ? '三戰兩勝'
          : '';
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

function renderReserve(state) {
  const canPick = state.isHumanTurn;
  const is2v2 = state.matchFormat === '2v2';
  reservePanelTitleEl.textContent = is2v2 ? '藍1 後備' : '藍隊後備';

  const reserveUnits = is2v2 ? filterUnitsBySeat(state.blueReserve, 0) : state.blueReserve;
  renderUnitList(reserveListEl, reserveUnits, {
    emptyHint: '後備已空',
    interactive: true,
    canPick,
    selectedId: state.selectedReserveId,
    onSelect: (unitId) => game.selectReserve(unitId),
  });
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

function renderEnemyStatus(state) {
  enemyListEl.innerHTML = '';

  if (state.matchFormat === '2v2') {
    for (const seat of [0, 1]) {
      const boardUnits = state.board.flat().filter((u) => u?.team === 'red' && u.ownerSeat === seat);
      const reserveUnits = filterUnitsBySeat(state.redReserve, seat);
      const units = [...boardUnits, ...reserveUnits];
      const section = document.createElement('div');
      section.className = 'enemy-section';
      section.innerHTML = `<h3 class="enemy-section-title">紅${seat + 1}</h3>`;
      const list = document.createElement('div');
      list.className = 'enemy-section-list';
      renderUnitList(list, units, { emptyHint: '已全滅' });
      section.appendChild(list);
      enemyListEl.appendChild(section);
    }
    return;
  }

  const boardUnits = state.board.flat().filter((u) => u?.team === 'red');
  const reserveUnits = state.redReserve;
  const units = [...boardUnits, ...reserveUnits];
  renderUnitList(enemyListEl, units, { emptyHint: '已全滅' });
}

function renderPhaseChip(state) {
  phaseChipEl.classList.remove('phase-roster', 'phase-battle', 'phase-end');

  if (state.phase === 'roster') {
    phaseChipEl.textContent = '準備中';
    phaseChipEl.classList.add('phase-roster');
  } else if (state.phase === 'battle') {
    phaseChipEl.textContent = state.isHumanTurn ? '對戰中 · 你的回合' : '對戰中 · AI';
    phaseChipEl.classList.add('phase-battle');
  } else {
    phaseChipEl.textContent = state.phase === 'seriesEnd' ? '系列賽結束' : '本局結束';
    phaseChipEl.classList.add('phase-end');
  }
}

function renderBattlePanels(state) {
  const inBattle = state.phase === 'battle';
  const showEnd = state.phase === 'roundEnd' || state.phase === 'seriesEnd';

  actionPanelEl.classList.toggle('hidden', !inBattle || !state.isHumanTurn);
  const canEndTurn =
    inBattle &&
    state.isHumanTurn &&
    !state.animating &&
    state.actionsRemaining > 0;
  endTurnBtn.classList.toggle('hidden', !canEndTurn);

  if (inBattle && state.isHumanTurn) {
    turnBadgeEl.textContent = state.matchFormat === '2v2' ? state.slotLabel : TEAM.blue.name;
  }

  reservePanelEl.classList.toggle('hidden', !inBattle);
  enemyPanelEl.classList.toggle('hidden', !inBattle);
  endPanelEl.classList.toggle('hidden', !showEnd);

  nextRoundBtn.classList.toggle('hidden', state.phase !== 'roundEnd');
  restartBtn.classList.toggle('hidden', state.phase !== 'seriesEnd');

  if (showEnd) {
    endResultEl.textContent = state.message;
  }
}

function formatRoundBadge(state) {
  if (state.phase === 'roster') return '準備階段';
  if (state.phase === 'seriesEnd') {
    return state.seriesFormat === 'single' ? '對戰結束' : '系列賽結束';
  }
  if (state.matchFormat === '2v2') {
    const suffix = state.isHumanTurn ? ' · 你的回合' : ' · AI';
    return `${state.slotLabel} 回合${suffix}`;
  }
  return `第 ${state.round} 局 · ${TEAM[state.currentPlayer].name}回合`;
}

function renderScoreBar(state) {
  const isSingle = state.seriesFormat === 'single';
  blueScoreEl.classList.toggle('hidden', isSingle);
  redScoreEl.classList.toggle('hidden', isSingle);

  if (isSingle) {
    roundBadgeEl.textContent = formatRoundBadge(state);
    return;
  }

  blueScoreEl.textContent = `${TEAM.blue.name} ${state.blueScore} 勝`;
  redScoreEl.textContent = `${TEAM.red.name} ${state.redScore} 勝`;
  roundBadgeEl.textContent = formatRoundBadge(state);
}

function render(state) {
  renderPhaseChip(state);
  renderScoreBar(state);

  blueScoreEl.classList.toggle('active-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  redScoreEl.classList.toggle('active-turn', state.phase === 'battle' && state.currentPlayer === 'red');
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
  renderReserve(state);
  renderTeammate(state);
  renderEnemyStatus(state);
}

bottomNavEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn || btn.disabled) return;
  switchNav(btn.dataset.nav);
  render(game.getState());
});

confirmRosterBtn.addEventListener('click', () => game.confirmBlueRoster());
nextRoundBtn.addEventListener('click', () => game.nextRound());
restartBtn.addEventListener('click', () => game.restartSeries());
endTurnBtn.addEventListener('click', () => game.endTurnEarly());

game.subscribe(render);
render(game.getState());
