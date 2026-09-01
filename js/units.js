export const CLASSES = {
  archer: {
    id: 'archer',
    name: '弓箭手',
    icon: '🏹',
    hp: 3,
    atk: 3,
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
    hp: 4,
    atk: 2,
    range: 1,
    jumpMove: true,
    type: 'melee',
    desc: '低血低攻，可跳躍至棋盤任意空格',
  },
  bomber: {
    id: 'bomber',
    name: '炸彈兵',
    icon: '💣',
    hp: 3,
    atk: 2,
    range: 1,
    type: 'melee',
    deathExplosion: 2,
    desc: '近戰，被擊殺時自爆反擊相鄰敵人',
  },
};

export const TEAM = {
  blue: { id: 'blue', name: '藍隊', color: '#3b82f6', light: '#dbeafe' },
  red: { id: 'red', name: '紅隊', color: '#ef4444', light: '#fee2e2' },
};

export const BOARD_MODES = {
  '3x3': {
    id: '3x3',
    label: '九宮格',
    size: 3,
    rosterTotal: 8,
    seriesFormat: 'best_of_3',
    matchFormat: '1v1',
    actionsPerTurn: 2,
  },
  '4x4': {
    id: '4x4',
    label: '十六宮格',
    size: 4,
    rosterTotal: 12,
    seriesFormat: 'best_of_3',
    matchFormat: '1v1',
    actionsPerTurn: 2,
  },
  '5x5': {
    id: '5x5',
    label: '二十五宮格',
    size: 5,
    rosterTotal: 8,
    seriesFormat: 'single',
    matchFormat: '2v2',
    actionsPerTurn: 1,
  },
};

export const SLOT_ORDER = ['blue-0', 'red-0', 'blue-1', 'red-1'];

export const FIXED_ROSTER = [
  'swordsman', 'archer', 'shield', 'mage',
  'assassin', 'bomber', 'swordsman', 'archer',
];

export function getBoardMode(modeId) {
  return BOARD_MODES[modeId] ?? BOARD_MODES['3x3'];
}

export function getRosterLimit(modeId) {
  return getBoardMode(modeId).rosterTotal;
}

export function createUnit(classId, teamId, ownerSeat = null) {
  const cls = CLASSES[classId];
  return {
    id: `${teamId}-${classId}-${Math.random().toString(36).slice(2, 8)}`,
    classId,
    team: teamId,
    ownerSeat,
    hp: cls.hp,
    maxHp: cls.hp,
    atk: cls.atk,
    range: cls.range,
    moveRange: cls.moveRange ?? 1,
    jumpMove: cls.jumpMove ?? false,
    deathExplosion: cls.deathExplosion ?? 0,
    type: cls.type,
    row: -1,
    col: -1,
  };
}

export function parseSlot(slot) {
  const [team, seat] = slot.split('-');
  return { team, seat: Number(seat) };
}

export function formatSlotLabel(slot) {
  const { team, seat } = parseSlot(slot);
  const teamName = team === 'blue' ? '藍' : '紅';
  return `${teamName}${seat + 1}`;
}

export function createTeamReserve(roster, teamId, matchFormat = '1v1') {
  const half = Math.ceil(roster.length / 2);
  return roster.map((classId, index) => {
    const ownerSeat = matchFormat === '2v2' ? (index < half ? 0 : 1) : null;
    return createUnit(classId, teamId, ownerSeat);
  });
}

export function createEmptyBoard(size = 3) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}
