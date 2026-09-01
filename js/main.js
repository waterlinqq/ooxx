import { Game, CLASSES, TEAM, BOARD_MODES } from './game.js';
import { playAttackAnimation } from './animations.js';

const game = new Game();

const boardEl = document.getElementById('board');
const fxLayerEl = document.getElementById('fxLayer');
const boardWrapEl = document.querySelector('.board-wrap');
const messageEl = document.getElementById('message');
const blueScoreEl = document.getElementById('blueScore');
const redScoreEl = document.getElementById('redScore');
const roundBadgeEl = document.getElementById('roundBadge');
const rosterPanelEl = document.getElementById('rosterPanel');
const actionPanelEl = document.getElementById('actionPanel');
const reservePanelEl = document.getElementById('reservePanel');
const enemyPanelEl = document.getElementById('enemyPanel');
const endPanelEl = document.getElementById('endPanel');
const classGridEl = document.getElementById('classGrid');
const rosterCountEl = document.getElementById('rosterCount');
const reserveListEl = document.getElementById('reserveList');
const blueReserveCountEl = document.getElementById('blueReserveCount');
const enemyTotalCountEl = document.getElementById('enemyTotalCount');
const enemySummaryEl = document.getElementById('enemySummary');
const enemyListEl = document.getElementById('enemyList');
const modePanelEl = document.getElementById('modePanel');
const modeButtonsEl = document.getElementById('modeButtons');
const confirmRosterBtn = document.getElementById('confirmRoster');
const nextRoundBtn = document.getElementById('nextRound');
const restartBtn = document.getElementById('restart');

const DRAG_THRESHOLD = 8;
let drag = null;

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
        cell.classList.add('has-unit', `team-${unit.team}`);
        if (state.draggingUnitId === unit.id) cell.classList.add('dragging-source');
        cell.innerHTML = `
          <div class="team-badge">${unit.team === 'blue' ? '藍' : '紅'}</div>
          <div class="unit ${unit.team}">
            <div class="unit-icon-wrap"><span class="unit-icon">${cls.icon}</span></div>
            <div class="unit-name">${cls.name}</div>
            <div class="hp-bar"><div class="hp-fill" style="width:${hpPercent(unit)}%"></div></div>
            <div class="unit-hp">${unit.hp} / ${unit.maxHp}</div>
          </div>
        `;
        if (unit.team === 'blue') {
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

function renderClassGrid(state) {
  classGridEl.innerHTML = '';
  const atMax = state.blueRoster.length >= state.rosterLimit;

  for (const cls of Object.values(CLASSES)) {
    const count = state.blueRoster.filter((id) => id === cls.id).length;
    const card = document.createElement('div');
    card.className = 'class-card' + (count > 0 ? ' selected' : '');
    card.innerHTML = `
      <div class="top"><span>${cls.icon}</span><span>${cls.name}</span></div>
      <div class="stats">HP ${cls.hp} · ATK ${cls.atk}<br />${cls.desc}</div>
      <div class="roster-controls">
        <button type="button" class="btn small" data-minus="${cls.id}" ${count === 0 ? 'disabled' : ''}>−</button>
        <span class="count">${count}</span>
        <button type="button" class="btn small" data-plus="${cls.id}" ${atMax ? 'disabled' : ''}>+</button>
      </div>
    `;
    card.querySelector(`[data-plus="${cls.id}"]`).addEventListener('click', (e) => {
      e.stopPropagation();
      game.addRosterUnit(cls.id);
    });
    card.querySelector(`[data-minus="${cls.id}"]`).addEventListener('click', (e) => {
      e.stopPropagation();
      game.removeRosterUnit(cls.id);
    });
    classGridEl.appendChild(card);
  }
  rosterCountEl.textContent = `${state.blueRoster.length} / ${state.rosterLimit}`;
  confirmRosterBtn.disabled = state.blueRoster.length === 0;
}

function renderUnitStatusItem(unit, location) {
  const cls = CLASSES[unit.classId];
  const item = document.createElement('div');
  item.className = 'enemy-item';
  const locationLabel = location === 'board' ? '棋盤' : '後備';
  item.innerHTML = `
    <span class="enemy-item-main">${cls.icon} ${cls.name}</span>
    <span class="enemy-item-meta">${locationLabel} · HP ${unit.hp}/${unit.maxHp}</span>
  `;
  return item;
}

function renderReserve(state) {
  reserveListEl.innerHTML = '';
  const canPick = state.phase === 'battle' && state.currentPlayer === 'blue' && !state.animating;
  blueReserveCountEl.textContent = `(${state.blueReserve.length})`;

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
    item.innerHTML = `<span>${cls.icon} ${cls.name}</span><span>HP ${cls.hp}</span>`;
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
  const total = boardUnits.length + reserveUnits.length;

  enemyTotalCountEl.textContent = `(${total})`;
  enemySummaryEl.innerHTML = `
    <span>棋盤 <strong>${boardUnits.length}</strong></span>
    <span>後備 <strong>${reserveUnits.length}</strong></span>
  `;

  if (total === 0) {
    enemyListEl.innerHTML = '<div class="empty-hint">已全滅</div>';
    return;
  }

  for (const unit of boardUnits) {
    enemyListEl.appendChild(renderUnitStatusItem(unit, 'board'));
  }
  for (const unit of reserveUnits) {
    enemyListEl.appendChild(renderUnitStatusItem(unit, 'reserve'));
  }
}

function render(state) {
  messageEl.textContent = state.message;
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

  rosterPanelEl.classList.toggle('hidden', state.phase !== 'roster');
  modePanelEl.classList.toggle('hidden', state.phase !== 'roster');
  actionPanelEl.classList.toggle('hidden', state.phase !== 'battle' || state.currentPlayer !== 'blue');
  reservePanelEl.classList.toggle('hidden', state.phase !== 'battle');
  enemyPanelEl.classList.toggle('hidden', state.phase !== 'battle');
  endPanelEl.classList.toggle('hidden', state.phase !== 'roundEnd' && state.phase !== 'seriesEnd');

  nextRoundBtn.classList.toggle('hidden', state.phase !== 'roundEnd');
  restartBtn.classList.toggle('hidden', state.phase !== 'seriesEnd');

  renderBoard(state);
  renderModePicker(state);
  renderClassGrid(state);
  renderReserve(state);
  renderEnemyStatus(state);
}

confirmRosterBtn.addEventListener('click', () => game.confirmBlueRoster());
nextRoundBtn.addEventListener('click', () => game.nextRound());
restartBtn.addEventListener('click', () => game.restartSeries());

game.subscribe(render);
render(game.getState());
