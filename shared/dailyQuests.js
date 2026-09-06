export const DAILY_QUEST_REWARD = 10;
export const DAILY_QUEST_MODES = ['3x3', '4x4', '5x5', '6x6'];

export function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDailyQuestMode(modeId) {
  return DAILY_QUEST_MODES.includes(modeId);
}
