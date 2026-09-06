import { pool } from '../db.js';
import { createDefaultSave, normalizeSave } from '../../../shared/save.js';

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

export { normalizeSave };

export async function getSave(guestId) {
  const { rows } = await pool.query(
    'SELECT * FROM saves WHERE guest_id = $1',
    [guestId],
  );
  if (rows[0]) return rowToSave(rows[0]);

  const defaults = createDefaultSave();
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
