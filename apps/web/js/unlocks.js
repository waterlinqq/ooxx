import { CLASS_IDS, CLASSES } from './units.js';

export const STARTER_CLASSES = ['archer', 'swordsman', 'shield'];

const DEFAULT_UNLOCK_PRICE = 100;

/** @type {Record<string, number>} */
export const UNLOCK_PRICES = Object.fromEntries(
  CLASS_IDS
    .filter((id) => !STARTER_CLASSES.includes(id) && !CLASSES[id]?.boardOnly)
    .map((id) => [id, DEFAULT_UNLOCK_PRICE]),
);

export function isStarterClass(classId) {
  return STARTER_CLASSES.includes(classId);
}

export function isUnlockable(classId) {
  return Object.prototype.hasOwnProperty.call(UNLOCK_PRICES, classId);
}

export function getUnlockPrice(classId) {
  const price = UNLOCK_PRICES[classId];
  return typeof price === 'number' ? price : null;
}
