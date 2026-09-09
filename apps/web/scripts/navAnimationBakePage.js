import { NAV_ICON_IDS } from '../js/board3d/NavIconModels.js';
import { bakeNavAnimationFrames } from '../js/board3d/NavAnimationBake.js';

const animations = {};
for (const navId of NAV_ICON_IDS) {
  animations[navId] = bakeNavAnimationFrames(navId);
}

window.__NAV_ANIM_BAKE__ = animations;
