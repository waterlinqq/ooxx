import { clampClassLevel, CLASS_LEVEL_MIN } from './units.js';

const ICONS = {
  level: `
    <path d="M8 1.35 9.82 5.3l4.28.62-3.1 3.02.73 4.26L8 11.77l-3.73 1.96.73-4.26-3.1-3.02 4.28-.62L8 1.35Z" fill="currentColor" stroke="#ca8a04" stroke-width="0.45" stroke-linejoin="round"/>
  `,
  hp: `
    <path d="M8 2.1s-4.2 4.35-4.2 6.95c0 1.95 1.75 3.75 4.2 4.75 2.45-1 4.2-2.8 4.2-4.75C12.2 6.45 8 2.1 8 2.1Z" fill="currentColor"/>
    <ellipse cx="6.35" cy="6.15" rx="1.05" ry="1.45" fill="rgba(255,255,255,0.28)" transform="rotate(-24 6.35 6.15)"/>
  `,
  atk: `
    <path d="M8 1.2v8.35" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    <path d="M6.15 3.05 8 1.2l1.85 1.85" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.35 9.55h5.3" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    <path d="M7.15 9.55v3.25M8.85 9.55v3.25" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
  `,
};

function normalizeStatValue(type, value) {
  if (type === 'level') return clampClassLevel(value ?? CLASS_LEVEL_MIN);
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function statIconSvg(type, size) {
  const inner = ICONS[type] ?? '';
  const sizeAttrs = size == null ? '' : ` width="${size}" height="${size}"`;
  return `<svg class="stat-icon stat-icon--${type}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"${sizeAttrs} aria-hidden="true">${inner}</svg>`;
}

export function renderStatBadgeHtml(type, value, { size } = {}) {
  const display = normalizeStatValue(type, value);
  const icon = size == null
    ? `<span class="stat-icon-wrap">${statIconSvg(type)}</span>`
    : statIconSvg(type, size);
  return `<span class="stat-badge stat-badge--${type}">${icon}<span class="stat-badge-value">${display}</span></span>`;
}

export function createStatBadge(type, value, { size, className = '' } = {}) {
  const el = document.createElement('span');
  applyStatBadge(el, type, value, { size, className });
  return el;
}

export function applyStatBadge(el, type, value, { size, className = '' } = {}) {
  if (!el) return;
  const display = normalizeStatValue(type, value);
  el.className = ['stat-badge', `stat-badge--${type}`, className].filter(Boolean).join(' ');
  const icon = size == null
    ? `<span class="stat-icon-wrap">${statIconSvg(type)}</span>`
    : statIconSvg(type, size);
  el.innerHTML = `${icon}<span class="stat-badge-value">${display}</span>`;
}
