import { Game, CLASSES, TEAM, BOARD_MODES } from './game.js';
import { playAttackAnimation } from './animations.js';

const game = new Game();

const boardEl = document.getElementById('board');
const fxLayerEl = document.getElementById('fxLayer');
const boardWrapEl = document.querySelector('.board-wrap');
const layoutEl = document.getElementById('layout');
const blueScoreEl = document.getElementById('blueScore');
const redScoreEl = document.getElementById('redScore');
const roundBadgeEl = document.getElementById('roundBadge');
const tabBarEl = document.getElementById('tabBar');
const prepBodyEl = document.getElementById('prepBody');
const battleBodyEl = document.getElementById('battleBody');
const sidebarEl = document.getElementById('sidebar');
const classPickerEl = document.getElementById('classPicker');
const classDetailEl = document.getElementById('classDetail');
const actionPanelEl = document.getElementById('actionPanel');
const reservePanelEl = document.getElementById('reservePanel');
const reservePanelTitleEl = document.getElementById('reservePanelTitle');
const teammatePanelEl = document.getElementById('teammatePanel');
const teammateListEl = document.getElementById('teammateList');
const enemyPanelEl = document.getElementById('enemyPanel');
const endPanelEl = document.getElementById('endPanel');
const reserveListEl = document.getElementById('reserveList');
const enemyListEl = document.getElementById('enemyList');
const modePanelEl = document.getElementById('modePanel');
const modeButtonsEl = document.getElementById('modeButtons');
const confirmRosterBtn = document.getElementById('confirmRoster');
const nextRoundBtn = document.getElementById('nextRound');
const restartBtn = document.getElementById('restart');
const endTurnBtn = document.getElementById('endTurn');

const DRAG_THRESHOLD = 8;
let drag = null;
let activeTab = 'roster';
let selectedClassId = 'swordsman';

game.playAttackFx = (fx) => playAttackAnimation(boardEl, fxLayerEl, fx);

function hpPercent(unit) {
  return Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function isHighlighted(state, row, col) {
  const moves = new Set(state.validMoves.map(([r, c]) => cellKey(r, c)));
  const targets = new Set(state.validTargets.map(([r, c]) => cellKey(r, c)));
  const deploy = new Set(state.validDeploy.map(([r, c]) => cellKey(r, c)));
  const win = new Set((state.lastWinLine || []).map(([r, c]) => cellKey(r, c)));
  const key = cellKey(row, col);

  return {
    move: moves.has(key),
    attack: targets.has(key),
    deploy: deploy.has(key),
    win: win.has(key),
  };
}

function findCellAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest('.cell') ?? null;
}

function finishDrag(clientX, clientY) {
  if (!drag?.active) {
    drag = null;
    return;
  }

  const targetCell = findCellAt(clientX, clientY);
  if (targetCell) {
    game.dropOnCell(Number(targetCell.dataset.row), Number(targetCell.dataset.col));
  } else {
    game.cancelDrag();
  }
  drag = null;
}

function onDragPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.active && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
    drag.active = true;
    game.beginDragUnit(drag.unitId);
  }
}

function onDragPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;

  if (drag.active) {
    finishDrag(e.clientX, e.clientY);
  }
  drag = null;
  window.removeEventListener('pointermove', onDragPointerMove);
  window.removeEventListener('pointerup', onDragPointerUp);
  window.removeEventListener('pointercancel', onDragPointerUp);
}

function canControlUnit(state, unit) {
  if (state.phase !== 'battle' || state.animating) return false;
  if (unit.team !== 'blue') return false;
  if (state.actedUnitIds.includes(unit.id)) return false;
  if (!state.isHumanTurn) return false;
  if (state.matchFormat === '2v2') return unit.ownerSeat === 0;
  return true;
}

function startUnitDrag(e, unit, state) {
  if (!canControlUnit(state, unit)) return;

  drag = {
    unitId: unit.id,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    pointerId: e.pointerId,
  };

  window.addEventListener('pointermove', onDragPointerMove);
  window.addEventListener('pointerup', onDragPointerUp);
  window.addEventListener('pointercancel', onDragPointerUp);
}

function seatBadgeHtml(state, unit) {
  if (state.matchFormat !== '2v2' || unit.ownerSeat == null) return '';
  return `<div class="seat-badge">${unit.ownerSeat + 1}</div>`;
}

function renderBoard(state) {
  if (state.animating) return;

  boardEl.innerHTML = '';
  boardEl.dataset.size = String(state.boardSize);
  boardEl.style.gridTemplateColumns = `repeat(${state.boardSize}, 1fr)`;

  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);

      const hl = isHighlighted(state, r, c);
      if (hl.move) cell.classList.add('highlight-move');
      if (hl.attack) cell.classList.add('highlight-attack');
      if (hl.deploy) cell.classList.add('highlight-deploy');
      if (hl.win) cell.classList.add('win-line');

      const unit = state.board[r][c];
      if (unit) {
        const cls = CLASSES[unit.classId];
        const acted = state.actedUnitIds.includes(unit.id);
        cell.classList.add('has-unit', `team-${unit.team}`);
        if (acted) cell.classList.add('unit-acted');
        if (state.draggingUnitId === unit.id) cell.classList.add('dragging-source');
        cell.innerHTML = `
          <div class="team-badge">${unit.team === 'blue' ? '藍' : '紅'}</div>
          ${seatBadgeHtml(state, unit)}
          <div class="unit ${unit.team}${acted ? ' acted' : ''}">
            <div class="unit-icon-wrap"><span class="unit-icon">${cls.icon}</span></div>
            <div class="unit-name">${cls.name}</div>
            <div class="hp-bar"><div class="hp-fill" style="width:${hpPercent(unit)}%"></div></div>
            <div class="unit-hp">${unit.hp} / ${unit.maxHp}</div>
          </div>
        `;
        if (canControlUnit(state, unit)) {
          cell.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            startUnitDrag(e, unit, state);
          });
        }
      } else {
        cell.addEventListener('click', () => game.clickCell(r, c));
      }

      boardEl.appendChild(cell);
    }
  }
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

function renderClassPicker() {
  classPickerEl.innerHTML = '';

  for (const cls of Object.values(CLASSES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'class-pick-btn' + (cls.id === selectedClassId ? ' active' : '');
    btn.textContent = cls.icon;
    btn.title = cls.name;
    btn.addEventListener('click', () => {
      selectedClassId = cls.id;
      render(game.getState());
    });
    classPickerEl.appendChild(btn);
  }

  renderClassDetail(selectedClassId);
}

function renderLobbyPanels(state) {
  const inRoster = state.phase === 'roster';
  modePanelEl.classList.toggle('hidden', !inRoster);
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

function syncSidebarMode(state) {
  const inBattleFlow = state.phase !== 'roster';

  sidebarEl.classList.toggle('in-battle', inBattleFlow);
  tabBarEl.classList.toggle('hidden', inBattleFlow);
  prepBodyEl.classList.toggle('hidden', inBattleFlow);
  battleBodyEl.classList.toggle('hidden', !inBattleFlow);

  if (!inBattleFlow) {
    for (const btn of tabBarEl.querySelectorAll('.tab-btn')) {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    }
    for (const panel of prepBodyEl.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('active', panel.dataset.tab === activeTab);
    }
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

  reservePanelEl.classList.toggle('hidden', !inBattle);
  enemyPanelEl.classList.toggle('hidden', !inBattle);
  endPanelEl.classList.toggle('hidden', !showEnd);

  nextRoundBtn.classList.toggle('hidden', state.phase !== 'roundEnd');
  restartBtn.classList.toggle('hidden', state.phase !== 'seriesEnd');
}

function formatRoundBadge(state) {
  if (state.phase === 'roster') return '編隊階段';
  if (state.phase === 'seriesEnd') {
    return state.seriesFormat === 'single' ? '對戰結束' : '系列賽結束';
  }
  if (state.matchFormat === '2v2') {
    const suffix = state.isHumanTurn ? ' · 你的回合' : ' · AI 思考中';
    return `${state.slotLabel} 回合${suffix}`;
  }
  return `第 ${state.round} 局 · ${TEAM[state.currentPlayer].name}回合`;
}

function renderScoreBar(state) {
  const isSingle = state.seriesFormat === 'single';
  blueScoreEl.classList.toggle('hidden', isSingle);
  redScoreEl.classList.toggle('hidden', isSingle);

  if (isSingle) {
    if (state.phase === 'roster') {
      roundBadgeEl.textContent = '編隊階段';
    } else {
      roundBadgeEl.textContent = formatRoundBadge(state);
    }
    return;
  }

  blueScoreEl.textContent = `${TEAM.blue.name} ${state.blueScore} 勝`;
  redScoreEl.textContent = `${TEAM.red.name} ${state.redScore} 勝`;
  roundBadgeEl.textContent = formatRoundBadge(state);
}

function render(state) {
  renderScoreBar(state);

  blueScoreEl.classList.toggle('active-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  redScoreEl.classList.toggle('active-turn', state.phase === 'battle' && state.currentPlayer === 'red');
  boardWrapEl.classList.toggle('blue-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  boardWrapEl.classList.toggle('red-turn', state.phase === 'battle' && state.currentPlayer === 'red');

  syncSidebarMode(state);
  renderLobbyPanels(state);
  renderBattlePanels(state);

  const inBattleFlow = state.phase !== 'roster';
  const showBoard = inBattleFlow;
  boardWrapEl.classList.toggle('hidden', !showBoard);
  layoutEl.classList.toggle('no-board', !showBoard);

  if (showBoard) {
    renderBoard(state);
  } else {
    boardEl.innerHTML = '';
  }

  renderModePicker(state);
  renderClassPicker();
  renderReserve(state);
  renderTeammate(state);
  renderEnemyStatus(state);
}

tabBarEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  render(game.getState());
});

confirmRosterBtn.addEventListener('click', () => game.confirmBlueRoster());
nextRoundBtn.addEventListener('click', () => game.nextRound());
restartBtn.addEventListener('click', () => game.restartSeries());
endTurnBtn.addEventListener('click', () => game.endTurnEarly());

game.subscribe(render);
render(game.getState());
