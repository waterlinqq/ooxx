export const UI_ANIM_IN_MS = 350;
export const UI_ANIM_OUT_MS = 450;

const CARD_TONE_CLASSES = [
  'ui-card--blue',
  'ui-card--red',
  'ui-card--success',
  'ui-card--error',
];

/** @type {ReturnType<typeof setTimeout> | null} */
let alertDismissTimer = null;
/** @type {(() => void) | null} */
let alertResolve = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let confirmDismissTimer = null;
/** @type {((confirmed: boolean) => void) | null} */
let confirmResolve = null;

const alertOverlayEl = document.getElementById('alertOverlay');
const alertMessageEl = document.getElementById('alertMessage');
const alertOkBtn = document.getElementById('alertOkBtn');
const confirmOverlayEl = document.getElementById('confirmOverlay');
const confirmMessageEl = document.getElementById('confirmMessage');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmOkBtn = document.getElementById('confirmOkBtn');

function hideAlertOverlay() {
  if (alertDismissTimer) {
    clearTimeout(alertDismissTimer);
    alertDismissTimer = null;
  }
  alertOverlayEl.classList.add('hidden');
  alertOverlayEl.classList.remove('ui-visible', 'ui-dismiss');
}

function finishAlert() {
  alertOverlayEl.classList.remove('ui-visible');
  alertOverlayEl.classList.add('ui-dismiss');
  alertDismissTimer = window.setTimeout(() => {
    hideAlertOverlay();
    alertResolve?.();
    alertResolve = null;
  }, UI_ANIM_OUT_MS);
}

alertOkBtn?.addEventListener('click', finishAlert);

function hideConfirmOverlay() {
  if (confirmDismissTimer) {
    clearTimeout(confirmDismissTimer);
    confirmDismissTimer = null;
  }
  confirmOverlayEl.classList.add('hidden');
  confirmOverlayEl.classList.remove('ui-visible', 'ui-dismiss');
}

function finishConfirm(confirmed) {
  confirmOverlayEl.classList.remove('ui-visible');
  confirmOverlayEl.classList.add('ui-dismiss');
  confirmDismissTimer = window.setTimeout(() => {
    hideConfirmOverlay();
    confirmResolve?.(confirmed);
    confirmResolve = null;
  }, UI_ANIM_OUT_MS);
}

confirmCancelBtn?.addEventListener('click', () => finishConfirm(false));
confirmOkBtn?.addEventListener('click', () => finishConfirm(true));

/** @param {string} message */
export function showConfirm(message) {
  return new Promise((resolve) => {
    if (confirmDismissTimer) {
      clearTimeout(confirmDismissTimer);
      confirmDismissTimer = null;
    }
    confirmResolve = resolve;
    confirmMessageEl.textContent = message;
    confirmOverlayEl.classList.remove('hidden', 'ui-dismiss');
    void confirmOverlayEl.offsetWidth;
    confirmOverlayEl.classList.add('ui-visible');
  });
}

/** @param {string} message */
export function showAlert(message) {
  return new Promise((resolve) => {
    if (alertDismissTimer) {
      clearTimeout(alertDismissTimer);
      alertDismissTimer = null;
    }
    alertResolve = resolve;
    alertMessageEl.textContent = message;
    alertOverlayEl.classList.remove('hidden', 'ui-dismiss');
    void alertOverlayEl.offsetWidth;
    alertOverlayEl.classList.add('ui-visible');
  });
}

/**
 * @param {HTMLElement} rootEl
 * @param {string[]} [variantClasses]
 */
export function hideTimedOverlay(rootEl, variantClasses = []) {
  rootEl.classList.add('hidden');
  rootEl.classList.remove('ui-visible', 'ui-dismiss', ...variantClasses);
  const card = rootEl.querySelector('.ui-card');
  if (card) {
    for (const cls of CARD_TONE_CLASSES) card.classList.remove(cls);
  }
}

/**
 * @param {HTMLElement} rootEl
 * @param {{
 *   showMs: number,
 *   fadeMs?: number,
 *   onHide?: () => void,
 *   setup?: () => void,
 *   variantClasses?: string[],
 * }} options
 * @returns {{ clear: () => void }}
 */
export function showTimedOverlay(rootEl, {
  showMs,
  fadeMs = UI_ANIM_OUT_MS,
  onHide,
  setup,
  variantClasses = [],
}) {
  let showTimer = null;
  let fadeTimer = null;

  const clear = () => {
    if (showTimer) clearTimeout(showTimer);
    if (fadeTimer) clearTimeout(fadeTimer);
    showTimer = null;
    fadeTimer = null;
    hideTimedOverlay(rootEl, variantClasses);
  };

  clear();
  setup?.();
  rootEl.classList.remove('hidden', 'ui-dismiss', ...variantClasses);
  const card = rootEl.querySelector('.ui-card');
  if (card) {
    for (const cls of CARD_TONE_CLASSES) card.classList.remove(cls);
    for (const cls of variantClasses) card.classList.add(cls);
  }
  void rootEl.offsetWidth;
  rootEl.classList.add('ui-visible');

  showTimer = window.setTimeout(() => {
    rootEl.classList.remove('ui-visible');
    rootEl.classList.add('ui-dismiss');
    fadeTimer = window.setTimeout(() => {
      clear();
      onHide?.();
    }, fadeMs);
  }, showMs);

  return { clear };
}

/**
 * @param {HTMLElement} rootEl
 * @param {{
 *   fadeMs?: number,
 *   onHide?: () => void,
 *   variantClasses?: string[],
 * }} [options]
 */
export function dismissTimedOverlay(rootEl, {
  fadeMs = UI_ANIM_OUT_MS,
  onHide,
  variantClasses = [],
} = {}) {
  rootEl.classList.remove('ui-visible');
  rootEl.classList.add('ui-dismiss');
  window.setTimeout(() => {
    hideTimedOverlay(rootEl, variantClasses);
    onHide?.();
  }, fadeMs);
}

/**
 * @param {HTMLElement} rootEl
 * @param {() => void} [setup]
 */
export function revealOverlay(rootEl, setup) {
  setup?.();
  rootEl.classList.remove('hidden', 'ui-dismiss');
  void rootEl.offsetWidth;
  rootEl.classList.add('ui-visible');
}
