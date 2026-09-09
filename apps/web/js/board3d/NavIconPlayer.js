import { navAnimationUrl } from './thumbnailPaths.js';
import { NAV_ANIMATORS, NAV_INTRO_MS } from './navIconAnimations.js';

export class NavIconPlayer {
  constructor(navEl) {
    this.navEl = navEl;
    this.active = null;
    this._idleTimer = null;
  }

  onNavChange(navId, { replay = false } = {}) {
    if (!NAV_ANIMATORS[navId]) {
      this.deactivate();
      return;
    }

    if (this.active?.navId === navId) {
      if (replay) this.playAnimation(navId);
      return;
    }

    this.deactivate();
    this.activate(navId);
  }

  activate(navId) {
    const btn = this.navEl.querySelector(`.nav-item[data-nav="${navId}"]`);
    const iconEl = btn?.querySelector('.nav-icon');
    if (!iconEl) return;

    const staticImg = iconEl.querySelector('.nav-thumb:not(.nav-thumb-animated)');
    if (staticImg) staticImg.classList.add('nav-thumb--hidden');

    let animImg = iconEl.querySelector('.nav-thumb-animated');
    if (!animImg) {
      animImg = document.createElement('img');
      animImg.className = 'nav-thumb nav-thumb-animated';
      animImg.alt = '';
      animImg.draggable = false;
      iconEl.appendChild(animImg);
    }

    this.active = { navId, iconEl, staticImg, animImg };
    this.playAnimation(navId);
  }

  playAnimation(navId) {
    if (!this.active || this.active.navId !== navId) return;

    const { animImg } = this.active;
    const introMs = NAV_INTRO_MS[navId] ?? 700;
    const introUrl = navAnimationUrl(navId, 'intro');
    const idleUrl = navAnimationUrl(navId, 'idle');

    clearTimeout(this._idleTimer);
    animImg.src = `${introUrl}&_=${Date.now()}`;

    this._idleTimer = setTimeout(() => {
      if (!this.active || this.active.navId !== navId) return;
      animImg.src = idleUrl;
    }, introMs);
  }

  deactivate() {
    clearTimeout(this._idleTimer);
    this._idleTimer = null;

    if (!this.active) return;

    const { iconEl, staticImg, animImg } = this.active;
    animImg?.remove();
    if (staticImg) staticImg.classList.remove('nav-thumb--hidden');

    this.active = null;
  }
}
