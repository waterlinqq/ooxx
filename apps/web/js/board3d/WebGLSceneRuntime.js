import * as THREE from 'three';
import { isTouchDevice } from './LimitedOrbitControls.js';

export function webglRendererOptions() {
  const mobile = isTouchDevice();
  return {
    antialias: true,
    alpha: true,
    powerPreference: mobile ? 'low-power' : 'default',
  };
}

export function webglPixelRatio() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr, isTouchDevice() ? 1.5 : 2);
}

export function webglShadowMapSize() {
  return isTouchDevice() ? 1024 : 2048;
}

export function webglShadowsEnabled() {
  return !isTouchDevice();
}

export function applyShadowRendererSettings(renderer) {
  const enabled = webglShadowsEnabled();
  renderer.shadowMap.enabled = enabled;
  if (!enabled) return;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function attachWebGLRecovery(renderer, { onRestore } = {}) {
  const canvas = renderer.domElement;
  let contextLost = false;

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    onRestore?.();
  }, false);

  return {
    isContextLost: () => contextLost,
  };
}

export function attachPageVisibility(onChange) {
  const handler = () => onChange(document.hidden);
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
