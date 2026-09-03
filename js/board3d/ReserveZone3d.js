import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { parseSlot } from '../units.js';
import { getScreenGroundAxes, playerFacingYaw } from './CameraFacing.js';
import { TILE_PITCH, TILE_SIZE } from './TileGrid.js';
import { buildUnitModel } from './UnitModels.js';

const SEAT_CLASSES = ['seat-blue-0', 'seat-blue-1', 'seat-red-0', 'seat-red-1'];

function applySeatClass(wrap, unit, matchFormat) {
  wrap.classList.remove(...SEAT_CLASSES);
  if (matchFormat === '2v2' && unit.ownerSeat != null) {
    wrap.classList.add(`seat-${unit.team}-${unit.ownerSeat}`);
  }
}

const UNIT_BASE_Y = 0.072;
const RESERVE_SCALE = 0.82;

const DEFAULT_MAX_RESERVE_UNITS = 8;
const ROW_SPACING = TILE_PITCH * 0.92;
// Wide enough that the front row's floating labels clear the back row's heads.
const ROW_STEP = TILE_PITCH * 1.55;

const TMP_BASE = new THREE.Vector3();
const TMP_OFFSET = new THREE.Vector3();

function reserveBandDistance(boardSize) {
  const boardHalf = ((boardSize - 1) * TILE_PITCH) / 2;
  const gap = TILE_PITCH * 1.2;
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

function reservePosition({ row, col, colsInRow }, boardSize, side) {
  const { right, down } = getScreenGroundAxes();
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
// Sized off the full roster rather than the live count so the camera never re-zooms as
// units deploy out of reserve.
export function reserveExtentPoints(boardSize, maxReserveUnits = DEFAULT_MAX_RESERVE_UNITS) {
  const { right, down } = getScreenGroundAxes();
  const frontRowCount = Math.ceil(maxReserveUnits / 2);
  // The extra margin covers the model's base ring and its floating name label, which both
  // reach past the slot centre and would otherwise be clipped on narrow viewports.
  const lateral = ((frontRowCount - 1) / 2) * ROW_SPACING + TILE_SIZE * 0.95;
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

function createReserveLabel() {
  const wrap = document.createElement('div');
  wrap.className = 'unit-3d-label reserve-label';
  wrap.innerHTML = `
    <div class="unit-3d-badge"></div>
    <div class="unit-3d-name"></div>
    <div class="unit-3d-hp-bar"><div class="unit-3d-hp-fill"></div></div>
    <div class="unit-3d-hp-text"></div>
    <div class="unit-3d-stats hidden"></div>
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

    if (state.matchFormat === '2v2') {
      // A row per seat, so the player reads their own bench apart from the AI teammate's.
      const humanSeat = parseSlot(state.humanSlot).seat;
      const ownUnits = state.blueReserve.filter((u) => u.ownerSeat === humanSeat);
      const mateUnits = state.blueReserve.filter((u) => u.ownerSeat !== humanSeat);

      ownUnits.forEach((unit, i) => {
        entries.push({
          unit,
          side: 'blue',
          role: 'own',
          slot: { row: 0, col: i, colsInRow: ownUnits.length },
          selectable: state.isHumanTurn,
        });
      });

      mateUnits.forEach((unit, i) => {
        entries.push({
          unit,
          side: 'blue',
          role: 'teammate',
          slot: { row: 1, col: i, colsInRow: mateUnits.length },
          selectable: false,
        });
      });
    } else {
      state.blueReserve.forEach((unit, i) => {
        entries.push({
          unit,
          side: 'blue',
          role: 'own',
          slot: reserveGridSlot(i, state.blueReserve.length),
          selectable: state.isHumanTurn,
        });
      });
    }

    state.redReserve.forEach((unit, i) => {
      entries.push({
        unit,
        side: 'red',
        role: 'enemy',
        slot: reserveGridSlot(i, state.redReserve.length),
        selectable: false,
      });
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

  upsertUnit({ unit, side, role, slot, selectable }, state) {
    let entry = this.units.get(unit.id);
    if (!entry) {
      entry = this.createEntry(unit, side, state.matchFormat);
      this.units.set(unit.id, entry);
      this.group.add(entry.root);
    }

    const pos = reservePosition(slot, this.boardSize, side);
    entry.root.position.set(pos.x, pos.y, pos.z);
    entry.root.rotation.set(0, 0, 0);
    entry.body.rotation.y = playerFacingYaw(side);
    entry.body.position.y = 0;
    entry.label.position.y = entry.labelBaseY;
    entry.root.scale.setScalar(RESERVE_SCALE);

    const selected = state.selectedReserveId === unit.id;
    const inspected = state.inspectedUnitId === unit.id;
    const pct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));

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

    applySeatClass(entry.wrap, unit, state.matchFormat);

    entry.wrap.classList.toggle('selected', selected);
    entry.wrap.classList.toggle('inspected', inspected);
    entry.wrap.classList.toggle('enemy', side === 'red' && state.matchFormat !== '2v2');
    entry.wrap.classList.toggle('disabled', side === 'blue' && !selectable);

    entry.root.userData = {
      kind: 'reserve',
      unitId: unit.id,
      side,
      selectable: side === 'blue' && selectable,
    };
  }

  createEntry(unit, side, matchFormat) {
    const model = buildUnitModel(unit.classId, unit.team, {
      ownerSeat: unit.ownerSeat,
      matchFormat,
    });
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

    return {
      root,
      body: model.body,
      wrap,
      label,
      labelBaseY: model.height * RESERVE_SCALE + 0.18,
      materials: model.materials,
    };
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
