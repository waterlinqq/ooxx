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
    hp: 3,
    atk: 2,
    range: 1,
    shadowCloneOnMove: true,
    type: 'melee',
    desc: '上下左右近戰，移動時原格留下影分身佔位一回合',
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
    desc: '上下左右近戰，被擊殺時自爆反擊周圍八格敵人',
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
    desc: '上下左右近戰；命中使敵人中毒（攻擊-1，敵方行動結束後每回合扣 1 血，不可疊加）',
  },
  crabGeneral: {
    id: 'crabGeneral',
    name: '蟹將',
    icon: '🦀',
    hp: 4,
    atk: 2,
    range: 1,
    moveRange: 1,
    diagonalOnly: true,
    type: 'melee',
    desc: '僅能斜角移動與攻擊，無法上下左右',
  },
  castle: {
    id: 'castle',
    name: '城堡',
    icon: '🏯',
    hp: 10,
    atk: 0,
    range: 0,
    moveRange: 0,
    type: 'castle',
    recycleAdjacent: true,
    desc: '堡壘；友方踏入時該單位回到牌列（保留 HP）；攻城戰主堡 15 HP；被摧毀時對手獲勝',
  },
};

export const TEAM = {
  blue: { id: 'blue', name: '藍隊', color: '#3b82f6', light: '#dbeafe' },
  red: { id: 'red', name: '紅隊', color: '#ef4444', light: '#fee2e2' },
};

export function resolveUnitColor(team) {
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
    label: '快速模式',
    size: 3,
    actionsPerTurn: 1,
    turnDurationMs: 10000,
    turnBonusMs: 0,
    matchDurationMs: 5 * 60 * 1000,
    // Four a side is the largest roster that still leaves the 9 cells un-fillable, which
    // is what keeps a single action per turn viable. AI self-play shows the cliff either
    // side of it: at five a side every game ends by attrition instead of a line, and
    // swapping the mage for the bomber deadlocks the board outright.
    rosterSize: 4,
    maxPerClass: 1,
    roster: ['swordsman', 'archer', 'shield', 'mage'],
  },
  '4x4': {
    id: '4x4',
    label: '標準模式',
    size: 4,
    actionsPerTurn: 1,
    turnDurationMs: 15000,
    turnBonusMs: 5000,
    matchDurationMs: 8 * 60 * 1000,
    rosterSize: 10,
    maxPerClass: 1,
    roster: [
      'swordsman', 'archer', 'shield', 'mage', 'assassin',
      'bomber', 'artillery', 'tower', 'priest', 'eagle',
    ],
  },
  '5x5': {
    id: '5x5',
    label: '攻城模式',
    size: 5,
    actionsPerTurn: 1,
    turnDurationMs: 18000,
    turnBonusMs: 5000,
    matchDurationMs: 10 * 60 * 1000,
    // All deployable classes, one each; castles are placed on the board at start.
    rosterSize: 13,
    maxPerClass: 1,
    roster: Object.keys(CLASSES).filter((id) => id !== 'castle'),
    castleHp: 15,
    mapProps: false,
    castles: {
      red: { row: 0, col: 0 },   // (1,1) 敵方左上
      blue: { row: 4, col: 4 },  // (5,5) 己方右下
    },
    fixedMapProps: [
      { row: 1, col: 3, kind: 'flag' }, // (2,4)
      { row: 3, col: 1, kind: 'flag' }, // (4,2)
    ],
  },
  '6x6': {
    id: '6x6',
    label: '生存模式',
    size: 6,
    actionsPerTurn: 1,
    turnDurationMs: 0,
    turnBonusMs: 0,
    matchDurationMs: 0,
    rosterSize: 5,
    maxPerClass: 1,
    roster: [],
    mapProps: false,
    survival: true,
    localOnly: true,
    lineWin: false,
    enemyRoster: Object.keys(CLASSES).filter((id) => id !== 'castle'),
    fixedMapProps: null, // filled by getBorderStoneMapProps(6) at init
  },
};

const SURVIVAL_BORDER_STONES = buildBorderStoneMapProps(6);
BOARD_MODES['6x6'].fixedMapProps = SURVIVAL_BORDER_STONES;

function buildBorderStoneMapProps(size) {
  /** @type {{ row: number, col: number, kind: 'stone' }[]} */
  const props = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r === 0 || r === size - 1 || c === 0 || c === size - 1) {
        props.push({ row: r, col: c, kind: 'stone' });
      }
    }
  }
  return props;
}

export const CLASS_IDS = Object.keys(CLASSES);

export const CLASS_LEVEL_MIN = 1;
export const CLASS_LEVEL_MAX = 4;
export const FRAGMENTS_PER_COPY = 10;

/** Copies consumed to reach that level from the previous one. */
export const CLASS_UPGRADE_COPY_COST = {
  2: 3,
  3: 7,
  4: 12,
};

export function clampClassLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return CLASS_LEVEL_MIN;
  return Math.max(CLASS_LEVEL_MIN, Math.min(CLASS_LEVEL_MAX, Math.floor(n)));
}

export function getClassLevelLabel(level) {
  const lv = clampClassLevel(level);
  return lv >= CLASS_LEVEL_MAX ? 'MAX' : `Lv${lv}`;
}

export function getNextClassLevel(level) {
  const lv = clampClassLevel(level);
  if (lv >= CLASS_LEVEL_MAX) return null;
  return lv + 1;
}

export function getUpgradeCopyCost(fromLevel) {
  const next = getNextClassLevel(fromLevel);
  if (next == null) return null;
  return CLASS_UPGRADE_COPY_COST[next] ?? null;
}

export function getClassLevelBonuses(classId, level = CLASS_LEVEL_MIN) {
  const lv = clampClassLevel(level);
  let hp = 0;
  let atk = 0;
  if (lv >= 2) hp += 1;
  if (lv >= 3) {
    if (classId === 'castle') hp += 1;
    else atk += 1;
  }
  return { hp, atk };
}

export function getClassCombatStats(classId, level = CLASS_LEVEL_MIN) {
  const cls = CLASSES[classId];
  if (!cls) return { hp: 0, atk: 0 };
  const bonus = getClassLevelBonuses(classId, level);
  return {
    hp: cls.hp + bonus.hp,
    atk: cls.atk + bonus.atk,
  };
}

/** @param {unknown} raw */
export function normalizeClassLevels(raw) {
  /** @type {Record<string, number>} */
  const levels = {};
  if (!raw || typeof raw !== 'object') return levels;
  for (const classId of CLASS_IDS) {
    if (raw[classId] == null) continue;
    levels[classId] = clampClassLevel(raw[classId]);
  }
  return levels;
}

export function getRosterClassIds(modeId = null) {
  if (modeId && modeHasAutoCastle(modeId)) {
    return CLASS_IDS.filter((id) => id !== 'castle');
  }
  return CLASS_IDS;
}

export function modeHasAutoCastle(modeId) {
  return Boolean(getBoardMode(modeId).castles);
}

export function getCastleHpForMode(modeId) {
  const mode = getBoardMode(modeId);
  return mode.castleHp ?? CLASSES.castle.hp;
}

export function getDeployableRoster(roster, modeId) {
  if (!Array.isArray(roster)) return [];
  if (modeHasAutoCastle(modeId)) {
    return roster.filter((id) => id !== 'castle');
  }
  return [...roster];
}

export function isCastleUnit(unit) {
  return unit?.classId === 'castle' || unit?.type === 'castle';
}

export function getCastleCells(modeId) {
  const mode = getBoardMode(modeId);
  if (!mode.castles) return [];
  return Object.entries(mode.castles).map(([team, pos]) => ({
    row: pos.row,
    col: pos.col,
    team,
  }));
}

export function placeModeCastles(board, modeId, classLevelsByTeam = {}) {
  const mode = getBoardMode(modeId);
  if (!mode.castles) return board;
  const next = cloneBoard(board);
  const baseHp = getCastleHpForMode(modeId);
  for (const [team, pos] of Object.entries(mode.castles)) {
    const teamLevels = classLevelsByTeam[team] ?? {};
    const level = clampClassLevel(teamLevels.castle ?? CLASS_LEVEL_MIN);
    const unit = createUnit('castle', team, { level });
    const hp = baseHp + getClassLevelBonuses('castle', level).hp;
    unit.id = `${team}-castle`;
    unit.hp = hp;
    unit.maxHp = hp;
    unit.row = pos.row;
    unit.col = pos.col;
    next[pos.row][pos.col] = unit;
  }
  return next;
}

export function getBoardMode(modeId) {
  return BOARD_MODES[modeId] ?? BOARD_MODES['3x3'];
}

export function isSurvivalMode(modeId) {
  return Boolean(getBoardMode(modeId).survival);
}

export function isLocalOnlyMode(modeId) {
  return Boolean(getBoardMode(modeId).localOnly);
}

export function getEnemyRosterForMode(modeId) {
  const mode = getBoardMode(modeId);
  if (mode.enemyRoster?.length) return [...mode.enemyRoster];
  return createRandomRoster(modeId);
}

export function getRosterLimit(modeId) {
  const mode = getBoardMode(modeId);
  return mode.rosterSize ?? mode.roster.length;
}

export function getMaxPerClass(modeId) {
  const mode = getBoardMode(modeId);
  return mode.maxPerClass ?? getRosterLimit(modeId);
}

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
  if (modeHasAutoCastle(modeId) && classId === 'castle') return false;
  if (roster.length >= getRosterLimit(modeId)) return false;
  const used = roster.filter((id) => id === classId).length;
  return used < getMaxPerClass(modeId);
}

/** Normalize a roster: drop invalid classes, enforce per-class caps and size limit. */
export function sanitizeRoster(roster, modeId) {
  if (!Array.isArray(roster)) return [];
  const deployable = getDeployableRoster(roster, modeId);
  const limit = getRosterLimit(modeId);
  const maxPerClass = getMaxPerClass(modeId);
  const counts = {};
  const result = [];
  for (const classId of deployable) {
    if (!CLASSES[classId]) continue;
    const used = counts[classId] ?? 0;
    if (used >= maxPerClass) continue;
    counts[classId] = used + 1;
    result.push(classId);
    if (result.length >= limit) break;
  }
  return sortRosterByClass(result);
}

export function hasPlayableRoster(roster, modeId) {
  return sanitizeRoster(roster, modeId).length > 0;
}

export function isValidRoster(roster, modeId) {
  const deployable = sanitizeRoster(roster, modeId);
  return deployable.length === getRosterLimit(modeId);
}

/** Use the player's lineup as-is (partial rosters are allowed). */
export function resolveRoster(roster, modeId) {
  return sanitizeRoster(roster, modeId);
}

export function createRandomRoster(modeId, rng = Math.random) {
  const limit = getRosterLimit(modeId);
  const maxPerClass = getMaxPerClass(modeId);
  const counts = {};
  const roster = [];

  while (roster.length < limit) {
    const pool = getRosterClassIds(modeId).filter((id) => (counts[id] ?? 0) < maxPerClass);
    if (pool.length === 0) break;
    const classId = pool[Math.floor(rng() * pool.length)];
    counts[classId] = (counts[classId] ?? 0) + 1;
    roster.push(classId);
  }

  return sortRosterByClass(roster);
}

export function createUnit(classId, teamId, options = {}) {
  const cls = CLASSES[classId];
  const level = clampClassLevel(options.level ?? CLASS_LEVEL_MIN);
  const stats = getClassCombatStats(classId, level);
  return {
    id: `${teamId}-${classId}-${Math.random().toString(36).slice(2, 8)}`,
    classId,
    team: teamId,
    level,
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    baseAtk: stats.atk,
    range: cls.range,
    minRange: cls.minRange ?? null,
    moveRange: cls.moveRange ?? 1,
    jumpMove: cls.jumpMove ?? false,
    jumpRange: cls.jumpRange ?? null,
    shadowCloneOnMove: cls.shadowCloneOnMove ?? false,
    deathExplosion: cls.deathExplosion ?? 0,
    passiveBlessing: cls.passiveBlessing ?? false,
    possessionOnKill: cls.possessionOnKill ?? false,
    poisonOnHit: cls.poisonOnHit ?? false,
    diagonalOnly: cls.diagonalOnly ?? false,
    poisoned: false,
    poisonFresh: false,
    immobilized: false,
    type: cls.type,
    row: -1,
    col: -1,
  };
}

export function createTeamReserve(roster, teamId, modeId = null, classLevels = {}) {
  const deployable = modeId ? getDeployableRoster(roster, modeId) : roster;
  return deployable.map((classId) => createUnit(classId, teamId, {
    level: classLevels[classId] ?? CLASS_LEVEL_MIN,
  }));
}

export function createEmptyBoard(size = 3) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}
