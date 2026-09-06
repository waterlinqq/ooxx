import { buildNavIconModel } from './NavIconModels.js';
import {
  PREVIEW_ROTATION_Y,
  setupBakeScene,
  setupBakeCamera,
  fitBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from './ThumbnailBake.js';

export const NAV_THUMB_SIZE = 256;
const FRAME_PADDING = 0.92;

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) {
      obj.geometry.dispose();
    }
    if (!obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

export function bakeNavThumbnail(renderer, scene, camera, navId) {
  const root = buildNavIconModel(navId);
  if (!root) return false;

  if (!root.rotation.y) root.rotation.y = PREVIEW_ROTATION_Y;
  root.scale.setScalar(1.12);
  scene.add(root);
  fitBakeCamera(camera, root, FRAME_PADDING);
  renderer.render(scene, camera);
  scene.remove(root);
  disposeObject(root);
  return true;
}

export function generateNavThumbnails(navIds, { renderer, scene, camera } = {}) {
  const ownsRenderer = !renderer;
  let envMap;
  let pmrem;
  if (ownsRenderer) {
    renderer = createBakeRenderer(NAV_THUMB_SIZE, NAV_THUMB_SIZE);
    ({ scene, envMap, pmrem } = setupBakeScene(renderer));
    camera = setupBakeCamera(0.12);
  }

  const thumbnails = new Map();
  for (const navId of navIds) {
    if (!bakeNavThumbnail(renderer, scene, camera, navId)) continue;
    thumbnails.set(navId, renderer.domElement.toDataURL('image/png'));
  }

  if (ownsRenderer) {
    disposeBakeResources({ envMap, pmrem, renderer });
  }

  return thumbnails;
}

const NAV_LABELS = {
  battle: '戰鬥',
  formation: '編組',
  codex: '圖鑑',
  quests: '任務',
  shop: '商店',
};

export function applyNavIcons(navEl, thumbnails) {
  for (const btn of navEl.querySelectorAll('.nav-item[data-nav]')) {
    const navId = btn.dataset.nav;
    const iconEl = btn.querySelector('.nav-icon');
    if (!iconEl) continue;

    const src = thumbnails.get(navId);
    iconEl.replaceChildren();
    if (src) {
      const img = document.createElement('img');
      img.className = 'nav-thumb';
      img.src = src;
      img.alt = '';
      img.draggable = false;
      iconEl.appendChild(img);
    }

    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', NAV_LABELS[navId] ?? navId);
    }
  }
}
