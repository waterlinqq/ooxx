import { applyAttack, getTowerVolleyEndpoints } from './rules.js';

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** 從攻擊前的棋盤與 action 建立 3D 攻擊特效資料（與 game.resolveAttack 一致） */
export function buildAttackFx(board, action) {
  if (action?.type !== 'attack') return null;

  const unit = board.flat().find((u) => u?.id === action.unitId);
  const target = board[action.row]?.[action.col];
  if (!unit || !target || target.team === unit.team) return null;

  const boardCopy = cloneBoard(board);
  const unitCopy = boardCopy.flat().find((u) => u?.id === action.unitId);
  const targetCopy = boardCopy[action.row][action.col];

  const volleyEndpoints = unit.type === 'tower'
    ? getTowerVolleyEndpoints(boardCopy, unitCopy)
    : [];

  const result = applyAttack(boardCopy, unitCopy, targetCopy);
  const directKilledIds = new Set(result.killed.map((k) => k.id));

  return {
    from: { row: unit.row, col: unit.col },
    targets: result.hits.map((h) => ({
      row: h.row,
      col: h.col,
      killed: directKilledIds.has(h.id),
    })),
    team: unit.team,
    type: unit.type === 'support' ? 'melee' : unit.type === 'artillery' ? 'ranged' : unit.type,
    damage: unit.atk,
    volleyEndpoints,
    explosions: result.explosions ?? [],
  };
}
