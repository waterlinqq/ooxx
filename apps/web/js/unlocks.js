import { CLASS_IDS, CLASSES } from './units.js';
import { STARTER_CLASSES } from '@ooxx/shared/save.js';

export { STARTER_CLASSES };

export const CLASS_DIAMOND_PRICE = 100;

/** @type {Record<string, number>} */
export const UNLOCK_PRICES = Object.fromEntries(
  CLASS_IDS
    .filter((id) => !STARTER_CLASSES.includes(id) && id !== 'castle')
    .map((id) => [id, CLASS_DIAMOND_PRICE]),
);

export function isStarterClass(classId) {
  return STARTER_CLASSES.includes(classId);
}

export function isUnlockable(classId) {
  return Object.prototype.hasOwnProperty.call(UNLOCK_PRICES, classId);
}

export function getUnlockPrice(classId) {
  return getClassDiamondPrice(classId);
}

export function getClassDiamondPrice(classId) {
  if (!CLASSES[classId]) return null;
  return CLASS_DIAMOND_PRICE;
}
