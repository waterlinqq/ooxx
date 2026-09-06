import { apiUrl } from './config.js';
import { getAuthToken, ensureGuestToken } from './guestAuth.js';
import { applySaveFromServer } from './save.js';
import { ITEMS } from './items.js';
import { CLASSES } from './units.js';
import { renderCurrencyMetaHtml } from './uiIcons.js';
import { revealOverlay, hideTimedOverlay, UI_ANIM_OUT_MS } from './ui.js';

const mailOverlayEl = document.getElementById('mailOverlay');
const mailListEl = document.getElementById('mailList');
const mailEmptyEl = document.getElementById('mailEmpty');
const mailCloseBtn = document.getElementById('mailCloseBtn');
const mailClaimAllBtn = document.getElementById('mailClaimAllBtn');

/** @type {{ messages: import('@ooxx/shared/mail.js').MailMessage[], unreadCount: number, unclaimedCount: number }} */
let mailState = { messages: [], unreadCount: 0, unclaimedCount: 0 };
/** @type {{ showToast?: (message: string, options?: { success?: boolean, html?: boolean }) => void, onClaim?: () => void } | null} */
let mailCallbacks = null;

async function authFetch(path, options = {}) {
  await ensureGuestToken();
  const token = getAuthToken();
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? data.reason ?? '請求失敗');
  }
  return data;
}

function updateMailState(data) {
  mailState = {
    messages: data.messages ?? [],
    unreadCount: data.unreadCount ?? 0,
    unclaimedCount: data.unclaimedCount ?? 0,
  };
}

export function updateMailBadge() {
  const btn = document.querySelector('.lobby-side-btn[data-side-action="mail"]');
  if (!btn) return;

  let badge = btn.querySelector('.lobby-side-badge');
  const count = mailState.unreadCount;
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'lobby-side-badge';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = false;
  } else if (badge) {
    badge.hidden = true;
  }
}

export async function refreshMailBadge() {
  try {
    const data = await authFetch('/api/mail');
    updateMailState(data);
    updateMailBadge();
    return data;
  } catch {
    updateMailState({ messages: [], unreadCount: 0, unclaimedCount: 0 });
    updateMailBadge();
    return mailState;
  }
}

/** @param {import('@ooxx/shared/mail.js').MailAttachment[]} attachments */
function formatAttachmentSummary(attachments) {
  if (!attachments.length) return '';

  const parts = [];
  let coins = 0;
  let diamonds = 0;
  /** @type {Record<string, number>} */
  const items = {};
  /** @type {Record<string, number>} */
  const fragments = {};

  for (const att of attachments) {
    if (att.type === 'coins') coins += att.amount;
    else if (att.type === 'diamonds') diamonds += att.amount;
    else if (att.type === 'item') items[att.itemId] = (items[att.itemId] ?? 0) + att.amount;
    else if (att.type === 'fragments') fragments[att.classId] = (fragments[att.classId] ?? 0) + att.amount;
  }

  if (coins > 0) parts.push(renderCurrencyMetaHtml('coin', coins, { prefix: '+' }));
  if (diamonds > 0) parts.push(renderCurrencyMetaHtml('diamond', diamonds, { prefix: '+' }));
  for (const [itemId, amount] of Object.entries(items)) {
    const item = ITEMS[itemId];
    parts.push(`${item?.name ?? itemId}${amount > 1 ? `×${amount}` : ''}`);
  }
  for (const [classId, amount] of Object.entries(fragments)) {
    const cls = CLASSES[classId];
    parts.push(`${cls?.name ?? classId}碎片${amount > 1 ? `×${amount}` : ''}`);
  }

  return parts.join(' ');
}

/** @param {import('@ooxx/shared/mail.js').MailAttachment[]} attachments */
function formatClaimToast(attachments) {
  const summary = formatAttachmentSummary(attachments);
  return summary ? `已領取 ${summary}` : '已領取';
}

function closeMailModal() {
  mailOverlayEl.classList.remove('ui-visible');
  mailOverlayEl.classList.add('ui-dismiss');
  window.setTimeout(() => {
    hideTimedOverlay(mailOverlayEl);
  }, UI_ANIM_OUT_MS);
}

function renderMailList() {
  if (!mailListEl || !mailEmptyEl) return;

  mailListEl.innerHTML = '';
  const hasMessages = mailState.messages.length > 0;
  mailEmptyEl.classList.toggle('hidden', hasMessages);
  mailClaimAllBtn?.classList.toggle('hidden', mailState.unclaimedCount <= 0);

  for (const msg of mailState.messages) {
    mailListEl.appendChild(createMailRow(msg));
  }
}

/** @param {import('@ooxx/shared/mail.js').MailMessage} msg */
function createMailRow(msg) {
  const hasAttachments = msg.attachments.length > 0;
  const canClaim = hasAttachments && !msg.claimed;
  const row = document.createElement('div');
  row.className = 'item-row mail-row';
  if (msg.claimed || (!hasAttachments && msg.read)) row.classList.add('item-row--muted');
  if (!msg.read) row.classList.add('mail-row--unread');

  const body = document.createElement('div');
  body.className = 'item-row-body';
  const nameEl = document.createElement('span');
  nameEl.className = 'item-row-name';
  nameEl.textContent = msg.title;
  const descEl = document.createElement('span');
  descEl.className = 'item-row-desc';
  descEl.textContent = msg.body || (hasAttachments ? '點擊領取附件' : '系統通知');
  body.append(nameEl, descEl);

  const trailing = document.createElement('div');
  trailing.className = 'mail-row-trailing';

  if (hasAttachments) {
    const rewardMeta = document.createElement('span');
    rewardMeta.className = 'item-row-meta mail-row-reward';
    rewardMeta.innerHTML = formatAttachmentSummary(msg.attachments);
    trailing.appendChild(rewardMeta);
  }

  if (msg.claimed || (!canClaim && msg.read && !hasAttachments)) {
    const doneMeta = document.createElement('span');
    doneMeta.className = 'item-row-meta item-row-meta-owned';
    doneMeta.textContent = '✓';
    trailing.appendChild(doneMeta);
  }

  if (canClaim) {
    row.classList.add('mail-row--clickable');
    row.addEventListener('click', () => handleClaimMail(msg.id, row));
  } else if (!msg.read) {
    row.classList.add('mail-row--clickable');
    row.addEventListener('click', () => handleReadMail(msg.id));
  }

  row.append(body, trailing);
  return row;
}

async function handleReadMail(mailId) {
  try {
    const data = await authFetch(`/api/mail/${mailId}/read`, { method: 'POST', body: '{}' });
    updateMailState(data);
    renderMailList();
    updateMailBadge();
  } catch (e) {
    mailCallbacks?.showToast?.(e.message ?? '標記已讀失敗', { success: false });
  }
}

async function handleClaimMail(mailId, row) {
  if (row.dataset.busy) return;
  row.dataset.busy = '1';
  try {
    const data = await authFetch(`/api/mail/${mailId}/claim`, { method: 'POST', body: '{}' });
    if (data.save) applySaveFromServer(data.save);
    updateMailState(data);
    renderMailList();
    updateMailBadge();
    mailCallbacks?.showToast?.(formatClaimToast(data.summary ?? []), { html: true });
    mailCallbacks?.onClaim?.();
  } catch (e) {
    delete row.dataset.busy;
    mailCallbacks?.showToast?.(e.message ?? '領取失敗', { success: false });
  }
}

async function handleClaimAllMail() {
  if (!mailClaimAllBtn) return;
  mailClaimAllBtn.disabled = true;
  try {
    const data = await authFetch('/api/mail/claim-all', { method: 'POST', body: '{}' });
    if (data.save) applySaveFromServer(data.save);
    updateMailState(data);
    renderMailList();
    updateMailBadge();
    mailCallbacks?.showToast?.(formatClaimToast(data.summary ?? []), { html: true });
    mailCallbacks?.onClaim?.();
  } catch (e) {
    mailCallbacks?.showToast?.(e.message ?? '領取失敗', { success: false });
  } finally {
    mailClaimAllBtn.disabled = false;
  }
}

export async function openMailModal(callbacks = {}) {
  mailCallbacks = callbacks;
  try {
    const data = await authFetch('/api/mail');
    updateMailState(data);
    renderMailList();
    updateMailBadge();
    revealOverlay(mailOverlayEl);
  } catch (e) {
    callbacks.showToast?.(e.message ?? '無法載入信箱', { success: false });
  }
}

export function initMail() {
  mailCloseBtn?.addEventListener('click', closeMailModal);
  mailClaimAllBtn?.addEventListener('click', handleClaimAllMail);
  mailOverlayEl?.addEventListener('click', (e) => {
    if (e.target === mailOverlayEl) closeMailModal();
  });
}
