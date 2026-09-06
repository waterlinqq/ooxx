import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildNavIconModel } from './NavIconModels.js';
import { applyShadowRendererSettings, webglShadowsEnabled } from './WebGLSceneRuntime.js';

const ICON_PX = 52;
const PREVIEW_ROTATION_Y = 0.35;
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

function setupCamera() {
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
  camera.position.set(0, 5.5, 5.2);
  camera.lookAt(0, 0.12, 0);
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

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function animateFormation(root, now, triggerAt) {
  const members = root.userData.members;
  if (!members?.length) return;

  const since = now - triggerAt;
  for (const member of members) {
    const index = member.userData.navMemberIndex ?? 0;
    const delay = index * 95;
    const duration = 440;
    const t = Math.min(Math.max((since - delay) / duration, 0), 1);
    const ease = easeOutCubic(t);
    const bounce = t < 1 ? Math.sin(t * Math.PI) * 0.022 : 0;
    const base = member.userData.basePosition;
    const baseScale = member.userData.baseScale ?? 1;
    const settled = since > delay + duration;

    member.position.y = base.y - 0.065 * (1 - ease) + bounce;
    member.position.z = base.z + 0.028 * ease;
    if (settled) {
      member.position.y += Math.sin((since - delay) * 0.0038 + index * 1.4) * 0.0025;
    }
    member.scale.setScalar(baseScale * (0.8 + 0.2 * ease));
  }
}

function animateBattle(root, now, triggerAt) {
  const swords = root.userData.swords;
  if (!swords?.length) return;

  const since = now - triggerAt;
  const duration = 560;
  const t = Math.min(since / duration, 1);
  const ease = easeOutCubic(t);
  const clash = Math.sin(t * Math.PI);
  const baseRot = root.userData.baseRotation;

  for (let i = 0; i < swords.length; i++) {
    const sword = swords[i];
    const base = sword.userData.baseRotation;
    const posBase = sword.userData.basePosition;
    const side = i === 0 ? -1 : 1;
    sword.rotation.y = base.y + side * 0.62 * (1 - ease);
    sword.rotation.z = base.z * (1 - ease * 0.8) + side * clash * 0.28;
    sword.rotation.x = base.x - 0.22 * clash + Math.sin(since * 0.0055 + i * 1.2) * 0.045;
    if (posBase) {
      sword.position.y = posBase.y + clash * 0.055;
      sword.position.z = posBase.z + clash * 0.025;
    }
  }

  if (baseRot) {
    root.rotation.y = baseRot.y + Math.sin(since * 0.018) * 0.045 * ease;
    root.rotation.z = clash * 0.04 * (1 - t * 0.5);
  }
}

function animateCodex(root, now, triggerAt) {
  const book = root.userData.book;
  const clasp = root.userData.clasp;
  if (!book) return;

  const since = now - triggerAt;
  const t = Math.min(since / 460, 1);
  const ease = easeOutCubic(t);
  const base = book.userData.baseRotation;

  book.rotation.x = base.x - 0.14 * ease;
  book.rotation.z = Math.sin(since * 0.0032) * 0.012 * ease;

  if (clasp) {
    const claspBase = clasp.userData.basePosition;
    clasp.rotation.y = since * 0.0045;
    clasp.position.y = claspBase.y + Math.sin(since * 0.0055) * 0.007;
  }
}

function animateQuests(root, now, triggerAt) {
  const { paper, reward, checks, board } = root.userData;
  const since = now - triggerAt;

  if (paper?.userData.basePosition) {
    const t = Math.min(since / 420, 1);
    const ease = easeOutCubic(t);
    const base = paper.userData.basePosition;
    const rotBase = paper.userData.baseRotation;
    const wobble = t < 1 ? Math.sin(t * Math.PI * 2.5) * 0.025 : 0;
    paper.position.y = base.y + 0.15 * (1 - ease) + wobble;
    paper.position.z = base.z + 0.028 * ease;
    if (rotBase) {
      paper.rotation.x = rotBase.x + Math.sin(since * 0.005) * 0.08 * ease;
      paper.rotation.z = rotBase.z + Math.sin(since * 0.004) * 0.05 * ease;
    }
  }

  for (let i = 0; i < (checks?.length ?? 0); i++) {
    const delay = 100 + i * 100;
    const t = Math.min(Math.max((since - delay) / 320, 0), 1);
    const pop = easeOutBack(t);
    checks[i].scale.setScalar(Math.max(0.05, pop) * (checks[i].userData.baseScale ?? 1));
  }

  if (reward?.userData.basePosition) {
    const base = reward.userData.basePosition;
    const baseScale = reward.userData.baseScale ?? 1;
    const pulse = 1 + Math.sin(since * 0.011) * 0.18;
    reward.rotation.y = since * 0.014;
    reward.rotation.x = Math.sin(since * 0.008) * 0.25;
    reward.position.y = base.y + Math.sin(since * 0.009) * 0.022;
    reward.scale.setScalar(baseScale * pulse);
  }

  if (board?.userData.baseRotation) {
    const base = board.userData.baseRotation;
    const t = Math.min(since / 500, 1);
    board.rotation.x = base.x + Math.sin(t * Math.PI) * 0.06;
    board.rotation.z = base.z + Math.sin(since * 0.004) * 0.025;
  }
}

function animateShop(root, now, triggerAt) {
  const { awning, coins, gem, stall } = root.userData;
  const since = now - triggerAt;
  const entry = Math.min(since / 450, 1);
  const entryEase = easeOutBack(entry);

  if (awning?.userData.baseRotation) {
    const base = awning.userData.baseRotation;
    const flap = entry < 1 ? (1 - entryEase) * -0.32 : 0;
    awning.rotation.x = base.x + flap + Math.sin(since * 0.007) * 0.09;
  }

  for (let i = 0; i < (coins?.length ?? 0); i++) {
    const delay = i * 80;
    const ct = Math.min(Math.max((since - delay) / 380, 0), 1);
    const coin = coins[i];
    const base = coin.userData.basePosition;
    const rotBase = coin.userData.baseRotation;
    const hop = Math.sin(ct * Math.PI);
    coin.position.y = base.y + hop * 0.055;
    coin.position.x = base.x + hop * 0.012 * (i - 1);
    if (rotBase) {
      coin.rotation.y = rotBase.y + ct * Math.PI * 2.2;
    }
  }

  if (gem?.userData.basePosition) {
    const base = gem.userData.basePosition;
    const baseScale = gem.userData.baseScale ?? 1;
    const pulse = 1 + Math.sin(since * 0.012) * 0.28;
    gem.position.y = base.y + Math.sin(since * 0.01) * 0.018;
    gem.scale.setScalar(baseScale * pulse);
    if (gem.material) {
      gem.material.emissiveIntensity = (gem.userData.baseEmissive ?? 1.4) + Math.sin(since * 0.012) * 1.1;
    }
  }

  if (stall) {
    stall.position.y = Math.sin(since * 0.006) * 0.006 * entryEase;
  }
}

const NAV_ANIMATORS = {
  formation: animateFormation,
  battle: animateBattle,
  codex: animateCodex,
  quests: animateQuests,
  shop: animateShop,
};

export class NavIconAnimator {
  constructor(navEl) {
    this.navEl = navEl;
    this.active = null;
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  onNavChange(navId, { replay = false } = {}) {
    if (!NAV_ANIMATORS[navId]) {
      this.deactivate();
      return;
    }

    if (this.active?.navId === navId) {
      if (replay) this.active.triggerAt = performance.now();
      return;
    }

    this.deactivate();
    this.activate(navId);
  }

  activate(navId) {
    const btn = this.navEl.querySelector(`.nav-item[data-nav="${navId}"]`);
    const iconEl = btn?.querySelector('.nav-icon');
    if (!iconEl) return;

    const img = iconEl.querySelector('.nav-thumb:not(.nav-thumb-canvas)');
    if (img) img.classList.add('nav-thumb--hidden');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(ICON_PX, ICON_PX, false);
    applyShadowRendererSettings(renderer);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    const { scene, envMap, pmrem } = setupSceneWithRenderer(renderer);
    const camera = setupCamera();
    const model = buildNavIconModel(navId);
    if (!model) {
      renderer.dispose();
      envMap.dispose();
      pmrem.dispose();
      if (img) img.classList.remove('nav-thumb--hidden');
      return;
    }

    if (!model.rotation.y) model.rotation.y = PREVIEW_ROTATION_Y;
    model.scale.setScalar(1.12);
    scene.add(model);
    fitCameraToModel(camera, model);

    const canvas = renderer.domElement;
    canvas.className = 'nav-thumb nav-thumb-canvas';
    iconEl.appendChild(canvas);

    this.active = {
      navId,
      iconEl,
      img,
      renderer,
      scene,
      camera,
      model,
      envMap,
      pmrem,
      triggerAt: performance.now(),
    };
  }

  deactivate() {
    if (!this.active) return;

    const { iconEl, img, renderer, scene, model, envMap, pmrem } = this.active;
    scene.remove(model);
    disposeObject(model);
    envMap.dispose();
    pmrem.dispose();
    renderer.dispose();

    iconEl.querySelector('.nav-thumb-canvas')?.remove();
    if (img) img.classList.remove('nav-thumb--hidden');

    this.active = null;
  }

  tick(now) {
    requestAnimationFrame(this.tick);
    if (!this.active) return;

    const { navId, renderer, scene, camera, model, triggerAt } = this.active;
    const animate = NAV_ANIMATORS[navId];
    if (animate) animate(model, now, triggerAt);
    renderer.render(scene, camera);
  }
}

function setupSceneWithRenderer(renderer) {
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
  keyLight.castShadow = webglShadowsEnabled();
  if (keyLight.castShadow) {
    keyLight.shadow.mapSize.set(512, 512);
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
  }
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
  fillLight.position.set(-3, 5, -4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xe0e7ff, 0.65);
  rimLight.position.set(-4, 3, 5);
  scene.add(rimLight);

  return { scene, envMap, pmrem };
}
