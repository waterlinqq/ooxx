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
    clothAlt: new THREE.MeshStandardMaterial({
      color: 0x5b4a72,
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

  const swordL = addSword(root, mats, { rotY: 0.55, tilt: 0.22, side: -1 });
  const swordR = addSword(root, mats, { rotY: -0.55, tilt: 0.22, side: 1 });
  swordL.userData.baseRotation = swordL.rotation.clone();
  swordR.userData.baseRotation = swordR.rotation.clone();
  swordL.userData.basePosition = swordL.position.clone();
  swordR.userData.basePosition = swordR.position.clone();
  root.userData.swords = [swordL, swordR];
  root.userData.baseRotation = root.rotation.clone();

  root.rotation.y = 0.35;
  return root;
}

function addRosterMember(parent, mats, {
  pos = [0, 0, 0],
  scale = 1,
  bodyMat = mats.cloth,
  hood = false,
} = {}) {
  const member = new THREE.Group();
  const legH = 0.042;
  const bodyH = 0.068;
  const headR = 0.024;

  for (const side of [-1, 1]) {
    part(member, cached('nav-roster-leg', () => new THREE.BoxGeometry(0.022, legH, 0.026)), mats.leather, {
      pos: [side * 0.015, legH / 2, 0],
      shadow: true,
    });
  }

  part(member, cached('nav-roster-torso', () => new THREE.BoxGeometry(0.052, bodyH, 0.03)), bodyMat, {
    pos: [0, legH + bodyH / 2, 0],
    shadow: true,
  });

  for (const side of [-1, 1]) {
    part(member, cached('nav-roster-arm', () => new THREE.BoxGeometry(0.016, 0.05, 0.018)), bodyMat, {
      pos: [side * 0.036, legH + bodyH * 0.42, 0],
      shadow: true,
    });
  }

  if (hood) {
    part(member, cached('nav-roster-hood', () => new THREE.SphereGeometry(headR * 1.15, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), bodyMat, {
      pos: [0, legH + bodyH + headR * 0.7, -0.004],
      shadow: true,
    });
  } else {
    part(member, cached('nav-roster-head', () => new THREE.SphereGeometry(headR, 8, 8)), mats.trim, {
      pos: [0, legH + bodyH + headR + 0.006, 0],
      shadow: true,
    });
  }

  member.position.set(pos[0], pos[1], pos[2]);
  member.scale.setScalar(scale);
  parent.add(member);
  return member;
}

function buildFormationIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.3, 0.52);

  const deckY = 0.018;
  part(root, cached('nav-roster-deck', () => new THREE.BoxGeometry(0.34, 0.036, 0.14)), mats.wood, {
    pos: [0, deckY, 0],
    shadow: true,
  });
  part(root, cached('nav-roster-back', () => new THREE.BoxGeometry(0.34, 0.16, 0.02)), mats.cloth, {
    pos: [0, deckY + 0.1, -0.07],
    shadow: true,
  });
  part(root, cached('nav-roster-back-trim', () => new THREE.BoxGeometry(0.36, 0.014, 0.024)), mats.trim, {
    pos: [0, deckY + 0.182, -0.07],
    shadow: true,
  });

  const slotColors = [mats.clothAlt, mats.cloth, mats.leather];
  const memberGroups = [];
  const members = [
    { x: -0.1, scale: 0.94, bodyMat: mats.clothAlt, hood: true },
    { x: 0, scale: 1.06, bodyMat: mats.cloth, hood: false },
    { x: 0.1, scale: 0.94, bodyMat: mats.leather, hood: false },
  ];

  for (let i = 0; i < members.length; i++) {
    const { x, scale, bodyMat, hood } = members[i];
    part(root, cached(`nav-roster-slot-${i}`, () => new THREE.CylinderGeometry(0.038, 0.038, 0.006, 12)), slotColors[i], {
      pos: [x, deckY + 0.02, 0.01],
      shadow: true,
    });
    const member = addRosterMember(root, mats, {
      pos: [x, deckY + 0.022, 0.01],
      scale,
      bodyMat,
      hood,
    });
    member.userData.navMemberIndex = i;
    member.userData.basePosition = member.position.clone();
    member.userData.baseScale = scale;
    memberGroups.push(member);
  }

  root.userData.members = memberGroups;

  root.rotation.y = 0.35;
  return root;
}

function buildCharactersIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.58);

  const codex = new THREE.Group();

  part(codex, cached('nav-codex-stand', () => new THREE.BoxGeometry(0.22, 0.06, 0.14)), mats.wood, {
    pos: [0, 0.03, 0],
    shadow: true,
  });
  part(codex, cached('nav-codex-stand-top', () => new THREE.BoxGeometry(0.24, 0.012, 0.16)), mats.trim, {
    pos: [0, 0.066, 0],
    shadow: true,
  });

  const book = new THREE.Group();
  book.position.set(0, 0.072, 0.01);
  book.rotation.set(-0.22, 0, 0);

  part(book, cached('nav-codex-pages', () => new THREE.BoxGeometry(0.17, 0.2, 0.022)), mats.page, {
    pos: [0, 0.1, -0.01],
    shadow: true,
  });
  part(book, cached('nav-codex-cover-front', () => new THREE.BoxGeometry(0.18, 0.21, 0.018)), mats.leather, {
    pos: [0, 0.1, 0.014],
    shadow: true,
  });
  part(book, cached('nav-codex-spine', () => new THREE.BoxGeometry(0.034, 0.21, 0.042)), mats.leather, {
    pos: [-0.1, 0.1, 0],
    shadow: true,
  });
  part(book, cached('nav-codex-spine-gold', () => new THREE.BoxGeometry(0.012, 0.18, 0.044)), mats.gold, {
    pos: [-0.1, 0.1, 0],
    shadow: true,
  });

  for (const [x, y] of [[-0.07, 0.19], [0.07, 0.19], [-0.07, 0.01], [0.07, 0.01]]) {
    part(book, cached(`nav-codex-corner-${x}-${y}`, () => new THREE.BoxGeometry(0.024, 0.024, 0.006)), mats.gold, {
      pos: [x, y, 0.024],
      shadow: true,
    });
  }

  part(book, cached('nav-codex-medallion', () => new THREE.CylinderGeometry(0.042, 0.042, 0.007, 14)), mats.gold, {
    pos: [0.01, 0.11, 0.026],
    rot: [Math.PI / 2, 0, 0],
    shadow: true,
  });
  part(book, cached('nav-codex-emblem-head', () => new THREE.SphereGeometry(0.018, 8, 8)), mats.trim, {
    pos: [0.01, 0.128, 0.032],
    shadow: true,
  });
  part(book, cached('nav-codex-emblem-body', () => new THREE.BoxGeometry(0.034, 0.038, 0.01)), mats.cloth, {
    pos: [0.01, 0.098, 0.03],
    shadow: true,
  });

  part(book, cached('nav-codex-ribbon', () => new THREE.BoxGeometry(0.012, 0.055, 0.004)), mats.clothAlt, {
    pos: [0.065, 0.045, 0.012],
    shadow: true,
  });
  const clasp = part(book, cached('nav-codex-clasp', () => new THREE.OctahedronGeometry(0.016, 0)), mats.arcane, {
    pos: [-0.04, 0.17, 0.028],
    shadow: false,
  });
  clasp.userData.basePosition = clasp.position.clone();

  book.userData.baseRotation = book.rotation.clone();
  root.userData.book = book;
  root.userData.clasp = clasp;

  codex.add(book);
  codex.rotation.y = 0.35;
  root.add(codex);
  return root;
}

function buildQuestsIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.58);

  const board = new THREE.Group();

  part(board, cached('nav-quest-base', () => new THREE.BoxGeometry(0.22, 0.05, 0.12)), mats.wood, {
    pos: [0, 0.025, 0],
    shadow: true,
  });
  part(board, cached('nav-quest-back', () => new THREE.BoxGeometry(0.2, 0.24, 0.018)), mats.leather, {
    pos: [0, 0.15, -0.02],
    shadow: true,
  });
  part(board, cached('nav-quest-back-rim', () => new THREE.BoxGeometry(0.21, 0.25, 0.008)), mats.gold, {
    pos: [0, 0.15, -0.03],
    shadow: true,
  });

  const paper = part(board, cached('nav-quest-paper', () => new THREE.BoxGeometry(0.15, 0.19, 0.006)), mats.page, {
    pos: [0, 0.148, 0.01],
    shadow: true,
  });
  paper.userData.basePosition = paper.position.clone();
  paper.userData.baseRotation = paper.rotation.clone();

  part(board, cached('nav-quest-pin', () => new THREE.SphereGeometry(0.013, 8, 8)), mats.gold, {
    pos: [0, 0.235, 0.016],
    shadow: true,
  });

  const checks = [];
  for (let i = 0; i < 3; i++) {
    const y = 0.2 - i * 0.048;
    const check = part(board, cached(`nav-quest-check-${i}`, () => new THREE.BoxGeometry(0.013, 0.013, 0.004)), i === 0 ? mats.gold : mats.trim, {
      pos: [-0.052, y, 0.016],
      shadow: true,
    });
    check.userData.baseScale = 1;
    checks.push(check);
    part(board, cached(`nav-quest-line-${i}`, () => new THREE.BoxGeometry(0.085, 0.007, 0.003)), mats.trim, {
      pos: [0.018, y, 0.016],
    });
  }

  const reward = part(board, cached('nav-quest-reward', () => new THREE.OctahedronGeometry(0.02, 0)), mats.arcane, {
    pos: [0.045, 0.078, 0.018],
    shadow: true,
  });
  reward.userData.basePosition = reward.position.clone();
  reward.userData.baseScale = 1;

  part(board, cached('nav-quest-reward-tag', () => new THREE.BoxGeometry(0.04, 0.012, 0.004)), mats.gold, {
    pos: [0.045, 0.058, 0.016],
    shadow: true,
  });

  board.userData.baseRotation = board.rotation.clone();
  root.userData.board = board;

  root.userData.paper = paper;
  root.userData.checks = checks;
  root.userData.reward = reward;

  board.rotation.y = 0.35;
  root.add(board);
  return root;
}

function buildShopIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.58);

  const stall = new THREE.Group();

  part(stall, cached('nav-shop-base', () => new THREE.BoxGeometry(0.28, 0.1, 0.15)), mats.wood, {
    pos: [0, 0.05, 0],
    shadow: true,
  });
  part(stall, cached('nav-shop-counter', () => new THREE.BoxGeometry(0.3, 0.016, 0.17)), mats.trim, {
    pos: [0, 0.108, 0.01],
    shadow: true,
  });
  part(stall, cached('nav-shop-shelf', () => new THREE.BoxGeometry(0.26, 0.06, 0.02)), mats.leather, {
    pos: [0, 0.14, -0.065],
    shadow: true,
  });

  part(stall, cached('nav-shop-post-l', () => new THREE.BoxGeometry(0.02, 0.12, 0.02)), mats.wood, {
    pos: [-0.13, 0.16, -0.05],
    shadow: true,
  });
  part(stall, cached('nav-shop-post-r', () => new THREE.BoxGeometry(0.02, 0.12, 0.02)), mats.wood, {
    pos: [0.13, 0.16, -0.05],
    shadow: true,
  });
  const awning = part(stall, cached('nav-shop-awning', () => new THREE.BoxGeometry(0.32, 0.026, 0.13)), mats.awning, {
    pos: [0, 0.215, 0.03],
    rot: [0.38, 0, 0],
    shadow: true,
  });
  awning.userData.baseRotation = awning.rotation.clone();
  part(stall, cached('nav-shop-awning-trim', () => new THREE.BoxGeometry(0.34, 0.01, 0.016)), mats.gold, {
    pos: [0, 0.178, 0.1],
    rot: [0.38, 0, 0],
    shadow: true,
  });

  const coins = [];
  const coinA = part(stall, cached('nav-shop-coin-a', () => new THREE.CylinderGeometry(0.034, 0.036, 0.008, 10)), mats.gold, {
    pos: [-0.07, 0.124, 0.04],
    rot: [0, 0.2, 0],
    shadow: true,
  });
  coinA.userData.basePosition = coinA.position.clone();
  coinA.userData.baseRotation = coinA.rotation.clone();
  coins.push(coinA);
  const coinB = part(stall, cached('nav-shop-coin-b', () => new THREE.CylinderGeometry(0.034, 0.036, 0.008, 10)), mats.gold, {
    pos: [-0.07, 0.134, 0.04],
    rot: [0, 0.55, 0],
    shadow: true,
  });
  coinB.userData.basePosition = coinB.position.clone();
  coinB.userData.baseRotation = coinB.rotation.clone();
  coins.push(coinB);
  const coinC = part(stall, cached('nav-shop-coin-c', () => new THREE.CylinderGeometry(0.03, 0.03, 0.008, 10)), mats.gold, {
    pos: [-0.068, 0.144, 0.042],
    rot: [0, 0.9, 0],
    shadow: true,
  });
  coinC.userData.basePosition = coinC.position.clone();
  coinC.userData.baseRotation = coinC.rotation.clone();
  coins.push(coinC);

  part(stall, cached('nav-shop-bottle', () => new THREE.CylinderGeometry(0.018, 0.022, 0.05, 8)), mats.trim, {
    pos: [0.05, 0.142, 0.03],
    shadow: true,
  });
  part(stall, cached('nav-shop-bottle-neck', () => new THREE.CylinderGeometry(0.01, 0.012, 0.018, 6)), mats.trim, {
    pos: [0.05, 0.176, 0.03],
    shadow: true,
  });
  const gem = part(stall, cached('nav-shop-bottle-gem', () => new THREE.SphereGeometry(0.016, 6, 6)), mats.arcane, {
    pos: [0.05, 0.158, 0.038],
    shadow: false,
  });
  gem.userData.basePosition = gem.position.clone();
  gem.userData.baseEmissive = gem.material.emissiveIntensity;
  gem.userData.baseScale = 1;

  root.userData.stall = stall;
  root.userData.awning = awning;
  root.userData.coins = coins;
  root.userData.gem = gem;

  stall.rotation.y = 0.35;
  root.add(stall);
  return root;
}

const BUILDERS = {
  battle: buildBattleIcon,
  formation: buildFormationIcon,
  codex: buildCharactersIcon,
  quests: buildQuestsIcon,
  shop: buildShopIcon,
};

export const NAV_ICON_IDS = ['formation', 'codex', 'battle', 'quests', 'shop'];

export function buildNavIconModel(navId) {
  const builder = BUILDERS[navId];
  if (!builder) return null;
  const mats = createMats();
  return builder(mats);
}
