import * as THREE from 'three';

/**
 * Plays glTF animation clips when present; otherwise the game keeps procedural pivot posing.
 */
export class UnitAnimationController {
  constructor(root, animations = [], clipMap = {}) {
    this.root = root;
    this.clipMap = clipMap;
    this.mixer = animations.length ? new THREE.AnimationMixer(root) : null;
    this.actions = new Map();
    this.current = null;
    this.currentName = null;
    this.walkWeight = 0;

    for (const [logicalName, gltfName] of Object.entries(clipMap)) {
      const clip = animations.find((entry) => entry.name === gltfName);
      if (!clip || !this.mixer) continue;
      this.actions.set(logicalName, this.mixer.clipAction(clip));
    }

    this.hasClips = this.actions.size > 0;
    if (this.hasClips) {
      this.mixer.addEventListener('finished', (event) => {
        if (!event.action || event.action.getLoop() === THREE.LoopRepeat) return;
        if (this.currentName === 'acted') return;
        this.resumeLocomotion();
      });
      this.play('idle', { loop: true, fade: 0 });
    }
  }

  get drivesPose() {
    return this.hasClips;
  }

  resumeLocomotion() {
    this.setLocomotion(this.walkWeight);
  }

  play(name, { loop = false, fade = 0.15 } = {}) {
    const next = this.actions.get(name);
    if (!next || !this.mixer) return false;
    if (this.currentName === name && next.isRunning() && (loop || !next.paused)) return true;

    for (const action of this.actions.values()) {
      action.enabled = true;
    }

    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    next.clampWhenFinished = !loop;

    if (this.current && this.current !== next) {
      this.current.fadeOut(fade);
    }
    next.fadeIn(fade).play();
    this.current = next;
    this.currentName = name;
    return true;
  }

  setLocomotion(walkWeight) {
    if (!this.hasClips) return;
    this.walkWeight = THREE.MathUtils.clamp(walkWeight, 0, 1);
    if (this.currentName === 'attackMelee' || this.currentName === 'attackRanged' || this.currentName === 'acted') {
      return;
    }
    const walk = this.actions.get('walk');
    const idle = this.actions.get('idle');
    if (!walk || !idle) return;

    const weight = this.walkWeight;
    idle.enabled = true;
    walk.enabled = true;
    idle.setEffectiveWeight(1 - weight);
    walk.setEffectiveWeight(weight);

    if (!idle.isRunning()) idle.play();
    if (!walk.isRunning()) walk.play();

    this.current = weight > 0.5 ? walk : idle;
    this.currentName = weight > 0.5 ? 'walk' : 'idle';
  }

  update(delta) {
    this.mixer?.update(delta);
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.actions.clear();
    this.mixer = null;
    this.current = null;
    this.currentName = null;
  }
}
