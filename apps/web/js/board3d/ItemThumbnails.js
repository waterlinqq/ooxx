import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildMapPropModel } from './MapPropModels.js';
import { buildItemBombModel, buildItemLandmineModel } from './UnitModels.js';

const THUMB_SIZE = 256;
const PREVIEW_ROTATION_Y = 0.35;
const FRAME_PADDING = 1.06;

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

function setupScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = null;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  scene.add(new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 0.7));

  const keyLight = new THREE.DirectionalLight(0xfff6e6, 1.9);
  keyLight.position.set(4, 8, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
  fillLight.position.set(-3, 5, -4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xe0e7ff, 0.65);
  rimLight.position.set(-4, 3, 5);
  scene.add(rimLight);

  return { scene, envMap, pmrem };
}

function setupCamera() {
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
  camera.position.set(0, 5.5, 5.2);
  camera.lookAt(0, 0.45, 0);
  return camera;
}

function fitCameraToModel(camera, object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const viewHeight = Math.max(size.y, size.x * 0.72, size.z * 0.72) * FRAME_PADDING;

  camera.left = -viewHeight / 2;
  camera.right = viewHeight / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  camera.lookAt(center.x, center.y - size.y * 0.04, center.z);
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

export function generateItemThumbnails(itemIds) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(THUMB_SIZE, THUMB_SIZE);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const { scene, envMap, pmrem } = setupScene(renderer);
  const camera = setupCamera();
  const thumbnails = new Map();

  for (const itemId of itemIds) {
    const root = buildItemModel(itemId);
    if (!root) continue;

    scene.add(root);
    fitCameraToModel(camera, root);

    renderer.render(scene, camera);
    thumbnails.set(itemId, renderer.domElement.toDataURL('image/png'));

    scene.remove(root);
    disposeObject(root);
  }

  envMap.dispose();
  pmrem.dispose();
  renderer.dispose();

  return thumbnails;
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
