import * as THREE from 'three';
import { resolveUnitColor } from '../units.js';

const geoCache = new Map();
let contactShadowTex = null;

function cached(key, factory) {
  let geometry = geoCache.get(key);
  if (!geometry) {
    geometry = factory();
    geometry.userData.shared = true;
    geoCache.set(key, geometry);
  }
  return geometry;
}

function contactShadowTexture() {
  if (contactShadowTex) return contactShadowTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  contactShadowTex = new THREE.CanvasTexture(canvas);
  contactShadowTex.colorSpace = THREE.SRGBColorSpace;
  return contactShadowTex;
}

function standard(color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.2,
    ...options,
  });
  material.userData.baseOpacity = material.opacity;
  material.userData.baseColor = material.color.clone();
  material.userData.baseEmissive = material.emissiveIntensity;
  return material;
}

// The base ring stays team-coloured even when the unit is greyed out after acting.
function keepColor(material) {
  material.userData.keepColor = true;
  return material;
}

const TEAM_MATERIAL_KEYS = ['armor', 'armorDeep', 'cloth', 'trim', 'eye', 'ring', 'shadow'];

function markGlobalShared(material) {
  material.userData.globalShared = true;
  return material;
}

function markNeutralTemplate(material) {
  material.userData.neutralTemplate = true;
  return material;
}

function createNeutralCloneTemplates() {
  const templates = {
    ember: markNeutralTemplate(standard(0xfff0c2, {
      roughness: 0.4,
      emissive: 0xffbe3d,
      emissiveIntensity: 1.8,
    })),
    arcane: markNeutralTemplate(standard(0xd8b4fe, {
      roughness: 0.25,
      metalness: 0.1,
      emissive: 0xa855f7,
      emissiveIntensity: 1.7,
      transparent: true,
      opacity: 0.92,
    })),
  };
  for (const [key, material] of Object.entries(templates)) {
    material.name = key;
  }
  return templates;
}

function createGlobalMaterials() {
  const materials = {
    steel: markGlobalShared(standard(0xc9d4e2, { roughness: 0.32, metalness: 0.72 })),
    gold: markGlobalShared(standard(0xf5c451, {
      roughness: 0.3,
      metalness: 0.68,
      emissive: 0x6b3f04,
      emissiveIntensity: 0.35,
    })),
    leather: markGlobalShared(standard(0x4a382c, { roughness: 0.9, metalness: 0.06 })),
    wood: markGlobalShared(standard(0x7a5230, { roughness: 0.82, metalness: 0.05 })),
    skin: markGlobalShared(standard(0xf0cba8, { roughness: 0.78, metalness: 0 })),
    charcoal: markGlobalShared(standard(0x1b2333, { roughness: 0.68, metalness: 0.25 })),
  };
  for (const [key, material] of Object.entries(materials)) {
    material.name = key;
  }
  return materials;
}

const GLOBAL_MATERIALS = createGlobalMaterials();
const NEUTRAL_CLONE_TEMPLATES = createNeutralCloneTemplates();
const TEAM_MATERIAL_TEMPLATES = new Map();

function cloneTintableMaterial(template) {
  const copy = template.clone();
  copy.userData = {
    baseOpacity: template.userData.baseOpacity,
    baseColor: template.userData.baseColor?.clone(),
    baseEmissive: template.userData.baseEmissive,
    keepColor: template.userData.keepColor,
    skipTint: template.userData.skipTint,
  };
  return copy;
}

function buildTeamMaterialTemplate(team) {
  const base = new THREE.Color(resolveUnitColor(team));
  const deep = base.clone().lerp(new THREE.Color(0x0b1220), 0.55);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.5);
  const glowColor = base.clone().lerp(new THREE.Color(0xffffff), 0.25);

  const shadow = new THREE.MeshBasicMaterial({
    map: contactShadowTexture(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  shadow.userData.baseOpacity = 0.5;
  shadow.userData.skipTint = true;
  shadow.userData.teamTemplate = true;

  const template = {
    armor: standard(base, {
      roughness: 0.4,
      metalness: 0.32,
      emissive: deep,
      emissiveIntensity: 0.3,
    }),
    armorDeep: standard(deep, { roughness: 0.55, metalness: 0.35 }),
    cloth: standard(base.clone().lerp(new THREE.Color(0x111827), 0.62), {
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    trim: standard(light, {
      roughness: 0.32,
      metalness: 0.55,
      emissive: light,
      emissiveIntensity: 0.25,
    }),
    eye: standard(glowColor, {
      roughness: 0.3,
      emissive: glowColor,
      emissiveIntensity: 1.6,
    }),
    ring: keepColor(
      standard(base, {
        roughness: 0.35,
        metalness: 0.3,
        emissive: base,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.92,
      })
    ),
    shadow,
  };

  for (const [key, material] of Object.entries(template)) {
    material.name = key;
    material.userData.teamTemplate = true;
  }

  return template;
}

function getTeamMaterialTemplate(team) {
  let template = TEAM_MATERIAL_TEMPLATES.get(team);
  if (!template) {
    template = buildTeamMaterialTemplate(team);
    TEAM_MATERIAL_TEMPLATES.set(team, template);
  }
  return template;
}

export function safeDisposeMaterial(material) {
  if (
    !material
    || material.userData?.globalShared
    || material.userData?.teamTemplate
    || material.userData?.neutralTemplate
  ) {
    return;
  }
  material.dispose();
}

export function disposeUnitMaterials(materials) {
  for (const material of materials) {
    safeDisposeMaterial(material);
  }
}

export function createMaterialSet(team) {
  const template = getTeamMaterialTemplate(team);
  const mats = { ...GLOBAL_MATERIALS };

  for (const key of TEAM_MATERIAL_KEYS) {
    mats[key] = cloneTintableMaterial(template[key]);
  }
  mats.ember = cloneTintableMaterial(NEUTRAL_CLONE_TEMPLATES.ember);
  mats.arcane = cloneTintableMaterial(NEUTRAL_CLONE_TEMPLATES.arcane);

  return mats;
}

const SHADOW_MIN_RADIUS = 0.04;

function part(parent, geometry, material, { pos, rot, scale, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);

  // Trinkets are too small to read as shadows, so they stay out of the shadow pass.
  if (shadow) {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    mesh.castShadow = geometry.boundingSphere.radius >= SHADOW_MIN_RADIUS;
  }

  parent.add(mesh);
  return mesh;
}

function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function extrude(shape, depth, bevel = 0.006, curveSegments = 6) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function bladeGeometry(length, width, thickness) {
  return cached(`blade-${length}-${width}-${thickness}`, () => {
    const shape = new THREE.Shape();
    const halfW = width / 2;
    const shoulder = length * 0.78;
    shape.moveTo(-halfW, 0);
    shape.lineTo(halfW, 0);
    shape.lineTo(halfW, shoulder);
    shape.lineTo(0, length);
    shape.lineTo(-halfW, shoulder);
    shape.lineTo(-halfW, 0);
    return extrude(shape, thickness, thickness * 0.3);
  });
}

// A symmetric leaf profile, so a wing can be mirrored with a negative scale
// without the feathers ending up back to front.
function featherGeometry(length, width, thickness = 0.011) {
  return cached(`feather-${length}-${width}-${thickness}`, () => {
    const shape = new THREE.Shape();
    const halfW = width / 2;
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(length * 0.34, halfW, length * 0.84, halfW * 0.6);
    shape.quadraticCurveTo(length, halfW * 0.32, length, 0);
    shape.quadraticCurveTo(length, -halfW * 0.32, length * 0.84, -halfW * 0.6);
    shape.quadraticCurveTo(length * 0.34, -halfW, 0, 0);
    return extrude(shape, thickness, thickness * 0.35);
  });
}

// Lower-segment feathers for the eagle — keeps silhouette while cutting triangles.
function eagleFeatherGeometry(length, width, thickness = 0.012) {
  return cached(`eagle-feather-${length}-${width}-${thickness}`, () => {
    const shape = new THREE.Shape();
    const halfW = width / 2;
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(length * 0.34, halfW, length * 0.84, halfW * 0.6);
    shape.quadraticCurveTo(length, halfW * 0.32, length, 0);
    shape.quadraticCurveTo(length, -halfW * 0.32, length * 0.84, -halfW * 0.6);
    shape.quadraticCurveTo(length * 0.34, -halfW, 0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.25,
      bevelSize: thickness * 0.25,
      bevelSegments: 1,
      curveSegments: 4,
    });
    geometry.translate(0, 0, -thickness / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function shieldGeometry() {
  return cached('tower-shield', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, 0.2);
    shape.quadraticCurveTo(-0.18, 0.28, -0.08, 0.28);
    shape.lineTo(0.08, 0.28);
    shape.quadraticCurveTo(0.18, 0.28, 0.18, 0.2);
    shape.lineTo(0.18, -0.08);
    shape.quadraticCurveTo(0.18, -0.2, 0, -0.3);
    shape.quadraticCurveTo(-0.18, -0.2, -0.18, -0.08);
    shape.lineTo(-0.18, 0.2);
    return extrude(shape, 0.055, 0.01);
  });
}

function trapezoidPlateGeometry(topW, bottomW, h, depth) {
  return cached(`trap-plate-${topW.toFixed(3)}-${bottomW.toFixed(3)}-${h.toFixed(3)}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-topW / 2, h / 2);
    shape.lineTo(topW / 2, h / 2);
    shape.lineTo(bottomW / 2, -h / 2);
    shape.lineTo(-bottomW / 2, -h / 2);
    shape.lineTo(-topW / 2, h / 2);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

// Open cylinder band. theta=0 faces +Z, so the plate hugs the front of a limb
// instead of sitting as a floating card.
function wrapBandGeometry(radiusTop, radiusBottom, height, arc, segs = 8) {
  const key = `wrap-${radiusTop.toFixed(3)}-${radiusBottom.toFixed(3)}-${height.toFixed(3)}-${arc.toFixed(2)}-${segs}`;
  return cached(key, () =>
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segs, 1, true, -arc / 2, arc)
  );
}

function tabardPlateGeometry() {
  return cached('swordsman-tabard-shape', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.068, 0.11);
    shape.lineTo(0.068, 0.11);
    shape.lineTo(0.068, -0.02);
    shape.quadraticCurveTo(0.034, -0.1, 0, -0.065);
    shape.quadraticCurveTo(-0.034, -0.1, -0.068, -0.02);
    shape.lineTo(-0.068, 0.11);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.014,
      bevelEnabled: false,
      curveSegments: 3,
    });
    geometry.translate(0, 0, -0.007);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function scabbardGeometry() {
  return cached('swordsman-scabbard-shape', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.022, 0.15);
    shape.lineTo(0.022, 0.15);
    shape.lineTo(0.026, -0.14);
    shape.quadraticCurveTo(0, -0.155, -0.026, -0.14);
    shape.lineTo(-0.022, 0.15);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.065,
      bevelEnabled: false,
      curveSegments: 3,
    });
    geometry.translate(0, 0, -0.0325);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function addContactShadow(root, mats, radius) {
  const mesh = part(root, cached(`shadow-${radius}`, () => new THREE.PlaneGeometry(radius * 2, radius * 2)), mats.shadow, {
    pos: [0, 0.006, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
  mesh.renderOrder = 1;
  return mesh;
}

function addTeamRing(root, mats) {
  return part(root, cached('team-ring', () => new THREE.TorusGeometry(0.3, 0.016, 8, 36)), mats.ring, {
    pos: [0, 0.012, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
}

// Legs are hip/knee chains so they can walk and crouch; the animator relies on
// the returned thigh/shin lengths to keep the feet planted while joints bend.
function addLegs(parent, mats, { spread = 0.082, legLength = 0.15, bootMat = mats.leather, boots = true } = {}) {
  const hipY = 0.09 + legLength;
  const thigh = hipY * 0.44;
  const shin = hipY * 0.375;

  const legs = new THREE.Group();
  const thighGeo = cached(`thigh-${thigh.toFixed(3)}`, () => new THREE.CapsuleGeometry(0.047, thigh, 5, 10));
  const shinGeo = cached(`shin-${shin.toFixed(3)}`, () => new THREE.CapsuleGeometry(0.041, shin, 5, 10));
  const bootGeo = cached('boot', () => new THREE.BoxGeometry(0.11, 0.07, 0.16));

  const joints = {};
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * spread, hipY, 0);
    part(hip, thighGeo, mats.armorDeep, { pos: [0, -thigh / 2, 0] });

    const knee = new THREE.Group();
    knee.position.set(0, -thigh, 0);
    part(knee, shinGeo, mats.armorDeep, { pos: [0, -shin / 2, 0] });
    if (boots) {
      part(knee, bootGeo, bootMat, { pos: [0, -shin - 0.012, 0.015] });
    }
    hip.add(knee);

    legs.add(hip);
    joints[side < 0 ? 'left' : 'right'] = { hip, knee };
  }

  parent.add(legs);
  return { group: legs, left: joints.left, right: joints.right, thigh, shin };
}

function addArm(parent, mats, side, { shoulderY = 0.55, shoulderX = 0.163, sleeveMat = mats.armor } = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(side * shoulderX, shoulderY, 0);
  const armGeo = cached('arm', () => new THREE.CapsuleGeometry(0.038, 0.15, 5, 10));
  part(pivot, armGeo, sleeveMat, { pos: [0, -0.11, 0] });
  const hand = new THREE.Group();
  hand.position.set(0, -0.215, 0);
  part(hand, cached('hand', () => new THREE.SphereGeometry(0.045, 10, 8)), mats.leather);
  pivot.add(hand);
  parent.add(pivot);
  return { pivot, hand };
}

function addTorso(parent, mats, { width = 1, height = 0.26, y = 0.46, material = mats.armor, fittings = true } = {}) {
  const torso = new THREE.Group();
  torso.position.set(0, y, 0);
  const geo = cached(`torso-${height}`, () => new THREE.CylinderGeometry(0.15, 0.115, height, 14, 1));
  part(torso, geo, material, { scale: [width, 1, 0.76] });
  if (fittings) {
    part(torso, cached('belt', () => new THREE.CylinderGeometry(0.125, 0.125, 0.045, 14)), mats.leather, {
      pos: [0, -height / 2 + 0.01, 0],
      scale: [width, 1, 0.82],
    });
    part(torso, cached('buckle', () => new THREE.BoxGeometry(0.05, 0.045, 0.03)), mats.gold, {
      pos: [0, -height / 2 + 0.01, 0.095],
    });
  }
  parent.add(torso);
  return torso;
}

function addHead(parent, mats, { y = 0.72, radius = 0.112, skin = mats.skin } = {}) {
  const head = new THREE.Group();
  head.position.set(0, y, 0);
  part(head, cached('neck', () => new THREE.CylinderGeometry(0.048, 0.055, 0.06, 10)), mats.skin, {
    pos: [0, -0.09, 0],
  });
  part(head, cached(`head-${radius}`, () => new THREE.SphereGeometry(radius, 18, 14)), skin, {
    scale: [1, 1.06, 0.95],
  });
  parent.add(head);
  return head;
}

// A glowing dot on pale skin has almost no contrast at tile size, so each eye
// gets a dark socket behind it to sit against.
function addEyes(head, mats, { z = 0.098, y = 0.012, spread = 0.044, size = 0.02, socket = true } = {}) {
  const geo = cached(`eye-${size}`, () => new THREE.SphereGeometry(size, 8, 8));
  const socketGeo = cached(`eye-socket-${size}`, () => new THREE.SphereGeometry(size * 1.75, 10, 8));
  const eyes = [];
  for (const side of [-1, 1]) {
    if (socket) {
      part(head, socketGeo, mats.charcoal, {
        pos: [side * spread, y, z - size * 0.6],
        scale: [1, 0.78, 0.5],
        shadow: false,
      });
    }
    eyes.push(part(head, geo, mats.eye, { pos: [side * spread, y, z], shadow: false }));
  }
  return eyes;
}

// Layered plate spaulders. A single hemisphere reads as a cotton ball at tile
// size, so the cap is flattened and a second lame plus a rim edge give it the
// horizontal banding that makes it scan as armour.
function addPauldrons(
  parent,
  mats,
  { y = 0.575, x = 0.168, radius = 0.082, material = mats.armor, rimMaterial = mats.trim } = {}
) {
  const capGeo = cached(`pauldron-cap-${radius}`, () =>
    new THREE.SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const lameGeo = cached(`pauldron-lame-${radius}`, () =>
    new THREE.SphereGeometry(radius * 0.99, 12, 8, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.24)
  );
  const rimGeo = cached(`pauldron-rim-${radius}`, () =>
    new THREE.TorusGeometry(radius * 0.86, radius * 0.1, 5, 14)
  );

  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * x, y, 0);
    pad.rotation.z = side * -0.34;
    part(pad, capGeo, material, { scale: [1, 0.66, 1] });
    part(pad, lameGeo, material, { pos: [0, -radius * 0.1, 0], scale: [1.04, 0.8, 1.04] });
    part(pad, rimGeo, rimMaterial, {
      pos: [0, -radius * 0.32, 0],
      rot: [-Math.PI / 2, 0, 0],
      shadow: false,
    });
    parent.add(pad);
  }
}

function addGorget(parent, mats, y = 0.615) {
  part(parent, cached('gorget', () => new THREE.TorusGeometry(0.072, 0.022, 8, 18)), mats.trim, {
    pos: [0, y, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 0.85, 1],
  });
}

function addCape(parent, mats, { y = 0.46, length = 0.34 } = {}) {
  const cape = new THREE.Group();
  cape.position.set(0, y, -0.045);
  const geo = cached(`cape-${length}`, () =>
    new THREE.CylinderGeometry(0.15, 0.2, length, 14, 2, true, Math.PI * 0.7, Math.PI * 0.6)
  );
  part(cape, geo, mats.cloth, { pos: [0, -length / 2 + 0.06, 0] });
  parent.add(cape);
  return cape;
}

// The cowl drapes down the back rather than spiking above the crown: the old
// upward cone turned every hooded class into the same teardrop silhouette.
function addHood(parent, mats, { y = 0.7, radius = 0.134, open = 0.95, trimMaterial = null } = {}) {
  const hood = new THREE.Group();
  hood.position.set(0, y, 0);

  // Wraps everything but a wedge at the front; a closed shell just swallowed
  // the face and left a featureless blue egg.
  part(hood, cached(`hood-shell-${radius}-${open}`, () =>
    new THREE.SphereGeometry(radius, 14, 10, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * 0.66)
  ), mats.cloth, {
    pos: [0, 0.014, -0.02],
    scale: [1, 0.98, 1.12],
  });
  part(hood, cached('hood-drape', () => new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.46)), mats.cloth, {
    pos: [0, -0.012, -0.072],
    rot: [0.38, 0, 0],
    scale: [1.06, 1.7, 0.86],
  });
  part(hood, cached('hood-brow', () => new THREE.TorusGeometry(0.107, 0.026, 6, 14, Math.PI * 1.26)), trimMaterial ?? mats.cloth, {
    pos: [0, 0.004, 0.03],
    rot: [-0.3, 0, Math.PI * -0.13],
    scale: [1, 1, 0.8],
  });
  part(hood, cached('hood-collar', () => new THREE.TorusGeometry(0.102, 0.03, 6, 14)), mats.cloth, {
    pos: [0, -0.088, -0.014],
    rot: [-Math.PI / 2 + 0.16, 0, 0],
    scale: [1, 1.08, 1],
  });
  parent.add(hood);
  return hood;
}

function buildSword(mats, { length = 0.34 } = {}) {
  const sword = new THREE.Group();
  part(sword, cached('grip', () => new THREE.CylinderGeometry(0.017, 0.019, 0.1, 8)), mats.leather, {
    pos: [0, -0.05, 0],
  });
  part(sword, cached('pommel', () => new THREE.SphereGeometry(0.026, 10, 8)), mats.gold, {
    pos: [0, -0.108, 0],
  });
  part(sword, cached('crossguard', () => new THREE.BoxGeometry(0.17, 0.028, 0.038)), mats.gold, {
    pos: [0, 0.01, 0],
  });
  part(sword, cached('guard-gem', () => new THREE.SphereGeometry(0.02, 10, 8)), mats.eye, {
    pos: [0, 0.028, 0.026],
    shadow: false,
  });
  part(sword, bladeGeometry(length, 0.058, 0.02), mats.steel, { pos: [0, 0.026, 0] });
  part(sword, cached(`fuller-${length}`, () => new THREE.BoxGeometry(0.012, length * 0.7, 0.026)), mats.trim, {
    pos: [0, 0.026 + length * 0.4, 0],
  });
  return sword;
}

// Longsword — thin guard, wrapped grip, no stacked ricasso blocks.
function buildKnightSword(mats, { length = 0.36 } = {}) {
  const sword = new THREE.Group();
  part(sword, cached('knight-grip', () => new THREE.CylinderGeometry(0.015, 0.017, 0.092, 8)), mats.leather, {
    pos: [0, -0.05, 0],
  });
  const ringGeo = cached('knight-grip-ring', () => new THREE.TorusGeometry(0.018, 0.004, 5, 8));
  part(sword, ringGeo, mats.gold, {
    pos: [0, -0.018, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(sword, ringGeo, mats.gold, {
    pos: [0, -0.082, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(sword, cached('knight-pommel', () => new THREE.CylinderGeometry(0.026, 0.022, 0.02, 8)), mats.gold, {
    pos: [0, -0.108, 0],
  });
  part(sword, cached('knight-guard', () => new THREE.BoxGeometry(0.132, 0.016, 0.026)), mats.gold, {
    pos: [0, 0.01, 0],
  });
  const quillonGeo = cached('knight-quillon-tip', () => new THREE.BoxGeometry(0.034, 0.012, 0.02));
  for (const side of [-1, 1]) {
    part(sword, quillonGeo, mats.gold, {
      pos: [side * 0.078, 0.004, 0],
      rot: [0, 0, side * 0.42],
    });
  }
  part(sword, cached('knight-guard-gem', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6)), mats.eye, {
    pos: [0, 0.02, 0.016],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(sword, bladeGeometry(length, 0.046, 0.015), mats.steel, { pos: [0, 0.018, 0] });
  part(sword, cached(`knight-fuller-${length}`, () => new THREE.BoxGeometry(0.008, length * 0.62, 0.018)), mats.trim, {
    pos: [0, 0.018 + length * 0.36, 0],
    shadow: false,
  });
  return sword;
}

// Wrap bands sit on the capsules so thighs/shins read as armour, not stickers.
function addSwordsmanLegPlates(legs, mats) {
  const thighGeo = wrapBandGeometry(0.054, 0.05, 0.088, 2.05, 8);
  const shinGeo = wrapBandGeometry(0.048, 0.044, 0.1, 2.2, 8);
  const kneeGeo = cached('swordsman-knee-cop', () =>
    new THREE.SphereGeometry(0.034, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.58)
  );
  const sabatonGeo = trapezoidPlateGeometry(0.09, 0.068, 0.118, 0.032);

  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    part(hip, thighGeo, mats.armor, { pos: [0, -legs.thigh * 0.48, 0.006] });
    part(knee, kneeGeo, mats.armor, {
      pos: [0, 0.004, 0.03],
      scale: [1.15, 0.62, 1],
    });
    part(knee, shinGeo, mats.armorDeep, { pos: [0, -legs.shin * 0.52, 0.004] });
    part(knee, sabatonGeo, mats.armor, {
      pos: [0, -legs.shin - 0.016, 0.032],
      rot: [Math.PI / 2, 0, 0],
    });
  }
}

function addSwordsmanBracers(arm, mats) {
  part(arm.pivot, wrapBandGeometry(0.044, 0.04, 0.1, 2.15, 8), mats.armorDeep, {
    pos: [0, -0.152, 0.004],
  });
  part(arm.pivot, cached('swordsman-elbow', () =>
    new THREE.SphereGeometry(0.028, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  ), mats.armor, {
    pos: [0, -0.172, 0.024],
    scale: [1.1, 0.55, 0.95],
  });
  part(arm.hand, wrapBandGeometry(0.04, 0.038, 0.042, 2.3, 8), mats.armor, {
    pos: [0, -0.004, 0.004],
  });
}

// Sallet: one skull, a short tail, and a visor that wraps the face.
function addSwordsmanHelm(head, mats) {
  part(head, cached('swordsman-helm-skull', () =>
    new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)
  ), mats.armor, {
    pos: [0, 0.012, -0.004],
    scale: [1, 0.9, 1.08],
  });
  part(head, cached('swordsman-helm-tail', () =>
    new THREE.SphereGeometry(0.078, 8, 6, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.42)
  ), mats.armor, {
    pos: [0, -0.018, -0.07],
    rot: [0.55, 0, 0],
    scale: [1.05, 0.85, 1.15],
  });
  part(head, wrapBandGeometry(0.112, 0.11, 0.038, 2.35, 8), mats.charcoal, {
    pos: [0, 0.006, 0.002],
  });
  part(head, cached('swordsman-visor-slit', () => new THREE.BoxGeometry(0.072, 0.006, 0.01)), mats.eye, {
    pos: [0, 0.01, 0.112],
    shadow: false,
  });
  part(head, cached('swordsman-nasal', () => new THREE.BoxGeometry(0.014, 0.05, 0.012)), mats.armorDeep, {
    pos: [0, -0.02, 0.108],
  });
  part(head, cached('swordsman-helm-band', () => new THREE.TorusGeometry(0.1, 0.008, 5, 12)), mats.trim, {
    pos: [0, 0.042, -0.002],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 1.02, 1],
    shadow: false,
  });
  part(head, trapezoidPlateGeometry(0.01, 0.02, 0.07, 0.012), mats.trim, {
    pos: [0, 0.118, -0.008],
    rot: [0.2, 0, 0],
  });
}

function addSwordsmanPauldrons(parent, mats) {
  const capGeo = cached('swordsman-pauldron-cap', () =>
    new THREE.SphereGeometry(0.08, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.52)
  );
  const lameGeo = cached('swordsman-pauldron-lame', () =>
    new THREE.SphereGeometry(0.078, 10, 6, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.22)
  );

  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.168, 0.568, 0.008);
    pad.rotation.z = side * -0.32;
    part(pad, capGeo, mats.armor, { scale: [1.05, 0.52, 1.02] });
    part(pad, lameGeo, mats.armorDeep, {
      pos: [0, -0.012, 0],
      scale: [1.08, 0.7, 1.06],
    });
    part(pad, wrapBandGeometry(0.072, 0.07, 0.028, 2.0, 8), mats.trim, {
      pos: [0, -0.03, 0.004],
      shadow: false,
    });
    parent.add(pad);
  }
}

function addSwordsmanCape(parent, mats) {
  const cape = new THREE.Group();
  cape.position.set(0, 0.5, -0.04);
  part(cape, cached('swordsman-capelet', () =>
    new THREE.CylinderGeometry(0.138, 0.168, 0.11, 12, 1, true, Math.PI * 0.66, Math.PI * 0.68)
  ), mats.cloth, {
    pos: [0, 0.02, -0.01],
  });
  part(cape, cached('swordsman-cape', () =>
    new THREE.CylinderGeometry(0.15, 0.205, 0.34, 12, 2, true, Math.PI * 0.72, Math.PI * 0.56)
  ), mats.cloth, {
    pos: [0, -0.12, -0.012],
  });
  part(cape, cached('swordsman-cape-collar', () => new THREE.TorusGeometry(0.1, 0.016, 5, 12, Math.PI * 1.15)), mats.cloth, {
    pos: [0, 0.062, 0.012],
    rot: [-Math.PI / 2 + 0.2, 0, 0],
    scale: [1.05, 0.9, 1],
  });
  parent.add(cape);
  return cape;
}

// Breastplate wraps the torso; tabard hangs from the belt as one cloth.
function addSwordsmanCuirass(torso, mats) {
  part(torso, wrapBandGeometry(0.162, 0.148, 0.145, 2.05, 10), mats.armor, {
    pos: [0, 0.03, 0],
    scale: [1.04, 1, 0.82],
  });
  part(torso, cached('swordsman-keel', () => new THREE.BoxGeometry(0.018, 0.12, 0.02)), mats.trim, {
    pos: [0, 0.034, 0.128],
    shadow: false,
  });
  part(torso, wrapBandGeometry(0.15, 0.138, 0.036, 2.15, 8), mats.armorDeep, {
    pos: [0, -0.058, 0],
    scale: [1.02, 1, 0.84],
    rot: [0.12, 0, 0],
  });
  part(torso, cached('swordsman-belt', () => new THREE.CylinderGeometry(0.128, 0.128, 0.038, 12)), mats.leather, {
    pos: [0, -0.09, 0],
    scale: [1.04, 1, 0.8],
  });
  part(torso, cached('swordsman-buckle', () => new THREE.CylinderGeometry(0.02, 0.02, 0.014, 8)), mats.gold, {
    pos: [0, -0.09, 0.108],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(torso, tabardPlateGeometry(), mats.cloth, {
    pos: [0, -0.012, 0.118],
  });
  part(torso, cached('swordsman-tabard-cross-v', () => new THREE.BoxGeometry(0.018, 0.11, 0.006)), mats.trim, {
    pos: [0, 0.0, 0.128],
    shadow: false,
  });
  part(torso, cached('swordsman-tabard-cross-h', () => new THREE.BoxGeometry(0.07, 0.018, 0.006)), mats.trim, {
    pos: [0, 0.032, 0.128],
    shadow: false,
  });
}

function addSwordsmanScabbard(parent, mats) {
  const scabbard = new THREE.Group();
  scabbard.position.set(-0.118, 0.355, 0.042);
  scabbard.rotation.set(0.08, 0.28, 0.22);
  part(scabbard, scabbardGeometry(), mats.leather);
  part(scabbard, cached('swordsman-scabbard-chape', () => new THREE.BoxGeometry(0.042, 0.022, 0.06)), mats.steel, {
    pos: [0, -0.15, 0],
  });
  part(scabbard, cached('swordsman-scabbard-throat', () => new THREE.BoxGeometry(0.046, 0.024, 0.066)), mats.gold, {
    pos: [0, 0.138, 0],
  });
  parent.add(scabbard);
}

// The stave sits in the XY plane so the whole D-shape faces the viewer. Held
// edge-on, as it was, the bow vanished into a single vertical line.
function buildBow(mats) {
  const bow = new THREE.Group();
  part(bow, cached('bow-limb', () => new THREE.TorusGeometry(0.205, 0.014, 5, 12, Math.PI * 1.18)), mats.wood, {
    rot: [0, 0, Math.PI * 0.41],
  });
  part(bow, cached('bow-limb-inner', () => new THREE.TorusGeometry(0.198, 0.007, 5, 10, Math.PI * 1.12)), mats.charcoal, {
    rot: [0, 0, Math.PI * 0.41],
    shadow: false,
  });
  part(bow, cached('bow-grip', () => new THREE.CylinderGeometry(0.02, 0.022, 0.078, 6)), mats.leather, {
    pos: [-0.2, 0, 0],
  });
  const gripRing = cached('bow-grip-ring', () => new THREE.TorusGeometry(0.022, 0.004, 5, 8));
  part(bow, gripRing, mats.gold, {
    pos: [-0.2, 0.03, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(bow, gripRing, mats.gold, {
    pos: [-0.2, -0.03, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  const tipGeo = cached('bow-tip', () => new THREE.ConeGeometry(0.014, 0.038, 6));
  part(bow, tipGeo, mats.gold, { pos: [-0.062, 0.188, 0], rot: [0, 0, 0.35] });
  part(bow, tipGeo, mats.gold, { pos: [-0.062, -0.188, 0], rot: [0, 0, Math.PI - 0.35] });
  const string = part(bow, cached('bow-string', () => new THREE.CylinderGeometry(0.0035, 0.0035, 0.39, 4)), mats.trim, {
    pos: [0.042, 0, 0],
    shadow: false,
  });
  part(bow, cached('bow-arrow', () => new THREE.CylinderGeometry(0.0055, 0.0055, 0.32, 5)), mats.wood, {
    pos: [-0.055, 0.01, 0.012],
    rot: [0, 0, Math.PI / 2],
    shadow: false,
  });
  part(bow, cached('bow-arrow-head', () => new THREE.ConeGeometry(0.018, 0.052, 6)), mats.steel, {
    pos: [-0.232, 0.01, 0.012],
    rot: [0, 0, -Math.PI / 2],
    shadow: false,
  });
  part(bow, cached('bow-arrow-fletch', () => new THREE.ConeGeometry(0.018, 0.044, 4)), mats.trim, {
    pos: [0.1, 0.01, 0.012],
    rot: [0, 0, Math.PI / 2],
    shadow: false,
  });
  return { group: bow, string };
}

function buildQuiver(mats) {
  const quiver = new THREE.Group();
  part(quiver, cached('quiver-body', () => new THREE.CylinderGeometry(0.046, 0.034, 0.26, 8)), mats.leather);
  part(quiver, cached('quiver-mouth', () => new THREE.TorusGeometry(0.048, 0.008, 5, 10)), mats.gold, {
    pos: [0, 0.128, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  part(quiver, cached('quiver-band', () => new THREE.TorusGeometry(0.042, 0.006, 5, 10)), mats.gold, {
    pos: [0, 0.02, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(quiver, cached('quiver-base', () => new THREE.CylinderGeometry(0.036, 0.03, 0.02, 8)), mats.charcoal, {
    pos: [0, -0.134, 0],
  });
  part(quiver, trapezoidPlateGeometry(0.05, 0.036, 0.07, 0.012), mats.leather, {
    pos: [0.04, 0.1, 0],
    rot: [0, 0, -0.35],
  });
  const shaft = cached('arrow-shaft', () => new THREE.CylinderGeometry(0.005, 0.005, 0.19, 5));
  const fletch = cached('arrow-fletch', () => new THREE.ConeGeometry(0.016, 0.042, 4));
  const spots = [
    [0, 0.214, 0],
    [0.02, 0.2, 0.016],
    [-0.016, 0.196, -0.012],
  ];
  spots.forEach(([x, y, z], i) => {
    part(quiver, shaft, mats.wood, { pos: [x, y, z], rot: [0, 0, i * 0.04 - 0.04] });
    part(quiver, fletch, mats.trim, { pos: [x, y + 0.104, z], shadow: false });
  });
  return quiver;
}

function addArcherHood(parent, mats) {
  const hood = new THREE.Group();
  hood.position.set(0, 0.73, 0);
  part(hood, cached('archer-hood-shell', () =>
    new THREE.SphereGeometry(0.132, 12, 8, Math.PI / 2 + 0.88, Math.PI * 2 - 1.76, 0, Math.PI * 0.66)
  ), mats.cloth, {
    pos: [0, 0.012, -0.016],
    scale: [1.02, 0.98, 1.12],
  });
  part(hood, cached('archer-hood-drape', () =>
    new THREE.SphereGeometry(0.114, 10, 7, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.44)
  ), mats.cloth, {
    pos: [0, -0.018, -0.072],
    rot: [0.4, 0, 0],
    scale: [1.04, 1.65, 0.84],
  });
  part(hood, wrapBandGeometry(0.112, 0.11, 0.03, 2.05, 8), mats.leather, {
    pos: [0, 0.014, 0.008],
  });
  part(hood, cached('archer-hood-clasp', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6)), mats.gold, {
    pos: [0.042, -0.02, 0.1],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(hood, cached('archer-hood-collar', () => new THREE.TorusGeometry(0.1, 0.022, 5, 12)), mats.cloth, {
    pos: [0, -0.086, -0.008],
    rot: [-Math.PI / 2 + 0.14, 0, 0],
    scale: [1.02, 1.06, 1],
  });
  part(hood, featherGeometry(0.11, 0.03, 0.008), mats.trim, {
    pos: [0.04, 0.078, -0.05],
    rot: [-0.35, 0.85, 0.55],
  });
  parent.add(hood);
  return hood;
}

function addArcherCloak(parent, mats) {
  const cloak = new THREE.Group();
  cloak.position.set(0, 0.5, -0.04);
  part(cloak, cached('archer-cloak', () =>
    new THREE.CylinderGeometry(0.145, 0.2, 0.3, 12, 2, true, Math.PI * 0.7, Math.PI * 0.6)
  ), mats.cloth, {
    pos: [0, -0.08, -0.01],
  });
  part(cloak, cached('archer-cloak-collar', () => new THREE.TorusGeometry(0.098, 0.016, 5, 12, Math.PI * 1.1)), mats.leather, {
    pos: [0, 0.058, 0.01],
    rot: [-Math.PI / 2 + 0.18, 0, 0],
    scale: [1.04, 0.88, 1],
  });
  parent.add(cloak);
}

function addArcherKit(torso, mats) {
  part(torso, wrapBandGeometry(0.152, 0.136, 0.168, 2.25, 10), mats.cloth, {
    pos: [0, 0.01, 0],
    scale: [0.98, 1, 0.8],
  });
  part(torso, wrapBandGeometry(0.154, 0.142, 0.108, 1.9, 8), mats.leather, {
    pos: [0, 0.032, 0],
    scale: [0.96, 1, 0.82],
  });
  part(torso, wrapBandGeometry(0.15, 0.14, 0.034, 2.0, 8), mats.armorDeep, {
    pos: [0, 0.05, 0],
    scale: [0.94, 1, 0.82],
  });
  part(torso, trapezoidPlateGeometry(0.036, 0.07, 0.055, 0.012), mats.trim, {
    pos: [0, 0.038, 0.122],
  });
  part(torso, cached('archer-sash', () => new THREE.CylinderGeometry(0.013, 0.013, 0.26, 6)), mats.leather, {
    pos: [0.02, 0.016, 0.102],
    rot: [0, 0, 0.52],
  });
  part(torso, cached('archer-sash-buckle', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6)), mats.gold, {
    pos: [0.07, 0.07, 0.1],
    rot: [Math.PI / 2, 0, 0.4],
    shadow: false,
  });
  part(torso, cached('archer-belt', () => new THREE.CylinderGeometry(0.122, 0.122, 0.034, 12)), mats.leather, {
    pos: [0, -0.09, 0],
    scale: [0.98, 1, 0.82],
  });
  part(torso, cached('archer-buckle', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 6)), mats.gold, {
    pos: [0, -0.09, 0.104],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(torso, cached('archer-pouch', () => new THREE.CylinderGeometry(0.026, 0.022, 0.052, 8)), mats.leather, {
    pos: [0.108, -0.114, 0.04],
    rot: [0.15, 0.35, 0.12],
  });
  part(torso, cached('archer-pouch-flap', () => new THREE.CylinderGeometry(0.024, 0.02, 0.016, 8)), mats.charcoal, {
    pos: [0.108, -0.086, 0.04],
    rot: [0.15, 0.35, 0.12],
    shadow: false,
  });
}

function addArcherLegKit(legs, mats) {
  const thighGeo = wrapBandGeometry(0.052, 0.048, 0.078, 2.0, 8);
  const kneeGeo = cached('archer-knee', () =>
    new THREE.SphereGeometry(0.03, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const bootShaft = wrapBandGeometry(0.048, 0.044, 0.09, 2.35, 8);
  const bootCuff = wrapBandGeometry(0.05, 0.048, 0.022, 2.2, 8);
  const bootFoot = trapezoidPlateGeometry(0.082, 0.06, 0.108, 0.028);

  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    part(hip, thighGeo, mats.leather, { pos: [0, -legs.thigh * 0.46, 0.004] });
    part(knee, kneeGeo, mats.leather, {
      pos: [0, 0.002, 0.028],
      scale: [1.12, 0.58, 1],
    });
    part(knee, bootShaft, mats.leather, { pos: [0, -legs.shin * 0.56, 0.002] });
    part(knee, bootCuff, mats.armorDeep, { pos: [0, -legs.shin * 0.28, 0.004] });
    part(knee, bootFoot, mats.charcoal, {
      pos: [0, -legs.shin - 0.014, 0.028],
      rot: [Math.PI / 2, 0, 0],
    });
  }
}

function addArcherShoulders(parent, mats) {
  const capGeo = cached('archer-shoulder', () =>
    new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.52)
  );
  const lameGeo = cached('archer-shoulder-lame', () =>
    new THREE.SphereGeometry(0.066, 8, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.22)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.156, 0.578, 0.008);
    pad.rotation.z = side * -0.3;
    part(pad, capGeo, mats.leather, { scale: [1.1, 0.5, 1.04] });
    part(pad, lameGeo, mats.armorDeep, {
      pos: [0, -0.01, 0],
      scale: [1.12, 0.68, 1.06],
    });
    parent.add(pad);
  }
}

function addArcherBracers(armL, armR, mats) {
  part(armL.pivot, wrapBandGeometry(0.044, 0.04, 0.1, 2.25, 8), mats.leather, {
    pos: [0, -0.152, 0.004],
  });
  part(armL.pivot, wrapBandGeometry(0.046, 0.044, 0.02, 2.1, 8), mats.gold, {
    pos: [0, -0.118, 0.005],
    shadow: false,
  });
  part(armR.pivot, wrapBandGeometry(0.042, 0.038, 0.07, 2.1, 8), mats.leather, {
    pos: [0, -0.148, 0.004],
  });
  part(armR.hand, wrapBandGeometry(0.04, 0.038, 0.04, 2.25, 8), mats.leather, {
    pos: [0, -0.002, 0.004],
  });
}

function buildStaff(mats) {
  const staff = new THREE.Group();
  part(staff, cached('staff-shaft', () => new THREE.CylinderGeometry(0.012, 0.016, 0.64, 6)), mats.charcoal, {
    pos: [0, 0.08, 0],
  });
  const wrapGeo = cached('staff-wrap', () => new THREE.CylinderGeometry(0.017, 0.017, 0.048, 6));
  part(staff, wrapGeo, mats.leather, { pos: [0, 0.012, 0] });
  part(staff, wrapGeo, mats.leather, { pos: [0, 0.18, 0] });
  const ringGeo = cached('staff-ring', () => new THREE.TorusGeometry(0.018, 0.004, 5, 8));
  part(staff, ringGeo, mats.gold, {
    pos: [0, -0.04, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(staff, ringGeo, mats.gold, {
    pos: [0, 0.28, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(staff, cached('staff-collar', () => new THREE.CylinderGeometry(0.022, 0.018, 0.02, 6)), mats.gold, {
    pos: [0, 0.355, 0],
  });
  part(staff, cached('staff-cup', () => new THREE.CylinderGeometry(0.024, 0.016, 0.016, 6)), mats.gold, {
    pos: [0, 0.392, 0],
  });
  const prongGeo = cached('staff-prong', () => new THREE.BoxGeometry(0.007, 0.068, 0.007));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    part(staff, prongGeo, mats.gold, {
      pos: [Math.cos(a) * 0.026, 0.428, Math.sin(a) * 0.026],
    });
  }
  const orb = part(staff, cached('staff-orb', () => new THREE.OctahedronGeometry(0.046, 0)), mats.arcane, {
    pos: [0, 0.44, 0],
    shadow: false,
  });
  part(orb, cached('staff-orb-core', () => new THREE.OctahedronGeometry(0.016, 0)), mats.ember, {
    shadow: false,
  });
  const runeRing = part(staff, cached('rune-ring', () => new THREE.TorusGeometry(0.078, 0.006, 5, 12)), mats.arcane, {
    pos: [0, 0.44, 0],
    rot: [Math.PI / 2.2, 0, 0],
    shadow: false,
  });
  part(staff, cached('staff-charm-cord', () => new THREE.CylinderGeometry(0.003, 0.003, 0.046, 4)), mats.leather, {
    pos: [0.028, 0.328, 0],
    rot: [0, 0, 0.35],
    shadow: false,
  });
  part(staff, cached('staff-charm', () => new THREE.OctahedronGeometry(0.012, 0)), mats.gold, {
    pos: [0.042, 0.304, 0],
    shadow: false,
  });
  part(staff, cached('staff-ferrule', () => new THREE.CylinderGeometry(0.015, 0.01, 0.028, 6)), mats.gold, {
    pos: [0, -0.24, 0],
  });
  part(staff, cached('staff-spike', () => new THREE.ConeGeometry(0.01, 0.028, 6)), mats.steel, {
    pos: [0, -0.266, 0],
    rot: [Math.PI, 0, 0],
  });
  return { group: staff, orb, runeRing };
}

function buildDagger(mats) {
  const dagger = new THREE.Group();
  part(dagger, cached('dagger-grip', () => new THREE.CylinderGeometry(0.013, 0.015, 0.07, 7)), mats.charcoal, {
    pos: [0, -0.035, 0],
  });
  part(dagger, cached('dagger-guard', () => new THREE.BoxGeometry(0.075, 0.018, 0.026)), mats.gold, {
    pos: [0, 0.004, 0],
  });
  part(dagger, bladeGeometry(0.17, 0.042, 0.014), mats.steel, { pos: [0, 0.014, 0] });
  return dagger;
}

function buildBomb(mats) {
  const bomb = new THREE.Group();
  part(bomb, cached('bomb-shell', () => new THREE.SphereGeometry(0.098, 16, 14)), mats.charcoal);
  part(bomb, cached('bomb-band', () => new THREE.TorusGeometry(0.086, 0.012, 8, 20)), mats.gold, {
    pos: [0, 0.03, 0],
    rot: [-Math.PI / 2 + 0.2, 0, 0],
  });
  part(bomb, cached('bomb-cap', () => new THREE.CylinderGeometry(0.032, 0.038, 0.04, 10)), mats.steel, {
    pos: [0, 0.098, 0],
  });
  const fuseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.11, 0),
    new THREE.Vector3(0.028, 0.16, 0.016),
    new THREE.Vector3(-0.014, 0.2, -0.014),
    new THREE.Vector3(0.02, 0.235, 0.012),
  ]);
  part(bomb, cached('bomb-fuse', () => new THREE.TubeGeometry(fuseCurve, 20, 0.008, 6, false)), mats.leather);
  const spark = part(bomb, cached('bomb-spark', () => new THREE.SphereGeometry(0.024, 10, 8)), mats.ember, {
    pos: [0.02, 0.24, 0.012],
    shadow: false,
  });
  return { group: bomb, spark };
}

export function buildItemBombModel() {
  const mats = createMaterialSet('red');
  const { group } = buildBomb(mats);
  const root = new THREE.Group();
  root.add(group);
  group.position.set(0, 0.08, 0);
  group.rotation.set(-0.2, 0.35, 0);
  return root;
}

function buildLandmineCore(mats) {
  const mine = new THREE.Group();

  part(mine, cached('mine-base', () => new THREE.CylinderGeometry(0.14, 0.15, 0.035, 20)), mats.steel, {
    pos: [0, 0.018, 0],
    shadow: true,
  });
  part(mine, cached('mine-rim', () => new THREE.TorusGeometry(0.145, 0.012, 6, 24)), mats.charcoal, {
    pos: [0, 0.035, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  part(mine, cached('mine-dome', () => new THREE.SphereGeometry(0.058, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), mats.armor, {
    pos: [0, 0.048, 0],
    shadow: true,
  });

  const stripeGeo = cached('mine-stripe', () => new THREE.BoxGeometry(0.11, 0.008, 0.018));
  for (const rot of [0, Math.PI / 2]) {
    part(mine, stripeGeo, mats.gold, {
      pos: [0, 0.036, 0],
      rot: [0, rot, 0],
    });
  }

  const led = part(mine, cached('mine-led', () => new THREE.SphereGeometry(0.018, 10, 8)), mats.ember, {
    pos: [0, 0.072, 0],
    shadow: false,
  });
  led.material.emissive = mats.ember.color;
  led.material.emissiveIntensity = 1.2;

  const prongGeo = cached('mine-prong', () => new THREE.CylinderGeometry(0.006, 0.008, 0.028, 6));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    part(mine, prongGeo, mats.steel, {
      pos: [Math.cos(a) * 0.1, 0.052, Math.sin(a) * 0.1],
      rot: [0.35 * Math.cos(a), 0, -0.35 * Math.sin(a)],
    });
  }

  return { group: mine, led };
}

export function buildItemLandmineModel() {
  const mats = createMaterialSet('red');
  const { group } = buildLandmineCore(mats);
  const root = new THREE.Group();
  root.add(group);
  group.position.set(0, 0.04, 0);
  group.rotation.set(0, 0.35, 0);
  return root;
}

/**
 * Board marker for a placed landmine. Mostly buried so only the player spots it;
 * `activate` plays the spring-and-burst when a unit steps on it.
 */
export function buildLandmineBoardMarker() {
  const mine = new THREE.Group();

  const iron = new THREE.MeshStandardMaterial({ color: 0x2a3344, roughness: 0.82, metalness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b7a8f, roughness: 0.38, metalness: 0.78 });
  const warning = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.5,
    metalness: 0.2,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    emissive: 0xff2222,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.1,
  });

  const pit = new THREE.Group();
  pit.position.y = -0.02;
  mine.add(pit);

  part(pit, cached('lm-plate', () => new THREE.CylinderGeometry(0.2, 0.21, 0.028, 18)), iron, {
    pos: [0, 0.014, 0],
    shadow: true,
  });
  part(pit, cached('lm-cap', () => new THREE.SphereGeometry(0.042, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)), steel, {
    pos: [0, 0.028, 0],
  });
  const led = part(pit, cached('lm-led', () => new THREE.SphereGeometry(0.012, 8, 6)), ledMat, {
    pos: [0, 0.046, 0],
    shadow: false,
  });
  part(pit, cached('lm-ring', () => new THREE.TorusGeometry(0.055, 0.006, 6, 16)), warning, {
    pos: [0, 0.03, 0],
    rot: [Math.PI / 2, 0, 0],
  });

  const burst = new THREE.Group();
  burst.visible = false;
  mine.add(burst);
  const burstCore = part(burst, cached('lm-burst', () => new THREE.SphereGeometry(0.08, 10, 8)), ledMat, {
    shadow: false,
  });
  burstCore.material.transparent = true;
  burstCore.material.opacity = 0;

  const activate = (p) => {
    const thrust = p < 0.18 ? p / 0.18 : p < 0.42 ? 1 - (p - 0.18) / 0.24 : 0;
    const burstP = p < 0.2 ? 0 : Math.min(1, (p - 0.2) / 0.35);
    const fade = p > 0.55 ? Math.min(1, (p - 0.55) / 0.35) : 0;

    pit.position.y = -0.02 + thrust * 0.06;
    pit.scale.setScalar(1 + thrust * 0.08);
    ledMat.emissiveIntensity = 0.6 + thrust * 2.2;

    burst.visible = burstP > 0;
    burst.scale.setScalar(0.4 + burstP * 2.4);
    burstCore.material.opacity = (1 - fade) * (1 - burstP * 0.35);
    burst.position.y = 0.04 + burstP * 0.12;

    pit.visible = fade < 0.85;
    if (fade >= 0.85) pit.scale.setScalar(Math.max(0.01, 1 - fade));
  };

  return { root: mine, led, activate, activateMs: 720 };
}

function buildSwordsman(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.084, boots: false });
  addSwordsmanLegPlates(legs, mats);
  const torso = addTorso(group, mats, { width: 1.04, height: 0.265, y: 0.458, fittings: false });
  addSwordsmanCuirass(torso, mats);
  addSwordsmanPauldrons(group, mats);
  addGorget(group, mats, 0.608);
  addSwordsmanCape(group, mats);
  addSwordsmanScabbard(group, mats);
  const armL = addArm(group, mats, -1, { shoulderX: 0.168 });
  const armR = addArm(group, mats, 1, { shoulderX: 0.168 });
  addSwordsmanBracers(armL, mats);
  addSwordsmanBracers(armR, mats);
  const head = addHead(group, mats, { y: 0.712, radius: 0.092 });
  addSwordsmanHelm(head, mats);

  const sword = buildKnightSword(mats);
  sword.position.set(0.01, 0.022, 0.04);
  // Flip the authored x/z tilt so the tip sits up and forward of the fist.
  sword.rotation.set(0.55, 0, -0.5);
  armR.hand.add(sword);
  armR.pivot.rotation.set(-0.36, 0, 0.28);
  armL.pivot.rotation.set(0.1, 0, -0.12);

  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, weapon: sword };
}

function buildArcher(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.078, legLength: 0.17, boots: false });
  addArcherLegKit(legs, mats);
  const torso = addTorso(group, mats, { width: 0.98, height: 0.255, y: 0.468, fittings: false });
  addArcherKit(torso, mats);
  addArcherShoulders(group, mats);
  addArcherCloak(group, mats);
  const armL = addArm(group, mats, -1, { shoulderX: 0.16, sleeveMat: mats.cloth });
  const armR = addArm(group, mats, 1, { shoulderX: 0.16, sleeveMat: mats.cloth });
  addArcherBracers(armL, armR, mats);
  const head = addHead(group, mats, { y: 0.718, radius: 0.102 });
  const eyes = addEyes(head, mats, { y: 0.008, z: 0.096, size: 0.017 });
  part(head, wrapBandGeometry(0.1, 0.096, 0.034, 2.15, 8), mats.charcoal, {
    pos: [0, -0.03, 0.008],
  });
  const hood = addArcherHood(group, mats);

  const quiver = buildQuiver(mats);
  quiver.position.set(-0.112, 0.442, -0.1);
  quiver.rotation.set(0.14, 0.1, 0.38);
  group.add(quiver);

  const knife = buildDagger(mats);
  knife.scale.setScalar(0.78);
  knife.position.set(-0.11, -0.02, 0.06);
  knife.rotation.set(0.15, 0.4, 0.55);
  torso.add(knife);

  const bow = buildBow(mats);
  bow.group.position.set(-0.018, -0.016, 0.078);
  // +π X shows the stave to the camera while keeping the string toward the body.
  bow.group.rotation.set(0.18 + Math.PI, -0.32, 0.08);
  armL.hand.add(bow.group);
  armL.pivot.rotation.set(-1.18, 0, -0.28);
  armR.pivot.rotation.set(-0.82, 0, 0.48);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    hood,
    weapon: bow.group,
    bowString: bow.string,
  };
}

function addShieldHelm(head, mats) {
  part(head, cached('great-helm', () => new THREE.CylinderGeometry(0.118, 0.13, 0.2, 8)), mats.steel, {
    pos: [0, 0.02, 0],
    scale: [1, 1, 0.94],
  });
  part(head, cached('great-helm-crown', () => new THREE.CylinderGeometry(0.118, 0.118, 0.04, 8)), mats.steel, {
    pos: [0, 0.13, 0],
    scale: [1, 1, 0.94],
  });
  part(head, wrapBandGeometry(0.124, 0.12, 0.07, 2.2, 8), mats.charcoal, {
    pos: [0, 0.0, 0.006],
  });
  part(head, cached('great-helm-visor', () => new THREE.BoxGeometry(0.1, 0.016, 0.012)), mats.eye, {
    pos: [0, 0.018, 0.118],
    shadow: false,
  });
  part(head, cached('great-helm-nasal', () => new THREE.BoxGeometry(0.018, 0.08, 0.012)), mats.charcoal, {
    pos: [0, -0.028, 0.116],
  });
  part(head, cached('great-helm-band', () => new THREE.TorusGeometry(0.122, 0.012, 5, 10)), mats.gold, {
    pos: [0, 0.08, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 0.92, 1],
    shadow: false,
  });
  const hornGeo = cached('great-helm-horn', () => new THREE.ConeGeometry(0.026, 0.1, 6));
  const hornRing = cached('great-helm-horn-ring', () => new THREE.TorusGeometry(0.02, 0.005, 5, 8));
  for (const side of [-1, 1]) {
    part(head, hornGeo, mats.gold, {
      pos: [side * 0.118, 0.15, -0.01],
      rot: [0.15, 0, side * 0.85],
    });
    part(head, hornRing, mats.steel, {
      pos: [side * 0.108, 0.118, -0.008],
      rot: [0.15, 0, side * 0.85],
      shadow: false,
    });
  }
  part(head, wrapBandGeometry(0.12, 0.116, 0.028, 2.0, 8), mats.steel, {
    pos: [0, -0.055, 0.01],
  });
}

function addShieldKit(torso, mats) {
  part(torso, wrapBandGeometry(0.172, 0.154, 0.18, 2.2, 10), mats.armor, {
    pos: [0, 0.02, 0],
    scale: [1.06, 1, 0.82],
  });
  part(torso, wrapBandGeometry(0.168, 0.156, 0.09, 1.9, 8), mats.steel, {
    pos: [0, 0.04, 0],
    scale: [1.04, 1, 0.84],
  });
  part(torso, cached('shield-keel', () => new THREE.BoxGeometry(0.022, 0.12, 0.02)), mats.trim, {
    pos: [0, 0.036, 0.14],
    shadow: false,
  });
  part(torso, cached('shield-belt', () => new THREE.CylinderGeometry(0.138, 0.138, 0.042, 12)), mats.leather, {
    pos: [0, -0.1, 0],
    scale: [1.06, 1, 0.82],
  });
  part(torso, cached('shield-buckle', () => new THREE.CylinderGeometry(0.02, 0.02, 0.014, 6)), mats.gold, {
    pos: [0, -0.1, 0.118],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(torso, wrapBandGeometry(0.16, 0.148, 0.036, 2.1, 8), mats.armorDeep, {
    pos: [0, -0.055, 0],
    scale: [1.04, 1, 0.84],
    rot: [0.1, 0, 0],
  });
  part(torso, tabardPlateGeometry(), mats.cloth, {
    pos: [0, -0.02, 0.128],
  });
  part(torso, cached('shield-tabard-cross-v', () => new THREE.BoxGeometry(0.016, 0.1, 0.006)), mats.trim, {
    pos: [0, -0.01, 0.138],
    shadow: false,
  });
  part(torso, cached('shield-tabard-cross-h', () => new THREE.BoxGeometry(0.06, 0.016, 0.006)), mats.trim, {
    pos: [0, 0.02, 0.138],
    shadow: false,
  });
  part(torso, cached('shield-clasp', () => new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6)), mats.gold, {
    pos: [0, 0.1, 0.12],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
}

function addShieldLegKit(legs, mats) {
  const thighGeo = wrapBandGeometry(0.058, 0.052, 0.088, 2.1, 8);
  const kneeGeo = cached('shield-knee', () =>
    new THREE.SphereGeometry(0.034, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const greaveGeo = wrapBandGeometry(0.052, 0.046, 0.11, 2.3, 8);
  const bootFoot = trapezoidPlateGeometry(0.1, 0.074, 0.128, 0.034);

  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    part(hip, thighGeo, mats.armor, { pos: [0, -legs.thigh * 0.46, 0.006] });
    part(knee, kneeGeo, mats.steel, {
      pos: [0, 0.002, 0.03],
      scale: [1.16, 0.6, 1],
    });
    part(knee, greaveGeo, mats.armorDeep, { pos: [0, -legs.shin * 0.52, 0.004] });
    part(knee, bootFoot, mats.armor, {
      pos: [0, -legs.shin - 0.014, 0.032],
      rot: [Math.PI / 2, 0, 0],
    });
    part(knee, wrapBandGeometry(0.05, 0.048, 0.02, 2.2, 8), mats.gold, {
      pos: [0, -legs.shin * 0.28, 0.004],
      shadow: false,
    });
  }
}

function addShieldPauldrons(parent, mats) {
  const capGeo = cached('shield-pauldron-cap', () =>
    new THREE.SphereGeometry(0.094, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const lameGeo = cached('shield-pauldron-lame', () =>
    new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.24)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.188, 0.56, 0.01);
    pad.rotation.z = side * -0.26;
    part(pad, capGeo, mats.armor, { scale: [1.18, 0.58, 1.08] });
    part(pad, lameGeo, mats.steel, {
      pos: [0, -0.014, 0],
      scale: [1.2, 0.72, 1.1],
    });
    part(pad, wrapBandGeometry(0.078, 0.074, 0.02, 2.0, 8), mats.gold, {
      pos: [0, -0.028, 0.004],
      shadow: false,
    });
    parent.add(pad);
  }
}

function buildTowerShield(mats) {
  const shield = new THREE.Group();
  part(shield, shieldGeometry(), mats.armor);
  part(shield, cached('shield-boss', () => new THREE.SphereGeometry(0.058, 8, 6)), mats.gold, {
    pos: [0, 0.02, 0.038],
    scale: [1, 1, 0.55],
  });
  part(shield, cached('shield-cross-v', () => new THREE.BoxGeometry(0.04, 0.5, 0.014)), mats.trim, {
    pos: [0, -0.01, 0.034],
  });
  part(shield, cached('shield-cross-h', () => new THREE.BoxGeometry(0.32, 0.04, 0.014)), mats.trim, {
    pos: [0, 0.07, 0.034],
  });
  part(shield, cached('shield-rim-top', () => new THREE.BoxGeometry(0.2, 0.022, 0.02)), mats.steel, {
    pos: [0, 0.26, 0.02],
  });
  part(shield, cached('shield-boss-ring', () => new THREE.TorusGeometry(0.042, 0.007, 5, 10)), mats.steel, {
    pos: [0, 0.02, 0.04],
    shadow: false,
  });
  const rivetGeo = cached('shield-rivet', () => new THREE.CylinderGeometry(0.01, 0.01, 0.012, 6));
  for (const [x, y] of [[-0.12, 0.16], [0.12, 0.16], [-0.12, -0.08], [0.12, -0.08]]) {
    part(shield, rivetGeo, mats.gold, {
      pos: [x, y, 0.03],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
  }
  return shield;
}

function buildFlangedMace(mats) {
  const mace = new THREE.Group();
  part(mace, cached('mace-shaft', () => new THREE.CylinderGeometry(0.016, 0.02, 0.26, 8)), mats.wood, {
    pos: [0, -0.02, 0],
  });
  const maceRing = cached('mace-grip-ring', () => new THREE.TorusGeometry(0.02, 0.004, 5, 8));
  part(mace, maceRing, mats.gold, {
    pos: [0, -0.05, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(mace, maceRing, mats.gold, {
    pos: [0, -0.11, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(mace, cached('mace-pommel', () => new THREE.CylinderGeometry(0.026, 0.022, 0.02, 8)), mats.gold, {
    pos: [0, -0.155, 0],
  });
  part(mace, cached('mace-collar', () => new THREE.CylinderGeometry(0.03, 0.026, 0.028, 8)), mats.gold, {
    pos: [0, 0.098, 0],
  });
  part(mace, cached('mace-core', () => new THREE.CylinderGeometry(0.042, 0.042, 0.1, 8)), mats.steel, {
    pos: [0, 0.16, 0],
  });
  const flangeGeo = cached('mace-flange', () => new THREE.BoxGeometry(0.024, 0.1, 0.058));
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    part(mace, flangeGeo, mats.steel, {
      pos: [Math.sin(angle) * 0.052, 0.16, Math.cos(angle) * 0.052],
      rot: [0, angle, 0],
    });
  }
  part(mace, cached('mace-cap', () => new THREE.ConeGeometry(0.032, 0.05, 6)), mats.gold, {
    pos: [0, 0.232, 0],
  });
  return mace;
}

function buildShield(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.1, legLength: 0.13, boots: false });
  addShieldLegKit(legs, mats);
  const torso = addTorso(group, mats, { width: 1.2, height: 0.28, y: 0.438, fittings: false });
  addShieldKit(torso, mats);
  addShieldPauldrons(group, mats);
  addGorget(group, mats, 0.6);
  addCape(group, mats, { y: 0.44, length: 0.32 });
  const armL = addArm(group, mats, -1, { shoulderX: 0.195, shoulderY: 0.538, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.195, shoulderY: 0.538, sleeveMat: mats.armorDeep });
  part(armL.pivot, wrapBandGeometry(0.048, 0.042, 0.1, 2.2, 8), mats.steel, {
    pos: [0, -0.15, 0.004],
  });
  part(armR.pivot, wrapBandGeometry(0.048, 0.042, 0.1, 2.2, 8), mats.armorDeep, {
    pos: [0, -0.15, 0.004],
  });
  part(armL.hand, wrapBandGeometry(0.042, 0.04, 0.038, 2.2, 8), mats.steel, {
    pos: [0, -0.002, 0.004],
  });
  part(armR.hand, wrapBandGeometry(0.042, 0.04, 0.038, 2.2, 8), mats.steel, {
    pos: [0, -0.002, 0.004],
  });
  const head = addHead(group, mats, { y: 0.698, radius: 0.096 });
  const eyes = addEyes(head, mats, { z: 0.1, y: 0.01, size: 0.012 });
  addShieldHelm(head, mats);

  const shield = buildTowerShield(mats);
  shield.position.set(-0.02, -0.04, 0.1);
  shield.rotation.set(0.08, -0.12, 0.04);
  armL.hand.add(shield);
  armL.pivot.rotation.set(-0.42, 0.08, -0.28);

  const mace = buildFlangedMace(mats);
  mace.position.set(0, 0.03, 0.035);
  // Flip the authored x/z tilt so the head sits up and forward of the fist.
  mace.rotation.set(0.55, 0, -0.5);
  armR.hand.add(mace);
  armR.pivot.rotation.set(-0.32, 0, 0.22);

  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, eyes, shield, weapon: mace };
}

// Boot tips under the hem: without them a robe cone reads as a chess pawn.
function addRobeFeet(parent, mats, { y = 0.032, x = 0.072, z = 0.185 } = {}) {
  const bootGeo = cached('robe-boot', () => new THREE.BoxGeometry(0.075, 0.055, 0.11));
  for (const side of [-1, 1]) {
    part(parent, bootGeo, mats.leather, { pos: [side * x, y, z], rot: [0, side * -0.14, 0] });
  }
}

function mageStoleGeometry() {
  return cached('mage-stole-shape', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.026, 0.15);
    shape.lineTo(0.026, 0.15);
    shape.lineTo(0.04, -0.12);
    shape.lineTo(0, -0.16);
    shape.lineTo(-0.04, -0.12);
    shape.lineTo(-0.026, 0.15);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.01,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.005);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function addMageCowl(parent, mats) {
  const cowl = new THREE.Group();
  cowl.position.set(0, 0.73, 0);
  part(cowl, cached('mage-cowl-shell', () =>
    new THREE.SphereGeometry(0.13, 12, 8, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0, Math.PI * 0.66)
  ), mats.cloth, {
    pos: [0, 0.012, -0.018],
    scale: [1.04, 0.98, 1.14],
  });
  part(cowl, cached('mage-cowl-lining', () =>
    new THREE.SphereGeometry(0.116, 10, 7, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.58)
  ), mats.charcoal, {
    pos: [0, 0.006, -0.01],
    scale: [0.96, 0.92, 1.02],
  });
  part(cowl, cached('mage-cowl-drape', () =>
    new THREE.SphereGeometry(0.11, 10, 7, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.42)
  ), mats.cloth, {
    pos: [0, -0.018, -0.072],
    rot: [0.4, 0, 0],
    scale: [1.04, 1.55, 0.82],
  });
  part(cowl, wrapBandGeometry(0.11, 0.108, 0.024, 2.05, 8), mats.trim, {
    pos: [0, 0.014, 0.008],
  });
  part(cowl, cached('mage-cowl-collar', () => new THREE.TorusGeometry(0.098, 0.02, 5, 12)), mats.cloth, {
    pos: [0, -0.084, -0.008],
    rot: [-Math.PI / 2 + 0.16, 0, 0],
    scale: [1.04, 1.06, 1],
  });
  part(cowl, cached('mage-cowl-clasp', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6)), mats.gold, {
    pos: [0.04, -0.018, 0.098],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  parent.add(cowl);
  return cowl;
}

function addMageRobe(parent, mats) {
  const robe = new THREE.Group();
  part(robe, cached('robe', () =>
    new THREE.CylinderGeometry(0.118, 0.188, 0.4, 12, 2, true, 0.2, Math.PI * 2 - 0.4)
  ), mats.cloth, {
    pos: [0, 0.2, 0],
  });
  part(robe, cached('mage-robe-lining', () =>
    new THREE.CylinderGeometry(0.108, 0.172, 0.37, 10, 1, true, 0.22, Math.PI * 2 - 0.44)
  ), mats.charcoal, {
    pos: [0, 0.198, 0],
  });
  part(robe, mageStoleGeometry(), mats.charcoal, {
    pos: [0, 0.26, 0.128],
  });
  part(robe, cached('mage-stole-seam', () => new THREE.BoxGeometry(0.012, 0.22, 0.006)), mats.arcane, {
    pos: [0, 0.272, 0.136],
    shadow: false,
  });
  part(robe, wrapBandGeometry(0.186, 0.184, 0.022, 2.4, 10), mats.leather, {
    pos: [0, 0.014, 0],
  });
  part(robe, cached('mage-robe-hem', () => new THREE.TorusGeometry(0.182, 0.01, 5, 12, Math.PI * 1.7)), mats.trim, {
    pos: [0, 0.01, 0],
    rot: [-Math.PI / 2, 0, 0.2],
    shadow: false,
  });
  part(robe, cached('mage-cloak', () =>
    new THREE.CylinderGeometry(0.14, 0.2, 0.32, 12, 2, true, Math.PI * 0.7, Math.PI * 0.6)
  ), mats.cloth, {
    pos: [0, 0.26, -0.052],
  });
  part(robe, cached('mage-capelet', () =>
    new THREE.CylinderGeometry(0.13, 0.16, 0.1, 10, 1, true, Math.PI * 0.66, Math.PI * 0.68)
  ), mats.cloth, {
    pos: [0, 0.4, -0.036],
  });
  parent.add(robe);
  return robe;
}

function addMageKit(torso, mats) {
  part(torso, wrapBandGeometry(0.138, 0.124, 0.152, 2.15, 8), mats.cloth, {
    pos: [0, 0.01, 0],
    scale: [0.92, 1, 0.78],
  });
  part(torso, wrapBandGeometry(0.136, 0.128, 0.07, 1.9, 8), mats.leather, {
    pos: [0, 0.036, 0],
    scale: [0.9, 1, 0.8],
  });
  part(torso, trapezoidPlateGeometry(0.032, 0.056, 0.05, 0.01), mats.trim, {
    pos: [0, 0.04, 0.118],
  });
  part(torso, cached('mage-chest-gem', () => new THREE.OctahedronGeometry(0.012, 0)), mats.arcane, {
    pos: [0, 0.042, 0.126],
    shadow: false,
  });
  part(torso, cached('mage-sash', () => new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)), mats.trim, {
    pos: [0.018, 0.008, 0.1],
    rot: [0, 0, 0.55],
  });
  part(torso, cached('mage-belt', () => new THREE.CylinderGeometry(0.116, 0.116, 0.03, 10)), mats.leather, {
    pos: [0, -0.082, 0],
    scale: [0.92, 1, 0.78],
  });
  part(torso, cached('mage-buckle', () => new THREE.CylinderGeometry(0.016, 0.016, 0.01, 6)), mats.gold, {
    pos: [0, -0.082, 0.098],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const bookRot = [0.12, 0.38, 0.16];
  part(torso, cached('mage-book', () => new THREE.BoxGeometry(0.05, 0.068, 0.018)), mats.leather, {
    pos: [0.102, -0.102, 0.034],
    rot: bookRot,
  });
  part(torso, cached('mage-book-pages', () => new THREE.BoxGeometry(0.044, 0.06, 0.012)), mats.trim, {
    pos: [0.104, -0.102, 0.038],
    rot: bookRot,
    shadow: false,
  });
  part(torso, cached('mage-book-clasp', () => new THREE.BoxGeometry(0.01, 0.018, 0.006)), mats.gold, {
    pos: [0.11, -0.102, 0.048],
    rot: bookRot,
    shadow: false,
  });

  part(torso, cached('mage-vial', () => new THREE.CylinderGeometry(0.012, 0.014, 0.036, 6)), mats.charcoal, {
    pos: [-0.1, -0.108, 0.04],
    rot: [0.1, -0.3, -0.08],
  });
  part(torso, cached('mage-vial-glow', () => new THREE.CylinderGeometry(0.008, 0.009, 0.02, 6)), mats.arcane, {
    pos: [-0.1, -0.11, 0.042],
    rot: [0.1, -0.3, -0.08],
    shadow: false,
  });
  part(torso, cached('mage-pouch', () => new THREE.CylinderGeometry(0.022, 0.018, 0.04, 8)), mats.leather, {
    pos: [-0.092, -0.118, -0.03],
    rot: [0.2, -0.4, 0.1],
  });
  part(torso, cached('mage-pouch-flap', () => new THREE.CylinderGeometry(0.02, 0.016, 0.012, 8)), mats.charcoal, {
    pos: [-0.09, -0.098, -0.028],
    rot: [0.2, -0.4, 0.1],
    shadow: false,
  });
}

function addMageShoulders(parent, mats) {
  const capGeo = cached('mage-shoulder', () =>
    new THREE.SphereGeometry(0.068, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.52)
  );
  const lameGeo = cached('mage-shoulder-lame', () =>
    new THREE.SphereGeometry(0.064, 8, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.22)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.15, 0.57, 0.006);
    pad.rotation.z = side * -0.28;
    part(pad, capGeo, mats.cloth, { scale: [1.08, 0.5, 1.02] });
    part(pad, lameGeo, mats.charcoal, {
      pos: [0, -0.01, 0],
      scale: [1.1, 0.66, 1.04],
    });
    part(pad, wrapBandGeometry(0.056, 0.054, 0.016, 2.0, 8), mats.gold, {
      pos: [0, -0.024, 0.004],
      shadow: false,
    });
    parent.add(pad);
  }
}

function addMageSleeves(armL, armR, mats) {
  const sleeveGeo = wrapBandGeometry(0.042, 0.038, 0.09, 2.15, 8);
  const cuffGeo = wrapBandGeometry(0.044, 0.042, 0.02, 2.1, 8);
  const gloveGeo = wrapBandGeometry(0.04, 0.038, 0.036, 2.2, 8);
  part(armL.pivot, sleeveGeo, mats.leather, { pos: [0, -0.15, 0.003] });
  part(armR.pivot, sleeveGeo, mats.leather, { pos: [0, -0.15, 0.003] });
  part(armL.pivot, cuffGeo, mats.gold, { pos: [0, -0.116, 0.004], shadow: false });
  part(armR.pivot, cuffGeo, mats.gold, { pos: [0, -0.116, 0.004], shadow: false });
  part(armL.hand, gloveGeo, mats.leather, { pos: [0, -0.002, 0.003] });
  part(armR.hand, gloveGeo, mats.leather, { pos: [0, -0.002, 0.003] });
}

function addMageFeet(parent, mats) {
  const shaft = wrapBandGeometry(0.046, 0.042, 0.068, 2.2, 8);
  const foot = trapezoidPlateGeometry(0.076, 0.054, 0.096, 0.026);
  for (const side of [-1, 1]) {
    const boot = new THREE.Group();
    boot.position.set(side * 0.056, 0.034, 0.138);
    boot.rotation.y = side * -0.12;
    part(boot, shaft, mats.leather, { pos: [0, 0.026, 0] });
    part(boot, foot, mats.charcoal, {
      pos: [0, 0, 0.028],
      rot: [Math.PI / 2, 0, 0],
    });
    parent.add(boot);
  }
}

function buildMage(mats) {
  const group = new THREE.Group();
  const robe = addMageRobe(group, mats);
  addMageFeet(group, mats);

  const torso = addTorso(group, mats, { width: 0.88, height: 0.22, y: 0.47, material: mats.cloth, fittings: false });
  addMageKit(torso, mats);
  addMageShoulders(group, mats);

  const armL = addArm(group, mats, -1, { shoulderX: 0.142, shoulderY: 0.555, sleeveMat: mats.cloth });
  const armR = addArm(group, mats, 1, { shoulderX: 0.142, shoulderY: 0.555, sleeveMat: mats.cloth });
  addMageSleeves(armL, armR, mats);
  part(armL.hand, cached('mage-scroll', () => new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8)), mats.trim, {
    pos: [0.008, -0.012, 0.03],
    rot: [0.2, 0.4, 1.2],
  });
  part(armL.hand, cached('mage-scroll-cap', () => new THREE.CylinderGeometry(0.014, 0.014, 0.008, 8)), mats.leather, {
    pos: [0.03, 0.016, 0.046],
    rot: [0.2, 0.4, 1.2],
    shadow: false,
  });

  const head = addHead(group, mats, { y: 0.718, radius: 0.1 });
  const eyes = addEyes(head, mats, { y: 0.002, z: 0.094, size: 0.015 });
  part(head, wrapBandGeometry(0.1, 0.096, 0.042, 2.25, 8), mats.charcoal, {
    pos: [0, -0.024, 0.01],
  });
  part(head, cached('mage-circlet', () => new THREE.TorusGeometry(0.1, 0.007, 5, 12)), mats.gold, {
    pos: [0, 0.042, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(head, cached('mage-circlet-bezel', () => new THREE.CylinderGeometry(0.016, 0.014, 0.01, 6)), mats.gold, {
    pos: [0, 0.046, 0.096],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  const hatGem = part(head, cached('hat-gem', () => new THREE.OctahedronGeometry(0.018, 0)), mats.arcane, {
    pos: [0, 0.048, 0.104],
    shadow: false,
  });
  addMageCowl(group, mats);

  const staff = buildStaff(mats);
  staff.group.position.set(0.016, -0.1, 0.04);
  staff.group.rotation.set(-0.08, 0, -0.18);
  armR.hand.add(staff.group);
  armR.pivot.rotation.set(-0.2, 0, 0.06);
  armL.pivot.rotation.set(0.12, 0.08, -0.22);

  return {
    group,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    robe,
    orb: staff.orb,
    runeRing: staff.runeRing,
    gem: hatGem,
  };
}

function priestStoleGeometry() {
  return cached('priest-stole-shape', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.03, 0.16);
    shape.lineTo(0.03, 0.16);
    shape.lineTo(0.046, -0.14);
    shape.lineTo(0, -0.18);
    shape.lineTo(-0.046, -0.14);
    shape.lineTo(-0.03, 0.16);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.01,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.005);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function buildPriestStaff(mats) {
  const staff = new THREE.Group();
  part(staff, cached('priest-staff-shaft', () => new THREE.CylinderGeometry(0.012, 0.016, 0.62, 6)), mats.wood, {
    pos: [0, 0.08, 0],
  });
  const wrapGeo = cached('priest-staff-wrap', () => new THREE.CylinderGeometry(0.017, 0.017, 0.042, 6));
  part(staff, wrapGeo, mats.leather, { pos: [0, 0.01, 0] });
  part(staff, wrapGeo, mats.leather, { pos: [0, 0.16, 0] });
  const ringGeo = cached('priest-staff-ring', () => new THREE.TorusGeometry(0.018, 0.004, 5, 8));
  part(staff, ringGeo, mats.gold, {
    pos: [0, -0.04, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(staff, ringGeo, mats.gold, {
    pos: [0, 0.3, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(staff, cached('priest-staff-collar', () => new THREE.CylinderGeometry(0.02, 0.016, 0.018, 6)), mats.gold, {
    pos: [0, 0.36, 0],
  });
  part(staff, cached('priest-staff-cross-v', () => new THREE.BoxGeometry(0.022, 0.2, 0.02)), mats.gold, {
    pos: [0, 0.48, 0],
  });
  part(staff, cached('priest-staff-cross-h', () => new THREE.BoxGeometry(0.2, 0.022, 0.02)), mats.gold, {
    pos: [0, 0.5, 0],
  });
  const capGeo = cached('priest-staff-arm-cap', () => new THREE.CylinderGeometry(0.014, 0.012, 0.016, 6));
  part(staff, capGeo, mats.gold, { pos: [-0.104, 0.5, 0], rot: [0, 0, Math.PI / 2] });
  part(staff, capGeo, mats.gold, { pos: [0.104, 0.5, 0], rot: [0, 0, Math.PI / 2] });
  part(staff, capGeo, mats.gold, { pos: [0, 0.582, 0] });
  const orb = part(staff, cached('priest-halo-orb', () => new THREE.SphereGeometry(0.02, 8, 6)), mats.gold, {
    pos: [0, 0.5, 0.016],
    shadow: false,
  });
  part(staff, cached('priest-staff-ferrule', () => new THREE.CylinderGeometry(0.014, 0.01, 0.026, 6)), mats.gold, {
    pos: [0, -0.23, 0],
  });
  return { group: staff, orb };
}

function addPriestHalo(parent, mats) {
  const hood = new THREE.Group();
  hood.position.set(0, 0.76, -0.02);
  part(hood, cached('priest-halo', () => new THREE.TorusGeometry(0.13, 0.014, 6, 16)), mats.gold, {
    rot: [0.18, 0, 0],
  });
  part(hood, cached('priest-halo-inner', () => new THREE.TorusGeometry(0.11, 0.006, 5, 14)), mats.trim, {
    rot: [0.18, 0, 0],
    shadow: false,
  });
  parent.add(hood);
  return hood;
}

function addPriestRobe(parent, mats) {
  const robe = new THREE.Group();
  part(robe, cached('priest-robe', () =>
    new THREE.CylinderGeometry(0.124, 0.205, 0.4, 12, 2, true, 0.22, Math.PI * 2 - 0.44)
  ), mats.cloth, {
    pos: [0, 0.2, 0],
  });
  part(robe, cached('priest-robe-lining', () =>
    new THREE.CylinderGeometry(0.112, 0.188, 0.37, 10, 1, true, 0.24, Math.PI * 2 - 0.48)
  ), mats.trim, {
    pos: [0, 0.198, 0],
  });
  part(robe, priestStoleGeometry(), mats.gold, {
    pos: [0, 0.255, 0.13],
  });
  part(robe, cached('priest-stole-cross-v', () => new THREE.BoxGeometry(0.012, 0.07, 0.006)), mats.gold, {
    pos: [0, 0.2, 0.138],
    shadow: false,
  });
  part(robe, cached('priest-stole-cross-h', () => new THREE.BoxGeometry(0.042, 0.012, 0.006)), mats.gold, {
    pos: [0, 0.218, 0.138],
    shadow: false,
  });
  part(robe, wrapBandGeometry(0.202, 0.2, 0.028, 2.4, 10), mats.leather, {
    pos: [0, 0.016, 0],
  });
  part(robe, wrapBandGeometry(0.2, 0.198, 0.016, 2.3, 10), mats.gold, {
    pos: [0, 0.01, 0],
  });
  part(robe, cached('priest-capelet', () =>
    new THREE.CylinderGeometry(0.132, 0.16, 0.1, 10, 1, true, Math.PI * 0.66, Math.PI * 0.68)
  ), mats.trim, {
    pos: [0, 0.4, -0.034],
  });
  part(robe, cached('priest-capelet-trim', () => new THREE.TorusGeometry(0.118, 0.012, 5, 12, Math.PI * 1.1)), mats.gold, {
    pos: [0, 0.44, -0.01],
    rot: [-Math.PI / 2 + 0.2, 0, 0],
    scale: [1.04, 0.88, 1],
    shadow: false,
  });
  parent.add(robe);
  return robe;
}

function addPriestKit(torso, mats) {
  part(torso, wrapBandGeometry(0.136, 0.122, 0.148, 2.1, 8), mats.cloth, {
    pos: [0, 0.008, 0],
    scale: [0.9, 1, 0.78],
  });
  part(torso, wrapBandGeometry(0.134, 0.126, 0.048, 1.85, 8), mats.trim, {
    pos: [0, 0.04, 0],
    scale: [0.88, 1, 0.8],
  });
  part(torso, cached('priest-cross-v', () => new THREE.BoxGeometry(0.022, 0.11, 0.012)), mats.gold, {
    pos: [0, 0.028, 0.118],
  });
  part(torso, cached('priest-cross-h', () => new THREE.BoxGeometry(0.08, 0.022, 0.012)), mats.gold, {
    pos: [0, 0.046, 0.118],
  });
  part(torso, cached('priest-sash', () => new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6)), mats.gold, {
    pos: [0.016, 0.004, 0.098],
    rot: [0, 0, 0.5],
  });
  part(torso, cached('priest-belt', () => new THREE.CylinderGeometry(0.114, 0.114, 0.028, 10)), mats.leather, {
    pos: [0, -0.082, 0],
    scale: [0.9, 1, 0.78],
  });
  part(torso, cached('priest-buckle', () => new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6)), mats.gold, {
    pos: [0, -0.082, 0.096],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const bookRot = [0.1, -0.38, -0.14];
  part(torso, cached('priest-book', () => new THREE.BoxGeometry(0.048, 0.064, 0.016)), mats.leather, {
    pos: [-0.1, -0.1, 0.032],
    rot: bookRot,
  });
  part(torso, cached('priest-book-pages', () => new THREE.BoxGeometry(0.042, 0.056, 0.01)), mats.trim, {
    pos: [-0.102, -0.1, 0.036],
    rot: bookRot,
    shadow: false,
  });
  part(torso, cached('priest-book-cross-v', () => new THREE.BoxGeometry(0.008, 0.03, 0.004)), mats.gold, {
    pos: [-0.104, -0.1, 0.042],
    rot: bookRot,
    shadow: false,
  });
  part(torso, cached('priest-book-cross-h', () => new THREE.BoxGeometry(0.022, 0.008, 0.004)), mats.gold, {
    pos: [-0.104, -0.094, 0.042],
    rot: bookRot,
    shadow: false,
  });

  part(torso, cached('priest-rosary', () => new THREE.CylinderGeometry(0.004, 0.004, 0.07, 4)), mats.gold, {
    pos: [0.092, -0.12, 0.03],
    rot: [0.25, 0.3, 0.15],
    shadow: false,
  });
  part(torso, cached('priest-rosary-cross-v', () => new THREE.BoxGeometry(0.008, 0.028, 0.006)), mats.gold, {
    pos: [0.1, -0.16, 0.04],
    rot: [0.2, 0.25, 0.1],
    shadow: false,
  });
  part(torso, cached('priest-rosary-cross-h', () => new THREE.BoxGeometry(0.02, 0.008, 0.006)), mats.gold, {
    pos: [0.1, -0.154, 0.04],
    rot: [0.2, 0.25, 0.1],
    shadow: false,
  });
  const beadGeo = cached('priest-rosary-bead', () => new THREE.SphereGeometry(0.008, 6, 5));
  for (const [x, y, z] of [[0.094, -0.108, 0.032], [0.096, -0.124, 0.036], [0.098, -0.14, 0.038]]) {
    part(torso, beadGeo, mats.gold, { pos: [x, y, z], shadow: false });
  }
}

function addPriestShoulders(parent, mats) {
  const capGeo = cached('priest-shoulder', () =>
    new THREE.SphereGeometry(0.066, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)
  );
  const lameGeo = cached('priest-shoulder-lame', () =>
    new THREE.SphereGeometry(0.062, 8, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.2)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.148, 0.568, 0.006);
    pad.rotation.z = side * -0.26;
    part(pad, capGeo, mats.cloth, { scale: [1.06, 0.48, 1.02] });
    part(pad, lameGeo, mats.trim, {
      pos: [0, -0.01, 0],
      scale: [1.08, 0.64, 1.04],
    });
    part(pad, wrapBandGeometry(0.054, 0.052, 0.016, 2.0, 8), mats.gold, {
      pos: [0, -0.022, 0.004],
      shadow: false,
    });
    parent.add(pad);
  }
}

function addPriestSleeves(armL, armR, mats) {
  const sleeveGeo = wrapBandGeometry(0.042, 0.038, 0.086, 2.1, 8);
  const cuffGeo = wrapBandGeometry(0.044, 0.042, 0.018, 2.0, 8);
  part(armL.pivot, sleeveGeo, mats.trim, { pos: [0, -0.15, 0.003] });
  part(armR.pivot, sleeveGeo, mats.trim, { pos: [0, -0.15, 0.003] });
  part(armL.pivot, cuffGeo, mats.gold, { pos: [0, -0.118, 0.004], shadow: false });
  part(armR.pivot, cuffGeo, mats.gold, { pos: [0, -0.118, 0.004], shadow: false });
  const gloveGeo = wrapBandGeometry(0.04, 0.038, 0.03, 2.15, 8);
  part(armL.hand, gloveGeo, mats.leather, { pos: [0, -0.002, 0.003] });
  part(armR.hand, gloveGeo, mats.leather, { pos: [0, -0.002, 0.003] });
}

function addPriestFeet(parent, mats) {
  const shaft = wrapBandGeometry(0.046, 0.042, 0.064, 2.2, 8);
  const foot = trapezoidPlateGeometry(0.074, 0.052, 0.092, 0.024);
  for (const side of [-1, 1]) {
    const boot = new THREE.Group();
    boot.position.set(side * 0.058, 0.034, 0.15);
    boot.rotation.y = side * -0.12;
    part(boot, shaft, mats.leather, { pos: [0, 0.024, 0] });
    part(boot, foot, mats.charcoal, {
      pos: [0, 0, 0.026],
      rot: [Math.PI / 2, 0, 0],
    });
    parent.add(boot);
  }
}

function buildPriest(mats) {
  const group = new THREE.Group();
  const robe = addPriestRobe(group, mats);
  addPriestFeet(group, mats);

  const torso = addTorso(group, mats, { width: 0.86, height: 0.22, y: 0.47, material: mats.cloth, fittings: false });
  addPriestKit(torso, mats);
  addPriestShoulders(group, mats);

  const armL = addArm(group, mats, -1, { shoulderX: 0.145, shoulderY: 0.56, sleeveMat: mats.cloth });
  const armR = addArm(group, mats, 1, { shoulderX: 0.145, shoulderY: 0.56, sleeveMat: mats.cloth });
  addPriestSleeves(armL, armR, mats);

  const head = addHead(group, mats, { y: 0.718, radius: 0.102 });
  const eyes = addEyes(head, mats, { y: -0.002, z: 0.094, size: 0.015 });
  part(head, cached('priest-brow-cross-v', () => new THREE.BoxGeometry(0.012, 0.038, 0.008)), mats.gold, {
    pos: [0, 0.024, 0.1],
  });
  part(head, cached('priest-brow-cross-h', () => new THREE.BoxGeometry(0.032, 0.012, 0.008)), mats.gold, {
    pos: [0, 0.032, 0.1],
  });
  const hood = addPriestHalo(group, mats);

  const staff = buildPriestStaff(mats);
  staff.group.position.set(0.018, -0.12, 0.038);
  staff.group.rotation.set(-0.08, 0, -0.2);
  armR.hand.add(staff.group);
  armR.pivot.rotation.set(-0.16, 0, 0.06);
  armL.pivot.rotation.set(0.18, 0.06, -0.2);

  return {
    group,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    robe,
    hood,
    orb: staff.orb,
  };
}

function buildAssassinDagger(mats) {
  const dagger = new THREE.Group();
  part(dagger, cached('assassin-grip', () => new THREE.CylinderGeometry(0.011, 0.013, 0.068, 6)), mats.charcoal, {
    pos: [0, -0.032, 0],
  });
  part(dagger, cached('assassin-grip-ring', () => new THREE.TorusGeometry(0.014, 0.003, 5, 8)), mats.gold, {
    pos: [0, -0.008, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(dagger, cached('assassin-pommel', () => new THREE.CylinderGeometry(0.014, 0.01, 0.014, 6)), mats.steel, {
    pos: [0, -0.07, 0],
  });
  part(dagger, trapezoidPlateGeometry(0.05, 0.018, 0.016, 0.02), mats.steel, {
    pos: [0, 0.004, 0],
  });
  part(dagger, bladeGeometry(0.2, 0.028, 0.01), mats.steel, { pos: [0, 0.012, 0] });
  part(dagger, cached('assassin-fuller', () => new THREE.BoxGeometry(0.006, 0.13, 0.012)), mats.charcoal, {
    pos: [0, 0.09, 0],
    shadow: false,
  });
  return dagger;
}

function addAssassinHood(parent, mats) {
  const hood = new THREE.Group();
  hood.position.set(0, 0.738, 0);
  part(hood, cached('assassin-hood-shell', () =>
    new THREE.SphereGeometry(0.13, 12, 8, Math.PI / 2 + 0.82, Math.PI * 2 - 1.64, 0, Math.PI * 0.64)
  ), mats.charcoal, {
    pos: [0, 0.012, -0.016],
    scale: [1.02, 0.96, 1.12],
  });
  part(hood, cached('assassin-hood-lining', () =>
    new THREE.SphereGeometry(0.116, 10, 7, Math.PI / 2 + 0.88, Math.PI * 2 - 1.76, 0, Math.PI * 0.56)
  ), mats.cloth, {
    pos: [0, 0.008, -0.01],
    scale: [0.96, 0.9, 1.02],
  });
  part(hood, cached('assassin-hood-drape', () =>
    new THREE.SphereGeometry(0.11, 10, 7, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.44)
  ), mats.charcoal, {
    pos: [0, -0.02, -0.074],
    rot: [0.42, 0, 0],
    scale: [1.04, 1.62, 0.82],
  });
  part(hood, wrapBandGeometry(0.112, 0.11, 0.026, 2.0, 8), mats.leather, {
    pos: [0, 0.014, 0.008],
  });
  part(hood, cached('assassin-hood-collar', () => new THREE.TorusGeometry(0.098, 0.02, 5, 12)), mats.charcoal, {
    pos: [0, -0.086, -0.01],
    rot: [-Math.PI / 2 + 0.16, 0, 0],
    scale: [1.04, 1.06, 1],
  });
  part(hood, cached('assassin-hood-clasp', () => new THREE.CylinderGeometry(0.011, 0.011, 0.01, 6)), mats.gold, {
    pos: [0.038, -0.016, 0.096],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  parent.add(hood);
  return hood;
}

function addAssassinScarf(parent, mats) {
  const scarf = new THREE.Group();
  scarf.position.set(0.018, 0.58, -0.036);
  part(scarf, cached('assassin-scarf-knot', () => new THREE.CylinderGeometry(0.02, 0.016, 0.028, 8)), mats.cloth, {
    pos: [0, 0.01, 0],
    rot: [0.4, 0.2, 0.15],
  });
  part(scarf, trapezoidPlateGeometry(0.034, 0.058, 0.24, 0.012), mats.cloth, {
    pos: [0.012, -0.12, -0.008],
    rot: [0.28, 0.18, 0.16],
  });
  part(scarf, trapezoidPlateGeometry(0.028, 0.048, 0.2, 0.01), mats.cloth, {
    pos: [-0.016, -0.1, 0.004],
    rot: [0.22, -0.12, -0.2],
  });
  parent.add(scarf);
  return scarf;
}

function addAssassinCloak(parent, mats) {
  const cloak = new THREE.Group();
  cloak.position.set(0, 0.5, -0.038);
  part(cloak, cached('assassin-cloak', () =>
    new THREE.CylinderGeometry(0.138, 0.178, 0.26, 12, 2, true, Math.PI * 0.72, Math.PI * 0.56)
  ), mats.charcoal, {
    pos: [0, -0.06, -0.012],
  });
  part(cloak, cached('assassin-cloak-collar', () => new THREE.TorusGeometry(0.094, 0.014, 5, 12, Math.PI * 1.1)), mats.leather, {
    pos: [0, 0.056, 0.01],
    rot: [-Math.PI / 2 + 0.18, 0, 0],
    scale: [1.04, 0.88, 1],
  });
  parent.add(cloak);
}

function addAssassinKit(torso, mats) {
  part(torso, wrapBandGeometry(0.144, 0.128, 0.16, 2.2, 8), mats.charcoal, {
    pos: [0, 0.012, 0],
    scale: [0.94, 1, 0.8],
  });
  part(torso, wrapBandGeometry(0.142, 0.132, 0.072, 1.95, 8), mats.leather, {
    pos: [0, 0.038, 0],
    scale: [0.92, 1, 0.82],
  });
  part(torso, cached('assassin-sash-a', () => new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6)), mats.leather, {
    pos: [0.01, 0.012, 0.1],
    rot: [0, 0, 0.52],
  });
  part(torso, cached('assassin-sash-b', () => new THREE.CylinderGeometry(0.011, 0.011, 0.22, 6)), mats.cloth, {
    pos: [-0.006, 0.008, 0.096],
    rot: [0, 0, -0.48],
  });
  const buckleGeo = cached('assassin-buckle', () => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6));
  part(torso, buckleGeo, mats.gold, {
    pos: [0.062, 0.068, 0.098],
    rot: [Math.PI / 2, 0, 0.4],
    shadow: false,
  });
  part(torso, buckleGeo, mats.gold, {
    pos: [-0.058, 0.062, 0.096],
    rot: [Math.PI / 2, 0, -0.35],
    shadow: false,
  });
  part(torso, cached('assassin-belt', () => new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10)), mats.leather, {
    pos: [0, -0.092, 0],
    scale: [0.94, 1, 0.8],
  });
  part(torso, cached('assassin-belt-buckle', () => new THREE.CylinderGeometry(0.015, 0.015, 0.01, 6)), mats.gold, {
    pos: [0, -0.092, 0.1],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const sheath = new THREE.Group();
  sheath.position.set(-0.1, -0.1, 0.04);
  sheath.rotation.set(0.15, 0.45, 0.35);
  part(sheath, trapezoidPlateGeometry(0.028, 0.02, 0.11, 0.02), mats.leather);
  part(sheath, cached('assassin-sheath-throat', () => new THREE.BoxGeometry(0.032, 0.014, 0.022)), mats.steel, {
    pos: [0, 0.052, 0],
    shadow: false,
  });
  torso.add(sheath);

  const knifeGeo = cached('assassin-throw-knife', () => new THREE.BoxGeometry(0.008, 0.07, 0.01));
  part(torso, knifeGeo, mats.steel, {
    pos: [0.088, 0.02, 0.07],
    rot: [0.15, 0.35, 0.55],
    shadow: false,
  });
  part(torso, knifeGeo, mats.steel, {
    pos: [0.078, -0.012, 0.074],
    rot: [0.18, 0.32, 0.5],
    shadow: false,
  });
  part(torso, cached('assassin-pouch', () => new THREE.CylinderGeometry(0.022, 0.018, 0.04, 8)), mats.leather, {
    pos: [0.1, -0.118, -0.02],
    rot: [0.2, 0.5, 0.12],
  });
  part(torso, cached('assassin-pouch-flap', () => new THREE.CylinderGeometry(0.02, 0.016, 0.012, 8)), mats.charcoal, {
    pos: [0.098, -0.098, -0.018],
    rot: [0.2, 0.5, 0.12],
    shadow: false,
  });
}

function addAssassinShoulders(parent, mats) {
  const capGeo = cached('assassin-shoulder', () =>
    new THREE.SphereGeometry(0.064, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)
  );
  const lameGeo = cached('assassin-shoulder-lame', () =>
    new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.2)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.152, 0.575, 0.006);
    pad.rotation.z = side * -0.3;
    part(pad, capGeo, mats.leather, { scale: [1.08, 0.48, 1.02] });
    part(pad, lameGeo, mats.charcoal, {
      pos: [0, -0.01, 0],
      scale: [1.1, 0.64, 1.04],
    });
    parent.add(pad);
  }
}

function addAssassinLegKit(legs, mats) {
  const thighGeo = wrapBandGeometry(0.05, 0.046, 0.076, 2.05, 8);
  const kneeGeo = cached('assassin-knee', () =>
    new THREE.SphereGeometry(0.028, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const shinGeo = wrapBandGeometry(0.046, 0.042, 0.088, 2.3, 8);
  const bootFoot = trapezoidPlateGeometry(0.078, 0.056, 0.1, 0.026);

  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    part(hip, thighGeo, mats.leather, { pos: [0, -legs.thigh * 0.46, 0.004] });
    part(knee, kneeGeo, mats.charcoal, {
      pos: [0, 0.002, 0.026],
      scale: [1.1, 0.56, 1],
    });
    part(knee, shinGeo, mats.charcoal, { pos: [0, -legs.shin * 0.54, 0.002] });
    part(knee, wrapBandGeometry(0.048, 0.046, 0.018, 2.15, 8), mats.leather, {
      pos: [0, -legs.shin * 0.28, 0.004],
    });
    part(knee, bootFoot, mats.charcoal, {
      pos: [0, -legs.shin - 0.012, 0.026],
      rot: [Math.PI / 2, 0, 0],
    });
  }
}

function addAssassinBracers(armL, armR, mats) {
  const bracerGeo = wrapBandGeometry(0.042, 0.038, 0.086, 2.2, 8);
  const cuffGeo = wrapBandGeometry(0.044, 0.042, 0.018, 2.1, 8);
  const gloveGeo = wrapBandGeometry(0.04, 0.038, 0.034, 2.2, 8);
  part(armL.pivot, bracerGeo, mats.leather, { pos: [0, -0.15, 0.003] });
  part(armR.pivot, bracerGeo, mats.leather, { pos: [0, -0.15, 0.003] });
  part(armL.pivot, cuffGeo, mats.steel, { pos: [0, -0.118, 0.004], shadow: false });
  part(armR.pivot, cuffGeo, mats.steel, { pos: [0, -0.118, 0.004], shadow: false });
  part(armL.hand, gloveGeo, mats.charcoal, { pos: [0, -0.002, 0.003] });
  part(armR.hand, gloveGeo, mats.charcoal, { pos: [0, -0.002, 0.003] });
}

function buildAssassin(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.07, legLength: 0.18, boots: false });
  addAssassinLegKit(legs, mats);
  const torso = addTorso(group, mats, { width: 0.9, height: 0.25, y: 0.48, material: mats.charcoal, fittings: false });
  addAssassinKit(torso, mats);
  addAssassinShoulders(group, mats);
  addAssassinCloak(group, mats);

  const armL = addArm(group, mats, -1, { shoulderX: 0.148, shoulderY: 0.57, sleeveMat: mats.charcoal });
  const armR = addArm(group, mats, 1, { shoulderX: 0.148, shoulderY: 0.57, sleeveMat: mats.charcoal });
  addAssassinBracers(armL, armR, mats);

  const head = addHead(group, mats, { y: 0.728, radius: 0.1 });
  const eyes = addEyes(head, mats, { y: 0.006, z: 0.094, size: 0.016 });
  part(head, wrapBandGeometry(0.1, 0.096, 0.04, 2.2, 8), mats.charcoal, {
    pos: [0, -0.022, 0.008],
  });
  part(head, trapezoidPlateGeometry(0.036, 0.05, 0.042, 0.012), mats.steel, {
    pos: [0, -0.02, 0.102],
  });
  const hood = addAssassinHood(group, mats);
  const scarf = addAssassinScarf(group, mats);

  const daggerR = buildAssassinDagger(mats);
  daggerR.position.set(0.006, 0.008, 0.042);
  daggerR.rotation.set(-0.18, 0.12, -1.35);
  armR.hand.add(daggerR);
  const daggerL = buildAssassinDagger(mats);
  daggerL.position.set(-0.006, 0.008, 0.042);
  daggerL.rotation.set(-0.16, -0.1, 1.35);
  armL.hand.add(daggerL);
  armR.pivot.rotation.set(-0.62, 0.08, 0.28);
  armL.pivot.rotation.set(-0.48, -0.08, -0.3);

  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, eyes, hood, scarf };
}

function viperCoilGeometry() {
  return cached('viper-coil-48', () => {
    const points = [];
    const turns = 2.15;
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const angle = p * Math.PI * 2 * turns;
      const radius = 0.215 - p * 0.09;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.054 + p * 0.096, Math.sin(angle) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.055, 8, false);
  });
}

function viperNeckGeometry() {
  return cached('viper-neck-32', () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.073, 0, 0.101),
      new THREE.Vector3(0.045, 0.1, 0.055),
      new THREE.Vector3(-0.018, 0.21, -0.008),
      new THREE.Vector3(-0.026, 0.34, -0.016),
      new THREE.Vector3(0, 0.44, 0.028),
      new THREE.Vector3(0, 0.5, 0.08),
    ]);
    return new THREE.TubeGeometry(curve, 32, 0.047, 8, false);
  });
}

function viperHoodGeometry() {
  return cached('viper-hood', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.14);
    shape.bezierCurveTo(0.13, -0.12, 0.185, 0.02, 0.115, 0.125);
    shape.bezierCurveTo(0.07, 0.185, -0.07, 0.185, -0.115, 0.125);
    shape.bezierCurveTo(-0.185, 0.02, -0.13, -0.12, 0, -0.14);
    return extrude(shape, 0.026, 0.012);
  });
}

function viperSnoutGeometry() {
  return cached('viper-snout-profile', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.022);
    shape.lineTo(0.092, 0.01);
    shape.lineTo(0.108, -0.008);
    shape.lineTo(0.02, -0.02);
    shape.lineTo(0, -0.012);
    shape.lineTo(0, 0.022);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.062,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.031);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function buildViper(mats) {
  const group = new THREE.Group();

  // Body stays green so the silhouette still reads as a snake; blending team
  // colour into the scales turns them to mud. Hood, collar, and saddle carry
  // the team identity instead.
  const scaleMat = standard(0x2a9147, {
    roughness: 0.5,
    metalness: 0.1,
    emissive: 0x0b3319,
    emissiveIntensity: 0.28,
  });
  scaleMat.name = 'viperBody';
  const scaleDeepMat = standard(0x15602f, { roughness: 0.58, metalness: 0.1 });
  scaleDeepMat.name = 'viperBodyDeep';
  const bellyMat = standard(0xe8dfa2, { roughness: 0.72, metalness: 0.04 });
  bellyMat.name = 'belly';
  const poisonMat = standard(0x86efac, {
    roughness: 0.3,
    emissive: 0x22c55e,
    emissiveIntensity: 1.1,
  });
  poisonMat.name = 'poison';
  const extraMaterials = [scaleMat, scaleDeepMat, bellyMat, poisonMat];

  part(group, viperCoilGeometry(), scaleMat);

  const scuteGeo = trapezoidPlateGeometry(0.07, 0.09, 0.08, 0.016);
  const scutes = [
    [0.06, 0.168, 0.04, 0.45],
    [-0.04, 0.132, -0.08, 1.2],
    [0.12, 0.1, -0.04, 2.1],
  ];
  for (const [x, y, z, yaw] of scutes) {
    part(group, scuteGeo, mats.armorDeep, {
      pos: [x, y, z],
      rot: [0.15, yaw, 0],
    });
  }

  const ringGeo = cached('viper-coil-ring', () => new THREE.TorusGeometry(0.058, 0.008, 5, 10));
  for (const [x, y, z, yaw] of [
    [0.16, 0.08, 0.12, 0.4],
    [-0.12, 0.12, 0.06, 1.8],
    [0.02, 0.16, -0.14, 2.6],
  ]) {
    part(group, ringGeo, mats.gold, {
      pos: [x, y, z],
      rot: [1.2, yaw, 0.2],
      shadow: false,
    });
  }

  const rattle = new THREE.Group();
  rattle.position.set(0.255, 0.06, -0.055);
  rattle.rotation.set(Math.PI / 2, 0, -0.9);
  const beadGeo = cached('viper-rattle', () => new THREE.CylinderGeometry(0.028, 0.032, 0.028, 8));
  for (let i = 0; i < 3; i++) {
    part(rattle, beadGeo, mats.gold, { pos: [0, i * 0.03, 0] });
  }
  part(rattle, cached('viper-tail-tip', () => new THREE.ConeGeometry(0.026, 0.07, 6)), scaleDeepMat, {
    pos: [0, 0.1, 0],
  });
  group.add(rattle);

  const torso = new THREE.Group();
  torso.position.set(0, 0.15, 0);
  group.add(torso);
  part(torso, viperNeckGeometry(), scaleMat);
  part(torso, cached('viper-collar', () => new THREE.TorusGeometry(0.058, 0.012, 6, 12)), mats.armor, {
    pos: [0, 0.02, 0.04],
    rot: [0.4, 0, 0],
    shadow: false,
  });
  part(torso, cached('viper-collar-gold', () => new THREE.TorusGeometry(0.05, 0.007, 5, 10)), mats.gold, {
    pos: [0, 0.036, 0.048],
    rot: [0.4, 0, 0],
    shadow: false,
  });
  part(torso, wrapBandGeometry(0.05, 0.046, 0.06, 2.0, 8), bellyMat, {
    pos: [0, 0.22, 0.03],
    rot: [0.35, 0, 0],
    shadow: false,
  });

  const head = new THREE.Group();
  head.position.set(0, 0.525, 0.1);
  head.rotation.x = 0.2;
  torso.add(head);

  part(head, viperHoodGeometry(), mats.armor, {
    pos: [0, 0.005, -0.082],
    rot: [-0.5, 0, 0],
    scale: [1.02, 1.06, 1],
  });
  part(head, viperHoodGeometry(), scaleDeepMat, {
    pos: [0, 0.002, -0.078],
    rot: [-0.5, 0, 0],
    scale: [0.72, 0.76, 0.65],
  });
  const spotGeo = cached('viper-hood-spot', () => new THREE.CylinderGeometry(0.022, 0.022, 0.008, 8));
  for (const side of [-1, 1]) {
    part(head, spotGeo, mats.trim, {
      pos: [side * 0.058, 0.056, -0.05],
      rot: [1.07, 0, 0],
      shadow: false,
    });
    part(head, cached('viper-hood-spot-core', () => new THREE.CylinderGeometry(0.01, 0.01, 0.01, 6)), mats.gold, {
      pos: [side * 0.058, 0.056, -0.046],
      rot: [1.07, 0, 0],
      shadow: false,
    });
  }

  part(head, cached('viper-skull', () => new THREE.SphereGeometry(0.078, 10, 8)), scaleMat, {
    scale: [1.16, 0.78, 1.32],
  });
  part(head, viperSnoutGeometry(), scaleMat, {
    pos: [0, -0.006, 0.072],
    rot: [0.12, Math.PI / 2, 0],
  });
  part(head, trapezoidPlateGeometry(0.07, 0.086, 0.1, 0.022), bellyMat, {
    pos: [0, -0.04, 0.068],
    rot: [1.2, 0, 0],
  });
  const browGeo = trapezoidPlateGeometry(0.042, 0.03, 0.04, 0.016);
  for (const side of [-1, 1]) {
    part(head, browGeo, scaleDeepMat, {
      pos: [side * 0.048, 0.034, 0.048],
      rot: [0.35, side * -0.15, side * 0.22],
    });
  }
  const nareGeo = cached('viper-nare', () => new THREE.CylinderGeometry(0.006, 0.006, 0.01, 6));
  for (const side of [-1, 1]) {
    part(head, nareGeo, scaleDeepMat, {
      pos: [side * 0.018, 0.002, 0.15],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
  }
  const eyes = addEyes(head, mats, { y: 0.016, z: 0.072, spread: 0.053, size: 0.014 });

  const fangGeo = cached('viper-fang', () => new THREE.ConeGeometry(0.012, 0.058, 5));
  for (const side of [-1, 1]) {
    part(head, fangGeo, bellyMat, {
      pos: [side * 0.026, -0.06, 0.1],
      rot: [0.35, 0, side * 0.14],
      shadow: false,
    });
  }
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.042, 0.132);
  tongue.rotation.x = 0.28;
  part(tongue, cached('viper-tongue', () => new THREE.CylinderGeometry(0.004, 0.004, 0.048, 5)), poisonMat, {
    pos: [0, 0, 0.024],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  const forkGeo = cached('viper-tongue-tip', () => new THREE.CylinderGeometry(0.003, 0.003, 0.028, 5));
  for (const side of [-1, 1]) {
    part(tongue, forkGeo, poisonMat, {
      pos: [side * 0.01, 0, 0.058],
      rot: [Math.PI / 2, side * -0.4, 0],
      shadow: false,
    });
  }
  head.add(tongue);

  return { group, torso, head, eyes, extraMaterials };
}

function buildBomberBomb(mats) {
  const bomb = new THREE.Group();
  part(bomb, cached('bomber-bomb-shell', () => new THREE.SphereGeometry(0.096, 10, 8)), mats.charcoal);
  part(bomb, cached('bomber-bomb-band', () => new THREE.TorusGeometry(0.084, 0.01, 5, 12)), mats.gold, {
    pos: [0, 0.012, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  part(bomb, cached('bomber-bomb-band-hi', () => new THREE.TorusGeometry(0.078, 0.008, 5, 10)), mats.steel, {
    pos: [0, 0.048, 0],
    rot: [-Math.PI / 2 + 0.15, 0, 0],
    shadow: false,
  });
  part(bomb, cached('bomber-bomb-cap', () => new THREE.CylinderGeometry(0.028, 0.036, 0.032, 8)), mats.steel, {
    pos: [0, 0.094, 0],
  });
  part(bomb, cached('bomber-bomb-port', () => new THREE.CylinderGeometry(0.012, 0.014, 0.016, 6)), mats.gold, {
    pos: [0, 0.114, 0],
    shadow: false,
  });
  const fuseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, 0),
    new THREE.Vector3(0.026, 0.16, 0.014),
    new THREE.Vector3(-0.012, 0.198, -0.012),
    new THREE.Vector3(0.018, 0.228, 0.01),
  ]);
  part(bomb, cached('bomber-bomb-fuse', () => new THREE.TubeGeometry(fuseCurve, 12, 0.007, 5, false)), mats.leather);
  const spark = part(bomb, cached('bomber-bomb-spark', () => new THREE.SphereGeometry(0.02, 8, 6)), mats.ember, {
    pos: [0.018, 0.232, 0.01],
    shadow: false,
  });
  const rivetGeo = cached('bomber-bomb-rivet', () => new THREE.CylinderGeometry(0.007, 0.007, 0.01, 6));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    part(bomb, rivetGeo, mats.gold, {
      pos: [Math.cos(a) * 0.09, 0.01, Math.sin(a) * 0.09],
      rot: [Math.PI / 2, 0, a],
      shadow: false,
    });
  }
  return { group: bomb, spark };
}

function addBomberHelm(head, mats) {
  part(head, cached('bomber-cap', () =>
    new THREE.SphereGeometry(0.116, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.46)
  ), mats.leather, {
    pos: [0, 0.028, -0.004],
    scale: [1.02, 1.04, 1.02],
  });
  part(head, cached('bomber-cap-button', () => new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6)), mats.gold, {
    pos: [0, 0.118, -0.006],
    shadow: false,
  });
  part(head, trapezoidPlateGeometry(0.11, 0.14, 0.036, 0.016), mats.leather, {
    pos: [0, 0.012, 0.1],
    rot: [0.35, 0, 0],
  });
  const flapGeo = cached('bomber-earflap', () =>
    new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.58)
  );
  for (const side of [-1, 1]) {
    part(head, flapGeo, mats.leather, {
      pos: [side * 0.096, 0.002, -0.008],
      rot: [0, 0, side * 1.85],
      scale: [1, 1.28, 1],
    });
  }
  part(head, cached('bomber-cap-seam', () => new THREE.TorusGeometry(0.11, 0.009, 5, 12)), mats.charcoal, {
    pos: [0, 0.056, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [0.88, 0.88, 1],
    shadow: false,
  });
  part(head, cached('bomber-chin-strap', () => new THREE.TorusGeometry(0.1, 0.008, 5, 10, Math.PI * 1.1)), mats.leather, {
    pos: [0, -0.02, 0.01],
    rot: [Math.PI / 2 - 0.35, 0, Math.PI * 0.72],
    scale: [0.92, 1, 0.88],
  });

  const frameGeo = cached('goggle-frame', () => new THREE.TorusGeometry(0.03, 0.006, 5, 8));
  const lensGeo = cached('goggle-lens', () => new THREE.CylinderGeometry(0.026, 0.026, 0.016, 8));
  for (const side of [-1, 1]) {
    part(head, frameGeo, mats.steel, {
      pos: [side * 0.042, 0.028, 0.096],
      rot: [Math.PI / 2 - 0.14, 0, 0],
      shadow: false,
    });
    part(head, lensGeo, mats.ember, {
      pos: [side * 0.042, 0.028, 0.098],
      rot: [Math.PI / 2 - 0.14, 0, 0],
      shadow: false,
    });
  }
  part(head, cached('goggle-bridge', () => new THREE.BoxGeometry(0.028, 0.012, 0.016)), mats.steel, {
    pos: [0, 0.03, 0.1],
    shadow: false,
  });
  part(head, cached('goggle-strap', () => new THREE.TorusGeometry(0.11, 0.011, 5, 12, Math.PI * 1.2)), mats.charcoal, {
    pos: [0, 0.028, -0.004],
    rot: [Math.PI / 2 - 0.14, 0, Math.PI * 0.7],
    scale: [1, 1, 0.92],
  });
  part(head, wrapBandGeometry(0.1, 0.096, 0.036, 2.1, 8), mats.cloth, {
    pos: [0, -0.078, 0.006],
  });
}

function addBomberKit(torso, mats) {
  part(torso, wrapBandGeometry(0.168, 0.158, 0.14, 2.15, 10), mats.leather, {
    pos: [0, 0.02, 0],
    scale: [1.02, 1, 0.88],
  });
  part(torso, wrapBandGeometry(0.164, 0.154, 0.05, 1.95, 8), mats.armorDeep, {
    pos: [0, 0.05, 0],
    scale: [1, 1, 0.9],
  });
  part(torso, cached('bomber-belt', () => new THREE.CylinderGeometry(0.152, 0.152, 0.038, 12)), mats.leather, {
    pos: [0, -0.068, 0],
    scale: [1.02, 1, 0.88],
  });
  part(torso, cached('bomber-buckle', () => new THREE.CylinderGeometry(0.018, 0.018, 0.012, 6)), mats.gold, {
    pos: [0, -0.068, 0.14],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const bandolier = new THREE.Group();
  bandolier.rotation.z = 0.55;
  part(bandolier, cached('bomber-strap', () => new THREE.TorusGeometry(0.16, 0.016, 5, 14)), mats.leather, {
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 0.86],
  });
  const chargeGeo = cached('bomber-charge', () => new THREE.CylinderGeometry(0.02, 0.022, 0.052, 8));
  const chargeBand = cached('bomber-charge-band', () => new THREE.TorusGeometry(0.022, 0.004, 5, 8));
  const capGeo = cached('bomber-charge-cap', () => new THREE.CylinderGeometry(0.012, 0.014, 0.016, 6));
  for (const angle of [0.85, 1.35, 1.85]) {
    const x = Math.cos(angle) * 0.16;
    const z = Math.sin(angle) * 0.16 * 0.86;
    part(bandolier, chargeGeo, mats.charcoal, {
      pos: [x, 0, z],
      rot: [0, 0, 0.15],
    });
    part(bandolier, chargeBand, mats.gold, {
      pos: [x, 0.004, z],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
    part(bandolier, capGeo, mats.steel, {
      pos: [x, 0.032, z],
      shadow: false,
    });
  }
  torso.add(bandolier);

  const pouchGeo = cached('bomber-pouch', () => new THREE.CylinderGeometry(0.028, 0.024, 0.046, 8));
  const flapGeo = cached('bomber-pouch-flap', () => new THREE.CylinderGeometry(0.026, 0.022, 0.014, 8));
  part(torso, pouchGeo, mats.leather, {
    pos: [-0.122, -0.086, 0.08],
    rot: [0.15, -0.25, 0.1],
  });
  part(torso, flapGeo, mats.charcoal, {
    pos: [-0.12, -0.062, 0.082],
    rot: [0.15, -0.25, 0.1],
    shadow: false,
  });
  part(torso, pouchGeo, mats.leather, {
    pos: [0.128, -0.086, 0.05],
    rot: [0.12, 0.3, -0.08],
  });
  part(torso, flapGeo, mats.charcoal, {
    pos: [0.126, -0.062, 0.052],
    rot: [0.12, 0.3, -0.08],
    shadow: false,
  });
  part(torso, cached('bomber-fuse-tin', () => new THREE.CylinderGeometry(0.018, 0.018, 0.032, 8)), mats.steel, {
    pos: [0.06, -0.09, 0.12],
    rot: [0.2, 0.15, 0],
  });
  part(torso, cached('bomber-fuse-lid', () => new THREE.CylinderGeometry(0.016, 0.016, 0.008, 8)), mats.gold, {
    pos: [0.06, -0.072, 0.124],
    rot: [0.2, 0.15, 0],
    shadow: false,
  });
}

function addBomberShoulders(parent, mats) {
  const capGeo = cached('bomber-shoulder', () =>
    new THREE.SphereGeometry(0.072, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.52)
  );
  const lameGeo = cached('bomber-shoulder-lame', () =>
    new THREE.SphereGeometry(0.068, 8, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.22)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.168, 0.52, 0.01);
    pad.rotation.z = side * -0.28;
    part(pad, capGeo, mats.leather, { scale: [1.12, 0.5, 1.06] });
    part(pad, lameGeo, mats.armorDeep, {
      pos: [0, -0.01, 0],
      scale: [1.14, 0.68, 1.08],
    });
    parent.add(pad);
  }
}

function addBomberLegKit(legs, mats) {
  const thighGeo = wrapBandGeometry(0.054, 0.05, 0.07, 2.1, 8);
  const shinGeo = wrapBandGeometry(0.05, 0.046, 0.08, 2.3, 8);
  const bootFoot = trapezoidPlateGeometry(0.09, 0.068, 0.12, 0.032);

  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    part(hip, thighGeo, mats.leather, { pos: [0, -legs.thigh * 0.46, 0.004] });
    part(knee, shinGeo, mats.charcoal, { pos: [0, -legs.shin * 0.52, 0.002] });
    part(knee, wrapBandGeometry(0.052, 0.05, 0.02, 2.15, 8), mats.gold, {
      pos: [0, -legs.shin * 0.26, 0.004],
      shadow: false,
    });
    part(knee, bootFoot, mats.charcoal, {
      pos: [0, -legs.shin - 0.012, 0.03],
      rot: [Math.PI / 2, 0, 0],
    });
  }
}

function addBomberBracers(armL, armR, mats) {
  const bracerGeo = wrapBandGeometry(0.044, 0.04, 0.08, 2.2, 8);
  const cuffGeo = wrapBandGeometry(0.046, 0.044, 0.018, 2.1, 8);
  const gloveGeo = wrapBandGeometry(0.042, 0.04, 0.034, 2.2, 8);
  part(armL.pivot, bracerGeo, mats.leather, { pos: [0, -0.148, 0.003] });
  part(armR.pivot, bracerGeo, mats.leather, { pos: [0, -0.148, 0.003] });
  part(armL.pivot, cuffGeo, mats.steel, { pos: [0, -0.118, 0.004], shadow: false });
  part(armR.pivot, cuffGeo, mats.steel, { pos: [0, -0.118, 0.004], shadow: false });
  part(armL.hand, gloveGeo, mats.charcoal, { pos: [0, -0.002, 0.003] });
  part(armR.hand, gloveGeo, mats.charcoal, { pos: [0, -0.002, 0.003] });
}

function buildBomber(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.086, legLength: 0.11, boots: false });
  addBomberLegKit(legs, mats);

  const torso = new THREE.Group();
  torso.position.set(0, 0.42, 0);
  part(torso, cached('bomber-belly', () => new THREE.SphereGeometry(0.168, 10, 8)), mats.armor, {
    scale: [1, 0.92, 0.88],
  });
  addBomberKit(torso, mats);
  group.add(torso);
  addBomberShoulders(group, mats);

  const armL = addArm(group, mats, -1, { shoulderX: 0.165, shoulderY: 0.5, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.165, shoulderY: 0.5, sleeveMat: mats.armorDeep });
  addBomberBracers(armL, armR, mats);

  const head = addHead(group, mats, { y: 0.66, radius: 0.106 });
  const eyes = addEyes(head, mats, { y: -0.046, z: 0.094, spread: 0.042, size: 0.013, socket: false });
  addBomberHelm(head, mats);

  const bomb = buildBomberBomb(mats);
  bomb.group.position.set(0, -0.028, 0.058);
  bomb.group.rotation.set(-0.18, 0.08, 0);
  armR.hand.add(bomb.group);
  armR.pivot.rotation.set(-0.7, 0, 0.2);
  armL.pivot.rotation.set(0.12, 0, -0.24);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    bomb: bomb.group,
    spark: bomb.spark,
  };
}

// Feathers are laid flat in the XZ plane and fanned by a parent pivot, so sweep
// and droop compose in the order a wing actually needs them.
function addWingFeather(wing, geometry, material, { yaw, droop = 0, x, y = 0, z = 0 }) {
  const pivot = new THREE.Group();
  pivot.rotation.set(0, yaw, droop);
  part(pivot, geometry, material, { pos: [x, y, z], rot: [-Math.PI / 2, 0, 0], shadow: false });
  wing.add(pivot);
  return pivot;
}

// Built once reaching along +X; the left wing is the same group mirrored, which
// keeps the flap animation exactly symmetric.
function buildEagleWing(mats) {
  const wing = new THREE.Group();

  part(wing, cached('eagle-shoulder', () =>
    new THREE.SphereGeometry(0.072, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.7)
  ), mats.armor, {
    pos: [0.05, 0.004, -0.008],
    rot: [0, 0, -0.4],
    scale: [1.55, 0.52, 1.22],
  });
  part(wing, wrapBandGeometry(0.058, 0.052, 0.028, 2.1, 8), mats.steel, {
    pos: [0.062, 0, 0.006],
    rot: [0, 0, Math.PI / 2],
  });
  part(wing, cached('eagle-radius', () => new THREE.CapsuleGeometry(0.022, 0.15, 3, 6)), mats.armorDeep, {
    pos: [0.16, -0.004, 0.012],
    rot: [0, 0, Math.PI / 2],
  });
  part(wing, cached('eagle-ulna', () => new THREE.CapsuleGeometry(0.016, 0.1, 3, 6)), mats.armor, {
    pos: [0.22, -0.016, 0.02],
    rot: [0.15, 0, Math.PI / 2 + 0.18],
  });

  const primaries = 4;
  for (let i = 0; i < primaries; i++) {
    const p = i / (primaries - 1);
    addWingFeather(wing, eagleFeatherGeometry(0.28 - p * 0.05, 0.09, 0.014), i % 2 ? mats.armorDeep : mats.armor, {
      yaw: 0.2 + p * 0.68,
      droop: -0.06 - p * 0.15,
      x: 0.15,
      y: -0.006 - p * 0.005,
    });
  }

  const secondaries = 3;
  for (let i = 0; i < secondaries; i++) {
    const p = i / (secondaries - 1);
    addWingFeather(wing, eagleFeatherGeometry(0.16 - p * 0.035, 0.075, 0.013), i % 2 ? mats.armor : mats.armorDeep, {
      yaw: 0.88 + p * 0.38,
      droop: -0.03,
      x: 0.055 + p * 0.06,
      y: -0.004,
    });
  }

  for (let i = 0; i < 2; i++) {
    const p = i;
    addWingFeather(wing, eagleFeatherGeometry(0.09 - p * 0.015, 0.055, 0.012), mats.trim, {
      yaw: 0.4 + p * 0.45,
      droop: 0.05,
      x: 0.05 + p * 0.045,
      y: 0.026,
    });
  }

  return wing;
}

function eagleBeakGeometry() {
  return cached('eagle-beak-profile', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.02);
    shape.lineTo(0.1, 0.014);
    shape.quadraticCurveTo(0.152, 0.006, 0.158, -0.03);
    shape.quadraticCurveTo(0.142, -0.062, 0.108, -0.052);
    shape.lineTo(0.058, -0.012);
    shape.lineTo(0, -0.006);
    shape.lineTo(0, 0.02);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.044,
      bevelEnabled: false,
      curveSegments: 3,
    });
    geometry.translate(0, 0, -0.022);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function eagleMandibleGeometry() {
  return cached('eagle-mandible-profile', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.004);
    shape.lineTo(0.078, 0);
    shape.quadraticCurveTo(0.1, -0.008, 0.092, -0.02);
    shape.lineTo(0, -0.012);
    shape.lineTo(0, 0.004);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.03,
      bevelEnabled: false,
      curveSegments: 2,
    });
    geometry.translate(0, 0, -0.015);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function addEagleHead(parent, mats) {
  const head = new THREE.Group();
  head.position.set(0, 0.568, 0.228);
  part(head, cached('eagle-skull', () => new THREE.SphereGeometry(0.1, 10, 8)), mats.trim, {
    scale: [0.88, 0.82, 1.18],
  });
  part(head, wrapBandGeometry(0.094, 0.088, 0.03, 2.05, 8), mats.armorDeep, {
    pos: [0, 0.03, 0.014],
  });
  const browGeo = trapezoidPlateGeometry(0.048, 0.03, 0.032, 0.014);
  for (const side of [-1, 1]) {
    part(head, browGeo, mats.charcoal, {
      pos: [side * 0.04, 0.036, 0.082],
      rot: [0.48, side * -0.28, side * 0.2],
    });
  }
  part(head, cached('eagle-cere', () => new THREE.CylinderGeometry(0.028, 0.034, 0.032, 8)), mats.gold, {
    pos: [0, 0.004, 0.092],
    rot: [Math.PI / 2 - 0.12, 0, 0],
    scale: [1.15, 0.7, 1],
  });
  const nareGeo = cached('eagle-nare', () => new THREE.CylinderGeometry(0.006, 0.006, 0.01, 6));
  for (const side of [-1, 1]) {
    part(head, nareGeo, mats.charcoal, {
      pos: [side * 0.014, 0.01, 0.108],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
  }
  part(head, eagleBeakGeometry(), mats.gold, {
    pos: [0, -0.004, 0.1],
    rot: [0.08, Math.PI / 2, 0],
  });
  part(head, eagleMandibleGeometry(), mats.gold, {
    pos: [0, -0.02, 0.096],
    rot: [0.18, Math.PI / 2, 0],
  });
  const eyes = addEyes(head, mats, { z: 0.094, y: 0.014, spread: 0.05, size: 0.018 });
  const crestGeo = eagleFeatherGeometry(0.074, 0.028, 0.008);
  part(head, crestGeo, mats.armorDeep, {
    pos: [0, 0.07, -0.036],
    rot: [-1.05, 0, 0],
    shadow: false,
  });
  part(head, crestGeo, mats.armor, {
    pos: [0.016, 0.066, -0.03],
    rot: [-0.95, 0.4, 0.18],
    shadow: false,
  });
  part(head, crestGeo, mats.armor, {
    pos: [-0.016, 0.066, -0.03],
    rot: [-0.95, -0.4, -0.18],
    shadow: false,
  });
  parent.add(head);
  return { head, eyes };
}

function addEagleTalons(parent, mats) {
  const shankWrap = wrapBandGeometry(0.032, 0.028, 0.022, 2.2, 8);
  const toeGeo = cached('eagle-talon', () => new THREE.ConeGeometry(0.016, 0.086, 5));
  const hookGeo = cached('eagle-talon-hook', () => new THREE.ConeGeometry(0.01, 0.036, 5));
  const toes = [
    [0.038, 0.058, 0.62],
    [-0.038, 0.058, 0.62],
    [0, 0.072, 0.82],
    [0.01, -0.052, -0.95],
  ];

  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    foot.position.set(side * 0.078, 0.198, 0.058);
    part(foot, cached('eagle-shank', () => new THREE.CylinderGeometry(0.022, 0.03, 0.08, 6)), mats.gold, {
      pos: [0, 0.036, 0],
    });
    part(foot, shankWrap, mats.armorDeep, { pos: [0, 0.048, 0.004] });
    part(foot, shankWrap, mats.armorDeep, { pos: [0, 0.022, 0.004] });
    part(foot, cached('eagle-ankle', () => new THREE.SphereGeometry(0.026, 8, 6)), mats.gold, {
      pos: [0, 0, 0.006],
    });
    part(foot, cached('eagle-pad', () => new THREE.SphereGeometry(0.022, 8, 6)), mats.charcoal, {
      pos: [0, -0.012, 0.01],
      scale: [1.2, 0.45, 1.15],
    });
    for (const [tx, tz, tilt] of toes) {
      part(foot, toeGeo, mats.gold, { pos: [tx, -0.014, tz], rot: [tilt, 0, 0] });
      part(foot, hookGeo, mats.steel, {
        pos: [tx, -0.048, tz + (tilt > 0 ? 0.034 : -0.026)],
        rot: [tilt > 0 ? 1.62 : -1.62, 0, 0],
        shadow: false,
      });
    }
    parent.add(foot);
  }
}

function buildEagle(mats) {
  const group = new THREE.Group();

  const torso = new THREE.Group();
  torso.position.set(0, 0.38, -0.01);
  part(torso, cached('eagle-body', () => new THREE.SphereGeometry(0.188, 10, 8)), mats.armorDeep, {
    scale: [0.74, 0.98, 1.5],
    rot: [0.2, 0, 0],
  });
  part(torso, wrapBandGeometry(0.15, 0.138, 0.12, 2.15, 8), mats.armor, {
    pos: [0, 0.02, 0.04],
    rot: [0.25, 0, 0],
    scale: [0.86, 1, 1.15],
  });
  part(torso, cached('eagle-keel', () => new THREE.BoxGeometry(0.02, 0.1, 0.016)), mats.steel, {
    pos: [0, 0.01, 0.14],
    rot: [0.35, 0, 0],
    shadow: false,
  });
  group.add(torso);

  const chest = new THREE.Group();
  chest.position.set(0, 0.4, 0.15);
  part(chest, cached('eagle-chest', () => new THREE.SphereGeometry(0.136, 10, 8)), mats.armor, {
    scale: [0.84, 1.18, 0.68],
  });
  part(chest, wrapBandGeometry(0.12, 0.11, 0.08, 2.0, 8), mats.trim, {
    pos: [0, -0.01, 0.02],
    scale: [0.9, 1, 0.7],
  });
  const breastGeo = cached('eagle-breast-feather', () => eagleFeatherGeometry(0.062, 0.04, 0.008));
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    part(chest, breastGeo, mats.trim, {
      pos: [side * 0.028, -0.018, 0.072],
      rot: [1.15, side * 0.28, 0],
      shadow: false,
    });
  }
  group.add(chest);

  part(group, cached('eagle-neck', () => new THREE.CapsuleGeometry(0.055, 0.06, 4, 8)), mats.trim, {
    pos: [0, 0.52, 0.14],
    rot: [0.55, 0, 0],
  });
  const ruffGeo = cached('eagle-ruff', () => eagleFeatherGeometry(0.068, 0.044, 0.009));
  for (let i = 0; i < 6; i++) {
    const angle = -0.85 + (i / 5) * 1.7;
    part(group, ruffGeo, i % 2 ? mats.trim : mats.armor, {
      pos: [Math.sin(angle) * 0.112, 0.5, 0.108 + Math.cos(angle) * 0.052],
      rot: [-Math.PI / 2 + 1.12, angle, 0],
      shadow: false,
    });
  }

  const { head, eyes } = addEagleHead(group, mats);

  const wings = {};
  for (const side of [-1, 1]) {
    const wing = buildEagleWing(mats);
    wing.position.set(side * 0.1, 0.45, 0);
    wing.rotation.z = side * 0.4;
    wing.scale.x = side;
    group.add(wing);
    wings[side < 0 ? 'left' : 'right'] = wing;
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.27, -0.28);
  tail.rotation.x = 0.16;
  for (let i = 0; i < 4; i++) {
    const spread = (i / 3 - 0.5) * 0.88;
    const pivot = new THREE.Group();
    pivot.rotation.set(0, Math.PI / 2 + spread, -0.16);
    part(pivot, eagleFeatherGeometry(0.21 - Math.abs(spread) * 0.05, 0.07, 0.012), i % 2 ? mats.trim : mats.steel, {
      pos: [0.02, 0, 0],
      rot: [-Math.PI / 2, 0, 0],
      shadow: false,
    });
    tail.add(pivot);
  }
  group.add(tail);
  addEagleTalons(group, mats);

  return {
    group,
    torso,
    chest,
    head,
    wingL: wings.left,
    wingR: wings.right,
    eyes,
  };
}

// A wheeled field gun disappears next to a 0.7-tall soldier, so the artillery
// class carries a shoulder bombard instead: the barrel doubles as its
// silhouette and it aims with the right arm.
function buildBombard(mats) {
  const cannon = new THREE.Group();
  part(cannon, cached('bombard-tube', () => new THREE.CylinderGeometry(0.09, 0.07, 0.42, 8)), mats.steel, {
    pos: [0, 0.08, 0],
  });
  part(cannon, cached('bombard-reinforce', () => new THREE.CylinderGeometry(0.1, 0.086, 0.1, 8)), mats.armorDeep, {
    pos: [0, -0.03, 0],
  });
  part(cannon, cached('bombard-mouth', () => new THREE.CylinderGeometry(0.118, 0.09, 0.07, 8)), mats.gold, {
    pos: [0, 0.318, 0],
  });
  part(cannon, cached('bombard-bore', () => new THREE.CylinderGeometry(0.07, 0.07, 0.03, 6)), mats.charcoal, {
    pos: [0, 0.348, 0],
    shadow: false,
  });
  part(cannon, cached('bombard-shot', () => new THREE.SphereGeometry(0.048, 8, 6)), mats.charcoal, {
    pos: [0, 0.3, 0],
    shadow: false,
  });
  const bandGeo = cached('bombard-band', () => new THREE.TorusGeometry(0.092, 0.014, 5, 10));
  part(cannon, bandGeo, mats.gold, { pos: [0, 0.2, 0], rot: [-Math.PI / 2, 0, 0] });
  part(cannon, bandGeo, mats.gold, { pos: [0, 0.08, 0], rot: [-Math.PI / 2, 0, 0] });
  part(cannon, cached('bombard-trunnion', () => new THREE.CylinderGeometry(0.016, 0.016, 0.14, 6)), mats.steel, {
    pos: [0, 0.03, 0],
    rot: [0, 0, Math.PI / 2],
  });
  part(cannon, cached('bombard-breech', () => new THREE.CylinderGeometry(0.086, 0.094, 0.09, 8)), mats.charcoal, {
    pos: [0, -0.14, 0],
  });
  part(cannon, cached('bombard-breech-cap', () => new THREE.CylinderGeometry(0.055, 0.05, 0.024, 8)), mats.gold, {
    pos: [0, -0.192, 0],
  });
  part(cannon, cached('bombard-vent', () => new THREE.SphereGeometry(0.016, 6, 6)), mats.ember, {
    pos: [0, -0.1, 0.086],
    shadow: false,
  });
  part(cannon, cached('bombard-glow', () => new THREE.CylinderGeometry(0.04, 0.04, 0.02, 6)), mats.ember, {
    pos: [0, 0.355, 0],
    shadow: false,
  });
  part(cannon, trapezoidPlateGeometry(0.08, 0.1, 0.24, 0.055), mats.wood, {
    pos: [0, -0.16, -0.012],
    rot: [0.18, 0, 0],
  });
  part(cannon, cached('bombard-grip', () => new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6)), mats.wood, {
    pos: [0, 0.02, 0.1],
    rot: [0, 0, Math.PI / 2],
  });
  part(cannon, cached('bombard-sight', () => new THREE.BoxGeometry(0.016, 0.036, 0.02)), mats.charcoal, {
    pos: [0, 0.22, 0.09],
    shadow: false,
  });
  return cannon;
}

function buildLinstock(mats) {
  const stick = new THREE.Group();
  part(stick, cached('linstock-shaft', () => new THREE.CylinderGeometry(0.01, 0.012, 0.16, 6)), mats.wood, {
    pos: [0, 0.06, 0],
  });
  part(stick, cached('linstock-fork', () => new THREE.BoxGeometry(0.032, 0.014, 0.014)), mats.steel, {
    pos: [0, 0.14, 0],
  });
  part(stick, cached('linstock-ember', () => new THREE.SphereGeometry(0.018, 8, 6)), mats.ember, {
    pos: [0, 0.162, 0],
    shadow: false,
  });
  return stick;
}

function buildShellRack(mats) {
  const rack = new THREE.Group();
  part(rack, cached('shell-rack', () => new THREE.BoxGeometry(0.16, 0.08, 0.08)), mats.leather);
  const shellGeo = cached('shell-ball-lg', () => new THREE.SphereGeometry(0.038, 8, 6));
  for (const x of [-0.05, 0, 0.05]) {
    part(rack, shellGeo, mats.charcoal, { pos: [x, 0.05, 0.01] });
  }
  part(rack, cached('shell-rack-band', () => new THREE.BoxGeometry(0.17, 0.02, 0.086)), mats.gold, {
    pos: [0, 0.01, 0],
    shadow: false,
  });
  return rack;
}

function addArtilleryHelm(head, mats) {
  part(head, cached('artillery-helm-bowl', () => new THREE.CylinderGeometry(0.114, 0.124, 0.12, 8)), mats.armor, {
    pos: [0, 0.03, 0],
    scale: [1, 1, 0.92],
  });
  part(head, cached('artillery-helm-crown', () => new THREE.CylinderGeometry(0.114, 0.114, 0.03, 8)), mats.armor, {
    pos: [0, 0.104, 0],
    scale: [1, 1, 0.92],
  });
  part(head, cached('artillery-helm-brim', () => new THREE.CylinderGeometry(0.16, 0.15, 0.02, 8)), mats.armorDeep, {
    pos: [0, -0.02, 0.01],
    scale: [1, 1, 0.9],
  });
  part(head, wrapBandGeometry(0.118, 0.114, 0.05, 2.3, 8), mats.charcoal, {
    pos: [0, 0.004, 0.006],
  });
  part(head, cached('artillery-visor-glow', () => new THREE.BoxGeometry(0.09, 0.012, 0.01)), mats.ember, {
    pos: [0, 0.01, 0.118],
    shadow: false,
  });
  part(head, trapezoidPlateGeometry(0.014, 0.028, 0.07, 0.014), mats.trim, {
    pos: [0, 0.13, -0.01],
    rot: [0.2, 0, 0],
  });
  part(head, cached('artillery-helm-band', () => new THREE.TorusGeometry(0.118, 0.01, 5, 10)), mats.trim, {
    pos: [0, 0.062, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 0.9, 1],
    shadow: false,
  });
}

function addArtilleryKit(torso, mats) {
  part(torso, wrapBandGeometry(0.17, 0.152, 0.18, 2.25, 10), mats.armor, {
    pos: [0, 0.018, 0],
    scale: [1.04, 1, 0.82],
  });
  part(torso, wrapBandGeometry(0.166, 0.154, 0.08, 1.95, 8), mats.steel, {
    pos: [0, 0.042, 0],
    scale: [1.02, 1, 0.84],
  });
  part(torso, trapezoidPlateGeometry(0.05, 0.08, 0.07, 0.016), mats.trim, {
    pos: [0, 0.04, 0.138],
  });
  part(torso, cached('artillery-sash', () => new THREE.CylinderGeometry(0.016, 0.016, 0.26, 6)), mats.leather, {
    pos: [-0.02, 0.016, 0.108],
    rot: [0, 0, -0.4],
  });
  part(torso, cached('artillery-belt', () => new THREE.CylinderGeometry(0.136, 0.136, 0.042, 12)), mats.leather, {
    pos: [0, -0.095, 0],
    scale: [1.04, 1, 0.82],
  });
  part(torso, cached('artillery-buckle', () => new THREE.CylinderGeometry(0.022, 0.022, 0.014, 6)), mats.gold, {
    pos: [0, -0.095, 0.116],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(torso, trapezoidPlateGeometry(0.16, 0.2, 0.16, 0.018), mats.leather, {
    pos: [0, -0.155, 0.118],
    rot: [0.1, 0, 0],
  });
  part(torso, cached('artillery-horn', () => new THREE.CylinderGeometry(0.02, 0.034, 0.1, 7)), mats.charcoal, {
    pos: [0.122, -0.078, 0.052],
    rot: [0.35, 0.28, 0.48],
  });
  part(torso, cached('artillery-horn-cap', () => new THREE.CylinderGeometry(0.016, 0.016, 0.016, 6)), mats.gold, {
    pos: [0.164, -0.036, 0.072],
    rot: [0.35, 0.28, 0.48],
    shadow: false,
  });
}

function addArtilleryLegKit(legs, mats) {
  const thighGeo = wrapBandGeometry(0.058, 0.052, 0.09, 2.1, 8);
  const kneeGeo = cached('artillery-knee', () =>
    new THREE.SphereGeometry(0.034, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const greaveGeo = wrapBandGeometry(0.052, 0.046, 0.11, 2.3, 8);
  const bootFoot = trapezoidPlateGeometry(0.1, 0.074, 0.13, 0.034);

  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    part(hip, thighGeo, mats.armor, { pos: [0, -legs.thigh * 0.46, 0.006] });
    part(knee, kneeGeo, mats.steel, {
      pos: [0, 0.002, 0.03],
      scale: [1.15, 0.6, 1],
    });
    part(knee, greaveGeo, mats.armorDeep, { pos: [0, -legs.shin * 0.52, 0.004] });
    part(knee, bootFoot, mats.armor, {
      pos: [0, -legs.shin - 0.014, 0.032],
      rot: [Math.PI / 2, 0, 0],
    });
  }
}

function addArtilleryShoulders(parent, mats) {
  const capGeo = cached('artillery-pauldron-cap', () =>
    new THREE.SphereGeometry(0.092, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const lameGeo = cached('artillery-pauldron-lame', () =>
    new THREE.SphereGeometry(0.088, 8, 6, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.24)
  );
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.178, 0.565, 0.008);
    pad.rotation.z = side * -0.28;
    part(pad, capGeo, mats.armor, { scale: [1.16, 0.58, 1.08] });
    part(pad, lameGeo, mats.steel, {
      pos: [0, -0.014, 0],
      scale: [1.18, 0.72, 1.1],
    });
    parent.add(pad);
  }
}

function addArtilleryCape(parent, mats) {
  const cape = new THREE.Group();
  cape.position.set(0, 0.5, -0.05);
  part(cape, cached('artillery-cape', () =>
    new THREE.CylinderGeometry(0.16, 0.22, 0.28, 12, 2, true, Math.PI * 0.7, Math.PI * 0.6)
  ), mats.leather, {
    pos: [0, -0.08, -0.01],
  });
  parent.add(cape);
}

function addArtilleryBracers(armL, armR, mats) {
  part(armR.pivot, wrapBandGeometry(0.05, 0.044, 0.11, 2.3, 8), mats.steel, {
    pos: [0, -0.15, 0.004],
  });
  part(armL.pivot, wrapBandGeometry(0.048, 0.042, 0.1, 2.25, 8), mats.armorDeep, {
    pos: [0, -0.15, 0.004],
  });
  part(armL.hand, wrapBandGeometry(0.044, 0.04, 0.042, 2.3, 8), mats.leather, {
    pos: [0, -0.002, 0.004],
  });
}

function buildArtillery(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.095, legLength: 0.13, boots: false });
  addArtilleryLegKit(legs, mats);
  const torso = addTorso(group, mats, { width: 1.16, height: 0.28, y: 0.44, fittings: false });
  addArtilleryKit(torso, mats);
  addArtilleryShoulders(group, mats);
  addArtilleryCape(group, mats);
  const armL = addArm(group, mats, -1, { shoulderX: 0.185, shoulderY: 0.545, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.185, shoulderY: 0.545, sleeveMat: mats.armorDeep });
  addArtilleryBracers(armL, armR, mats);
  const head = addHead(group, mats, { y: 0.7, radius: 0.096 });
  const eyes = addEyes(head, mats, { y: 0.006, z: 0.094, size: 0.013 });
  addArtilleryHelm(head, mats);

  const cannon = buildBombard(mats);
  // Braced against the right shoulder and canted up-forward, so the charge
  // animation on armR reads as raising the barrel to fire.
  cannon.position.set(0.02, 0.03, 0.06);
  cannon.rotation.set(1.88, -0.16, -0.04);
  cannon.scale.setScalar(1.28);
  armR.hand.add(cannon);
  armR.pivot.rotation.set(-0.72, 0.06, 0.18);

  const linstock = buildLinstock(mats);
  linstock.position.set(0.12, -0.02, 0.08);
  linstock.rotation.set(0.5, 0.2, 1.1);
  torso.add(linstock);

  const rack = buildShellRack(mats);
  rack.position.set(0, 0.46, -0.14);
  rack.rotation.set(0.18, 0, 0);
  group.add(rack);

  armL.pivot.rotation.set(-0.95, 0.1, 0.55);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    cannon,
    weapon: cannon,
  };
}

// Compact bolt thrower for the arrow tower deck.
function buildBallista(mats) {
  const ballista = new THREE.Group();
  part(ballista, cached('ballista-mount', () => new THREE.CylinderGeometry(0.042, 0.048, 0.04, 8)), mats.armorDeep, {
    pos: [0, 0.02, 0],
  });
  part(ballista, cached('ballista-stock', () => new THREE.BoxGeometry(0.042, 0.038, 0.22)), mats.wood, {
    pos: [0, 0.062, 0.05],
    rot: [-0.14, 0, 0],
  });
  part(ballista, cached('ballista-winch', () => new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6)), mats.steel, {
    pos: [0, 0.07, 0.01],
    rot: [0, 0, Math.PI / 2],
  });
  const limbGeo = cached('ballista-limb', () => new THREE.BoxGeometry(0.12, 0.02, 0.022));
  part(ballista, limbGeo, mats.wood, {
    pos: [0.07, 0.078, 0.09],
    rot: [0, 0.18, 0.22],
  });
  part(ballista, limbGeo, mats.wood, {
    pos: [-0.07, 0.078, 0.09],
    rot: [0, -0.18, -0.22],
  });
  part(ballista, cached('ballista-string', () => new THREE.BoxGeometry(0.2, 0.006, 0.006)), mats.trim, {
    pos: [0, 0.086, 0.062],
    shadow: false,
  });
  part(ballista, cached('ballista-bolt', () => new THREE.CylinderGeometry(0.01, 0.01, 0.2, 5)), mats.wood, {
    pos: [0, 0.086, 0.135],
    rot: [Math.PI / 2 - 0.14, 0, 0],
  });
  part(ballista, cached('ballista-tip', () => new THREE.ConeGeometry(0.022, 0.055, 6)), mats.steel, {
    pos: [0, 0.1, 0.238],
    rot: [Math.PI / 2 - 0.14, 0, 0],
  });
  part(ballista, cached('ballista-fletch', () => new THREE.ConeGeometry(0.016, 0.036, 4)), mats.trim, {
    pos: [0, 0.074, 0.042],
    rot: [Math.PI / 2 - 0.14, 0, 0],
    shadow: false,
  });
  return ballista;
}

function buildTower(mats) {
  const group = new THREE.Group();

  part(group, cached('arrow-tower-foot', () => new THREE.BoxGeometry(0.66, 0.08, 0.66)), mats.armorDeep, {
    pos: [0, 0.04, 0],
  });
  part(group, cached('arrow-tower-step', () => new THREE.BoxGeometry(0.22, 0.04, 0.12)), mats.armorDeep, {
    pos: [0, 0.06, 0.36],
  });
  part(group, cached('arrow-tower-plinth', () => new THREE.BoxGeometry(0.56, 0.08, 0.56)), mats.armor, {
    pos: [0, 0.12, 0],
  });
  part(group, cached('arrow-tower-shaft-low', () => new THREE.BoxGeometry(0.46, 0.22, 0.46)), mats.armor, {
    pos: [0, 0.27, 0],
  });
  part(group, cached('arrow-tower-band', () => new THREE.BoxGeometry(0.5, 0.04, 0.5)), mats.trim, {
    pos: [0, 0.39, 0],
  });
  part(group, cached('arrow-tower-shaft-high', () => new THREE.BoxGeometry(0.4, 0.22, 0.4)), mats.armor, {
    pos: [0, 0.52, 0],
  });

  const pilasterGeo = cached('arrow-tower-pilaster', () => new THREE.BoxGeometry(0.08, 0.46, 0.08));
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.22, 0.22]) {
      part(group, pilasterGeo, mats.armorDeep, { pos: [x, 0.39, z] });
    }
  }

  part(group, cached('arrow-tower-door-arch', () => new THREE.BoxGeometry(0.16, 0.2, 0.04)), mats.charcoal, {
    pos: [0, 0.22, 0.24],
  });
  part(group, cached('arrow-tower-door', () => new THREE.BoxGeometry(0.12, 0.16, 0.02)), mats.wood, {
    pos: [0, 0.21, 0.258],
  });
  part(group, cached('arrow-tower-lintel', () => new THREE.BoxGeometry(0.2, 0.04, 0.06)), mats.trim, {
    pos: [0, 0.33, 0.25],
  });

  const slitGeo = cached('arrow-tower-slit', () => new THREE.BoxGeometry(0.04, 0.12, 0.018));
  const glowGeo = cached('arrow-tower-slit-glow', () => new THREE.BoxGeometry(0.02, 0.08, 0.01));
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2;
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    part(group, slitGeo, mats.charcoal, { pos: [nx * 0.21, 0.52, nz * 0.21], rot: [0, yaw, 0] });
    part(group, glowGeo, mats.ember, {
      pos: [nx * 0.218, 0.52, nz * 0.218],
      rot: [0, yaw, 0],
      shadow: false,
    });
  }

  part(group, cached('arrow-tower-corbel', () => new THREE.BoxGeometry(0.56, 0.05, 0.56)), mats.armorDeep, {
    pos: [0, 0.645, 0],
  });
  part(group, cached('arrow-tower-deck', () => new THREE.BoxGeometry(0.62, 0.045, 0.62)), mats.armor, {
    pos: [0, 0.692, 0],
  });
  part(group, cached('arrow-tower-rail', () => new THREE.BoxGeometry(0.5, 0.03, 0.5)), mats.wood, {
    pos: [0, 0.73, 0],
    shadow: false,
  });

  const merlonGeo = cached('arrow-tower-merlon', () => new THREE.BoxGeometry(0.12, 0.14, 0.12));
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.25, 0.25]) {
      part(group, merlonGeo, mats.armorDeep, { pos: [x, 0.79, z] });
    }
  }
  const midMerlonGeo = cached('arrow-tower-merlon-mid', () => new THREE.BoxGeometry(0.16, 0.1, 0.07));
  part(group, midMerlonGeo, mats.armor, { pos: [0, 0.77, 0.275] });
  part(group, midMerlonGeo, mats.armor, { pos: [0, 0.77, -0.275] });
  part(group, cached('arrow-tower-merlon-side', () => new THREE.BoxGeometry(0.07, 0.1, 0.16)), mats.armor, {
    pos: [0.275, 0.77, 0],
  });
  part(group, cached('arrow-tower-merlon-side', () => new THREE.BoxGeometry(0.07, 0.1, 0.16)), mats.armor, {
    pos: [-0.275, 0.77, 0],
  });

  const torchGeo = cached('arrow-tower-torch', () => new THREE.CylinderGeometry(0.012, 0.016, 0.07, 6));
  const flameGeo = cached('arrow-tower-flame', () => new THREE.SphereGeometry(0.02, 8, 6));
  for (const x of [-0.18, 0.18]) {
    part(group, torchGeo, mats.wood, { pos: [x, 0.36, 0.25] });
    part(group, flameGeo, mats.ember, { pos: [x, 0.41, 0.25], shadow: false });
  }

  const turret = new THREE.Group();
  turret.position.y = 0.715;
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2;
    const ballista = buildBallista(mats);
    ballista.position.set(Math.sin(yaw) * 0.175, 0, Math.cos(yaw) * 0.175);
    ballista.rotation.y = yaw;
    turret.add(ballista);
  }
  group.add(turret);

  part(group, cached('arrow-tower-mast', () => new THREE.CylinderGeometry(0.014, 0.016, 0.32, 8)), mats.wood, {
    pos: [0, 0.9, 0],
  });
  part(group, cached('arrow-tower-finial', () => new THREE.OctahedronGeometry(0.036, 0)), mats.gold, {
    pos: [0, 1.08, 0],
    shadow: false,
  });
  part(group, cached('arrow-tower-pennant', () => new THREE.BoxGeometry(0.006, 0.12, 0.2)), mats.ring, {
    pos: [0, 0.99, 0.11],
    shadow: false,
  });

  return { group, turret };
}

function buildCastle(mats) {
  const group = new THREE.Group();

  part(group, cached('castle-foot', () => new THREE.BoxGeometry(0.8, 0.08, 0.8)), mats.armorDeep, {
    pos: [0, 0.04, 0],
  });
  part(group, cached('castle-plinth', () => new THREE.BoxGeometry(0.72, 0.08, 0.72)), mats.armor, {
    pos: [0, 0.12, 0],
  });
  part(group, cached('castle-yard', () => new THREE.BoxGeometry(0.42, 0.02, 0.42)), mats.charcoal, {
    pos: [0, 0.165, 0],
    shadow: false,
  });

  const wallH = 0.28;
  const wallY = 0.16 + wallH / 2;
  const wallThick = 0.1;
  const wallSpan = 0.66;
  const wallCapY = 0.16 + wallH + 0.02;
  const wallCapNS = cached('castle-wall-cap-ns', () => new THREE.BoxGeometry(wallSpan, 0.04, wallThick + 0.02));
  const wallCapEW = cached('castle-wall-cap-ew', () => new THREE.BoxGeometry(wallThick + 0.02, 0.04, wallSpan - wallThick * 2));

  part(group, cached('castle-wall-n', () => new THREE.BoxGeometry(wallSpan, wallH, wallThick)), mats.armor, {
    pos: [0, wallY, -0.28],
  });
  part(group, cached('castle-wall-s', () => new THREE.BoxGeometry(wallSpan, wallH, wallThick)), mats.armor, {
    pos: [0, wallY, 0.28],
  });
  part(group, cached('castle-wall-w', () => new THREE.BoxGeometry(wallThick, wallH, wallSpan - wallThick * 2)), mats.armor, {
    pos: [-0.28, wallY, 0],
  });
  part(group, cached('castle-wall-e', () => new THREE.BoxGeometry(wallThick, wallH, wallSpan - wallThick * 2)), mats.armor, {
    pos: [0.28, wallY, 0],
  });
  part(group, wallCapNS, mats.trim, { pos: [0, wallCapY, -0.28] });
  part(group, wallCapNS, mats.trim, { pos: [0, wallCapY, 0.28] });
  part(group, wallCapEW, mats.trim, { pos: [-0.28, wallCapY, 0] });
  part(group, wallCapEW, mats.trim, { pos: [0.28, wallCapY, 0] });

  const wallMerlonGeo = cached('castle-wall-merlon', () => new THREE.BoxGeometry(0.07, 0.068, 0.068));
  for (const x of [-0.18, 0.18]) {
    part(group, wallMerlonGeo, mats.armorDeep, { pos: [x, wallCapY + 0.048, 0.28] });
    part(group, wallMerlonGeo, mats.armorDeep, { pos: [x, wallCapY + 0.048, -0.28] });
  }
  for (const z of [-0.12, 0.12]) {
    part(group, wallMerlonGeo, mats.armorDeep, { pos: [-0.28, wallCapY + 0.048, z] });
    part(group, wallMerlonGeo, mats.armorDeep, { pos: [0.28, wallCapY + 0.048, z] });
  }

  const slitGeo = cached('castle-slit', () => new THREE.BoxGeometry(0.028, 0.08, 0.02));
  const slitGlow = cached('castle-slit-glow', () => new THREE.BoxGeometry(0.018, 0.05, 0.012));
  for (const [x, z, yaw] of [
    [0.16, -0.332, 0],
    [-0.16, -0.332, 0],
    [0.332, 0, Math.PI / 2],
    [-0.332, 0, Math.PI / 2],
  ]) {
    part(group, slitGeo, mats.charcoal, { pos: [x, wallY + 0.02, z], rot: [0, yaw, 0] });
    part(group, slitGlow, mats.ember, { pos: [x, wallY + 0.02, z], rot: [0, yaw, 0], shadow: false });
  }

  part(group, cached('castle-gate-lintel', () => new THREE.BoxGeometry(0.24, 0.055, 0.08)), mats.trim, {
    pos: [0, 0.26, 0.3],
  });
  part(group, cached('castle-gate-arch', () => new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8, 1, false, 0, Math.PI)), mats.charcoal, {
    pos: [0, 0.25, 0.3],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  const gatePillarGeo = cached('castle-gate-pillar', () => new THREE.BoxGeometry(0.05, 0.26, 0.055));
  part(group, gatePillarGeo, mats.armorDeep, { pos: [-0.11, 0.22, 0.305] });
  part(group, gatePillarGeo, mats.armorDeep, { pos: [0.11, 0.22, 0.305] });

  const barV = cached('castle-port-bar-v', () => new THREE.BoxGeometry(0.012, 0.14, 0.01));
  const barH = cached('castle-port-bar-h', () => new THREE.BoxGeometry(0.12, 0.012, 0.01));
  for (const x of [-0.04, 0, 0.04]) {
    part(group, barV, mats.steel, { pos: [x, 0.18, 0.29], shadow: false });
  }
  for (const y of [0.14, 0.22]) {
    part(group, barH, mats.steel, { pos: [0, y, 0.29], shadow: false });
  }

  part(group, cached('castle-drawbridge', () => new THREE.BoxGeometry(0.2, 0.022, 0.14)), mats.wood, {
    pos: [0, 0.072, 0.38],
    rot: [0.16, 0, 0],
  });
  const plankGeo = cached('castle-plank', () => new THREE.BoxGeometry(0.2, 0.006, 0.028));
  for (const z of [-0.04, 0, 0.04]) {
    part(group, plankGeo, mats.leather, {
      pos: [0, 0.086, 0.38 + z],
      rot: [0.16, 0, 0],
      shadow: false,
    });
  }
  const chainGeo = cached('castle-chain', () => new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4));
  for (const x of [-0.07, 0.07]) {
    part(group, chainGeo, mats.steel, {
      pos: [x, 0.2, 0.34],
      rot: [0.85, 0, 0],
      shadow: false,
    });
  }

  const torchGeo = cached('castle-torch', () => new THREE.CylinderGeometry(0.012, 0.016, 0.07, 6));
  const flameGeo = cached('castle-torch-flame', () => new THREE.SphereGeometry(0.02, 6, 5));
  for (const x of [-0.17, 0.17]) {
    part(group, torchGeo, mats.wood, { pos: [x, 0.28, 0.322] });
    part(group, flameGeo, mats.ember, { pos: [x, 0.328, 0.322], shadow: false });
  }

  const cornerLow = cached('castle-corner-low', () => new THREE.CylinderGeometry(0.108, 0.118, 0.16, 8));
  const cornerMid = cached('castle-corner-mid', () => new THREE.CylinderGeometry(0.092, 0.104, 0.22, 8));
  const cornerBand = cached('castle-corner-band', () => new THREE.TorusGeometry(0.1, 0.012, 5, 8));
  const cornerCap = cached('castle-corner-cap', () => new THREE.ConeGeometry(0.11, 0.1, 8));
  const cornerMerlon = cached('castle-corner-merlon', () => new THREE.BoxGeometry(0.04, 0.05, 0.04));
  const cornerSlit = cached('castle-corner-slit', () => new THREE.BoxGeometry(0.02, 0.06, 0.016));
  for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
    part(group, cornerLow, mats.armorDeep, { pos: [x, 0.24, z] });
    part(group, cornerMid, mats.armor, { pos: [x, 0.42, z] });
    part(group, cornerBand, mats.trim, {
      pos: [x, 0.34, z],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
    part(group, cornerCap, mats.trim, { pos: [x, 0.62, z], shadow: false });
    part(group, cornerMerlon, mats.armorDeep, { pos: [x, 0.55, z + 0.07] });
    part(group, cornerSlit, mats.ember, { pos: [x, 0.44, z + (z > 0 ? 0.1 : -0.1)], shadow: false });
  }

  part(group, cached('castle-keep-base', () => new THREE.BoxGeometry(0.38, 0.1, 0.38)), mats.armorDeep, {
    pos: [0, 0.22, 0],
  });
  part(group, cached('castle-keep-body', () => new THREE.BoxGeometry(0.3, 0.4, 0.3)), mats.armor, {
    pos: [0, 0.48, 0],
  });
  part(group, cached('castle-keep-band', () => new THREE.BoxGeometry(0.33, 0.045, 0.33)), mats.trim, {
    pos: [0, 0.38, 0],
  });
  part(group, cached('castle-keep-roof', () => new THREE.ConeGeometry(0.22, 0.12, 8)), mats.armorDeep, {
    pos: [0, 0.8, 0],
  });
  const keepWindowGeo = cached('castle-keep-window', () => new THREE.BoxGeometry(0.048, 0.08, 0.016));
  for (const [x, z, yaw] of [
    [0, 0.158, 0],
    [0, -0.158, 0],
    [0.158, 0, Math.PI / 2],
    [-0.158, 0, Math.PI / 2],
  ]) {
    part(group, keepWindowGeo, mats.ember, {
      pos: [x, 0.54, z],
      rot: [0, yaw, 0],
      shadow: false,
    });
  }
  part(group, cached('castle-keep-door', () => new THREE.BoxGeometry(0.07, 0.1, 0.016)), mats.wood, {
    pos: [0, 0.34, 0.16],
  });
  const merlonGeo = cached('castle-keep-merlon', () => new THREE.BoxGeometry(0.07, 0.08, 0.07));
  for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
    part(group, merlonGeo, mats.armorDeep, { pos: [x, 0.74, z] });
  }
  part(group, cached('castle-crest', () => new THREE.BoxGeometry(0.1, 0.12, 0.016)), mats.ring, {
    pos: [0, 0.6, 0.158],
    shadow: false,
  });
  part(group, cached('castle-crest-cross-v', () => new THREE.BoxGeometry(0.016, 0.07, 0.008)), mats.gold, {
    pos: [0, 0.6, 0.168],
    shadow: false,
  });
  part(group, cached('castle-crest-cross-h', () => new THREE.BoxGeometry(0.05, 0.016, 0.008)), mats.gold, {
    pos: [0, 0.61, 0.168],
    shadow: false,
  });

  const banner = new THREE.Group();
  banner.position.set(0, 0.93, 0);
  part(banner, cached('castle-mast', () => new THREE.CylinderGeometry(0.014, 0.016, 0.36, 6)), mats.wood, {
    pos: [0, 0.1, 0],
  });
  part(banner, trapezoidPlateGeometry(0.16, 0.1, 0.2, 0.01), mats.ring, {
    pos: [0.1, 0.16, 0],
    rot: [0, Math.PI / 2, 0.12],
    shadow: false,
  });
  part(banner, cached('castle-finial', () => new THREE.OctahedronGeometry(0.032, 0)), mats.gold, {
    pos: [0, 0.3, 0],
    shadow: false,
  });
  group.add(banner);

  return { group, banner };
}

// Shoulders that flare out and then draw back into a trailing wisp, so the
// silhouette tapers instead of sitting on the tile like an egg.
function ghostShroudGeometry() {
  return cached('ghost-shroud-14', () => {
    const profile = [
      new THREE.Vector2(0.002, 0.3),
      new THREE.Vector2(0.075, 0.295),
      new THREE.Vector2(0.12, 0.275),
      new THREE.Vector2(0.148, 0.235),
      new THREE.Vector2(0.166, 0.18),
      new THREE.Vector2(0.175, 0.115),
      new THREE.Vector2(0.178, 0.055),
      new THREE.Vector2(0.165, 0.005),
      new THREE.Vector2(0.128, -0.04),
      new THREE.Vector2(0.075, -0.085),
      new THREE.Vector2(0.028, -0.13),
      new THREE.Vector2(0.0, -0.16),
    ];
    return new THREE.LatheGeometry(profile, 14);
  });
}

function ghostTatterGeometry() {
  return cached('ghost-tatter-strip', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.016, 0.1);
    shape.lineTo(0.016, 0.1);
    shape.lineTo(0.028, -0.06);
    shape.quadraticCurveTo(0.012, -0.12, 0, -0.1);
    shape.quadraticCurveTo(-0.018, -0.14, -0.026, -0.05);
    shape.lineTo(-0.016, 0.1);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.008,
      bevelEnabled: false,
      curveSegments: 2,
    });
    geometry.translate(0, 0, -0.004);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function buildGhost(mats) {
  const group = new THREE.Group();

  const base = mats.armor.userData.baseColor.clone();
  const gauze = standard(base.clone().lerp(new THREE.Color(0xffffff), 0.12), {
    roughness: 0.9,
    metalness: 0,
    emissive: base,
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  gauze.name = 'cloth';
  gauze.userData.preserveTransparent = true;
  const gauzeDeep = standard(base.clone().lerp(new THREE.Color(0x0b1220), 0.42), {
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  gauzeDeep.name = 'armorDeep';
  gauzeDeep.userData.preserveTransparent = true;
  const voidMat = standard(0x050a14, {
    roughness: 0.98,
    metalness: 0,
  });
  voidMat.name = 'charcoal';
  const extraMaterials = [gauze, gauzeDeep, voidMat];

  // The wraith floats, so the shroud starts well clear of the tile and the
  // torn hem tapers into the air rather than clipping through the ground.
  const torso = new THREE.Group();
  torso.position.set(0, 0.3, 0);
  group.add(torso);
  part(torso, ghostShroudGeometry(), gauze, { shadow: false });
  part(torso, ghostShroudGeometry(), gauzeDeep, {
    pos: [0, 0.012, 0],
    scale: [0.84, 0.9, 0.84],
    shadow: false,
  });
  part(torso, wrapBandGeometry(0.16, 0.148, 0.08, 2.15, 8), gauzeDeep, {
    pos: [0, 0.12, 0],
    scale: [1, 1, 0.82],
    shadow: false,
  });

  const tatterGeo = ghostTatterGeometry();
  const tatters = [
    [0.0, 1], [0.7, 0.72], [1.5, 1.08], [2.3, 0.78],
    [3.14, 1.02], [3.9, 0.68], [4.7, 0.92], [5.5, 0.74],
  ];
  for (const [angle, length] of tatters) {
    const r = 0.15;
    part(torso, tatterGeo, gauzeDeep, {
      pos: [Math.cos(angle) * r, -0.02, Math.sin(angle) * r],
      rot: [0.2 + Math.sin(angle) * 0.18, -angle, -Math.cos(angle) * 0.2],
      scale: [1.1, length, 1],
      shadow: false,
    });
  }
  part(torso, tatterGeo, gauze, {
    pos: [0.02, -0.04, -0.16],
    rot: [0.55, 0.15, 0.08],
    scale: [0.9, 1.35, 1],
    shadow: false,
  });
  part(torso, tatterGeo, gauze, {
    pos: [-0.04, -0.03, -0.15],
    rot: [0.48, -0.2, -0.1],
    scale: [0.85, 1.2, 1],
    shadow: false,
  });

  const linkGeo = cached('ghost-chain', () => new THREE.TorusGeometry(0.014, 0.004, 5, 8));
  for (let i = 0; i < 3; i++) {
    part(torso, linkGeo, mats.steel, {
      pos: [0.12, 0.08 - i * 0.032, 0.04],
      rot: [0.3, 0.4, i * 0.7],
      shadow: false,
    });
  }

  const head = new THREE.Group();
  head.position.set(0, 0.58, 0);
  group.add(head);
  part(head, cached('ghost-skull', () => new THREE.SphereGeometry(0.11, 10, 8)), gauze, {
    scale: [1, 1.06, 0.94],
    shadow: false,
  });
  part(head, cached('ghost-veil', () =>
    new THREE.SphereGeometry(0.122, 10, 7, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.62)
  ), gauzeDeep, {
    pos: [0, 0.01, -0.014],
    scale: [1.02, 0.96, 1.1],
    shadow: false,
  });
  part(head, cached('ghost-void', () => new THREE.SphereGeometry(0.096, 10, 8)), voidMat, {
    pos: [0, -0.006, 0.054],
    scale: [0.88, 0.94, 0.78],
    shadow: false,
  });
  const eyes = addEyes(head, mats, { y: 0.022, z: 0.114, spread: 0.046, size: 0.022 });
  part(head, trapezoidPlateGeometry(0.036, 0.05, 0.04, 0.012), voidMat, {
    pos: [0, -0.042, 0.1],
  });
  part(head, cached('ghost-mouth', () => new THREE.SphereGeometry(0.018, 8, 6)), mats.eye, {
    pos: [0, -0.044, 0.108],
    scale: [0.7, 1.2, 0.45],
    shadow: false,
  });
  part(head, wrapBandGeometry(0.1, 0.096, 0.024, 2.0, 8), gauzeDeep, {
    pos: [0, -0.02, 0.01],
    shadow: false,
  });

  const armGeo = cached('ghost-arm', () => new THREE.CapsuleGeometry(0.03, 0.15, 4, 8));
  const sleeveGeo = wrapBandGeometry(0.038, 0.03, 0.1, 2.2, 8);
  const clawGeo = cached('ghost-claw', () => new THREE.ConeGeometry(0.012, 0.07, 5));
  const arms = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.5, 0.016);
    pivot.rotation.set(-1.02, 0, side * 0.32);
    part(pivot, armGeo, gauze, { pos: [0, -0.088, 0], shadow: false });
    part(pivot, sleeveGeo, gauzeDeep, { pos: [0, -0.1, 0.004], shadow: false });
    part(pivot, tatterGeo, gauzeDeep, {
      pos: [side * 0.02, -0.12, -0.02],
      rot: [0.4, 0, side * 0.25],
      scale: [0.7, 0.7, 1],
      shadow: false,
    });
    for (const [x, tilt] of [[-0.016, 0.28], [0, 0.5], [0.016, 0.28]]) {
      part(pivot, clawGeo, gauzeDeep, {
        pos: [x, -0.2, 0.014],
        rot: [tilt, 0, x * 8],
        shadow: false,
      });
    }
    group.add(pivot);
    arms[side < 0 ? 'left' : 'right'] = pivot;
  }

  return {
    group,
    torso,
    head,
    armL: arms.left,
    armR: arms.right,
    eyes,
    extraMaterials,
  };
}

// Top-down is the board's default camera, so the carapace outline does most of the
// work: wide across, tapered at the front, with a spike at each shoulder.
function crabCarapaceShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.16);
  shape.bezierCurveTo(0.06, 0.157, 0.13, 0.135, 0.192, 0.082);
  shape.lineTo(0.272, 0.022);
  shape.bezierCurveTo(0.246, -0.07, 0.15, -0.148, 0, -0.162);
  shape.bezierCurveTo(-0.15, -0.148, -0.246, -0.07, -0.272, 0.022);
  shape.lineTo(-0.192, 0.082);
  shape.bezierCurveTo(-0.13, 0.135, -0.06, 0.157, 0, 0.16);
  return shape;
}

function crabCarapaceGeometry() {
  return cached('crab-carapace-plate', () => {
    const geometry = extrude(crabCarapaceShape(), 0.052, 0.014);
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function crabDomeGeometry() {
  return cached('crab-carapace-dome', () => {
    const geometry = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function crabArcGeometry(key, radius, tube, arc) {
  return cached(key, () => {
    const geometry = new THREE.TorusGeometry(radius, tube, 6, 16, arc);
    geometry.rotateZ(Math.PI / 2 - arc / 2);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  });
}

function buildCrabClaw(side, mats, shellMat, clawMat, clawDeepMat, jointMat, { crush = false } = {}) {
  const claw = new THREE.Group();
  claw.position.set(side * 0.185, 0.03, 0.1);
  claw.rotation.set(-0.34, side * 0.54, 0);
  const bulk = crush ? 1.18 : 0.92;

  part(claw, cached('crab-shoulder', () => new THREE.SphereGeometry(0.048, 8, 6)), jointMat, {
    scale: [1, 0.86, 1],
  });
  part(claw, cached('crab-merus', () => new THREE.CylinderGeometry(0.034, 0.044, 0.086, 8)), shellMat, {
    pos: [0, 0.004, 0.048],
    rot: [Math.PI / 2, 0, 0],
    scale: [bulk, 1, bulk],
  });
  part(claw, wrapBandGeometry(0.04, 0.038, 0.018, 2.2, 8), jointMat, {
    pos: [0, 0.004, 0.088],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const palm = new THREE.Group();
  palm.position.set(0, 0.016, 0.16);
  palm.rotation.set(0.1, side * -0.24, side * 0.42);
  claw.add(palm);
  part(palm, cached(`crab-palm-${crush ? 'crush' : 'cut'}`, () =>
    new THREE.SphereGeometry(crush ? 0.078 : 0.064, 8, 6)
  ), clawMat, {
    scale: [0.72, 0.92, 1.28],
  });
  part(palm, wrapBandGeometry(crush ? 0.07 : 0.058, crush ? 0.066 : 0.054, 0.02, 2.0, 8), mats.gold, {
    pos: [0, 0.01, 0.02],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const finger = trapezoidPlateGeometry(crush ? 0.028 : 0.02, crush ? 0.055 : 0.042, crush ? 0.1 : 0.12, crush ? 0.032 : 0.022);
  const toothGeo = cached('crab-tooth', () => new THREE.BoxGeometry(0.01, 0.01, 0.014));

  const upperPinch = new THREE.Group();
  upperPinch.position.set(0, crush ? 0.04 : 0.032, 0.055);
  upperPinch.rotation.set(-0.32, 0, 0);
  palm.add(upperPinch);
  part(upperPinch, finger, clawMat, {
    pos: [0, 0, 0.052],
    rot: [Math.PI / 2, 0, 0],
  });
  part(upperPinch, toothGeo, mats.gold, {
    pos: [0, -0.012, 0.07],
    shadow: false,
  });
  part(upperPinch, toothGeo, mats.gold, {
    pos: [0, -0.012, 0.092],
    shadow: false,
  });

  const lowerPinch = new THREE.Group();
  lowerPinch.position.set(0, crush ? -0.036 : -0.028, 0.055);
  lowerPinch.rotation.set(0.24, 0, 0);
  palm.add(lowerPinch);
  part(lowerPinch, finger, clawDeepMat, {
    pos: [0, 0, 0.046],
    rot: [Math.PI / 2, 0, 0],
    scale: [0.88, 0.88, 0.86],
  });
  part(lowerPinch, toothGeo, mats.gold, {
    pos: [0, 0.01, 0.078],
    shadow: false,
  });

  return claw;
}

function addCrabEyeStalk(parent, side, mats, shellMat) {
  const stalk = new THREE.Group();
  stalk.position.set(side * 0.066, 0.028, 0.05);
  stalk.rotation.set(-0.14, 0, side * -0.3);
  part(stalk, cached('crab-stalk', () => new THREE.CylinderGeometry(0.011, 0.016, 0.086, 6)), shellMat, {
    pos: [0, 0.043, 0],
  });
  part(stalk, cached('crab-eye-cup', () => new THREE.TorusGeometry(0.02, 0.005, 5, 8)), mats.gold, {
    pos: [0, 0.096, 0.012],
    rot: [0.4, 0, 0],
    shadow: false,
  });
  const eye = part(stalk, cached('crab-eyeball', () => new THREE.SphereGeometry(0.022, 8, 6)), mats.eye, {
    pos: [0, 0.102, 0.014],
    shadow: false,
  });
  parent.add(stalk);
  return { stalk, eye };
}

function addCrabLeg(parent, side, z, fan, splay, mats, legMat) {
  const leg = new THREE.Group();
  leg.position.set(side * 0.2, -0.012, z);
  leg.rotation.set(0, side * fan, side * splay);
  parent.add(leg);

  part(leg, cached('crab-leg-femur', () => new THREE.CylinderGeometry(0.017, 0.023, 0.11, 6)), legMat, {
    pos: [0, -0.055, 0],
  });
  part(leg, wrapBandGeometry(0.022, 0.02, 0.016, 2.2, 8), mats.gold, {
    pos: [0, -0.03, 0.004],
    shadow: false,
  });

  const knee = new THREE.Group();
  knee.position.set(0, -0.11, 0);
  knee.rotation.z = side * -(splay + 0.16);
  leg.add(knee);
  part(knee, cached('crab-leg-knee', () => new THREE.SphereGeometry(0.018, 8, 6)), mats.charcoal, {
    pos: [0, 0.002, 0],
  });
  part(knee, cached('crab-leg-tibia', () => new THREE.CylinderGeometry(0.011, 0.016, 0.078, 6)), legMat, {
    pos: [0, -0.042, 0],
  });
  part(knee, cached('crab-leg-tip', () => new THREE.ConeGeometry(0.012, 0.05, 5)), mats.charcoal, {
    pos: [0, -0.106, 0],
    rot: [Math.PI, 0, 0],
    shadow: false,
  });
  return leg;
}

function addCrabBanner(parent, mats) {
  const banner = new THREE.Group();
  banner.position.set(0, 0.08, -0.12);
  part(banner, cached('crab-banner-pole', () => new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6)), mats.steel, {
    pos: [0, 0.08, 0],
  });
  part(banner, cached('crab-banner-finial', () => new THREE.SphereGeometry(0.014, 6, 5)), mats.gold, {
    pos: [0, 0.164, 0],
    shadow: false,
  });
  part(banner, trapezoidPlateGeometry(0.07, 0.05, 0.08, 0.008), mats.cloth, {
    pos: [0.04, 0.11, 0],
    rot: [0, 0, -0.15],
  });
  parent.add(banner);
  return banner;
}

function buildCrabGeneral(mats) {
  const group = new THREE.Group();

  // The carapace is most of this unit's footprint, so it has to carry the team
  // colour — a fixed crab-orange left blue and red indistinguishable on the
  // board. Warm ivory and gold survive on the underside, mandibles, and pincer
  // teeth, which is enough to keep it reading as a crab.
  const teamBase = mats.armor.color.clone();
  const warm = new THREE.Color(0xffd9b3);
  const shadowTone = new THREE.Color(0x0b1220);

  const shellMat = standard(teamBase.clone().lerp(warm, 0.06), {
    roughness: 0.44,
    metalness: 0.2,
    emissive: teamBase.clone().lerp(shadowTone, 0.45),
    emissiveIntensity: 0.34,
  });
  shellMat.name = 'armor';
  const shellDeepMat = standard(teamBase.clone().lerp(shadowTone, 0.5), {
    roughness: 0.52,
    metalness: 0.26,
  });
  shellDeepMat.name = 'armorDeep';
  const clawMat = standard(teamBase.clone().lerp(warm, 0.14), {
    roughness: 0.4,
    metalness: 0.16,
    emissive: teamBase.clone().lerp(shadowTone, 0.5),
    emissiveIntensity: 0.2,
  });
  clawMat.name = 'armor';
  const clawDeepMat = standard(teamBase.clone().lerp(shadowTone, 0.36), {
    roughness: 0.46,
    metalness: 0.24,
  });
  clawDeepMat.name = 'armorDeep';
  const legMat = standard(teamBase.clone().lerp(shadowTone, 0.62), {
    roughness: 0.66,
    metalness: 0.18,
  });
  legMat.name = 'armorDeep';
  const jointMat = standard(0x2b2233, { roughness: 0.6, metalness: 0.24 });
  jointMat.name = 'charcoal';
  const bellyMat = standard(0xf6dcb8, { roughness: 0.8, metalness: 0.04 });
  bellyMat.name = 'belly';
  const extraMaterials = [shellMat, shellDeepMat, clawMat, clawDeepMat, legMat, jointMat, bellyMat];

  const body = new THREE.Group();
  body.position.set(0, 0.2, 0);
  group.add(body);

  part(body, crabCarapaceGeometry(), shellDeepMat, { pos: [0, -0.004, 0] });
  part(body, crabDomeGeometry(), shellMat, {
    pos: [0, 0.006, -0.008],
    scale: [0.244, 0.105, 0.152],
  });

  part(body, crabArcGeometry('crab-shell-groove', 0.12, 0.007, Math.PI * 1.1), shellDeepMat, {
    pos: [0, 0.068, -0.06],
    scale: [1.25, 1, 1],
    shadow: false,
  });
  part(body, crabArcGeometry('crab-shell-groove-2', 0.09, 0.006, Math.PI * 0.95), shellDeepMat, {
    pos: [0, 0.078, -0.02],
    scale: [1.15, 1, 1],
    shadow: false,
  });

  const knobGeo = cached('crab-shell-knob', () => new THREE.SphereGeometry(0.024, 8, 6));
  for (const [x, z] of [[-0.11, 0.02], [0.11, 0.02], [-0.07, -0.08], [0.07, -0.08]]) {
    part(body, knobGeo, shellMat, { pos: [x, 0.088, z], scale: [0.95, 0.48, 0.95], shadow: false });
  }

  part(body, crabArcGeometry('crab-shell-brow', 0.175, 0.012, Math.PI * 0.72), mats.gold, {
    pos: [0, 0.045, 0.01],
    scale: [1.18, 1, 1],
    shadow: false,
  });
  part(body, trapezoidPlateGeometry(0.04, 0.07, 0.05, 0.01), mats.gold, {
    pos: [0, 0.1, 0.02],
    rot: [Math.PI / 2 - 0.4, 0, 0],
    shadow: false,
  });

  const spikeGeo = cached('crab-shell-spike', () => new THREE.ConeGeometry(0.026, 0.085, 6));
  for (const side of [-1, 1]) {
    part(body, spikeGeo, shellDeepMat, {
      pos: [side * 0.295, 0.004, 0.018],
      rot: [0, 0.35, side * -1.46],
      shadow: false,
    });
    part(body, spikeGeo, shellDeepMat, {
      pos: [side * 0.22, 0.002, -0.14],
      rot: [0.35, 0, side * -1.2],
      scale: [0.75, 0.75, 0.75],
      shadow: false,
    });
  }

  part(body, trapezoidPlateGeometry(0.26, 0.22, 0.22, 0.04), bellyMat, {
    pos: [0, -0.046, -0.005],
    rot: [Math.PI / 2, 0, 0],
  });
  part(body, trapezoidPlateGeometry(0.16, 0.12, 0.1, 0.016), bellyMat, {
    pos: [0, -0.058, 0.06],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });

  const head = new THREE.Group();
  head.position.set(0, -0.012, 0.132);
  body.add(head);
  part(head, trapezoidPlateGeometry(0.1, 0.14, 0.06, 0.05), shellDeepMat, {
    pos: [0, 0, 0.008],
    rot: [0.12, 0, 0],
  });
  part(head, trapezoidPlateGeometry(0.055, 0.08, 0.036, 0.024), bellyMat, {
    pos: [0, -0.028, 0.028],
    rot: [0.24, 0, 0],
    shadow: false,
  });
  const mandibleGeo = trapezoidPlateGeometry(0.012, 0.02, 0.042, 0.014);
  for (const side of [-1, 1]) {
    part(head, mandibleGeo, jointMat, {
      pos: [side * 0.04, -0.028, 0.036],
      rot: [1.15, 0, side * 0.32],
      shadow: false,
    });
  }

  const eyeStalks = {};
  for (const side of [-1, 1]) {
    eyeStalks[side < 0 ? 'left' : 'right'] = addCrabEyeStalk(head, side, mats, shellMat);
  }
  const eyes = [eyeStalks.left.eye, eyeStalks.right.eye];

  const clawL = buildCrabClaw(-1, mats, shellMat, clawMat, clawDeepMat, jointMat, { crush: true });
  const clawR = buildCrabClaw(1, mats, shellMat, clawMat, clawDeepMat, jointMat, { crush: false });
  body.add(clawL);
  body.add(clawR);

  for (const [z, fan, splay] of [
    [0.07, 0.38, 1.02],
    [0.0, 0.04, 0.94],
    [-0.1, -0.34, 0.86],
  ]) {
    for (const side of [-1, 1]) {
      addCrabLeg(body, side, z, fan, splay, mats, legMat);
    }
  }

  const banner = addCrabBanner(body, mats);

  return {
    group,
    torso: body,
    head,
    armL: clawL,
    armR: clawR,
    eyes,
    eyeStalkL: eyeStalks.left.stalk,
    eyeStalkR: eyeStalks.right.stalk,
    banner,
    extraMaterials,
  };
}

// Revolved silhouette: flat footprint, bulging haunches, soft dome. A squashed
// sphere reads as a ball or a puddle depending on the camera; the lathe profile
// keeps the goo shape from every angle.
const SLIME_PROFILE = [
  [0.001, 0],
  [0.17, 0],
  [0.255, 0.012],
  [0.292, 0.048],
  [0.3, 0.105],
  [0.291, 0.17],
  [0.266, 0.235],
  [0.221, 0.3],
  [0.15, 0.355],
  [0.062, 0.392],
  [0.001, 0.402],
];

function slimeDomeGeometry() {
  return cached('slime-dome', () =>
    new THREE.LatheGeometry(
      SLIME_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)),
      18
    )
  );
}

/** Profile radius at a given height, for seating features on the dome surface. */
function slimeRadiusAt(y) {
  for (let i = 1; i < SLIME_PROFILE.length; i++) {
    const [x0, y0] = SLIME_PROFILE[i - 1];
    const [x1, y1] = SLIME_PROFILE[i];
    if (y <= y1) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return x0 + (x1 - x0) * t;
    }
  }
  return 0;
}

// Only two, and only flanking the face. The board camera looks down at ~46°, so
// anything elongated vertically around the rim projects as a ring of radial
// fingers instead of goo running down the sides.
function addSlimeDrips(parent, jelly) {
  const dripGeo = cached('slime-drip', () => new THREE.SphereGeometry(0.04, 8, 8));
  const beadGeo = cached('slime-drip-bead', () => new THREE.SphereGeometry(0.03, 8, 6));
  for (const angle of [0.26, 2.88]) {
    // Radius taken mid-dribble so the middle bulges clear of the dome while the
    // ends tuck back into it.
    const r = slimeRadiusAt(0.175) * 0.95;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    part(parent, dripGeo, jelly, { pos: [x, 0.175, z], scale: [0.95, 1.9, 0.8] });
    part(parent, beadGeo, jelly, { pos: [x * 1.05, 0.078, z * 1.05] });
  }
}

function addSlimeFace(parent, mats, sheen) {
  const eyeY = 0.272;
  const eyeX = 0.08;
  const eyeGeo = cached('slime-eyeball', () => new THREE.SphereGeometry(0.05, 12, 10));
  const pupilGeo = cached('slime-pupil', () => new THREE.SphereGeometry(0.024, 10, 8));
  const glintGeo = cached('slime-glint', () => new THREE.SphereGeometry(0.011, 6, 6));
  const eyes = [];
  for (const side of [-1, 1]) {
    // Seated shallow so the eyeball bulges through the jelly instead of being
    // swallowed by it, which is what flattened the old face out.
    part(parent, eyeGeo, mats.skin, { pos: [side * eyeX, eyeY, 0.2] });
    part(parent, pupilGeo, mats.charcoal, {
      pos: [side * (eyeX - 0.002), eyeY - 0.006, 0.228],
      shadow: false,
    });
    eyes.push(
      part(parent, glintGeo, mats.eye, {
        pos: [side * (eyeX + 0.019), eyeY + 0.021, 0.232],
        shadow: false,
      })
    );
  }

  part(parent, cached('slime-grin', () => new THREE.TorusGeometry(0.065, 0.012, 5, 14, Math.PI)), mats.charcoal, {
    pos: [0, 0.196, 0.272],
    rot: [0, 0, Math.PI],
    shadow: false,
  });

  // Wet gloss on the upper dome, where the key light lands. Opaque so it holds
  // up against the translucent body, and flat so it hugs the surface.
  part(parent, cached('slime-sheen', () => new THREE.SphereGeometry(0.034, 8, 6)), sheen, {
    pos: [-0.105, 0.335, 0.108],
    scale: [1.3, 0.32, 0.8],
    rot: [0.5, -0.5, 0.2],
    shadow: false,
  });

  return eyes;
}

function buildSlime(mats) {
  const group = new THREE.Group();
  const base = mats.armor.userData.baseColor.clone();
  // Its own slot rather than 'armor': the tint switch forces armor to
  // emissiveIntensity 0.3, which flattens the depth the jelly needs. An unknown
  // slot falls through to the default branch, which recolours and nothing else.
  const jelly = standard(base, {
    roughness: 0.2,
    metalness: 0.04,
    // Team-neutral: the default tint branch never revisits emissive, so a
    // blue-derived glow would stay blue on the red team.
    emissive: 0x1e293b,
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.86,
  });
  jelly.name = 'jelly';
  jelly.userData.preserveTransparent = true;
  const jellyDeep = standard(base.clone().lerp(new THREE.Color(0x0b1220), 0.55), {
    roughness: 0.24,
    metalness: 0.04,
    transparent: true,
    opacity: 0.8,
  });
  jellyDeep.name = 'armorDeep';
  jellyDeep.userData.preserveTransparent = true;
  const sheen = standard(base.clone().lerp(new THREE.Color(0xffffff), 0.5), {
    roughness: 0.08,
    metalness: 0.05,
    emissive: base.clone().lerp(new THREE.Color(0xffffff), 0.5),
    emissiveIntensity: 0.25,
  });
  sheen.name = 'trim';
  const extraMaterials = [jelly, jellyDeep, sheen];

  const torso = new THREE.Group();
  group.add(torso);

  // Pooled goo. Has to flare wider than the dome's own widest point (0.30) or it
  // hides inside the silhouette, and it doubles as the only dark value on an
  // otherwise single-tone body.
  part(torso, cached('slime-pool', () => new THREE.CylinderGeometry(0.332, 0.276, 0.026, 20)), jellyDeep, {
    pos: [0, 0.013, 0],
  });
  part(torso, slimeDomeGeometry(), jelly);
  addSlimeDrips(torso, jelly);

  // Peak of goo, so the silhouette is not a plain dome.
  part(torso, cached('slime-peak', () => new THREE.SphereGeometry(0.05, 8, 8)), jelly, {
    pos: [-0.026, 0.412, -0.032],
    scale: [1, 1.4, 1],
    rot: [-0.32, 0, 0.26],
  });

  part(torso, cached('slime-nucleus', () => new THREE.SphereGeometry(0.14, 12, 10)), jellyDeep, {
    pos: [0, 0.15, -0.015],
    scale: [1.2, 0.82, 1.12],
  });

  // Swallowed loot, mostly proud of the surface rather than suspended inside.
  // Fully submerged it washed out at any opacity the body could afford, and it
  // has to sit forward of the flanks because previews rotate the model +0.35.
  // Cocked 45° up the radial, not straight out along it: edge-on to the raised
  // camera the coin was reading as a gold crescent rather than a disc.
  part(torso, cached('slime-coin', () => new THREE.CylinderGeometry(0.045, 0.045, 0.014, 10)), mats.gold, {
    pos: [0.134, 0.1, 0.252],
    rot: [0, -1.083, -Math.PI / 4],
  });
  part(torso, cached('slime-pebble', () => new THREE.DodecahedronGeometry(0.04, 0)), mats.steel, {
    pos: [-0.183, 0.13, 0.218],
    rot: [0.4, 0.6, 0.2],
  });

  // Trapped bubbles, kept to the back half so they never crowd the face.
  const bubbleGeo = cached('slime-bubble', () => new THREE.SphereGeometry(0.016, 6, 6));
  for (const pos of [
    [0.052, 0.3, -0.052],
    [-0.084, 0.245, -0.098],
    [0.124, 0.215, -0.075],
    [-0.028, 0.335, 0.018],
    [0.162, 0.278, 0.026],
  ]) {
    part(torso, bubbleGeo, sheen, { pos, shadow: false });
  }

  const head = new THREE.Group();
  torso.add(head);
  const eyes = addSlimeFace(head, mats, sheen);

  return { group, torso, head, eyes, extraMaterials };
}

// One half of the standing bat collar. Mirroring via negative scale would flip
// the winding, so each side gets its own geometry.
function draculaCollarWingGeometry(side, width, height) {
  const key = `dracula-collar-wing-${side}-${width.toFixed(3)}-${height.toFixed(3)}`;
  return cached(key, () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(side * width * 0.27, height * 0.72);
    shape.lineTo(side * width, height);
    shape.lineTo(side * width * 0.66, height * 0.5);
    shape.lineTo(side * width * 0.84, height * 0.28);
    shape.lineTo(side * width * 0.34, height * 0.06);
    shape.lineTo(0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.008,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.004);
    geometry.computeVertexNormals();
    return geometry;
  });
}

function draculaHemPointGeometry() {
  return cached('dracula-cape-hem-point', () => new THREE.ConeGeometry(0.044, 0.078, 3));
}

// The cloak is a back-facing conical shell rather than flat panels, so it can
// never swing round and cover the chest or face. wrapBandGeometry centres its
// arc on +Z, hence the yaw of PI.
function addDraculaCape(parent, black, lining) {
  const cape = new THREE.Group();
  cape.position.set(0, 0.55, -0.02);

  part(cape, wrapBandGeometry(0.175, 0.325, 0.46, 3.35, 14), black, {
    pos: [0, -0.235, 0],
    rot: [0, Math.PI, 0],
  });
  part(cape, wrapBandGeometry(0.162, 0.305, 0.44, 3.05, 14), lining, {
    pos: [0, -0.232, 0],
    rot: [0, Math.PI, 0],
  });

  // Shoulder yoke hides the seam where the shell meets the coat.
  part(cape, wrapBandGeometry(0.2, 0.215, 0.09, 3.7, 14), black, {
    pos: [0, -0.035, 0],
    rot: [0, Math.PI, 0],
  });

  // Scalloped hem, spaced around the back of the shell (-Z is angle -PI/2).
  const hemGeo = draculaHemPointGeometry();
  for (const angle of [-2.36, -1.96, -1.57, -1.18, -0.78]) {
    const r = 0.315;
    part(cape, hemGeo, black, {
      pos: [Math.cos(angle) * r, -0.475, Math.sin(angle) * r],
      rot: [Math.PI, -angle, 0],
    });
  }

  const wingWidth = 0.22;
  const wingHeight = 0.44;
  for (const side of [-1, 1]) {
    part(cape, draculaCollarWingGeometry(side, wingWidth, wingHeight), black, {
      pos: [side * 0.05, -0.075, -0.02],
      rot: [-0.2, side * 0.3, 0],
    });
    part(cape, draculaCollarWingGeometry(side, wingWidth * 0.86, wingHeight * 0.9), lining, {
      pos: [side * 0.051, -0.069, -0.011],
      rot: [-0.2, side * 0.3, 0],
    });
  }

  // Stand-up band closing the collar behind the neck.
  part(cape, wrapBandGeometry(0.078, 0.095, 0.14, 2.6, 10), black, {
    pos: [0, 0.06, -0.01],
    rot: [-0.16, Math.PI, 0],
  });

  parent.add(cape);
  return cape;
}

// The count is a heavy-set aristocrat, so the coat carries a rounded chest and
// paunch instead of the straight tapered cylinder every other class uses.
function addDraculaSuit(torso, black, shirt, sash, gem) {
  part(torso, cached('dracula-paunch', () => new THREE.SphereGeometry(0.14, 14, 12)), black, {
    pos: [0, -0.055, 0.006],
    scale: [0.94, 0.86, 0.82],
  });
  part(torso, cached('dracula-chest', () => new THREE.SphereGeometry(0.125, 14, 10)), black, {
    pos: [0, 0.085, 0.004],
    scale: [1.04, 0.66, 0.84],
  });

  part(torso, trapezoidPlateGeometry(0.07, 0.086, 0.2, 0.014), shirt, {
    pos: [0, 0.005, 0.112],
    rot: [0.09, 0, 0],
  });
  const lapelGeo = trapezoidPlateGeometry(0.05, 0.026, 0.17, 0.012);
  for (const side of [-1, 1]) {
    part(torso, lapelGeo, black, {
      pos: [side * 0.06, 0.03, 0.108],
      rot: [0.09, side * -0.32, side * 0.14],
    });
  }

  part(torso, wrapBandGeometry(0.126, 0.122, 0.055, 2.4, 10), sash, {
    pos: [0, -0.115, 0.006],
    scale: [1, 1, 0.86],
  });

  part(torso, cached('dracula-bow-knot', () => new THREE.BoxGeometry(0.024, 0.02, 0.012)), black, {
    pos: [0, 0.128, 0.112],
  });
  const bowGeo = cached('dracula-bow-wing', () => new THREE.BoxGeometry(0.042, 0.032, 0.008));
  for (const side of [-1, 1]) {
    part(torso, bowGeo, black, {
      pos: [side * 0.031, 0.128, 0.111],
      rot: [0, 0, side * -0.24],
    });
  }

  part(torso, cached('dracula-medallion-bezel', () => new THREE.CylinderGeometry(0.024, 0.024, 0.01, 10)), black, {
    pos: [0, 0.055, 0.118],
    rot: [Math.PI / 2, 0, 0],
  });
  part(torso, cached('dracula-medallion', () => new THREE.SphereGeometry(0.017, 10, 8)), gem, {
    pos: [0, 0.055, 0.126],
    scale: [1, 1.1, 0.6],
    shadow: false,
  });
}

function addDraculaTrousers(legs, black) {
  const thighGeo = cached('dracula-thigh', () => new THREE.CylinderGeometry(0.056, 0.05, 0.16, 10));
  const shinGeo = cached('dracula-shin', () => new THREE.CylinderGeometry(0.05, 0.042, 0.14, 10));
  const shoeGeo = cached('dracula-shoe', () => new THREE.BoxGeometry(0.074, 0.042, 0.12));
  const toeGeo = cached('dracula-shoe-toe', () => new THREE.ConeGeometry(0.036, 0.055, 4));
  const spatGeo = wrapBandGeometry(0.048, 0.05, 0.05, 2.3, 8);
  for (const side of ['left', 'right']) {
    const { hip, knee } = legs[side];
    for (const joint of [hip, knee]) {
      joint.traverse((child) => {
        if (child.isMesh) child.visible = false;
      });
    }
    part(hip, thighGeo, black, { pos: [0, -0.075, 0.004] });
    part(knee, shinGeo, black, { pos: [0, -0.062, 0.006] });
    part(knee, spatGeo, black, { pos: [0, -0.118, 0.008] });
    part(knee, shoeGeo, black, { pos: [0, -0.132, 0.026] });
    part(knee, toeGeo, black, {
      pos: [0, -0.134, 0.096],
      rot: [Math.PI / 2, 0, 0],
    });
  }
}

function addDraculaCuffs(armL, armR, black, skin) {
  const cuffGeo = wrapBandGeometry(0.046, 0.044, 0.03, 2.2, 8);
  for (const arm of [armL, armR]) {
    part(arm.pivot, cuffGeo, black, { pos: [0, -0.198, 0.004] });
    arm.hand.traverse((child) => {
      if (child.isMesh) child.material = skin;
    });
  }
}

function addDraculaFace(head, black, paleSkin, bone, radius) {
  const eyeGeo = cached('dracula-eye', () => new THREE.SphereGeometry(0.008, 6, 6));
  const front = radius * 1.02;
  const eyes = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, eyeGeo, black, {
      pos: [side * 0.031, 0.012, front],
      shadow: false,
    }));
    part(head, cached('dracula-brow', () => new THREE.BoxGeometry(0.046, 0.011, 0.011)), black, {
      pos: [side * 0.03, 0.034, front - 0.012],
      rot: [0.1, side * 0.08, side * -0.4],
    });
    part(head, cached('dracula-sideburn', () => new THREE.BoxGeometry(0.014, 0.05, 0.03)), black, {
      pos: [side * 0.072, 0.014, 0.014],
      rot: [0, 0, side * -0.12],
    });
  }

  const mustacheGeo = cached('dracula-mustache', () => new THREE.BoxGeometry(0.044, 0.009, 0.009));
  for (const side of [-1, 1]) {
    part(head, mustacheGeo, black, {
      pos: [side * 0.025, -0.026, front + 0.002],
      rot: [0.16, side * 0.1, side * -0.28],
    });
  }

  // Slicked-back hair. The sweep leaves the front open so the cap frames the
  // pale face instead of swallowing it.
  part(head, cached('dracula-hair-cap', () =>
    new THREE.SphereGeometry(radius * 1.06, 16, 10, Math.PI / 2 + 0.82, Math.PI * 2 - 1.64, 0, Math.PI * 0.62)
  ), black, {
    pos: [0, 0.026, -0.014],
    scale: [1.04, 0.94, 1.08],
  });
  part(head, cached('dracula-widow-peak', () => new THREE.ConeGeometry(0.03, 0.09, 4)), black, {
    pos: [0, radius * 1.06, front * 0.86],
    rot: [0.62, 0, 0],
  });
  const cheekGeo = cached('dracula-cheek', () => new THREE.BoxGeometry(0.016, 0.034, 0.014));
  for (const side of [-1, 1]) {
    part(head, cheekGeo, paleSkin, {
      pos: [side * 0.058, -0.012, front * 0.78],
      rot: [0, side * 0.22, 0],
    });
  }
  const fangGeo = cached('dracula-fang', () => new THREE.ConeGeometry(0.008, 0.026, 4));
  for (const side of [-1, 1]) {
    part(head, fangGeo, bone, {
      pos: [side * 0.017, -0.048, front * 0.94],
      rot: [0.2, 0, side * 0.12],
    });
  }
  return eyes;
}

function buildVampire(mats) {
  const group = new THREE.Group();
  // Fixed palette: the count stays black and blood-red on every team, so these
  // slots opt out of the team tint (see FIXED_COLOUR_SLOTS in teamTint.js).
  const paleSkin = standard(0xe6dccb, { roughness: 0.84, metalness: 0 });
  paleSkin.name = 'paleSkin';
  const cloakBlack = standard(0x0a0a10, { roughness: 0.88, metalness: 0.04 });
  cloakBlack.name = 'cloak';
  const bloodLining = standard(0x5c0d18, { roughness: 0.72, metalness: 0.08 });
  bloodLining.name = 'cloakLining';
  const dressShirt = standard(0xeae5d9, { roughness: 0.92, metalness: 0 });
  dressShirt.name = 'dressShirt';
  const extraMaterials = [paleSkin, cloakBlack, bloodLining, dressShirt];

  const legs = addLegs(group, mats, { spread: 0.062, legLength: 0.2, boots: false });
  addDraculaTrousers(legs, cloakBlack);

  const torso = addTorso(group, mats, {
    width: 0.94,
    height: 0.3,
    y: 0.44,
    material: cloakBlack,
    fittings: false,
  });
  // Cloak and suit are team-neutral, so the sash and brooch carry the team read.
  addDraculaSuit(torso, cloakBlack, dressShirt, mats.armor, mats.eye);
  const cape = addDraculaCape(group, cloakBlack, bloodLining);

  const armL = addArm(group, mats, -1, { shoulderX: 0.155, shoulderY: 0.55, sleeveMat: cloakBlack });
  const armR = addArm(group, mats, 1, { shoulderX: 0.155, shoulderY: 0.55, sleeveMat: cloakBlack });
  addDraculaCuffs(armL, armR, cloakBlack, paleSkin);

  const headRadius = 0.085;
  const head = addHead(group, mats, { y: 0.71, radius: headRadius, skin: paleSkin });
  for (const child of head.children) {
    if (child.isMesh && child.material === mats.skin) child.material = paleSkin;
  }
  const eyes = addDraculaFace(head, cloakBlack, paleSkin, dressShirt, headRadius);

  armR.pivot.rotation.set(-0.5, 0.15, 0.55);
  armL.pivot.rotation.set(-0.5, -0.15, -0.55);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    cape,
    extraMaterials,
  };
}

// Car panels are authored as a side profile (x = length, y = height) extruded
// across the width, then baked into the unit's facing: length on Z, width on X.
// Rotating at placement time instead would swap height and width.
function carPanelGeometry(key, points, width, bevel = 0.005) {
  return cached(key, () => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.lineTo(points[0][0], points[0][1]);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 3,
    });
    geometry.translate(0, 0, -width / 2);
    geometry.rotateY(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

// Toy-car proportions: a scale-accurate supercar reads as a pancake next to the
// humanoid classes, so the cabin is tall and the wheels are oversized.
function sportsCarShellGeometry() {
  return carPanelGeometry('sports-car-shell', [
    [-0.25, 0.048],
    [0.25, 0.048],
    [0.258, 0.086],
    [0.238, 0.13],
    [0.12, 0.148],
    [-0.04, 0.158],
    [-0.2, 0.152],
    [-0.252, 0.13],
    [-0.258, 0.078],
  ], 0.28, 0.006);
}

// Cabin sits well back so the long hood in front of it reads as a sports car
// rather than a van.
function sportsCarGreenhouseGeometry() {
  return carPanelGeometry('sports-car-greenhouse', [
    [0.048, 0],
    [-0.008, 0.084],
    [-0.115, 0.09],
    [-0.176, 0.006],
  ], 0.225, 0.004);
}

function addSportsCarWheel(parent, mats, x, z) {
  const wheel = new THREE.Group();
  wheel.position.set(x, 0.082, z);

  // Cylinders spin their Y axis onto X; a torus already lies about Z, so it
  // needs a yaw instead. Reusing the cylinder rotation leaves it standing up.
  const axle = [0, 0, Math.PI / 2];
  const torusAxle = [0, Math.PI / 2, 0];
  part(wheel, cached('car-tire', () => new THREE.CylinderGeometry(0.075, 0.075, 0.055, 14)), mats.charcoal, {
    rot: axle,
  });
  part(wheel, cached('car-tire-shoulder', () => new THREE.TorusGeometry(0.068, 0.01, 6, 14)), mats.charcoal, {
    rot: torusAxle,
    shadow: false,
  });
  part(wheel, cached('car-rim-face', () => new THREE.CylinderGeometry(0.05, 0.05, 0.058, 12)), mats.steel, {
    rot: axle,
  });
  const spokeGeo = cached('car-spoke', () => new THREE.BoxGeometry(0.06, 0.05, 0.013));
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    part(wheel, spokeGeo, mats.trim, {
      pos: [0, Math.cos(angle) * 0.024, Math.sin(angle) * 0.024],
      rot: [angle, 0, 0],
      shadow: false,
    });
  }
  part(wheel, cached('car-hub-cap', () => new THREE.CylinderGeometry(0.017, 0.017, 0.064, 8)), mats.gold, {
    rot: axle,
    shadow: false,
  });

  parent.add(wheel);
  return wheel;
}

// Solid fender blisters over each wheel. The sweep 0..PI closes the +X half, so
// Rz(PI/2) both lays the axis along X and swings that half up to +Y; the open
// flat face then points down into the body where it cannot be seen.
function addSportsCarArches(body, mats) {
  // Wider than the tyre so it never leaves a floating rim of rubber above the
  // arch, but raised above the axle so the tyre still shows in the wheel well.
  const archGeo = cached('car-arch', () =>
    new THREE.CylinderGeometry(0.084, 0.084, 0.064, 12, 1, false, 0, Math.PI)
  );
  for (const x of [-0.158, 0.158]) {
    for (const z of [0.158, -0.158]) {
      part(body, archGeo, mats.armor, {
        pos: [x, 0.088, z],
        rot: [0, 0, Math.PI / 2],
      });
    }
  }
  // Wide-body flare bridging front and rear arches, so the flanks read as one
  // continuous body instead of four separate pods.
  const flareGeo = cached('car-flare', () => new THREE.BoxGeometry(0.05, 0.055, 0.2));
  for (const side of [-1, 1]) {
    part(body, flareGeo, mats.armor, {
      pos: [side * 0.148, 0.115, 0],
      rot: [0, 0, side * 0.14],
    });
  }
}

function addSportsCarBodyKit(body, mats) {
  part(body, cached('car-floor', () => new THREE.BoxGeometry(0.27, 0.02, 0.46)), mats.charcoal, {
    pos: [0, 0.05, 0],
  });
  part(body, sportsCarShellGeometry(), mats.armor, { pos: [0, 0, 0] });
  part(body, sportsCarGreenhouseGeometry(), mats.charcoal, { pos: [0, 0.142, 0] });
  part(body, cached('car-beltline', () => new THREE.BoxGeometry(0.232, 0.008, 0.222)), mats.trim, {
    pos: [0, 0.146, -0.064],
    shadow: false,
  });
  part(body, cached('car-roof-panel', () => new THREE.BoxGeometry(0.19, 0.018, 0.115)), mats.armor, {
    pos: [0, 0.229, -0.062],
    rot: [0.05, 0, 0],
  });
  part(body, cached('car-roof-stripe', () => new THREE.BoxGeometry(0.046, 0.006, 0.119)), mats.trim, {
    pos: [0, 0.239, -0.062],
    rot: [0.05, 0, 0],
    shadow: false,
  });
  addSportsCarArches(body, mats);

  // Front end.
  part(body, cached('car-splitter', () => new THREE.BoxGeometry(0.32, 0.014, 0.075)), mats.charcoal, {
    pos: [0, 0.05, 0.245],
  });
  part(body, cached('car-front-bumper', () => new THREE.BoxGeometry(0.3, 0.03, 0.05)), mats.charcoal, {
    pos: [0, 0.07, 0.248],
  });
  part(body, cached('car-grille', () => new THREE.BoxGeometry(0.17, 0.038, 0.018)), mats.charcoal, {
    pos: [0, 0.096, 0.254],
  });
  const grilleBarGeo = cached('car-grille-bar', () => new THREE.BoxGeometry(0.132, 0.005, 0.006));
  for (let i = 0; i < 2; i++) {
    part(body, grilleBarGeo, mats.armorDeep, {
      pos: [0, 0.09 + i * 0.014, 0.263],
      shadow: false,
    });
  }
  const headlights = [];
  for (const side of [-1, 1]) {
    part(body, cached('car-headlight-shell', () => new THREE.BoxGeometry(0.078, 0.03, 0.03)), mats.charcoal, {
      pos: [side * 0.096, 0.126, 0.219],
      rot: [-0.22, 0, 0],
    });
    headlights.push(part(body, cached('car-headlight', () => new THREE.BoxGeometry(0.064, 0.017, 0.012)), mats.gold, {
      pos: [side * 0.096, 0.132, 0.231],
      rot: [-0.22, 0, 0],
      shadow: false,
    }));
  }
  part(body, cached('car-hood-vent', () => new THREE.BoxGeometry(0.13, 0.012, 0.06)), mats.armorDeep, {
    pos: [0, 0.148, 0.165],
  });
  const hoodStripeGeo = cached('car-hood-stripe', () => new THREE.BoxGeometry(0.028, 0.006, 0.15));
  for (const side of [-1, 1]) {
    part(body, hoodStripeGeo, mats.trim, {
      pos: [side * 0.032, 0.15, 0.17],
      shadow: false,
    });
  }

  // Rear end.
  part(body, cached('car-rear-bumper', () => new THREE.BoxGeometry(0.28, 0.032, 0.05)), mats.charcoal, {
    pos: [0, 0.076, -0.244],
  });
  part(body, cached('car-taillight-shell', () => new THREE.BoxGeometry(0.26, 0.036, 0.016)), mats.charcoal, {
    pos: [0, 0.114, -0.25],
  });
  const taillights = [];
  for (const side of [-1, 1]) {
    taillights.push(part(body, cached('car-taillight', () => new THREE.BoxGeometry(0.1, 0.02, 0.01)), mats.ember, {
      pos: [side * 0.072, 0.114, -0.26],
      shadow: false,
    }));
  }
  part(body, cached('car-diffuser', () => new THREE.BoxGeometry(0.24, 0.024, 0.045)), mats.charcoal, {
    pos: [0, 0.054, -0.246],
  });
  const finGeo = cached('car-diffuser-fin', () => new THREE.BoxGeometry(0.008, 0.022, 0.045));
  for (const x of [-0.07, 0, 0.07]) {
    part(body, finGeo, mats.steel, { pos: [x, 0.054, -0.252], shadow: false });
  }
  const exhausts = [];
  for (const side of [-1, 1]) {
    part(body, cached('car-exhaust', () => new THREE.CylinderGeometry(0.017, 0.019, 0.05, 8)), mats.steel, {
      pos: [side * 0.045, 0.072, -0.258],
      rot: [Math.PI / 2, 0, 0],
    });
    exhausts.push(part(body, cached('car-exhaust-glow', () => new THREE.SphereGeometry(0.013, 6, 5)), mats.ember, {
      pos: [side * 0.045, 0.072, -0.282],
      shadow: false,
    }));
  }

  // Flanks.
  for (const side of [-1, 1]) {
    part(body, cached('car-rocker', () => new THREE.BoxGeometry(0.018, 0.024, 0.27)), mats.charcoal, {
      pos: [side * 0.138, 0.062, 0],
    });
    part(body, cached('car-side-intake', () => new THREE.BoxGeometry(0.014, 0.03, 0.062)), mats.charcoal, {
      pos: [side * 0.142, 0.108, -0.055],
    });
    part(body, cached('car-door-line', () => new THREE.BoxGeometry(0.006, 0.004, 0.13)), mats.armorDeep, {
      pos: [side * 0.143, 0.126, 0.015],
      shadow: false,
    });
    part(body, cached('car-mirror-stalk', () => new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5)), mats.charcoal, {
      pos: [side * 0.135, 0.15, 0.082],
      rot: [0, 0, side * -0.6],
      shadow: false,
    });
    part(body, cached('car-mirror', () => new THREE.BoxGeometry(0.03, 0.014, 0.022)), mats.charcoal, {
      pos: [side * 0.152, 0.158, 0.082],
    });
  }

  return { headlights, taillights, exhausts };
}

function addSportsCarSpoiler(parent, mats) {
  const spoiler = new THREE.Group();
  spoiler.position.set(0, 0.156, -0.195);
  part(spoiler, cached('car-spoiler-lip', () => new THREE.BoxGeometry(0.26, 0.016, 0.075)), mats.armor, {
    pos: [0, 0, 0],
    rot: [-0.28, 0, 0],
  });
  part(spoiler, cached('car-spoiler-edge', () => new THREE.BoxGeometry(0.27, 0.008, 0.02)), mats.armorDeep, {
    pos: [0, 0.016, -0.03],
    rot: [-0.28, 0, 0],
    shadow: false,
  });
  parent.add(spoiler);
  return spoiler;
}

function buildRaceCar(mats) {
  const group = new THREE.Group();

  const body = new THREE.Group();
  group.add(body);

  const { headlights, taillights, exhausts } = addSportsCarBodyKit(body, mats);
  const spoiler = addSportsCarSpoiler(body, mats);

  const wheelFL = addSportsCarWheel(group, mats, -0.158, 0.158);
  const wheelFR = addSportsCarWheel(group, mats, 0.158, 0.158);
  const wheelRL = addSportsCarWheel(group, mats, -0.158, -0.158);
  const wheelRR = addSportsCarWheel(group, mats, 0.158, -0.158);

  return {
    group,
    body,
    torso: body,
    spoiler,
    wheelFL,
    wheelFR,
    wheelRL,
    wheelRR,
    headlights,
    taillights,
    spark: exhausts[0],
    exhausts,
  };
}

// Classic zigzag bolt. Traced as one simple polygon so ExtrudeGeometry can
// triangulate it without self-intersections.
function thunderBoltGeometry() {
  return cached('thunder-bolt', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0.03, 0.24);
    shape.lineTo(-0.08, 0.06);
    shape.lineTo(-0.005, 0.06);
    shape.lineTo(-0.06, -0.24);
    shape.lineTo(0.08, -0.02);
    shape.lineTo(0.01, -0.02);
    shape.lineTo(0.03, 0.24);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.028,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.014);
    geometry.computeVertexNormals();
    return geometry;
  });
}

const TAIKO_ARC = 4.7;

// Raijin's drum halo. The torus arc is rolled so its open gap sits at the
// bottom, keeping every drum clear of the feet.
function taikoHaloGeometry() {
  return cached('taiko-halo', () => {
    const geometry = new THREE.TorusGeometry(0.26, 0.013, 6, 30, TAIKO_ARC);
    geometry.rotateZ((3 * Math.PI) / 2 - (TAIKO_ARC + Math.PI * 2) / 2);
    return geometry;
  });
}

function addThunderHalo(parent, mats) {
  const halo = new THREE.Group();
  halo.position.set(0, 0.58, -0.11);
  part(halo, taikoHaloGeometry(), mats.gold, { shadow: false });

  const drumGeo = cached('taiko-drum', () => new THREE.CylinderGeometry(0.049, 0.049, 0.034, 10));
  const headGeo = cached('taiko-drum-head', () => new THREE.CylinderGeometry(0.042, 0.042, 0.04, 10));
  const rimGeo = cached('taiko-drum-rim', () => new THREE.TorusGeometry(0.047, 0.006, 5, 10));
  const start = (3 * Math.PI) / 2 - (TAIKO_ARC + Math.PI * 2) / 2;
  const barrel = [0, Math.PI / 2, 0];
  for (let i = 0; i < 6; i++) {
    const angle = start + ((i + 0.5) / 6) * TAIKO_ARC;
    const pos = [Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, 0];
    part(halo, drumGeo, mats.leather, { pos, rot: barrel });
    part(halo, headGeo, mats.trim, { pos, rot: barrel, shadow: false });
    part(halo, rimGeo, mats.gold, { pos, shadow: false });
  }

  parent.add(halo);
  return halo;
}

// Chunky zigzag built from tapered four-sided prisms. A flat extruded plate
// reads as a sliver under the raised board camera, so the bolt is solid and
// faceted instead, and holds its shape from any angle.
const THUNDER_BOLT_SEGMENTS = [
  { from: [0.05, 0.23], to: [-0.05, 0.07], rTop: 0.033, rBottom: 0.029 },
  { from: [-0.05, 0.07], to: [0.05, -0.03], rTop: 0.029, rBottom: 0.025 },
  { from: [0.05, -0.03], to: [-0.04, -0.22], rTop: 0.025, rBottom: 0.005 },
];

function buildThunderBolt(mats) {
  const bolt = new THREE.Group();
  const tilts = [];
  THUNDER_BOLT_SEGMENTS.forEach(({ from, to, rTop, rBottom }, i) => {
    const dx = from[0] - to[0];
    const dy = from[1] - to[1];
    const length = Math.hypot(dx, dy);
    // thetaStart rolls the square cross-section in the geometry; doing it as a
    // node rotation would fight the Z tilt under Three's XYZ euler order.
    tilts[i] = Math.atan2(-dx, dy);
    part(
      bolt,
      cached(`thunder-bolt-seg-${i}`, () =>
        new THREE.CylinderGeometry(rTop, rBottom, length, 4, 1, false, Math.PI / 4)
      ),
      mats.gold,
      {
        pos: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0],
        rot: [0, 0, tilts[i]],
      }
    );
  });
  part(bolt, cached('thunder-bolt-node', () => new THREE.OctahedronGeometry(0.032, 0)), mats.gold, {
    pos: [-0.05, 0.07, 0],
    shadow: false,
  });
  part(bolt, cached('thunder-bolt-grip', () => new THREE.CylinderGeometry(0.034, 0.032, 0.052, 6)), mats.leather, {
    pos: [0.036, -0.055, 0],
    rot: [0, 0, tilts[2]],
  });
  const spark = part(bolt, cached('thunder-bolt-spark', () => new THREE.OctahedronGeometry(0.042, 0)), mats.ember, {
    pos: [0.05, 0.246, 0],
    shadow: false,
  });
  return { group: bolt, spark };
}

function addThunderArmour(torso, mats) {
  part(torso, wrapBandGeometry(0.152, 0.13, 0.2, 2.3, 10), mats.armorDeep, {
    pos: [0, 0.03, 0],
    scale: [1, 1, 0.8],
  });
  part(torso, cached('thunder-pectoral', () => new THREE.TorusGeometry(0.1, 0.014, 6, 14, Math.PI)), mats.gold, {
    pos: [0, 0.08, 0.05],
    rot: [1.35, 0, 0],
    shadow: false,
  });
  part(torso, cached('thunder-belt', () => new THREE.CylinderGeometry(0.14, 0.132, 0.05, 14)), mats.leather, {
    pos: [0, -0.13, 0],
    scale: [1, 1, 0.84],
  });
  part(torso, cached('thunder-buckle', () => new THREE.BoxGeometry(0.07, 0.05, 0.024)), mats.gold, {
    pos: [0, -0.13, 0.104],
  });

  // Sash worn across one shoulder, the way a storm deity wears a toga.
  part(torso, trapezoidPlateGeometry(0.075, 0.062, 0.34, 0.016), mats.cloth, {
    pos: [-0.02, 0.01, 0.1],
    rot: [0.06, 0, 0.52],
  });

  // Gold rather than ember: materials are shared per slot, so an ember emblem
  // would fight the bolt's crackle animation over one emissiveIntensity.
  const emblem = part(torso, thunderBoltGeometry(), mats.gold, {
    pos: [0.008, 0.05, 0.115],
    scale: [0.36, 0.36, 0.18],
    shadow: false,
  });
  return emblem;
}

function addThunderSkirt(parent, mats) {
  const skirt = new THREE.Group();
  skirt.position.set(0, 0.31, 0);
  part(skirt, wrapBandGeometry(0.145, 0.185, 0.17, Math.PI * 2, 14), mats.cloth, {
    pos: [0, -0.085, 0],
  });
  const plateGeo = trapezoidPlateGeometry(0.062, 0.05, 0.14, 0.014);
  for (const angle of [-0.55, 0, 0.55, Math.PI - 0.55, Math.PI, Math.PI + 0.55]) {
    const r = 0.168;
    part(skirt, plateGeo, mats.armor, {
      pos: [Math.sin(angle) * r, -0.09, Math.cos(angle) * r],
      rot: [0.1, angle, 0],
    });
  }
  part(skirt, cached('thunder-skirt-hem', () => new THREE.TorusGeometry(0.184, 0.009, 5, 16)), mats.gold, {
    pos: [0, -0.168, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
  parent.add(skirt);
  return skirt;
}

function addThunderGreaves(legs, mats) {
  const greaveGeo = wrapBandGeometry(0.058, 0.05, 0.11, 2.4, 8);
  const kneeGeo = cached('thunder-knee', () => new THREE.SphereGeometry(0.042, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6));
  for (const side of ['left', 'right']) {
    const { knee } = legs[side];
    part(knee, greaveGeo, mats.armor, { pos: [0, -0.055, 0.006] });
    part(knee, kneeGeo, mats.gold, { pos: [0, 0.006, 0.008], scale: [1, 0.8, 1] });
  }
}

function addThunderBracers(armL, armR, mats) {
  const bracerGeo = wrapBandGeometry(0.05, 0.046, 0.075, 2.3, 8);
  const ringGeo = cached('thunder-bracer-ring', () => new THREE.TorusGeometry(0.05, 0.007, 5, 10));
  for (const arm of [armL, armR]) {
    part(arm.pivot, bracerGeo, mats.armor, { pos: [0, -0.17, 0.004] });
    part(arm.pivot, ringGeo, mats.gold, {
      pos: [0, -0.13, 0],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
  }
}

function addThunderFace(head, mats) {
  // Front of the sweep is left open so the mane frames the face.
  part(head, cached('thunder-mane', () =>
    new THREE.SphereGeometry(0.107, 16, 10, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 0, Math.PI * 0.66)
  ), mats.steel, {
    pos: [0, 0.018, -0.014],
    scale: [1.06, 1, 1.1],
  });
  const spikeGeo = cached('thunder-hair-spike', () => new THREE.ConeGeometry(0.026, 0.11, 4));
  for (const [x, y, z, pitch, roll] of [
    [-0.078, 0.07, -0.07, -0.7, 0.5],
    [0.078, 0.07, -0.07, -0.7, -0.5],
    [0, 0.096, -0.088, -0.9, 0],
    [-0.1, 0.012, -0.05, -0.3, 0.95],
    [0.1, 0.012, -0.05, -0.3, -0.95],
  ]) {
    part(head, spikeGeo, mats.steel, { pos: [x, y, z], rot: [pitch, 0, roll] });
  }

  const browGeo = cached('thunder-brow', () => new THREE.BoxGeometry(0.056, 0.014, 0.014));
  for (const side of [-1, 1]) {
    part(head, browGeo, mats.steel, {
      pos: [side * 0.036, 0.042, 0.086],
      rot: [0.1, side * 0.1, side * -0.34],
    });
  }

  part(head, trapezoidPlateGeometry(0.086, 0.05, 0.15, 0.05), mats.steel, {
    pos: [0, -0.13, 0.052],
    rot: [0.18, 0, 0],
  });
  const braidGeo = cached('thunder-braid', () => new THREE.BoxGeometry(0.024, 0.07, 0.024));
  for (const side of [-1, 1]) {
    part(head, braidGeo, mats.steel, {
      pos: [side * 0.062, -0.076, 0.052],
      rot: [0.14, 0, side * 0.2],
    });
  }
  part(head, cached('thunder-mouth', () => new THREE.BoxGeometry(0.05, 0.012, 0.012)), mats.charcoal, {
    pos: [0, -0.048, 0.09],
    shadow: false,
  });

  // Crown of bolts.
  part(head, cached('thunder-crown', () => new THREE.TorusGeometry(0.102, 0.011, 6, 14)), mats.gold, {
    pos: [0, 0.048, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  const crownSpikeGeo = cached('thunder-crown-spike', () => new THREE.ConeGeometry(0.018, 0.07, 4));
  for (const [angle, height] of [[-0.9, 0.8], [-0.45, 0.95], [0, 1.15], [0.45, 0.95], [0.9, 0.8]]) {
    part(head, crownSpikeGeo, mats.gold, {
      pos: [Math.sin(angle) * 0.098, 0.088, Math.cos(angle) * 0.098],
      rot: [0.32 * Math.cos(angle), angle, -0.32 * Math.sin(angle)],
      scale: [1, height, 1],
    });
  }
  part(head, cached('thunder-crown-gem', () => new THREE.OctahedronGeometry(0.019, 0)), mats.ember, {
    pos: [0, 0.072, 0.1],
    shadow: false,
  });
}

function buildThunderGod(mats) {
  const group = new THREE.Group();

  const legs = addLegs(group, mats, { spread: 0.086, legLength: 0.19, bootMat: mats.charcoal });
  addThunderGreaves(legs, mats);
  const halo = addThunderHalo(group, mats);

  const torso = addTorso(group, mats, { width: 1.14, height: 0.31, y: 0.465, fittings: false });
  const emblem = addThunderArmour(torso, mats);
  addThunderSkirt(group, mats);
  addPauldrons(group, mats, { y: 0.6, x: 0.192, radius: 0.096 });
  addGorget(group, mats, 0.638);

  const armL = addArm(group, mats, -1, { shoulderX: 0.185, shoulderY: 0.585 });
  const armR = addArm(group, mats, 1, { shoulderX: 0.185, shoulderY: 0.585 });
  addThunderBracers(armL, armR, mats);

  const head = addHead(group, mats, { y: 0.755, radius: 0.1 });
  const eyes = addEyes(head, mats, { y: 0.008, z: 0.096, size: 0.018, spread: 0.046 });
  addThunderFace(head, mats);

  // The bolt hangs off the body rather than the hand: a flat plate parented to a
  // rotating wrist ends up edge-on to the raised camera. Owning its orientation
  // here lets the face lean back into view, and the raised hand meets it.
  const bolt = buildThunderBolt(mats);
  bolt.group.position.set(0.295, 0.72, 0.055);
  bolt.group.rotation.set(0, 0, 0.15);
  bolt.group.scale.setScalar(0.8);
  group.add(bolt.group);
  armR.pivot.rotation.set(-0.45, 0, 2.55);

  // Bachi in the off hand, to answer the drum halo.
  const bachi = new THREE.Group();
  bachi.position.set(0, -0.07, 0.014);
  bachi.rotation.set(0.34, 0, 0.18);
  part(bachi, cached('bachi-shaft', () => new THREE.CylinderGeometry(0.013, 0.017, 0.2, 6)), mats.leather);
  part(bachi, cached('bachi-ferrule', () => new THREE.TorusGeometry(0.017, 0.005, 5, 8)), mats.gold, {
    pos: [0, 0.056, 0],
    rot: [Math.PI / 2, 0, 0],
    shadow: false,
  });
  part(bachi, cached('bachi-tip', () => new THREE.SphereGeometry(0.019, 8, 6)), mats.leather, {
    pos: [0, -0.104, 0],
  });
  armL.hand.add(bachi);
  armL.pivot.rotation.set(-0.7, 0, -0.28);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    weapon: bolt.group,
    banner: halo,
    spark: bolt.spark,
    gem: emblem,
  };
}

function buildFallback(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats);
  const torso = addTorso(group, mats);
  addPauldrons(group, mats);
  const armL = addArm(group, mats, -1, {});
  const armR = addArm(group, mats, 1, {});
  const head = addHead(group, mats);
  const eyes = addEyes(head, mats);
  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, eyes };
}

const BUILDERS = {
  swordsman: buildSwordsman,
  archer: buildArcher,
  artillery: buildArtillery,
  tower: buildTower,
  shield: buildShield,
  mage: buildMage,
  assassin: buildAssassin,
  bomber: buildBomber,
  eagle: buildEagle,
  raceCar: buildRaceCar,
  priest: buildPriest,
  ghost: buildGhost,
  viper: buildViper,
  slime: buildSlime,
  crabGeneral: buildCrabGeneral,
  vampire: buildVampire,
  thunderGod: buildThunderGod,
  castle: buildCastle,
};

// Keeps every class inside roughly one tile of height while preserving silhouette contrast.
const GLOBAL_SCALE = 0.88;

const SILHOUETTE = {
  swordsman: [1, 1, 1],
  archer: [0.94, 1.04, 0.94],
  artillery: [1.12, 0.94, 1.12],
  tower: [1.02, 1.04, 1.02],
  shield: [1.16, 0.94, 1.12],
  mage: [0.92, 1.08, 0.92],
  assassin: [0.92, 1.03, 0.92],
  bomber: [1.06, 0.9, 1.06],
  eagle: [1.06, 1, 1.06],
  raceCar: [1.12, 1.12, 1.12],
  priest: [1.04, 0.98, 1.04],
  ghost: [0.9, 1.08, 0.9],
  viper: [0.98, 1.04, 0.98],
  slime: [1.05, 1.0, 1.05],
  crabGeneral: [1.14, 0.86, 1.14],
  vampire: [1.0, 0.97, 1.0],
  thunderGod: [1.0, 0.94, 1.0],
  castle: [1.08, 1.08, 1.08],
};

export function buildUnitModel(classId, team) {
  const mats = createMaterialSet(team);
  const rig = (BUILDERS[classId] ?? buildFallback)(mats);

  const root = new THREE.Group();
  const shadow = addContactShadow(root, mats, 0.3);
  const ring = addTeamRing(root, mats);

  const body = new THREE.Group();
  const scale = SILHOUETTE[classId] ?? [1, 1, 1];
  rig.group.scale.set(
    scale[0] * GLOBAL_SCALE,
    scale[1] * GLOBAL_SCALE,
    scale[2] * GLOBAL_SCALE
  );
  body.add(rig.group);
  root.add(body);

  const bounds = new THREE.Box3().setFromObject(rig.group);

  return {
    root,
    body,
    rig: { ...rig, kind: classId },
    shadow,
    ring,
    height: bounds.max.y,
    // Builders that mix their own materials (snake scales, ghost gauze) have to
    // hand them back, or the acted-this-turn tint would skip right over them.
    materials: [...Object.values(mats), ...(rig.extraMaterials ?? [])],
  };
}
