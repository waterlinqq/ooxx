import { ITEM_IDS, SHOP_PRICES, STARTING_COINS } from './items.js';
import { CLASS_IDS, CLASSES } from './units.js';
import { STARTER_CLASSES, getUnlockPrice, isUnlockable } from './unlocks.js';

const SAVE_KEY = 'ooxx-save-v1';

/** @typedef {{ coins: number, inventory: Record<string, number>, tutorialDone: boolean, ownedClasses: string[] }} SaveData */

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

const DEFAULT_SAVE = {
  coins: STARTING_COINS,
  inventory: createDefaultInventory(),
  tutorialDone: false,
  ownedClasses: createDefaultOwnedClasses(),
};

/** @type {SaveData | null} */
let cache = null;

function normalizeSave(raw) {
  const save = {
    coins: typeof raw?.coins === 'number' ? Math.max(0, raw.coins) : DEFAULT_SAVE.coins,
    inventory: createDefaultInventory(),
    tutorialDone: raw?.tutorialDone === true,
    ownedClasses: normalizeOwnedClasses(raw),
  };

  for (const id of ITEM_IDS) {
    const count = raw?.inventory?.[id];
    save.inventory[id] = typeof count === 'number' && count > 0 ? Math.floor(count) : 0;
  }

  return save;
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

export function getSaveSnapshot() {
  const save = loadSave();
  return {
    coins: save.coins,
    inventory: { ...save.inventory },
    tutorialDone: save.tutorialDone,
    ownedClasses: [...save.ownedClasses],
  };
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
