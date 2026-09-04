import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// Just off the ground, so the fingertip lands at the foot of whatever it points at.
const ANCHOR_HEIGHT = 0.12;

/**
 * The tutorial's "tap here" finger. One shared marker that hops between a reserve unit,
 * a board unit and a target cell as the current step progresses.
 *
 * The hand lives in a child span because CSS2DRenderer overwrites the root element's
 * `transform` every frame, which would kill any animation applied there.
 */
export class TutorialPointer {
  constructor(scene) {
    this.element = document.createElement('div');
    this.element.className = 'tutorial-pointer';
    this.element.innerHTML = '<span class="tutorial-pointer-hand">👆</span>';

    this.object = new CSS2DObject(this.element);
    // Hang the hand below its anchor so the raised fingertip touches the target instead
    // of the palm covering it.
    this.object.center.set(0.5, 0);
    this.object.visible = false;
    scene.add(this.object);
  }

  hide() {
    this.object.visible = false;
  }

  pointAt({ x, z }) {
    this.object.position.set(x, ANCHOR_HEIGHT, z);
    this.object.visible = true;
  }

  dispose() {
    this.object.removeFromParent();
    this.element.remove();
  }
}
