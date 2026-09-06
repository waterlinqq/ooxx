import { pool } from '../db.js';

const STARTER_CLASSES = ['archer', 'swordsman', 'shield'];
const DEFAULT_COINS = 1000;
const DEFAULT_DIAMONDS = 0;

const ITEM_IDS = ['potion', 'bomb', 'landmine'];
const DAILY_QUEST_MODES = ['3x3', '4x4', '5x5', '6x6'];

function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
}

function normalizeDailyQuests(raw) {
  const dateKey = typeof raw?.dateKey === 'string' ? raw.dateKey : '';
  const legacyCompleted = Array.isArray(raw?.completed) ? raw.completed : [];
  const claimedSource = Array.isArray(raw?.claimed) ? raw.claimed : legacyCompleted;
  const readySource = Array.isArray(raw?.ready) ? raw.ready : [];
  const claimedSet = new Set(
    claimedSource.filter((id) => DAILY_QUEST_MODES.includes(id)),
  );
  const ready = readySource.filter(
    (id) => DAILY_QUEST_MODES.includes(id) && !claimedSet.has(id),
  );
  return {
    dateKey,
    ready: [...new Set(ready)],
    claimed: [...claimedSet],
  };
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
    diamonds: typeof raw?.diamonds === 'number' ? Math.max(0, Math.floor(raw.diamonds)) : DEFAULT_DIAMONDS,
    inventory,
    tutorialDone: raw?.tutorialDone === true || raw?.tutorial_done === true,
    ownedClasses: normalizeOwnedClasses(raw?.ownedClasses ?? raw?.owned_classes),
    dailyQuests: normalizeDailyQuests(raw?.dailyQuests ?? raw?.daily_quests),
  };
}

function rowToSave(row) {
  if (!row) return null;
  return normalizeSave({
    coins: row.coins,
    diamonds: row.diamonds,
    inventory: row.inventory,
    tutorialDone: row.tutorial_done,
    ownedClasses: row.owned_classes,
    dailyQuests: row.daily_quests,
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
    `INSERT INTO saves (guest_id, coins, diamonds, inventory, tutorial_done, owned_classes, daily_quests)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      guestId,
      defaults.coins,
      defaults.diamonds,
      JSON.stringify(defaults.inventory),
      defaults.tutorialDone,
      JSON.stringify(defaults.ownedClasses),
      JSON.stringify(defaults.dailyQuests),
    ],
  );
  return defaults;
}

export async function putSave(guestId, payload) {
  const save = normalizeSave(payload);
  await pool.query(
    `INSERT INTO saves (guest_id, coins, diamonds, inventory, tutorial_done, owned_classes, daily_quests, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (guest_id) DO UPDATE SET
       coins = EXCLUDED.coins,
       diamonds = EXCLUDED.diamonds,
       inventory = EXCLUDED.inventory,
       tutorial_done = EXCLUDED.tutorial_done,
       owned_classes = EXCLUDED.owned_classes,
       daily_quests = EXCLUDED.daily_quests,
       updated_at = now()`,
    [
      guestId,
      save.coins,
      save.diamonds,
      JSON.stringify(save.inventory),
      save.tutorialDone,
      JSON.stringify(save.ownedClasses),
      JSON.stringify(save.dailyQuests),
    ],
  );
  return save;
}
