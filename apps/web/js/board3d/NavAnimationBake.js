import { buildNavIconModel } from './NavIconModels.js';
import {
  PREVIEW_ROTATION_Y,
  setupBakeScene,
  setupBakeCamera,
  fitBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from './ThumbnailBake.js';
import {
  applyNavIconAnimation,
  NAV_ANIM_FPS,
  NAV_ANIM_ICON_PX,
  NAV_IDLE_MS,
  NAV_INTRO_MS,
} from './navIconAnimations.js';

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

function captureFrame(renderer, scene, camera, model, navId, now) {
  applyNavIconAnimation(model, navId, now, 0);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}

function captureSequence(renderer, scene, camera, model, navId, startMs, durationMs, fps) {
  const frameStep = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(durationMs / frameStep));
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(captureFrame(renderer, scene, camera, model, navId, startMs + i * frameStep));
  }
  return { frames, frameDelay: Math.round(frameStep) };
}

export function bakeNavAnimationFrames(navId, {
  size = NAV_ANIM_ICON_PX,
  fps = NAV_ANIM_FPS,
  introMs = NAV_INTRO_MS[navId] ?? 700,
  idleMs = NAV_IDLE_MS,
} = {}) {
  const renderer = createBakeRenderer(size, size);
  const { scene, envMap, pmrem } = setupBakeScene(renderer);
  const camera = setupBakeCamera(0.12);
  const model = buildNavIconModel(navId);

  if (!model) {
    disposeBakeResources({ envMap, pmrem, renderer });
    return null;
  }

  if (!model.rotation.y) model.rotation.y = PREVIEW_ROTATION_Y;
  model.scale.setScalar(1.12);
  scene.add(model);
  fitBakeCamera(camera, model, FRAME_PADDING);

  const intro = captureSequence(renderer, scene, camera, model, navId, 0, introMs, fps);
  const idle = captureSequence(renderer, scene, camera, model, navId, introMs, idleMs, fps);

  scene.remove(model);
  disposeObject(model);
  disposeBakeResources({ envMap, pmrem, renderer });

  return {
    introFrames: intro.frames,
    idleFrames: idle.frames,
    frameDelay: intro.frameDelay,
    introMs,
    idleMs,
  };
}
