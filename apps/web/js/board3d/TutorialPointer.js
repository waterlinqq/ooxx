import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// Default height for empty cells — slightly above the tile surface.
export const DEFAULT_ANCHOR_HEIGHT = 0.2;
// Chest height for occupied cells so the finger lands on the unit, not the floor.
export const UNIT_ANCHOR_HEIGHT = 0.52;

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
    // Pin the bottom edge (fingertip after rotate(180deg)) to the target world position.
    this.object.center.set(0.5, 0);
    this.object.visible = false;
    scene.add(this.object);
  }

  hide() {
    this.object.visible = false;
  }

  pointAt({ x, y = DEFAULT_ANCHOR_HEIGHT, z }) {
    this.object.position.set(x, y, z);
    this.object.visible = true;
  }

  dispose() {
    this.object.removeFromParent();
    this.element.remove();
  }
}
