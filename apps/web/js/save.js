import { ITEM_IDS, SHOP_PRICES, STARTING_COINS } from './items.js';
import { CLASS_IDS, CLASSES } from './units.js';
import { STARTER_CLASSES, getUnlockPrice, isUnlockable } from './unlocks.js';
import { getAuthToken, ensureGuestToken } from './guestAuth.js';
import { apiUrl } from './config.js';

const SAVE_KEY = 'ooxx-save-v1';

/** @typedef {{ coins: number, inventory: Record<string, number>, tutorialDone: boolean, ownedClasses: string[], rostersByMode?: Record<string, string[]> }} SaveData */

function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
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

const DEFAULT_SAVE = {
  coins: STARTING_COINS,
  inventory: createDefaultInventory(),
  tutorialDone: false,
  ownedClasses: createDefaultOwnedClasses(),
  rostersByMode: {},
};

/** @type {SaveData | null} */
let cache = null;
let cloudPushTimer = null;

function normalizeSave(raw) {
  const save = {
    coins: typeof raw?.coins === 'number' ? Math.max(0, raw.coins) : DEFAULT_SAVE.coins,
    inventory: createDefaultInventory(),
    tutorialDone: raw?.tutorialDone === true,
    ownedClasses: normalizeOwnedClasses(raw),
    rostersByMode: normalizeRostersByMode(raw?.rostersByMode),
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
  merged.tutorialDone = merged.tutorialDone || cloudNorm.tutorialDone;

  const owned = new Set([...merged.ownedClasses, ...cloudNorm.ownedClasses]);
  merged.ownedClasses = CLASS_IDS.filter((id) => owned.has(id));

  for (const id of ITEM_IDS) {
    merged.inventory[id] = Math.max(merged.inventory[id] ?? 0, cloudNorm.inventory[id] ?? 0);
  }

  merged.rostersByMode = {
    ...cloudNorm.rostersByMode,
    ...merged.rostersByMode,
  };

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
  return {
    coins: save.coins,
    inventory: { ...save.inventory },
    tutorialDone: save.tutorialDone,
    ownedClasses: [...save.ownedClasses],
    rostersByMode: { ...save.rostersByMode },
  };
}

export function getSavedRostersByMode() {
  return { ...loadSave().rostersByMode };
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

export function isClassOwned(classId) {
  const save = loadSave();
  return save.ownedClasses.includes(classId);
}

export function getOwnedClasses() {
  return [...loadSave().ownedClasses];
}

export function canAffordClass(classId) {
  const save = loadSave();
  const price = getUnlockPrice(classId);
  return typeof price === 'number' && save.coins >= price;
}

/** @returns {{ ok: true } | { ok: false, reason: string }} */
export function buyClass(classId) {
  const save = loadSave();

  if (!isUnlockable(classId)) {
    return { ok: false, reason: '無法解鎖此職業' };
  }
  if (save.ownedClasses.includes(classId)) {
    return { ok: false, reason: '已解鎖此職業' };
  }

  const price = getUnlockPrice(classId);
  if (typeof price !== 'number') {
    return { ok: false, reason: '未知商品' };
  }
  if (save.coins < price) {
    return { ok: false, reason: '金幣不足' };
  }

  save.coins -= price;
  save.ownedClasses = CLASS_IDS.filter((id) => save.ownedClasses.includes(id) || id === classId);
  persistSave();
  return { ok: true };
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
