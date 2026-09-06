import { buildUnitModel, disposeUnitMaterials } from './UnitModels.js';
import {
  PREVIEW_ROTATION_Y,
  setupBakeScene,
  setupBakeCamera,
  fitBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from './ThumbnailBake.js';

export const UNIT_THUMB_SIZE = 256;
const UNIT_BASE_Y = 0.072;
const FRAME_PADDING = 1.06;

function disposeModel(model) {
  model.root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) {
      obj.geometry.dispose();
    }
  });
  disposeUnitMaterials(model.materials);
}

export function bakeUnitThumbnail(renderer, scene, camera, classId) {
  const model = buildUnitModel(classId, 'blue');
  if (model.ring) model.ring.visible = false;
  if (model.shadow) model.shadow.visible = false;

  model.root.position.set(0, UNIT_BASE_Y, 0);
  model.body.rotation.y = PREVIEW_ROTATION_Y;
  scene.add(model.root);
  fitBakeCamera(camera, model.root, FRAME_PADDING);
  renderer.render(scene, camera);
  scene.remove(model.root);
  disposeModel(model);
  return true;
}

export function generateUnitThumbnails(classIds, { renderer, scene, camera } = {}) {
  const ownsRenderer = !renderer;
  let envMap;
  let pmrem;
  if (ownsRenderer) {
    renderer = createBakeRenderer(UNIT_THUMB_SIZE, UNIT_THUMB_SIZE);
    ({ scene, envMap, pmrem } = setupBakeScene(renderer));
    camera = setupBakeCamera(0.45);
  }

  const thumbnails = new Map();
  for (const classId of classIds) {
    bakeUnitThumbnail(renderer, scene, camera, classId);
    thumbnails.set(classId, renderer.domElement.toDataURL('image/png'));
  }

  if (ownsRenderer) {
    disposeBakeResources({ envMap, pmrem, renderer });
  }

  return thumbnails;
}

export function createUnitIconImg(classId, thumbnails, { alt = '' } = {}) {
  const img = document.createElement('img');
  img.className = 'unit-thumb';
  img.src = thumbnails.get(classId) ?? '';
  img.alt = alt;
  img.draggable = false;
  return img;
}

export function fillUnitIcon(container, classId, thumbnails, fallbackIcon = '?', alt = '') {
  container.replaceChildren();
  const src = thumbnails.get(classId);
  if (src) {
    container.appendChild(createUnitIconImg(classId, thumbnails, { alt }));
    return;
  }
  container.textContent = fallbackIcon;
}

function createTokenCardShell(kind) {
  const card = document.createElement('span');
  card.className = `class-token-card class-token-card--${kind}`;
  card.setAttribute('aria-hidden', 'true');

  const art = document.createElement('span');
  art.className = 'class-token-card-art';

  card.append(art);
  return { card, art };
}

export function fillCopyCardIcon(container, classId, thumbnails, fallbackIcon = '?', alt = '') {
  container.replaceChildren();
  const src = thumbnails.get(classId);
  const { card, art } = createTokenCardShell('copy');

  if (src) {
    const img = document.createElement('img');
    img.className = 'class-token-card-img';
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    art.appendChild(img);
  } else {
    art.textContent = fallbackIcon;
  }

  container.appendChild(card);
}

export function fillFragmentCardIcon(container, classId, thumbnails, fallbackIcon = '?', alt = '') {
  container.replaceChildren();
  const src = thumbnails.get(classId);
  const { card, art } = createTokenCardShell('fragment');

  if (src) {
    const shardA = document.createElement('img');
    shardA.className = 'class-token-card-shard class-token-card-shard-a';
    shardA.src = src;
    shardA.alt = alt;
    shardA.draggable = false;

    const shardB = document.createElement('img');
    shardB.className = 'class-token-card-shard class-token-card-shard-b';
    shardB.src = src;
    shardB.alt = '';
    shardB.draggable = false;

    art.append(shardA, shardB);
  } else {
    art.textContent = fallbackIcon;
  }

  container.appendChild(card);
}
