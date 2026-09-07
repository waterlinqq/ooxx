import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

function foliage(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
}

function stone(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

const BOX = () => cached('scenery-box', () => new THREE.BoxGeometry(1, 1, 1));

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

  const rim = new THREE.Mesh(merged, stone(0x6b6455));
  rim.position.y = 0.0;
  rim.castShadow = true;
  rim.receiveShadow = true;
  root.add(rim);

  // Corner posts give the frame a built object silhouette from above.
  const postMat = stone(0x7a7362);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      part(root, BOX(), postMat, {
        pos: [sx * mid, 0.04, sz * mid],
        scale: [thickness + 0.09, 0.28, thickness + 0.09],
        shadow: true,
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

  const trunkMat = stone(0x4a3625);
  const leafDark = foliage(0x2a5f30);
  const leafMid = foliage(0x36763a);
  const leafLight = foliage(0x458c43);

  const trunkH = 0.16;
  const trunkGeo = cached('scenery-trunk', () => new THREE.CylinderGeometry(0.07, 0.1, 1, 6));
  part(root, trunkGeo, trunkMat, {
    pos: [0, trunkH / 2, 0],
    scale: [1, trunkH, 1],
    shadow: true,
  });

  // Kept deliberately squat: the fixed camera crops anything much taller than
  // the units, and a cropped tree reads as a stray green blob.
  const coneGeo = cached('scenery-tree-cone', () => new THREE.ConeGeometry(1, 1, 7));
  const layers = [
    { radius: 0.38, height: 0.26, y: trunkH - 0.04, mat: leafDark },
    { radius: 0.29, height: 0.22, y: trunkH + 0.12, mat: leafMid },
    { radius: 0.19, height: 0.18, y: trunkH + 0.26, mat: leafLight },
  ];
  for (const layer of layers) {
    part(root, coneGeo, layer.mat, {
      pos: [0, layer.y + layer.height / 2, 0],
      scale: [layer.radius, layer.height, layer.radius],
      shadow: true,
    });
  }

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(scale);
  return { root };
}

/** Clipped box hedge — low, wide, and legible straight from above. */
export function buildHedge(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  addContactShadow(root, 0.3, 0.42);

  const body = foliage(0x275a2c);
  const crown = foliage(0x347539);

  const width = 0.46 + rng() * 0.16;
  const depth = 0.24 + rng() * 0.06;

  // Low enough that it never rises into the row of units just inside the rim.
  part(root, BOX(), body, {
    pos: [0, 0.07, 0],
    scale: [width, 0.14, depth],
    shadow: true,
  });
  // Slightly smaller lighter cap reads as sunlit top growth.
  part(root, BOX(), crown, {
    pos: [0, 0.155, 0],
    scale: [width * 0.88, 0.05, depth * 0.82],
    shadow: true,
  });

  root.rotation.y = (rng() - 0.5) * 0.16;
  return { root };
}

/** Flat angular garden stones. */
export function buildDecorRock(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  addContactShadow(root, 0.26, 0.42);

  const a = stone(0x3f4a45);
  const b = stone(0x323b37);
  const c = stone(0x4a534b);

  const cluster = new THREE.Group();
  cluster.rotation.y = rng() * Math.PI * 2;
  root.add(cluster);

  part(cluster, BOX(), a, {
    pos: [0, 0.06, 0],
    scale: [0.36, 0.12, 0.27],
    rot: [0.05, rng() * 0.5, 0.03],
    shadow: true,
  });

  const angle = rng() * Math.PI * 2;
  part(cluster, BOX(), b, {
    pos: [Math.cos(angle) * 0.19, 0.04, Math.sin(angle) * 0.15],
    scale: [0.22, 0.08, 0.18],
    rot: [0.1, angle + 0.6, -0.06],
    shadow: true,
  });
  part(cluster, BOX(), c, {
    pos: [Math.cos(angle + 2.4) * 0.2, 0.03, Math.sin(angle + 2.4) * 0.16],
    scale: [0.16, 0.06, 0.14],
    rot: [-0.04, angle + 1.3, 0.08],
    shadow: true,
  });

  return { root };
}

const PETAL_COLORS = [0xf2c14e, 0xe8748f, 0xf5f0e6, 0xc98bdb];

/** Flower patch: bright dots that stay readable in a top-down view. */
export function buildFlowerPatch(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const petal = new THREE.MeshStandardMaterial({
    color: PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)],
    roughness: 0.7,
    metalness: 0,
  });
  const stem = foliage(0x3f8a43);

  const budGeo = cached('scenery-bud', () => new THREE.IcosahedronGeometry(0.045, 0));
  const stemGeo = cached('scenery-stem', () => new THREE.CylinderGeometry(0.012, 0.012, 1, 4));
  const tuftGeo = cached('scenery-tuft', () => new THREE.ConeGeometry(0.09, 1, 5));

  // Low leafy base so the blooms do not float above bare grass.
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
    part(root, budGeo, petal, { pos: [x, h, z], scale: 0.9 + rng() * 0.4 });
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Small grass blade cluster. */
export function buildGrassClump(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const bladeMat = foliage(0x3f8f42);
  const bladeGeo = cached('scenery-grass-blade', () => new THREE.ConeGeometry(0.05, 0.16, 3));
  const count = 4 + Math.floor(rng() * 5);

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * 0.08;
    const h = 0.07 + rng() * 0.08;
    part(root, bladeGeo, bladeMat, {
      pos: [Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist],
      scale: [0.6 + rng() * 0.5, h / 0.16, 0.6 + rng() * 0.5],
      rot: [0, angle, (rng() - 0.5) * 0.35],
    });
  }

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.85 + rng() * 0.45);
  return { root };
}

/** Scattered low wildflowers — looser than buildFlowerPatch. */
export function buildWildflowers(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const budGeo = cached('scenery-bud', () => new THREE.IcosahedronGeometry(0.045, 0));
  const stemGeo = cached('scenery-stem', () => new THREE.CylinderGeometry(0.01, 0.01, 1, 4));
  const stem = foliage(0x3a8440);
  const count = 2 + Math.floor(rng() * 4);

  for (let i = 0; i < count; i++) {
    const petal = new THREE.MeshStandardMaterial({
      color: PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)],
      roughness: 0.75,
      metalness: 0,
    });
    const x = (rng() - 0.5) * 0.22;
    const z = (rng() - 0.5) * 0.22;
    const h = 0.08 + rng() * 0.07;
    part(root, stemGeo, stem, { pos: [x, h / 2, z], scale: [1, h, 1] });
    part(root, budGeo, petal, { pos: [x, h, z], scale: 0.7 + rng() * 0.5 });
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Shallow pond with reedy bank. */
export function buildPond(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const water = new THREE.MeshStandardMaterial({
    color: 0x3a7a8c,
    roughness: 0.2,
    metalness: 0.12,
    flatShading: true,
  });
  const waterDeep = new THREE.MeshStandardMaterial({
    color: 0x2d5f6e,
    roughness: 0.15,
    metalness: 0.15,
    flatShading: true,
  });
  const bank = foliage(0x356b38);
  const reedMat = foliage(0x4a8f4a);

  const rx = 0.32 + rng() * 0.38;
  const rz = rx * (0.75 + rng() * 0.45);
  const pondGeo = cached('scenery-pond', () => new THREE.CylinderGeometry(1, 1, 1, 9));

  part(root, pondGeo, water, {
    pos: [0, -0.008, 0],
    scale: [rx, 0.035, rz],
    shadow: false,
  });
  part(root, pondGeo, waterDeep, {
    pos: [0.04 * rx, -0.004, -0.03 * rz],
    scale: [rx * 0.55, 0.02, rz * 0.5],
    shadow: false,
  });

  const tuftGeo = cached('scenery-bank-tuft', () => new THREE.ConeGeometry(0.08, 0.14, 4));
  const reedGeo = cached('scenery-reed', () => new THREE.CylinderGeometry(0.012, 0.016, 1, 4));
  const bankCount = 4 + Math.floor(rng() * 4);

  for (let i = 0; i < bankCount; i++) {
    const a = (i / bankCount) * Math.PI * 2 + rng() * 1.1;
    const dist = 0.85 + rng() * 0.22;
    const px = Math.cos(a) * rx * dist;
    const pz = Math.sin(a) * rz * dist;
    if (rng() > 0.45) {
      const h = 0.14 + rng() * 0.12;
      part(root, reedGeo, reedMat, {
        pos: [px, h / 2, pz],
        scale: [1, h, 1],
        rot: [(rng() - 0.5) * 0.2, rng() * Math.PI, 0],
      });
    } else {
      part(root, tuftGeo, bank, {
        pos: [px, 0.05, pz],
        rot: [0, rng() * Math.PI, 0],
        scale: 0.8 + rng() * 0.5,
      });
    }
  }

  root.rotation.y = rng() * Math.PI * 2;
  root.scale.setScalar(0.9 + rng() * 0.35);
  return { root };
}

/** Winding dirt path made of offset flat slabs. */
export function buildGardenPath(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  const dirt = stone(0x7a7262);
  const dirtLight = stone(0x8f8775);
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

  const reed = foliage(0x4a9448);
  const reedDark = foliage(0x356f35);
  const reedGeo = cached('scenery-reed', () => new THREE.CylinderGeometry(0.012, 0.016, 1, 4));
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
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}

/** Fallen log / stump. */
export function buildStump(seed) {
  const rng = seededRng(seed);
  const root = new THREE.Group();
  root.userData.decorative = true;

  addContactShadow(root, 0.14, 0.35);

  const wood = stone(0x5c4638);
  const woodRing = stone(0x6a5344);
  const cyl = cached('scenery-stump', () => new THREE.CylinderGeometry(0.1, 0.12, 1, 6));

  if (rng() > 0.45) {
    part(root, cyl, wood, {
      pos: [0, 0.05, 0],
      scale: [0.7 + rng() * 0.3, 0.1, 0.7 + rng() * 0.3],
      shadow: true,
    });
    part(root, cyl, woodRing, {
      pos: [0, 0.105, 0],
      scale: [0.75 + rng() * 0.2, 0.02, 0.75 + rng() * 0.2],
      shadow: true,
    });
  } else {
    part(root, cyl, wood, {
      pos: [0, 0.04, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [0.5 + rng() * 0.2, 0.08, 0.5 + rng() * 0.2],
      shadow: true,
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

  const capColors = [0xc45c4a, 0xd4a84a, 0xe8dcc8];
  const stemMat = stone(0xe8e0d4);
  const capGeo = cached('scenery-mush-cap', () => new THREE.SphereGeometry(0.05, 5, 4, 0, Math.PI * 2, 0, Math.PI / 2));
  const stemGeo = cached('scenery-mush-stem', () => new THREE.CylinderGeometry(0.014, 0.018, 1, 4));
  const count = 2 + Math.floor(rng() * 3);

  for (let i = 0; i < count; i++) {
    const capMat = new THREE.MeshStandardMaterial({
      color: capColors[Math.floor(rng() * capColors.length)],
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
    });
    const x = (rng() - 0.5) * 0.14;
    const z = (rng() - 0.5) * 0.14;
    const h = 0.05 + rng() * 0.04;
    part(root, stemGeo, stemMat, { pos: [x, h / 2, z], scale: [1, h, 1] });
    part(root, capGeo, capMat, { pos: [x, h, z], scale: 0.8 + rng() * 0.5 });
  }

  root.rotation.y = rng() * Math.PI * 2;
  return { root };
}
