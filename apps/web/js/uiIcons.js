const ICONS = {
  coin: `
    <circle cx="8" cy="8" r="6.35" fill="currentColor" stroke="#ca8a04" stroke-width="0.5"/>
    <circle cx="8" cy="8" r="4.35" fill="none" stroke="#92400e" stroke-width="0.45" opacity="0.55"/>
    <ellipse cx="6.35" cy="6.1" rx="2.1" ry="1.15" fill="rgba(255,255,255,0.34)"/>
    <path d="M8 5.1v6M5.55 8h4.9" stroke="#92400e" stroke-width="0.55" stroke-linecap="round" opacity="0.45"/>
  `,
  diamond: `
    <path d="M8 1.6 12.8 6.2 8 14.2 3.2 6.2Z" fill="currentColor" stroke="currentColor" stroke-width="0.45" stroke-opacity="0.55" stroke-linejoin="round"/>
    <path d="M3.2 6.2h9.6" stroke="currentColor" stroke-width="0.4" stroke-opacity="0.45"/>
    <path d="M5.4 6.2 8 1.6l2.6 4.6M6.7 6.2 8 14.2l1.3-8" stroke="rgba(255,255,255,0.32)" stroke-width="0.35"/>
  `,
  surrender: `
    <path d="M3.8 1.8v12.4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
    <path d="M3.8 2.2h8.1c.55 0 .85.62.52 1.03l-1.45 1.72 1.45 1.72c.33.41.03 1.03-.52 1.03H3.8" fill="currentColor" stroke="currentColor" stroke-width="0.35" stroke-linejoin="round"/>
    <path d="M3.8 2.2v6.47" stroke="rgba(255,255,255,0.35)" stroke-width="0.45"/>
  `,
  inspect: `
    <circle cx="6.8" cy="6.8" r="4.15" fill="none" stroke="currentColor" stroke-width="1.45"/>
    <path d="M9.9 9.9 13.3 13.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  `,
};

export function uiIconSvg(type, size) {
  const inner = ICONS[type] ?? '';
  const sizeAttrs = size == null ? '' : ` width="${size}" height="${size}"`;
  return `<svg class="ui-icon-svg ui-icon-svg--${type}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"${sizeAttrs} aria-hidden="true">${inner}</svg>`;
}

export function applyUiIcon(el, type, { size, extraClass = '' } = {}) {
  if (!el) return;
  const keep = [...el.classList].filter((c) => !c.startsWith('ui-icon'));
  el.className = [...keep, 'ui-icon', `ui-icon--${type}`, extraClass].filter(Boolean).join(' ');
  el.innerHTML = uiIconSvg(type, size);
}

export function mountUiIcons(root = document) {
  for (const el of root.querySelectorAll('[data-ui-icon]')) {
    applyUiIcon(el, el.dataset.uiIcon, { size: el.dataset.uiIconSize ? Number(el.dataset.uiIconSize) : undefined });
  }
}

export function renderCurrencyMetaHtml(currency, amount, { prefix = '' } = {}) {
  const type = currency === 'diamond' ? 'diamond' : 'coin';
  return `<span class="currency-meta currency-meta--${type}">${uiIconSvg(type)}<span class="currency-meta-value">${prefix}${amount}</span></span>`;
}

export function setCurrencyMeta(el, currency, amount, { prefix = '' } = {}) {
  if (!el) return;
  const type = currency === 'diamond' ? 'diamond' : 'coin';
  el.className = `item-row-meta currency-meta currency-meta--${type}`;
  el.innerHTML = `${uiIconSvg(type)}<span class="currency-meta-value">${prefix}${amount}</span>`;
}
