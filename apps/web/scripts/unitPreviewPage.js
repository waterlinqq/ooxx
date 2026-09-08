import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CLASS_IDS } from '@ooxx/shared/units.js';
import manifest from '../assets/units/manifest.json';
import { buildUnitModel, disposeUnitMaterials } from '../js/board3d/UnitModels.js';
import { getUnitAssetLoader } from '../js/board3d/units/UnitAssetLoader.js';
import {
  webglRendererOptions,
  webglPixelRatio,
  webglShadowMapSize,
  webglShadowsEnabled,
  applyShadowRendererSettings,
} from '../js/board3d/WebGLSceneRuntime.js';

const UNIT_BASE_Y = 0.072;
const GRID_COLS = 4;
const GRID_SPACING = 1.45;

const host = document.getElementById('canvas-host');
const statusEl = document.getElementById('status');
const classSelect = document.getElementById('classId');
const viewModeSelect = document.getElementById('viewMode');
const sourceSelect = document.getElementById('source');
const teamSelect = document.getElementById('team');
const clipSelect = document.getElementById('clip');
const materialsEl = document.getElementById('materials');
const classLabel = document.getElementById('classLabel');

for (const classId of CLASS_IDS) {
  const option = document.createElement('option');
  option.value = classId;
  option.textContent = classId;
  classSelect.appendChild(option);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
camera.position.set(2.4, 1.8, 2.6);

const renderer = new THREE.WebGLRenderer(webglRendererOptions());
renderer.setPixelRatio(webglPixelRatio());
applyShadowRendererSettings(renderer);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.35, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

scene.add(new THREE.AmbientLight(0xffffff, 0.42));
scene.add(new THREE.HemisphereLight(0xc8dcc8, 0x243828, 0.65));

const keyLight = new THREE.DirectionalLight(0xfff6e6, 1.9);
keyLight.position.set(5, 9, 5);
keyLight.castShadow = webglShadowsEnabled();
if (keyLight.castShadow) {
  const shadowSize = webglShadowMapSize();
  keyLight.shadow.mapSize.set(shadowSize, shadowSize);
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
}
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
fillLight.position.set(-4, 6, -6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xe0e7ff, 0.7);
rimLight.position.set(-6, 4, 7);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x40733f, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
ground.receiveShadow = webglShadowsEnabled();
scene.add(ground);

const stage = new THREE.Group();
stage.name = 'stage';
scene.add(stage);

const labels = new THREE.Group();
labels.name = 'labels';
stage.add(labels);

const labelTextureCache = new Map();

function makeLabelSprite(text, color = '#e2e8f0') {
  const key = `${text}:${color}`;
  if (!labelTextureCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    labelTextureCache.set(key, texture);
  }
  const material = new THREE.SpriteMaterial({
    map: labelTextureCache.get(key),
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9, 0.22, 1);
  sprite.renderOrder = 10;
  return sprite;
}

const state = {
  entries: [],
  materials: [],
  loading: false,
};

function setStatus(text) {
  statusEl.textContent = text;
}

function disposeEntry(entry) {
  if (!entry) return;
  entry.animation?.dispose?.();
  stage.remove(entry.root);
  if (entry.proceduralMaterials) {
    entry.root.traverse((obj) => {
      if (obj.isMesh) obj.geometry?.dispose?.();
    });
    disposeUnitMaterials(entry.proceduralMaterials);
    return;
  }
  const disposedMats = new Set();
  entry.root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || disposedMats.has(mat.uuid)) continue;
      disposedMats.add(mat.uuid);
      mat.dispose?.();
    }
  });
}

function clearStage() {
  for (const entry of state.entries) disposeEntry(entry);
  for (const child of [...labels.children]) {
    child.material?.map?.dispose?.();
    child.material?.dispose?.();
    labels.remove(child);
  }
  state.entries = [];
  state.materials = [];
  materialsEl.innerHTML = '';
}

function buildGlbEntry(classId, team) {
  const loader = getUnitAssetLoader();
  if (!loader.canInstantiate(classId)) return null;
  const model = loader.instantiate(classId, team);
  if (!model) return null;
  model.root.position.y = UNIT_BASE_Y;
  model.animation?.play('idle', { loop: true });
  return {
    classId,
    team,
    source: 'glb',
    root: model.root,
    animation: model.animation ?? null,
    shadow: model.shadow ?? null,
    ring: model.ring ?? null,
    materials: model.materials ?? [],
    height: model.height ?? 0.8,
  };
}

function buildProceduralEntry(classId, team) {
  const model = buildUnitModel(classId, team);
  model.root.position.y = UNIT_BASE_Y;
  return {
    classId,
    team,
    source: 'procedural',
    root: model.root,
    animation: null,
    shadow: model.shadow ?? null,
    ring: model.ring ?? null,
    materials: model.materials ?? [],
    proceduralMaterials: model.materials,
    height: model.height ?? 0.8,
  };
}

function addEntry(entry, position, labelText) {
  entry.root.position.x = position.x;
  entry.root.position.z = position.z;
  stage.add(entry.root);
  state.entries.push(entry);
  state.materials.push(...entry.materials);

  if (labelText) {
    const label = makeLabelSprite(labelText);
    label.position.set(position.x, UNIT_BASE_Y + entry.height + 0.28, position.z);
    labels.add(label);
  }
}

function updateMaterialPanel() {
  materialsEl.innerHTML = '';
  const seen = new Set();
  for (const material of state.materials) {
    if (!material || seen.has(material.uuid)) continue;
    seen.add(material.uuid);
    const li = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = `#${material.color.getHexString()}`;
    li.appendChild(swatch);
    const name = material.name || '(unnamed)';
    const keep = material.userData?.keepColor ? ' · keepColor' : '';
    const transparent = material.transparent ? ` · α${(material.opacity ?? 1).toFixed(2)}` : '';
    li.appendChild(document.createTextNode(`${name} #${material.color.getHexString()}${keep}${transparent}`));
    materialsEl.appendChild(li);
  }
}

function frameCamera(target, radius) {
  const distance = Math.max(1.8, radius * 2.2);
  camera.position.set(distance * 0.85, distance * 0.62, distance * 0.95);
  controls.target.copy(target);
  controls.update();
}

function gridPosition(index, total) {
  const cols = viewModeSelect.value === 'all' ? GRID_COLS : 2;
  const row = Math.floor(index / cols);
  const col = index % cols;
  const rows = Math.ceil(total / cols);
  const x = (col - (cols - 1) / 2) * GRID_SPACING;
  const z = (row - (rows - 1) / 2) * GRID_SPACING;
  return new THREE.Vector3(x, 0, z);
}

async function rebuild() {
  clearStage();
  setStatus('載入中…');
  state.loading = true;

  const viewMode = viewModeSelect.value;
  const source = sourceSelect.value;
  const team = teamSelect.value;
  const classId = classSelect.value;

  sourceSelect.querySelector('option[value="split"]').disabled = viewMode === 'all';

  if (viewMode === 'all' && source === 'split') {
    sourceSelect.value = 'glb';
  }

  classLabel.style.display = viewMode === 'single' ? '' : 'none';

  const loader = getUnitAssetLoader();
  await loader.init();

  const classIds = viewMode === 'all' ? CLASS_IDS : [classId];
  let index = 0;

  for (const id of classIds) {
    const unitTeam = viewMode === 'all' && index % 2 === 1 ? 'red' : team;
    const sources = [];

    if (source === 'glb' || source === 'split') sources.push('glb');
    if (source === 'procedural' || source === 'split') sources.push('procedural');

    for (const src of sources) {
      const entry = src === 'glb'
        ? buildGlbEntry(id, unitTeam)
        : buildProceduralEntry(id, unitTeam);

      if (!entry) {
        const fail = makeLabelSprite(`${id} · ${src} 失敗`, '#f87171');
        const pos = gridPosition(index, classIds.length * sources.length);
        fail.position.set(pos.x, 0.5, pos.z);
        labels.add(fail);
        index++;
        continue;
      }

      const pos = gridPosition(index, classIds.length * sources.length);
      const suffix = source === 'split' ? ` · ${src}` : '';
      const label = viewMode === 'all' || source === 'split'
        ? `${id}${suffix}`
        : `${id} · ${src}`;
      addEntry(entry, pos, label);
      index++;
    }
  }

  updateVisibility();
  updateMaterialPanel();

  const box = new THREE.Box3().setFromObject(stage);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z, size.y) * 0.5;
  frameCamera(center.setY(UNIT_BASE_Y + size.y * 0.35), radius);

  const glbCount = state.entries.filter((e) => e.source === 'glb').length;
  const procCount = state.entries.filter((e) => e.source === 'procedural').length;
  setStatus(`${state.entries.length} 個模型 · GLB ${glbCount} · Procedural ${procCount}`);
  state.loading = false;
}

function updateVisibility() {
  const showShadow = document.getElementById('showShadow').checked;
  const showRing = document.getElementById('showRing').checked;
  const wireframe = document.getElementById('wireframe').checked;

  ground.visible = document.getElementById('showGround').checked;

  for (const entry of state.entries) {
    if (entry.shadow) entry.shadow.visible = showShadow;
    if (entry.ring) entry.ring.visible = showRing;
    entry.root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.wireframe = wireframe;
      }
    });
  }
}

function playSelectedClip() {
  const clip = clipSelect.value;
  let played = 0;
  for (const entry of state.entries) {
    if (!entry.animation) continue;
    const ok = entry.animation.play(clip, {
      loop: clip === 'idle' || clip === 'walk',
      fade: 0.08,
    });
    if (ok) played++;
  }
  if (played === 0) setStatus('此 clip 對目前模型不可用（procedural 無 GLB 動畫）');
}

function stopClips() {
  for (const entry of state.entries) {
    entry.animation?.play('idle', { loop: true, fade: 0.08 });
  }
}

function onResize() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

viewModeSelect.addEventListener('change', rebuild);
classSelect.addEventListener('change', rebuild);
sourceSelect.addEventListener('change', rebuild);
teamSelect.addEventListener('change', rebuild);
document.getElementById('playClip').addEventListener('click', playSelectedClip);
document.getElementById('stopClip').addEventListener('click', stopClips);
document.getElementById('resetCamera').addEventListener('click', () => {
  const box = new THREE.Box3().setFromObject(stage);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  frameCamera(center.setY(UNIT_BASE_Y + size.y * 0.35), Math.max(size.x, size.z, size.y) * 0.5);
});
for (const id of ['autoRotate', 'wireframe', 'showGround', 'showShadow', 'showRing']) {
  document.getElementById(id).addEventListener('change', updateVisibility);
}

window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(host);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (document.getElementById('autoRotate').checked) {
    stage.rotation.y += delta * 0.35;
  }
  for (const entry of state.entries) {
    entry.animation?.update(delta);
  }
  controls.update();
  renderer.render(scene, camera);
}

rebuild().then(() => {
  onResize();
  animate();
});

window.__UNIT_PREVIEW__ = {
  rebuild,
  playClip: playSelectedClip,
  getEntries: () => state.entries,
};
