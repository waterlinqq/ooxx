import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildUnitModel } from './UnitModels.js';

const THUMB_SIZE = 384;
const UNIT_BASE_Y = 0.072;
const EAGLE_FLIGHT_HEIGHT = 0.34;
const PREVIEW_ROTATION_Y = 0.35;
const FRAME_PADDING = 1.04;

function disposeModel(model) {
  model.root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) {
      obj.geometry.dispose();
    }
  });
  for (const material of model.materials) {
    material.dispose();
  }
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
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  camera.updateMatrixWorld(true);
  const view = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    view.copy(corner).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, view.x);
    maxX = Math.max(maxX, view.x);
    minY = Math.min(minY, view.y);
    maxY = Math.max(maxY, view.y);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2) * FRAME_PADDING;

  camera.left = cx - half;
  camera.right = cx + half;
  camera.top = cy + half;
  camera.bottom = cy - half;
  camera.updateProjectionMatrix();
}

function cropCanvasToContent(sourceCanvas) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) return sourceCanvas.toDataURL('image/png');

  const span = Math.max(maxX - minX, maxY - minY);
  const pad = Math.max(6, Math.round(span * 0.04));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  out.getContext('2d').drawImage(scratch, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/png');
}

export function generateUnitThumbnails(classIds) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(THUMB_SIZE, THUMB_SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const { scene, envMap, pmrem } = setupScene(renderer);
  const camera = setupCamera();
  const thumbnails = new Map();

  for (const classId of classIds) {
    const model = buildUnitModel(classId, 'blue');
    if (model.ring) model.ring.visible = false;
    if (model.shadow) model.shadow.visible = false;

    const flightHeight = classId === 'eagle' ? EAGLE_FLIGHT_HEIGHT : 0;
    model.root.position.set(0, UNIT_BASE_Y + flightHeight, 0);
    model.body.rotation.y = PREVIEW_ROTATION_Y;
    scene.add(model.root);
    fitCameraToModel(camera, model.body);

    renderer.render(scene, camera);
    thumbnails.set(classId, cropCanvasToContent(renderer.domElement));

    scene.remove(model.root);
    disposeModel(model);
  }

  envMap.dispose();
  pmrem.dispose();
  renderer.dispose();

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
