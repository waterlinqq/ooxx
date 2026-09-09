/** @typedef {'potion'|'bomb'|'landmine'} ItemId */

import { RARITY } from '@ooxx/shared/units.js';

export const ITEM_RARITY = 'normal';

export const ITEM_IDS = ['potion', 'bomb', 'landmine'];

export const ITEMS = {
  potion: {
    id: 'potion',
    name: '紅藥水',
    icon: '🧪',
    rarity: ITEM_RARITY,
    desc: '丟在空格成為地圖紅藥水，或點己方單位直接恢復 3 點生命',
    effect: { type: 'heal', amount: 3 },
    targeting: 'empty_cell',
  },
  bomb: {
    id: 'bomb',
    name: '炸彈',
    icon: '💣',
    rarity: ITEM_RARITY,
    desc: '在空格放置，下一回合開始時該格單位受到 3 點傷害',
    effect: { type: 'trap', damage: 3 },
    targeting: 'empty_cell',
  },
  landmine: {
    id: 'landmine',
    name: '地雷',
    icon: '🪤',
    rarity: ITEM_RARITY,
    desc: '在空格放置，敵方不可見；單位走上去時受到 2 點傷害',
    effect: { type: 'step_trap', damage: 2 },
    targeting: 'empty_cell',
  },
};

export const SHOP_PRICES = { potion: 20, bomb: 35, landmine: 30 };

export const COIN_REWARDS = {
  '3x3': { win: 30, loss: 10 },
  '4x4': { win: 50, loss: 15 },
  '5x5': { win: 80, loss: 20 },
};

export const STARTING_COINS = 1000;
export const STARTING_DIAMONDS = 0;

export const FRAGMENT_PRICE = 50;

export function getItem(id) {
  return ITEMS[id] ?? null;
}

export function getItemRarity(itemId) {
  return ITEMS[itemId]?.rarity ?? ITEM_RARITY;
}

export function getItemRarityLabel(itemId) {
  return RARITY[getItemRarity(itemId)]?.label ?? RARITY.normal.label;
}

export function getCoinReward(boardMode, didWin) {
  const table = COIN_REWARDS[boardMode] ?? COIN_REWARDS['3x3'];
  return didWin ? table.win : table.loss;
}
