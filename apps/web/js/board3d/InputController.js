import * as THREE from 'three';

const DRAG_THRESHOLD = 8;

export class InputController {
  constructor({ domElement, camera, tileGrid, callbacks }) {
    this.domElement = domElement;
    this.camera = camera;
    this.tileGrid = tileGrid;
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
    domElement.addEventListener('contextmenu', this.onContextMenu);
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

  /** Resolve the board cell under the pointer; unit comes from game state, not mesh hits. */
  pickCell(event) {
    if (!this.updatePointer(event)) return null;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.intersectPoint)) return null;

    const tile = this.tileGrid.getTileAtWorld(this.intersectPoint.x, this.intersectPoint.z);
    if (!tile) return null;

    const { row, col } = tile.userData;
    const unit = this.state?.board?.[row]?.[col] ?? null;

    if (unit) {
      return { kind: 'unit', row, col, unitId: unit.id };
    }
    return { kind: 'tile', row, col, unitId: null };
  }

  canControlUnit(unitId) {
    if (!this.state || !this.callbacks.canControlUnit) return false;
    const unit = this.state.board.flat().find((u) => u?.id === unitId);
    if (!unit) return false;
    return this.callbacks.canControlUnit(this.state, unit);
  }

  isEnemyUnit(unitId) {
    const unit = this.state.board.flat().find((u) => u?.id === unitId);
    if (!unit) return false;
    const myTeam = this.state.yourTeam ?? 'blue';
    return unit.team !== myTeam;
  }

  onContextMenu = (event) => {
    event.preventDefault();
  };

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

    if (this.state.itemTargeting) {
      this.callbacks.onItemTarget(pick.row, pick.col);
      return;
    }

    if (pick.kind === 'unit' && this.canControlUnit(pick.unitId)) {
      if (this.state.draggingUnitId === pick.unitId) {
        this.callbacks.onDragCancel();
      } else {
        this.callbacks.onUnitDragStart(pick.unitId);
      }
      return;
    }

    if (pick.kind === 'unit' && this.isEnemyUnit(pick.unitId)) {
      if (this.state.draggingUnitId) {
        this.callbacks.onUnitDrop(pick.row, pick.col);
      } else {
        this.callbacks.onUnitInspect(pick.unitId);
      }
      return;
    }

    if (this.state.draggingUnitId) {
      this.callbacks.onUnitDrop(pick.row, pick.col);
      return;
    }

    if (pick.kind === 'tile') {
      this.callbacks.onCellClick(pick.row, pick.col);
    }
  };

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('click', this.onClick);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
