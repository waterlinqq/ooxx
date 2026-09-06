import * as THREE from 'three';
import { isTouchDevice } from './LimitedOrbitControls.js';

export function webglRendererOptions() {
  const mobile = isTouchDevice();
  return {
    antialias: !mobile,
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

export function applyShadowRendererSettings(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = isTouchDevice()
    ? THREE.PCFShadowMap
    : THREE.PCFSoftShadowMap;
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
