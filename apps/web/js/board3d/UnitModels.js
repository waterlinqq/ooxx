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

export function createMaterialSet(team) {
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

  return {
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
    steel: standard(0xc9d4e2, { roughness: 0.32, metalness: 0.72 }),
    gold: standard(0xf5c451, {
      roughness: 0.3,
      metalness: 0.68,
      emissive: 0x6b3f04,
      emissiveIntensity: 0.35,
    }),
    leather: standard(0x4a382c, { roughness: 0.9, metalness: 0.06 }),
    wood: standard(0x7a5230, { roughness: 0.82, metalness: 0.05 }),
    skin: standard(0xf0cba8, { roughness: 0.78, metalness: 0 }),
    charcoal: standard(0x1b2333, { roughness: 0.68, metalness: 0.25 }),
    eye: standard(glowColor, {
      roughness: 0.3,
      emissive: glowColor,
      emissiveIntensity: 1.6,
    }),
    ember: standard(0xfff0c2, {
      roughness: 0.4,
      emissive: 0xffbe3d,
      emissiveIntensity: 1.8,
    }),
    arcane: standard(0xd8b4fe, {
      roughness: 0.25,
      metalness: 0.1,
      emissive: 0xa855f7,
      emissiveIntensity: 1.7,
      transparent: true,
      opacity: 0.92,
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

function extrude(shape, depth, bevel = 0.006) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
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

function shieldGeometry() {
  return cached('tower-shield', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0.16);
    shape.quadraticCurveTo(-0.15, 0.23, -0.06, 0.23);
    shape.lineTo(0.06, 0.23);
    shape.quadraticCurveTo(0.15, 0.23, 0.15, 0.16);
    shape.lineTo(0.15, -0.08);
    shape.quadraticCurveTo(0.15, -0.16, 0, -0.24);
    shape.quadraticCurveTo(-0.15, -0.16, -0.15, -0.08);
    shape.lineTo(-0.15, 0.16);
    return extrude(shape, 0.045, 0.01);
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
function addLegs(parent, mats, { spread = 0.082, legLength = 0.15, bootMat = mats.leather } = {}) {
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
    part(knee, bootGeo, bootMat, { pos: [0, -shin - 0.012, 0.015] });
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

function addTorso(parent, mats, { width = 1, height = 0.26, y = 0.46, material = mats.armor } = {}) {
  const torso = new THREE.Group();
  torso.position.set(0, y, 0);
  const geo = cached(`torso-${height}`, () => new THREE.CylinderGeometry(0.15, 0.115, height, 14, 1));
  part(torso, geo, material, { scale: [width, 1, 0.76] });
  part(torso, cached('belt', () => new THREE.CylinderGeometry(0.125, 0.125, 0.045, 14)), mats.leather, {
    pos: [0, -height / 2 + 0.01, 0],
    scale: [width, 1, 0.82],
  });
  part(torso, cached('buckle', () => new THREE.BoxGeometry(0.05, 0.045, 0.03)), mats.gold, {
    pos: [0, -height / 2 + 0.01, 0.095],
  });
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
    new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const lameGeo = cached(`pauldron-lame-${radius}`, () =>
    new THREE.SphereGeometry(radius * 0.99, 16, 10, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.24)
  );
  const rimGeo = cached(`pauldron-rim-${radius}`, () =>
    new THREE.TorusGeometry(radius * 0.86, radius * 0.1, 6, 20)
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
    new THREE.SphereGeometry(radius, 22, 14, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, Math.PI * 0.66)
  ), mats.cloth, {
    pos: [0, 0.014, -0.02],
    scale: [1, 0.98, 1.12],
  });
  part(hood, cached('hood-drape', () => new THREE.SphereGeometry(0.118, 16, 12, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.46)), mats.cloth, {
    pos: [0, -0.012, -0.072],
    rot: [0.38, 0, 0],
    scale: [1.06, 1.7, 0.86],
  });
  // Brow arc frames the face opening so the eyes still read from the front.
  part(hood, cached('hood-brow', () => new THREE.TorusGeometry(0.107, 0.026, 8, 22, Math.PI * 1.26)), trimMaterial ?? mats.cloth, {
    pos: [0, 0.004, 0.03],
    rot: [-0.3, 0, Math.PI * -0.13],
    scale: [1, 1, 0.8],
  });
  part(hood, cached('hood-collar', () => new THREE.TorusGeometry(0.102, 0.03, 8, 20)), mats.cloth, {
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

// The stave sits in the XY plane so the whole D-shape faces the viewer. Held
// edge-on, as it was, the bow vanished into a single vertical line.
function buildBow(mats) {
  const bow = new THREE.Group();
  part(bow, cached('bow-limb', () => new THREE.TorusGeometry(0.185, 0.015, 6, 24, Math.PI * 1.12)), mats.wood, {
    rot: [0, 0, Math.PI * 0.44],
  });
  part(bow, cached('bow-grip', () => new THREE.CylinderGeometry(0.022, 0.022, 0.075, 8)), mats.leather, {
    pos: [-0.183, 0, 0],
  });
  for (const side of [-1, 1]) {
    part(bow, cached('bow-tip', () => new THREE.SphereGeometry(0.019, 8, 8)), mats.gold, {
      pos: [0.035, side * 0.182, 0],
      shadow: false,
    });
  }
  const string = part(bow, cached('bow-string', () => new THREE.CylinderGeometry(0.004, 0.004, 0.362, 4)), mats.trim, {
    pos: [0.035, 0, 0],
    shadow: false,
  });
  part(bow, cached('bow-arrow', () => new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6)), mats.wood, {
    pos: [-0.05, 0.012, 0.012],
    rot: [0, 0, Math.PI / 2],
    shadow: false,
  });
  part(bow, cached('bow-arrow-head', () => new THREE.ConeGeometry(0.019, 0.055, 7)), mats.steel, {
    pos: [-0.222, 0.012, 0.012],
    rot: [0, 0, -Math.PI / 2],
    shadow: false,
  });
  return { group: bow, string };
}

function buildQuiver(mats) {
  const quiver = new THREE.Group();
  part(quiver, cached('quiver-body', () => new THREE.CylinderGeometry(0.048, 0.042, 0.22, 12)), mats.leather);
  part(quiver, cached('quiver-band', () => new THREE.TorusGeometry(0.05, 0.008, 6, 14)), mats.gold, {
    pos: [0, 0.06, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  const shaft = cached('arrow-shaft', () => new THREE.CylinderGeometry(0.005, 0.005, 0.2, 5));
  const fletch = cached('arrow-fletch', () => new THREE.ConeGeometry(0.02, 0.05, 4));
  const spots = [
    [0, 0.19, 0],
    [0.026, 0.175, 0.018],
    [-0.024, 0.18, -0.016],
  ];
  spots.forEach(([x, y, z], i) => {
    part(quiver, shaft, mats.wood, { pos: [x, y, z], rot: [0, 0, i * 0.06 - 0.06] });
    part(quiver, fletch, mats.trim, { pos: [x, y + 0.11, z] });
  });
  return quiver;
}

function buildStaff(mats) {
  const staff = new THREE.Group();
  part(staff, cached('staff-shaft', () => new THREE.CylinderGeometry(0.016, 0.021, 0.62, 9)), mats.wood, {
    pos: [0, 0.08, 0],
  });
  part(staff, cached('staff-collar', () => new THREE.CylinderGeometry(0.028, 0.028, 0.04, 10)), mats.gold, {
    pos: [0, 0.36, 0],
  });
  part(staff, cached('staff-claw', () => new THREE.TorusGeometry(0.056, 0.013, 6, 16, Math.PI * 1.5)), mats.gold, {
    pos: [0, 0.44, 0],
    rot: [0, 0, Math.PI * 0.25],
  });
  const orb = part(staff, cached('staff-orb', () => new THREE.SphereGeometry(0.048, 16, 14)), mats.arcane, {
    pos: [0, 0.445, 0],
    shadow: false,
  });
  const runeRing = part(staff, cached('rune-ring', () => new THREE.TorusGeometry(0.082, 0.006, 6, 28)), mats.arcane, {
    pos: [0, 0.445, 0],
    rot: [Math.PI / 2.4, 0, 0],
    shadow: false,
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

function buildSwordsman(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats);
  const torso = addTorso(group, mats, { width: 1.02 });
  part(torso, cached('chest-plate', () => new THREE.BoxGeometry(0.16, 0.13, 0.03)), mats.trim, {
    pos: [0, 0.03, 0.098],
  });
  addPauldrons(group, mats);
  addGorget(group, mats);
  addCape(group, mats);
  const armL = addArm(group, mats, -1, {});
  const armR = addArm(group, mats, 1, {});
  const head = addHead(group, mats);
  const eyes = addEyes(head, mats);
  part(head, cached('helm-shell', () => new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)), mats.armor, {
    pos: [0, 0.014, 0],
    scale: [1, 1.02, 1],
  });
  part(head, cached('helm-brim', () => new THREE.TorusGeometry(0.116, 0.013, 8, 20)), mats.trim, {
    pos: [0, 0.036, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  part(head, cached('helm-crest', () => new THREE.BoxGeometry(0.02, 0.062, 0.17)), mats.trim, {
    pos: [0, 0.115, -0.012],
  });

  const sword = buildSword(mats);
  sword.position.set(0.012, 0.025, 0.045);
  sword.rotation.set(-0.24, 0, 0.34);
  armR.hand.add(sword);
  armR.pivot.rotation.set(-0.36, 0, 0.28);
  armL.pivot.rotation.set(0.1, 0, -0.12);

  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, eyes, weapon: sword };
}

function buildArcher(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.072, legLength: 0.17 });
  const torso = addTorso(group, mats, { width: 0.94, height: 0.25, y: 0.47 });
  part(torso, cached('archer-strap', () => new THREE.BoxGeometry(0.05, 0.28, 0.02)), mats.leather, {
    pos: [0.02, 0.01, 0.1],
    rot: [0, 0, 0.42],
  });
  addPauldrons(group, mats, { radius: 0.07, x: 0.155, material: mats.leather });
  const armL = addArm(group, mats, -1, { shoulderX: 0.155, sleeveMat: mats.cloth });
  const armR = addArm(group, mats, 1, { shoulderX: 0.155, sleeveMat: mats.cloth });
  const head = addHead(group, mats, { y: 0.715 });
  const eyes = addEyes(head, mats, { y: 0.004 });
  const hood = addHood(group, mats, { y: 0.735 });

  const quiver = buildQuiver(mats);
  quiver.position.set(-0.11, 0.44, -0.11);
  quiver.rotation.set(0.18, 0, 0.42);
  group.add(quiver);

  const bow = buildBow(mats);
  bow.group.position.set(-0.02, -0.02, 0.075);
  bow.group.rotation.set(0.2, -0.34, 0.1);
  armL.hand.add(bow.group);
  armL.pivot.rotation.set(-1.12, 0, -0.24);
  armR.pivot.rotation.set(-0.72, 0, 0.42);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    hood,
    bowString: bow.string,
  };
}

function buildShield(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.095, legLength: 0.13 });
  const torso = addTorso(group, mats, { width: 1.16, height: 0.27, y: 0.44 });
  part(torso, cached('shield-plate', () => new THREE.BoxGeometry(0.2, 0.14, 0.035)), mats.steel, {
    pos: [0, 0.02, 0.1],
  });
  addPauldrons(group, mats, { radius: 0.088, x: 0.182, y: 0.565, material: mats.armor, rimMaterial: mats.steel });
  addGorget(group, mats, 0.6);
  const armL = addArm(group, mats, -1, { shoulderX: 0.19, shoulderY: 0.54, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.19, shoulderY: 0.54, sleeveMat: mats.armorDeep });
  const head = addHead(group, mats, { y: 0.7, radius: 0.105 });
  const eyes = addEyes(head, mats, { z: 0.102, y: 0.008, size: 0.014 });
  // Flat-topped great helm: a sphere just read as a shiny bald head under the
  // shoulder plates.
  part(head, cached('great-helm', () => new THREE.CylinderGeometry(0.114, 0.126, 0.19, 14)), mats.steel, {
    pos: [0, 0.026, 0],
    scale: [1, 1, 0.94],
  });
  part(head, cached('great-helm-crown', () => new THREE.SphereGeometry(0.114, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), mats.steel, {
    pos: [0, 0.12, 0],
    scale: [1, 0.5, 0.94],
  });
  part(head, cached('great-helm-visor', () => new THREE.BoxGeometry(0.17, 0.028, 0.03)), mats.charcoal, {
    pos: [0, 0.012, 0.102],
  });
  part(head, cached('great-helm-nasal', () => new THREE.BoxGeometry(0.028, 0.12, 0.03)), mats.charcoal, {
    pos: [0, -0.028, 0.104],
  });
  part(head, cached('great-helm-band', () => new THREE.TorusGeometry(0.118, 0.014, 8, 22)), mats.gold, {
    pos: [0, 0.084, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 0.94, 1],
  });
  const hornGeo = cached('great-helm-horn', () => new THREE.ConeGeometry(0.03, 0.11, 8));
  for (const side of [-1, 1]) {
    part(head, hornGeo, mats.gold, {
      pos: [side * 0.11, 0.14, -0.01],
      rot: [0, 0, side * 0.9],
    });
  }

  const shield = new THREE.Group();
  part(shield, shieldGeometry(), mats.armor);
  part(shield, cached('shield-boss', () => new THREE.SphereGeometry(0.052, 14, 10)), mats.gold, {
    pos: [0, 0, 0.032],
    scale: [1, 1, 0.6],
  });
  part(shield, cached('shield-cross-v', () => new THREE.BoxGeometry(0.045, 0.44, 0.014)), mats.trim, {
    pos: [0, -0.005, 0.028],
  });
  part(shield, cached('shield-cross-h', () => new THREE.BoxGeometry(0.28, 0.045, 0.014)), mats.trim, {
    pos: [0, 0.06, 0.028],
  });
  shield.position.set(-0.02, -0.05, 0.08);
  shield.rotation.set(0, -0.2, 0.05);
  armL.hand.add(shield);
  armL.pivot.rotation.set(-0.5, 0, -0.18);

  const mace = new THREE.Group();
  part(mace, cached('mace-shaft', () => new THREE.CylinderGeometry(0.018, 0.021, 0.26, 8)), mats.wood, {
    pos: [0, -0.02, 0],
  });
  part(mace, cached('mace-pommel', () => new THREE.SphereGeometry(0.026, 10, 8)), mats.gold, {
    pos: [0, -0.155, 0],
  });
  part(mace, cached('mace-collar', () => new THREE.CylinderGeometry(0.032, 0.028, 0.03, 10)), mats.gold, {
    pos: [0, 0.098, 0],
  });
  part(mace, cached('mace-core', () => new THREE.CylinderGeometry(0.038, 0.038, 0.1, 10)), mats.steel, {
    pos: [0, 0.155, 0],
  });
  // Flanges instead of a single lump: the profile has to survive being 40px tall.
  const flangeGeo = cached('mace-flange', () => new THREE.BoxGeometry(0.026, 0.098, 0.06));
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    part(mace, flangeGeo, mats.steel, {
      pos: [Math.sin(angle) * 0.05, 0.155, Math.cos(angle) * 0.05],
      rot: [0, angle, 0],
    });
  }
  part(mace, cached('mace-cap', () => new THREE.ConeGeometry(0.03, 0.055, 8)), mats.gold, {
    pos: [0, 0.228, 0],
  });
  mace.position.set(0, 0.03, 0.035);
  mace.rotation.set(-0.28, 0, 0.34);
  armR.hand.add(mace);
  armR.pivot.rotation.set(-0.34, 0, 0.24);

  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, eyes, shield };
}

// Boot tips under the hem: without them a robe cone reads as a chess pawn.
function addRobeFeet(parent, mats, { y = 0.032, x = 0.072, z = 0.185 } = {}) {
  const bootGeo = cached('robe-boot', () => new THREE.BoxGeometry(0.075, 0.055, 0.11));
  for (const side of [-1, 1]) {
    part(parent, bootGeo, mats.leather, { pos: [side * x, y, z], rot: [0, side * -0.14, 0] });
  }
}

function buildMage(mats) {
  const group = new THREE.Group();
  const robe = part(group, cached('robe', () => new THREE.CylinderGeometry(0.14, 0.28, 0.38, 16, 2, true)), mats.cloth, {
    pos: [0, 0.19, 0],
  });
  addRobeFeet(group, mats, { z: 0.2 });
  part(group, cached('robe-hem', () => new THREE.TorusGeometry(0.275, 0.016, 8, 26)), mats.trim, {
    pos: [0, 0.014, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  part(group, cached('robe-hem-trim', () => new THREE.TorusGeometry(0.243, 0.012, 8, 26)), mats.gold, {
    pos: [0, 0.075, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: false,
  });
  const torso = addTorso(group, mats, { width: 0.92, height: 0.22, y: 0.47, material: mats.cloth });
  part(torso, cached('mage-sash', () => new THREE.BoxGeometry(0.06, 0.26, 0.02)), mats.trim, {
    pos: [0.01, 0.0, 0.095],
    rot: [0, 0, 0.36],
  });
  part(torso, cached('mage-brooch', () => new THREE.SphereGeometry(0.026, 12, 10)), mats.arcane, {
    pos: [0, 0.09, 0.1],
    shadow: false,
  });
  const armL = addArm(group, mats, -1, { shoulderX: 0.15, shoulderY: 0.56, sleeveMat: mats.cloth });
  const armR = addArm(group, mats, 1, { shoulderX: 0.15, shoulderY: 0.56, sleeveMat: mats.cloth });
  const head = addHead(group, mats, { y: 0.72, radius: 0.107 });
  const eyes = addEyes(head, mats, { y: -0.005, z: 0.096, size: 0.015 });
  part(head, cached('beard', () => new THREE.ConeGeometry(0.06, 0.14, 10)), mats.trim, {
    pos: [0, -0.09, 0.055],
    rot: [0.24, 0, 0],
  });
  const hat = new THREE.Group();
  hat.position.set(0, 0.075, 0);
  part(hat, cached('hat-brim', () => new THREE.TorusGeometry(0.13, 0.024, 8, 22)), mats.cloth, {
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 0.7],
  });
  part(hat, cached('hat-cone', () => new THREE.ConeGeometry(0.125, 0.24, 14, 2)), mats.cloth, {
    pos: [0, 0.13, -0.012],
    rot: [-0.14, 0, 0.05],
  });
  part(hat, cached('hat-band', () => new THREE.TorusGeometry(0.104, 0.016, 8, 20)), mats.trim, {
    pos: [0, 0.038, -0.004],
    rot: [-Math.PI / 2, 0, 0],
  });
  const hatGem = part(hat, cached('hat-gem', () => new THREE.OctahedronGeometry(0.032, 0)), mats.arcane, {
    pos: [0.026, 0.245, -0.028],
    shadow: false,
  });
  head.add(hat);

  const staff = buildStaff(mats);
  staff.group.position.set(0.02, -0.13, 0.05);
  staff.group.rotation.set(-0.12, 0, -0.34);
  armR.hand.add(staff.group);
  armR.pivot.rotation.set(-0.16, 0, 0.06);
  armL.pivot.rotation.set(0.18, 0, -0.2);

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

function buildPriest(mats) {
  const group = new THREE.Group();
  const robe = part(
    group,
    cached('priest-robe', () => new THREE.CylinderGeometry(0.13, 0.25, 0.38, 16, 2, true)),
    mats.cloth,
    { pos: [0, 0.19, 0] }
  );
  addRobeFeet(group, mats, { x: 0.066, z: 0.172 });
  part(group, cached('priest-robe-hem', () => new THREE.TorusGeometry(0.245, 0.014, 8, 26)), mats.gold, {
    pos: [0, 0.014, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  part(group, cached('priest-robe-seam', () => new THREE.BoxGeometry(0.046, 0.36, 0.03)), mats.gold, {
    pos: [0, 0.19, 0.196],
    rot: [-0.16, 0, 0],
  });
  const torso = addTorso(group, mats, { width: 0.86, height: 0.22, y: 0.47, material: mats.cloth });
  part(torso, cached('priest-cross-v', () => new THREE.BoxGeometry(0.025, 0.17, 0.018)), mats.gold, {
    pos: [0, 0, 0.1],
  });
  part(torso, cached('priest-cross-h', () => new THREE.BoxGeometry(0.1, 0.024, 0.018)), mats.gold, {
    pos: [0, 0.025, 0.102],
  });

  const armL = addArm(group, mats, -1, { shoulderX: 0.145, shoulderY: 0.56, sleeveMat: mats.cloth });
  const armR = addArm(group, mats, 1, { shoulderX: 0.145, shoulderY: 0.56, sleeveMat: mats.cloth });
  const head = addHead(group, mats, { y: 0.72, radius: 0.105 });
  const eyes = addEyes(head, mats, { y: -0.004, z: 0.095, size: 0.015 });
  const hood = addHood(group, mats, { y: 0.72 });

  const staff = new THREE.Group();
  part(staff, cached('priest-staff-shaft', () => new THREE.CylinderGeometry(0.015, 0.02, 0.62, 9)), mats.wood, {
    pos: [0, 0.08, 0],
  });
  part(staff, cached('priest-staff-cross-v', () => new THREE.BoxGeometry(0.025, 0.2, 0.025)), mats.gold, {
    pos: [0, 0.43, 0],
  });
  part(staff, cached('priest-staff-cross-h', () => new THREE.BoxGeometry(0.14, 0.026, 0.026)), mats.gold, {
    pos: [0, 0.46, 0],
  });
  const orb = part(staff, cached('priest-halo-orb', () => new THREE.SphereGeometry(0.035, 14, 12)), mats.arcane, {
    pos: [0, 0.5, 0],
    shadow: false,
  });
  staff.position.set(0.02, -0.13, 0.04);
  staff.rotation.set(-0.1, 0, -0.28);
  armR.hand.add(staff);
  armR.pivot.rotation.set(-0.14, 0, 0.05);
  armL.pivot.rotation.set(0.12, 0, -0.28);

  return {
    group,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    robe,
    hood,
    orb,
  };
}

function buildAssassin(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.07, legLength: 0.18, bootMat: mats.charcoal });
  const torso = addTorso(group, mats, { width: 0.9, height: 0.25, y: 0.48, material: mats.charcoal });
  part(torso, cached('assassin-harness', () => new THREE.BoxGeometry(0.055, 0.28, 0.02)), mats.armor, {
    pos: [0, 0, 0.093],
    rot: [0, 0, -0.4],
  });
  part(torso, cached('assassin-buckles', () => new THREE.BoxGeometry(0.032, 0.032, 0.026)), mats.gold, {
    pos: [-0.05, 0.06, 0.098],
  });
  const armL = addArm(group, mats, -1, { shoulderX: 0.148, shoulderY: 0.57, sleeveMat: mats.charcoal });
  const armR = addArm(group, mats, 1, { shoulderX: 0.148, shoulderY: 0.57, sleeveMat: mats.charcoal });
  const head = addHead(group, mats, { y: 0.73, radius: 0.104 });
  const eyes = addEyes(head, mats, { y: 0.004, z: 0.094, size: 0.018 });
  part(head, cached('mask', () => new THREE.SphereGeometry(0.108, 16, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.42)), mats.charcoal, {
    pos: [0, 0, 0.004],
    scale: [1, 1.05, 1],
  });
  const hood = addHood(group, mats, { y: 0.75 });
  const scarf = new THREE.Group();
  scarf.position.set(0.02, 0.6, -0.04);
  part(scarf, cached('scarf', () => new THREE.BoxGeometry(0.05, 0.3, 0.014)), mats.cloth, {
    pos: [0, -0.13, 0],
    rot: [0.3, 0.2, 0.18],
  });
  group.add(scarf);

  const daggerR = buildDagger(mats);
  daggerR.position.set(0, 0.0, 0.05);
  daggerR.rotation.set(-0.3, 0, -1.5);
  armR.hand.add(daggerR);
  const daggerL = buildDagger(mats);
  daggerL.position.set(0, 0.0, 0.05);
  daggerL.rotation.set(-0.2, 0, 0.4);
  armL.hand.add(daggerL);
  armR.pivot.rotation.set(-0.55, 0, 0.3);
  armL.pivot.rotation.set(-0.25, 0, -0.34);

  return { group, torso, head, armL: armL.pivot, armR: armR.pivot, eyes, hood, scarf };
}

function viperCoilGeometry() {
  return cached('viper-coil', () => {
    const points = [];
    const turns = 2.15;
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const angle = p * Math.PI * 2 * turns;
      const radius = 0.215 - p * 0.09;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.054 + p * 0.096, Math.sin(angle) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 76, 0.055, 10, false);
  });
}

function viperNeckGeometry() {
  return cached('viper-neck', () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.073, 0, 0.101),
      new THREE.Vector3(0.045, 0.1, 0.055),
      new THREE.Vector3(-0.018, 0.21, -0.008),
      new THREE.Vector3(-0.026, 0.34, -0.016),
      new THREE.Vector3(0, 0.44, 0.028),
      new THREE.Vector3(0, 0.5, 0.08),
    ]);
    return new THREE.TubeGeometry(curve, 56, 0.047, 10, false);
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
  const scaleDeepMat = standard(0x15602f, { roughness: 0.58, metalness: 0.1 });
  const bellyMat = standard(0xe8dfa2, { roughness: 0.72, metalness: 0.04 });
  const poisonMat = standard(0x86efac, {
    roughness: 0.3,
    emissive: 0x22c55e,
    emissiveIntensity: 1.1,
  });
  const extraMaterials = [scaleMat, scaleDeepMat, bellyMat, poisonMat];

  part(group, viperCoilGeometry(), scaleMat);
  // Dorsal saddle: a flat team-coloured patch on the coil, visible from above.
  part(group, cached('viper-saddle', () => new THREE.BoxGeometry(0.14, 0.022, 0.18)), mats.armorDeep, {
    pos: [0.04, 0.175, 0.02],
    rot: [0, 0.45, 0],
  });
  part(group, cached('viper-tail', () => new THREE.ConeGeometry(0.052, 0.16, 10)), scaleDeepMat, {
    pos: [0.255, 0.06, -0.055],
    rot: [Math.PI / 2, 0, -0.9],
  });

  const torso = new THREE.Group();
  torso.position.set(0, 0.15, 0);
  group.add(torso);
  part(torso, viperNeckGeometry(), scaleMat);
  // Collar ring at the neck base — readable from every camera angle.
  part(torso, cached('viper-collar', () => new THREE.TorusGeometry(0.058, 0.013, 8, 20)), mats.armor, {
    pos: [0, 0.02, 0.04],
    rot: [0.4, 0, 0],
    shadow: false,
  });

  const head = new THREE.Group();
  head.position.set(0, 0.525, 0.1);
  head.rotation.x = 0.2;
  torso.add(head);

  // Flared cobra hood: the single silhouette cue that sells "snake" at tile size.
  // Outer hood carries the team colour; a smaller green inset keeps the viper read.
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
  const markGeo = cached('viper-hood-mark', () => new THREE.RingGeometry(0.016, 0.032, 16));
  for (const side of [-1, 1]) {
    part(head, markGeo, mats.trim, {
      pos: [side * 0.058, 0.056, -0.052],
      rot: [-0.5, 0, 0],
      shadow: false,
    });
  }

  part(head, cached('viper-skull', () => new THREE.SphereGeometry(0.079, 16, 12)), scaleMat, {
    scale: [1.18, 0.8, 1.34],
  });
  part(head, cached('viper-snout', () => new THREE.ConeGeometry(0.05, 0.115, 10)), scaleMat, {
    pos: [0, -0.014, 0.094],
    rot: [Math.PI / 2, 0, 0],
    scale: [1.1, 1, 0.8],
  });
  part(head, cached('viper-jaw', () => new THREE.BoxGeometry(0.082, 0.028, 0.115)), bellyMat, {
    pos: [0, -0.042, 0.062],
    rot: [0.12, 0, 0],
  });

  const browGeo = cached('viper-brow', () => new THREE.BoxGeometry(0.05, 0.018, 0.055));
  for (const side of [-1, 1]) {
    part(head, browGeo, scaleDeepMat, { pos: [side * 0.05, 0.038, 0.042], rot: [0.2, 0, side * 0.24] });
  }
  const eyes = addEyes(head, mats, { y: 0.016, z: 0.072, spread: 0.053, size: 0.014 });

  const fangGeo = cached('viper-fang', () => new THREE.ConeGeometry(0.013, 0.055, 6));
  for (const side of [-1, 1]) {
    part(head, fangGeo, bellyMat, {
      pos: [side * 0.028, -0.062, 0.085],
      rot: [0.3, 0, side * 0.16],
      shadow: false,
    });
  }
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.044, 0.122);
  tongue.rotation.x = 0.3;
  part(tongue, cached('viper-tongue', () => new THREE.BoxGeometry(0.008, 0.004, 0.05)), poisonMat, {
    pos: [0, 0, 0.025],
    shadow: false,
  });
  for (const side of [-1, 1]) {
    part(tongue, cached('viper-tongue-tip', () => new THREE.BoxGeometry(0.006, 0.004, 0.03)), poisonMat, {
      pos: [side * 0.011, 0, 0.062],
      rot: [0, side * -0.42, 0],
      shadow: false,
    });
  }
  head.add(tongue);

  return { group, torso, head, eyes, extraMaterials };
}

function buildBomber(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.086, legLength: 0.11, bootMat: mats.charcoal });
  const torso = new THREE.Group();
  torso.position.set(0, 0.42, 0);
  part(torso, cached('bomber-belly', () => new THREE.SphereGeometry(0.17, 16, 14)), mats.armor, {
    scale: [1, 0.92, 0.88],
  });
  part(torso, cached('bomber-belt', () => new THREE.TorusGeometry(0.15, 0.022, 8, 22)), mats.leather, {
    pos: [0, -0.06, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 0.9],
  });
  const pouch = cached('bomber-pouch', () => new THREE.SphereGeometry(0.038, 10, 8));
  part(torso, pouch, mats.charcoal, { pos: [-0.12, -0.07, 0.09] });
  part(torso, pouch, mats.charcoal, { pos: [0.13, -0.07, 0.06] });

  // Bandolier of spare charges: the belly alone gave no hint of the class.
  const bandolier = new THREE.Group();
  bandolier.rotation.z = 0.6;
  part(bandolier, cached('bomber-strap', () => new THREE.TorusGeometry(0.158, 0.019, 8, 24)), mats.leather, {
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 0.86],
  });
  const chargeGeo = cached('bomber-charge', () => new THREE.SphereGeometry(0.032, 12, 10));
  const capGeo = cached('bomber-charge-cap', () => new THREE.CylinderGeometry(0.012, 0.014, 0.018, 8));
  for (const angle of [0.75, 1.3, 1.85]) {
    const x = Math.cos(angle) * 0.158;
    const z = Math.sin(angle) * 0.158 * 0.86;
    part(bandolier, chargeGeo, mats.charcoal, { pos: [x, 0, z] });
    part(bandolier, capGeo, mats.gold, { pos: [x, 0.036, z], shadow: false });
  }
  torso.add(bandolier);
  group.add(torso);

  const armL = addArm(group, mats, -1, { shoulderX: 0.165, shoulderY: 0.5, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.165, shoulderY: 0.5, sleeveMat: mats.armorDeep });
  const head = addHead(group, mats, { y: 0.66, radius: 0.108 });
  const eyes = addEyes(head, mats, { y: -0.046, z: 0.094, spread: 0.042, size: 0.013 });

  // Flight cap with ear flaps. The shell stops above the brow line so the
  // goggles below it are not buried inside the leather.
  part(head, cached('bomber-cap', () => new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.44)), mats.leather, {
    pos: [0, 0.03, -0.004],
    scale: [1, 1.05, 1],
  });
  const flapGeo = cached('bomber-earflap', () => new THREE.SphereGeometry(0.052, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62));
  for (const side of [-1, 1]) {
    part(head, flapGeo, mats.leather, {
      pos: [side * 0.098, 0.006, -0.008],
      rot: [0, 0, side * 1.85],
      scale: [1, 1.35, 1],
    });
  }
  part(head, cached('bomber-cap-seam', () => new THREE.TorusGeometry(0.113, 0.011, 6, 22)), mats.charcoal, {
    pos: [0, 0.058, 0],
    rot: [-Math.PI / 2, 0, 0],
    scale: [0.86, 0.86, 1],
    shadow: false,
  });

  const goggleLens = cached('goggle-lens', () => new THREE.CylinderGeometry(0.034, 0.034, 0.024, 14));
  const goggleRim = cached('goggle-rim', () => new THREE.TorusGeometry(0.037, 0.011, 6, 18));
  for (const side of [-1, 1]) {
    part(head, goggleLens, mats.ember, {
      pos: [side * 0.043, 0.03, 0.094],
      rot: [Math.PI / 2 - 0.14, 0, 0],
      shadow: false,
    });
    part(head, goggleRim, mats.steel, { pos: [side * 0.043, 0.03, 0.098], rot: [0.14, 0, 0] });
  }
  part(head, cached('goggle-bridge', () => new THREE.BoxGeometry(0.03, 0.014, 0.02)), mats.steel, {
    pos: [0, 0.03, 0.101],
    shadow: false,
  });
  // Open at the front so the strap runs behind the head instead of across the
  // lenses it is supposed to be holding on.
  part(head, cached('goggle-strap', () => new THREE.TorusGeometry(0.112, 0.013, 6, 22, Math.PI * 1.2)), mats.charcoal, {
    pos: [0, 0.03, -0.004],
    rot: [Math.PI / 2 - 0.14, 0, Math.PI * 0.7],
    scale: [1, 1, 0.92],
  });
  part(head, cached('bomber-scarf', () => new THREE.TorusGeometry(0.085, 0.028, 8, 18)), mats.cloth, {
    pos: [0, -0.086, -0.006],
    rot: [-Math.PI / 2 + 0.12, 0, 0],
    scale: [1, 1.1, 1],
  });

  const bomb = buildBomb(mats);
  bomb.group.position.set(0, -0.03, 0.06);
  bomb.group.rotation.set(-0.2, 0, 0);
  armR.hand.add(bomb.group);
  armR.pivot.rotation.set(-0.72, 0, 0.22);
  armL.pivot.rotation.set(0.16, 0, -0.26);

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

  part(wing, cached('eagle-shoulder', () => new THREE.SphereGeometry(0.075, 14, 10)), mats.armor, {
    pos: [0.055, 0, -0.01],
    scale: [1.7, 0.62, 1.3],
  });
  part(wing, cached('eagle-radius', () => new THREE.CapsuleGeometry(0.026, 0.16, 5, 10)), mats.armorDeep, {
    pos: [0.16, -0.004, 0.012],
    rot: [0, 0, Math.PI / 2],
  });

  const primaries = 6;
  for (let i = 0; i < primaries; i++) {
    const p = i / (primaries - 1);
    addWingFeather(wing, featherGeometry(0.26 - p * 0.055, 0.086, 0.016), i % 2 ? mats.armorDeep : mats.armor, {
      yaw: 0.2 + p * 0.66,
      droop: -0.06 - p * 0.16,
      x: 0.16,
      y: -0.006 - p * 0.005,
    });
  }

  const secondaries = 5;
  for (let i = 0; i < secondaries; i++) {
    const p = i / (secondaries - 1);
    addWingFeather(wing, featherGeometry(0.17 - p * 0.04, 0.08, 0.016), i % 2 ? mats.armor : mats.armorDeep, {
      yaw: 0.92 + p * 0.36,
      droop: -0.03,
      x: 0.05 + p * 0.065,
      y: -0.004,
    });
  }

  const coverts = 5;
  for (let i = 0; i < coverts; i++) {
    const p = i / (coverts - 1);
    addWingFeather(wing, featherGeometry(0.1 - p * 0.018, 0.062, 0.014), mats.trim, {
      yaw: 0.36 + p * 0.52,
      droop: 0.06,
      x: 0.048 + p * 0.05,
      y: 0.028,
    });
  }

  return wing;
}

function buildEagle(mats) {
  const group = new THREE.Group();

  const torso = part(
    group,
    cached('eagle-body', () => new THREE.SphereGeometry(0.19, 18, 14)),
    mats.armorDeep,
    { pos: [0, 0.38, -0.01], scale: [0.74, 0.98, 1.5], rot: [0.2, 0, 0] }
  );

  const chest = part(
    group,
    cached('eagle-chest', () => new THREE.SphereGeometry(0.14, 16, 12)),
    mats.armor,
    { pos: [0, 0.4, 0.15], scale: [0.84, 1.18, 0.68] }
  );
  // Ruff where the white head meets the dark body, the way a bald eagle reads.
  const ruffGeo = cached('eagle-ruff', () => featherGeometry(0.075, 0.05, 0.009));
  for (let i = 0; i < 7; i++) {
    const angle = -0.95 + (i / 6) * 1.9;
    part(group, ruffGeo, mats.trim, {
      pos: [Math.sin(angle) * 0.115, 0.5, 0.11 + Math.cos(angle) * 0.055],
      rot: [-Math.PI / 2 + 1.15, angle, 0],
      shadow: false,
    });
  }

  const head = new THREE.Group();
  head.position.set(0, 0.57, 0.22);
  part(head, cached('eagle-head', () => new THREE.SphereGeometry(0.108, 18, 14)), mats.trim, {
    scale: [0.94, 1, 1.1],
  });
  // Heavy brow shading the eyes is what makes a raptor look like a raptor.
  part(head, cached('eagle-brow', () => new THREE.BoxGeometry(0.165, 0.03, 0.06)), mats.steel, {
    pos: [0, 0.042, 0.072],
    rot: [0.34, 0, 0],
  });
  part(head, cached('eagle-cere', () => new THREE.SphereGeometry(0.05, 12, 10)), mats.gold, {
    pos: [0, 0.006, 0.086],
    scale: [1, 0.85, 0.7],
  });
  part(head, cached('eagle-beak', () => new THREE.ConeGeometry(0.045, 0.15, 10)), mats.gold, {
    pos: [0, -0.012, 0.145],
    rot: [Math.PI / 2 - 0.22, 0, 0],
    scale: [1, 1, 0.72],
  });
  part(head, cached('eagle-beak-hook', () => new THREE.ConeGeometry(0.022, 0.055, 8)), mats.gold, {
    pos: [0, -0.014, 0.202],
    rot: [-1.05, 0, 0],
    shadow: false,
  });
  const eyes = addEyes(head, mats, { z: 0.088, y: 0.014, spread: 0.055, size: 0.016 });
  group.add(head);

  const wings = {};
  for (const side of [-1, 1]) {
    const wing = buildEagleWing(mats);
    wing.position.set(side * 0.1, 0.45, 0);
    // Dihedral: flat wings read as an aeroplane from the front.
    wing.rotation.z = side * 0.3;
    wing.scale.x = side;
    group.add(wing);
    wings[side < 0 ? 'left' : 'right'] = wing;
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.27, -0.28);
  tail.rotation.x = 0.16;
  for (let i = 0; i < 5; i++) {
    const spread = (i / 4 - 0.5) * 0.85;
    const pivot = new THREE.Group();
    // Ry of +PI/2 aims the feather down -Z; spread fans it out from there.
    pivot.rotation.set(0, Math.PI / 2 + spread, -0.16);
    part(pivot, featherGeometry(0.24 - Math.abs(spread) * 0.07, 0.08, 0.014), i % 2 ? mats.trim : mats.steel, {
      pos: [0.02, 0, 0],
      rot: [-Math.PI / 2, 0, 0],
      shadow: false,
    });
    tail.add(pivot);
  }
  group.add(tail);

  const toeGeo = cached('eagle-toe', () => new THREE.ConeGeometry(0.015, 0.075, 6));
  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    foot.position.set(side * 0.07, 0.21, 0.05);
    part(foot, cached('eagle-shank', () => new THREE.CylinderGeometry(0.022, 0.026, 0.075, 8)), mats.gold, {
      pos: [0, 0.03, 0],
    });
    for (const [tx, tz, tilt] of [[0.03, 0.05, 0.7], [-0.03, 0.05, 0.7], [0, -0.045, -0.8]]) {
      part(foot, toeGeo, mats.gold, { pos: [tx, -0.02, tz], rot: [tilt, 0, 0] });
    }
    group.add(foot);
  }

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

  part(cannon, cached('bombard-tube', () => new THREE.CylinderGeometry(0.058, 0.048, 0.34, 14)), mats.steel, {
    pos: [0, 0.07, 0],
  });
  part(cannon, cached('bombard-mouth', () => new THREE.CylinderGeometry(0.076, 0.06, 0.06, 14)), mats.gold, {
    pos: [0, 0.265, 0],
  });
  part(cannon, cached('bombard-bore', () => new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12)), mats.charcoal, {
    pos: [0, 0.285, 0],
    shadow: false,
  });
  const bandGeo = cached('bombard-band', () => new THREE.TorusGeometry(0.06, 0.013, 8, 18));
  part(cannon, bandGeo, mats.gold, { pos: [0, 0.16, 0], rot: [-Math.PI / 2, 0, 0] });
  part(cannon, bandGeo, mats.gold, { pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] });
  part(cannon, cached('bombard-breech', () => new THREE.SphereGeometry(0.062, 14, 12)), mats.charcoal, {
    pos: [0, -0.11, 0],
    scale: [1, 1.15, 1],
  });
  part(cannon, cached('bombard-touchhole', () => new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8)), mats.gold, {
    pos: [0, -0.075, -0.055],
    rot: [-0.5, 0, 0],
    shadow: false,
  });

  // Timber stock and fore-grip: gives the hands somewhere believable to sit.
  part(cannon, cached('bombard-stock', () => new THREE.BoxGeometry(0.07, 0.22, 0.06)), mats.wood, {
    pos: [0, -0.15, -0.008],
    rot: [0.22, 0, 0],
  });
  part(cannon, cached('bombard-grip', () => new THREE.CylinderGeometry(0.019, 0.019, 0.11, 8)), mats.wood, {
    pos: [0, 0.03, 0.075],
    rot: [0, 0, Math.PI / 2],
  });

  return cannon;
}

function buildShellPouch(mats) {
  const pouch = new THREE.Group();
  part(pouch, cached('shell-pouch', () => new THREE.CylinderGeometry(0.06, 0.052, 0.11, 12)), mats.leather);
  part(pouch, cached('shell-pouch-lip', () => new THREE.TorusGeometry(0.06, 0.01, 6, 16)), mats.gold, {
    pos: [0, 0.052, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  const shellGeo = cached('shell-ball', () => new THREE.SphereGeometry(0.03, 12, 10));
  const spots = [
    [0.025, 0.072, 0.014],
    [-0.024, 0.068, -0.012],
    [0.004, 0.078, -0.03],
  ];
  for (const [x, y, z] of spots) {
    part(pouch, shellGeo, mats.charcoal, { pos: [x, y, z] });
  }
  return pouch;
}

function buildArtillery(mats) {
  const group = new THREE.Group();
  const legs = addLegs(group, mats, { spread: 0.082, legLength: 0.14 });
  const torso = addTorso(group, mats, { width: 0.98, height: 0.25, y: 0.45 });
  part(torso, cached('artillery-strap', () => new THREE.BoxGeometry(0.05, 0.24, 0.02)), mats.leather, {
    pos: [-0.02, 0.02, 0.1],
    rot: [0, 0, -0.35],
  });
  addPauldrons(group, mats, { radius: 0.074, x: 0.16, material: mats.armorDeep });
  const armL = addArm(group, mats, -1, { shoulderX: 0.16, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.16, sleeveMat: mats.armorDeep });
  const head = addHead(group, mats, { y: 0.71, radius: 0.108 });
  const eyes = addEyes(head, mats, { y: 0.002, z: 0.095, size: 0.014 });
  part(head, cached('artillery-helm', () => new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), mats.armor, {
    pos: [0, 0.012, 0],
  });
  part(head, cached('artillery-helm-rim', () => new THREE.TorusGeometry(0.108, 0.012, 8, 18)), mats.trim, {
    pos: [0, 0.03, 0],
    rot: [-Math.PI / 2, 0, 0],
  });

  const cannon = buildBombard(mats);
  // Braced against the right shoulder and canted up-forward, so the charge
  // animation on armR reads as raising the barrel to fire.
  cannon.position.set(0.012, 0.02, 0.05);
  cannon.rotation.set(1.96, -0.2, -0.06);
  cannon.scale.setScalar(1.1);
  armR.hand.add(cannon);
  armR.pivot.rotation.set(-0.8, 0.04, 0.24);
  armL.pivot.rotation.set(-1.2, 0, 0.34);

  const pouch = buildShellPouch(mats);
  pouch.position.set(-0.145, 0.36, -0.04);
  pouch.rotation.set(0.12, 0, 0.24);
  group.add(pouch);

  return {
    group,
    legs,
    torso,
    head,
    armL: armL.pivot,
    armR: armR.pivot,
    eyes,
    cannon,
  };
}

// One bolt thrower, aimed down +Z; four of these on the deck replace the old
// bolts that speared straight through the middle of the tower.
function buildBallista(mats) {
  const ballista = new THREE.Group();

  part(ballista, cached('ballista-mount', () => new THREE.BoxGeometry(0.1, 0.045, 0.1)), mats.armorDeep, {
    pos: [0, 0.022, 0],
  });
  part(ballista, cached('ballista-stock', () => new THREE.BoxGeometry(0.05, 0.042, 0.2)), mats.wood, {
    pos: [0, 0.066, 0.045],
    rot: [-0.16, 0, 0],
  });
  const limbGeo = cached('ballista-limb', () => new THREE.BoxGeometry(0.13, 0.024, 0.024));
  for (const side of [-1, 1]) {
    part(ballista, limbGeo, mats.wood, {
      pos: [side * 0.068, 0.08, 0.085],
      rot: [0, side * -0.3, side * -0.18],
    });
    part(ballista, cached('ballista-nut', () => new THREE.SphereGeometry(0.016, 8, 8)), mats.gold, {
      pos: [side * 0.128, 0.086, 0.06],
      shadow: false,
    });
  }
  part(ballista, cached('ballista-string', () => new THREE.BoxGeometry(0.25, 0.008, 0.008)), mats.trim, {
    pos: [0, 0.086, 0.058],
    shadow: false,
  });
  part(ballista, cached('ballista-bolt', () => new THREE.CylinderGeometry(0.011, 0.011, 0.17, 7)), mats.wood, {
    pos: [0, 0.088, 0.115],
    rot: [Math.PI / 2 - 0.14, 0, 0],
  });
  part(ballista, cached('ballista-tip', () => new THREE.ConeGeometry(0.026, 0.065, 7)), mats.steel, {
    pos: [0, 0.104, 0.228],
    rot: [Math.PI / 2 - 0.14, 0, 0],
  });

  return ballista;
}

function buildTower(mats) {
  const group = new THREE.Group();

  part(group, cached('arrow-tower-foot', () => new THREE.BoxGeometry(0.6, 0.09, 0.6)), mats.armorDeep, {
    pos: [0, 0.045, 0],
  });
  part(group, cached('arrow-tower-plinth', () => new THREE.BoxGeometry(0.52, 0.07, 0.52)), mats.armor, {
    pos: [0, 0.125, 0],
  });
  part(group, cached('arrow-tower-shaft', () => new THREE.BoxGeometry(0.4, 0.42, 0.4)), mats.armor, {
    pos: [0, 0.37, 0],
  });

  // Corner pilasters and a mid band break up what used to be one flat block.
  const pilasterGeo = cached('arrow-tower-pilaster', () => new THREE.BoxGeometry(0.09, 0.42, 0.09));
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.2, 0.2]) {
      part(group, pilasterGeo, mats.armorDeep, { pos: [x, 0.37, z] });
    }
  }
  part(group, cached('arrow-tower-band', () => new THREE.BoxGeometry(0.44, 0.045, 0.44)), mats.trim, {
    pos: [0, 0.3, 0],
  });

  const slitGeo = cached('arrow-tower-slit', () => new THREE.BoxGeometry(0.06, 0.17, 0.02));
  const archGeo = cached('arrow-tower-slit-arch', () => new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10, 1, false, 0, Math.PI));
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2;
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    part(group, slitGeo, mats.charcoal, { pos: [nx * 0.209, 0.45, nz * 0.209], rot: [0, yaw, 0] });
    part(group, archGeo, mats.charcoal, {
      pos: [nx * 0.209, 0.535, nz * 0.209],
      rot: [Math.PI / 2, 0, yaw],
      shadow: false,
    });
  }

  part(group, cached('arrow-tower-corbel', () => new THREE.BoxGeometry(0.54, 0.055, 0.54)), mats.armorDeep, {
    pos: [0, 0.605, 0],
  });
  part(group, cached('arrow-tower-deck', () => new THREE.BoxGeometry(0.6, 0.05, 0.6)), mats.armor, {
    pos: [0, 0.657, 0],
  });

  const merlonGeo = cached('arrow-tower-merlon', () => new THREE.BoxGeometry(0.13, 0.15, 0.13));
  for (const x of [-0.23, 0.23]) {
    for (const z of [-0.23, 0.23]) {
      part(group, merlonGeo, mats.armorDeep, { pos: [x, 0.757, z] });
    }
  }

  const turret = new THREE.Group();
  turret.position.y = 0.682;
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2;
    const ballista = buildBallista(mats);
    ballista.position.set(Math.sin(yaw) * 0.19, 0, Math.cos(yaw) * 0.19);
    ballista.rotation.y = yaw;
    turret.add(ballista);
  }
  group.add(turret);

  // Mast and pennant: the only large flat surface that can carry the team
  // colour, which a grey keep otherwise has nowhere to show.
  part(group, cached('arrow-tower-mast', () => new THREE.CylinderGeometry(0.014, 0.016, 0.36, 8)), mats.wood, {
    pos: [0, 0.86, 0],
  });
  part(group, cached('arrow-tower-finial', () => new THREE.OctahedronGeometry(0.034, 0)), mats.gold, {
    pos: [0, 1.055, 0],
    shadow: false,
  });
  part(group, cached('arrow-tower-pennant', () => new THREE.BoxGeometry(0.006, 0.14, 0.23)), mats.ring, {
    pos: [0, 0.955, 0.118],
    shadow: false,
  });

  return { group, turret };
}

// Shoulders that flare out and then draw back into a trailing wisp, so the
// silhouette tapers instead of sitting on the tile like an egg.
function ghostShroudGeometry() {
  return cached('ghost-shroud', () => {
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
    return new THREE.LatheGeometry(profile, 26);
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
  const gauzeDeep = standard(base.clone().lerp(new THREE.Color(0x0b1220), 0.42), {
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const voidMat = standard(0x050a14, {
    roughness: 0.98,
    metalness: 0,
  });
  const extraMaterials = [gauze, gauzeDeep, voidMat];

  // The wraith floats, so the shroud starts well clear of the tile and the
  // torn hem tapers into the air rather than clipping through the ground.
  const torso = new THREE.Group();
  torso.position.set(0, 0.3, 0);
  group.add(torso);
  part(torso, ghostShroudGeometry(), gauze, { shadow: false });

  // Torn strips hanging off the hem; without them the tapered lathe reads as a
  // smooth teardrop rather than something that has been rotting for a century.
  const tatterGeo = cached('ghost-tatter', () => new THREE.ConeGeometry(0.05, 0.22, 6));
  const tatters = [
    [0.0, 0.8], [0.78, 0.5], [1.57, 0.9], [2.36, 0.6],
    [3.14, 0.85], [3.93, 0.45], [4.71, 0.75], [5.5, 0.55],
  ];
  for (const [angle, length] of tatters) {
    const r = 0.155;
    part(torso, tatterGeo, gauzeDeep, {
      // Flattened tangentially so each one reads as a hanging strip of cloth.
      pos: [Math.cos(angle) * r, 0.01 - 0.11 * length, Math.sin(angle) * r],
      rot: [Math.sin(angle) * 0.26, -angle, -Math.cos(angle) * 0.26],
      scale: [1.75, length, 0.4],
      shadow: false,
    });
  }

  const head = new THREE.Group();
  head.position.set(0, 0.58, 0);
  group.add(head);
  part(head, cached('ghost-skull', () => new THREE.SphereGeometry(0.115, 18, 14)), gauze, {
    scale: [1, 1.06, 0.96],
    shadow: false,
  });
  // Hollow face so the glow has something to sit in.
  // Pushed proud of the veil: behind it, the translucent skull washes the
  // hollow out to the same milky grey as the rest of the shroud.
  part(head, cached('ghost-void', () => new THREE.SphereGeometry(0.1, 16, 12)), voidMat, {
    pos: [0, -0.006, 0.052],
    scale: [0.9, 0.96, 0.8],
    shadow: false,
  });
  const eyes = addEyes(head, mats, { y: 0.024, z: 0.116, spread: 0.046, size: 0.024, socket: false });
  part(head, cached('ghost-mouth', () => new THREE.SphereGeometry(0.03, 12, 10)), mats.eye, {
    pos: [0, -0.05, 0.108],
    scale: [0.66, 1.15, 0.5],
    shadow: false,
  });

  // Wispy arms reaching forward; pivots so the shared idle sway still applies.
  const armGeo = cached('ghost-arm', () => new THREE.CapsuleGeometry(0.032, 0.16, 5, 10));
  const clawGeo = cached('ghost-claw', () => new THREE.ConeGeometry(0.03, 0.09, 7));
  const arms = {};
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.128, 0.5, 0.015);
    pivot.rotation.set(-1.0, 0, side * 0.34);
    part(pivot, armGeo, gauze, { pos: [0, -0.09, 0], scale: [1, 1, 1], shadow: false });
    part(pivot, clawGeo, gauzeDeep, { pos: [0, -0.2, 0.012], rot: [0.5, 0, 0], shadow: false });
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

function crabCrestFinGeometry() {
  return cached('crab-crest-fin', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.062, 0);
    shape.lineTo(0.062, 0);
    shape.bezierCurveTo(0.07, 0.06, 0.038, 0.115, 0, 0.135);
    shape.bezierCurveTo(-0.038, 0.115, -0.07, 0.06, -0.062, 0);
    return extrude(shape, 0.016, 0.005);
  });
}

function crabDomeGeometry() {
  return cached('crab-carapace-dome', () => {
    const geometry = new THREE.SphereGeometry(1, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
    geometry.computeVertexNormals();
    return geometry;
  });
}

// Arcs are baked flat at build time; composing them from mesh Euler angles fights
// the XYZ order and lands the sweep in the wrong plane.
function crabArcGeometry(key, radius, tube, arc) {
  return cached(key, () => {
    const geometry = new THREE.TorusGeometry(radius, tube, 8, 26, arc);
    geometry.rotateZ(Math.PI / 2 - arc / 2);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  });
}

function buildCrabClaw(side, mats, shellMat, clawMat, clawDeepMat, jointMat, bellyMat) {
  const claw = new THREE.Group();
  // Held out front and slightly raised: the reach is what sells the diagonal
  // threat, and it keeps the pincers clear of the shell from every angle.
  claw.position.set(side * 0.185, 0.03, 0.1);
  claw.rotation.set(-0.34, side * 0.54, 0);

  part(claw, cached('crab-shoulder', () => new THREE.SphereGeometry(0.05, 14, 12)), jointMat, {
    scale: [1, 0.88, 1],
  });
  part(claw, cached('crab-arm-upper', () => new THREE.CylinderGeometry(0.036, 0.046, 0.085, 12)), shellMat, {
    pos: [0, 0.004, 0.048],
    rot: [Math.PI / 2, 0, 0],
  });
  part(claw, cached('crab-elbow', () => new THREE.SphereGeometry(0.04, 12, 10)), jointMat, {
    pos: [0, 0.006, 0.094],
  });

  // The palm is a fat oval rather than a box; a slab here read as a pair of pliers.
  const palm = new THREE.Group();
  palm.position.set(0, 0.016, 0.16);
  // Rolled part-way over so the open pincer reads both head-on and from above.
  palm.rotation.set(0.1, side * -0.24, side * 0.42);
  claw.add(palm);
  part(palm, cached('crab-palm', () => new THREE.SphereGeometry(0.07, 16, 12)), clawMat, {
    scale: [0.78, 1, 1.24],
  });
  part(palm, cached('crab-palm-ridge', () => new THREE.BoxGeometry(0.02, 0.028, 0.11)), clawDeepMat, {
    pos: [0, 0.056, 0],
    shadow: false,
  });
  part(palm, crabArcGeometry('crab-claw-band', 0.06, 0.01, Math.PI * 2), mats.gold, {
    pos: [0, 0, -0.05],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.88],
    shadow: false,
  });

  const pincerGeo = cached('crab-pincer', () => new THREE.CylinderGeometry(0.009, 0.04, 0.105, 10));
  const toothGeo = cached('crab-pincer-tooth', () => new THREE.ConeGeometry(0.009, 0.022, 6));

  // A visible gap between the two fingers is what makes this read as a pincer, so
  // they stay parted rather than closed flush.
  const upperPinch = new THREE.Group();
  upperPinch.position.set(0, 0.036, 0.058);
  upperPinch.rotation.set(-0.34, 0, 0);
  palm.add(upperPinch);
  part(upperPinch, pincerGeo, clawMat, {
    pos: [0, 0, 0.052],
    rot: [Math.PI / 2, 0, 0],
  });
  for (const [z, y] of [[0.03, -0.026], [0.062, -0.016]]) {
    part(upperPinch, toothGeo, bellyMat, {
      pos: [0, y, z],
      rot: [Math.PI, 0, 0],
      shadow: false,
    });
  }

  const lowerPinch = new THREE.Group();
  lowerPinch.position.set(0, -0.032, 0.058);
  lowerPinch.rotation.set(0.26, 0, 0);
  palm.add(lowerPinch);
  part(lowerPinch, pincerGeo, clawDeepMat, {
    pos: [0, 0, 0.045],
    rot: [Math.PI / 2, 0, 0],
    scale: [0.88, 0.88, 0.84],
  });
  part(lowerPinch, toothGeo, bellyMat, { pos: [0, 0.02, 0.03], shadow: false });

  return claw;
}

function addCrabEyeStalk(parent, side, mats, shellMat) {
  const stalk = new THREE.Group();
  stalk.position.set(side * 0.066, 0.028, 0.05);
  stalk.rotation.set(-0.14, 0, side * -0.3);
  part(stalk, cached('crab-stalk', () => new THREE.CylinderGeometry(0.012, 0.017, 0.086, 10)), shellMat, {
    pos: [0, 0.043, 0],
  });
  part(stalk, crabArcGeometry('crab-stalk-ring', 0.016, 0.005, Math.PI * 2), mats.gold, {
    pos: [0, 0.072, 0],
    shadow: false,
  });
  part(stalk, cached('crab-eye-socket', () => new THREE.SphereGeometry(0.031, 12, 10)), mats.charcoal, {
    pos: [0, 0.1, 0],
    scale: [1, 0.94, 0.92],
  });
  const eye = part(stalk, cached('crab-eyeball', () => new THREE.SphereGeometry(0.023, 12, 10)), mats.eye, {
    pos: [0, 0.102, 0.014],
    shadow: false,
  });
  parent.add(stalk);
  return { stalk, eye };
}

// Legs hinge twice: the femur splays wide so the tips clear the shell outline
// from above, then the tibia drops back to vertical so the crab still stands.
function addCrabLeg(parent, side, z, fan, splay, mats, legMat, jointMat) {
  const leg = new THREE.Group();
  leg.position.set(side * 0.2, -0.012, z);
  leg.rotation.set(0, side * fan, side * splay);
  parent.add(leg);

  part(leg, cached('crab-leg-coxa', () => new THREE.SphereGeometry(0.027, 10, 10)), jointMat);
  part(leg, cached('crab-leg-femur', () => new THREE.CylinderGeometry(0.018, 0.024, 0.11, 9)), legMat, {
    pos: [0, -0.055, 0],
  });

  const knee = new THREE.Group();
  knee.position.set(0, -0.11, 0);
  knee.rotation.z = side * -(splay + 0.16);
  leg.add(knee);
  part(knee, cached('crab-leg-knee', () => new THREE.SphereGeometry(0.02, 9, 9)), jointMat, { shadow: false });
  part(knee, cached('crab-leg-tibia', () => new THREE.CylinderGeometry(0.012, 0.017, 0.078, 8)), legMat, {
    pos: [0, -0.042, 0],
  });
  part(knee, cached('crab-leg-tip', () => new THREE.ConeGeometry(0.013, 0.048, 7)), mats.charcoal, {
    pos: [0, -0.104, 0],
    rot: [Math.PI, 0, 0],
    shadow: false,
  });
  return leg;
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
  const shellDeepMat = standard(teamBase.clone().lerp(shadowTone, 0.5), {
    roughness: 0.52,
    metalness: 0.26,
  });
  const clawMat = standard(teamBase.clone().lerp(warm, 0.14), {
    roughness: 0.4,
    metalness: 0.16,
    emissive: teamBase.clone().lerp(shadowTone, 0.5),
    emissiveIntensity: 0.2,
  });
  const clawDeepMat = standard(teamBase.clone().lerp(shadowTone, 0.36), {
    roughness: 0.46,
    metalness: 0.24,
  });
  const legMat = standard(teamBase.clone().lerp(shadowTone, 0.62), {
    roughness: 0.66,
    metalness: 0.18,
  });
  const jointMat = standard(0x2b2233, { roughness: 0.6, metalness: 0.24 });
  const bellyMat = standard(0xf6dcb8, { roughness: 0.8, metalness: 0.04 });
  const extraMaterials = [shellMat, shellDeepMat, clawMat, clawDeepMat, legMat, jointMat, bellyMat];

  const body = new THREE.Group();
  body.position.set(0, 0.2, 0);
  group.add(body);

  // Outline plate for the top-down read, dome on top for volume from the side.
  part(body, crabCarapaceGeometry(), shellDeepMat, { pos: [0, -0.004, 0] });
  part(body, crabDomeGeometry(), shellMat, {
    pos: [0, 0.006, -0.008],
    scale: [0.244, 0.105, 0.152],
  });

  // Two shallow grooves break the dome into shell segments; without them the
  // ellipsoid reads as a helmet.
  for (const [z, radius, y] of [[-0.03, 0.15, 0.086], [-0.09, 0.1, 0.056]]) {
    part(body, crabArcGeometry(`crab-shell-groove-${z}`, radius, 0.007, Math.PI * 1.1), shellDeepMat, {
      pos: [0, y, z],
      scale: [1.25, 1, 1],
      shadow: false,
    });
  }

  const knobGeo = cached('crab-shell-knob', () => new THREE.SphereGeometry(0.026, 10, 8));
  for (const [x, y, z, s] of [
    [-0.11, 0.09, 0.02, 0.95],
    [0.11, 0.09, 0.02, 0.95],
    [-0.175, 0.056, -0.055, 0.8],
    [0.175, 0.056, -0.055, 0.8],
  ]) {
    part(body, knobGeo, shellMat, { pos: [x, y, z], scale: [s, s * 0.5, s], shadow: false });
  }

  part(body, crabArcGeometry('crab-shell-brow', 0.175, 0.012, Math.PI * 0.72), mats.gold, {
    pos: [0, 0.045, 0.01],
    scale: [1.18, 1, 1],
    shadow: false,
  });
  part(body, crabArcGeometry('crab-shell-rim', 0.23, 0.013, Math.PI * 2), shellDeepMat, {
    pos: [0, -0.012, -0.01],
    scale: [1.1, 1, 0.72],
    shadow: false,
  });

  const spikeGeo = cached('crab-shell-spike', () => new THREE.ConeGeometry(0.026, 0.085, 7));
  for (const side of [-1, 1]) {
    part(body, spikeGeo, shellDeepMat, {
      pos: [side * 0.295, 0.004, 0.018],
      rot: [0, 0.35, side * -1.46],
      shadow: false,
    });
    part(body, cached('crab-shell-tooth', () => new THREE.ConeGeometry(0.018, 0.055, 6)), shellDeepMat, {
      pos: [side * 0.222, 0.002, -0.095],
      rot: [0, 0, side * -1.05],
      shadow: false,
    });
  }

  part(body, cached('crab-belly-plate', () => new THREE.BoxGeometry(0.3, 0.045, 0.24)), bellyMat, {
    pos: [0, -0.045, -0.005],
  });

  // A forward-facing fan crest, so the "general" reads from the board's camera
  // instead of only in profile.
  const crest = new THREE.Group();
  crest.position.set(0, 0.1, -0.01);
  body.add(crest);
  part(crest, cached('crab-crest-base', () => new THREE.CylinderGeometry(0.038, 0.058, 0.03, 14)), mats.armorDeep);
  part(crest, crabCrestFinGeometry(), mats.armor, {
    pos: [0, 0.02, 0.004],
    rot: [-0.22, 0, 0],
  });
  part(crest, cached('crab-crest-gem', () => new THREE.OctahedronGeometry(0.026, 0)), mats.trim, {
    pos: [0, 0.036, 0.03],
    rot: [0, 0, Math.PI / 4],
    shadow: false,
  });
  for (const side of [-1, 1]) {
    part(crest, cached('crab-crest-horn', () => new THREE.ConeGeometry(0.012, 0.09, 6)), mats.gold, {
      pos: [side * 0.075, 0.075, 0.01],
      rot: [-0.2, 0, side * 0.62],
      shadow: false,
    });
  }

  const banner = new THREE.Group();
  banner.position.set(0.02, 0.055, -0.13);
  banner.rotation.set(-0.34, 0, 0.12);
  body.add(banner);
  part(banner, cached('crab-banner-pole', () => new THREE.CylinderGeometry(0.008, 0.01, 0.17, 8)), mats.gold, {
    pos: [0, 0.085, 0],
  });
  part(banner, cached('crab-banner-cloth', () => new THREE.BoxGeometry(0.115, 0.095, 0.011)), mats.cloth, {
    pos: [0.056, 0.115, 0],
    rot: [0, 0, -0.08],
  });
  part(banner, cached('crab-banner-crest', () => new THREE.OctahedronGeometry(0.021, 0)), mats.trim, {
    pos: [0.056, 0.115, 0.011],
    shadow: false,
  });
  part(banner, cached('crab-banner-tip', () => new THREE.ConeGeometry(0.015, 0.042, 6)), mats.trim, {
    pos: [0, 0.19, 0],
    shadow: false,
  });

  // Face sits in the notch under the front lip, where the shell overhangs it.
  const head = new THREE.Group();
  head.position.set(0, -0.012, 0.132);
  body.add(head);
  part(head, cached('crab-face-plate', () => new THREE.BoxGeometry(0.13, 0.058, 0.06)), shellDeepMat, {
    pos: [0, 0, 0.005],
    rot: [0.12, 0, 0],
  });
  part(head, cached('crab-maxilliped', () => new THREE.BoxGeometry(0.075, 0.036, 0.03)), bellyMat, {
    pos: [0, -0.03, 0.026],
    rot: [0.24, 0, 0],
    shadow: false,
  });
  const mandibleGeo = cached('crab-mandible', () => new THREE.ConeGeometry(0.014, 0.05, 6));
  for (const side of [-1, 1]) {
    part(head, mandibleGeo, jointMat, {
      pos: [side * 0.042, -0.026, 0.03],
      rot: [1.5, 0, side * 0.34],
      shadow: false,
    });
  }

  const eyeStalks = {};
  for (const side of [-1, 1]) {
    eyeStalks[side < 0 ? 'left' : 'right'] = addCrabEyeStalk(head, side, mats, shellMat);
  }
  const eyes = [eyeStalks.left.eye, eyeStalks.right.eye];

  const clawL = buildCrabClaw(-1, mats, shellMat, clawMat, clawDeepMat, jointMat, bellyMat);
  const clawR = buildCrabClaw(1, mats, shellMat, clawMat, clawDeepMat, jointMat, bellyMat);
  body.add(clawL);
  body.add(clawR);

  for (const [z, fan, splay] of [
    [0.062, 0.42, 0.9],
    [-0.02, 0.04, 1.08],
    [-0.105, -0.4, 0.94],
  ]) {
    for (const side of [-1, 1]) {
      addCrabLeg(body, side, z, fan, splay, mats, legMat, jointMat);
    }
  }

  return {
    group,
    torso: body,
    head,
    armL: clawL,
    armR: clawR,
    eyes,
    crest,
    banner,
    eyeStalkL: eyeStalks.left.stalk,
    eyeStalkR: eyeStalks.right.stalk,
    extraMaterials,
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
  priest: buildPriest,
  ghost: buildGhost,
  viper: buildViper,
  crabGeneral: buildCrabGeneral,
};

// Keeps every class inside roughly one tile of height while preserving silhouette contrast.
const GLOBAL_SCALE = 0.88;

const SILHOUETTE = {
  swordsman: [1, 1, 1],
  archer: [0.94, 1.04, 0.94],
  artillery: [1.02, 0.96, 1.04],
  tower: [0.92, 0.92, 0.92],
  shield: [1.1, 0.94, 1.08],
  mage: [0.96, 1.02, 0.96],
  assassin: [0.92, 1.03, 0.92],
  bomber: [1.06, 0.9, 1.06],
  eagle: [1, 1, 1],
  priest: [0.94, 1, 0.94],
  ghost: [0.9, 1.08, 0.9],
  viper: [0.98, 1.04, 0.98],
  crabGeneral: [1.14, 0.86, 1.14],
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
