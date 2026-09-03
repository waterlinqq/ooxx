import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildUnitModel } from './UnitModels.js';

const THUMB_SIZE = 128;
const UNIT_BASE_Y = 0.072;
const EAGLE_FLIGHT_HEIGHT = 0.34;
const PREVIEW_ROTATION_Y = 0.35;

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

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 32),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  return { scene, envMap, pmrem };
}

function setupCamera() {
  const frustum = 2.4;
  const aspect = 1;
  const camera = new THREE.OrthographicCamera(
    (-frustum * aspect) / 2,
    (frustum * aspect) / 2,
    frustum / 2,
    -frustum / 2,
    0.1,
    100
  );
  camera.position.set(0, 5.5, 5.2);
  camera.lookAt(0, 0.45, 0);
  return camera;
}

export function generateUnitThumbnails(classIds) {
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

  for (const classId of classIds) {
    const model = buildUnitModel(classId, 'blue');
    if (model.ring) model.ring.visible = false;

    const flightHeight = classId === 'eagle' ? EAGLE_FLIGHT_HEIGHT : 0;
    model.root.position.set(0, UNIT_BASE_Y + flightHeight, 0);
    model.body.rotation.y = PREVIEW_ROTATION_Y;
    scene.add(model.root);

    renderer.render(scene, camera);
    thumbnails.set(classId, renderer.domElement.toDataURL('image/png'));

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
