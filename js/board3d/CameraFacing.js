import * as THREE from 'three';

// Keep in sync with BoardScene camera (0, 8.5, 8) → lookAt origin.
const CAMERA_POS = new THREE.Vector3(0, 8.5, 8);
const LOOK_AT = new THREE.Vector3(0, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_DOWN = new THREE.Vector3();

export function getScreenGroundAxes() {
  TMP_FORWARD.copy(LOOK_AT).sub(CAMERA_POS).normalize();
  TMP_RIGHT.crossVectors(WORLD_UP, TMP_FORWARD).normalize();
  TMP_DOWN.crossVectors(TMP_FORWARD, TMP_RIGHT).normalize();
  TMP_RIGHT.set(TMP_RIGHT.x, 0, TMP_RIGHT.z).normalize();
  TMP_DOWN.set(TMP_DOWN.x, 0, TMP_DOWN.z).normalize();
  return { right: TMP_RIGHT, down: TMP_DOWN };
}

export function playerFacingYaw(team) {
  const { right } = getScreenGroundAxes();
  if (team === 'blue') {
    return Math.atan2(right.x, right.z);
  }
  return Math.atan2(-right.x, -right.z);
}
