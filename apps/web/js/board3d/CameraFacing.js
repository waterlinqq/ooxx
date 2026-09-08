import * as THREE from 'three';

// Shallower 3/4 view than the old ~47° ortho: ~38° elevation, mild telephoto.
export const BOARD_CAM = {
  pos: new THREE.Vector3(0, 8.05, 10.15),
  lookAt: new THREE.Vector3(0, 0.2, 0),
  fov: 28,
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_DOWN = new THREE.Vector3();

export function getScreenGroundAxes() {
  TMP_FORWARD.copy(BOARD_CAM.lookAt).sub(BOARD_CAM.pos).normalize();
  TMP_RIGHT.crossVectors(WORLD_UP, TMP_FORWARD).normalize();
  TMP_DOWN.crossVectors(TMP_FORWARD, TMP_RIGHT).normalize();
  TMP_RIGHT.set(TMP_RIGHT.x, 0, TMP_RIGHT.z).normalize();
  TMP_DOWN.set(TMP_DOWN.x, 0, TMP_DOWN.z).normalize();
  return { right: TMP_RIGHT, down: TMP_DOWN };
}

// Idle yaw so unit models (+Z front) face the camera on the ground plane.
export function playerFacingYaw(_team) {
  const { down } = getScreenGroundAxes();
  return Math.atan2(-down.x, -down.z);
}
