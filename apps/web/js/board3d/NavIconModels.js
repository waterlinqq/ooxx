import * as THREE from 'three';

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
    gradient.addColorStop(0, 'rgba(0,0,0,0.6)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.26)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    shadowTex = new THREE.CanvasTexture(canvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return shadowTex;
}

function addContactShadow(root, radius, opacity = 0.55) {
  const material = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = part(
    root,
    cached('nav-shadow-quad', () => new THREE.PlaneGeometry(radius * 2, radius * 2)),
    material,
    { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0] },
  );
  mesh.renderOrder = 1;
  return mesh;
}

function createMats() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0xc9d4e2, roughness: 0.32, metalness: 0.72 }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xf5c451,
      roughness: 0.3,
      metalness: 0.68,
      emissive: 0x6b3f04,
      emissiveIntensity: 0.35,
    }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4a382c, roughness: 0.9, metalness: 0.06 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.82, metalness: 0.05 }),
    cloth: new THREE.MeshStandardMaterial({
      color: 0x3b4f72,
      roughness: 0.92,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.32,
      metalness: 0.55,
      emissive: 0x334155,
      emissiveIntensity: 0.2,
    }),
    arcane: new THREE.MeshStandardMaterial({
      color: 0xd8b4fe,
      roughness: 0.25,
      metalness: 0.1,
      emissive: 0xa855f7,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.92,
    }),
    page: new THREE.MeshStandardMaterial({ color: 0xf8f0dc, roughness: 0.88, metalness: 0.02 }),
    awning: new THREE.MeshStandardMaterial({
      color: 0xd92d3f,
      roughness: 0.62,
      metalness: 0.08,
      emissive: 0x52101a,
      emissiveIntensity: 0.2,
      side: THREE.DoubleSide,
    }),
    base: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
      emissive: 0x0f172a,
      emissiveIntensity: 0.25,
    }),
  };
}

function addSword(parent, mats, { rotY = 0, tilt = 0.28, side = 1 } = {}) {
  const sword = new THREE.Group();
  part(sword, cached('nav-blade', () => new THREE.BoxGeometry(0.04, 0.22, 0.012)), mats.steel, {
    pos: [0, 0.11, 0],
    shadow: true,
  });
  part(sword, cached('nav-guard', () => new THREE.BoxGeometry(0.1, 0.018, 0.024)), mats.gold, {
    pos: [0, 0.018, 0],
    shadow: true,
  });
  part(sword, cached('nav-hilt', () => new THREE.CylinderGeometry(0.014, 0.016, 0.06, 8)), mats.leather, {
    pos: [0, -0.018, 0],
    shadow: true,
  });
  part(sword, cached('nav-pommel', () => new THREE.SphereGeometry(0.018, 8, 8)), mats.gold, {
    pos: [0, -0.052, 0],
    shadow: true,
  });
  sword.position.set(side * 0.04, 0.12, 0);
  sword.rotation.set(tilt, rotY, side * 0.42);
  parent.add(sword);
  return sword;
}

function buildBattleIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.58);

  part(root, cached('nav-battle-base', () => new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16)), mats.base, {
    pos: [0, 0.02, 0],
    shadow: true,
  });
  part(root, cached('nav-battle-rim', () => new THREE.TorusGeometry(0.2, 0.012, 6, 20)), mats.gold, {
    pos: [0, 0.04, 0],
    rot: [-Math.PI / 2, 0, 0],
    shadow: true,
  });

  addSword(root, mats, { rotY: 0.55, tilt: 0.22, side: -1 });
  addSword(root, mats, { rotY: -0.55, tilt: 0.22, side: 1 });

  root.rotation.y = 0.35;
  return root;
}

function buildFormationIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.26, 0.58);

  const shield = new THREE.Group();
  part(shield, cached('nav-shield-face', () => new THREE.BoxGeometry(0.22, 0.28, 0.03)), mats.cloth, {
    pos: [0, 0.16, 0],
    shadow: true,
  });
  part(shield, cached('nav-shield-rim', () => new THREE.BoxGeometry(0.24, 0.3, 0.018)), mats.trim, {
    pos: [0, 0.16, -0.012],
    shadow: true,
  });
  part(shield, cached('nav-shield-boss', () => new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10)), mats.gold, {
    pos: [0, 0.16, 0.02],
    rot: [Math.PI / 2, 0, 0],
    shadow: true,
  });
  part(shield, cached('nav-shield-grip', () => new THREE.BoxGeometry(0.04, 0.08, 0.03)), mats.leather, {
    pos: [0, 0.12, -0.04],
    shadow: true,
  });
  part(shield, cached('nav-shield-stand', () => new THREE.BoxGeometry(0.06, 0.04, 0.08)), mats.wood, {
    pos: [0, 0.02, 0.02],
    rot: [0.18, 0, 0],
    shadow: true,
  });

  shield.rotation.x = -0.12;
  shield.rotation.y = 0.35;
  root.add(shield);
  return root;
}

function buildCharactersIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.58);

  const book = new THREE.Group();
  part(book, cached('nav-book-spine', () => new THREE.BoxGeometry(0.04, 0.18, 0.14)), mats.leather, {
    pos: [-0.06, 0.1, 0],
    shadow: true,
  });
  part(book, cached('nav-book-cover-l', () => new THREE.BoxGeometry(0.1, 0.18, 0.02)), mats.leather, {
    pos: [-0.01, 0.1, 0.07],
    rot: [0, -0.55, 0],
    shadow: true,
  });
  part(book, cached('nav-book-cover-r', () => new THREE.BoxGeometry(0.1, 0.18, 0.02)), mats.leather, {
    pos: [0.01, 0.1, -0.07],
    rot: [0, 0.55, 0],
    shadow: true,
  });
  part(book, cached('nav-book-page-l', () => new THREE.BoxGeometry(0.08, 0.16, 0.01)), mats.page, {
    pos: [-0.01, 0.1, 0.04],
    rot: [0, -0.35, 0],
    shadow: true,
  });
  part(book, cached('nav-book-page-r', () => new THREE.BoxGeometry(0.08, 0.16, 0.01)), mats.page, {
    pos: [0.01, 0.1, -0.04],
    rot: [0, 0.35, 0],
    shadow: true,
  });
  part(book, cached('nav-book-gem', () => new THREE.OctahedronGeometry(0.028, 0)), mats.arcane, {
    pos: [0, 0.14, 0],
    shadow: false,
  });
  part(book, cached('nav-book-spark-a', () => new THREE.SphereGeometry(0.012, 6, 6)), mats.arcane, {
    pos: [0.06, 0.18, 0.04],
    shadow: false,
  });
  part(book, cached('nav-book-spark-b', () => new THREE.SphereGeometry(0.009, 6, 6)), mats.arcane, {
    pos: [-0.05, 0.2, -0.03],
    shadow: false,
  });

  book.rotation.y = 0.35;
  root.add(book);
  return root;
}

function buildBagIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.26, 0.58);

  const bag = new THREE.Group();
  part(bag, cached('nav-bag-body', () => new THREE.BoxGeometry(0.2, 0.18, 0.1)), mats.leather, {
    pos: [0, 0.11, 0],
    rot: [0, 0.35, 0],
    shadow: true,
  });
  part(bag, cached('nav-bag-flap', () => new THREE.BoxGeometry(0.18, 0.08, 0.02)), mats.leather, {
    pos: [0, 0.2, 0.04],
    rot: [0.28, 0.35, 0],
    shadow: true,
  });
  part(bag, cached('nav-bag-strap-l', () => new THREE.BoxGeometry(0.03, 0.14, 0.02)), mats.trim, {
    pos: [-0.07, 0.16, 0.02],
    rot: [0.1, 0.35, -0.22],
    shadow: true,
  });
  part(bag, cached('nav-bag-strap-r', () => new THREE.BoxGeometry(0.03, 0.14, 0.02)), mats.trim, {
    pos: [0.07, 0.16, 0.02],
    rot: [0.1, 0.35, 0.22],
    shadow: true,
  });
  part(bag, cached('nav-bag-buckle', () => new THREE.BoxGeometry(0.06, 0.04, 0.02)), mats.gold, {
    pos: [0, 0.18, 0.06],
    rot: [0.28, 0.35, 0],
    shadow: true,
  });

  root.add(bag);
  return root;
}

function buildShopIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.58);

  part(root, cached('nav-shop-post-l', () => new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)), mats.wood, {
    pos: [-0.1, 0.11, 0],
    shadow: true,
  });
  part(root, cached('nav-shop-post-r', () => new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)), mats.wood, {
    pos: [0.1, 0.11, 0],
    shadow: true,
  });
  part(root, cached('nav-shop-awning', () => new THREE.BoxGeometry(0.24, 0.04, 0.12)), mats.awning, {
    pos: [0, 0.22, 0.02],
    rot: [0.12, 0.35, 0],
    shadow: true,
  });
  part(root, cached('nav-shop-trim', () => new THREE.BoxGeometry(0.26, 0.012, 0.02)), mats.gold, {
    pos: [0, 0.19, 0.08],
    rot: [0.12, 0.35, 0],
    shadow: true,
  });

  const coinOffsets = [
    [0, 0.04, 0],
    [-0.04, 0.06, 0.02],
    [0.04, 0.07, -0.02],
  ];
  for (const [x, y, z] of coinOffsets) {
    part(root, cached(`nav-coin-${x}-${y}`, () => new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12)), mats.gold, {
      pos: [x, y, z],
      rot: [0, 0.35, 0],
      shadow: true,
    });
  }

  root.rotation.y = 0.35;
  return root;
}

const BUILDERS = {
  battle: buildBattleIcon,
  formation: buildFormationIcon,
  characters: buildCharactersIcon,
  bag: buildBagIcon,
  shop: buildShopIcon,
};

export const NAV_ICON_IDS = ['battle', 'formation', 'characters', 'bag', 'shop'];

export function buildNavIconModel(navId) {
  const builder = BUILDERS[navId];
  if (!builder) return null;
  const mats = createMats();
  return builder(mats);
}
