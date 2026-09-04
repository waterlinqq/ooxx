/**
 * Scripted 3x3 onboarding match. Both rosters and every enemy reply are fixed, so the
 * tutorial never calls the AI and always plays out identically.
 *
 * Each step is one player action followed by one scripted red reply. The board the
 * script walks through (row 0 on top, blue = B, red = R):
 *
 *   step 1        step 2         step 3          step 4
 *   . . .         . . .          . . .           . . .
 *   . B R         . B .          B B .           B B B   <- winning line
 *   . . .         . R .          . R .           . R .
 *
 * Red's shield sits off the middle row on purpose: it can only chip the swordsman for
 * 1 damage, which is what step 3 teaches, and it never blocks the line step 4 needs.
 */

export const TUTORIAL_BOARD_MODE = '3x3';

export const TUTORIAL_BLUE_ROSTER = ['archer', 'swordsman', 'shield'];
export const TUTORIAL_RED_ROSTER = ['archer', 'shield'];

export const TUTORIAL_STEPS = [
  {
    title: '部署單位',
    text: '點下方後備區的劍士，再點棋盤中央亮起的格子，把它放上場。',
    goal: { type: 'deploy', classId: 'swordsman', row: 1, col: 1 },
    enemy: {
      type: 'deploy',
      classId: 'archer',
      row: 1,
      col: 2,
      label: '紅隊部署弓箭手',
      note: '紅隊也部署了一名弓箭手，正好落在你的劍士右邊。',
    },
  },
  {
    title: '攻擊',
    text: '點你的劍士選起來，再點紅格上的弓箭手。劍士攻擊力 3，剛好一擊消滅生命值 3 的弓箭手。',
    goal: { type: 'attack', from: { row: 1, col: 1 }, to: { row: 1, col: 2 } },
    enemy: {
      type: 'deploy',
      classId: 'shield',
      row: 2,
      col: 1,
      label: '紅隊部署盾牌手',
      note: '紅隊補上盾牌手：生命值 8 很難打死，但攻擊力只有 1。',
    },
  },
  {
    title: '搶下第二格',
    text: '把盾牌手部署到中間橫排的最左邊，開始佈置你的連線。',
    goal: { type: 'deploy', classId: 'shield', row: 1, col: 0 },
    enemy: {
      type: 'attack',
      from: { row: 2, col: 1 },
      to: { row: 1, col: 1 },
      label: '紅隊盾牌手攻擊',
      note: '盾牌手只打掉 1 點生命 — 你的劍士還有 4 點，沒有陣亡。',
    },
  },
  {
    title: '連成一線',
    text: '把弓箭手部署到中間橫排最右邊的空格。三個單位連成一線，你就獲勝了！',
    goal: { type: 'deploy', classId: 'archer', row: 1, col: 2 },
    enemy: null,
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

export function getTutorialStep(index) {
  return TUTORIAL_STEPS[index] ?? null;
}

/** True when `action` is exactly the move the current step asks for. */
export function matchesTutorialGoal(goal, action) {
  if (!goal || goal.type !== action.type) return false;

  if (goal.type === 'deploy') {
    return goal.classId === action.classId
      && goal.row === action.row
      && goal.col === action.col;
  }

  return goal.from.row === action.from.row
    && goal.from.col === action.from.col
    && goal.to.row === action.to.row
    && goal.to.col === action.to.col;
}
