import { BoardScene } from '../js/board3d/BoardScene.js';

const host = document.getElementById('boardCanvas');
const fxLayer = document.getElementById('fxLayer');

const scene = new BoardScene(host, fxLayer, {
  onCellClick: () => {},
  onUnitDragStart: () => {},
  onUnitDragEnd: () => {},
  onUnitDragMove: () => {},
  onPointerMove: () => {},
});

function makeMapProps(boardSize, enabled) {
  if (!enabled) return null;
  const props = Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
  props[1][1] = { kind: 'stone' };
  props[1][2] = { kind: 'potion' };
  props[2][1] = { kind: 'spikes' };
  if (boardSize > 3) props[2][2] = { kind: 'flag' };
  return props;
}

function survivalMapProps(size) {
  const props = Array.from({ length: size }, () => Array(size).fill(null));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === 0 || r === size - 1 || c === 0 || c === size - 1) {
        props[r][c] = { kind: 'stone' };
      }
    }
  }
  return props;
}

function makeState(boardSize, withUnits, extras = false, survival = false) {
  const board = Array.from({ length: boardSize }, () => Array(boardSize).fill(null));

  if (withUnits) {
    const r0 = survival ? 1 : 0;
    const c0 = survival ? 1 : 0;
    const r1 = survival ? boardSize - 2 : boardSize - 1;
    const c1 = survival ? boardSize - 2 : boardSize - 1;
    board[r0][c0] = { id: 'u1', classId: 'swordsman', team: 'blue', hp: 8, maxHp: 8 };
    board[r0][c0 + 1] = { id: 'u2', classId: 'archer', team: 'blue', hp: 6, maxHp: 6 };
    board[r1][c1] = { id: 'u3', classId: 'swordsman', team: 'red', hp: 8, maxHp: 8 };
    board[r1][c0] = { id: 'u4', classId: 'mage', team: 'red', hp: 5, maxHp: 5 };
  }

  return {
    boardSize,
    board,
    boardMode: survival ? '6x6' : `${boardSize}x${boardSize}`,
    isSurvivalMode: survival,
    phase: 'battle',
    currentPlayer: 'blue',
    animating: false,
    actedUnitIds: [],
    draggingUnitId: null,
    inspectedUnitId: null,
    mapProps: survival ? survivalMapProps(boardSize) : makeMapProps(boardSize, extras),
    pendingBombs: [],
    pendingLandmines: [],
    shadowClones: [],
    showLandmines: true,
    tutorialPointer: null,
    validMoves: extras ? [[0, 2], [1, 0]] : [],
    validRecycleMoves: [],
    validTargets: extras ? [[boardSize - 1, boardSize - 1]] : [],
    validDeploy: [],
    validItemTargets: [],
    lastWinLine: [],
  };
}

window.__PREVIEW__ = {
  render(boardSize, withUnits = true, extras = false, survival = false) {
    scene.sync(makeState(boardSize, withUnits, extras, survival));
    scene.onResize();
  },
};

window.__PREVIEW__.render(4, true);
window.__PREVIEW_READY__ = true;
