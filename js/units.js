export const CLASSES = {
  archer: {
    id: 'archer',
    name: '弓箭手',
    icon: '🏹',
    hp: 3,
    atk: 1,
    range: 3,
    type: 'ranged',
    desc: '遠程攻擊，生命值低',
  },
  shield: {
    id: 'shield',
    name: '盾牌手',
    icon: '🛡️',
    hp: 8,
    atk: 1,
    range: 1,
    type: 'melee',
    desc: '生命值極高，近戰',
  },
  swordsman: {
    id: 'swordsman',
    name: '劍士',
    icon: '⚔️',
    hp: 5,
    atk: 3,
    range: 1,
    type: 'melee',
    desc: '近戰高傷害',
  },
  mage: {
    id: 'mage',
    name: '魔法師',
    icon: '🔮',
    hp: 4,
    atk: 2,
    range: 3,
    type: 'mage',
    desc: '任意角度穿透，傷害低',
  },
  assassin: {
    id: 'assassin',
    name: '刺客',
    icon: '🗡️',
    hp: 2,
    atk: 1,
    range: 1,
    jumpMove: true,
    type: 'melee',
    desc: '低血低攻，可跳躍至棋盤任意空格',
  },
};

export const TEAM = {
  blue: { id: 'blue', name: '藍隊', color: '#3b82f6', light: '#dbeafe' },
  red: { id: 'red', name: '紅隊', color: '#ef4444', light: '#fee2e2' },
};

export const ROSTER_LIMITS = {
  total: 8,
};

export function createUnit(classId, teamId) {
  const cls = CLASSES[classId];
  return {
    id: `${teamId}-${classId}-${Math.random().toString(36).slice(2, 8)}`,
    classId,
    team: teamId,
    hp: cls.hp,
    maxHp: cls.hp,
    atk: cls.atk,
    range: cls.range,
    moveRange: cls.moveRange ?? 1,
    jumpMove: cls.jumpMove ?? false,
    type: cls.type,
    row: -1,
    col: -1,
  };
}

export function createEmptyBoard() {
  return Array.from({ length: 3 }, () => Array(3).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}
