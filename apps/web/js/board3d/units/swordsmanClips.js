import * as THREE from 'three';
import { NODE, findRigNode } from './rigNames.js';

const FPS = 30;
const REST_ARM = {
  [NODE.ARM_L]: new THREE.Euler(0.1, 0, -0.12),
  [NODE.ARM_R]: new THREE.Euler(-0.36, 0, 0.28),
  [NODE.WEAPON]: new THREE.Euler(-0.24, 0, 0.34),
};

function sampleFrames(durationSec, step = 1) {
  const end = Math.max(2, Math.round(durationSec * FPS));
  const frames = [];
  for (let frame = 1; frame <= end; frame += step) {
    frames.push((frame - 1) / FPS);
  }
  if (frames[frames.length - 1] !== (end - 1) / FPS) {
    frames.push((end - 1) / FPS);
  }
  return { frames, duration: (end - 1) / FPS || durationSec };
}

function track(nodeId, property, times, values) {
  return new THREE.NumberKeyframeTrack(`${nodeId}.${property}`, times, values);
}

function nodeId(root, name) {
  const node = findRigNode(root, name);
  if (!node) throw new Error(`Missing rig node: ${name}`);
  return node.uuid;
}

function rotTracks(root, name, times, xs, ys, zs) {
  const id = nodeId(root, name);
  return [
    track(id, 'rotation[x]', times, xs),
    track(id, 'rotation[y]', times, ys),
    track(id, 'rotation[z]', times, zs),
  ];
}

function locTracks(root, name, times, xs, ys, zs) {
  const id = nodeId(root, name);
  return [
    track(id, 'position[x]', times, xs),
    track(id, 'position[y]', times, ys),
    track(id, 'position[z]', times, zs),
  ];
}

function scaleTracks(root, name, times, xs, ys, zs) {
  const id = nodeId(root, name);
  return [
    track(id, 'scale[x]', times, xs),
    track(id, 'scale[y]', times, ys),
    track(id, 'scale[z]', times, zs),
  ];
}

function legPose(phase, walk = 1, crouch = 0) {
  const crouchHip = 0.45 * crouch;
  const crouchBend = 0.95 * crouch;
  const legs = {};

  for (const [side, hipName, kneeName, lead] of [
    ['left', NODE.LEG_L_HIP, NODE.LEG_L_KNEE, true],
    ['right', NODE.LEG_R_HIP, NODE.LEG_R_KNEE, false],
  ]) {
    const legPhase = phase + (lead ? 0 : Math.PI);
    const stepSwing = Math.sin(legPhase) * 0.52 * walk;
    const stepBend = Math.max(0, -Math.sin(legPhase + 0.9)) * 0.85 * walk;
    legs[hipName] = crouchHip + stepSwing;
    legs[kneeName] = -Math.max(0, crouchBend + stepBend);
  }

  const step = Math.sin(phase) * walk;
  return { legs, torsoY: -step * 0.09, armL: -step * 0.32, armR: step * 0.32 };
}

function applyRestArms(root) {
  for (const [name, euler] of Object.entries(REST_ARM)) {
    const node = findRigNode(root, name);
    if (node) node.rotation.copy(euler);
  }
}

function buildIdleClip(root) {
  const { frames, duration } = sampleFrames(2.0, 15);
  const torso = { x: [], y: [], z: [] };
  const head = { x: [], y: [], z: [] };
  const headY = [];
  const torsoY = [];
  const torsoScale = { x: [], y: [], z: [] };
  const armL = { x: [], y: [], z: [] };
  const armR = { x: [], y: [], z: [] };
  const weapon = { x: [], y: [], z: [] };

  for (const t of frames) {
    const breath = Math.sin(t * 2.1);
    const sway = Math.sin(t * 0.85);
    const idleArm = Math.sin(t * 1.9) * 0.05;
    torso.x.push(0);
    torso.y.push(-sway * 0.02);
    torso.z.push(0);
    torsoY.push(breath * 0.006);
    torsoScale.x.push(1 - breath * 0.012);
    torsoScale.y.push(1 + breath * 0.026);
    torsoScale.z.push(1 - breath * 0.012);
    head.x.push(Math.sin(t * 1.6) * 0.035);
    head.y.push(sway * 0.16);
    head.z.push(0);
    headY.push(breath * 0.008);
    armL.x.push(REST_ARM[NODE.ARM_L].x + idleArm);
    armL.y.push(0);
    armL.z.push(REST_ARM[NODE.ARM_L].z - breath * 0.03);
    armR.x.push(REST_ARM[NODE.ARM_R].x - Math.sin(t * 1.9 + 0.6) * 0.05);
    armR.y.push(0);
    armR.z.push(REST_ARM[NODE.ARM_R].z + breath * 0.03);
    weapon.x.push(REST_ARM[NODE.WEAPON].x);
    weapon.y.push(0);
    weapon.z.push(REST_ARM[NODE.WEAPON].z + Math.sin(t * 1.3) * 0.05);
  }

  const tracks = [
    ...rotTracks(root, NODE.TORSO, frames, torso.x, torso.y, torso.z),
    ...locTracks(root, NODE.TORSO, frames, frames.map(() => 0), torsoY, frames.map(() => 0)),
    ...scaleTracks(root, NODE.TORSO, frames, torsoScale.x, torsoScale.y, torsoScale.z),
    ...rotTracks(root, NODE.HEAD, frames, head.x, head.y, head.z),
    ...locTracks(root, NODE.HEAD, frames, frames.map(() => 0), headY, frames.map(() => 0)),
    ...rotTracks(root, NODE.ARM_L, frames, armL.x, armL.y, armL.z),
    ...rotTracks(root, NODE.ARM_R, frames, armR.x, armR.y, armR.z),
    ...rotTracks(root, NODE.WEAPON, frames, weapon.x, weapon.y, weapon.z),
  ];

  return new THREE.AnimationClip('idle', duration, tracks);
}

function buildWalkClip(root) {
  const { frames, duration } = sampleFrames(0.667, 1);
  const tracks = [];
  const legData = {
    [NODE.LEG_L_HIP]: [],
    [NODE.LEG_L_KNEE]: [],
    [NODE.LEG_R_HIP]: [],
    [NODE.LEG_R_KNEE]: [],
  };
  const torsoY = [];
  const armLx = [];
  const armRx = [];

  for (let i = 0; i < frames.length; i++) {
    const phase = (i / (frames.length - 1)) * Math.PI * 2;
    const pose = legPose(phase, 1, 0);
    for (const [name, value] of Object.entries(pose.legs)) legData[name].push(value);
    torsoY.push(pose.torsoY);
    armLx.push(REST_ARM[NODE.ARM_L].x + pose.armL);
    armRx.push(REST_ARM[NODE.ARM_R].x + pose.armR);
  }

  for (const [name, values] of Object.entries(legData)) {
    const id = nodeId(root, name);
    tracks.push(track(id, 'rotation[x]', frames, values));
    tracks.push(track(id, 'rotation[y]', frames, frames.map(() => 0)));
    tracks.push(track(id, 'rotation[z]', frames, frames.map(() => 0)));
  }
  tracks.push(...rotTracks(
    root,
    NODE.TORSO,
    frames,
    frames.map(() => 0),
    torsoY,
    frames.map(() => 0),
  ));
  tracks.push(track(nodeId(root, NODE.ARM_L), 'rotation[x]', frames, armLx));
  tracks.push(track(nodeId(root, NODE.ARM_R), 'rotation[x]', frames, armRx));

  return new THREE.AnimationClip('walk', duration, tracks);
}

function buildAttackMeleeClip(root) {
  const { frames, duration } = sampleFrames(0.42, 1);
  const torsoZ = [];
  const armRx = [];
  const weaponX = [];
  const weaponZ = [];
  const armLx = [];

  for (let i = 0; i < frames.length; i++) {
    const p = i / (frames.length - 1);
    const windup = Math.max(0, 1 - p * 2.2);
    const swing = Math.sin(Math.min(1, p * 1.8) * Math.PI);
    torsoZ.push(swing * 0.16 - windup * 0.22);
    armRx.push(REST_ARM[NODE.ARM_R].x + swing * 0.9 - windup * 0.35);
    weaponX.push(REST_ARM[NODE.WEAPON].x + swing * 0.55);
    weaponZ.push(REST_ARM[NODE.WEAPON].z - swing * 0.35);
    armLx.push(REST_ARM[NODE.ARM_L].x + windup * 0.15);
  }

  const tracks = [
    ...rotTracks(root, NODE.TORSO, frames, frames.map(() => 0), frames.map(() => 0), torsoZ),
    track(nodeId(root, NODE.ARM_R), 'rotation[x]', frames, armRx),
    track(nodeId(root, NODE.ARM_L), 'rotation[x]', frames, armLx),
    ...rotTracks(root, NODE.WEAPON, frames, weaponX, frames.map(() => 0), weaponZ),
  ];
  return new THREE.AnimationClip('attack_melee', duration, tracks);
}

function buildSpawnDropClip(root) {
  const { frames, duration } = sampleFrames(0.65, 1);
  const bodyZ = [];
  const rigScaleX = [];
  const rigScaleY = [];
  const rigScaleZ = [];
  const height = 1.0;

  for (let i = 0; i < frames.length; i++) {
    const p = i / (frames.length - 1);
    const fall = Math.min(1, p / 0.55);
    const lift = height * (1 - fall * fall);
    const stretch = (1 - fall) * 0.16;
    let z = lift;
    if (p > 0.55) {
      const landP = (p - 0.55) / 0.45;
      const land = Math.exp(-3.4 * landP) * Math.cos(landP * Math.PI * 2);
      z += land * 0.04;
    }
    bodyZ.push(z);
    rigScaleX.push(1 + stretch * 0.2);
    rigScaleY.push(1 - stretch);
    rigScaleZ.push(1 + stretch * 0.2);
  }

  const tracks = [
    ...locTracks(root, NODE.BODY, frames, frames.map(() => 0), frames.map(() => 0), bodyZ),
    ...scaleTracks(root, NODE.RIG, frames, rigScaleX, rigScaleY, rigScaleZ),
  ];
  return new THREE.AnimationClip('spawn_drop', duration, tracks);
}

function buildActedClip(root) {
  const { frames, duration } = sampleFrames(0.35, 1);
  const tracks = [];
  const legData = {
    [NODE.LEG_L_HIP]: [],
    [NODE.LEG_L_KNEE]: [],
    [NODE.LEG_R_HIP]: [],
    [NODE.LEG_R_KNEE]: [],
  };
  const torsoX = [];
  const headX = [];
  const armLx = [];
  const armRx = [];
  const weaponX = [];
  const weaponZ = [];

  for (let i = 0; i < frames.length; i++) {
    const p = i / (frames.length - 1);
    const amount = Math.min(1, p * 1.2);
    const pose = legPose(0, 0, amount);
    for (const [name, value] of Object.entries(pose.legs)) legData[name].push(value);
    torsoX.push(amount * 0.2);
    headX.push(-amount * 0.14);
    armLx.push(REST_ARM[NODE.ARM_L].x + amount * 0.22);
    armRx.push(REST_ARM[NODE.ARM_R].x + amount * 0.2);
    weaponX.push(REST_ARM[NODE.WEAPON].x + amount * 0.5);
    weaponZ.push(REST_ARM[NODE.WEAPON].z - amount * 0.35);
  }

  for (const [name, values] of Object.entries(legData)) {
    tracks.push(track(nodeId(root, name), 'rotation[x]', frames, values));
  }
  tracks.push(track(nodeId(root, NODE.TORSO), 'rotation[x]', frames, torsoX));
  tracks.push(track(nodeId(root, NODE.HEAD), 'rotation[x]', frames, headX));
  tracks.push(track(nodeId(root, NODE.ARM_L), 'rotation[x]', frames, armLx));
  tracks.push(track(nodeId(root, NODE.ARM_R), 'rotation[x]', frames, armRx));
  tracks.push(track(nodeId(root, NODE.WEAPON), 'rotation[x]', frames, weaponX));
  tracks.push(track(nodeId(root, NODE.WEAPON), 'rotation[z]', frames, weaponZ));

  return new THREE.AnimationClip('acted', duration, tracks);
}

export function buildSwordsmanAnimationClips(root) {
  return [
    buildIdleClip(root),
    buildWalkClip(root),
    buildAttackMeleeClip(root),
    buildSpawnDropClip(root),
    buildActedClip(root),
  ];
}

export function prepareSwordsmanRig(root) {
  applyRestArms(root);
}

export function listRigNodeNames(root) {
  const names = [];
  root.traverse((obj) => {
    if (obj.name?.startsWith('ooxx')) names.push(obj.name);
  });
  return names;
}
