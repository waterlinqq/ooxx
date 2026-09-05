import { pool } from '../db.js';

const STARTER_CLASSES = ['archer', 'swordsman', 'shield'];
const DEFAULT_COINS = 1000;

const ITEM_IDS = ['potion', 'bomb', 'landmine'];

function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
}

function normalizeOwnedClasses(raw) {
  const owned = new Set(STARTER_CLASSES);
  if (Array.isArray(raw)) {
    for (const classId of raw) {
      if (typeof classId === 'string') owned.add(classId);
    }
  }
  return [...owned];
}

export function normalizeSave(raw) {
  const inventory = createDefaultInventory();
  if (raw?.inventory && typeof raw.inventory === 'object') {
    for (const id of ITEM_IDS) {
      const count = raw.inventory[id];
      inventory[id] = typeof count === 'number' && count > 0 ? Math.floor(count) : 0;
    }
  }

  return {
    coins: typeof raw?.coins === 'number' ? Math.max(0, Math.floor(raw.coins)) : DEFAULT_COINS,
    inventory,
    tutorialDone: raw?.tutorialDone === true || raw?.tutorial_done === true,
    ownedClasses: normalizeOwnedClasses(raw?.ownedClasses ?? raw?.owned_classes),
  };
}

function rowToSave(row) {
  if (!row) return null;
  return normalizeSave({
    coins: row.coins,
    inventory: row.inventory,
    tutorialDone: row.tutorial_done,
    ownedClasses: row.owned_classes,
  });
}

export async function getSave(guestId) {
  const { rows } = await pool.query(
    'SELECT * FROM saves WHERE guest_id = $1',
    [guestId],
  );
  if (rows[0]) return rowToSave(rows[0]);

  const defaults = normalizeSave({});
  await pool.query(
    `INSERT INTO saves (guest_id, coins, inventory, tutorial_done, owned_classes)
     VALUES ($1, $2, $3, $4, $5)`,
    [guestId, defaults.coins, JSON.stringify(defaults.inventory), defaults.tutorialDone, JSON.stringify(defaults.ownedClasses)],
  );
  return defaults;
}

export async function putSave(guestId, payload) {
  const save = normalizeSave(payload);
  await pool.query(
    `INSERT INTO saves (guest_id, coins, inventory, tutorial_done, owned_classes, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (guest_id) DO UPDATE SET
       coins = EXCLUDED.coins,
       inventory = EXCLUDED.inventory,
       tutorial_done = EXCLUDED.tutorial_done,
       owned_classes = EXCLUDED.owned_classes,
       updated_at = now()`,
    [guestId, save.coins, JSON.stringify(save.inventory), save.tutorialDone, JSON.stringify(save.ownedClasses)],
  );
  return save;
}
