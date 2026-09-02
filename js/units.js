export const CLASSES = {
  archer: {
    id: 'archer',
    name: '弓箭手',
    icon: '🏹',
    hp: 3,
    atk: 3,
    range: 3,
    type: 'ranged',
    desc: '八方向射線，首個敵方，不可繞過',
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
    desc: '八方向光束穿透，傷害低',
  },
  assassin: {
    id: 'assassin',
    name: '刺客',
    icon: '🗡️',
    hp: 4,
    atk: 2,
    range: 1,
    jumpMove: true,
    jumpRange: 2,
    type: 'melee',
    desc: '低血低攻，可跳躍至周遭兩格',
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

// Board size drives everything else. Two constraints hold across every mode:
//   actionsPerTurn < size, or a team could lay a whole winning line uninterrupted.
//   actionsPerTurn >= 2 once the board saturates, or opening a cell (attack) and
//   claiming it (deploy/move) can never happen before the defender refills it.
// 3x3 opts out of the second one by keeping the roster small enough that the board
// never locks up, which is what makes 1 action per turn playable there.
export const BOARD_MODES = {
  '3x3': {
    id: '3x3',
    label: '九宮格',
    size: 3,
    matchFormat: '1v1',
    actionsPerTurn: 1,
    turnDurationMs: 10000,
    turnBonusMs: 0,
    // Four a side is the largest roster that still leaves the 9 cells un-fillable, which
    // is what keeps a single action per turn viable. AI self-play shows the cliff either
    // side of it: at five a side every game ends by attrition instead of a line, and
    // swapping the mage for the bomber deadlocks the board outright.
    roster: ['swordsman', 'archer', 'shield', 'mage'],
  },
  '4x4': {
    id: '4x4',
    label: '十六宮格',
    size: 4,
    matchFormat: '1v1',
    actionsPerTurn: 2,
    turnDurationMs: 15000,
    turnBonusMs: 5000,
    roster: [
      'swordsman', 'swordsman', 'archer', 'archer', 'shield',
      'shield', 'mage', 'assassin', 'assassin', 'bomber',
    ],
  },
  '5x5': {
    id: '5x5',
    label: '二十五宮格',
    size: 5,
    matchFormat: '2v2',
    actionsPerTurn: 2,
    turnDurationMs: 18000,
    turnBonusMs: 5000,
    // Longest distance is 4, so range-3 units no longer reach everywhere and mobility
    // matters most — hence the extra assassins. Ordered so the alternating 2v2 seat
    // split in createTeamReserve hands each player a comparable mix.
    roster: [
      'swordsman', 'swordsman', 'swordsman', 'archer', 'archer',
      'archer', 'shield', 'shield', 'mage', 'mage',
      'assassin', 'assassin', 'assassin', 'bomber',
    ],
  },
};

export const SLOT_ORDER = ['blue-0', 'red-0', 'blue-1', 'red-1'];

export function getBoardMode(modeId) {
  return BOARD_MODES[modeId] ?? BOARD_MODES['3x3'];
}

export function getModeRoster(modeId) {
  return getBoardMode(modeId).roster;
}

export function getRosterLimit(modeId) {
  return getBoardMode(modeId).roster.length;
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
    jumpRange: cls.jumpRange ?? null,
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
  // Alternating seats keeps both 2v2 players on a comparable class mix even though the
  // roster is written grouped by class; splitting it in half would give one player all
  // the swordsmen and the other all the assassins.
  return roster.map((classId, index) => {
    const ownerSeat = matchFormat === '2v2' ? index % 2 : null;
    return createUnit(classId, teamId, ownerSeat);
  });
}

export function createEmptyBoard(size = 3) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}
