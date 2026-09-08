import { buildModeIconModel } from './ModeIconModels.js';
import {
  PREVIEW_ROTATION_Y,
  setupBakeScene,
  setupBakeCamera,
  fitBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from './ThumbnailBake.js';

export const MODE_THUMB_SIZE = 256;
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

export function bakeModeThumbnail(renderer, scene, camera, modeId) {
  const root = buildModeIconModel(modeId);
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

export function generateModeThumbnails(modeIds, { renderer, scene, camera } = {}) {
  const ownsRenderer = !renderer;
  let envMap;
  let pmrem;
  if (ownsRenderer) {
    renderer = createBakeRenderer(MODE_THUMB_SIZE, MODE_THUMB_SIZE);
    ({ scene, envMap, pmrem } = setupBakeScene(renderer));
    camera = setupBakeCamera(0.12);
  }

  const thumbnails = new Map();
  for (const modeId of modeIds) {
    if (!bakeModeThumbnail(renderer, scene, camera, modeId)) continue;
    thumbnails.set(modeId, renderer.domElement.toDataURL('image/png'));
  }

  if (ownsRenderer) {
    disposeBakeResources({ envMap, pmrem, renderer });
  }

  return thumbnails;
}

export function createModeThumbIcon(modeId, src) {
  const wrap = document.createElement('span');
  wrap.className = 'mode-btn-icon';
  wrap.setAttribute('aria-hidden', 'true');

  if (src) {
    const img = document.createElement('img');
    img.className = 'mode-btn-thumb';
    img.src = src;
    img.alt = '';
    img.draggable = false;
    wrap.appendChild(img);
  } else {
    wrap.classList.add('mode-btn-icon--fallback');
  }

  return wrap;
}
