import * as THREE from 'three';
import { tileWorldPosition } from './TileGrid.js';

// Timed so the hit lands on the peak of the attacker's swing / release pose.
const MELEE_HIT_DELAY = 250;
const CAST_DELAY = 210;
const PROJECTILE_FLIGHT = 320;
const DAMAGE_LINGER = 380;
const EXPLOSION_DURATION = 480;

function getLineCells(from, target) {
  const dr = Math.sign(target.row - from.row);
  const dc = Math.sign(target.col - from.col);
  const cells = [];
  let r = from.row;
  let c = from.col;

  while (true) {
    cells.push([r, c]);
    if (r === target.row && c === target.col) break;
    r += dr;
    c += dc;
  }

  return cells;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnDamageNumber(fxLayer, pos, amount, killed) {
  const el = document.createElement('div');
  el.className = `damage-number${killed ? ' killed' : ''}`;
  el.textContent = killed ? 'KO!' : `-${amount}`;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  fxLayer.appendChild(el);
  return el;
}

export class AttackFx3d {
  constructor({ scene, camera, container, fxLayer, tileGrid, unitManager }) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.fxLayer = fxLayer;
    this.tileGrid = tileGrid;
    this.unitManager = unitManager;
    this.fxGroup = new THREE.Group();
    this.fxGroup.name = 'attackFx';
    scene.add(this.fxGroup);
    this.boardSize = 3;
  }

  setBoardSize(size) {
    this.boardSize = size;
  }

  worldToScreen(x, y, z) {
    const vec = new THREE.Vector3(x, y, z);
    vec.project(this.camera);
    const rect = this.container.getBoundingClientRect();
    return {
      x: (vec.x * 0.5 + 0.5) * rect.width,
      y: (-vec.y * 0.5 + 0.5) * rect.height,
    };
  }

  cellCenter(row, col) {
    const pos = tileWorldPosition(row, col, this.boardSize);
    return { x: pos.x, y: 0.55, z: pos.z };
  }

  flashTile(row, col, color, duration = 280) {
    const pos = tileWorldPosition(row, col, this.boardSize);
    const geo = new THREE.PlaneGeometry(0.82, 0.82);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.12, pos.z);
    this.fxGroup.add(mesh);

    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / duration;
      if (t >= 1) {
        this.fxGroup.remove(mesh);
        geo.dispose();
        mat.dispose();
        return;
      }
      mat.opacity = 0.75 * (1 - t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  headingTo(from, target) {
    const a = tileWorldPosition(from.row, from.col, this.boardSize);
    const b = tileWorldPosition(target.row, target.col, this.boardSize);
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  }

  triggerAttackPose(fx) {
    const attackerId = this.findUnitIdAt(fx.from.row, fx.from.col);
    const target = fx.targets[0];
    if (!attackerId || !target) return;
    this.unitManager.triggerAttack(attackerId, fx.type, this.headingTo(fx.from, target));
  }

  spawnProjectile(from, to, team, kind) {
    const color = kind === 'mage' ? 0xa855f7 : team === 'blue' ? 0x60a5fa : 0xf87171;
    const geo = new THREE.SphereGeometry(kind === 'mage' ? 0.1 : 0.08, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(from.x, from.y, from.z);
    this.fxGroup.add(mesh);

    const start = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / PROJECTILE_FLIGHT);
        mesh.position.lerpVectors(
          new THREE.Vector3(from.x, from.y, from.z),
          new THREE.Vector3(to.x, to.y, to.z),
          t
        );
        if (t >= 1) {
          this.fxGroup.remove(mesh);
          geo.dispose();
          mat.dispose();
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  shakeUnit(row, col) {
    this.unitManager.impactUnit(row, col);
  }

  fadeOutUnit(row, col) {
    const entry = this.unitManager.getUnitAt(row, col);
    if (!entry) return;
    entry.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.material.transparent = true;
      }
    });
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 320);
      entry.root.traverse((obj) => {
        if (obj.isMesh) obj.material.opacity = 1 - t;
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async play(fx) {
    const fromCenter = this.cellCenter(fx.from.row, fx.from.col);
    this.triggerAttackPose(fx);

    if (fx.type === 'melee') {
      await wait(MELEE_HIT_DELAY);
    } else {
      await wait(CAST_DELAY);

      if (fx.type === 'mage' && fx.targets.length > 0) {
        const lineCells = getLineCells(fx.from, fx.targets[fx.targets.length - 1]);
        for (const [r, c] of lineCells) {
          this.flashTile(r, c, 0xa855f7, 400);
        }
      }

      for (const target of fx.targets) {
        const toCenter = this.cellCenter(target.row, target.col);
        this.spawnProjectile(fromCenter, toCenter, fx.team, fx.type);
      }

      await wait(PROJECTILE_FLIGHT - 40);
    }

    const damageEls = [];
    for (const target of fx.targets) {
      this.flashTile(target.row, target.col, 0xffffff, 220);
      this.shakeUnit(target.row, target.col);
      if (target.killed) this.fadeOutUnit(target.row, target.col);

      const c = this.cellCenter(target.row, target.col);
      const center = this.worldToScreen(c.x, c.y, c.z);
      damageEls.push(spawnDamageNumber(this.fxLayer, center, fx.damage, target.killed));
    }

    await wait(DAMAGE_LINGER);

    damageEls.forEach((el) => el.remove());

    const explosions = fx.explosions ?? [];
    if (explosions.length === 0) return;

    for (const exp of explosions) {
      this.flashTile(exp.from.row, exp.from.col, 0xfbbf24, EXPLOSION_DURATION);
    }

    await wait(160);

    const blastDamageEls = [];
    for (const exp of explosions) {
      for (const target of exp.targets) {
        this.flashTile(target.row, target.col, 0xffffff, 220);
        this.shakeUnit(target.row, target.col);
        if (target.killed) this.fadeOutUnit(target.row, target.col);
        const c = this.cellCenter(target.row, target.col);
        const center = this.worldToScreen(c.x, c.y, c.z);
        blastDamageEls.push(
          spawnDamageNumber(this.fxLayer, center, exp.damage, target.killed)
        );
      }
    }

    await wait(EXPLOSION_DURATION);
    blastDamageEls.forEach((el) => el.remove());
  }

  findUnitIdAt(row, col) {
    const entry = this.unitManager.getUnitAt(row, col);
    return entry ? entry.root.userData.unitId : null;
  }
}
