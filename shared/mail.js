import { ITEM_IDS } from './save.js';
import { CLASS_IDS, CLASSES } from './units.js';

/** @typedef {{ type: 'coins'|'diamonds', amount: number }} CurrencyAttachment */
/** @typedef {{ type: 'item', itemId: string, amount: number }} ItemAttachment */
/** @typedef {{ type: 'fragments', classId: string, amount: number }} FragmentAttachment */
/** @typedef {CurrencyAttachment | ItemAttachment | FragmentAttachment} MailAttachment */

/** @typedef {{ id: string, title: string, body: string, attachments: MailAttachment[], read: boolean, claimed: boolean, createdAt: string }} MailMessage */

/** @param {unknown} raw @returns {MailAttachment | null} */
export function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const type = raw.type;
  if (type === 'coins' || type === 'diamonds') {
    const amount = typeof raw.amount === 'number' && raw.amount > 0 ? Math.floor(raw.amount) : 0;
    if (amount <= 0) return null;
    return { type, amount };
  }

  if (type === 'item') {
    const itemId = typeof raw.itemId === 'string' && ITEM_IDS.includes(raw.itemId) ? raw.itemId : null;
    const amount = typeof raw.amount === 'number' && raw.amount > 0 ? Math.floor(raw.amount) : 0;
    if (!itemId || amount <= 0) return null;
    return { type, itemId, amount };
  }

  if (type === 'fragments') {
    const classId = typeof raw.classId === 'string' && CLASS_IDS.includes(raw.classId) && CLASSES[classId]
      ? raw.classId
      : null;
    const amount = typeof raw.amount === 'number' && raw.amount > 0 ? Math.floor(raw.amount) : 0;
    if (!classId || amount <= 0) return null;
    return { type, classId, amount };
  }

  return null;
}

/** @param {unknown} raw @returns {MailAttachment[]} */
export function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAttachment).filter(Boolean);
}

/** @param {unknown} attachments */
export function hasClaimableAttachments(attachments) {
  return normalizeAttachments(attachments).length > 0;
}

/** @param {{ id: string, title: string, body?: string, attachments: unknown, read_at: string | null, claimed_at: string | null, created_at: string }} row @returns {MailMessage} */
export function rowToMailMessage(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? '',
    attachments: normalizeAttachments(row.attachments),
    read: row.read_at != null,
    claimed: row.claimed_at != null,
    createdAt: row.created_at,
  };
}
