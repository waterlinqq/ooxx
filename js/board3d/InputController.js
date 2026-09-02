import * as THREE from 'three';

const DRAG_THRESHOLD = 8;

export class InputController {
  constructor({ domElement, camera, tileGrid, unitManager, callbacks }) {
    this.domElement = domElement;
    this.camera = camera;
    this.tileGrid = tileGrid;
    this.unitManager = unitManager;
    this.callbacks = callbacks;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.state = null;
    this.drag = null;
    this.ignoreNextClick = false;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.14);
    this.intersectPoint = new THREE.Vector3();

    domElement.addEventListener('pointerdown', this.onPointerDown);
    domElement.addEventListener('click', this.onClick);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  setState(state) {
    this.state = state;
  }

  updatePointer(event) {
    const rect = this.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  findInteractiveRoot(object) {
    let obj = object;
    while (obj) {
      if (obj.userData?.kind === 'tile' || obj.userData?.kind === 'unit') {
        return obj;
      }
      obj = obj.parent;
    }
    return null;
  }

  raycastTargets() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [];

    this.unitManager.group.traverse((obj) => {
      if (!obj.isMesh) return;
      let node = obj;
      while (node) {
        if (node.userData?.kind === 'unit') {
          targets.push(obj);
          break;
        }
        node = node.parent;
      }
    });

    this.tileGrid.group.traverse((obj) => {
      if (obj.isMesh && obj.userData?.kind === 'tile') {
        targets.push(obj);
      }
    });

    return this.raycaster.intersectObjects(targets, false);
  }

  pickCell(event) {
    if (!this.updatePointer(event)) return null;
    const hits = this.raycastTargets();
    for (const hit of hits) {
      const root = this.findInteractiveRoot(hit.object);
      if (!root) continue;

      if (root.userData.kind === 'tile') {
        return { row: root.userData.row, col: root.userData.col, unitId: null };
      }

      if (root.userData.kind === 'unit') {
        return {
          row: root.userData.row,
          col: root.userData.col,
          unitId: root.userData.unitId,
        };
      }
    }
    return null;
  }

  canControlUnit(unitId) {
    if (!this.state || !this.callbacks.canControlUnit) return false;
    const unit = this.state.board.flat().find((u) => u?.id === unitId);
    if (!unit) return false;
    return this.callbacks.canControlUnit(this.state, unit);
  }

  onPointerDown = (event) => {
    if (event.button !== 0 || !this.state || this.state.animating) return;
    const pick = this.pickCell(event);
    if (!pick?.unitId || !this.canControlUnit(pick.unitId)) return;

    this.domElement.setPointerCapture(event.pointerId);
    this.drag = {
      unitId: pick.unitId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      pointerId: event.pointerId,
    };
  };

  onPointerMove = (event) => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;
    if (!this.drag.active && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      this.drag.active = true;
      this.callbacks.onUnitDragStart(this.drag.unitId);
    }
  };

  onPointerUp = (event) => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;

    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId);
    }

    if (this.drag.active) {
      this.ignoreNextClick = true;
      const pick = this.pickCell(event);
      if (pick) {
        this.callbacks.onUnitDrop(pick.row, pick.col);
      } else {
        this.callbacks.onDragCancel();
      }
    }

    this.drag = null;
  };

  onClick = (event) => {
    if (this.ignoreNextClick) {
      this.ignoreNextClick = false;
      return;
    }
    if (!this.state || this.state.animating) return;

    const pick = this.pickCell(event);
    if (!pick) {
      if (this.state.draggingUnitId) {
        this.callbacks.onDragCancel();
      }
      return;
    }

    if (pick.unitId && this.canControlUnit(pick.unitId)) {
      if (this.state.draggingUnitId === pick.unitId) {
        this.callbacks.onDragCancel();
      } else {
        this.callbacks.onUnitDragStart(pick.unitId);
      }
      return;
    }

    if (this.state.draggingUnitId) {
      this.callbacks.onUnitDrop(pick.row, pick.col);
      return;
    }

    const cellUnit = this.state.board[pick.row]?.[pick.col];
    if (!cellUnit) {
      this.callbacks.onCellClick(pick.row, pick.col);
    }
  };

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('click', this.onClick);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
