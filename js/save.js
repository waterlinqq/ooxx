import { ITEM_IDS, SHOP_PRICES, STARTING_COINS } from './items.js';

const SAVE_KEY = 'ooxx-save-v1';

/** @typedef {{ coins: number, inventory: Record<string, number> }} SaveData */

function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
}

const DEFAULT_SAVE = {
  coins: STARTING_COINS,
  inventory: createDefaultInventory(),
};

/** @type {SaveData | null} */
let cache = null;

function normalizeSave(raw) {
  const save = {
    coins: typeof raw?.coins === 'number' ? Math.max(0, raw.coins) : DEFAULT_SAVE.coins,
    inventory: createDefaultInventory(),
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
  };
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
