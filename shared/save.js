import {
  CLASS_IDS,
  CLASSES,
  CLASS_LEVEL_MIN,
  CLASS_LEVEL_MAX,
  clampClassLevel,
} from './units.js';
import { DAILY_QUEST_MODES, getTodayKey } from './dailyQuests.js';

export const ITEM_IDS = ['potion', 'bomb', 'landmine'];
export const STARTER_CLASSES = ['archer', 'swordsman', 'shield', 'castle'];
export const DEFAULT_COINS = 1000;
export const DEFAULT_DIAMONDS = 0;

/** @typedef {{ dateKey: string, ready: string[], claimed: string[] }} DailyQuestsData */
/** @typedef {{ level: number, copies: number, fragments: number }} ClassProgress */
/** @typedef {{ coins: number, diamonds: number, inventory: Record<string, number>, tutorialDone: boolean, ownedClasses: string[], classProgress: Record<string, ClassProgress>, rostersByMode: Record<string, string[]>, equippedItem: string | null, dailyQuests: DailyQuestsData }} SaveData */

export function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
}

export function createDefaultClassProgress() {
  return { level: CLASS_LEVEL_MIN, copies: 0, fragments: 0 };
}

export function normalizeClassProgressEntry(raw) {
  const copies = typeof raw?.copies === 'number' && raw.copies > 0 ? Math.floor(raw.copies) : 0;
  const fragments = typeof raw?.fragments === 'number' && raw.fragments > 0 ? Math.floor(raw.fragments) : 0;
  const level = clampClassLevel(raw?.level ?? CLASS_LEVEL_MIN);
  return {
    level: Math.max(CLASS_LEVEL_MIN, Math.min(CLASS_LEVEL_MAX, level)),
    copies,
    fragments,
  };
}

export function normalizeClassProgress(raw) {
  /** @type {Record<string, ClassProgress>} */
  const progress = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  for (const classId of CLASS_IDS) {
    progress[classId] = source[classId]
      ? normalizeClassProgressEntry(source[classId])
      : createDefaultClassProgress();
  }
  return progress;
}

export function mergeClassProgress(local, cloud) {
  /** @type {Record<string, ClassProgress>} */
  const merged = {};
  for (const classId of CLASS_IDS) {
    const a = local[classId] ?? createDefaultClassProgress();
    const b = cloud[classId] ?? createDefaultClassProgress();
    merged[classId] = {
      level: Math.max(a.level, b.level),
      copies: Math.max(a.copies, b.copies),
      fragments: Math.max(a.fragments, b.fragments),
    };
  }
  return merged;
}

export function createDefaultOwnedClasses() {
  return [...STARTER_CLASSES];
}

export function normalizeOwnedClasses(raw) {
  const owned = new Set(STARTER_CLASSES);

  if (Array.isArray(raw?.ownedClasses)) {
    for (const classId of raw.ownedClasses) {
      if (CLASSES[classId]) owned.add(classId);
    }
  }

  return CLASS_IDS.filter((id) => owned.has(id));
}

export function normalizeEquippedItem(raw) {
  if (raw === null) return null;
  if (typeof raw === 'string' && ITEM_IDS.includes(raw)) return raw;
  return null;
}

export function normalizeRostersByMode(raw) {
  /** @type {Record<string, string[]>} */
  const rosters = {};
  if (!raw || typeof raw !== 'object') return rosters;

  for (const [modeId, roster] of Object.entries(raw)) {
    if (!Array.isArray(roster)) continue;
    rosters[modeId] = roster.filter((classId) => CLASSES[classId]);
  }
  return rosters;
}

export function createDefaultDailyQuests() {
  return { dateKey: getTodayKey(), ready: [], claimed: [] };
}

export function normalizeDailyQuests(raw) {
  const todayKey = getTodayKey();
  const dateKey = typeof raw?.dateKey === 'string' ? raw.dateKey : '';

  if (dateKey !== todayKey) {
    return createDefaultDailyQuests();
  }

  const claimedSource = Array.isArray(raw?.claimed) ? raw.claimed : [];
  const readySource = Array.isArray(raw?.ready) ? raw.ready : [];

  const claimedSet = new Set(
    claimedSource.filter((id) => DAILY_QUEST_MODES.includes(id)),
  );
  const ready = DAILY_QUEST_MODES.filter(
    (id) => readySource.includes(id) && !claimedSet.has(id),
  );

  return {
    dateKey: todayKey,
    ready,
    claimed: DAILY_QUEST_MODES.filter((id) => claimedSet.has(id)),
  };
}

export function mergeDailyQuests(local, cloud) {
  const localNorm = normalizeDailyQuests(local);
  const cloudNorm = normalizeDailyQuests(cloud);
  const claimed = new Set([...localNorm.claimed, ...cloudNorm.claimed]);
  const ready = new Set([
    ...localNorm.ready.filter((id) => !claimed.has(id)),
    ...cloudNorm.ready.filter((id) => !claimed.has(id)),
  ]);

  return {
    dateKey: getTodayKey(),
    ready: DAILY_QUEST_MODES.filter((id) => ready.has(id)),
    claimed: DAILY_QUEST_MODES.filter((id) => claimed.has(id)),
  };
}

export function createDefaultSave() {
  return {
    coins: DEFAULT_COINS,
    diamonds: DEFAULT_DIAMONDS,
    inventory: createDefaultInventory(),
    tutorialDone: false,
    ownedClasses: createDefaultOwnedClasses(),
    classProgress: normalizeClassProgress({}),
    rostersByMode: {},
    equippedItem: null,
    dailyQuests: createDefaultDailyQuests(),
  };
}

/** @param {unknown} raw @returns {SaveData} */
export function normalizeSave(raw) {
  const defaults = createDefaultSave();
  const save = {
    coins: typeof raw?.coins === 'number' ? Math.max(0, raw.coins) : defaults.coins,
    diamonds: typeof raw?.diamonds === 'number' ? Math.max(0, raw.diamonds) : defaults.diamonds,
    inventory: createDefaultInventory(),
    tutorialDone: raw?.tutorialDone === true,
    ownedClasses: normalizeOwnedClasses(raw),
    classProgress: normalizeClassProgress(raw?.classProgress),
    rostersByMode: normalizeRostersByMode(raw?.rostersByMode),
    equippedItem: normalizeEquippedItem(raw?.equippedItem ?? null),
    dailyQuests: normalizeDailyQuests(raw?.dailyQuests),
  };

  for (const id of ITEM_IDS) {
    const count = raw?.inventory?.[id];
    save.inventory[id] = typeof count === 'number' && count > 0 ? Math.floor(count) : 0;
  }

  return save;
}
