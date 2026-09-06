import { pool } from '../db.js';
import { CLASS_IDS, CLASS_LEVEL_MIN, clampClassLevel } from '../../../shared/units.js';

const STARTER_CLASSES = ['archer', 'swordsman', 'shield', 'castle'];
const DEFAULT_COINS = 1000;
const DEFAULT_DIAMONDS = 0;

const ITEM_IDS = ['potion', 'bomb', 'landmine'];
const DAILY_QUEST_MODES = ['3x3', '4x4', '5x5', '6x6'];

function createDefaultInventory() {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0]));
}

function createDefaultClassProgress() {
  return { level: CLASS_LEVEL_MIN, copies: 0, fragments: 0 };
}

function normalizeClassProgressEntry(raw) {
  const copies = typeof raw?.copies === 'number' && raw.copies > 0 ? Math.floor(raw.copies) : 0;
  const fragments = typeof raw?.fragments === 'number' && raw.fragments > 0 ? Math.floor(raw.fragments) : 0;
  return {
    level: clampClassLevel(raw?.level ?? CLASS_LEVEL_MIN),
    copies,
    fragments,
  };
}

function normalizeClassProgress(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  /** @type {Record<string, { level: number, copies: number, fragments: number }>} */
  const progress = {};
  for (const classId of CLASS_IDS) {
    progress[classId] = source[classId]
      ? normalizeClassProgressEntry(source[classId])
      : createDefaultClassProgress();
  }
  return progress;
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
    classProgress: normalizeClassProgress(raw?.classProgress ?? raw?.class_progress),
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
    classProgress: row.class_progress,
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
    `INSERT INTO saves (guest_id, coins, diamonds, inventory, tutorial_done, owned_classes, daily_quests, class_progress)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      guestId,
      defaults.coins,
      defaults.diamonds,
      JSON.stringify(defaults.inventory),
      defaults.tutorialDone,
      JSON.stringify(defaults.ownedClasses),
      JSON.stringify(defaults.dailyQuests),
      JSON.stringify(defaults.classProgress),
    ],
  );
  return defaults;
}

export async function putSave(guestId, payload) {
  const save = normalizeSave(payload);
  await pool.query(
    `INSERT INTO saves (guest_id, coins, diamonds, inventory, tutorial_done, owned_classes, daily_quests, class_progress, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (guest_id) DO UPDATE SET
       coins = EXCLUDED.coins,
       diamonds = EXCLUDED.diamonds,
       inventory = EXCLUDED.inventory,
       tutorial_done = EXCLUDED.tutorial_done,
       owned_classes = EXCLUDED.owned_classes,
       daily_quests = EXCLUDED.daily_quests,
       class_progress = EXCLUDED.class_progress,
       updated_at = now()`,
    [
      guestId,
      save.coins,
      save.diamonds,
      JSON.stringify(save.inventory),
      save.tutorialDone,
      JSON.stringify(save.ownedClasses),
      JSON.stringify(save.dailyQuests),
      JSON.stringify(save.classProgress),
    ],
  );
  return save;
}
