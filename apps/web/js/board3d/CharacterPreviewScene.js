import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeUnitMaterials } from './UnitModels.js';
import { resolveUnitModel, initUnitAssets } from './units/resolveUnitModel.js';
import { CLASSES, createEmptyBoard, createUnit } from '../units.js';
import { getValidMoves, isInBounds } from '../rules.js';
import {
  LimitedOrbitControls,
  isTouchDevice,
  isValidLayoutBounds,
  prepareOrbitLayoutFrustum,
  projectBoxToCameraBounds,
  applyOrbitFrustumZoom,
} from './LimitedOrbitControls.js';
import {
  isScene3dDebugEnabled,
  Scene3dDebugHud,
  buildScene3dDebugSnapshot,
} from './Scene3dDebug.js';
import {
  webglRendererOptions,
  webglPixelRatio,
  webglShadowMapSize,
  webglShadowsEnabled,
  applyShadowRendererSettings,
  attachWebGLRecovery,
  attachPageVisibility,
} from './WebGLSceneRuntime.js';

const UNIT_BASE_Y = 0.072;
const PREVIEW_BOARD_SIZE = 7;
const PREVIEW_TILE_SIZE = 0.25;
const PREVIEW_TILE_PITCH = 0.29;
const PREVIEW_FRUSTUM = 2.8;
const PREVIEW_FRAME_PADDING = 0.08;
const PREVIEW_ORBIT_HEADROOM = 1.2;
const COMPACT_ORBIT = {
  primaryOrbit: false,
  minAzimuth: -0.28,
  maxAzimuth: 0.28,
  minPolar: -0.12,
  maxPolar: 0.12,
  minZoom: 0.85,
  maxZoom: 1.15,
};
const EXPANDED_ORBIT = {
  primaryOrbit: true,
  minAzimuth: -0.38,
  maxAzimuth: 0.38,
  minPolar: -0.16,
  maxPolar: 0.18,
  minZoom: 0.78,
  maxZoom: 1.22,
};
const RANGE_Y = 0.047;
const PREVIEW_BOX = new THREE.Box3();

const ORTHOGONAL_DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

const DIAGONAL_DIRECTIONS = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function previewTilePosition(row, col) {
  const offset = ((PREVIEW_BOARD_SIZE - 1) * PREVIEW_TILE_PITCH) / 2;
  return {
    x: col * PREVIEW_TILE_PITCH - offset,
    z: row * PREVIEW_TILE_PITCH - offset,
  };
}

function getAttackRangeCells(unit) {
  const cells = [];

  if (unit.diagonalOnly ?? CLASSES[unit.classId]?.diagonalOnly) {
    for (const [dr, dc] of DIAGONAL_DIRECTIONS) {
      cells.push([unit.row + dr, unit.col + dc]);
    }
    return cells.filter(([row, col]) => isInBounds(row, col, PREVIEW_BOARD_SIZE));
  }

  if (unit.type === 'artillery') {
    for (const [dr, dc] of ORTHOGONAL_DIRECTIONS) {
      cells.push([unit.row + dr * 2, unit.col + dc * 2]);
    }
    return cells.filter(([row, col]) => isInBounds(row, col, PREVIEW_BOARD_SIZE));
  }

  if (unit.type === 'thunder') {
    for (let row = 0; row < PREVIEW_BOARD_SIZE; row++) {
      for (let col = 0; col < PREVIEW_BOARD_SIZE; col++) {
        cells.push([row, col]);
      }
    }
    return cells;
  }

  if (unit.lineMove ?? CLASSES[unit.classId]?.lineMove) {
    for (const [dr, dc] of ORTHOGONAL_DIRECTIONS) {
      for (let step = 1; step < PREVIEW_BOARD_SIZE; step++) {
        const row = unit.row + dr * step;
        const col = unit.col + dc * step;
        if (!isInBounds(row, col, PREVIEW_BOARD_SIZE)) break;
        cells.push([row, col]);
      }
    }
    return cells;
  }

  const maxRange = unit.type === 'melee' || unit.type === 'support'
    ? 1
    : unit.type === 'mage'
      ? PREVIEW_BOARD_SIZE
      : unit.range;

  for (const [dr, dc] of ORTHOGONAL_DIRECTIONS) {
    for (let step = 1; step <= maxRange; step++) {
      const row = unit.row + dr * step;
      const col = unit.col + dc * step;
      if (!isInBounds(row, col, PREVIEW_BOARD_SIZE)) break;
      cells.push([row, col]);
    }
  }

  return cells;
}

function captureRest(node) {
  if (!node) return null;
  return {
    node,
    rot: node.rotation.clone(),
    pos: node.position.clone(),
    scale: node.scale.clone(),
  };
}

function legPivot(pivot) {
  return pivot?.node ?? pivot ?? null;
}

function captureLegs(legs) {
  if (!legs) return null;
  return {
    left: {
      hip: captureRest(legPivot(legs.left?.hip)),
      knee: captureRest(legPivot(legs.left?.knee)),
    },
    right: {
      hip: captureRest(legPivot(legs.right?.hip)),
      knee: captureRest(legPivot(legs.right?.knee)),
    },
  };
}

export class CharacterPreviewScene {
  constructor(containerEl) {
    this.container = containerEl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);

    const width = containerEl.clientWidth || 320;
    const height = containerEl.clientHeight || 240;
    const aspect = width / height;
    const frustum = PREVIEW_FRUSTUM;

    this.camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      100
    );
    this.camera.position.set(0, 5.5, 5.2);
    this.camera.lookAt(0, 0.45, 0);

    this.renderer = new THREE.WebGLRenderer(webglRendererOptions());
    this.renderer.setPixelRatio(webglPixelRatio());
    this.renderer.setSize(width, height);
    applyShadowRendererSettings(this.renderer);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    containerEl.appendChild(this.renderer.domElement);

    this.previewPivot = new THREE.Group();
    this.previewPivot.name = 'previewPivot';
    this.scene.add(this.previewPivot);

    this.orbitControls = new LimitedOrbitControls({
      domElement: this.renderer.domElement,
      pivot: this.previewPivot,
      zoomViaScale: !isTouchDevice(),
      onChange: () => this.applyOrbitZoom(),
    });
    this.orbitControls.applySettings(COMPACT_ORBIT);
    this.orbitControls.setEnabled(false);

    this.layoutFrustum = null;
    this.debugHud = isScene3dDebugEnabled() ? new Scene3dDebugHud(containerEl, 'codex') : null;

    this.lastValidWidth = width;
    this.lastValidHeight = height;

    this.pmrem = null;
    this.envMap = null;
    this.rebuildEnvironmentMap();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    this.scene.add(new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 0.7));

    this.keyLight = new THREE.DirectionalLight(0xfff6e6, 1.9);
    this.keyLight.position.set(4, 8, 4);
    this.keyLight.castShadow = webglShadowsEnabled();
    if (this.keyLight.castShadow) {
      const previewShadowSize = webglShadowMapSize();
      this.keyLight.shadow.mapSize.set(previewShadowSize, previewShadowSize);
      this.keyLight.shadow.camera.left = -3;
      this.keyLight.shadow.camera.right = 3;
      this.keyLight.shadow.camera.top = 3;
      this.keyLight.shadow.camera.bottom = -3;
    }
    this.scene.add(this.keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    fillLight.position.set(-3, 5, -4);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe0e7ff, 0.65);
    rimLight.position.set(-4, 3, 5);
    this.scene.add(rimLight);

    this.rangeBoard = new THREE.Group();
    this.rangeBoard.name = 'previewRangeBoard';
    this.rangeOverlays = new THREE.Group();
    this.rangeOverlays.name = 'previewRangeOverlays';
    this.rangeBoard.add(this.rangeOverlays);
    this.previewPivot.add(this.rangeBoard);
    this.createRangeBoard();

    this.clock = new THREE.Clock();
    this.preview = null;
    this.classId = null;
    this.loadGeneration = 0;
    this.assetLoaderReady = initUnitAssets();
    this.visible = false;
    this.expanded = false;
    this.pageHidden = document.hidden;
    this.animating = false;

    this.contextRecovery = attachWebGLRecovery(this.renderer, {
      onRestore: () => this.restoreGpuResources(),
    });
    this.detachPageVisibility = attachPageVisibility((hidden) => {
      this.pageHidden = hidden;
      if (!hidden && this.shouldRender()) {
        this.clock.getDelta();
        this.onResize();
      }
      this.updateAnimationLoop();
    });

    this.onResize = this.onResize.bind(this);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.visible) this.onResize();
    });
    this.resizeObserver.observe(containerEl);

    this.updateAnimationLoop();
  }

  rebuildEnvironmentMap() {
    this.envMap?.dispose();
    this.pmrem?.dispose();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;
  }

  restoreGpuResources() {
    this.rebuildEnvironmentMap();
    this.renderer.setPixelRatio(webglPixelRatio());
    this.onResize();
    this.updateAnimationLoop();
  }

  shouldRender() {
    return this.visible
      && Boolean(this.preview)
      && !this.pageHidden
      && !this.contextRecovery.isContextLost();
  }

  updateAnimationLoop() {
    if (this.shouldRender()) this.startAnimationLoop();
    else this.stopAnimationLoop();
  }

  startAnimationLoop() {
    if (this.animating) return;
    this.animating = true;
    this.animate();
  }

  stopAnimationLoop() {
    this.animating = false;
  }

  previewContentBounds() {
    this.previewPivot.updateMatrixWorld(true);

    PREVIEW_BOX.makeEmpty();
    if (this.preview?.root) PREVIEW_BOX.expandByObject(this.preview.root);
    if (this.rangeBoard) PREVIEW_BOX.expandByObject(this.rangeBoard);

    if (PREVIEW_BOX.isEmpty()) {
      return {
        centerX: 0,
        centerY: 0.45,
        halfW: (PREVIEW_FRUSTUM / 2) * PREVIEW_ORBIT_HEADROOM,
        halfH: (PREVIEW_FRUSTUM / 2) * PREVIEW_ORBIT_HEADROOM,
      };
    }

    return projectBoxToCameraBounds(
      PREVIEW_BOX,
      this.camera,
      PREVIEW_FRAME_PADDING,
      PREVIEW_ORBIT_HEADROOM
    ) ?? {
      centerX: 0,
      centerY: 0.45,
      halfW: (PREVIEW_FRUSTUM / 2) * PREVIEW_ORBIT_HEADROOM,
      halfH: (PREVIEW_FRUSTUM / 2) * PREVIEW_ORBIT_HEADROOM,
    };
  }

  updateLayoutFrustum() {
    const width = this.container.clientWidth || this.lastValidWidth;
    const height = this.container.clientHeight || this.lastValidHeight;
    if (!width || !height) return false;

    const bounds = this.previewContentBounds();
    if (!isValidLayoutBounds(bounds)) return false;

    this.layoutFrustum = prepareOrbitLayoutFrustum(bounds, width / height, this.orbitControls);
    return true;
  }

  applyOrbitZoom() {
    this.updateLayoutFrustum();
    applyOrbitFrustumZoom(this.camera, this.layoutFrustum, this.orbitControls, this.debugHud);
  }

  onResize() {
    if (this.orbitControls?.isGesturing()) return;

    let width = this.container.clientWidth;
    let height = this.container.clientHeight;
    if (!width || !height) {
      width = this.lastValidWidth ?? width;
      height = this.lastValidHeight ?? height;
    }
    if (!width || !height) return;

    this.lastValidWidth = width;
    this.lastValidHeight = height;

    this.applyOrbitZoom();

    this.renderer.setSize(width, height);
  }

  disposePreview() {
    if (!this.preview) return;
    const { root, materials, animation } = this.preview;
    animation?.dispose?.();
    this.previewPivot.remove(root);
    root.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    });
    disposeUnitMaterials(materials);
    this.preview = null;
  }

  buildPreviewEntry(classId) {
    const model = resolveUnitModel(classId, 'blue');
    if (model.ring) model.ring.visible = false;

    model.root.position.set(0, UNIT_BASE_Y, 0);
    this.previewPivot.add(model.root);

    const rig = model.rig;
    return {
      root: model.root,
      body: model.body,
      rig,
      fromGlb: model.fromGlb,
      animation: model.animation ?? null,
      rest: {
        group: captureRest(rig.group),
        legs: captureLegs(rig.legs),
        torso: captureRest(rig.torso),
        body: captureRest(rig.body),
        head: captureRest(rig.head),
        armL: captureRest(rig.armL),
        armR: captureRest(rig.armR),
        weapon: captureRest(rig.weapon),
        hood: captureRest(rig.hood),
        scarf: captureRest(rig.scarf),
        cape: captureRest(rig.cape),
        cravat: captureRest(rig.cravat),
        coat: captureRest(rig.coat),
        shield: captureRest(rig.shield),
        robe: captureRest(rig.robe),
        orb: captureRest(rig.orb),
        bomb: captureRest(rig.bomb),
        wingL: captureRest(rig.wingL),
        wingR: captureRest(rig.wingR),
        crest: captureRest(rig.crest),
        banner: captureRest(rig.banner),
        eyeStalkL: captureRest(rig.eyeStalkL),
        eyeStalkR: captureRest(rig.eyeStalkR),
        wheelFL: captureRest(rig.wheelFL),
        wheelFR: captureRest(rig.wheelFR),
        wheelRL: captureRest(rig.wheelRL),
        wheelRR: captureRest(rig.wheelRR),
        spoiler: captureRest(rig.spoiler),
      },
      seed: Math.random() * Math.PI * 2,
      materials: model.materials,
      shadow: model.shadow,
    };
  }

  createRangeBoard() {
    const center = Math.floor(PREVIEW_BOARD_SIZE / 2);
    for (let row = 0; row < PREVIEW_BOARD_SIZE; row++) {
      for (let col = 0; col < PREVIEW_BOARD_SIZE; col++) {
        const isCenter = row === center && col === center;
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(PREVIEW_TILE_SIZE, 0.06, PREVIEW_TILE_SIZE),
          new THREE.MeshStandardMaterial({
            color: isCenter ? 0x1d4ed8 : 0x1e293b,
            emissive: isCenter ? 0x1e3a8a : 0x0f172a,
            emissiveIntensity: 0.42,
            roughness: 0.7,
            metalness: 0.1,
          })
        );
        const position = previewTilePosition(row, col);
        tile.position.set(position.x, 0, position.z);
        tile.receiveShadow = webglShadowsEnabled();
        this.rangeBoard.add(tile);
      }
    }
  }

  clearRangeOverlays() {
    for (const mesh of [...this.rangeOverlays.children]) {
      this.rangeOverlays.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  addRangeOverlay(row, col, type, split = false) {
    const color = type === 'move' ? 0x22c55e : 0xef4444;
    const emissive = type === 'move' ? 0x166534 : 0x991b1b;
    const isAttack = type === 'attack';
    const size = isAttack ? PREVIEW_TILE_SIZE * 0.46 : PREVIEW_TILE_SIZE * 0.86;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    const position = previewTilePosition(row, col);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, RANGE_Y + (isAttack && split ? 0.003 : 0), position.z);
    mesh.renderOrder = isAttack ? 3 : 2;
    this.rangeOverlays.add(mesh);
  }

  updateRangeOverlay(classId) {
    this.clearRangeOverlays();

    const center = Math.floor(PREVIEW_BOARD_SIZE / 2);
    const board = createEmptyBoard(PREVIEW_BOARD_SIZE);
    const unit = createUnit(classId, 'blue');
    unit.row = center;
    unit.col = center;
    board[center][center] = unit;

    const moves = new Set(getValidMoves(board, unit).map(([row, col]) => `${row},${col}`));
    const attacks = new Set(getAttackRangeCells(unit).map(([row, col]) => `${row},${col}`));
    const highlighted = new Set([...moves, ...attacks]);

    for (const key of highlighted) {
      const [row, col] = key.split(',').map(Number);
      const overlaps = moves.has(key) && attacks.has(key);
      if (moves.has(key)) this.addRangeOverlay(row, col, 'move', overlaps);
      if (attacks.has(key)) this.addRangeOverlay(row, col, 'attack', overlaps);
    }
  }

  setClass(classId) {
    if (this.classId === classId && this.preview) return;
    this.classId = classId;
    this.disposePreview();

    const generation = ++this.loadGeneration;
    this.assetLoaderReady.then(() => {
      if (this.loadGeneration !== generation || this.classId !== classId) return;
      this.disposePreview();
      this.preview = this.buildPreviewEntry(classId);
      this.updateRangeOverlay(classId);
      if (this.visible) this.onResize();
      this.updateAnimationLoop();
    });
  }

  posePreview(entry, time) {
    if (entry.animation?.drivesPose) return;
    const { rig, rest } = entry;
    const t = time + entry.seed;
    const idle = 1;
    const breath = Math.sin(t * 2.1) * idle;
    const sway = Math.sin(t * 0.85) * idle;

    if (rest.torso) {
      rest.torso.node.scale.set(
        rest.torso.scale.x * (1 - breath * 0.012),
        rest.torso.scale.y * (1 + breath * 0.026),
        rest.torso.scale.z * (1 - breath * 0.012)
      );
      rest.torso.node.position.y = rest.torso.pos.y + breath * 0.006;
      rest.torso.node.rotation.z = rest.torso.rot.z + sway * 0.02;
    }

    if (rest.head) {
      rest.head.node.rotation.x = rest.head.rot.x + Math.sin(t * 1.6) * 0.035;
      rest.head.node.rotation.y = rest.head.rot.y + sway * 0.16;
      rest.head.node.position.y = rest.head.pos.y + breath * 0.008;
    }

    if (rest.armL) {
      rest.armL.node.rotation.x = rest.armL.rot.x + Math.sin(t * 1.9) * 0.05;
    }
    if (rest.armR) {
      rest.armR.node.rotation.x = rest.armR.rot.x - Math.sin(t * 1.9 + 0.6) * 0.05;
    }

    switch (rig.kind) {
      case 'swordsman':
        if (rest.weapon) {
          rest.weapon.node.rotation.z = rest.weapon.rot.z + Math.sin(t * 1.3) * 0.05;
        }
        break;
      case 'archer':
        if (rest.hood) {
          rest.hood.node.rotation.x = rest.hood.rot.x + Math.sin(t * 1.1) * 0.05;
        }
        break;
      case 'shield':
        if (rest.shield) {
          rest.shield.node.rotation.y = rest.shield.rot.y + Math.sin(t * 0.9) * 0.07;
        }
        break;
      case 'mage':
        if (rig.orb) {
          rig.orb.rotation.y = t * 0.9;
          rig.orb.position.y = rest.orb.pos.y + Math.sin(t * 1.7) * 0.012;
          rig.orb.material.emissiveIntensity = 1.4 + Math.sin(t * 2.6) * 0.5;
        }
        if (rig.runeRing) {
          rig.runeRing.rotation.y = t * 1.6;
          rig.runeRing.rotation.z = Math.sin(t * 0.8) * 0.3;
        }
        break;
      case 'assassin':
        if (rest.scarf) {
          rest.scarf.node.rotation.x = rest.scarf.rot.x + Math.sin(t * 1.4) * 0.12;
          rest.scarf.node.rotation.z = rest.scarf.rot.z + Math.sin(t * 1.1) * 0.08;
        }
        break;
      case 'vampire':
        if (rest.cape) {
          rest.cape.node.rotation.x = rest.cape.rot.x + Math.sin(t * 1.1) * 0.08;
          rest.cape.node.rotation.z = rest.cape.rot.z + Math.sin(t * 0.9) * 0.05;
        }
        if (rest.coat) {
          rest.coat.node.rotation.x = rest.coat.rot.x + Math.sin(t * 1.2) * 0.04;
        }
        if (rig.gem) {
          rig.gem.material.emissiveIntensity =
            (rig.gem.material.userData.baseEmissive ?? 0.35) * (1 + Math.sin(t * 2.2) * 0.25);
        }
        break;
      case 'bomber':
        if (rig.spark) {
          const flicker = 1 + Math.sin(t * 9) * 0.28 + Math.sin(t * 21) * 0.12;
          rig.spark.scale.setScalar(flicker);
          rig.spark.material.emissiveIntensity = 1.4 + flicker * 0.6;
        }
        if (rest.bomb) {
          rest.bomb.node.rotation.y = rest.bomb.rot.y + Math.sin(t * 1.2) * 0.18;
        }
        break;
      case 'eagle': {
        const flap = Math.sin(t * 4.5) * 0.38;
        if (rest.wingL) rest.wingL.node.rotation.z = rest.wingL.rot.z + flap;
        if (rest.wingR) rest.wingR.node.rotation.z = rest.wingR.rot.z - flap;
        break;
      }
      case 'raceCar': {
        const spin = t * 3.5;
        for (const wheel of [rest.wheelFL, rest.wheelFR, rest.wheelRL, rest.wheelRR]) {
          if (wheel) wheel.node.rotation.x = wheel.rot.x + spin;
        }
        if (rest.body) {
          rest.body.node.position.y = rest.body.pos.y + Math.sin(t * 12) * 0.004;
        }
        if (rest.spoiler) {
          rest.spoiler.node.rotation.x = rest.spoiler.rot.x + Math.sin(t * 1.6) * 0.02;
        }
        if (rig.headlights) {
          const glow = 1 + Math.sin(t * 3.2) * 0.12;
          for (const lamp of rig.headlights) {
            lamp.material.emissiveIntensity = (lamp.material.userData.baseEmissive ?? 0.35) * glow;
          }
        }
        if (rig.exhausts) {
          const flicker = 1 + Math.sin(t * 8) * 0.22;
          for (const pipe of rig.exhausts) {
            pipe.material.emissiveIntensity = (pipe.material.userData.baseEmissive ?? 1.4) * flicker;
          }
        }
        break;
      }
      case 'crabGeneral': {
        const pinch = Math.sin(t * 2.4) * 0.08;
        if (rest.armL) rest.armL.node.rotation.x = rest.armL.rot.x + pinch;
        if (rest.armR) rest.armR.node.rotation.x = rest.armR.rot.x - pinch;
        if (rest.eyeStalkL) {
          rest.eyeStalkL.node.rotation.z = rest.eyeStalkL.rot.z + Math.sin(t * 1.8) * 0.12;
          rest.eyeStalkL.node.rotation.x = rest.eyeStalkL.rot.x + Math.sin(t * 2.3 + 0.4) * 0.08;
        }
        if (rest.eyeStalkR) {
          rest.eyeStalkR.node.rotation.z = rest.eyeStalkR.rot.z - Math.sin(t * 1.8 + 0.6) * 0.12;
          rest.eyeStalkR.node.rotation.x = rest.eyeStalkR.rot.x + Math.sin(t * 2.3) * 0.08;
        }
        if (rest.banner) {
          rest.banner.node.rotation.z = rest.banner.rot.z + Math.sin(t * 1.2) * 0.06;
        }
        if (rest.crest) {
          rest.crest.node.position.y = rest.crest.pos.y + Math.sin(t * 1.5) * 0.004;
        }
        break;
      }
      default:
        break;
    }

    if (rest.group) {
      rest.group.node.position.y = rest.group.pos.y + breath * 0.004;
    }
  }

  syncOrbitEnabled() {
    if (!this.orbitControls) return;
    this.orbitControls.setEnabled(this.visible && this.expanded);
  }

  setExpanded(expanded) {
    this.expanded = Boolean(expanded);
    this.orbitControls?.applySettings(this.expanded ? EXPANDED_ORBIT : COMPACT_ORBIT);
    if (!this.expanded) this.orbitControls?.reset();
    this.syncOrbitEnabled();
    if (this.visible) this.onResize();
  }

  setVisible(show) {
    this.visible = show;
    this.syncOrbitEnabled();
    this.renderer.domElement.style.display = show ? 'block' : 'none';
    if (show) {
      this.onResize();
    }
    this.updateAnimationLoop();
  }

  animate() {
    if (!this.animating) return;
    requestAnimationFrame(() => this.animate());
    if (!this.shouldRender()) {
      this.stopAnimationLoop();
      return;
    }

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();
    this.preview.body.rotation.y = Math.sin(time * 0.22) * 0.35;

    if (this.preview.animation?.drivesPose) {
      this.preview.animation.update(delta);
    } else {
      this.posePreview(this.preview, time);
    }

    const hover = Math.sin(time * 2 + this.preview.seed) * 0.008;
    this.preview.root.position.y = UNIT_BASE_Y + hover;

    if (this.preview.shadow) {
      const rise = hover;
      this.preview.shadow.position.y = 0.006 - rise;
      const tighten = Math.max(0.15, 1 - rise * 0.8);
      this.preview.shadow.scale.set(tighten, tighten, 1);
    }

    this.renderer.render(this.scene, this.camera);
    if (this.debugHud) {
      this.debugHud.update(buildScene3dDebugSnapshot({
        renderer: this.renderer,
        camera: this.camera,
        pivot: this.previewPivot,
        orbitControls: this.orbitControls,
        layoutFrustum: this.layoutFrustum,
        container: this.container,
        boardSize: PREVIEW_BOARD_SIZE,
      }));
    }
  }

  dispose() {
    this.stopAnimationLoop();
    this.detachPageVisibility?.();
    this.resizeObserver?.disconnect();
    this.orbitControls?.dispose();
    this.debugHud?.dispose();
    this.disposePreview();
    this.clearRangeOverlays();
    this.rangeBoard.traverse((obj) => {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((material) => material.dispose());
      } else {
        obj.material?.dispose();
      }
    });
    this.envMap?.dispose();
    this.pmrem?.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
