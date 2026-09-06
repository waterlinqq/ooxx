import { buildSideIconModel } from './SideIconModels.js';
import {
  PREVIEW_ROTATION_Y,
  setupBakeScene,
  setupBakeCamera,
  fitBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from './ThumbnailBake.js';

export const SIDE_THUMB_SIZE = 192;
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

export function bakeSideThumbnail(renderer, scene, camera, iconId) {
  const root = buildSideIconModel(iconId);
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

export function generateSideThumbnails(iconIds, { renderer, scene, camera } = {}) {
  const ownsRenderer = !renderer;
  let envMap;
  let pmrem;
  if (ownsRenderer) {
    renderer = createBakeRenderer(SIDE_THUMB_SIZE, SIDE_THUMB_SIZE);
    ({ scene, envMap, pmrem } = setupBakeScene(renderer));
    camera = setupBakeCamera(0.12);
  }

  const thumbnails = new Map();
  for (const iconId of iconIds) {
    if (!bakeSideThumbnail(renderer, scene, camera, iconId)) continue;
    thumbnails.set(iconId, renderer.domElement.toDataURL('image/png'));
  }

  if (ownsRenderer) {
    disposeBakeResources({ envMap, pmrem, renderer });
  }

  return thumbnails;
}

const SIDE_LABELS = {
  friends: '好友',
  mail: '信箱',
  settings: '設定',
  account: '帳號',
};

export function applySideIcons(rootEl, thumbnails) {
  for (const btn of rootEl.querySelectorAll('.lobby-side-btn[data-side-action]')) {
    const iconId = btn.dataset.sideAction;
    const iconEl = btn.querySelector('.lobby-side-icon');
    if (!iconEl) continue;

    const src = thumbnails.get(iconId);
    iconEl.replaceChildren();
    if (src) {
      const img = document.createElement('img');
      img.className = 'lobby-side-thumb';
      img.src = src;
      img.alt = '';
      img.draggable = false;
      iconEl.appendChild(img);
    }

    const label = SIDE_LABELS[iconId] ?? iconId;
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', label);
    }
  }
}
