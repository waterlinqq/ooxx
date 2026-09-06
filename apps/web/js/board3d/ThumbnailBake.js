import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const PREVIEW_ROTATION_Y = 0.35;

export function setupBakeScene(renderer) {
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

export function setupBakeCamera(lookAtY = 0.45) {
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
  camera.position.set(0, 5.5, 5.2);
  camera.lookAt(0, lookAtY, 0);
  return camera;
}

export function fitBakeCamera(camera, object, framePadding = 1.06) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const viewHeight = Math.max(size.y, size.x * 0.72, size.z * 0.72) * framePadding;

  camera.left = -viewHeight / 2;
  camera.right = viewHeight / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  camera.lookAt(center.x, center.y - size.y * 0.04, center.z);
}

export function createBakeRenderer(width, height, { canvas, context } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  return renderer;
}

export function disposeBakeResources({ envMap, pmrem, renderer } = {}) {
  envMap?.dispose();
  pmrem?.dispose();
  renderer?.dispose();
}
