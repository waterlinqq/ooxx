import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PETAL_COLORS, SCENERY_PALETTE as P } from './scenery/sceneryPalette.js';

const geoCache = new Map();
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

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
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

function shadowTexture() {
  if (!shadowTex) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    shadowTex = new THREE.CanvasTexture(canvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return shadowTex;
}

function addContactShadow(root, radius, opacity = 0.45) {
  const material = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const quad = cached(`scenery-quad-${radius}`, () => new THREE.PlaneGeometry(radius * 2, radius * 2));
  const mesh = part(root, quad, material, { pos: [0, 0.006, 0], rot: [-Math.PI / 2, 0, 0] });
  mesh.renderOrder = 1;
  return mesh;
}

function tagged(material, bucket) {
  material.userData.sceneryBucket = bucket;
  return material;
}

function foliage(color) {
  return tagged(new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
  }), 'foliage');
}

function stone(color) {
  return tagged(new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  }), 'stone');
}

function wood(color) {
  return stone(color);
}

function accent(color) {
  return tagged(new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    flatShading: false,
  }), 'accent');
}

function waterMat(color, { roughness = 0.18, metalness = 0.14 } = {}) {
  return tagged(new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: false,
  }), 'water');
}

const BOX = () => cached('scenery-box', () => new THREE.BoxGeometry(1, 1, 1));

function paintRadialShade(geometry, inner = 0.72, outer = 1.12) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  let maxR = 0.001;
  for (let i = 0; i < pos.count; i++) {
    maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / maxR);
    const shade = inner + (outer - inner) * t;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade * 1.04;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function jitterCylinder(radiusX, radiusZ, segments, seed, height = 1) {
  const geometry = new THREE.CylinderGeometry(1, 1.04, height, segments);
  const rng = seededRng(seed);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, z);
    if (len < 0.02) continue;
    const jitter = 0.93 + rng() * 0.12;
    pos.setX(i, (x / len) * jitter);
    pos.setZ(i, (z / len) * jitter);
  }
  geometry.scale(radiusX, 1, radiusZ);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Raised planter rim that frames the whole board, so the tiles read as a
 * deliberate garden path rather than slabs floating on a lawn.
 */
export function buildBoardBorder(halfExtent) {
  const root = new THREE.Group();
  root.userData.decorative = true;

  const outer = halfExtent + 0.19;
  const inner = halfExtent + 0.02;
  const thickness = outer - inner;
  const mid = (outer + inner) / 2;
  const height = 0.2;

  const rimGeo = new THREE.BoxGeometry(1, 1, 1);
  const pieces = [];

  for (const sign of [-1, 1]) {
    const along = rimGeo.clone();
    along.scale(outer * 2, height, thickness);
    along.translate(0, 0, sign * mid);
    pieces.push(along);

    const across = rimGeo.clone();
    across.scale(thickness, height, inner * 2);
    across.translate(sign * mid, 0, 0);
    pieces.push(across);
  }
  rimGeo.dispose();

  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();

  const rim = new THREE.Mesh(merged, stone(P.stoneRim));
  rim.position.y = 0.0;
  rim.castShadow = true;
  rim.receiveShadow = true;
  root.add(rim);

  const moss = foliage(P.moss);
  for (const sign of [-1, 1]) {
    part(root, BOX(), moss, {
      pos: [0, 0.055, sign * (inner + 0.015)],
      scale: [inner * 2 - 0.1, 0.028, 0.045],
    });
    part(root, BOX(), moss, {
      pos: [sign * (inner + 0.015), 0.055, 0],
      scale: [0.045, 0.028, inner * 2 - 0.1],
    });
  }

  const postMat = stone(P.stonePost);
  const capMat = stone(P.stoneLight);
  const bowlMat = foliage(P.hedgeTop);
  const bloom = accent(P.petalGold);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      part(root, BOX(), postMat, {
        pos: [sx * mid, 0.04, sz * mid],
        scale: [thickness + 0.09, 0.28, thickness + 0.09],
        shadow: true,
      });
      part(root, BOX(), capMat, {
        pos: [sx * mid, 0.17, sz * mid],
        scale: [thickness + 0.14, 0.045, thickness + 0.14],
        shadow: true,
      });
      part(root, BOX(), bowlMat, {
        pos: [sx * mid, 0.205, sz * mid],
        scale: [thickness + 0.07, 0.04, thickness + 0.07],
      });
      part(root, cached('scenery-bud', () => new THREE.IcosahedronGeometry(0.045, 0)), bloom, {
        pos: [sx * mid, 0.24, sz * mid],
        scale: 0.7,
      });
    }
  }

  return { root };
}

/** Layered cone conifer. Sized to read as a tree, not a chevron sticker. */
export function buildDecorTree(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const scale = 0.94 + rng() * 0.14;
  addContactShadow(root, 0.36, 0.5);

  const trunkMat = wood(P.wood);
  const trunkDark = wood(P.woodDark);
  const leafDark = foliage(P.leafDark);
  const leafMid = foliage(P.leafMid);
  const leafLight = foliage(P.leafLight);

  const trunkH = 0.16;
  const trunkGeo = cached('scenery-trunk', () => new THREE.CylinderGeometry(0.07, 0.1, 1, 8));
  part(root, trunkGeo, trunkMat, {
    pos: [0, trunkH * 0.38, 0],
    scale: [1, trunkH * 0.76, 1],
    shadow: true,
  });
  part(root, trunkGeo, trunkDark, {
    pos: [0.012, trunkH * 0.82, 0.006],
    scale: [0.7, trunkH * 0.42, 0.7],
    rot: [0.1, rng() * 0.8, 0.05],
    shadow: true,
  });

  // Kept deliberately squat: the fixed camera crops anything much taller than
  // the units, and a cropped tree reads as a stray green blob.
  const coneGeo = cached('scenery-tree-cone', () => new THREE.ConeGeometry(1, 1, 12));
  const tip = foliage(rng() > 0.5 ? P.leafGold : P.leafLight);
  const layers = [
    { radius: 0.4, height: 0.25, y: trunkH - 0.05, mat: leafDark, ox: 0, oz: 0, spin: rng() },
    { radius: 0.3, height: 0.22, y: trunkH + 0.1, mat: leafMid, ox: 0.028, oz: -0.018, spin: rng() },
    { radius: 0.18, height: 0.17, y: trunkH + 0.25, mat: tip, ox: -0.016, oz: 0.02, spin: rng() },
  ];
  for (const layer of layers) {
    part(root, coneGeo, layer.mat, {
      pos: [layer.ox, layer.y + layer.height / 2, layer.oz],
      scale: [layer.radius * (0.94 + rng() * 0.1), layer.height, layer.radius * (0.9 + rng() * 0.12)],
      rot: [0.04 * (rng() - 0.5), layer.spin, 0.04 * (rng() - 0.5)],
      shadow: true,
    });
  }

  part(root, coneGeo, leafMid, {
    pos: [0.14 + rng() * 0.04, trunkH + 0.1, 0.03],
    scale: [0.11, 0.1, 0.1],
    rot: [0.35, rng() * Math.PI, 0.2],
    shadow: true,
  });

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(scale);
  return { root };
}

/** Clipped box hedge — low, wide, with a few blooms on top. */
export function buildHedge(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  addContactShadow(root, 0.3, 0.42);

  const body = foliage(P.hedge);
  const crown = foliage(P.hedgeTop);
  const olive = foliage(P.leafOlive);

  const width = 0.46 + rng() * 0.16;
  const depth = 0.24 + rng() * 0.06;

  part(root, BOX(), body, {
    pos: [0, 0.07, 0],
    scale: [width, 0.14, depth],
    shadow: true,
  });
  part(root, BOX(), crown, {
    pos: [0, 0.155, 0],
    scale: [width * 0.88, 0.05, depth * 0.82],
    shadow: true,
  });
  part(root, BOX(), olive, {
    pos: [width * 0.18, 0.17, 0],
    scale: [width * 0.28, 0.03, depth * 0.5],
  });

  const budGeo = cached('scenery-bud', () => new THREE.IcosahedronGeometry(0.045, 0));
  const bloom = accent(PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)]);
  const flowers = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < flowers; i++) {
    part(root, budGeo, bloom, {
      pos: [(rng() - 0.5) * width * 0.7, 0.19, (rng() - 0.5) * depth * 0.4],
      scale: 0.45 + rng() * 0.2,
    });
  }

  root.rotation.y = (rng() - 0.5) * 0.16;
  return { root };
}

/** Clustered garden stones — sandstone, slate, and a little moss. */
export function buildDecorRock(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  addContactShadow(root, 0.3, 0.42);

  const warm = stone(P.stoneSand);
  const slate = stone(P.stoneSlate);
  const deep = stone(P.stoneDeep);
  const light = stone(P.stoneLight);
  const moss = foliage(P.moss);
  const chunk = cached('scenery-rock-chunk', () => new THREE.DodecahedronGeometry(0.16, 0));
  const slab = cached('scenery-rock-slab', () => new THREE.BoxGeometry(0.22, 0.08, 0.16));

  const cluster = new THREE.Group();
  cluster.rotation.y = rng() * Math.PI * 2;
  root.add(cluster);

  const standing = rng() > 0.55;
  part(cluster, chunk, standing ? slate : warm, {
    pos: [0, standing ? 0.08 : 0.05, 0],
    scale: standing ? [0.7, 1.05, 0.42] : [1.25, 0.48, 0.95],
    rot: [0.12, rng() * 0.6, standing ? 0.18 : 0.08],
    shadow: true,
  });
  part(cluster, chunk, light, {
    pos: [0.02, standing ? 0.14 : 0.09, -0.01],
    scale: standing ? [0.42, 0.22, 0.28] : [0.7, 0.16, 0.55],
    rot: [0.04, 0.3, 0.06],
  });
  if (rng() > 0.35) {
    part(cluster, chunk, moss, {
      pos: [-0.04, standing ? 0.1 : 0.08, 0.03],
      scale: [0.32, 0.1, 0.28],
    });
  }

  const extras = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < extras; i++) {
    const a = (i / extras) * Math.PI * 2 + rng() * 0.5;
    const dist = 0.14 + rng() * 0.1;
    const mat = i % 3 === 0 ? deep : i % 3 === 1 ? warm : slate;
    part(cluster, rng() > 0.55 ? slab : chunk, mat, {
      pos: [Math.cos(a) * dist, 0.028 + rng() * 0.02, Math.sin(a) * dist * 0.85],
      scale: [0.45 + rng() * 0.4, 0.22 + rng() * 0.18, 0.38 + rng() * 0.28],
      rot: [rng() * 0.35, a + 0.4, (rng() - 0.5) * 0.2],
      shadow: true,
    });
  }

  return { root };
}

function addBloom(root, x, z, h, petalMat, centerMat, rng, size = 1) {
  const petalGeo = cached('scenery-petal', () => {
    const geometry = new THREE.ConeGeometry(0.042, 0.078, 5);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  });
  const leafGeo = cached('scenery-bloom-leaf', () => {
    const geometry = new THREE.ConeGeometry(0.03, 0.07, 3);
    geometry.rotateX(1.05);
    return geometry;
  });
  const budGeo = cached('scenery-bud', () => new THREE.IcosahedronGeometry(0.045, 0));
  const petals = 5 + Math.floor(rng() * 2);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + rng() * 0.08;
    part(root, petalGeo, petalMat, {
      pos: [x + Math.cos(a) * 0.032 * size, h, z + Math.sin(a) * 0.032 * size],
      rot: [1.05, a, 0],
      scale: [(0.95 + rng() * 0.25) * size, (0.9 + rng() * 0.2) * size, 0.9 * size],
    });
  }
  part(root, budGeo, centerMat, {
    pos: [x, h + 0.008 * size, z],
    scale: (0.55 + rng() * 0.12) * size,
  });
  if (rng() > 0.35) {
    const leaf = foliage(P.leafOlive);
    part(root, leafGeo, leaf, {
      pos: [x + 0.03 * size, h - 0.02, z],
      rot: [0, rng() * Math.PI, 0.4],
      scale: size,
    });
  }
}

/** Flower patch: bright dots that stay readable in a top-down view. */
export function buildFlowerPatch(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const petal = accent(PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)]);
  const center = accent(P.petalGold);
  const stem = foliage(P.leafFresh);
  const stemGeo = cached('scenery-stem', () => new THREE.CylinderGeometry(0.012, 0.012, 1, 4));
  const tuftGeo = cached('scenery-tuft', () => new THREE.ConeGeometry(0.09, 1, 5));

  part(root, tuftGeo, stem, {
    pos: [0, 0.045, 0],
    scale: [1, 0.09, 1],
    shadow: false,
  });

  const count = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.7;
    const dist = 0.05 + rng() * 0.05;
    const h = 0.11 + rng() * 0.05;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    part(root, stemGeo, stem, { pos: [x, h / 2, z], scale: [1, h, 1] });
    addBloom(root, x, z, h, petal, center, rng);
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Small grass blade cluster with a few dry straw blades. */
export function buildGrassClump(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const bladeMat = foliage(P.leafFresh);
  const bladeDark = foliage(P.leafDark);
  const straw = foliage(P.straw);
  const bladeGeo = cached('scenery-grass-blade', () => new THREE.ConeGeometry(0.05, 0.16, 3));
  const headGeo = cached('scenery-grass-head', () => new THREE.SphereGeometry(0.016, 4, 3));
  const count = 7 + Math.floor(rng() * 5);

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * 0.1;
    const h = 0.08 + rng() * 0.11;
    const dry = rng() > 0.62;
    const mat = dry ? straw : (i % 2 ? bladeDark : bladeMat);
    part(root, bladeGeo, mat, {
      pos: [Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist],
      scale: [0.5 + rng() * 0.45, h / 0.16, 0.5 + rng() * 0.45],
      rot: [0, angle, (rng() - 0.5) * 0.4],
    });
    if (dry && rng() > 0.45) {
      part(root, headGeo, accent(P.petalGold), {
        pos: [Math.cos(angle) * dist, h + 0.01, Math.sin(angle) * dist],
        scale: 0.7,
      });
    }
  }

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.9 + rng() * 0.5);
  return { root };
}

/** Scattered low wildflowers — looser than buildFlowerPatch. */
export function buildWildflowers(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const stemGeo = cached('scenery-stem', () => new THREE.CylinderGeometry(0.01, 0.01, 1, 4));
  const stem = foliage(P.leafMid);
  const count = 2 + Math.floor(rng() * 4);

  for (let i = 0; i < count; i++) {
    const petal = accent(PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)]);
    const center = accent(P.petalIvory);
    const x = (rng() - 0.5) * 0.22;
    const z = (rng() - 0.5) * 0.22;
    const h = 0.08 + rng() * 0.07;
    part(root, stemGeo, stem, { pos: [x, h / 2, z], scale: [1, h, 1] });
    addBloom(root, x, z, h, petal, center, rng);
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

function decorateWaterBody(root, seed, rx, rz, {
  sandBeach = false,
  island = false,
  padCount = 3,
  reedCount = 4,
} = {}) {
  const rng = seededRng(seed + 91);
  const water = waterMat(P.water, { roughness: 0.16, metalness: 0.15 });
  const waterMid = waterMat(P.waterMid, { roughness: 0.14, metalness: 0.16 });
  const waterDeep = waterMat(P.waterDeep, { roughness: 0.12, metalness: 0.18 });
  const waterRim = waterMat(P.waterRim, { roughness: 0.2, metalness: 0.1 });
  const sand = stone(P.sand);
  const sandDeep = stone(P.sandDeep);
  const slate = stone(P.stoneSlate);
  const pebble = stone(P.stoneLight);
  const reedMat = foliage(P.leafOlive);

  const segments = rx > 1.1 ? 28 : 20;
  part(root, paintRadialShade(jitterCylinder(rx, rz, segments, seed, 1), 0.62, 1.2), water, {
    pos: [0, -0.01, 0],
    scale: [1, 0.04, 1],
  });
  part(root, paintRadialShade(jitterCylinder(rx * 0.62, rz * 0.58, 18, seed + 17, 1), 0.55, 0.92), waterMid, {
    pos: [0.04 * rx, -0.004, -0.03 * rz],
    scale: [1, 0.022, 1],
  });
  part(root, paintRadialShade(jitterCylinder(rx * 0.34, rz * 0.3, 14, seed + 29, 1), 0.45, 0.8), waterDeep, {
    pos: [-0.02 * rx, 0.0, 0.02 * rz],
    scale: [1, 0.014, 1],
  });
  part(root, paintRadialShade(jitterCylinder(rx * 1.05, rz * 1.05, segments, seed + 31, 1), 1.08, 1.28), waterRim, {
    pos: [0, 0.008, 0],
    scale: [1, 0.01, 1],
  });

  if (sandBeach) {
    const beach = paintRadialShade(jitterCylinder(rx * 1.22, rz * 1.2, segments, seed + 44, 1), 0.9, 1.15);
    part(root, beach, sand, {
      pos: [0, -0.018, 0],
      scale: [1, 0.028, 1],
    });
    const spitA = rng() * Math.PI * 2;
    part(root, BOX(), sandDeep, {
      pos: [Math.cos(spitA) * rx * 0.92, 0.006, Math.sin(spitA) * rz * 0.92],
      rot: [0, spitA, 0],
      scale: [0.28 + rng() * 0.18, 0.016, 0.12 + rng() * 0.08],
    });
  }

  const tuftGeo = cached('scenery-bank-tuft', () => new THREE.ConeGeometry(0.08, 0.14, 4));
  const pebbleGeo = cached('scenery-pebble', () => new THREE.DodecahedronGeometry(0.05, 0));
  const rockGeo = cached('scenery-rock-chunk', () => new THREE.DodecahedronGeometry(0.16, 0));
  const bankCount = 7 + Math.floor(rx * 4);

  for (let i = 0; i < bankCount; i++) {
    const a = (i / bankCount) * Math.PI * 2 + rng() * 0.5;
    const dist = 0.88 + rng() * 0.18;
    const px = Math.cos(a) * rx * dist;
    const pz = Math.sin(a) * rz * dist;
    if (rng() > 0.3) {
      part(root, rng() > 0.7 ? rockGeo : pebbleGeo, rng() > 0.5 ? slate : pebble, {
        pos: [px * 0.82, 0.016, pz * 0.82],
        scale: [0.7 + rng() * 0.7, 0.35 + rng() * 0.3, 0.55 + rng() * 0.45],
        rot: [rng() * 0.4, rng() * Math.PI, rng() * 0.3],
        shadow: true,
      });
    }
    if (!sandBeach && rng() > 0.55) {
      part(root, tuftGeo, foliage(P.moss), {
        pos: [px, 0.05, pz],
        rot: [0, rng() * Math.PI, 0],
        scale: 0.75 + rng() * 0.45,
      });
    }
  }

  if (island) {
    part(root, cached('scenery-mound', () => new THREE.SphereGeometry(0.28, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2)), sand, {
      pos: [rx * 0.12, -0.01, -rz * 0.08],
      scale: [0.85, 0.32, 0.7],
    });
    part(root, rockGeo, slate, {
      pos: [rx * 0.12, 0.04, -rz * 0.08],
      scale: [0.55, 0.35, 0.45],
      shadow: true,
    });
  }

  const padGeo = cached('scenery-lilypad', () => new THREE.CircleGeometry(0.07, 10));
  const padMat = accent(0x5a9a58);
  padMat.side = THREE.DoubleSide;
  for (let i = 0; i < padCount; i++) {
    const a = rng() * Math.PI * 2;
    const dist = 0.16 + rng() * 0.42;
    part(root, padGeo, padMat, {
      pos: [Math.cos(a) * rx * dist, 0.02, Math.sin(a) * rz * dist],
      rot: [-Math.PI / 2, 0, rng() * 0.5],
      scale: 0.9 + rng() * 0.55,
    });
  }

  addBloom(
    root,
    Math.cos(rng() * Math.PI * 2) * rx * 0.28,
    Math.sin(rng() * Math.PI * 2) * rz * 0.28,
    0.045,
    accent(P.petalRose),
    accent(P.petalGold),
    rng,
    1.15,
  );

  const reedGeo = cached('scenery-reed', () => new THREE.CylinderGeometry(0.012, 0.016, 1, 4));
  const tipGeo = cached('scenery-reed-tip', () => new THREE.CylinderGeometry(0.018, 0.012, 1, 4));
  for (let i = 0; i < reedCount; i++) {
    const a = (i / reedCount) * Math.PI * 1.2 + 0.4 + rng() * 0.3;
    const dist = 0.9 + rng() * 0.14;
    const h = 0.16 + rng() * 0.14;
    part(root, reedGeo, reedMat, {
      pos: [Math.cos(a) * rx * dist, h / 2, Math.sin(a) * rz * dist],
      scale: [1, h, 1],
      rot: [(rng() - 0.5) * 0.15, rng() * Math.PI, 0],
    });
    part(root, tipGeo, accent(P.mushGold), {
      pos: [Math.cos(a) * rx * dist, h + 0.02, Math.sin(a) * rz * dist],
      scale: [1, 0.045, 1],
    });
  }
}

/** Garden pond — compact water feature. */
export function buildPond(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const rx = 0.48 + rng() * 0.22;
  const rz = rx * (0.7 + rng() * 0.35);
  decorateWaterBody(root, seed, rx, rz, {
    sandBeach: rng() > 0.55,
    padCount: 2 + Math.floor(rng() * 2),
    reedCount: 3 + Math.floor(rng() * 2),
  });

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.95 + rng() * 0.2);
  return { root };
}

/** Wide lake with a sand beach — the scene's water hero. */
export function buildLake(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const rx = 1.55 + rng() * 0.45;
  const rz = rx * (0.58 + rng() * 0.22);
  decorateWaterBody(root, seed, rx, rz, {
    sandBeach: true,
    island: rng() > 0.35,
    padCount: 4 + Math.floor(rng() * 3),
    reedCount: 6 + Math.floor(rng() * 3),
  });

  root.rotation.y = (rng() - 0.5) * 0.5;
  return { root };
}

/** Winding dirt path made of offset flat slabs. */
export function buildGardenPath(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const dirt = stone(P.stoneRim);
  const dirtLight = stone(P.stonePost);
  const segments = 3 + Math.floor(rng() * 5);

  let x = 0;
  let z = 0;
  let angle = rng() * Math.PI * 2;

  for (let i = 0; i < segments; i++) {
    angle += (rng() - 0.5) * 1.4;
    const len = 0.18 + rng() * 0.28;
    const w = 0.1 + rng() * 0.06;
    part(root, BOX(), i % 2 ? dirtLight : dirt, {
      pos: [x + Math.cos(angle) * len * 0.5, 0.01, z + Math.sin(angle) * len * 0.5],
      rot: [0, angle, 0],
      scale: [w, 0.018, len],
      shadow: true,
    });
    x += Math.cos(angle) * len;
    z += Math.sin(angle) * len;
  }

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.85 + rng() * 0.4);
  return { root };
}

/** Reeds / cattail clump for pond edges. */
export function buildReeds(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const reed = foliage(P.leafFresh);
  const reedDark = foliage(P.leafDark);
  const tip = accent(P.mushGold);
  const reedGeo = cached('scenery-reed', () => new THREE.CylinderGeometry(0.012, 0.016, 1, 4));
  const tipGeo = cached('scenery-reed-tip', () => new THREE.CylinderGeometry(0.018, 0.012, 1, 4));
  const count = 4 + Math.floor(rng() * 4);

  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * 0.16;
    const z = (rng() - 0.5) * 0.12;
    const h = 0.16 + rng() * 0.14;
    part(root, reedGeo, i % 2 ? reedDark : reed, {
      pos: [x, h / 2, z],
      scale: [1, h, 1],
      rot: [(rng() - 0.5) * 0.25, rng() * Math.PI, (rng() - 0.5) * 0.15],
    });
    if (rng() > 0.45) {
      part(root, tipGeo, tip, {
        pos: [x, h + 0.02, z],
        scale: [1, 0.04, 1],
      });
    }
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Fallen log / stump with rings and a broken branch. */
export function buildStump(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  addContactShadow(root, 0.16, 0.35);

  const woodMat = wood(P.wood);
  const woodRing = wood(P.woodLight);
  const woodDark = wood(P.woodDark);
  const cyl = cached('scenery-stump', () => new THREE.CylinderGeometry(0.1, 0.12, 1, 8));

  if (rng() > 0.4) {
    part(root, cyl, woodMat, {
      pos: [0, 0.055, 0],
      scale: [0.78 + rng() * 0.22, 0.11, 0.78 + rng() * 0.22],
      shadow: true,
    });
    part(root, cyl, woodDark, {
      pos: [0, 0.108, 0],
      scale: [0.55 + rng() * 0.12, 0.016, 0.55 + rng() * 0.12],
    });
    part(root, cyl, woodRing, {
      pos: [0, 0.116, 0],
      scale: [0.72 + rng() * 0.12, 0.012, 0.72 + rng() * 0.12],
      shadow: true,
    });
    part(root, cyl, woodMat, {
      pos: [0.1, 0.055, 0.015],
      rot: [0.1, rng(), 1.2],
      scale: [0.32, 0.09, 0.32],
      shadow: true,
    });
  } else {
    part(root, cyl, woodMat, {
      pos: [0, 0.04, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [0.5 + rng() * 0.2, 0.08, 0.5 + rng() * 0.2],
      shadow: true,
    });
    part(root, cyl, woodDark, {
      pos: [0.06, 0.05, 0.02],
      rot: [0.2, 0.4, 1.05],
      scale: [0.22, 0.05, 0.22],
    });
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Tiny mushroom cluster. */
export function buildMushrooms(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const capColors = [P.mushRed, P.mushGold, P.mushIvory];
  const stemMat = stone(P.mushStem);
  const capGeo = cached('scenery-mush-cap', () => new THREE.SphereGeometry(0.05, 5, 4, 0, Math.PI * 2, 0, Math.PI / 2));
  const stemGeo = cached('scenery-mush-stem', () => new THREE.CylinderGeometry(0.014, 0.018, 1, 4));
  const count = 2 + Math.floor(rng() * 3);

  for (let i = 0; i < count; i++) {
    const capMat = accent(capColors[Math.floor(rng() * capColors.length)]);
    const x = (rng() - 0.5) * 0.14;
    const z = (rng() - 0.5) * 0.14;
    const h = 0.05 + rng() * 0.04;
    part(root, stemGeo, stemMat, { pos: [x, h / 2, z], scale: [1, h, 1] });
    part(root, capGeo, capMat, { pos: [x, h, z], scale: 0.8 + rng() * 0.5 });
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Round shrub — shorter than a tree, often flowering. */
export function buildBush(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;
  addContactShadow(root, 0.24, 0.4);

  const blob = cached('scenery-bush', () => new THREE.IcosahedronGeometry(0.14, 1));
  const dark = foliage(P.leafDark);
  const mid = foliage(P.leafMid);
  const light = foliage(rng() > 0.45 ? P.leafGold : P.leafLight);
  const olive = foliage(P.leafOlive);

  part(root, blob, dark, {
    pos: [0, 0.075, 0],
    scale: [1.2, 0.82, 1.08],
    shadow: true,
  });
  part(root, blob, mid, {
    pos: [0.055, 0.11, 0.02],
    scale: [0.78, 0.64, 0.72],
    shadow: true,
  });
  part(root, blob, olive, {
    pos: [-0.05, 0.1, -0.04],
    scale: [0.62, 0.5, 0.58],
  });
  part(root, blob, light, {
    pos: [-0.02, 0.145, 0.03],
    scale: [0.42, 0.34, 0.4],
  });

  const flowering = rng() > 0.28;
  if (flowering) {
    const bloom = accent(PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)]);
    const center = accent(P.petalGold);
    const buds = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < buds; i++) {
      const a = (i / buds) * Math.PI * 2 + rng() * 0.4;
      addBloom(root, Math.cos(a) * 0.08, Math.sin(a) * 0.07, 0.16 + rng() * 0.03, bloom, center, rng, 0.7);
    }
  }

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.9 + rng() * 0.25);
  return { root };
}

/** Short wooden fence section. */
export function buildFence(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;
  addContactShadow(root, 0.28, 0.35);

  const post = wood(P.wood);
  const rail = wood(P.woodLight);
  const postGeo = cached('scenery-fence-post', () => new THREE.BoxGeometry(0.045, 0.2, 0.045));
  const railGeo = cached('scenery-fence-rail', () => new THREE.BoxGeometry(0.42, 0.028, 0.022));

  for (const x of [-0.18, 0, 0.18]) {
    part(root, postGeo, post, {
      pos: [x, 0.1, 0],
      shadow: true,
    });
  }
  part(root, railGeo, rail, { pos: [0, 0.14, 0] });
  part(root, railGeo, rail, { pos: [0, 0.08, 0] });

  root.rotation.y = (rng() - 0.5) * 0.12;
  return { root };
}

/** Stone lantern with a warm gold cap. */
export function buildLantern(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;
  addContactShadow(root, 0.16, 0.4);

  const base = stone(P.stone);
  const pillar = stone(P.stoneLight);
  const roof = wood(P.woodDark);
  const lamp = accent(P.gold);
  const ring = stone(P.steelDeep);

  part(root, BOX(), base, {
    pos: [0, 0.03, 0],
    scale: [0.16, 0.06, 0.16],
    shadow: true,
  });
  part(root, BOX(), pillar, {
    pos: [0, 0.1, 0],
    scale: [0.08, 0.1, 0.08],
    shadow: true,
  });
  part(root, BOX(), ring, {
    pos: [0, 0.16, 0],
    scale: [0.12, 0.03, 0.12],
  });
  part(root, BOX(), lamp, {
    pos: [0, 0.2, 0],
    scale: [0.09, 0.07, 0.09],
  });
  part(root, cached('scenery-lantern-roof', () => new THREE.ConeGeometry(0.1, 0.07, 4)), roof, {
    pos: [0, 0.26, 0],
    rot: [0, Math.PI / 4, 0],
    shadow: true,
  });

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.92 + rng() * 0.16);
  return { root };
}

/** Toy moai-style garden statue. */
export function buildStatue(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;
  addContactShadow(root, 0.16, 0.4);

  const body = stone(P.stoneLight);
  const deep = stone(P.stoneDeep);
  const trim = accent(P.gold);

  part(root, BOX(), body, {
    pos: [0, 0.08, 0],
    scale: [0.12, 0.16, 0.1],
    shadow: true,
  });
  part(root, BOX(), body, {
    pos: [0, 0.19, 0.005],
    scale: [0.11, 0.08, 0.1],
    shadow: true,
  });
  part(root, BOX(), deep, {
    pos: [0, 0.185, 0.05],
    scale: [0.07, 0.03, 0.02],
  });
  part(root, BOX(), trim, {
    pos: [0, 0.24, 0],
    scale: [0.08, 0.02, 0.08],
  });

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.95 + rng() * 0.18);
  return { root };
}

/** Fallen petals, pebbles, twigs — the "someone tends this garden" layer. */
export function buildDebris(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const petal = accent(PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)]);
  const pebble = stone(P.stone);
  const twig = wood(P.woodDark);
  const cone = wood(P.wood);
  const petalGeo = cached('scenery-debris-petal', () => new THREE.CircleGeometry(0.028, 5));
  const pebbleGeo = cached('scenery-pebble', () => new THREE.DodecahedronGeometry(0.05, 0));
  const twigGeo = cached('scenery-twig', () => new THREE.CylinderGeometry(0.008, 0.01, 1, 4));
  const coneGeo = cached('scenery-pinecone', () => new THREE.ConeGeometry(0.03, 0.06, 5));

  const count = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * 0.28;
    const z = (rng() - 0.5) * 0.28;
    const roll = rng();
    if (roll < 0.35) {
      part(root, petalGeo, petal, {
        pos: [x, 0.008, z],
        rot: [-Math.PI / 2, 0, rng() * Math.PI],
        scale: 0.7 + rng() * 0.5,
      });
    } else if (roll < 0.65) {
      part(root, pebbleGeo, pebble, {
        pos: [x, 0.012, z],
        scale: [0.45 + rng() * 0.35, 0.22 + rng() * 0.12, 0.4 + rng() * 0.3],
        rot: [rng() * 0.5, rng() * Math.PI, rng() * 0.4],
      });
    } else if (roll < 0.85) {
      part(root, twigGeo, twig, {
        pos: [x, 0.01, z],
        rot: [1.2, rng() * Math.PI, 0.2],
        scale: [1, 0.08 + rng() * 0.06, 1],
      });
    } else {
      part(root, coneGeo, cone, {
        pos: [x, 0.02, z],
        rot: [0.4, rng(), 0.15],
      });
    }
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Soft rise — earth or sand so the meadow is not only grass. */
export function buildLawnMound(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const sandy = rng() > 0.4;
  const mound = sandy ? stone(P.sand) : foliage(P.leafOlive);
  const geo = cached('scenery-mound', () => new THREE.SphereGeometry(0.28, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2));
  part(root, geo, mound, {
    pos: [0, -0.02, 0],
    scale: [1.15 + rng() * 0.55, 0.26 + rng() * 0.14, 0.95 + rng() * 0.4],
  });
  if (sandy && rng() > 0.5) {
    part(root, cached('scenery-pebble', () => new THREE.DodecahedronGeometry(0.05, 0)), stone(P.stoneSlate), {
      pos: [(rng() - 0.5) * 0.12, 0.03, (rng() - 0.5) * 0.1],
      scale: [0.8, 0.4, 0.65],
    });
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Far hills + squat tree nubs that sit in the fog. */
export function buildHorizonHills() {
  const root = new THREE.Group();
  root.userData.decorative = true;
  root.name = 'horizon-hills';

  const hill = stone(P.hill);
  const hillDark = stone(P.hillDeep);
  const tree = foliage(P.leafOlive);
  const hillGeo = cached('scenery-hill', () => new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const coneGeo = cached('scenery-tree-cone', () => new THREE.ConeGeometry(1, 1, 12));

  const hills = [
    { x: -4.4, z: -4.6, s: 1.7, h: 0.46 },
    { x: 4.2, z: -4.9, s: 1.9, h: 0.52 },
    { x: -5.0, z: 0.8, s: 1.5, h: 0.38 },
    { x: 5.1, z: 1.4, s: 1.6, h: 0.4 },
    { x: -3.6, z: 4.8, s: 1.4, h: 0.34 },
    { x: 3.4, z: 5.0, s: 1.5, h: 0.36 },
    { x: 0.2, z: -5.4, s: 1.8, h: 0.44 },
  ];

  for (const [i, spot] of hills.entries()) {
    part(root, hillGeo, i % 2 ? hillDark : hill, {
      pos: [spot.x, -0.2, spot.z],
      scale: [spot.s, spot.h, spot.s * 0.78],
    });
    part(root, coneGeo, tree, {
      pos: [spot.x + 0.35, spot.h * 0.35, spot.z - 0.2],
      scale: [0.28, 0.22, 0.28],
    });
  }

  return { root };
}
