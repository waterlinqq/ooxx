import * as THREE from 'three';

export function isScene3dDebugEnabled() {
  try {
    if (new URLSearchParams(window.location.search).has('debug3d')) return true;
    return localStorage.getItem('ooxx-debug-3d') === '1';
  } catch {
    return false;
  }
}

export class Scene3dDebugHud {
  constructor(containerEl, label = '3D') {
    this.container = containerEl;
    this.label = label;
    this.element = document.createElement('pre');
    this.element.className = 'scene-3d-debug-hud';
    this.element.setAttribute('aria-live', 'polite');
    containerEl.appendChild(this.element);
    this.lastSnapshot = null;
  }

  update(snapshot) {
    this.lastSnapshot = snapshot;
    const lines = [
      `[${this.label}] ${new Date().toLocaleTimeString()}`,
      `canvas ${snapshot.canvasW}x${snapshot.canvasH} dpr ${snapshot.dpr}`,
      `cam L${fmt(snapshot.camLeft)} R${fmt(snapshot.camRight)} T${fmt(snapshot.camTop)} B${fmt(snapshot.camBottom)}`,
      `pivot rotY ${fmt(snapshot.rotY)} rotX ${fmt(snapshot.rotX)} scale ${fmt(snapshot.scale)}`,
      `orbit zoom ${fmt(snapshot.zoom)} az ${fmt(snapshot.azimuth)} pol ${fmt(snapshot.polar)} ptr ${snapshot.pointers}`,
      `layout ${snapshot.hasLayout ? 'ok' : 'missing'} gesturing ${snapshot.gesturing ? 'yes' : 'no'}`,
      `centerNDC ${fmt(snapshot.centerNdcX)}, ${fmt(snapshot.centerNdcY)}`,
    ];
    if (snapshot.invalidFrustum) lines.push('!! invalid frustum !!');
    if (snapshot.note) lines.push(`note: ${snapshot.note}`);
    this.element.textContent = lines.join('\n');
  }

  mark(note) {
    if (!this.lastSnapshot) return;
    this.update({ ...this.lastSnapshot, note });
  }

  dispose() {
    this.element.remove();
  }
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(3) : String(value);
}

export function buildScene3dDebugSnapshot({
  renderer,
  camera,
  pivot,
  orbitControls,
  layoutFrustum,
  container,
  boardSize,
}) {
  const center = new THREE.Vector3(0, 0, 0);
  if (pivot) {
    pivot.updateMatrixWorld(true);
    center.applyMatrix4(pivot.matrixWorld);
  }
  center.project(camera);

  return {
    canvasW: renderer.domElement.width,
    canvasH: renderer.domElement.height,
    cssW: container?.clientWidth ?? 0,
    cssH: container?.clientHeight ?? 0,
    dpr: renderer.getPixelRatio(),
    camLeft: camera.left,
    camRight: camera.right,
    camTop: camera.top,
    camBottom: camera.bottom,
    rotY: pivot?.rotation.y ?? 0,
    rotX: pivot?.rotation.x ?? 0,
    scale: pivot?.scale.x ?? 1,
    zoom: orbitControls?.zoom ?? 1,
    azimuth: orbitControls?.azimuth ?? 0,
    polar: orbitControls?.polar ?? 0,
    pointers: orbitControls?.isGesturing?.() ? 'active' : 0,
    gesturing: orbitControls?.isGesturing?.() ?? false,
    hasLayout: Boolean(layoutFrustum),
    boardSize,
    centerNdcX: center.x,
    centerNdcY: center.y,
    invalidFrustum: camera.left >= camera.right || camera.bottom >= camera.top,
  };
}
