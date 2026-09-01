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
const rosterLineupEl = document.getElementById('rosterLineup');
const classGridEl = document.getElementById('classGrid');
const actionPanelEl = document.getElementById('actionPanel');
const reservePanelEl = document.getElementById('reservePanel');
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

function startUnitDrag(e, unit, state) {
  if (state.phase !== 'battle' || state.currentPlayer !== 'blue' || state.animating) return;
  if (unit.team !== 'blue') return;
  if (state.actedUnitIds.includes(unit.id)) return;

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
          <div class="unit ${unit.team}${acted ? ' acted' : ''}">
            <div class="unit-icon-wrap"><span class="unit-icon">${cls.icon}</span></div>
            <div class="unit-name">${cls.name}</div>
            <div class="hp-bar"><div class="hp-fill" style="width:${hpPercent(unit)}%"></div></div>
            <div class="unit-hp">${unit.hp} / ${unit.maxHp}</div>
          </div>
        `;
        if (unit.team === 'blue' && !acted) {
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
    btn.textContent = mode.label;
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

function renderRosterLineup(state) {
  rosterLineupEl.innerHTML = '';
  const atMax = state.blueRoster.length >= state.rosterLimit;

  if (state.blueRoster.length === 0) {
    rosterLineupEl.innerHTML = '<div class="roster-lineup-empty">至大廳點選角色加入編組</div>';
  } else {
    state.blueRoster.forEach((classId, index) => {
      const cls = CLASSES[classId];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'roster-chip';
      chip.title = `${cls.name}（點擊移除）`;
      chip.textContent = cls.icon;
      chip.addEventListener('click', () => game.removeRosterUnitAt(index));
      rosterLineupEl.appendChild(chip);
    });
  }

  rosterLineupEl.classList.toggle('full', atMax);
}

function renderClassGrid(state) {
  classGridEl.innerHTML = '';
  const atMax = state.blueRoster.length >= state.rosterLimit;
  const counts = Object.fromEntries(Object.keys(CLASSES).map((id) => [id, 0]));
  for (const id of state.blueRoster) counts[id] += 1;

  for (const cls of Object.values(CLASSES)) {
    const count = counts[cls.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'class-card' + (count > 0 ? ' selected' : '');
    card.disabled = atMax;
    card.innerHTML = `
      <span class="class-icon">${cls.icon}</span>
      <span class="class-name">${cls.name}</span>
    `;
    card.addEventListener('click', () => game.addRosterUnit(cls.id));
    classGridEl.appendChild(card);
  }

  confirmRosterBtn.disabled = state.blueRoster.length === 0;
}

function renderReserve(state) {
  reserveListEl.innerHTML = '';
  const canPick = state.phase === 'battle' && state.currentPlayer === 'blue' && !state.animating;

  if (state.blueReserve.length === 0) {
    reserveListEl.innerHTML = '<div class="empty-hint">後備已空</div>';
    return;
  }

  for (const unit of state.blueReserve) {
    const cls = CLASSES[unit.classId];
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'reserve-item';
    if (state.selectedReserveId === unit.id) item.classList.add('selected');
    if (!canPick) item.classList.add('disabled');
    item.innerHTML = `<span>${cls.icon} ${cls.name}</span>`;
    item.addEventListener('click', () => {
      if (canPick) game.selectReserve(unit.id);
    });
    reserveListEl.appendChild(item);
  }
}

function renderEnemyStatus(state) {
  enemyListEl.innerHTML = '';

  const boardUnits = state.board.flat().filter((u) => u?.team === 'red');
  const reserveUnits = state.redReserve;
  const units = [...boardUnits, ...reserveUnits];

  if (units.length === 0) {
    enemyListEl.innerHTML = '<div class="empty-hint">已全滅</div>';
    return;
  }

  for (const unit of units) {
    const cls = CLASSES[unit.classId];
    const item = document.createElement('div');
    item.className = 'enemy-item';
    item.innerHTML = `<span class="enemy-item-main">${cls.icon} ${cls.name}</span>`;
    enemyListEl.appendChild(item);
  }
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

  actionPanelEl.classList.toggle('hidden', !inBattle || state.currentPlayer !== 'blue');
  const canEndTurn =
    inBattle &&
    state.currentPlayer === 'blue' &&
    !state.animating &&
    state.actionsRemaining > 0;
  endTurnBtn.classList.toggle('hidden', !canEndTurn);

  reservePanelEl.classList.toggle('hidden', !inBattle);
  enemyPanelEl.classList.toggle('hidden', !inBattle);
  endPanelEl.classList.toggle('hidden', !showEnd);

  nextRoundBtn.classList.toggle('hidden', state.phase !== 'roundEnd');
  restartBtn.classList.toggle('hidden', state.phase !== 'seriesEnd');
}

function renderLobbyPanels(state) {
  const inRoster = state.phase === 'roster';
  modePanelEl.classList.toggle('hidden', !inRoster);
  rosterLineupEl.classList.toggle('hidden', !inRoster);
  classGridEl.classList.toggle('hidden', !inRoster);
  confirmRosterBtn.classList.toggle('hidden', !inRoster);
}

function render(state) {
  blueScoreEl.textContent = `${TEAM.blue.name} ${state.blueScore} 勝`;
  redScoreEl.textContent = `${TEAM.red.name} ${state.redScore} 勝`;

  blueScoreEl.classList.toggle('active-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  redScoreEl.classList.toggle('active-turn', state.phase === 'battle' && state.currentPlayer === 'red');
  boardWrapEl.classList.toggle('blue-turn', state.phase === 'battle' && state.currentPlayer === 'blue');
  boardWrapEl.classList.toggle('red-turn', state.phase === 'battle' && state.currentPlayer === 'red');

  if (state.phase === 'roster') {
    roundBadgeEl.textContent = '編隊階段';
  } else if (state.phase === 'seriesEnd') {
    roundBadgeEl.textContent = '系列賽結束';
  } else {
    roundBadgeEl.textContent = `第 ${state.round} 局 · ${TEAM[state.currentPlayer].name}回合`;
  }

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
  renderRosterLineup(state);
  if (state.phase === 'roster') {
    renderClassGrid(state);
  }
  renderReserve(state);
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
