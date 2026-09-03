export const CLASSES = {
  archer: {
    id: 'archer',
    name: '弓箭手',
    icon: '🏹',
    hp: 3,
    atk: 3,
    range: 3,
    type: 'ranged',
    desc: '上下左右射線，首個敵方，不可繞過',
  },
  artillery: {
    id: 'artillery',
    name: '砲兵',
    icon: '💥',
    hp: 3,
    atk: 4,
    range: 2,
    minRange: 2,
    type: 'artillery',
    desc: '上下左右第二格遠程轟擊，無法近戰',
  },
  tower: {
    id: 'tower',
    name: '箭塔',
    icon: '🏰',
    hp: 2,
    atk: 2,
    range: 3,
    moveRange: 0,
    type: 'tower',
    desc: '無法移動；攻擊時同時向上下左右射箭，各命中首個敵方',
  },
  shield: {
    id: 'shield',
    name: '盾牌手',
    icon: '🛡️',
    hp: 8,
    atk: 1,
    range: 1,
    type: 'melee',
    desc: '生命值極高，可攻擊上下左右相鄰格',
  },
  swordsman: {
    id: 'swordsman',
    name: '劍士',
    icon: '⚔️',
    hp: 5,
    atk: 3,
    range: 1,
    type: 'melee',
    desc: '上下左右近戰高傷害',
  },
  mage: {
    id: 'mage',
    name: '魔法師',
    icon: '🔮',
    hp: 4,
    atk: 2,
    // Unused: the beam pierces every enemy on the ray to the board edge, so
    // getEnemiesOnLine deliberately ignores range. Kept only for UI symmetry.
    range: 3,
    type: 'mage',
    desc: '上下左右光束穿透，傷害低',
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
    desc: '上下左右近戰，可跳躍至周遭兩格',
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
    desc: '八向近戰，被擊殺時自爆反擊相鄰敵人',
  },
  eagle: {
    id: 'eagle',
    name: '老鷹',
    icon: '🦅',
    hp: 1,
    atk: 2,
    range: 1,
    moveRange: Infinity,
    type: 'melee',
    desc: '上下左右近戰，可移動至任意可到達的空格',
  },
  priest: {
    id: 'priest',
    name: '牧師',
    icon: '✨',
    hp: 2,
    atk: 1,
    range: 1,
    type: 'support',
    passiveBlessing: true,
    desc: '上下左右近戰；我方任一單位行動後，使祝福範圍內友軍恢復 1 生命',
  },
  ghost: {
    id: 'ghost',
    name: '幽魂',
    icon: '👻',
    hp: 2,
    atk: 2,
    range: 1,
    type: 'melee',
    possessionOnKill: true,
    desc: '上下左右近戰；擊殺敵人時附身該單位成為友軍（繼承對方攻擊，生命為幽魂剩餘生命）',
  },
  viper: {
    id: 'viper',
    name: '毒蛇',
    icon: '🐍',
    hp: 1,
    atk: 1,
    range: 1,
    type: 'melee',
    poisonOnHit: true,
    desc: '上下左右近戰；命中使敵人中毒（攻擊-1，每回合結束扣 1 血，不可疊加）',
  },
};

export const TEAM = {
  blue: { id: 'blue', name: '藍隊', color: '#3b82f6', light: '#dbeafe' },
  red: { id: 'red', name: '紅隊', color: '#ef4444', light: '#fee2e2' },
};

// 2v2 seat tint: self blue, ally purple, enemies red and orange.
export const SEAT_COLORS = {
  'blue-0': '#3b82f6',
  'blue-1': '#9333ea',
  'red-0': '#ef4444',
  'red-1': '#f97316',
};

export function resolveUnitColor(team, ownerSeat = null, matchFormat = '1v1') {
  if (matchFormat === '2v2' && ownerSeat != null) {
    return SEAT_COLORS[`${team}-${ownerSeat}`] ?? TEAM[team].color;
  }
  return TEAM[team].color;
}

// Board size drives everything else. Two constraints hold across every mode:
//   actionsPerTurn < size, or a team could lay a whole winning line uninterrupted.
//   actionsPerTurn >= 2 once the board saturates, or opening a cell (attack) and
//   claiming it (deploy/move) can never happen before the defender refills it.
// 3x3 opts out of the second one by keeping the roster small enough that the board
// never locks up, which is what makes 1 action per turn playable there.
//
// `roster` is the preset lineup used by simulations and as the fallback when no team
// has been picked; live matches build their own from rosterSize / maxPerClass.
export const BOARD_MODES = {
  '3x3': {
    id: '3x3',
    label: '九宮格',
    size: 3,
    matchFormat: '1v1',
    actionsPerTurn: 1,
    turnDurationMs: 10000,
    turnBonusMs: 0,
    matchDurationMs: 5 * 60 * 1000,
    // Four a side is the largest roster that still leaves the 9 cells un-fillable, which
    // is what keeps a single action per turn viable. AI self-play shows the cliff either
    // side of it: at five a side every game ends by attrition instead of a line, and
    // swapping the mage for the bomber deadlocks the board outright.
    rosterSize: 4,
    maxPerClass: 2,
    roster: ['swordsman', 'archer', 'shield', 'mage'],
  },
  '4x4': {
    id: '4x4',
    label: '十六宮格',
    size: 4,
    matchFormat: '1v1',
    actionsPerTurn: 1,
    turnDurationMs: 15000,
    turnBonusMs: 5000,
    matchDurationMs: 8 * 60 * 1000,
    rosterSize: 10,
    maxPerClass: 4,
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
    // 2v2 passes the board to the next seat after every single action, so a seat only
    // ever gets one. The constraints above are still satisfied: a team gets two actions
    // per round across its two seats, with an opposing seat acting in between.
    actionsPerTurn: 1,
    turnDurationMs: 18000,
    turnBonusMs: 5000,
    matchDurationMs: 10 * 60 * 1000,
    rosterSize: 14,
    maxPerClass: 5,
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

export const CLASS_IDS = Object.keys(CLASSES);

export const SLOT_ORDER = ['blue-0', 'red-0', 'blue-1', 'red-1'];

export function getBoardMode(modeId) {
  return BOARD_MODES[modeId] ?? BOARD_MODES['3x3'];
}

export function getRosterLimit(modeId) {
  const mode = getBoardMode(modeId);
  return mode.rosterSize ?? mode.roster.length;
}

export function getMaxPerClass(modeId) {
  const mode = getBoardMode(modeId);
  return mode.maxPerClass ?? getRosterLimit(modeId);
}

// Grouping duplicates together matters: createTeamReserve splits a 2v2 roster by
// alternating index, so adjacent duplicates land one per seat instead of piling every
// copy of a class onto the same player.
export function sortRosterByClass(roster) {
  return [...roster].sort((a, b) => CLASS_IDS.indexOf(a) - CLASS_IDS.indexOf(b));
}

export function countRosterClasses(roster) {
  const counts = {};
  for (const classId of roster) {
    counts[classId] = (counts[classId] ?? 0) + 1;
  }
  return counts;
}

export function canAddToRoster(roster, classId, modeId) {
  if (!CLASSES[classId]) return false;
  if (roster.length >= getRosterLimit(modeId)) return false;
  const used = roster.filter((id) => id === classId).length;
  return used < getMaxPerClass(modeId);
}

export function createRandomRoster(modeId, rng = Math.random) {
  const limit = getRosterLimit(modeId);
  const maxPerClass = getMaxPerClass(modeId);
  const counts = {};
  const roster = [];

  while (roster.length < limit) {
    const pool = CLASS_IDS.filter((id) => (counts[id] ?? 0) < maxPerClass);
    if (pool.length === 0) break;
    const classId = pool[Math.floor(rng() * pool.length)];
    counts[classId] = (counts[classId] ?? 0) + 1;
    roster.push(classId);
  }

  return sortRosterByClass(roster);
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
    baseAtk: cls.atk,
    range: cls.range,
    minRange: cls.minRange ?? null,
    moveRange: cls.moveRange ?? 1,
    jumpMove: cls.jumpMove ?? false,
    jumpRange: cls.jumpRange ?? null,
    deathExplosion: cls.deathExplosion ?? 0,
    passiveBlessing: cls.passiveBlessing ?? false,
    possessionOnKill: cls.possessionOnKill ?? false,
    poisonOnHit: cls.poisonOnHit ?? false,
    poisoned: false,
    poisonFresh: false,
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
