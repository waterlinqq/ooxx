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
    cached('mode-shadow-quad', () => new THREE.PlaneGeometry(radius * 2, radius * 2)),
    material,
    { pos: [0, 0.004, 0], rot: [-Math.PI / 2, 0, 0] },
  );
  mesh.renderOrder = 1;
  return mesh;
}

function createMats() {
  return {
    base: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
      emissive: 0x0f172a,
      emissiveIntensity: 0.25,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xf5c451,
      roughness: 0.3,
      metalness: 0.68,
      emissive: 0x6b3f04,
      emissiveIntensity: 0.35,
    }),
    tile: new THREE.MeshStandardMaterial({
      color: 0x6b8f71,
      roughness: 0.78,
      metalness: 0.05,
      emissive: 0x1a2e1f,
      emissiveIntensity: 0.12,
    }),
    tileAlt: new THREE.MeshStandardMaterial({
      color: 0x7aa382,
      roughness: 0.75,
      metalness: 0.05,
      emissive: 0x1a2e1f,
      emissiveIntensity: 0.18,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.86,
      metalness: 0.08,
      emissive: 0x1e293b,
      emissiveIntensity: 0.1,
    }),
    castle: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.62,
      metalness: 0.18,
      emissive: 0x334155,
      emissiveIntensity: 0.15,
    }),
    flag: new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.25,
    }),
    bolt: new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.25,
      metalness: 0.2,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2,
    }),
    flame: new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0xea580c,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.92,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.32,
      metalness: 0.55,
    }),
  };
}

function addMiniBoard(parent, mats, size, { borderStone = false, accentCells = [] } = {}) {
  const board = new THREE.Group();
  const boardWidth = 0.26;
  const gap = 0.005;
  const tileSize = (boardWidth - gap * (size - 1)) / size;
  const pitch = tileSize + gap;
  const offset = (size - 1) * pitch / 2;
  const tileGeo = cached(`mode-tile-${tileSize.toFixed(4)}`, () => (
    new THREE.BoxGeometry(tileSize, 0.014, tileSize)
  ));

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const onBorder = borderStone && (row === 0 || row === size - 1 || col === 0 || col === size - 1);
      const accented = accentCells.some(([r, c]) => r === row && c === col);
      const mat = onBorder ? mats.stone : accented ? mats.tileAlt : mats.tile;
      const x = col * pitch - offset;
      const z = row * pitch - offset;
      part(board, tileGeo, mat, { pos: [x, 0.02, z], shadow: true });
    }
  }

  board.position.y = 0.01;
  parent.add(board);
  return board;
}

function addLightning(parent, mats) {
  const bolt = new THREE.Group();
  const segA = part(bolt, cached('mode-bolt-a', () => new THREE.BoxGeometry(0.018, 0.05, 0.01)), mats.bolt, {
    pos: [0.004, 0.06, 0.012],
    rot: [0, 0.2, 0.55],
    shadow: true,
  });
  const segB = part(bolt, cached('mode-bolt-b', () => new THREE.BoxGeometry(0.018, 0.04, 0.01)), mats.bolt, {
    pos: [-0.01, 0.03, 0.012],
    rot: [0, 0.2, -0.45],
    shadow: true,
  });
  const segC = part(bolt, cached('mode-bolt-c', () => new THREE.BoxGeometry(0.016, 0.035, 0.01)), mats.bolt, {
    pos: [0.012, 0.015, 0.012],
    rot: [0, 0.2, 0.35],
    shadow: true,
  });
  bolt.position.set(0, 0.05, 0.05);
  bolt.rotation.y = 0.35;
  parent.add(bolt);
  return { bolt, segA, segB, segC };
}

function addCastle(parent, mats, { pos = [0.08, 0, 0.08] } = {}) {
  const castle = new THREE.Group();
  part(castle, cached('mode-castle-base', () => new THREE.BoxGeometry(0.05, 0.03, 0.05)), mats.castle, {
    pos: [0, 0.035, 0],
    shadow: true,
  });
  part(castle, cached('mode-castle-tower', () => new THREE.BoxGeometry(0.034, 0.05, 0.034)), mats.castle, {
    pos: [0, 0.07, 0],
    shadow: true,
  });
  part(castle, cached('mode-castle-crown', () => new THREE.ConeGeometry(0.028, 0.028, 4)), mats.gold, {
    pos: [0, 0.11, 0],
    shadow: true,
  });
  castle.position.set(pos[0], 0.03, pos[2]);
  parent.add(castle);
  return castle;
}

function addFlag(parent, mats, { pos = [-0.08, 0, -0.08] } = {}) {
  const flag = new THREE.Group();
  part(flag, cached('mode-flag-pole', () => new THREE.CylinderGeometry(0.004, 0.005, 0.08, 6)), mats.trim, {
    pos: [0, 0.05, 0],
    shadow: true,
  });
  part(flag, cached('mode-flag-cloth', () => new THREE.BoxGeometry(0.03, 0.02, 0.004)), mats.flag, {
    pos: [0.016, 0.07, 0],
    shadow: true,
  });
  flag.position.set(pos[0], 0.02, pos[2]);
  parent.add(flag);
  return flag;
}

function addSurvivalFlame(parent, mats) {
  const flame = part(parent, cached('mode-flame', () => new THREE.ConeGeometry(0.028, 0.05, 6)), mats.flame, {
    pos: [0, 0.08, 0.04],
    shadow: false,
  });
  const ember = part(parent, cached('mode-ember', () => new THREE.SphereGeometry(0.012, 6, 6)), mats.bolt, {
    pos: [0.02, 0.06, 0.03],
    shadow: false,
  });
  flame.userData.baseScale = 1;
  ember.userData.baseScale = 1;
  return { flame, ember };
}

function buildQuickModeIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.55);
  part(root, cached('mode-quick-base', () => new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16)), mats.base, {
    pos: [0, 0.02, 0],
    shadow: true,
  });
  addMiniBoard(root, mats, 3, { accentCells: [[1, 1]] });
  addLightning(root, mats);
  root.rotation.y = 0.35;
  return root;
}

function buildStandardModeIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.55);
  part(root, cached('mode-standard-base', () => new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16)), mats.base, {
    pos: [0, 0.02, 0],
    shadow: true,
  });
  addMiniBoard(root, mats, 4, { accentCells: [[1, 1], [2, 2]] });
  part(root, cached('mode-standard-gem', () => new THREE.OctahedronGeometry(0.018, 0)), mats.gold, {
    pos: [0, 0.08, 0.05],
    shadow: true,
  });
  root.rotation.y = 0.35;
  return root;
}

function buildSiegeModeIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.55);
  part(root, cached('mode-siege-base', () => new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16)), mats.base, {
    pos: [0, 0.02, 0],
    shadow: true,
  });
  addMiniBoard(root, mats, 5);
  addCastle(root, mats, { pos: [0.09, 0, 0.09] });
  addFlag(root, mats, { pos: [-0.09, 0, -0.09] });
  root.rotation.y = 0.35;
  return root;
}

function buildSurvivalModeIcon(mats) {
  const root = new THREE.Group();
  addContactShadow(root, 0.28, 0.55);
  part(root, cached('mode-survival-base', () => new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16)), mats.base, {
    pos: [0, 0.02, 0],
    shadow: true,
  });
  addMiniBoard(root, mats, 6, { borderStone: true, accentCells: [[2, 2], [3, 3]] });
  addSurvivalFlame(root, mats);
  root.rotation.y = 0.35;
  return root;
}

const BUILDERS = {
  '3x3': buildQuickModeIcon,
  '4x4': buildStandardModeIcon,
  '5x5': buildSiegeModeIcon,
  '6x6': buildSurvivalModeIcon,
};

export const MODE_ICON_IDS = ['3x3', '4x4', '5x5', '6x6'];

export function buildModeIconModel(modeId) {
  const builder = BUILDERS[modeId];
  if (!builder) return null;
  const mats = createMats();
  return builder(mats);
}
