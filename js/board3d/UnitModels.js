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

export function createMaterialSet(team, ownerSeat = null, matchFormat = '1v1') {
  const base = new THREE.Color(resolveUnitColor(team, ownerSeat, matchFormat));
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

function addEyes(head, mats, { z = 0.098, y = 0.012, spread = 0.044, size = 0.02 } = {}) {
  const geo = cached(`eye-${size}`, () => new THREE.SphereGeometry(size, 8, 8));
  const eyes = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, geo, mats.eye, { pos: [side * spread, y, z], shadow: false }));
  }
  return eyes;
}

function addPauldrons(parent, mats, { y = 0.575, x = 0.168, radius = 0.082, material = mats.trim } = {}) {
  const geo = cached(`pauldron-${radius}`, () =>
    new THREE.SphereGeometry(radius, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)
  );
  for (const side of [-1, 1]) {
    part(parent, geo, material, { pos: [side * x, y, 0], rot: [0, 0, side * -0.4], scale: [1, 0.9, 1] });
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

function addHood(parent, mats, { y = 0.7 } = {}) {
  const hood = new THREE.Group();
  hood.position.set(0, y, 0);
  part(hood, cached('hood-shell', () => new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)), mats.cloth, {
    pos: [0, 0.01, -0.012],
    scale: [1, 1.1, 1.08],
  });
  part(hood, cached('hood-cone', () => new THREE.ConeGeometry(0.1, 0.16, 12, 1, true)), mats.cloth, {
    pos: [0, 0.12, -0.05],
    rot: [-0.55, 0, 0],
  });
  part(hood, cached('hood-collar', () => new THREE.TorusGeometry(0.1, 0.028, 8, 18)), mats.cloth, {
    pos: [0, -0.085, -0.01],
    rot: [-Math.PI / 2 + 0.18, 0, 0],
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

function buildBow(mats) {
  const bow = new THREE.Group();
  part(bow, cached('bow-limb', () => new THREE.TorusGeometry(0.18, 0.014, 6, 20, Math.PI * 1.1)), mats.wood, {
    rot: [0, Math.PI / 2, -Math.PI * 0.55],
  });
  for (const side of [-1, 1]) {
    part(bow, cached('bow-tip', () => new THREE.SphereGeometry(0.018, 8, 8)), mats.gold, {
      pos: [0, side * 0.168, 0.06],
    });
  }
  const string = part(bow, cached('bow-string', () => new THREE.CylinderGeometry(0.0035, 0.0035, 0.335, 4)), mats.trim, {
    pos: [0, 0, 0.062],
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
  sword.position.set(0.01, 0.02, 0.05);
  sword.rotation.set(-0.32, 0, -0.16);
  armR.hand.add(sword);
  armR.pivot.rotation.set(-0.24, 0, 0.05);
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
  bow.group.position.set(0, -0.03, 0.06);
  bow.group.rotation.set(0, 0, 0.18);
  armL.hand.add(bow.group);
  armL.pivot.rotation.set(-1.02, 0, -0.16);
  armR.pivot.rotation.set(-0.66, 0, 0.5);

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
  addPauldrons(group, mats, { radius: 0.084, x: 0.178, y: 0.565, material: mats.steel });
  addGorget(group, mats, 0.6);
  const armL = addArm(group, mats, -1, { shoulderX: 0.19, shoulderY: 0.54, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.19, shoulderY: 0.54, sleeveMat: mats.armorDeep });
  const head = addHead(group, mats, { y: 0.7, radius: 0.105 });
  const eyes = addEyes(head, mats, { z: 0.1, y: 0.005, size: 0.014 });
  part(head, cached('great-helm', () => new THREE.SphereGeometry(0.116, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.8)), mats.steel, {
    pos: [0, 0.014, 0],
    scale: [1, 1.04, 1],
  });
  part(head, cached('helm-slit', () => new THREE.BoxGeometry(0.14, 0.024, 0.03)), mats.charcoal, {
    pos: [0, 0.012, 0.098],
  });
  part(head, cached('helm-horn', () => new THREE.TorusGeometry(0.055, 0.012, 6, 14, Math.PI)), mats.gold, {
    pos: [0, 0.075, -0.02],
    rot: [0, Math.PI / 2, 0],
  });

  const shield = new THREE.Group();
  part(shield, shieldGeometry(), mats.armor);
  part(shield, cached('shield-boss', () => new THREE.SphereGeometry(0.052, 14, 10)), mats.gold, {
    pos: [0, 0, 0.032],
    scale: [1, 1, 0.6],
  });
  part(shield, cached('shield-bar', () => new THREE.BoxGeometry(0.26, 0.022, 0.012)), mats.trim, {
    pos: [0, 0.12, 0.03],
  });
  part(shield, cached('shield-bar2', () => new THREE.BoxGeometry(0.24, 0.022, 0.012)), mats.trim, {
    pos: [0, -0.06, 0.03],
  });
  shield.position.set(-0.02, -0.05, 0.08);
  shield.rotation.set(0, -0.2, 0.05);
  armL.hand.add(shield);
  armL.pivot.rotation.set(-0.5, 0, -0.18);

  const mace = new THREE.Group();
  part(mace, cached('mace-shaft', () => new THREE.CylinderGeometry(0.018, 0.02, 0.24, 8)), mats.wood);
  part(mace, cached('mace-head', () => new THREE.IcosahedronGeometry(0.056, 0)), mats.steel, {
    pos: [0, 0.14, 0],
  });
  mace.position.set(0, 0.02, 0.04);
  mace.rotation.set(-0.3, 0, -0.1);
  armR.hand.add(mace);
  armR.pivot.rotation.set(-0.2, 0, 0.12);

  return { group, legs, torso, head, armL: armL.pivot, armR: armR.pivot, eyes, shield };
}

function buildMage(mats) {
  const group = new THREE.Group();
  const robe = part(group, cached('robe', () => new THREE.CylinderGeometry(0.14, 0.28, 0.38, 16, 2, true)), mats.cloth, {
    pos: [0, 0.19, 0],
  });
  part(group, cached('robe-hem', () => new THREE.TorusGeometry(0.275, 0.016, 8, 26)), mats.trim, {
    pos: [0, 0.014, 0],
    rot: [-Math.PI / 2, 0, 0],
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
  part(group, cached('priest-robe-hem', () => new THREE.TorusGeometry(0.245, 0.014, 8, 26)), mats.gold, {
    pos: [0, 0.014, 0],
    rot: [-Math.PI / 2, 0, 0],
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

function buildViper(mats) {
  const group = new THREE.Group();
  const scaleMat = standard(0x4ade80, {
    roughness: 0.48,
    metalness: 0.18,
    emissive: 0x14532d,
    emissiveIntensity: 0.35,
  });
  const bellyMat = standard(0xfef08a, { roughness: 0.72, metalness: 0.04 });
  const poisonMat = standard(0x22c55e, {
    roughness: 0.32,
    emissive: 0x15803d,
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.92,
  });

  const torso = new THREE.Group();
  torso.position.set(0, 0.24, 0);
  group.add(torso);

  const segmentGeo = cached('viper-segment', () => new THREE.SphereGeometry(0.075, 12, 10));
  const coil = [
    [0, 0, 0], [0.09, 0.015, 0.04], [0.13, 0.04, -0.02], [0.07, 0.035, -0.11],
    [-0.05, 0.028, -0.13], [-0.11, 0.02, -0.05], [-0.07, 0.012, 0.05],
  ];
  for (const [x, y, z] of coil) {
    part(torso, segmentGeo, scaleMat, { pos: [x, y, z], scale: [1, 0.82, 1] });
  }
  part(torso, segmentGeo, bellyMat, { pos: [0, -0.02, 0], scale: [0.85, 0.55, 0.85], shadow: false });

  const head = part(torso, cached('viper-head', () => new THREE.SphereGeometry(0.095, 14, 12)), scaleMat, {
    pos: [0.15, 0.055, 0.055],
    scale: [1.15, 0.88, 1.2],
  });
  part(head, cached('viper-snout', () => new THREE.ConeGeometry(0.042, 0.11, 8)), scaleMat, {
    pos: [0, -0.015, 0.09],
    rot: [Math.PI / 2, 0, 0],
  });
  const eyes = addEyes(head, mats, { y: 0.015, z: 0.055, spread: 0.048, size: 0.013 });
  const fangGeo = cached('viper-fang', () => new THREE.ConeGeometry(0.011, 0.045, 6));
  part(head, fangGeo, mats.gold, { pos: [-0.022, -0.045, 0.088], rot: [0.35, 0, 0.18], shadow: false });
  part(head, fangGeo, mats.gold, { pos: [0.022, -0.045, 0.088], rot: [0.35, 0, -0.18], shadow: false });
  part(head, cached('viper-tongue', () => new THREE.BoxGeometry(0.007, 0.003, 0.055)), poisonMat, {
    pos: [0, -0.035, 0.12],
    rot: [0.25, 0, 0],
    shadow: false,
  });

  return { group, torso, head, eyes };
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
  group.add(torso);

  const armL = addArm(group, mats, -1, { shoulderX: 0.165, shoulderY: 0.5, sleeveMat: mats.armorDeep });
  const armR = addArm(group, mats, 1, { shoulderX: 0.165, shoulderY: 0.5, sleeveMat: mats.armorDeep });
  const head = addHead(group, mats, { y: 0.66, radius: 0.108 });
  const eyes = addEyes(head, mats, { y: -0.02, z: 0.096, size: 0.013 });
  part(head, cached('bomber-cap', () => new THREE.SphereGeometry(0.118, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), mats.leather, {
    pos: [0, 0.016, 0],
  });
  const goggleLens = cached('goggle-lens', () => new THREE.CylinderGeometry(0.036, 0.036, 0.022, 12));
  const goggleRim = cached('goggle-rim', () => new THREE.TorusGeometry(0.038, 0.009, 6, 16));
  for (const side of [-1, 1]) {
    part(head, goggleLens, mats.ember, {
      pos: [side * 0.046, 0.03, 0.084],
      rot: [Math.PI / 2, 0, 0],
      shadow: false,
    });
    part(head, goggleRim, mats.steel, { pos: [side * 0.046, 0.03, 0.086] });
  }
  part(head, cached('goggle-strap', () => new THREE.TorusGeometry(0.108, 0.011, 6, 20)), mats.charcoal, {
    pos: [0, 0.03, 0],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.9],
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

function buildEagle(mats) {
  const group = new THREE.Group();

  const torso = part(
    group,
    cached('eagle-body', () => new THREE.SphereGeometry(0.2, 18, 14)),
    mats.armorDeep,
    { pos: [0, 0.38, 0], scale: [0.82, 1.05, 1.45], rot: [0.16, 0, 0] }
  );

  const chest = part(
    group,
    cached('eagle-chest', () => new THREE.SphereGeometry(0.14, 16, 12)),
    mats.armor,
    { pos: [0, 0.4, 0.16], scale: [0.82, 1.2, 0.65] }
  );

  const head = new THREE.Group();
  head.position.set(0, 0.58, 0.24);
  part(head, cached('eagle-head', () => new THREE.SphereGeometry(0.12, 16, 12)), mats.steel, {
    scale: [0.9, 1, 1.08],
  });
  part(head, cached('eagle-brow', () => new THREE.BoxGeometry(0.15, 0.025, 0.035)), mats.steel, {
    pos: [0, 0.025, 0.105],
  });
  part(head, cached('eagle-beak', () => new THREE.ConeGeometry(0.055, 0.17, 8)), mats.gold, {
    pos: [0, -0.015, 0.16],
    rot: [Math.PI / 2, 0, 0],
  });
  const eyes = addEyes(head, mats, { z: 0.105, y: 0.012, spread: 0.05, size: 0.015 });
  group.add(head);

  const wingGeo = cached('eagle-wing-feather', () => new THREE.CapsuleGeometry(0.045, 0.34, 5, 10));
  const wings = {};
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.12, 0.46, 0);
    for (let i = 0; i < 4; i++) {
      part(wing, wingGeo, i === 0 ? mats.armor : mats.armorDeep, {
        pos: [side * (0.15 + i * 0.055), -i * 0.025, -0.035 - i * 0.025],
        rot: [0.08 + i * 0.04, 0, side * (Math.PI / 2 - 0.16 - i * 0.05)],
        scale: [1 - i * 0.08, 1, 0.72],
      });
    }
    group.add(wing);
    wings[side < 0 ? 'left' : 'right'] = wing;
  }

  const tailGeo = cached('eagle-tail-feather', () => new THREE.CapsuleGeometry(0.035, 0.22, 5, 8));
  for (const side of [-1, 0, 1]) {
    part(group, tailGeo, mats.steel, {
      pos: [side * 0.055, 0.33, -0.25],
      rot: [Math.PI / 2.8, 0, side * 0.16],
      scale: [1, 1, 0.7],
    });
  }

  for (const side of [-1, 1]) {
    part(group, cached('eagle-talon', () => new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI)), mats.gold, {
      pos: [side * 0.075, 0.18, 0.08],
      rot: [Math.PI / 2, 0, side * 0.25],
    });
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

function buildCannon(mats) {
  const cannon = new THREE.Group();
  part(cannon, cached('cannon-wheel', () => new THREE.TorusGeometry(0.08, 0.022, 8, 16)), mats.charcoal, {
    pos: [-0.12, -0.04, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  part(cannon, cached('cannon-wheel2', () => new THREE.TorusGeometry(0.08, 0.022, 8, 16)), mats.charcoal, {
    pos: [0.12, -0.04, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  part(cannon, cached('cannon-carriage', () => new THREE.BoxGeometry(0.28, 0.06, 0.14)), mats.wood, {
    pos: [0, 0, 0],
  });
  part(cannon, cached('cannon-barrel', () => new THREE.CylinderGeometry(0.045, 0.055, 0.34, 10)), mats.steel, {
    pos: [0, 0.05, 0.12],
    rot: [Math.PI / 2, 0, 0],
  });
  part(cannon, cached('cannon-muzzle', () => new THREE.TorusGeometry(0.05, 0.012, 8, 14)), mats.gold, {
    pos: [0, 0.05, 0.29],
    rot: [Math.PI / 2, 0, 0],
  });
  return cannon;
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

  const cannon = buildCannon(mats);
  cannon.position.set(0.04, -0.08, 0.1);
  cannon.rotation.set(-0.15, 0.22, 0);
  group.add(cannon);

  armL.pivot.rotation.set(-0.42, 0, -0.28);
  armR.pivot.rotation.set(-0.38, 0, 0.22);

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

function buildTower(mats) {
  const group = new THREE.Group();

  part(group, cached('arrow-tower-foot', () => new THREE.BoxGeometry(0.58, 0.12, 0.58)), mats.armorDeep, {
    pos: [0, 0.06, 0],
  });
  part(group, cached('arrow-tower-body', () => new THREE.BoxGeometry(0.44, 0.52, 0.44)), mats.armor, {
    pos: [0, 0.36, 0],
  });
  part(group, cached('arrow-tower-band', () => new THREE.BoxGeometry(0.5, 0.07, 0.5)), mats.trim, {
    pos: [0, 0.25, 0],
  });
  part(group, cached('arrow-tower-deck', () => new THREE.BoxGeometry(0.62, 0.1, 0.62)), mats.armorDeep, {
    pos: [0, 0.67, 0],
  });

  const merlonGeo = cached('arrow-tower-merlon', () => new THREE.BoxGeometry(0.14, 0.18, 0.14));
  for (const x of [-0.23, 0.23]) {
    for (const z of [-0.23, 0.23]) {
      part(group, merlonGeo, mats.armor, { pos: [x, 0.79, z] });
    }
  }

  const slitGeo = cached('arrow-tower-slit', () => new THREE.BoxGeometry(0.075, 0.16, 0.018));
  part(group, slitGeo, mats.charcoal, { pos: [0, 0.43, 0.229] });
  part(group, slitGeo, mats.charcoal, { pos: [0, 0.43, -0.229] });
  part(group, slitGeo, mats.charcoal, {
    pos: [0.229, 0.43, 0],
    rot: [0, Math.PI / 2, 0],
  });
  part(group, slitGeo, mats.charcoal, {
    pos: [-0.229, 0.43, 0],
    rot: [0, Math.PI / 2, 0],
  });

  const turret = new THREE.Group();
  turret.position.y = 0.74;
  const shaftGeo = cached('arrow-tower-bolt-shaft', () => new THREE.CylinderGeometry(0.012, 0.012, 0.42, 7));
  const headGeo = cached('arrow-tower-bolt-head', () => new THREE.ConeGeometry(0.035, 0.09, 7));
  const launchers = [
    { shaft: [0.2, 0, 0], head: [0.44, 0, 0], rot: [0, 0, -Math.PI / 2] },
    { shaft: [-0.2, 0, 0], head: [-0.44, 0, 0], rot: [0, 0, Math.PI / 2] },
    { shaft: [0, 0, 0.2], head: [0, 0, 0.44], rot: [Math.PI / 2, 0, 0] },
    { shaft: [0, 0, -0.2], head: [0, 0, -0.44], rot: [-Math.PI / 2, 0, 0] },
  ];
  for (const launcher of launchers) {
    part(turret, shaftGeo, mats.wood, { pos: launcher.shaft, rot: launcher.rot });
    part(turret, headGeo, mats.steel, { pos: launcher.head, rot: launcher.rot });
  }
  part(turret, cached('arrow-tower-cap', () => new THREE.CylinderGeometry(0.1, 0.14, 0.11, 12)), mats.gold);
  group.add(turret);

  return { group, turret };
}

function buildGhost(mats) {
  const group = new THREE.Group();
  const sheet = part(
    group,
    cached('ghost-sheet', () => new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.72)),
    mats.cloth,
    { pos: [0, 0.38, 0], scale: [1, 1.15, 0.85] }
  );
  sheet.material = sheet.material.clone();
  sheet.material.transparent = true;
  sheet.material.opacity = 0.72;

  const head = part(group, cached('ghost-head', () => new THREE.SphereGeometry(0.12, 14, 12)), mats.cloth, {
    pos: [0, 0.62, 0],
    scale: [1.05, 0.95, 1],
  });
  head.material = head.material.clone();
  head.material.transparent = true;
  head.material.opacity = 0.78;

  const eyes = addEyes(head, mats, { y: -0.01, z: 0.1, spread: 0.055, size: 0.018 });
  part(group, cached('ghost-tail', () => new THREE.ConeGeometry(0.1, 0.22, 8)), mats.cloth, {
    pos: [0, 0.12, 0],
    scale: [1, 0.8, 0.7],
  });

  return { group, torso: sheet, head, eyes };
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
  eagle: [0.92, 0.92, 0.92],
  priest: [0.94, 1, 0.94],
  ghost: [0.9, 1.08, 0.9],
  viper: [0.92, 0.78, 0.92],
};

export function buildUnitModel(classId, team, { ownerSeat = null, matchFormat = '1v1' } = {}) {
  const mats = createMaterialSet(team, ownerSeat, matchFormat);
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
    materials: Object.values(mats),
  };
}
