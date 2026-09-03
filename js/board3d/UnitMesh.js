import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { playerFacingYaw } from './CameraFacing.js';
import { tileWorldPosition } from './TileGrid.js';
import { buildUnitModel } from './UnitModels.js';

const UNIT_BASE_Y = 0.072;
const FADED = new THREE.Color(0x64748b);

const WALK_SPEED = 2.4;
const STRIDE = 0.3;
const LEAP_DISTANCE = 1.6;

// Magical and flying units materialise on the spot; everyone else drops in.
const SPAWN_STYLE = { mage: 'warp', assassin: 'warp', eagle: 'warp' };
const SPAWN_SPIN = { assassin: Math.PI * 2 };

function easeOutBack(x) {
  const c = x - 1;
  return 1 + 2.2 * c * c * c + 1.4 * c * c;
}

// How deeply each class settles into its standby pose after acting.
const CROUCH_DEPTH = {
  swordsman: 1,
  archer: 1,
  tower: 0,
  shield: 0.85,
  mage: 0.5,
  assassin: 1.2,
  bomber: 0.9,
  eagle: 0,
};

const TMP_DIR = new THREE.Vector3();
const TMP_TARGET = new THREE.Vector3();

const SEAT_CLASSES = ['seat-blue-0', 'seat-blue-1', 'seat-red-0', 'seat-red-1'];

function applySeatClass(wrap, unit, matchFormat) {
  wrap.classList.remove(...SEAT_CLASSES);
  if (matchFormat === '2v2' && unit.ownerSeat != null) {
    wrap.classList.add(`seat-${unit.team}-${unit.ownerSeat}`);
  }
}
function createHpLabel() {
  const wrap = document.createElement('div');
  wrap.className = 'unit-3d-label';
  wrap.innerHTML = `
    <div class="unit-3d-badge hidden"></div>
    <div class="unit-3d-name"></div>
    <div class="unit-3d-hp-bar"><div class="unit-3d-hp-fill"></div></div>
    <div class="unit-3d-hp-text"></div>
    <div class="unit-3d-stats hidden"></div>
  `;
  const label = new CSS2DObject(wrap);
  return { label, wrap };
}

function captureRest(node) {
  if (!node) return null;
  return {
    node,
    rot: node.rotation.clone(),
    pos: node.position.clone(),
    scale: node.scale.clone(),
  };
}

function captureLegs(legs) {
  if (!legs) return null;
  return {
    thigh: legs.thigh,
    shin: legs.shin,
    left: { hip: captureRest(legs.left.hip), knee: captureRest(legs.left.knee) },
    right: { hip: captureRest(legs.right.hip), knee: captureRest(legs.right.knee) },
  };
}

// Vertical distance from hip to sole for a bent leg, used to keep feet on the floor.
function footDrop(thigh, shin, hip, bend) {
  return thigh * Math.cos(hip) + shin * Math.cos(hip - bend);
}

function shortestAngle(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function approach(current, target, rate) {
  return current + (target - current) * Math.min(1, rate);
}

export class UnitMeshManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'units';
    scene.add(this.group);
    this.units = new Map();
    this.boardSize = 3;
  }

  setBoardSize(size) {
    this.boardSize = size;
  }

  syncBoard(board, state) {
    const seen = new Set();
    const acted = new Set(state.actedUnitIds);
    const draggingId = state.draggingUnitId;
    const inspectedId = state.inspectedUnitId;

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const unit = board[r][c];
        if (!unit) continue;
        seen.add(unit.id);

        let entry = this.units.get(unit.id);
        if (!entry) {
          entry = this.createUnitEntry(unit, state.matchFormat);
          this.units.set(unit.id, entry);
          this.group.add(entry.root);
        }

        this.updateUnitEntry(entry, unit, r, c, state.matchFormat, {
          acted: acted.has(unit.id),
          dragging: draggingId === unit.id,
          inspected: inspectedId === unit.id,
          yaw: playerFacingYaw(unit.team),
        });
      }
    }

    for (const [id, entry] of this.units) {
      if (!seen.has(id)) {
        this.group.remove(entry.root);
        this.disposeEntry(entry);
        this.units.delete(id);
      }
    }
  }

  createUnitEntry(unit, matchFormat) {
    const model = buildUnitModel(unit.classId, unit.team, {
      ownerSeat: unit.ownerSeat,
      matchFormat,
    });
    const root = model.root;
    root.userData = { kind: 'unit', unitId: unit.id };

    const { label, wrap } = createHpLabel();
    label.position.set(0, model.height + 0.2, 0);
    root.add(label);

    const rig = model.rig;
    const rest = {
      group: captureRest(rig.group),
      legs: captureLegs(rig.legs),
      torso: captureRest(rig.torso),
      head: captureRest(rig.head),
      armL: captureRest(rig.armL),
      armR: captureRest(rig.armR),
      weapon: captureRest(rig.weapon),
      hood: captureRest(rig.hood),
      scarf: captureRest(rig.scarf),
      shield: captureRest(rig.shield),
      robe: captureRest(rig.robe),
      orb: captureRest(rig.orb),
      spark: captureRest(rig.spark),
      bomb: captureRest(rig.bomb),
      wingL: captureRest(rig.wingL),
      wingR: captureRest(rig.wingR),
    };

    return {
      root,
      body: model.body,
      rig,
      rest,
      shadow: model.shadow,
      ring: model.ring,
      materials: model.materials,
      label,
      wrap,
      targetPos: new THREE.Vector3(),
      displayPos: new THREE.Vector3(),
      classId: unit.classId,
      crouchDepth: CROUCH_DEPTH[unit.classId] ?? 1,
      team: unit.team,
      seed: Math.random() * Math.PI * 2,
      jitter: Math.random(),
      spawnStyle: SPAWN_STYLE[unit.classId] ?? 'drop',
      spawn: null,
      spawnLift: 0,
      spawnScale: 1,
      spawnSpin: 0,
      stretch: 0,
      land: 0,
      ringPop: 0,
      labelFade: 1,
      labelFadeApplied: 1,
      fadeApplied: 1,
      yaw: playerFacingYaw(unit.team),
      enemyYaw: playerFacingYaw(unit.team),
      moveYaw: playerFacingYaw(unit.team),
      actedLook: null,
      placed: false,
      acted: false,
      moving: false,
      walk: 0,
      walkPhase: 0,
      crouch: 0,
      airborne: 0,
      lift: 0,
      leap: null,
      attack: null,
      impact: null,
      fxOffset: new THREE.Vector3(),
      lean: 0,
      swing: 0,
      windup: 0,
      charge: 0,
      stance: 0,
      recoil: 0,
    };
  }

  triggerAttack(unitId, type = 'melee', dir = null) {
    const entry = this.units.get(unitId);
    if (!entry) return;

    const heading = new THREE.Vector3(0, 0, 1);
    if (dir && (dir.x !== 0 || dir.z !== 0)) {
      heading.set(dir.x, 0, dir.z).normalize();
      entry.enemyYaw = Math.atan2(heading.x, heading.z);
      entry.yaw = entry.enemyYaw;
    }

    entry.attack = {
      start: performance.now(),
      duration: type === 'melee' ? 420 : 560,
      type,
      heading,
    };
  }

  impactUnit(row, col) {
    const entry = this.getUnitAt(row, col);
    if (!entry) return;
    entry.impact = { start: performance.now(), duration: 340 };
  }

  applyActedLook(entry, acted) {
    if (entry.actedLook === acted) return;
    entry.actedLook = acted;
    for (const material of entry.materials) {
      if (material.userData.skipTint) {
        material.opacity = (material.userData.baseOpacity ?? 1) * (acted ? 0.6 : 1);
        continue;
      }
      const baseColor = material.userData.baseColor;
      if (baseColor && !material.userData.keepColor) {
        material.color.copy(baseColor);
        if (acted) material.color.lerp(FADED, 0.45);
      }
      const baseEmissive = material.userData.baseEmissive;
      if (baseEmissive !== undefined) {
        material.emissiveIntensity = baseEmissive * (acted ? 0.25 : 1);
      }
    }
  }

  applySelectionLook(entry, selected) {
    if (entry.selectedLook === selected) return;
    entry.selectedLook = selected;
    if (!entry.ring) return;
    const mat = entry.ring.material;
    const baseOpacity = mat.userData.baseOpacity ?? 0.92;
    mat.opacity = selected ? Math.min(1, baseOpacity + 0.08) : baseOpacity;
  }

  updateUnitEntry(entry, unit, row, col, matchFormat, { acted, dragging, inspected, yaw }) {
    const pos = tileWorldPosition(row, col, this.boardSize);
    TMP_TARGET.set(pos.x, UNIT_BASE_Y, pos.z);

    if (!entry.placed) {
      entry.placed = true;
      entry.displayPos.copy(TMP_TARGET);
      entry.root.position.copy(TMP_TARGET);
      entry.yaw = yaw;
      entry.spawn = {
        start: performance.now(),
        duration: entry.spawnStyle === 'warp' ? 540 : 580 + entry.jitter * 180,
        height: 1.0 + entry.jitter * 0.4,
        spin: SPAWN_SPIN[unit.classId] ?? 0,
        style: entry.spawnStyle,
      };
    } else if (!entry.targetPos.equals(TMP_TARGET)) {
      const travel = entry.displayPos.distanceTo(TMP_TARGET);
      if (travel > LEAP_DISTANCE) {
        entry.leap = {
          start: performance.now(),
          duration: 320 + travel * 70,
          height: 0.3 + travel * 0.05,
          from: entry.displayPos.clone(),
        };
      }
    }

    entry.targetPos.copy(TMP_TARGET);
    entry.enemyYaw = yaw;

    const pct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
    entry.wrap.querySelector('.unit-3d-hp-fill').style.width = `${pct}%`;
    entry.wrap.querySelector('.unit-3d-hp-text').textContent = `${unit.hp}/${unit.maxHp}`;

    const statsEl = entry.wrap.querySelector('.unit-3d-stats');
    if (inspected && unit.team === 'red') {
      statsEl.classList.remove('hidden');
      statsEl.textContent = `ATK ${unit.atk}`;
    } else {
      statsEl.classList.add('hidden');
      statsEl.textContent = '';
    }

    applySeatClass(entry.wrap, unit, matchFormat);

    entry.wrap.classList.toggle('acted', acted);
    entry.wrap.classList.toggle('dragging', dragging);
    entry.wrap.classList.toggle('selected', dragging);
    entry.wrap.classList.toggle('inspected', inspected);
    entry.wrap.classList.toggle('enemy', unit.team === 'red' && matchFormat !== '2v2');
    entry.root.userData.row = row;
    entry.root.userData.col = col;
    entry.acted = acted;
    entry.dragging = dragging;

    this.applyActedLook(entry, acted);
    this.applySelectionLook(entry, dragging);
  }

  getUnitRoot(unitId) {
    return this.units.get(unitId)?.root ?? null;
  }

  getUnitAt(row, col) {
    for (const entry of this.units.values()) {
      if (entry.root.userData.row === row && entry.root.userData.col === col) {
        return entry;
      }
    }
    return null;
  }

  updateMotion(entry, delta, now) {
    let traveled = 0;

    if (entry.leap) {
      const p = Math.min(1, (now - entry.leap.start) / entry.leap.duration);
      const ease = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
      entry.displayPos.lerpVectors(entry.leap.from, entry.targetPos, ease);
      entry.airborne = Math.sin(Math.PI * p);
      entry.lift = entry.leap.height * entry.airborne;
      entry.moving = false;
      if (p >= 1) {
        entry.leap = null;
        entry.airborne = 0;
        entry.lift = 0;
      }
    } else {
      entry.airborne = 0;
      entry.lift = 0;
      TMP_DIR.subVectors(entry.targetPos, entry.displayPos);
      const dist = TMP_DIR.length();
      if (dist > 0.0008) {
        const step = Math.min(dist, WALK_SPEED * delta);
        TMP_DIR.divideScalar(dist);
        entry.displayPos.addScaledVector(TMP_DIR, step);
        traveled = step;
        entry.moveYaw = Math.atan2(TMP_DIR.x, TMP_DIR.z);
        entry.moving = dist > 0.04;
      } else {
        entry.displayPos.copy(entry.targetPos);
        entry.moving = false;
      }
    }

    entry.walk = approach(entry.walk, entry.moving ? 1 : 0, delta * 9);
    entry.walkPhase = (entry.walkPhase + (traveled / STRIDE) * Math.PI) % (Math.PI * 2);
    entry.crouch = approach(entry.crouch, entry.acted ? 1 : 0, delta * 5);

    const yawGoal = entry.walk > 0.35 ? entry.moveYaw : entry.enemyYaw;
    entry.yaw += shortestAngle(entry.yaw, yawGoal) * Math.min(1, delta * 8);
  }

  updateSpawn(entry, now) {
    entry.spawnLift = 0;
    entry.spawnScale = 1;
    entry.spawnSpin = 0;
    entry.stretch = 0;
    entry.land = 0;
    entry.ringPop = 0;
    entry.labelFade = 1;

    const spawn = entry.spawn;
    if (!spawn) return;

    const p = (now - spawn.start) / spawn.duration;
    if (p >= 1) {
      entry.spawn = null;
      this.applySpawnFade(entry, 1);
      entry.selectedLook = null;
      this.applySelectionLook(entry, !!entry.dragging);
      return;
    }

    if (spawn.style === 'warp') {
      const grow = Math.min(1, p / 0.7);
      const eased = easeOutBack(grow);
      entry.spawnScale = 0.3 + 0.7 * eased;
      entry.spawnLift = 0.14 * (1 - eased);
      entry.spawnSpin = (1 - grow) * spawn.spin;
      entry.ringPop = (1 - p) * (1 - p);
      entry.labelFade = Math.min(1, p / 0.6);
      this.applySpawnFade(entry, Math.min(1, p / 0.45));
      return;
    }

    const fall = Math.min(1, p / 0.55);
    entry.spawnLift = spawn.height * (1 - fall * fall);
    entry.stretch = (1 - fall) * 0.16;
    entry.airborne = Math.max(entry.airborne, 1 - fall);
    entry.labelFade = Math.max(0, Math.min(1, (p - 0.5) / 0.25));

    if (p > 0.55) {
      const landP = (p - 0.55) / 0.45;
      entry.land = Math.exp(-3.4 * landP) * Math.cos(landP * Math.PI * 2);
      entry.ringPop = Math.max(0, Math.exp(-4 * landP) * Math.cos(landP * Math.PI * 1.2));
    }
  }

  applySpawnFade(entry, fade) {
    if (entry.fadeApplied === fade) return;
    entry.fadeApplied = fade;
    for (const material of entry.materials) {
      if (material.userData.skipTint) continue;
      const base = material.userData.baseOpacity ?? 1;
      material.opacity = base * fade;
      material.transparent = material.opacity < 1;
    }
  }

  updateAction(entry, now) {
    entry.fxOffset.set(0, 0, 0);
    entry.lean = 0;
    entry.swing = 0;
    entry.windup = 0;
    entry.charge = 0;
    entry.stance = 0;
    entry.recoil = 0;

    const attack = entry.attack;
    if (attack) {
      const p = (now - attack.start) / attack.duration;
      if (p >= 1) {
        entry.attack = null;
      } else if (attack.type === 'melee') {
        const windup = p < 0.24 ? p / 0.24 : Math.max(0, 1 - (p - 0.24) / 0.12);
        const strike = p < 0.24 ? 0 : Math.sin(((p - 0.24) / 0.76) * Math.PI);
        entry.windup = windup;
        entry.swing = strike * 1.75 - windup * 0.7;
        entry.stance = strike * 0.45 - windup * 0.16;
        entry.lean = strike * 0.22 - windup * 0.12;
        entry.fxOffset.copy(attack.heading).multiplyScalar(strike * 0.26 - windup * 0.07);
      } else {
        const draw = Math.min(1, p / 0.4);
        const release = p < 0.4 ? 0 : Math.sin(((p - 0.4) / 0.6) * Math.PI);
        entry.charge = draw - release * 0.75;
        entry.stance = draw * 0.16;
        entry.lean = release * 0.16 - draw * 0.1;
        entry.fxOffset.copy(attack.heading).multiplyScalar(release * 0.09 - draw * 0.05);
      }
    }

    const impact = entry.impact;
    if (impact) {
      const p = (now - impact.start) / impact.duration;
      if (p >= 1) {
        entry.impact = null;
      } else {
        const decay = 1 - p;
        entry.recoil = decay;
        entry.fxOffset.x += Math.sin(p * 34) * 0.05 * decay;
        entry.fxOffset.z += Math.cos(p * 30) * 0.03 * decay;
      }
    }
  }

  poseLegs(entry, crouch) {
    const legs = entry.rest.legs;
    // Robed classes have no visible legs, so they simply settle downwards.
    if (!legs) return crouch * 0.09;

    const { thigh, shin } = legs;
    const crouchHip = 0.45 * crouch;
    const crouchBend = 0.95 * crouch;
    const tuckHip = 1.05 * entry.airborne;
    const tuckBend = 1.6 * entry.airborne;

    let reach = 0;
    for (const side of ['left', 'right']) {
      const isLead = side === 'left';
      const phase = entry.walkPhase + (isLead ? 0 : Math.PI);
      const stepSwing = Math.sin(phase) * 0.52 * entry.walk;
      const stepBend = Math.max(0, -Math.sin(phase + 0.9)) * 0.85 * entry.walk;
      const stance = isLead ? entry.stance : -entry.stance * 0.8;

      const hip = crouchHip + tuckHip + stepSwing + stance;
      const bend = Math.max(
        0,
        crouchBend +
          tuckBend +
          stepBend +
          Math.abs(stance) * 0.45 +
          entry.recoil * 0.35 +
          Math.max(0, entry.land) * 0.7
      );

      const joint = legs[side];
      joint.hip.node.rotation.x = joint.hip.rot.x + hip;
      joint.knee.node.rotation.x = joint.knee.rot.x - bend;
      reach = Math.max(reach, footDrop(thigh, shin, hip, bend));
    }

    // Sink the body until the most extended leg (the supporting one) reaches the floor.
    return (thigh + shin - reach) * (1 - entry.airborne);
  }

  poseUnit(entry, time) {
    const { rig, rest } = entry;
    const t = time + entry.seed;
    const crouch = entry.crouch * entry.crouchDepth * (1 - entry.walk) * (1 - entry.airborne);
    const idle = (1 - entry.crouch * 0.55) * (1 - entry.walk * 0.6);
    const breath = Math.sin(t * 2.1) * idle;
    const sway = Math.sin(t * 0.85) * idle;
    const step = Math.sin(entry.walkPhase) * entry.walk;

    const rootDrop = this.poseLegs(entry, crouch);

    if (rest.torso) {
      rest.torso.node.scale.set(
        rest.torso.scale.x * (1 - breath * 0.012),
        rest.torso.scale.y * (1 + breath * 0.026),
        rest.torso.scale.z * (1 - breath * 0.012)
      );
      rest.torso.node.position.y = rest.torso.pos.y + breath * 0.006;
      rest.torso.node.rotation.x = rest.torso.rot.x + crouch * 0.2;
      rest.torso.node.rotation.y = rest.torso.rot.y - step * 0.09 - entry.windup * 0.22 + entry.swing * 0.16;
      rest.torso.node.rotation.z = rest.torso.rot.z + sway * 0.02;
    }

    if (rest.head) {
      rest.head.node.rotation.x = rest.head.rot.x + Math.sin(t * 1.6) * 0.035 * idle - crouch * 0.14;
      rest.head.node.rotation.y = rest.head.rot.y + sway * 0.16 + step * 0.05;
      rest.head.node.position.y = rest.head.pos.y + breath * 0.008;
    }

    if (rest.armL) {
      rest.armL.node.rotation.x =
        rest.armL.rot.x + Math.sin(t * 1.9) * 0.05 * idle - step * 0.32 + crouch * 0.22;
      rest.armL.node.rotation.z = rest.armL.rot.z - breath * 0.03;
    }
    if (rest.armR) {
      rest.armR.node.rotation.x =
        rest.armR.rot.x - Math.sin(t * 1.9 + 0.6) * 0.05 * idle + step * 0.32 + crouch * 0.2;
      rest.armR.node.rotation.z = rest.armR.rot.z + breath * 0.03;
    }

    switch (rig.kind) {
      case 'swordsman': {
        if (rest.weapon) {
          rest.weapon.node.rotation.x = rest.weapon.rot.x + crouch * 0.5;
          rest.weapon.node.rotation.z =
            rest.weapon.rot.z + Math.sin(t * 1.3) * 0.05 * idle - entry.swing * 0.35;
        }
        break;
      }
      case 'archer': {
        if (rest.hood) {
          rest.hood.node.rotation.x = rest.hood.rot.x + Math.sin(t * 1.1) * 0.05 * idle;
        }
        if (rest.armL) {
          rest.armL.node.rotation.x += crouch * 0.6 - entry.charge * 0.12;
        }
        break;
      }
      case 'shield': {
        if (rest.shield) {
          rest.shield.node.rotation.y = rest.shield.rot.y + Math.sin(t * 0.9) * 0.07 * idle;
          rest.shield.node.rotation.x = rest.shield.rot.x + crouch * 0.3;
        }
        if (rest.armL) {
          rest.armL.node.rotation.x -= crouch * 0.34;
        }
        break;
      }
      case 'mage': {
        if (rig.orb) {
          rig.orb.rotation.y = t * 0.9;
          rig.orb.position.y = rest.orb.pos.y + Math.sin(t * 1.7) * 0.012;
          const pulse = 1.4 + Math.sin(t * 2.6) * 0.5;
          rig.orb.material.emissiveIntensity = pulse * (entry.acted ? 0.3 : 1);
        }
        if (rig.runeRing) {
          rig.runeRing.rotation.y = t * 1.6;
          rig.runeRing.rotation.z = Math.sin(t * 0.8) * 0.3;
        }
        if (rest.robe) {
          rest.robe.node.rotation.z = rest.robe.rot.z + step * 0.06;
          rest.robe.node.scale.set(
            rest.robe.scale.x * (1 + crouch * 0.05),
            rest.robe.scale.y * (1 - crouch * 0.12),
            rest.robe.scale.z * (1 + crouch * 0.05)
          );
        }
        break;
      }
      case 'assassin': {
        if (rest.scarf) {
          rest.scarf.node.rotation.x =
            rest.scarf.rot.x + Math.sin(t * 1.4) * 0.12 * idle + entry.walk * 0.3;
          rest.scarf.node.rotation.z = rest.scarf.rot.z + Math.sin(t * 1.1) * 0.08 * idle;
        }
        break;
      }
      case 'bomber': {
        if (rig.spark) {
          const flicker = 1 + Math.sin(t * 9) * 0.28 + Math.sin(t * 21) * 0.12;
          rig.spark.scale.setScalar(flicker);
          rig.spark.material.emissiveIntensity = (1.4 + flicker * 0.6) * (entry.acted ? 0.3 : 1);
        }
        if (rest.bomb) {
          rest.bomb.node.rotation.y = rest.bomb.rot.y + Math.sin(t * 1.2) * 0.18;
        }
        if (rest.armR) {
          rest.armR.node.rotation.x -= crouch * 0.3;
        }
        break;
      }
      case 'eagle': {
        const flight = 0.38 + entry.walk * 0.32 + entry.swing * 0.18;
        const flap = Math.sin(t * (entry.walk > 0.2 ? 10 : 4.5)) * flight;
        if (rest.wingL) {
          rest.wingL.node.rotation.z = rest.wingL.rot.z + flap;
          rest.wingL.node.rotation.x = rest.wingL.rot.x - entry.swing * 0.16;
        }
        if (rest.wingR) {
          rest.wingR.node.rotation.z = rest.wingR.rot.z - flap;
          rest.wingR.node.rotation.x = rest.wingR.rot.x - entry.swing * 0.16;
        }
        if (rest.head) {
          rest.head.node.rotation.x -= entry.lean * 0.45;
        }
        break;
      }
      default:
        break;
    }

    this.applyActionPose(entry);

    if (rest.group) {
      const node = rest.group.node;
      node.position.y = rest.group.pos.y - rootDrop * rest.group.scale.y;
      node.rotation.x =
        rest.group.rot.x + entry.lean + crouch * 0.12 + entry.airborne * 0.16 - entry.recoil * 0.22;

      const flatten = 1 - entry.recoil * 0.06 - entry.land * 0.15 + entry.stretch;
      const widen = 1 + entry.recoil * 0.04 + entry.land * 0.09 - entry.stretch * 0.5;
      node.scale.set(
        rest.group.scale.x * widen * entry.spawnScale,
        rest.group.scale.y * flatten * entry.spawnScale,
        rest.group.scale.z * widen * entry.spawnScale
      );
    }
  }

  applyActionPose(entry) {
    const { rig, rest } = entry;

    if (entry.swing && rest.armR) {
      rest.armR.node.rotation.x -= entry.swing;
      if (rig.kind === 'assassin' && rest.armL) {
        rest.armL.node.rotation.x -= entry.swing * 0.55;
      }
    }

    if (entry.charge) {
      if (rig.kind === 'archer' && rest.armR) {
        rest.armR.node.rotation.x -= entry.charge * 0.32;
        rest.armR.node.rotation.z += entry.charge * 0.34;
      } else if (rig.kind === 'mage') {
        if (rest.armR) rest.armR.node.rotation.x -= entry.charge * 0.85;
        if (rig.orb) {
          rig.orb.material.emissiveIntensity += entry.charge * 2.4;
          rig.orb.scale.setScalar(1 + entry.charge * 0.35);
        }
      } else if (rest.armR) {
        rest.armR.node.rotation.x -= entry.charge * 0.5;
      }
    } else if (rig.kind === 'mage' && rig.orb) {
      rig.orb.scale.setScalar(1);
    }
  }

  tick(delta, time) {
    const now = performance.now();

    for (const entry of this.units.values()) {
      this.updateMotion(entry, delta, now);
      this.updateAction(entry, now);
      this.updateSpawn(entry, now);

      entry.root.position.copy(entry.displayPos).add(entry.fxOffset);

      const hover = Math.sin(time * 2 + entry.seed) * 0.01 * (1 - entry.walk);
      const selectLift = entry.dragging
        ? 0.045 + Math.sin(time * 5 + entry.seed) * 0.012
        : 0;
      const rise = entry.fxOffset.y + entry.lift + entry.spawnLift + hover + selectLift;
      entry.root.position.y = entry.displayPos.y + rise;

      if (entry.ring) {
        entry.ring.position.y = 0.012 - rise;
        const baseEmissive = entry.ring.material.userData.baseEmissive ?? 1.1;
        if (entry.ringPop > 0.001) {
          const pop = 1 + entry.ringPop * 0.55;
          entry.ring.scale.set(pop, pop, 1);
          entry.ring.material.emissiveIntensity = baseEmissive * (1 + entry.ringPop * 1.6);
          entry.ring.material.opacity =
            (entry.ring.material.userData.baseOpacity ?? 0.92) * (1 - entry.ringPop * 0.72);
        } else if (entry.dragging) {
          const pulse = 1 + Math.sin(time * 5 + entry.seed) * 0.1;
          entry.ring.scale.setScalar(1.18 * pulse);
          entry.ring.material.emissiveIntensity = baseEmissive * (2.1 + Math.sin(time * 5) * 0.35);
        } else {
          entry.ring.scale.setScalar(1);
          entry.ring.material.emissiveIntensity = baseEmissive;
        }
      }

      entry.body.rotation.y =
        entry.yaw + entry.spawnSpin + Math.sin(time * 0.8 + entry.seed) * 0.05 * (1 - entry.walk);

      if (entry.shadow) {
        const height = Math.max(0, rise);
        entry.shadow.position.y = 0.006 - rise;
        const tighten =
          Math.max(0.12, 1 - height * 0.8) * (1 + Math.max(0, entry.land) * 0.6) * entry.spawnScale;
        entry.shadow.scale.set(tighten, tighten, 1);
        entry.shadow.material.opacity =
          (entry.shadow.material.userData.baseOpacity ?? 0.5) *
          (entry.acted ? 0.6 : 1) *
          (1 - Math.min(0.8, height * 0.65));
      }

      const fadeSettled = entry.labelFade === 1 && entry.labelFadeApplied !== 1;
      if (fadeSettled || Math.abs(entry.labelFade - entry.labelFadeApplied) > 0.02) {
        entry.labelFadeApplied = entry.labelFade;
        entry.wrap.style.opacity = entry.labelFade === 1 ? '' : entry.labelFade.toFixed(2);
      }

      this.poseUnit(entry, time);
    }
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
