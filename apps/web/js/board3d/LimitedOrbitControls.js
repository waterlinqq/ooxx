import * as THREE from 'three';

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

function sanitizeZoom(value, min = 0.85, max = 1.15) {
  return Number.isFinite(value) && value > 0 ? clamp(value, min, max) : 1;
}

function touchDistance(touches) {
  const dx = touches[0].x - touches[1].x;
  const dy = touches[0].y - touches[1].y;
  return Math.hypot(dx, dy);
}

function touchCenter(touches) {
  return {
    x: (touches[0].x + touches[1].x) / 2,
    y: (touches[0].y + touches[1].y) / 2,
  };
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function isValidLayoutBounds(bounds) {
  return Number.isFinite(bounds.centerX)
    && Number.isFinite(bounds.centerY)
    && Number.isFinite(bounds.halfW)
    && Number.isFinite(bounds.halfH)
    && bounds.halfW > 0
    && bounds.halfH > 0;
}

export function fitLayoutBoundsToAspect(bounds, aspect) {
  let { centerX, centerY, halfW, halfH } = bounds;
  if (halfW / halfH > aspect) {
    halfH = halfW / aspect;
  } else {
    halfW = halfH * aspect;
  }
  return { centerX, centerY, halfW, halfH };
}

const TMP_PROJECT = new THREE.Vector3();

/** Project a world-space Box3 into orthographic camera view bounds. */
export function projectBoxToCameraBounds(box, camera, padding = 0, headroom = 1) {
  if (box.isEmpty()) return null;

  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const { min, max } = box;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        TMP_PROJECT.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, TMP_PROJECT.x);
        maxX = Math.max(maxX, TMP_PROJECT.x);
        minY = Math.min(minY, TMP_PROJECT.y);
        maxY = Math.max(maxY, TMP_PROJECT.y);
      }
    }
  }

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    halfW: ((maxX - minX) / 2 + padding) * headroom,
    halfH: ((maxY - minY) / 2 + padding) * headroom,
  };
}

/** Fit bounds to viewport aspect and reserve space for frustum-based pinch zoom. */
export function prepareOrbitLayoutFrustum(bounds, aspect, orbitControls) {
  let layout = fitLayoutBoundsToAspect(bounds, aspect);
  if (orbitControls && !orbitControls.zoomViaScale) {
    const zoom = sanitizeZoom(orbitControls.zoom, orbitControls.minZoom, orbitControls.maxZoom);
    layout = {
      ...layout,
      halfW: layout.halfW * zoom,
      halfH: layout.halfH * zoom,
    };
  }
  return layout;
}

export function applyOrbitFrustumZoom(camera, layoutFrustum, orbitControls, debugHud = null) {
  if (!layoutFrustum || !orbitControls) return;

  const frustumZoom = orbitControls.zoomViaScale ? 1 : orbitControls.zoom;
  const { centerX, centerY, halfW, halfH } = layoutFrustum;
  if (!Number.isFinite(centerX) || !Number.isFinite(halfW) || halfW <= 0) {
    orbitControls.reset();
    return;
  }

  camera.left = centerX - halfW / frustumZoom;
  camera.right = centerX + halfW / frustumZoom;
  camera.top = centerY + halfH / frustumZoom;
  camera.bottom = centerY - halfH / frustumZoom;
  camera.updateProjectionMatrix();

  if (
    !Number.isFinite(camera.left)
    || camera.left >= camera.right
    || camera.bottom >= camera.top
  ) {
    debugHud?.mark('invalid frustum -> reset');
    orbitControls.reset();
  }
}

const MIN_PINCH_DISTANCE = 24;

/**
 * Subtle orbit + zoom for orthographic preview/board cameras.
 * Primary pointer (left click / one finger) stays free for game input.
 */
export class LimitedOrbitControls {
  constructor({
    domElement,
    pivot,
    minAzimuth = -0.28,
    maxAzimuth = 0.28,
    minPolar = -0.12,
    maxPolar = 0.12,
    minZoom = 0.85,
    maxZoom = 1.15,
    rotateSpeed = 0.0045,
    zoomSpeed = 0.0012,
    touchRotate = true,
    zoomViaScale = true,
    onChange = null,
  }) {
    this.domElement = domElement;
    this.pivot = pivot;
    this.minAzimuth = minAzimuth;
    this.maxAzimuth = maxAzimuth;
    this.minPolar = minPolar;
    this.maxPolar = maxPolar;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.rotateSpeed = rotateSpeed;
    this.zoomSpeed = zoomSpeed;
    this.touchRotate = touchRotate;
    this.zoomViaScale = zoomViaScale;
    this.onChange = onChange;

    this.enabled = true;
    this.azimuth = 0;
    this.polar = 0;
    this.zoom = 1;

    this.pivot.rotation.order = 'YXZ';

    this.pointers = new Map();
    this.orbitDrag = null;
    this.pinch = null;

    domElement.addEventListener('wheel', this.onWheel, { passive: false });
    domElement.addEventListener('pointerdown', this.onPointerDown);
    domElement.addEventListener('contextmenu', this.onContextMenu);
    domElement.addEventListener('gesturestart', this.onGesture, { passive: false });
    domElement.addEventListener('gesturechange', this.onGesture, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    this.applyTransform();
  }

  onContextMenu = (event) => {
    if (!this.enabled) return;
    event.preventDefault();
  };

  onGesture = (event) => {
    if (!this.enabled) return;
    event.preventDefault();
  };

  beginPinch(touches) {
    const startDistance = touchDistance(touches);
    if (!Number.isFinite(startDistance) || startDistance < MIN_PINCH_DISTANCE) return;
    this.pinch = {
      startDistance,
      startZoom: sanitizeZoom(this.zoom, this.minZoom, this.maxZoom),
      lastCenter: touchCenter(touches),
    };
  }

  isOrbitPointer(event) {
    return event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
  }

  onWheel = (event) => {
    if (!this.enabled) return;
    if (!Number.isFinite(event.deltaY)) return;
    event.preventDefault();
    const factor = 1 + event.deltaY * this.zoomSpeed;
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoom = sanitizeZoom(this.zoom * factor, this.minZoom, this.maxZoom);
    this.emitChange();
  };

  onPointerDown = (event) => {
    if (!this.enabled) return;

    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
    });

    if (this.pointers.size === 2) {
      this.orbitDrag = null;
      this.beginPinch([...this.pointers.values()]);
      return;
    }

    if (this.pointers.size !== 1 || !this.isOrbitPointer(event)) return;

    this.orbitDrag = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    this.domElement.setPointerCapture(event.pointerId);
  };

  onPointerMove = (event) => {
    if (!this.enabled) return;

    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size >= 2 && this.pinch) {
      const touches = [...this.pointers.values()];
      const distance = touchDistance(touches);
      if (!Number.isFinite(distance) || !Number.isFinite(this.pinch.startDistance)) return;
      const ratio = clamp(distance / this.pinch.startDistance, 0.72, 1.38);
      this.zoom = sanitizeZoom(this.pinch.startZoom / ratio, this.minZoom, this.maxZoom);

      if (this.touchRotate !== false) {
        const center = touchCenter(touches);
        const dx = center.x - this.pinch.lastCenter.x;
        const dy = center.y - this.pinch.lastCenter.y;
        this.azimuth = clamp(
          this.azimuth - dx * this.rotateSpeed,
          this.minAzimuth,
          this.maxAzimuth
        );
        this.polar = clamp(
          this.polar + dy * this.rotateSpeed,
          this.minPolar,
          this.maxPolar
        );
        this.pinch.lastCenter = center;
      }
      this.emitChange();
      return;
    }

    if (!this.orbitDrag || event.pointerId !== this.orbitDrag.pointerId) return;

    const dx = event.clientX - this.orbitDrag.lastX;
    const dy = event.clientY - this.orbitDrag.lastY;
    this.orbitDrag.lastX = event.clientX;
    this.orbitDrag.lastY = event.clientY;

    this.azimuth = clamp(
      this.azimuth - dx * this.rotateSpeed,
      this.minAzimuth,
      this.maxAzimuth
    );
    this.polar = clamp(
      this.polar + dy * this.rotateSpeed,
      this.minPolar,
      this.maxPolar
    );
    this.emitChange();
  };

  onPointerUp = (event) => {
    this.pointers.delete(event.pointerId);

    if (this.orbitDrag?.pointerId === event.pointerId) {
      if (this.domElement.hasPointerCapture(event.pointerId)) {
        this.domElement.releasePointerCapture(event.pointerId);
      }
      this.orbitDrag = null;
    }

    if (this.pointers.size < 2) {
      this.pinch = null;
    } else if (this.pointers.size === 2) {
      this.beginPinch([...this.pointers.values()]);
    }
  };

  applyTransform() {
    this.zoom = sanitizeZoom(this.zoom, this.minZoom, this.maxZoom);
    this.pivot.rotation.y = this.azimuth;
    this.pivot.rotation.x = this.polar;
    this.pivot.scale.setScalar(this.zoomViaScale ? this.zoom : 1);
  }

  emitChange() {
    this.applyTransform();
    this.onChange?.();
  }

  reset() {
    this.azimuth = 0;
    this.polar = 0;
    this.zoom = 1;
    this.emitChange();
  }

  isGesturing() {
    return this.pointers.size > 0;
  }

  dispose() {
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.domElement.removeEventListener('gesturestart', this.onGesture);
    this.domElement.removeEventListener('gesturechange', this.onGesture);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
