import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geoCache = new Map();
let glowTex = null;
let shadowTex = null;

function cached(key, factory) {
  let geometry = geoCache.get(key);
  if (!geometry) {
    geometry = factory();
    geometry.userData.shared = true;
    geoCache.set(key, geometry);
  }
  return geometry;
}

function part(parent, geometry, material, { pos, rot, scale, shadow = false } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function radialTexture(stops) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  if (!glowTex) {
    glowTex = radialTexture([
      [0, 'rgba(255,255,255,0.95)'],
      [0.35, 'rgba(255,255,255,0.4)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  }
  return glowTex;
}

function shadowTexture() {
  if (!shadowTex) {
    shadowTex = radialTexture([
      [0, 'rgba(0,0,0,0.6)'],
      [0.5, 'rgba(0,0,0,0.26)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
  }
  return shadowTex;
}

function quad(radius) {
  return cached(`quad-${radius}`, () => new THREE.PlaneGeometry(radius * 2, radius * 2));
}

// Additive floor decal: reads as light spilling onto the tile, and keeps small
// props visible against the dark board without adding a real light source.
function addGlowDecal(root, radius, color, opacity) {
  const material = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = part(root, quad(radius), material, { pos: [0, 0.005, 0], rot: [-Math.PI / 2, 0, 0] });
  mesh.renderOrder = 2;
  return mesh;
}

function addContactShadow(root, radius, opacity = 0.55) {
  const material = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = part(root, quad(radius), material, { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0] });
  mesh.renderOrder = 1;
  return mesh;
}

// Sparks that spiral up out of a prop as it is consumed. They rise clear of the
// unit standing on the tile, which is the only part of a trigger guaranteed not
// to be hidden behind it. Solid rather than additive so they still read against
// a brightly lit unit.
function createMotes(root, color, { count = 6, size = 0.032, reach = 0.26, rise = 0.45 } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const geometry = cached(`prop-mote-${size}`, () => new THREE.SphereGeometry(size, 7, 6));

  const motes = [];
  for (let i = 0; i < count; i++) {
    const mesh = part(root, geometry, material, { pos: [0, 0, 0] });
    mesh.renderOrder = 3;
    motes.push({
      mesh,
      angle: (i / count) * Math.PI * 2 + 0.4,
      delay: (i % 3) * 0.1,
      reach: reach * (0.7 + (i % 4) * 0.15),
      rise: rise * (0.8 + (i % 3) * 0.2),
    });
  }

  return {
    update(p) {
      material.opacity = p > 0 ? 0.95 * (1 - p ** 2) : 0;
      for (const mote of motes) {
        const q = stage(p, mote.delay, 1);
        const spin = mote.angle + q * 1.2;
        mote.mesh.position.set(
          Math.cos(spin) * mote.reach * q,
          q * mote.rise,
          Math.sin(spin) * mote.reach * q,
        );
        mote.mesh.scale.setScalar(Math.max(0.001, 1 - q * 0.55));
      }
    },
  };
}

// A flat ring rushing outward across the tile: it ends up wider than the unit
// standing there, so it survives the occlusion the props themselves suffer.
function createShockRing(root, color, { inner = 0.14, outer = 0.2, y = 0.02 } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = part(root, cached(`prop-ring-${inner}-${outer}`, () => new THREE.RingGeometry(inner, outer, 30)), material, {
    pos: [0, y, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  mesh.renderOrder = 3;

  return {
    update(p, { peak = 0.95, grow = 1.4 } = {}) {
      material.opacity = p > 0 ? peak * (1 - p) : 0;
      mesh.scale.setScalar(0.6 + p * grow);
    },
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Progress of a sub-range of a 0..1 timeline, so each stage of a trigger can be
// written in terms of where it starts and ends.
function stage(p, from, to) {
  return clamp01((p - from) / (to - from));
}

function easeOutBack(t) {
  const c = 2.2;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function lathe(key, profile, segments = 24) {
  return cached(key, () => {
    const geometry = new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      segments,
    );
    geometry.computeVertexNormals();
    return geometry;
  });
}

/* ---------------------------------------------------------------- potion --- */

const FLASK_PROFILE = [
  [0.0, 0.0],
  [0.052, 0.002],
  [0.092, 0.018],
  [0.112, 0.056],
  [0.115, 0.1],
  [0.098, 0.138],
  [0.062, 0.168],
  [0.04, 0.19],
  [0.036, 0.245],
  [0.042, 0.268],
];

const LIQUID_LEVEL = 0.152;
const FLASK_REST_Y = 0.052;

function liquidProfile() {
  const points = [[0, 0.006]];
  for (const [x, y] of FLASK_PROFILE) {
    if (y <= 0.006 || y >= LIQUID_LEVEL) continue;
    points.push([x * 0.87, y]);
  }
  const surfaceRadius = 0.082;
  points.push([surfaceRadius, LIQUID_LEVEL]);
  points.push([0, LIQUID_LEVEL]);
  return points;
}

function buildPotion() {
  const root = new THREE.Group();

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x7cbcd8,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.17,
    side: THREE.DoubleSide,
    envMapIntensity: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  // Slightly translucent so the bubbles inside actually show through.
  const liquid = new THREE.MeshStandardMaterial({
    color: 0x8f1616,
    emissive: 0x7d1010,
    emissiveIntensity: 0.35,
    roughness: 0.28,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
  });
  const bubble = new THREE.MeshStandardMaterial({
    color: 0xffc9c9,
    emissive: 0xff6b6b,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    transparent: true,
    opacity: 0.75,
  });
  const cork = new THREE.MeshStandardMaterial({ color: 0xb98a5c, roughness: 0.92, metalness: 0.03 });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xf3c766,
    roughness: 0.3,
    metalness: 0.7,
    emissive: 0x6b3f04,
    emissiveIntensity: 0.3,
  });
  const label = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xfecdd3,
    emissiveIntensity: 0.4,
    roughness: 0.45,
  });

  const shadow = addContactShadow(root, 0.16, 0.5);
  const decal = addGlowDecal(root, 0.22, 0xff4646, 0.26);

  // Two pivots: `drink` carries the flask up and toward the camera, because a
  // unit standing on the tile completely hides anything left at ground level.
  // `float` is only the flask, so it can shrink away without taking the sparks
  // with it.
  const drink = new THREE.Group();
  root.add(drink);

  const float = new THREE.Group();
  float.position.y = FLASK_REST_Y;
  drink.add(float);

  part(float, lathe('potion-liquid', liquidProfile(), 22), liquid);
  part(float, lathe('potion-glass', FLASK_PROFILE, 24), glass, { shadow: true });
  part(float, cached('potion-collar', () => new THREE.TorusGeometry(0.042, 0.009, 6, 18)), gold, {
    pos: [0, 0.262, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  part(float, cached('potion-cork', () => new THREE.CylinderGeometry(0.032, 0.036, 0.05, 12)), cork, {
    pos: [0, 0.29, 0],
  });

  // A tiny cross on the belly is what makes this read as a heal pickup rather
  // than a generic bottle; the flask only sways so it never turns away.
  const crossBar = cached('potion-cross-bar', () => new THREE.BoxGeometry(0.058, 0.018, 0.014));
  part(float, crossBar, label, { pos: [0, 0.082, 0.104] });
  part(float, crossBar, label, { pos: [0, 0.082, 0.104], rot: [0, 0, Math.PI / 2] });

  const bubbleGeo = cached('potion-bubble', () => new THREE.SphereGeometry(0.011, 8, 6));
  const bubbles = [
    [-0.03, 0.045],
    [0.024, 0.085],
    [0.006, 0.118],
  ];
  for (const [x, y] of bubbles) {
    part(float, bubbleGeo, bubble, { pos: [x, y, 0.012] });
  }

  const burst = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: 0xff7b6b,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // Tilted halfway between flat and upright so the flash faces the fixed camera.
  const flash = part(drink, quad(0.62), burst, {
    pos: [0, FLASK_REST_Y + 0.06, 0],
    rot: [-Math.PI / 4, 0, 0],
  });
  flash.renderOrder = 3;

  const motes = createMotes(drink, 0xff8f8a, { reach: 0.34, rise: 0.16 });
  motes.update(0);

  const activate = (p) => {
    const lift = stage(p, 0, 0.34);
    const pop = stage(p, 0.34, 0.54);
    const trail = stage(p, 0.34, 1);

    // The flask lifts clear over the unit's head before it pops. Anything that
    // happens at tile level, or even at chest height, is either hidden by the
    // unit standing there or washed out against its lit body.
    drink.position.set(0, lift * 1.2, lift * 0.1);
    float.rotation.set(0, lift * 2.6, lift * 0.5);
    liquid.emissiveIntensity = 0.28 + lift * 1.2;
    float.scale.setScalar(Math.max(0.001, (1 - pop) * (1 - lift * 0.2)));

    flash.scale.setScalar(0.3 + pop);
    burst.opacity = 0.95 * (1 - pop) * (pop > 0 ? 1 : 0);
    decal.material.opacity = 0.26 * (1 - lift);
    shadow.material.opacity = 0.5 * (1 - lift);

    motes.update(trail);
  };

  return { root, activate, activateMs: 700 };
}

/* ---------------------------------------------------------------- spikes --- */

const SPIKE_RING = [0.2, 0.165, 0.185, 0.152, 0.19, 0.17];
const BLADE_REST_Y = 0.03;

function buildSpikes(rng) {
  const root = new THREE.Group();

  const iron = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.78, metalness: 0.4 });
  const pitFloor = new THREE.MeshStandardMaterial({ color: 0x141c2a, roughness: 0.95, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x8b98ab,
    roughness: 0.34,
    metalness: 0.85,
  });
  const bloodied = new THREE.MeshStandardMaterial({
    color: 0x6b1616,
    emissive: 0x3f0a0a,
    emissiveIntensity: 0.3,
    roughness: 0.5,
    metalness: 0.25,
  });

  // A sunken iron socket: the spikes need something to come out of, otherwise
  // they look like cones dropped on the tile. Everything lives under `pit` so
  // the sprung trap can sink out of sight behind the tile in one move.
  const pit = new THREE.Group();
  root.add(pit);

  addContactShadow(pit, 0.36, 0.65);

  const socket = new THREE.Group();
  socket.rotation.y = rng() * Math.PI * 2;
  pit.add(socket);

  part(socket, cached('spike-plate', () => new THREE.CylinderGeometry(0.29, 0.32, 0.04, 20)), iron, {
    pos: [0, 0.02, 0],
    shadow: true,
  });
  part(socket, cached('spike-hollow', () => new THREE.CircleGeometry(0.245, 20)), pitFloor, {
    pos: [0, 0.041, 0],
    rot: [-Math.PI / 2, 0, 0],
  });
  part(socket, cached('spike-rim', () => new THREE.TorusGeometry(0.278, 0.022, 6, 26)), iron, {
    pos: [0, 0.04, 0],
    rot: [Math.PI / 2, 0, 0],
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    part(socket, cached('spike-bolt', () => new THREE.SphereGeometry(0.015, 8, 6)), steel, {
      pos: [Math.cos(a) * 0.278, 0.052, Math.sin(a) * 0.278],
    });
  }

  const blades = new THREE.Group();
  blades.position.y = BLADE_REST_Y;
  socket.add(blades);

  const spikeGeo = cached('spike-blade', () => new THREE.ConeGeometry(0.042, 1, 4));
  const tipGeo = cached('spike-tip', () => new THREE.ConeGeometry(0.009, 0.032, 4));

  // `angle` is the spike's bearing from the pit centre; the pivot leans along it
  // so the outer blades splay away from the middle one.
  const addSpike = (angle, radius, height, tilt) => {
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    pivot.rotation.set(Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt);
    blades.add(pivot);
    part(pivot, spikeGeo, steel, {
      pos: [0, height / 2, 0],
      rot: [0, Math.PI / 4, 0],
      scale: [1, height, 1],
      shadow: true,
    });
    part(pivot, tipGeo, bloodied, { pos: [0, height - 0.014, 0], rot: [0, Math.PI / 4, 0] });
    part(pivot, cached('spike-collar', () => new THREE.CylinderGeometry(0.05, 0.058, 0.026, 8)), iron, {
      pos: [0, 0.01, 0],
    });
  };

  addSpike(0, 0, 0.36, 0);
  SPIKE_RING.forEach((height, i) => {
    addSpike((i / SPIKE_RING.length) * Math.PI * 2 + 0.35, 0.16, height + 0.03, 0.2);
  });

  const shock = createShockRing(socket, 0xffa06a, { inner: 0.27, outer: 0.305, y: 0.055 });

  const activate = (p) => {
    const thrust = stage(p, 0, 0.14);
    const settle = stage(p, 0.14, 0.44);
    const wave = stage(p, 0.02, 0.46);
    const sink = stage(p, 0.5, 0.92);

    // Punch up hard, drop back to the resting height, then take the whole trap
    // down behind the tile, which hides it without needing transparency. The
    // drop has to clear the tallest blade or the mesh pops out of existence.
    blades.position.y = BLADE_REST_Y + easeOutBack(thrust) * 0.13 - settle * 0.13;
    bloodied.emissiveIntensity = 0.2 + (thrust - settle * 0.8) * 1.6;

    shock.update(wave, { grow: 1.1 });

    pit.position.y = -sink * 0.55;
  };

  return { root, activate, activateMs: 760 };
}

/* ------------------------------------------------------------------- web --- */

const WEB_RADIUS = 0.36;
const WEB_SPOKES = 12;

// Anchored high at the rim and sagging into the middle, so a unit that walks in
// looks like it dropped into a funnel rather than standing on a doily.
function webHeight(r) {
  return 0.012 + 0.072 * Math.pow(r / WEB_RADIUS, 1.7);
}

function webSpokeGeometry() {
  const points = [];
  for (let i = 0; i <= 8; i++) {
    const r = (WEB_RADIUS * i) / 8;
    points.push(new THREE.Vector3(r, webHeight(r), 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.0055, 4, false);
}

// Chords dip between the spokes they hang from, which is what gives a web its
// scalloped edge instead of looking like concentric hoops.
function webRingGeometry(fraction) {
  const points = [];
  const r = WEB_RADIUS * fraction;
  const sag = r * 0.88;
  for (let i = 0; i < WEB_SPOKES; i++) {
    const a = (i / WEB_SPOKES) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * r, webHeight(r), Math.sin(a) * r));
    const am = ((i + 0.5) / WEB_SPOKES) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(am) * sag, webHeight(sag) - 0.003, Math.sin(am) * sag));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 64, 0.0045, 4, false);
}

// Every strand shares one material, so the whole web can collapse into a single
// draw call instead of twenty.
function webGeometry() {
  return cached('web-silk', () => {
    const strands = [];
    for (let i = 0; i < WEB_SPOKES; i++) {
      strands.push(webSpokeGeometry().rotateY((i / WEB_SPOKES) * Math.PI * 2));
    }
    for (const fraction of [0.32, 0.52, 0.74, 0.95]) {
      strands.push(webRingGeometry(fraction));
    }
    const merged = mergeGeometries(strands);
    for (const strand of strands) strand.dispose();
    return merged;
  });
}

function addSpider(parent) {
  const chitin = new THREE.MeshStandardMaterial({ color: 0x232a36, roughness: 0.5, metalness: 0.25 });
  const eye = new THREE.MeshStandardMaterial({
    color: 0xfca5a5,
    emissive: 0xef4444,
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  // A dark spider on a pale web is a silhouette; the marking gives it a shape.
  const marking = new THREE.MeshStandardMaterial({
    color: 0xd8b25a,
    roughness: 0.5,
    metalness: 0.2,
  });

  const spider = new THREE.Group();
  parent.add(spider);

  const body = new THREE.Group();
  spider.add(body);
  part(body, cached('spider-abdomen', () => new THREE.SphereGeometry(0.04, 10, 8)), chitin, {
    scale: [1, 0.82, 1.25],
  });
  const markGeo = cached('spider-mark', () => new THREE.SphereGeometry(0.012, 8, 6));
  part(body, markGeo, marking, { pos: [0, 0.031, -0.006], scale: [1.1, 0.35, 1.5] });
  part(body, markGeo, marking, { pos: [0, 0.026, -0.03], scale: [0.7, 0.3, 0.7] });
  part(body, cached('spider-head', () => new THREE.SphereGeometry(0.023, 8, 6)), chitin, {
    pos: [0, 0.004, 0.05],
  });
  for (const side of [-1, 1]) {
    part(body, cached('spider-eye', () => new THREE.SphereGeometry(0.0055, 6, 5)), eye, {
      pos: [side * 0.01, 0.009, 0.066],
    });
  }

  const legGeo = cached('spider-leg', () => new THREE.CylinderGeometry(0.0035, 0.0022, 0.06, 5));
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const knee = new THREE.Group();
      knee.position.set(side * 0.024, 0.004, 0.028 - i * 0.019);
      knee.rotation.set(0, side * (0.5 - i * 0.32), side * 1.05);
      body.add(knee);
      part(knee, legGeo, chitin, { pos: [0, -0.028, 0] });
      const shin = new THREE.Group();
      shin.position.set(0, -0.056, 0);
      shin.rotation.z = side * -1.5;
      knee.add(shin);
      part(shin, legGeo, chitin, { pos: [0, -0.026, 0], scale: [0.85, 0.85, 0.85] });
      legs.push({ knee, restZ: knee.rotation.z, side, phase: i * 0.9 + (side + 1) * 0.4 });
    }
  }

  const anchorRadius = WEB_RADIUS * 0.62;
  spider.position.set(anchorRadius * 0.7, webHeight(anchorRadius) + 0.03, -anchorRadius * 0.7);
  spider.rotation.y = 2.35;

  // When the web fires the spider scuttles a short way down its own silk toward
  // whatever got caught, then holds there.
  const restX = spider.position.x;
  const restZ = spider.position.z;

  const activate = (p) => {
    const rush = stage(p, 0.12, 0.5);
    const shudder = Math.sin(p * Math.PI * 6) * (1 - p);

    spider.position.x = restX * (1 - rush * 0.45);
    spider.position.z = restZ * (1 - rush * 0.45);
    body.position.y = shudder * 0.012;
    body.rotation.y = shudder * 0.25;
    for (const leg of legs) {
      leg.knee.rotation.z = leg.restZ + shudder * 0.22 * leg.side;
    }
  };

  return { activate };
}

function buildWeb(rng) {
  const root = new THREE.Group();

  const silk = new THREE.MeshStandardMaterial({
    color: 0xacbcd2,
    emissive: 0x6a83a6,
    emissiveIntensity: 0.22,
    roughness: 0.6,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85,
  });
  const dew = new THREE.MeshStandardMaterial({
    color: 0xdff1ff,
    emissive: 0xbfdbfe,
    emissiveIntensity: 1.2,
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
  });

  const haze = addGlowDecal(root, WEB_RADIUS * 1.05, 0x8ea9cc, 0.16);

  const web = new THREE.Group();
  web.rotation.y = rng() * Math.PI * 2;
  root.add(web);

  part(web, webGeometry(), silk);

  const dewGeo = cached('web-dew', () => new THREE.SphereGeometry(0.011, 8, 6));
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const r = WEB_RADIUS * (0.4 + rng() * 0.5);
    part(web, dewGeo, dew, {
      pos: [Math.cos(a) * r, webHeight(r) - 0.004, Math.sin(a) * r],
      scale: 0.7 + rng() * 0.6,
    });
  }

  const spider = addSpider(web);
  const snap = createShockRing(root, 0xdbeafe, { inner: 0.3, outer: 0.335, y: 0.012 });

  // The web survives being triggered (the victim stays stuck in it), so this
  // timeline has to land on a pose worth looking at rather than fading out.
  const activate = (p) => {
    const cinch = stage(p, 0, 0.14);
    const release = stage(p, 0.14, 0.6);
    const flash = stage(p, 0, 0.26);
    const wave = stage(p, 0.02, 0.55);
    const tremor = Math.sin(p * Math.PI * 7) * (1 - p) ** 2;

    // Snaps taut and climbs the victim's legs, springs back part of the way, and
    // stays visibly tighter than it started.
    const tighten = cinch * 0.22 - release * 0.1;
    web.scale.set(1 - tighten, 1 + tighten * 2.6, 1 - tighten);
    web.rotation.z = tremor * 0.09;
    web.rotation.x = tremor * 0.07;

    silk.emissiveIntensity = 0.14 + (flash - release * 0.8) * 1.4;
    haze.material.opacity = 0.12 + (flash - release * 0.7) * 0.35;

    snap.update(wave, { peak: 0.85, grow: 0.9 });
    spider.activate(p);
  };

  return { root, activate, activateMs: 820, persistent: true };
}

/* ----------------------------------------------------------------- stone --- */

// Displacement is a pure function of the original vertex position, so the
// duplicated vertices of an icosahedron stay welded and the rock keeps clean
// faceted faces instead of splitting apart.
function boulderGeometry(radius, rng, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const waves = [];
  for (let i = 0; i < 4; i++) {
    waves.push({
      dir: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
      freq: (3.5 + rng() * 5) / radius,
      amp: 0.06 + rng() * 0.09,
    });
  }

  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    let displace = 0;
    for (const wave of waves) displace += Math.sin(v.dot(wave.dir) * wave.freq) * wave.amp;
    v.multiplyScalar(1 + displace);
    v.y = Math.max(v.y, -radius * 0.52);
    position.setXYZ(i, v.x, v.y * 0.86, v.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  return geometry;
}

const MAIN_RADIUS = 0.24;

function buildStone(rng) {
  const root = new THREE.Group();

  const rock = new THREE.MeshStandardMaterial({
    color: 0x4a5570,
    roughness: 0.96,
    metalness: 0.08,
    flatShading: true,
  });
  const rockDeep = new THREE.MeshStandardMaterial({
    color: 0x333c50,
    roughness: 0.98,
    metalness: 0.06,
    flatShading: true,
  });

  addContactShadow(root, 0.4, 0.6);

  const cluster = new THREE.Group();
  cluster.rotation.y = rng() * Math.PI * 2;
  root.add(cluster);

  // Few, large facets: a low-poly block reads as carved rock at tile size,
  // where a dense mesh just turns into crumpled foil.
  const main = boulderGeometry(MAIN_RADIUS, rng, 0);
  part(cluster, main, rock, {
    rot: [0, rng() * Math.PI, 0],
    scale: [1.04, 1.08, 1],
    shadow: true,
  });

  const shoulder = boulderGeometry(0.15, rng, 0);
  const a = rng() * Math.PI * 2;
  for (const side of [0, 1]) {
    const angle = a + side * 2.4;
    part(cluster, shoulder, side ? rockDeep : rock, {
      pos: [Math.cos(angle) * 0.19, 0, Math.sin(angle) * 0.19],
      rot: [0.12, rng() * Math.PI, -0.14],
      scale: [1, 0.92 - side * 0.18, 1],
      shadow: true,
    });
  }

  const pebbleGeo = boulderGeometry(0.06, rng, 0);
  for (let i = 0; i < 3; i++) {
    const angle = a + 1.1 + i * 1.9 + rng() * 0.5;
    const r = 0.26 + rng() * 0.06;
    part(cluster, pebbleGeo, rockDeep, {
      pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
      rot: [rng() * 0.4, rng() * Math.PI, rng() * 0.4],
      scale: 0.7 + rng() * 0.5,
      shadow: true,
    });
  }

  return { root, animate: null };
}

/* --------------------------------------------------------- red-blue flag --- */

function flagClothGeometry(key, direction) {
  return cached(key, () => {
    const x = direction;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0.17, 0,
      x * 0.25, 0.14, 0.015,
      0, 0, 0,
      x * 0.25, 0.14, 0.015,
      x * 0.22, -0.04, -0.012,
      0, 0, 0,
    ], 3));
    geometry.computeVertexNormals();
    return geometry;
  });
}

function buildFlag(rng) {
  const root = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({
    color: 0x9aa7b8,
    roughness: 0.32,
    metalness: 0.82,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xe7b84b,
    emissive: 0x5f3a05,
    emissiveIntensity: 0.2,
    roughness: 0.3,
    metalness: 0.7,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xd92d3f,
    emissive: 0x52101a,
    emissiveIntensity: 0.25,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x2979e3,
    emissive: 0x0d2d66,
    emissiveIntensity: 0.3,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });

  addContactShadow(root, 0.34, 0.62);

  const standard = new THREE.Group();
  standard.rotation.y = rng() * 0.5 - 0.25;
  root.add(standard);

  part(standard, cached('flag-base', () => new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10)), iron, {
    pos: [0, 0.04, 0],
    shadow: true,
  });
  part(standard, cached('flag-base-rim', () => new THREE.TorusGeometry(0.16, 0.022, 6, 16)), gold, {
    pos: [0, 0.082, 0],
    rot: [Math.PI / 2, 0, 0],
  });

  const poleGeo = cached('flag-pole', () => new THREE.CylinderGeometry(0.014, 0.018, 0.62, 8));
  const finialGeo = cached('flag-finial', () => new THREE.SphereGeometry(0.035, 10, 8));
  for (const entry of [
    { x: -0.045, z: 0, tilt: -0.12, direction: -1, cloth: red, key: 'flag-cloth-red' },
    { x: 0.045, z: 0, tilt: 0.12, direction: 1, cloth: blue, key: 'flag-cloth-blue' },
  ]) {
    const pole = new THREE.Group();
    pole.position.set(entry.x, 0.08, entry.z);
    pole.rotation.z = entry.tilt;
    standard.add(pole);
    part(pole, poleGeo, iron, { pos: [0, 0.31, 0], shadow: true });
    part(pole, finialGeo, gold, { pos: [0, 0.64, 0], shadow: true });
    part(pole, flagClothGeometry(entry.key, entry.direction), entry.cloth, {
      pos: [0, 0.43, 0],
      shadow: true,
    });
  }

  return { root, animate: null };
}

/* ---------------------------------------------------------------------------- */

export function buildMapPropModel(kind, seed = 1) {
  const rng = mulberry32(seed);
  if (kind === 'potion') return buildPotion();
  if (kind === 'spikes') return buildSpikes(rng);
  if (kind === 'web') return buildWeb(rng);
  if (kind === 'stone') return buildStone(rng);
  if (kind === 'flag') return buildFlag(rng);
  return null;
}
