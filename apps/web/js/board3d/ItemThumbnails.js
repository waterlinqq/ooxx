import * as THREE from 'three';
import { buildMapPropModel } from './MapPropModels.js';
import { buildItemBombModel, buildItemLandmineModel } from './UnitModels.js';
import {
  PREVIEW_ROTATION_Y,
  setupBakeScene,
  setupBakeCamera,
  fitBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from './ThumbnailBake.js';

export const ITEM_THUMB_SIZE = 256;
const FRAME_PADDING = 1.06;
const TARGET_VIEW_HEIGHT = 0.3;

const ITEM_THUMB_TUNING = {
  potion: { widthFactor: 0.72, heightFactor: 1, scale: 1.05 },
  bomb: { widthFactor: 0.72, heightFactor: 1, scale: 1 },
  landmine: { widthFactor: 0.82, heightFactor: 1.35, scale: 0.92 },
};

const MAP_PROP_THUMB_TUNING = {
  potion: { widthFactor: 0.72, heightFactor: 1, scale: 1.05 },
  spikes: { widthFactor: 0.82, heightFactor: 1, scale: 1 },
  web: { widthFactor: 0.9, heightFactor: 1, scale: 1 },
  stone: { widthFactor: 0.82, heightFactor: 1, scale: 1 },
  flag: { widthFactor: 0.72, heightFactor: 1.2, scale: 1 },
};

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

function getViewHeight(size, tuningKey, tuningTable) {
  const tuning = tuningTable[tuningKey] ?? { widthFactor: 0.72, heightFactor: 1 };
  return Math.max(
    size.y * tuning.heightFactor,
    size.x * tuning.widthFactor,
    size.z * tuning.widthFactor,
  );
}

function getItemViewHeight(size, itemId) {
  return getViewHeight(size, itemId, ITEM_THUMB_TUNING);
}

function getMapPropViewHeight(size, kind) {
  return getViewHeight(size, kind, MAP_PROP_THUMB_TUNING);
}

function getThumbnailFitTarget(root, itemId) {
  if (itemId !== 'potion') return root;
  const drink = root.children.find((child) => child.isGroup);
  const flask = drink?.children.find((child) => child.isGroup);
  return flask ?? drink ?? root;
}

function prepareItemForThumbnail(root, itemId) {
  if (itemId !== 'potion') return;
  for (const child of root.children) {
    if (child.isMesh) child.visible = false;
  }
  const drink = root.children.find((child) => child.isGroup);
  if (!drink) return;
  for (const child of drink.children) {
    if (child.isMesh) child.visible = false;
  }
}

function normalizeForThumbnail(root, tuningKey, tuningTable, getViewHeightFn) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const viewHeight = getViewHeightFn(size, tuningKey);
  if (viewHeight <= 0) return;

  const tuning = tuningTable[tuningKey] ?? { scale: 1 };
  const scale = (TARGET_VIEW_HEIGHT / viewHeight) * (tuning.scale ?? 1);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
}

function normalizeItemForThumbnail(root, itemId) {
  const fitTarget = getThumbnailFitTarget(root, itemId);
  const box = new THREE.Box3().setFromObject(fitTarget);
  const size = box.getSize(new THREE.Vector3());
  const viewHeight = getItemViewHeight(size, itemId);
  if (viewHeight <= 0) return;

  const tuning = ITEM_THUMB_TUNING[itemId] ?? { scale: 1 };
  const scale = (TARGET_VIEW_HEIGHT / viewHeight) * (tuning.scale ?? 1);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
}

function normalizeMapPropForThumbnail(root, kind) {
  normalizeForThumbnail(root, kind, MAP_PROP_THUMB_TUNING, getMapPropViewHeight);
}

function fitCameraToObject(camera, object, viewHeight) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const paddedHeight = viewHeight * FRAME_PADDING;

  camera.left = -paddedHeight / 2;
  camera.right = paddedHeight / 2;
  camera.top = paddedHeight / 2;
  camera.bottom = -paddedHeight / 2;
  camera.updateProjectionMatrix();
  camera.lookAt(center.x, center.y - size.y * 0.04, center.z);
}

function fitCameraToModel(camera, object, itemId) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  fitCameraToObject(camera, object, getItemViewHeight(size, itemId));
}

function fitCameraToMapProp(camera, object, kind) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  fitCameraToObject(camera, object, getMapPropViewHeight(size, kind));
}

function buildItemModel(itemId) {
  if (itemId === 'potion') {
    const model = buildMapPropModel('potion');
    if (!model?.root) return null;
    model.root.rotation.y = PREVIEW_ROTATION_Y;
    return model.root;
  }
  if (itemId === 'bomb') {
    return buildItemBombModel();
  }
  if (itemId === 'landmine') {
    return buildItemLandmineModel();
  }
  return null;
}

function buildMapPropThumbnailModel(kind) {
  const model = buildMapPropModel(kind);
  if (!model?.root) return null;
  model.root.rotation.y = PREVIEW_ROTATION_Y;
  return model.root;
}

export function bakeMapPropThumbnail(renderer, scene, camera, kind) {
  const root = buildMapPropThumbnailModel(kind);
  if (!root) return false;

  if (kind === 'potion') prepareItemForThumbnail(root, 'potion');
  normalizeMapPropForThumbnail(root, kind);
  scene.add(root);
  fitCameraToMapProp(camera, root, kind);
  renderer.render(scene, camera);
  scene.remove(root);
  disposeObject(root);
  return true;
}

export function bakeItemThumbnail(renderer, scene, camera, itemId) {
  const root = buildItemModel(itemId);
  if (!root) return false;

  prepareItemForThumbnail(root, itemId);
  normalizeItemForThumbnail(root, itemId);
  scene.add(root);
  fitCameraToModel(camera, root, itemId);
  renderer.render(scene, camera);
  scene.remove(root);
  disposeObject(root);
  return true;
}

export function generateMapPropThumbnails(kinds, { renderer, scene, camera } = {}) {
  const ownsRenderer = !renderer;
  let envMap;
  let pmrem;
  if (ownsRenderer) {
    renderer = createBakeRenderer(ITEM_THUMB_SIZE, ITEM_THUMB_SIZE);
    ({ scene, envMap, pmrem } = setupBakeScene(renderer));
    camera = setupBakeCamera(0.45);
  }

  const thumbnails = new Map();
  for (const kind of kinds) {
    if (!bakeMapPropThumbnail(renderer, scene, camera, kind)) continue;
    thumbnails.set(kind, renderer.domElement.toDataURL('image/png'));
  }

  if (ownsRenderer) {
    disposeBakeResources({ envMap, pmrem, renderer });
  }

  return thumbnails;
}

export function generateItemThumbnails(itemIds, { renderer, scene, camera } = {}) {
  const ownsRenderer = !renderer;
  let envMap;
  let pmrem;
  if (ownsRenderer) {
    renderer = createBakeRenderer(ITEM_THUMB_SIZE, ITEM_THUMB_SIZE);
    ({ scene, envMap, pmrem } = setupBakeScene(renderer));
    camera = setupBakeCamera(0.45);
  }

  const thumbnails = new Map();
  for (const itemId of itemIds) {
    if (!bakeItemThumbnail(renderer, scene, camera, itemId)) continue;
    thumbnails.set(itemId, renderer.domElement.toDataURL('image/png'));
  }

  if (ownsRenderer) {
    disposeBakeResources({ envMap, pmrem, renderer });
  }

  return thumbnails;
}

export function fillMapPropIcon(container, kind, thumbnails, fallbackIcon = '?', alt = '') {
  container.replaceChildren();
  const src = thumbnails.get(kind);
  if (src) {
    const img = document.createElement('img');
    img.className = 'unit-thumb item-thumb';
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    container.appendChild(img);
    return;
  }
  container.textContent = fallbackIcon;
}

export function fillItemIcon(container, itemId, thumbnails, fallbackIcon = '?', alt = '') {
  container.replaceChildren();
  const src = thumbnails.get(itemId);
  if (src) {
    const img = document.createElement('img');
    img.className = 'unit-thumb item-thumb';
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    container.appendChild(img);
    return;
  }
  container.textContent = fallbackIcon;
}
