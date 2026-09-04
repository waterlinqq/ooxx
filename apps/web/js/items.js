/** @typedef {'potion'|'bomb'} ItemId */

export const ITEM_IDS = ['potion', 'bomb'];

export const ITEMS = {
  potion: {
    id: 'potion',
    name: '紅藥水',
    icon: '🧪',
    desc: '選定一個場上己方單位，恢復 2 點生命',
    effect: { type: 'heal', amount: 2 },
    targeting: 'friendly_unit',
  },
  bomb: {
    id: 'bomb',
    name: '炸彈',
    icon: '💣',
    desc: '在空格放置，下一回合開始時該格單位受到 2 點傷害',
    effect: { type: 'trap', damage: 2 },
    targeting: 'empty_cell',
  },
};

export const SHOP_PRICES = { potion: 20, bomb: 35 };

export const COIN_REWARDS = {
  '3x3': { win: 30, loss: 10 },
  '4x4': { win: 50, loss: 15 },
  '5x5': { win: 80, loss: 20 },
};

export const STARTING_COINS = 1000;

export function getItem(id) {
  return ITEMS[id] ?? null;
}

export function getCoinReward(boardMode, didWin) {
  const table = COIN_REWARDS[boardMode] ?? COIN_REWARDS['3x3'];
  return didWin ? table.win : table.loss;
}
