import { ITEM_IDS, SHOP_PRICES, STARTING_COINS, STARTING_DIAMONDS, FRAGMENT_PRICE } from './items.js';
import {
  CLASS_IDS,
  CLASSES,
  CLASS_LEVEL_MIN,
  CLASS_LEVEL_MAX,
  FRAGMENTS_PER_COPY,
  clampClassLevel,
  getUpgradeCopyCost,
} from './units.js';
import { STARTER_CLASSES, getClassDiamondPrice, isUnlockable, isStarterClass } from './unlocks.js';
import { getAuthToken, ensureGuestToken } from './guestAuth.js';
import { apiUrl } from './config.js';
import {
  DAILY_QUEST_MODES,
  DAILY_QUEST_REWARD,
  getTodayKey,
  isDailyQuestMode,
} from './dailyQuests.js';

const SAVE_KEY = 'ooxx-save-v1';

/** @typedef {{ dateKey: string, ready: string[], claimed: string[] }} DailyQuestsData */
/** @typedef {{ level: number, copies: number, fragments: number }} ClassProgress */
/** @typedef {{ coins: number, diamonds: number, inventory: Record<string, number>, tutorialDone: boolean, ownedClasses: string[], classProgress: Record<string, ClassProgress>, rostersByMode?: Record<string, string[]>, equippedItem: string | null, dailyQuests: DailyQuestsData }} SaveData */

function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
}

function createDefaultClassProgress() {
  return { level: CLASS_LEVEL_MIN, copies: 0, fragments: 0 };
}

function normalizeClassProgressEntry(raw) {
  const copies = typeof raw?.copies === 'number' && raw.copies > 0 ? Math.floor(raw.copies) : 0;
  const fragments = typeof raw?.fragments === 'number' && raw.fragments > 0 ? Math.floor(raw.fragments) : 0;
  const level = clampClassLevel(raw?.level ?? CLASS_LEVEL_MIN);
  return {
    level: Math.max(CLASS_LEVEL_MIN, Math.min(CLASS_LEVEL_MAX, level)),
    copies,
    fragments,
  };
}

function normalizeClassProgress(raw) {
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

function mergeClassProgress(local, cloud) {
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

function ensureClassProgress(save, classId) {
  if (!save.classProgress[classId]) {
    save.classProgress[classId] = createDefaultClassProgress();
  }
  return save.classProgress[classId];
}

function createDefaultOwnedClasses() {
  return [...STARTER_CLASSES];
}

function normalizeOwnedClasses(raw) {
  const owned = new Set(STARTER_CLASSES);

  if (Array.isArray(raw?.ownedClasses)) {
    for (const classId of raw.ownedClasses) {
      if (CLASSES[classId]) owned.add(classId);
    }
  }

  return CLASS_IDS.filter((id) => owned.has(id));
}

function normalizeEquippedItem(raw) {
  if (raw === null) return null;
  if (typeof raw === 'string' && ITEM_IDS.includes(raw)) return raw;
  return null;
}

function normalizeRostersByMode(raw) {
  /** @type {Record<string, string[]>} */
  const rosters = {};
  if (!raw || typeof raw !== 'object') return rosters;

  for (const [modeId, roster] of Object.entries(raw)) {
    if (!Array.isArray(roster)) continue;
    rosters[modeId] = roster.filter((classId) => CLASSES[classId]);
  }
  return rosters;
}

function createDefaultDailyQuests() {
  return { dateKey: getTodayKey(), ready: [], claimed: [] };
}

function normalizeDailyQuests(raw) {
  const todayKey = getTodayKey();
  const dateKey = typeof raw?.dateKey === 'string' ? raw.dateKey : '';

  if (dateKey !== todayKey) {
    return createDefaultDailyQuests();
  }

  const legacyCompleted = Array.isArray(raw?.completed) ? raw.completed : [];
  const claimedSource = Array.isArray(raw?.claimed) ? raw.claimed : legacyCompleted;
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

function mergeDailyQuests(local, cloud) {
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

const DEFAULT_SAVE = {
  coins: STARTING_COINS,
  diamonds: STARTING_DIAMONDS,
  inventory: createDefaultInventory(),
  tutorialDone: false,
  ownedClasses: createDefaultOwnedClasses(),
  classProgress: normalizeClassProgress({}),
  rostersByMode: {},
  equippedItem: null,
  dailyQuests: createDefaultDailyQuests(),
};

/** @type {SaveData | null} */
let cache = null;
let cloudPushTimer = null;

function normalizeSave(raw) {
  const save = {
    coins: typeof raw?.coins === 'number' ? Math.max(0, raw.coins) : DEFAULT_SAVE.coins,
    diamonds: typeof raw?.diamonds === 'number' ? Math.max(0, raw.diamonds) : DEFAULT_SAVE.diamonds,
    inventory: createDefaultInventory(),
    tutorialDone: raw?.tutorialDone === true,
    ownedClasses: normalizeOwnedClasses(raw),
    classProgress: normalizeClassProgress(raw?.classProgress ?? raw?.class_progress),
    rostersByMode: normalizeRostersByMode(raw?.rostersByMode),
    equippedItem: normalizeEquippedItem(raw?.equippedItem ?? null),
    dailyQuests: normalizeDailyQuests(raw?.dailyQuests ?? raw?.daily_quests),
  };

  for (const id of ITEM_IDS) {
    const count = raw?.inventory?.[id];
    save.inventory[id] = typeof count === 'number' && count > 0 ? Math.floor(count) : 0;
  }

  return save;
}

function mergeCloudLocal(cloud, local) {
  const merged = normalizeSave(local);
  const cloudNorm = normalizeSave(cloud);

  merged.coins = Math.max(merged.coins, cloudNorm.coins);
  merged.diamonds = Math.max(merged.diamonds, cloudNorm.diamonds);
  merged.tutorialDone = merged.tutorialDone || cloudNorm.tutorialDone;

  const owned = new Set([...merged.ownedClasses, ...cloudNorm.ownedClasses]);
  merged.ownedClasses = CLASS_IDS.filter((id) => owned.has(id));
  merged.classProgress = mergeClassProgress(merged.classProgress, cloudNorm.classProgress);

  for (const id of ITEM_IDS) {
    merged.inventory[id] = Math.max(merged.inventory[id] ?? 0, cloudNorm.inventory[id] ?? 0);
  }

  merged.rostersByMode = {
    ...cloudNorm.rostersByMode,
    ...merged.rostersByMode,
  };

  merged.equippedItem = merged.equippedItem ?? cloudNorm.equippedItem ?? null;
  merged.dailyQuests = mergeDailyQuests(local?.dailyQuests ?? local?.daily_quests, cloud?.dailyQuests ?? cloud?.daily_quests);

  return merged;
}

export function loadSave() {
  if (cache) return cache;

  try {
    const stored = localStorage.getItem(SAVE_KEY);
    if (stored) {
      cache = normalizeSave(JSON.parse(stored));
      return cache;
    }
  } catch {
    // fall through to default
  }

  cache = normalizeSave(DEFAULT_SAVE);
  persistSave();
  return cache;
}

export async function initCloudSave() {
  try {
    await ensureGuestToken();
    const token = getAuthToken();
    const res = await fetch(apiUrl('/api/save'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return loadSave();

    const cloud = await res.json();
    const local = loadSave();
    cache = mergeCloudLocal(cloud, local);
    persistSave();
    scheduleCloudPush();
    return cache;
  } catch {
    return loadSave();
  }
}

function scheduleCloudPush() {
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(async () => {
    const token = getAuthToken();
    if (!token || !cache) return;
    try {
      await fetch(apiUrl('/api/save'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(getSaveSnapshot()),
      });
    } catch {
      // offline — local save still valid
    }
  }, 800);
}

export function getSaveSnapshot() {
  const save = loadSave();
  const dailyQuests = getDailyQuests();
  return {
    coins: save.coins,
    diamonds: save.diamonds,
    inventory: { ...save.inventory },
    tutorialDone: save.tutorialDone,
    ownedClasses: [...save.ownedClasses],
    classProgress: Object.fromEntries(
      CLASS_IDS.map((id) => [id, { ...save.classProgress[id] }]),
    ),
    rostersByMode: { ...save.rostersByMode },
    equippedItem: save.equippedItem ?? null,
    dailyQuests,
  };
}

export function getDailyQuests() {
  const save = loadSave();
  const normalized = normalizeDailyQuests(save.dailyQuests);
  if (
    save.dailyQuests.dateKey !== normalized.dateKey
    || save.dailyQuests.ready.length !== normalized.ready.length
    || save.dailyQuests.claimed.length !== normalized.claimed.length
    || save.dailyQuests.ready.some((id, i) => id !== normalized.ready[i])
    || save.dailyQuests.claimed.some((id, i) => id !== normalized.claimed[i])
  ) {
    save.dailyQuests = normalized;
    persistSave();
  }
  return {
    dateKey: normalized.dateKey,
    ready: [...normalized.ready],
    claimed: [...normalized.claimed],
  };
}

/** @returns {{ marked: boolean, modeId: string }} */
export function markDailyQuestReady(modeId) {
  if (!isDailyQuestMode(modeId)) {
    return { marked: false, modeId };
  }

  const save = loadSave();
  const quests = normalizeDailyQuests(save.dailyQuests);
  if (quests.claimed.includes(modeId) || quests.ready.includes(modeId)) {
    save.dailyQuests = quests;
    return { marked: false, modeId };
  }

  quests.ready = [...quests.ready, modeId];
  save.dailyQuests = quests;
  persistSave();
  return { marked: true, modeId };
}

/** @returns {{ ok: true, awarded: number } | { ok: false, reason: string }} */
export function claimDailyQuest(modeId) {
  if (!isDailyQuestMode(modeId)) {
    return { ok: false, reason: '未知任務' };
  }

  const save = loadSave();
  const quests = normalizeDailyQuests(save.dailyQuests);
  if (quests.claimed.includes(modeId)) {
    return { ok: false, reason: '已領取' };
  }
  if (!quests.ready.includes(modeId)) {
    return { ok: false, reason: '尚未完成' };
  }

  quests.ready = quests.ready.filter((id) => id !== modeId);
  quests.claimed = [...quests.claimed, modeId];
  save.dailyQuests = quests;
  save.diamonds = Math.max(0, save.diamonds + DAILY_QUEST_REWARD);
  persistSave();
  return { ok: true, awarded: DAILY_QUEST_REWARD };
}

export function getSavedRostersByMode() {
  return { ...loadSave().rostersByMode };
}

export function getSavedEquippedItem() {
  return loadSave().equippedItem ?? null;
}

export function persistEquippedItem(itemId) {
  const save = loadSave();
  save.equippedItem = itemId === null || ITEM_IDS.includes(itemId) ? itemId : null;
  persistSave();
}

export function persistRostersByMode(rostersByMode) {
  const save = loadSave();
  save.rostersByMode = Object.fromEntries(
    Object.entries(rostersByMode).map(([modeId, roster]) => [modeId, [...roster]]),
  );
  persistSave();
}

export function isTutorialDone() {
  return loadSave().tutorialDone;
}

export function markTutorialDone() {
  const save = loadSave();
  if (save.tutorialDone) return;
  save.tutorialDone = true;
  persistSave();
}

export function persistSave() {
  if (!cache) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(cache));
  scheduleCloudPush();
}

export function addCoins(amount) {
  const save = loadSave();
  save.coins = Math.max(0, save.coins + amount);
  persistSave();
}

export function addDiamonds(amount) {
  const save = loadSave();
  save.diamonds = Math.max(0, save.diamonds + amount);
  persistSave();
}

export function isClassOwned(classId) {
  const save = loadSave();
  return save.ownedClasses.includes(classId);
}

export function getOwnedClasses() {
  return [...loadSave().ownedClasses];
}

export function getClassProgress(classId) {
  const save = loadSave();
  return { ...(save.classProgress[classId] ?? createDefaultClassProgress()) };
}

export function getClassProgressMap() {
  const save = loadSave();
  return Object.fromEntries(
    CLASS_IDS.map((id) => [id, { ...(save.classProgress[id] ?? createDefaultClassProgress()) }]),
  );
}

export function getOwnedClassLevels() {
  const save = loadSave();
  /** @type {Record<string, number>} */
  const levels = {};
  for (const classId of save.ownedClasses) {
    levels[classId] = (save.classProgress[classId] ?? createDefaultClassProgress()).level;
  }
  return levels;
}

export function canAffordClass(classId) {
  const save = loadSave();
  const price = getClassDiamondPrice(classId);
  return typeof price === 'number' && save.diamonds >= price;
}

export function canAffordFragment(classId) {
  if (!CLASSES[classId]) return false;
  return loadSave().coins >= FRAGMENT_PRICE;
}

export function canSynthesizeCopy(classId) {
  if (!CLASSES[classId]) return false;
  return getClassProgress(classId).fragments >= FRAGMENTS_PER_COPY;
}

export function canUpgradeClass(classId) {
  const save = loadSave();
  if (!save.ownedClasses.includes(classId)) return false;
  const progress = save.classProgress[classId] ?? createDefaultClassProgress();
  const cost = getUpgradeCopyCost(progress.level);
  return cost != null && progress.copies >= cost;
}

/** @returns {{ ok: true, unlocked: boolean } | { ok: false, reason: string }} */
export function buyClass(classId) {
  const save = loadSave();

  if (!CLASSES[classId]) {
    return { ok: false, reason: '未知職業' };
  }

  const owned = save.ownedClasses.includes(classId);
  if (!owned && !isUnlockable(classId) && !isStarterClass(classId)) {
    return { ok: false, reason: '無法解鎖此職業' };
  }

  const price = getClassDiamondPrice(classId);
  if (typeof price !== 'number') {
    return { ok: false, reason: '未知商品' };
  }
  if (save.diamonds < price) {
    return { ok: false, reason: '鑽石不足' };
  }

  save.diamonds -= price;
  const progress = ensureClassProgress(save, classId);
  if (!owned) {
    save.ownedClasses = CLASS_IDS.filter((id) => save.ownedClasses.includes(id) || id === classId);
    progress.level = CLASS_LEVEL_MIN;
  } else {
    progress.copies += 1;
  }
  persistSave();
  return { ok: true, unlocked: !owned };
}

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function buyFragment(classId) {
  const save = loadSave();
  if (!CLASSES[classId]) {
    return { ok: false, reason: '未知職業' };
  }
  if (save.coins < FRAGMENT_PRICE) {
    return { ok: false, reason: '金幣不足' };
  }

  save.coins -= FRAGMENT_PRICE;
  ensureClassProgress(save, classId).fragments += 1;
  persistSave();
  return { ok: true };
}

/** @returns {{ ok: true, unlocked: boolean } | { ok: false, reason: string }} */
export function synthesizeCopy(classId) {
  const save = loadSave();
  if (!CLASSES[classId]) {
    return { ok: false, reason: '未知職業' };
  }

  const progress = ensureClassProgress(save, classId);
  if (progress.fragments < FRAGMENTS_PER_COPY) {
    return { ok: false, reason: '碎片不足' };
  }

  const owned = save.ownedClasses.includes(classId);
  progress.fragments -= FRAGMENTS_PER_COPY;
  if (!owned) {
    save.ownedClasses = CLASS_IDS.filter((id) => save.ownedClasses.includes(id) || id === classId);
    progress.level = CLASS_LEVEL_MIN;
  } else {
    progress.copies += 1;
  }
  persistSave();
  return { ok: true, unlocked: !owned };
}

/** @returns {{ ok: true, level: number } | { ok: false, reason: string }} */
export function upgradeClass(classId) {
  const save = loadSave();
  if (!save.ownedClasses.includes(classId)) {
    return { ok: false, reason: '尚未解鎖此職業' };
  }

  const progress = ensureClassProgress(save, classId);
  const cost = getUpgradeCopyCost(progress.level);
  if (cost == null) {
    return { ok: false, reason: '已達最大等級' };
  }
  if (progress.copies < cost) {
    return { ok: false, reason: '複本不足' };
  }

  progress.copies -= cost;
  progress.level += 1;
  persistSave();
  return { ok: true, level: progress.level };
}

export function canAfford(itemId) {
  const save = loadSave();
  const price = SHOP_PRICES[itemId];
  return typeof price === 'number' && save.coins >= price;
}

export function getInventoryCount(itemId) {
  const save = loadSave();
  return save.inventory[itemId] ?? 0;
}

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function buyItem(itemId) {
  const save = loadSave();
  const price = SHOP_PRICES[itemId];
  if (typeof price !== 'number') {
    return { ok: false, reason: '未知商品' };
  }
  if (save.coins < price) {
    return { ok: false, reason: '金幣不足' };
  }

  save.coins -= price;
  save.inventory[itemId] = (save.inventory[itemId] ?? 0) + 1;
  persistSave();
  return { ok: true };
}

/** @returns {boolean} */
export function consumeItem(itemId) {
  const save = loadSave();
  const count = save.inventory[itemId] ?? 0;
  if (count <= 0) return false;

  save.inventory[itemId] = count - 1;
  persistSave();
  return true;
}
