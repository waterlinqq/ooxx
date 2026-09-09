/** glTF node names shared across engines and the bake pipeline. */
export const NODE = {
  ROOT: 'ooxx:UnitRoot',
  BODY: 'ooxx:Body',
  RIG: 'ooxx:Rig',
  TORSO: 'ooxx:Torso',
  HEAD: 'ooxx:Head',
  ARM_L: 'ooxx:ArmL',
  ARM_R: 'ooxx:ArmR',
  WEAPON: 'ooxx:Weapon',
  HOOD: 'ooxx:Hood',
  SCARF: 'ooxx:Scarf',
  CAPE: 'ooxx:Cape',
  CRAVAT: 'ooxx:Cravat',
  COAT: 'ooxx:Coat',
  SHIELD: 'ooxx:Shield',
  ROBE: 'ooxx:Robe',
  ORB: 'ooxx:Orb',
  RUNE_RING: 'ooxx:RuneRing',
  GEM: 'ooxx:Gem',
  SPARK: 'ooxx:Spark',
  BOMB: 'ooxx:Bomb',
  WING_L: 'ooxx:WingL',
  WING_R: 'ooxx:WingR',
  BOW_STRING: 'ooxx:BowString',
  LEG_L_HIP: 'ooxx:LegL_Hip',
  LEG_L_KNEE: 'ooxx:LegL_Knee',
  LEG_R_HIP: 'ooxx:LegR_Hip',
  LEG_R_KNEE: 'ooxx:LegR_Knee',
  EYE_STALK_L: 'ooxx:EyeStalkL',
  EYE_STALK_R: 'ooxx:EyeStalkR',
  BANNER: 'ooxx:Banner',
  WHEEL_FL: 'ooxx:WheelFL',
  WHEEL_FR: 'ooxx:WheelFR',
  WHEEL_RL: 'ooxx:WheelRL',
  WHEEL_RR: 'ooxx:WheelRR',
  SHADOW: 'ooxx:Shadow',
  RING: 'ooxx:TeamRing',
};

/** glTF/Three.js node names omit ':' (loader sanitizes on import). */
export function gltfNodeName(logicalName) {
  return logicalName.replace(/:/g, '');
}

function tag(node, name) {
  if (node) node.name = gltfNodeName(name);
}

function tagPivot(pivot, name) {
  tag(pivot?.node ?? pivot, name);
}

/** Stamp stable names onto a procedural unit before GLB export or debugging. */
export function tagRigNodes(model) {
  tag(model.root, NODE.ROOT);
  tag(model.body, NODE.BODY);
  tag(model.shadow, NODE.SHADOW);
  tag(model.ring, NODE.RING);

  const rig = model.rig;
  if (!rig) return;

  tag(rig.group, NODE.RIG);
  tag(rig.torso, NODE.TORSO);
  tag(rig.head, NODE.HEAD);
  tag(rig.armL, NODE.ARM_L);
  tag(rig.armR, NODE.ARM_R);
  tag(rig.weapon, NODE.WEAPON);
  tag(rig.hood, NODE.HOOD);
  tag(rig.scarf, NODE.SCARF);
  tag(rig.cape, NODE.CAPE);
  tag(rig.cravat, NODE.CRAVAT);
  tag(rig.coat, NODE.COAT);
  tag(rig.shield, NODE.SHIELD);
  tag(rig.robe, NODE.ROBE);
  tag(rig.orb, NODE.ORB);
  tag(rig.runeRing, NODE.RUNE_RING);
  tag(rig.gem, NODE.GEM);
  tag(rig.spark, NODE.SPARK);
  tag(rig.bomb, NODE.BOMB);
  tag(rig.wingL, NODE.WING_L);
  tag(rig.wingR, NODE.WING_R);
  tag(rig.bowString, NODE.BOW_STRING);
  tag(rig.eyeStalkL, NODE.EYE_STALK_L);
  tag(rig.eyeStalkR, NODE.EYE_STALK_R);
  tag(rig.banner, NODE.BANNER);
  tag(rig.wheelFL, NODE.WHEEL_FL);
  tag(rig.wheelFR, NODE.WHEEL_FR);
  tag(rig.wheelRL, NODE.WHEEL_RL);
  tag(rig.wheelRR, NODE.WHEEL_RR);
  tag(rig.body, NODE.TORSO);

  if (rig.legs) {
    tagPivot(rig.legs.left?.hip, NODE.LEG_L_HIP);
    tagPivot(rig.legs.left?.knee, NODE.LEG_L_KNEE);
    tagPivot(rig.legs.right?.hip, NODE.LEG_R_HIP);
    tagPivot(rig.legs.right?.knee, NODE.LEG_R_KNEE);
  }
}

export function findRigNode(root, name) {
  const stripped = gltfNodeName(name);
  const direct = root.getObjectByName(stripped) ?? root.getObjectByName(name);
  if (direct) return direct;

  let match = null;
  root.traverse((obj) => {
    if (obj.name === stripped || obj.name === name) match = obj;
  });
  return match;
}

function findNode(root, name) {
  return findRigNode(root, name);
}

/**
 * Rebuild the rig handle object expected by UnitMesh from a loaded glTF scene.
 * Animation clips are not wired yet; pivots are restored for procedural posing.
 */
export function resolveRigFromScene(root, classId, legSegments = null) {
  const rig = {
    kind: classId,
    group: findNode(root, NODE.RIG),
    torso: findNode(root, NODE.TORSO),
    head: findNode(root, NODE.HEAD),
    armL: findNode(root, NODE.ARM_L),
    armR: findNode(root, NODE.ARM_R),
    weapon: findNode(root, NODE.WEAPON),
    hood: findNode(root, NODE.HOOD),
    scarf: findNode(root, NODE.SCARF),
    cape: findNode(root, NODE.CAPE),
    cravat: findNode(root, NODE.CRAVAT),
    coat: findNode(root, NODE.COAT),
    shield: findNode(root, NODE.SHIELD),
    robe: findNode(root, NODE.ROBE),
    orb: findNode(root, NODE.ORB),
    runeRing: findNode(root, NODE.RUNE_RING),
    gem: findNode(root, NODE.GEM),
    spark: findNode(root, NODE.SPARK),
    bomb: findNode(root, NODE.BOMB),
    wingL: findNode(root, NODE.WING_L),
    wingR: findNode(root, NODE.WING_R),
    bowString: findNode(root, NODE.BOW_STRING),
    eyeStalkL: findNode(root, NODE.EYE_STALK_L),
    eyeStalkR: findNode(root, NODE.EYE_STALK_R),
    banner: findNode(root, NODE.BANNER),
    wheelFL: findNode(root, NODE.WHEEL_FL),
    wheelFR: findNode(root, NODE.WHEEL_FR),
    wheelRL: findNode(root, NODE.WHEEL_RL),
    wheelRR: findNode(root, NODE.WHEEL_RR),
    body: findNode(root, NODE.TORSO),
  };

  const hipL = findNode(root, NODE.LEG_L_HIP);
  const kneeL = findNode(root, NODE.LEG_L_KNEE);
  const hipR = findNode(root, NODE.LEG_R_HIP);
  const kneeR = findNode(root, NODE.LEG_R_KNEE);

  if (hipL && kneeL && hipR && kneeR) {
    rig.legs = {
      thigh: legSegments?.thigh ?? 0.066,
      shin: legSegments?.shin ?? 0.05625,
      left: { hip: { node: hipL }, knee: { node: kneeL } },
      right: { hip: { node: hipR }, knee: { node: kneeR } },
    };
  }

  const eyes = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material?.name) return;
    if (obj.material.name === 'eye') eyes.push(obj);
  });
  if (eyes.length) rig.eyes = eyes;

  return rig;
}

export function findBodyNode(root) {
  return findNode(root, NODE.BODY);
}

export function findShadowNode(root) {
  return findNode(root, NODE.SHADOW);
}

export function findRingNode(root) {
  return findNode(root, NODE.RING);
}
