import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CLASSES, parseSlot } from '../units.js';
import { TILE_PITCH, TILE_SIZE } from './TileGrid.js';
import { buildUnitModel } from './UnitModels.js';

const UNIT_BASE_Y = 0.072;
const RESERVE_SCALE = 0.82;

// Framing assumes a full roster even after units deploy, so the camera never re-zooms mid-match.
const MAX_RESERVE_UNITS = 8;
const ROW_SPACING = TILE_PITCH * 0.92;
// Wide enough that the front row's floating labels clear the back row's heads.
const ROW_STEP = TILE_PITCH * 1.55;

// Keep in sync with BoardScene camera (0, 8.5, 8) → lookAt origin.
const CAMERA_POS = new THREE.Vector3(0, 8.5, 8);
const LOOK_AT = new THREE.Vector3(0, 0, 0);

const TMP_RIGHT = new THREE.Vector3();
const TMP_DOWN = new THREE.Vector3();
const TMP_FORWARD = new THREE.Vector3();
const TMP_BASE = new THREE.Vector3();
const TMP_OFFSET = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function getScreenGroundAxes() {
  TMP_FORWARD.copy(LOOK_AT).sub(CAMERA_POS).normalize();
  TMP_RIGHT.crossVectors(WORLD_UP, TMP_FORWARD).normalize();
  TMP_DOWN.crossVectors(TMP_FORWARD, TMP_RIGHT).normalize();
  TMP_RIGHT.set(TMP_RIGHT.x, 0, TMP_RIGHT.z).normalize();
  TMP_DOWN.set(TMP_DOWN.x, 0, TMP_DOWN.z).normalize();
  return { right: TMP_RIGHT, down: TMP_DOWN };
}

function reserveBandDistance(boardSize) {
  const boardHalf = ((boardSize - 1) * TILE_PITCH) / 2;
  const gap = TILE_PITCH * 1.45;
  return boardHalf + gap + TILE_SIZE * 0.45;
}

function reserveGridSlot(index, total) {
  const frontRowCount = Math.ceil(total / 2);
  if (index < frontRowCount) {
    return { row: 0, col: index, colsInRow: frontRowCount };
  }
  const backRowCount = total - frontRowCount;
  return { row: 1, col: index - frontRowCount, colsInRow: backRowCount };
}

function reservePosition(index, total, boardSize, side) {
  const { right, down } = getScreenGroundAxes();
  const { row, col, colsInRow } = reserveGridSlot(index, total);
  const bandDist = reserveBandDistance(boardSize) + row * ROW_STEP;
  TMP_BASE.copy(down).multiplyScalar(side === 'blue' ? -bandDist : bandDist);

  const offset = (col - (colsInRow - 1) / 2) * ROW_SPACING;
  TMP_OFFSET.copy(right).multiplyScalar(offset);

  return {
    x: TMP_BASE.x + TMP_OFFSET.x,
    y: UNIT_BASE_Y,
    z: TMP_BASE.z + TMP_OFFSET.z,
  };
}

// Ground-plane corners of both reserve bands, used by the camera to frame the whole scene.
export function reserveExtentPoints(boardSize) {
  const { right, down } = getScreenGroundAxes();
  const frontRowCount = Math.ceil(MAX_RESERVE_UNITS / 2);
  const lateral = ((frontRowCount - 1) / 2) * ROW_SPACING + TILE_SIZE * 0.6;
  const depth = reserveBandDistance(boardSize) + ROW_STEP + TILE_SIZE * 0.6;

  const points = [];
  for (const depthSign of [-1, 1]) {
    for (const lateralSign of [-1, 1]) {
      points.push(
        new THREE.Vector3(
          down.x * depth * depthSign + right.x * lateral * lateralSign,
          0,
          down.z * depth * depthSign + right.z * lateral * lateralSign
        )
      );
    }
  }
  return points;
}

function reserveYaw(side) {
  const { right } = getScreenGroundAxes();
  if (side === 'blue') {
    return Math.atan2(right.x, right.z);
  }
  return Math.atan2(-right.x, -right.z);
}

function createReserveLabel() {
  const wrap = document.createElement('div');
  wrap.className = 'unit-3d-label reserve-label';
  wrap.innerHTML = `
    <div class="unit-3d-name"></div>
    <div class="unit-3d-hp-bar"><div class="unit-3d-hp-fill"></div></div>
    <div class="unit-3d-hp-text"></div>
    <div class="unit-3d-stats hidden"></div>
    <div class="unit-3d-badge">後備</div>
  `;
  return { label: new CSS2DObject(wrap), wrap };
}

export class ReserveZone3d {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'reserveZone';
    scene.add(this.group);
    this.units = new Map();
    this.boardSize = 3;
  }

  setBoardSize(size) {
    this.boardSize = size;
  }

  sync(state) {
    const seen = new Set();
    const entries = [];

    const humanSeat = state.matchFormat === '2v2' ? parseSlot(state.humanSlot).seat : null;
    const blueUnits = state.matchFormat === '2v2'
      ? state.blueReserve.filter((u) => u.ownerSeat === humanSeat)
      : state.blueReserve;

    blueUnits.forEach((unit, i) => {
      entries.push({ unit, side: 'blue', index: i, total: blueUnits.length, selectable: state.isHumanTurn });
    });

    state.redReserve.forEach((unit, i) => {
      entries.push({ unit, side: 'red', index: i, total: state.redReserve.length, selectable: false });
    });

    for (const entry of entries) {
      seen.add(entry.unit.id);
      this.upsertUnit(entry, state);
    }

    for (const [id, entry] of this.units) {
      if (!seen.has(id)) {
        this.group.remove(entry.root);
        this.disposeEntry(entry);
        this.units.delete(id);
      }
    }
  }

  upsertUnit({ unit, side, index, total, selectable }, state) {
    let entry = this.units.get(unit.id);
    if (!entry) {
      entry = this.createEntry(unit, side);
      this.units.set(unit.id, entry);
      this.group.add(entry.root);
    }

    const pos = reservePosition(index, total, this.boardSize, side);
    entry.root.position.set(pos.x, pos.y, pos.z);
    entry.root.rotation.set(0, 0, 0);
    entry.body.rotation.y = reserveYaw(side);
    entry.root.scale.setScalar(RESERVE_SCALE);

    const cls = CLASSES[unit.classId];
    const selected = state.selectedReserveId === unit.id;
    const inspected = state.inspectedUnitId === unit.id;
    const pct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));

    entry.wrap.querySelector('.unit-3d-name').textContent = cls.name;
    entry.wrap.querySelector('.unit-3d-hp-fill').style.width = `${pct}%`;
    entry.wrap.querySelector('.unit-3d-hp-text').textContent = `${unit.hp}/${unit.maxHp}`;

    const statsEl = entry.wrap.querySelector('.unit-3d-stats');
    if (inspected) {
      statsEl.classList.remove('hidden');
      statsEl.textContent = `ATK ${unit.atk}`;
    } else {
      statsEl.classList.add('hidden');
      statsEl.textContent = '';
    }

    entry.wrap.classList.toggle('selected', selected);
    entry.wrap.classList.toggle('inspected', inspected);
    entry.wrap.classList.toggle('enemy', side === 'red');
    entry.wrap.classList.toggle('disabled', side === 'blue' && !selectable);

    entry.root.userData = {
      kind: 'reserve',
      unitId: unit.id,
      side,
      selectable: side === 'blue' && selectable,
    };
  }

  createEntry(unit, side) {
    const model = buildUnitModel(unit.classId, unit.team);
    const root = model.root;
    const { label, wrap } = createReserveLabel();
    label.position.set(0, model.height * RESERVE_SCALE + 0.18, 0);
    root.add(label);

    if (side === 'red') {
      for (const material of model.materials) {
        if (material.userData.skipTint) continue;
        material.transparent = true;
        material.opacity = (material.userData.baseOpacity ?? 1) * 0.92;
      }
    }

    return { root, body: model.body, wrap, label, materials: model.materials };
  }

  getPickTargets() {
    const targets = [];
    this.group.traverse((obj) => {
      if (!obj.isMesh) return;
      let node = obj;
      while (node) {
        if (node.userData?.kind === 'reserve') {
          targets.push(obj);
          break;
        }
        node = node.parent;
      }
    });
    return targets;
  }

  findReserveRoot(object) {
    let obj = object;
    while (obj) {
      if (obj.userData?.kind === 'reserve') return obj;
      obj = obj.parent;
    }
    return null;
  }

  disposeEntry(entry) {
    entry.root.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    });
    for (const material of entry.materials) {
      material.dispose();
    }
    if (entry.label.element?.parentNode) {
      entry.label.element.parentNode.removeChild(entry.label.element);
    }
  }

  dispose() {
    for (const entry of this.units.values()) {
      this.disposeEntry(entry);
    }
    this.units.clear();
  }
}
