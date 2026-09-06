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
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    shadowTex = new THREE.CanvasTexture(canvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return shadowTex;
}

function addContactShadow(root, radius, opacity = 0.48) {
  const material = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = part(
    root,
    cached('side-shadow-quad', () => new THREE.PlaneGeometry(radius * 2, radius * 2)),
    material,
    { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0] },
  );
  mesh.renderOrder = 1;
  return mesh;
}

function createMats() {
  return {
    body: new THREE.MeshStandardMaterial({
      color: 0x5b8fd9,
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x1e3a5f,
      emissiveIntensity: 0.15,
    }),
    bodyAlt: new THREE.MeshStandardMaterial({
      color: 0x7c6cf0,
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x312e81,
      emissiveIntensity: 0.15,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.78,
      metalness: 0.02,
    }),
    paperFold: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.82,
      metalness: 0.02,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0xb8c4d4,
      roughness: 0.28,
      metalness: 0.72,
      emissive: 0x334155,
      emissiveIntensity: 0.12,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0xf5c451,
      roughness: 0.35,
      metalness: 0.55,
      emissive: 0x6b3f04,
      emissiveIntensity: 0.2,
    }),
    badge: new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.45,
      metalness: 0.1,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.35,
    }),
  };
}

/** 好友：雙人剪影（頭 + 肩），最常見的社交 icon 造型 */
function buildFriendsIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.22, 0.45);

  const icon = new THREE.Group();
  icon.position.y = 0.1;

  function addPerson(parent, material, { x, y, z, headR, bodyW, bodyH }) {
    const person = new THREE.Group();
    part(person, cached('side-person-head', () => new THREE.SphereGeometry(1, 10, 10)), material, {
      pos: [0, bodyH + headR, 0],
      scale: headR,
      shadow: true,
    });
    part(person, cached('side-person-body', () => new THREE.CylinderGeometry(1, 1.15, 1, 12)), material, {
      pos: [0, bodyH / 2, 0],
      scale: [bodyW, bodyH, bodyW * 0.55],
      shadow: true,
    });
    person.position.set(x, y, z);
    parent.add(person);
    return person;
  }

  addPerson(icon, mats.bodyAlt, { x: -0.05, y: 0, z: -0.02, headR: 0.038, bodyW: 0.052, bodyH: 0.055 });
  addPerson(icon, mats.body, { x: 0.05, y: -0.01, z: 0.02, headR: 0.042, bodyW: 0.058, bodyH: 0.062 });

  root.add(icon);
  root.rotation.y = 0.35;
  return root;
}

/** 信箱：經典信封造型（矩形 + V 形折口） */
function buildMailIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.22, 0.45);

  const envelope = new THREE.Group();
  envelope.position.y = 0.1;

  const w = 0.22;
  const h = 0.14;
  const d = 0.018;

  part(envelope, cached('side-env-body', () => new THREE.BoxGeometry(w, h, d)), mats.paper, {
    pos: [0, 0, 0],
    shadow: true,
  });

  const flapLen = w * 0.52;
  part(envelope, cached('side-env-flap-l', () => new THREE.BoxGeometry(flapLen, 0.012, d * 1.1)), mats.paperFold, {
    pos: [-w * 0.25, h * 0.42, d * 0.15],
    rot: [0, 0, 0.72],
    shadow: true,
  });
  part(envelope, cached('side-env-flap-r', () => new THREE.BoxGeometry(flapLen, 0.012, d * 1.1)), mats.paperFold, {
    pos: [w * 0.25, h * 0.42, d * 0.15],
    rot: [0, 0, -0.72],
    shadow: true,
  });
  part(envelope, cached('side-env-flap-b', () => new THREE.BoxGeometry(w * 0.88, 0.012, d * 1.1)), mats.paperFold, {
    pos: [0, -h * 0.38, d * 0.1],
    rot: [0.18, 0, 0],
    shadow: true,
  });

  part(envelope, cached('side-env-badge', () => new THREE.SphereGeometry(0.022, 8, 8)), mats.badge, {
    pos: [w * 0.34, h * 0.34, d * 0.6],
    shadow: true,
  });

  root.add(envelope);
  root.rotation.y = 0.35;
  return root;
}

/** 設定：六齒齒輪，乾淨俐落的機械符號 */
function buildSettingsIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.22, 0.45);

  const gear = new THREE.Group();
  gear.position.y = 0.1;
  gear.rotation.x = Math.PI / 2;

  const teeth = 6;
  const toothGeo = cached('side-gear-tooth', () => new THREE.BoxGeometry(0.038, 0.024, 0.034));
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    part(gear, toothGeo, mats.metal, {
      pos: [Math.cos(angle) * 0.072, Math.sin(angle) * 0.072, 0],
      rot: [0, 0, angle],
      shadow: true,
    });
  }

  part(gear, cached('side-gear-ring', () => new THREE.TorusGeometry(0.058, 0.014, 6, 24)), mats.metal, {
    shadow: true,
  });
  part(gear, cached('side-gear-hole', () => new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12)), mats.accent, {
    rot: [Math.PI / 2, 0, 0],
    shadow: true,
  });

  root.add(gear);
  root.rotation.y = 0.35;
  return root;
}

/** 帳號：單人剪影（頭 + 肩），與好友 icon 同系列 */
function buildAccountIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.22, 0.45);

  const icon = new THREE.Group();
  icon.position.y = 0.1;

  part(icon, cached('side-account-head', () => new THREE.SphereGeometry(0.044, 10, 10)), mats.body, {
    pos: [0, 0.048, 0.01],
    shadow: true,
  });

  part(icon, cached('side-account-body', () => new THREE.CylinderGeometry(1, 1.15, 1, 12)), mats.bodyAlt, {
    pos: [0, -0.006, 0.01],
    scale: [0.072, 0.068, 0.042],
    shadow: true,
  });

  root.add(icon);
  root.rotation.y = 0.35;
  return root;
}

const BUILDERS = {
  friends: buildFriendsIcon,
  mail: buildMailIcon,
  settings: buildSettingsIcon,
  account: buildAccountIcon,
};

export const SIDE_ICON_IDS = ['friends', 'mail', 'settings', 'account'];

export function buildSideIconModel(iconId) {
  const builder = BUILDERS[iconId];
  if (!builder) return null;
  const mats = createMats();
  return builder(mats);
}
