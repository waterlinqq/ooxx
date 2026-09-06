import { BOARD_MODES } from './units.js';
import {
  DAILY_QUEST_REWARD,
  DAILY_QUEST_MODES,
  getTodayKey,
  isDailyQuestMode,
} from '@ooxx/shared/dailyQuests.js';

export { DAILY_QUEST_REWARD, DAILY_QUEST_MODES, getTodayKey, isDailyQuestMode };

export function getDailyQuestDefinitions() {
  return DAILY_QUEST_MODES.map((modeId) => ({
    modeId,
    label: BOARD_MODES[modeId]?.label ?? modeId,
    reward: DAILY_QUEST_REWARD,
  }));
}
