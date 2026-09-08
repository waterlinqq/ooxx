import * as THREE from 'three';
import { NODE, findRigNode } from './rigNames.js';

const FPS = 30;
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();

const ANIMATED_NODES = [
  NODE.TORSO,
  NODE.HEAD,
  NODE.ARM_L,
  NODE.ARM_R,
  NODE.WEAPON,
  NODE.LEG_L_HIP,
  NODE.LEG_L_KNEE,
  NODE.LEG_R_HIP,
  NODE.LEG_R_KNEE,
  NODE.BODY,
  NODE.RIG,
];

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

function hasNode(root, name) {
  return Boolean(findRigNode(root, name));
}

function nodeBinding(root, name) {
  const node = findRigNode(root, name);
  if (!node) throw new Error(`Missing rig node: ${name}`);
  return node.name;
}

/** Capture authored rest pose so clips animate as rest + delta (matches UnitMesh procedural posing). */
function captureRestRig(root) {
  const rest = {};
  for (const name of ANIMATED_NODES) {
    const node = findRigNode(root, name);
    if (!node) continue;
    rest[name] = {
      rot: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
      pos: { x: node.position.x, y: node.position.y, z: node.position.z },
      scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
    };
  }
  return rest;
}

function rot(rest, name, axis) {
  return rest[name]?.rot?.[axis] ?? 0;
}

function pos(rest, name, axis) {
  return rest[name]?.pos?.[axis] ?? 0;
}

function scl(rest, name, axis) {
  return rest[name]?.scale?.[axis] ?? 1;
}

function vec3Track(binding, prop, times, xs, ys, zs) {
  const values = [];
  for (let i = 0; i < times.length; i++) {
    values.push(xs[i], ys[i], zs[i]);
  }
  return new THREE.VectorKeyframeTrack(`${binding}.${prop}`, times, values);
}

function quatTrack(binding, times, xs, ys, zs) {
  const values = [];
  for (let i = 0; i < times.length; i++) {
    _euler.set(xs[i], ys[i], zs[i]);
    _quat.setFromEuler(_euler);
    values.push(_quat.x, _quat.y, _quat.z, _quat.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${binding}.quaternion`, times, values);
}

function rotTrack(root, name, times, xs, ys, zs) {
  return quatTrack(nodeBinding(root, name), times, xs, ys, zs);
}

function rotTrackIf(root, name, times, xs, ys, zs) {
  if (!hasNode(root, name)) return null;
  return rotTrack(root, name, times, xs, ys, zs);
}

function locTrackIf(root, name, times, xs, ys, zs) {
  if (!hasNode(root, name)) return null;
  return vec3Track(nodeBinding(root, name), 'position', times, xs, ys, zs);
}

function scaleTrackIf(root, name, times, xs, ys, zs) {
  if (!hasNode(root, name)) return null;
  return vec3Track(nodeBinding(root, name), 'scale', times, xs, ys, zs);
}

function rotXTrackWithRest(root, name, times, deltaXs, rest) {
  if (!hasNode(root, name)) return null;
  const base = rest[name]?.rot ?? { x: 0, y: 0, z: 0 };
  return rotTrackIf(
    root,
    name,
    times,
    deltaXs.map((delta) => base.x + delta),
    times.map(() => base.y),
    times.map(() => base.z),
  );
}

function compact(tracks) {
  return tracks.filter(Boolean);
}

function hasLegs(root) {
  return hasNode(root, NODE.LEG_L_HIP) && hasNode(root, NODE.LEG_L_KNEE);
}

function legPose(phase, walk = 1, crouch = 0) {
  const crouchHip = 0.45 * crouch;
  const crouchBend = 0.95 * crouch;
  const legs = {};

  for (const [hipName, kneeName, lead] of [
    [NODE.LEG_L_HIP, NODE.LEG_L_KNEE, true],
    [NODE.LEG_R_HIP, NODE.LEG_R_KNEE, false],
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

function buildIdleClip(root, rest) {
  const { frames, duration } = sampleFrames(2.0, 15);
  const torso = { x: [], y: [], z: [] };
  const torsoPosY = [];
  const torsoScale = { x: [], y: [], z: [] };
  const armL = { x: [], y: [], z: [] };
  const armR = { x: [], y: [], z: [] };
  const weapon = { x: [], y: [], z: [] };

  for (const t of frames) {
    const breath = Math.sin(t * 2.1);
    const sway = Math.sin(t * 0.85);
    const idleArm = Math.sin(t * 1.9) * 0.05;
    torso.x.push(rot(rest, NODE.TORSO, 'x'));
    torso.y.push(rot(rest, NODE.TORSO, 'y') - sway * 0.02);
    torso.z.push(rot(rest, NODE.TORSO, 'z'));
    torsoPosY.push(pos(rest, NODE.TORSO, 'y') + breath * 0.006);
    torsoScale.x.push(scl(rest, NODE.TORSO, 'x') * (1 - breath * 0.012));
    torsoScale.y.push(scl(rest, NODE.TORSO, 'y') * (1 + breath * 0.026));
    torsoScale.z.push(scl(rest, NODE.TORSO, 'z') * (1 - breath * 0.012));
    armL.x.push(rot(rest, NODE.ARM_L, 'x') + idleArm);
    armL.y.push(rot(rest, NODE.ARM_L, 'y'));
    armL.z.push(rot(rest, NODE.ARM_L, 'z') - breath * 0.03);
    armR.x.push(rot(rest, NODE.ARM_R, 'x') - Math.sin(t * 1.9 + 0.6) * 0.05);
    armR.y.push(rot(rest, NODE.ARM_R, 'y'));
    armR.z.push(rot(rest, NODE.ARM_R, 'z') + breath * 0.03);
    weapon.x.push(rot(rest, NODE.WEAPON, 'x'));
    weapon.y.push(rot(rest, NODE.WEAPON, 'y'));
    weapon.z.push(rot(rest, NODE.WEAPON, 'z') + Math.sin(t * 1.3) * 0.05);
  }

  const tracks = compact([
    rotTrackIf(root, NODE.TORSO, frames, torso.x, torso.y, torso.z),
    locTrackIf(
      root,
      NODE.TORSO,
      frames,
      frames.map(() => pos(rest, NODE.TORSO, 'x')),
      torsoPosY,
      frames.map(() => pos(rest, NODE.TORSO, 'z')),
    ),
    scaleTrackIf(root, NODE.TORSO, frames, torsoScale.x, torsoScale.y, torsoScale.z),
    rotTrackIf(root, NODE.ARM_L, frames, armL.x, armL.y, armL.z),
    rotTrackIf(root, NODE.ARM_R, frames, armR.x, armR.y, armR.z),
    rotTrackIf(root, NODE.WEAPON, frames, weapon.x, weapon.y, weapon.z),
  ]);

  return new THREE.AnimationClip('idle', duration, tracks);
}

function buildWalkClip(root, rest) {
  const { frames, duration } = sampleFrames(0.667, 1);
  const tracks = [];
  const legData = {
    [NODE.LEG_L_HIP]: [],
    [NODE.LEG_L_KNEE]: [],
    [NODE.LEG_R_HIP]: [],
    [NODE.LEG_R_KNEE]: [],
  };
  const torsoRotY = [];
  const armLx = [];
  const armRx = [];

  for (let i = 0; i < frames.length; i++) {
    const phase = (i / (frames.length - 1)) * Math.PI * 2;
    const pose = legPose(phase, 1, 0);
    if (hasLegs(root)) {
      for (const [name, value] of Object.entries(pose.legs)) legData[name].push(value);
    }
    torsoRotY.push(rot(rest, NODE.TORSO, 'y') + (hasLegs(root) ? pose.torsoY : 0));
    armLx.push(rot(rest, NODE.ARM_L, 'x') + (hasLegs(root) ? pose.armL : 0));
    armRx.push(rot(rest, NODE.ARM_R, 'x') + (hasLegs(root) ? pose.armR : 0));
  }

  if (hasLegs(root)) {
    for (const [name, values] of Object.entries(legData)) {
      tracks.push(rotXTrackWithRest(root, name, frames, values, rest));
    }
  }
  tracks.push(
    rotTrackIf(
      root,
      NODE.TORSO,
      frames,
      frames.map(() => rot(rest, NODE.TORSO, 'x')),
      torsoRotY,
      frames.map(() => rot(rest, NODE.TORSO, 'z')),
    ),
    rotXTrackWithRest(root, NODE.ARM_L, frames, armLx.map((v) => v - rot(rest, NODE.ARM_L, 'x')), rest),
    rotXTrackWithRest(root, NODE.ARM_R, frames, armRx.map((v) => v - rot(rest, NODE.ARM_R, 'x')), rest),
  );

  return new THREE.AnimationClip('walk', duration, compact(tracks));
}

function buildAttackClip(root, rest, clipName) {
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
    torsoZ.push(rot(rest, NODE.TORSO, 'z') + swing * 0.16 - windup * 0.22);
    armRx.push(rot(rest, NODE.ARM_R, 'x') + swing * 0.9 - windup * 0.35);
    weaponX.push(rot(rest, NODE.WEAPON, 'x') + swing * 0.55);
    weaponZ.push(rot(rest, NODE.WEAPON, 'z') - swing * 0.35);
    armLx.push(rot(rest, NODE.ARM_L, 'x') + windup * 0.15);
  }

  const tracks = compact([
    rotTrackIf(
      root,
      NODE.TORSO,
      frames,
      frames.map(() => rot(rest, NODE.TORSO, 'x')),
      frames.map(() => rot(rest, NODE.TORSO, 'y')),
      torsoZ,
    ),
    rotXTrackWithRest(root, NODE.ARM_R, frames, armRx.map((v) => v - rot(rest, NODE.ARM_R, 'x')), rest),
    rotXTrackWithRest(root, NODE.ARM_L, frames, armLx.map((v) => v - rot(rest, NODE.ARM_L, 'x')), rest),
    rotTrackIf(
      root,
      NODE.WEAPON,
      frames,
      weaponX,
      frames.map(() => rot(rest, NODE.WEAPON, 'y')),
      weaponZ,
    ),
  ]);
  return new THREE.AnimationClip(clipName, duration, tracks);
}

function buildSpawnDropClip(root, rest) {
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
    rigScaleX.push(scl(rest, NODE.RIG, 'x') * (1 + stretch * 0.2));
    rigScaleY.push(scl(rest, NODE.RIG, 'y') * (1 - stretch));
    rigScaleZ.push(scl(rest, NODE.RIG, 'z') * (1 + stretch * 0.2));
  }

  const tracks = compact([
    locTrackIf(
      root,
      NODE.BODY,
      frames,
      frames.map(() => pos(rest, NODE.BODY, 'x')),
      frames.map(() => pos(rest, NODE.BODY, 'y')),
      bodyZ.map((delta) => pos(rest, NODE.BODY, 'z') + delta),
    ),
    scaleTrackIf(root, NODE.RIG, frames, rigScaleX, rigScaleY, rigScaleZ),
  ]);
  return new THREE.AnimationClip('spawn_drop', duration, tracks);
}

function buildSpawnWarpClip(root, rest) {
  const { frames, duration } = sampleFrames(0.54, 1);
  const rigScaleX = [];
  const rigScaleY = [];
  const rigScaleZ = [];
  const bodyY = [];

  for (let i = 0; i < frames.length; i++) {
    const p = i / (frames.length - 1);
    const grow = Math.min(1, p / 0.7);
    const eased = 1 - (1 - grow) ** 3;
    const scale = 0.3 + 0.7 * eased;
    rigScaleX.push(scl(rest, NODE.RIG, 'x') * scale);
    rigScaleY.push(scl(rest, NODE.RIG, 'y') * scale);
    rigScaleZ.push(scl(rest, NODE.RIG, 'z') * scale);
    bodyY.push(pos(rest, NODE.BODY, 'y') + 0.14 * (1 - eased));
  }

  const tracks = compact([
    locTrackIf(
      root,
      NODE.BODY,
      frames,
      frames.map(() => pos(rest, NODE.BODY, 'x')),
      bodyY,
      frames.map(() => pos(rest, NODE.BODY, 'z')),
    ),
    scaleTrackIf(root, NODE.RIG, frames, rigScaleX, rigScaleY, rigScaleZ),
  ]);
  return new THREE.AnimationClip('spawn_warp', duration, tracks);
}

function buildActedClip(root, rest) {
  const { frames, duration } = sampleFrames(0.35, 1);
  const tracks = [];
  const legData = {
    [NODE.LEG_L_HIP]: [],
    [NODE.LEG_L_KNEE]: [],
    [NODE.LEG_R_HIP]: [],
    [NODE.LEG_R_KNEE]: [],
  };
  const torsoX = [];
  const armLx = [];
  const armRx = [];
  const weaponX = [];
  const weaponZ = [];

  for (let i = 0; i < frames.length; i++) {
    const p = i / (frames.length - 1);
    const amount = Math.min(1, p * 1.2);
    const pose = legPose(0, 0, amount);
    if (hasLegs(root)) {
      for (const [name, value] of Object.entries(pose.legs)) legData[name].push(value);
    }
    torsoX.push(amount * 0.2);
    armLx.push(rot(rest, NODE.ARM_L, 'x') + amount * 0.22);
    armRx.push(rot(rest, NODE.ARM_R, 'x') + amount * 0.2);
    weaponX.push(rot(rest, NODE.WEAPON, 'x') + amount * 0.5);
    weaponZ.push(rot(rest, NODE.WEAPON, 'z') - amount * 0.35);
  }

  if (hasLegs(root)) {
    for (const [name, values] of Object.entries(legData)) {
      tracks.push(rotXTrackWithRest(root, name, frames, values, rest));
    }
  }
  tracks.push(
    rotXTrackWithRest(root, NODE.TORSO, frames, torsoX, rest),
    rotXTrackWithRest(root, NODE.ARM_L, frames, armLx.map((v) => v - rot(rest, NODE.ARM_L, 'x')), rest),
    rotXTrackWithRest(root, NODE.ARM_R, frames, armRx.map((v) => v - rot(rest, NODE.ARM_R, 'x')), rest),
    rotTrackIf(
      root,
      NODE.WEAPON,
      frames,
      weaponX,
      frames.map(() => rot(rest, NODE.WEAPON, 'y')),
      weaponZ,
    ),
  );

  return new THREE.AnimationClip('acted', duration, compact(tracks));
}

const CLIP_BUILDERS = {
  idle: (root, rest) => buildIdleClip(root, rest),
  walk: (root, rest) => buildWalkClip(root, rest),
  attack_melee: (root, rest) => buildAttackClip(root, rest, 'attack_melee'),
  attack_ranged: (root, rest) => buildAttackClip(root, rest, 'attack_ranged'),
  spawn_drop: (root, rest) => buildSpawnDropClip(root, rest),
  spawn_warp: (root, rest) => buildSpawnWarpClip(root, rest),
  acted: (root, rest) => buildActedClip(root, rest),
};

/**
 * Build glTF clips listed in manifest `clips` (values are glTF clip names).
 */
export function buildUnitAnimationClips(root, manifestClips = {}) {
  if (!hasNode(root, NODE.TORSO)) return [];
  const rest = captureRestRig(root);
  const wanted = new Set(Object.values(manifestClips));
  const clips = [];

  for (const name of wanted) {
    const build = CLIP_BUILDERS[name];
    if (!build) continue;
    const clip = build(root, rest);
    if (clip.tracks.length > 0) clips.push(clip);
  }

  return clips;
}

export function listRigNodeNames(root) {
  const names = [];
  root.traverse((obj) => {
    if (obj.name?.startsWith('ooxx')) names.push(obj.name);
  });
  return names;
}
