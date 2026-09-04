import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TileGrid, TILE_PITCH, tileWorldPosition } from './TileGrid.js';
import { UnitMeshManager } from './UnitMesh.js';
import { HighlightSystem } from './HighlightSystem.js';
import { BombMarkerManager } from './BombMarkerManager.js';
import { MapPropManager } from './MapPropManager.js';
import { InputController } from './InputController.js';
import { AttackFx3d } from './AttackFx3d.js';
import { TutorialPointer } from './TutorialPointer.js';
import { attachDevRendererStats } from './DevRendererStats.js';

// Headroom above the ground plane for unit models and their floating labels.
const CONTENT_HEIGHT = 1.35;
const FRAME_PADDING = 0.02;
const TMP_VIEW = new THREE.Vector3();

export class BoardScene {
  constructor(containerEl, fxLayerEl, callbacks) {
    this.container = containerEl;
    this.fxLayer = fxLayerEl;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 12, 28);

    const width = containerEl.clientWidth || 480;
    const height = containerEl.clientHeight || 480;
    const aspect = width / height;
    this.frustumBase = 4.2;

    this.camera = new THREE.OrthographicCamera(
      (-this.frustumBase * aspect) / 2,
      (this.frustumBase * aspect) / 2,
      this.frustumBase / 2,
      -this.frustumBase / 2,
      0.1,
      100
    );
    // Front-facing tilt (Z axis) so square tiles read upright on screen, not as diamonds.
    this.camera.position.set(0, 8.5, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    containerEl.appendChild(this.renderer.domElement);

    // Metals (armour, blades, gold trim) render black without something to reflect.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.className = 'board-3d-labels';
    containerEl.appendChild(this.labelRenderer.domElement);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
    this.scene.add(this.ambientLight);

    this.skyLight = new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 0.7);
    this.scene.add(this.skyLight);

    this.keyLight = new THREE.DirectionalLight(0xfff6e6, 1.9);
    this.keyLight.position.set(5, 9, 5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.radius = 3;
    this.keyLight.shadow.bias = -0.0008;
    this.keyLight.shadow.normalBias = 0.02;
    const shadowCam = this.keyLight.shadow.camera;
    shadowCam.left = -5;
    shadowCam.right = 5;
    shadowCam.top = 5;
    shadowCam.bottom = -5;
    shadowCam.near = 0.5;
    shadowCam.far = 24;
    shadowCam.updateProjectionMatrix();
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
    this.fillLight.position.set(-4, 6, -6);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xe0e7ff, 0.7);
    this.rimLight.position.set(-6, 4, 7);
    this.scene.add(this.rimLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.tileGrid = new TileGrid(this.scene);
    this.unitManager = new UnitMeshManager(this.scene);
    this.highlightSystem = new HighlightSystem(this.tileGrid);
    this.bombMarkers = new BombMarkerManager(this.tileGrid);
    this.mapPropManager = new MapPropManager(this.tileGrid);
    this.tutorialPointer = new TutorialPointer(this.scene);
    this.attackFx = new AttackFx3d({
      scene: this.scene,
      camera: this.camera,
      container: containerEl,
      fxLayer: fxLayerEl,
      tileGrid: this.tileGrid,
      unitManager: this.unitManager,
    });

    this.input = new InputController({
      domElement: this.renderer.domElement,
      camera: this.camera,
      tileGrid: this.tileGrid,
      unitManager: this.unitManager,
      callbacks,
    });

    this.clock = new THREE.Clock();
    this.boardSize = 0;
    this.visible = true;
    this.devStats = import.meta.env.DEV ? attachDevRendererStats(this.renderer) : null;

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.visible) this.onResize();
    });
    this.resizeObserver.observe(containerEl);

    this.animate();
  }

  scheduleResize() {
    requestAnimationFrame(() => {
      this.onResize();
      requestAnimationFrame(() => this.onResize());
    });
  }

  contentGroundPoints() {
    const size = this.boardSize || 3;
    const half = (size * TILE_PITCH) / 2;
    const points = [
      new THREE.Vector3(-half, 0, -half),
      new THREE.Vector3(-half, 0, half),
      new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(half, 0, half),
    ];
    return points;
  }

  // Camera-space bounds of everything that must stay on screen, independent of canvas size.
  contentBounds() {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of this.contentGroundPoints()) {
      for (const y of [0, CONTENT_HEIGHT]) {
        TMP_VIEW.set(point.x, y, point.z).applyMatrix4(this.camera.matrixWorldInverse);
        minX = Math.min(minX, TMP_VIEW.x);
        maxX = Math.max(maxX, TMP_VIEW.x);
        minY = Math.min(minY, TMP_VIEW.y);
        maxY = Math.max(maxY, TMP_VIEW.y);
      }
    }

    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      halfW: (maxX - minX) / 2 + FRAME_PADDING,
      halfH: (maxY - minY) / 2 + FRAME_PADDING,
    };
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;

    const aspect = width / height;
    const bounds = this.contentBounds();

    let { halfW, halfH } = bounds;
    if (halfW / halfH > aspect) {
      halfH = halfW / aspect;
    } else {
      halfW = halfH * aspect;
    }

    this.frustumBase = halfH * 2;
    this.camera.left = bounds.centerX - halfW;
    this.camera.right = bounds.centerX + halfW;
    this.camera.top = bounds.centerY + halfH;
    this.camera.bottom = bounds.centerY - halfH;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  updateTurnAmbience(state) {
    const blueTurn = state.phase === 'battle' && state.currentPlayer === 'blue';
    const redTurn = state.phase === 'battle' && state.currentPlayer === 'red';
    this.fillLight.color.setHex(blueTurn ? 0x93c5fd : redTurn ? 0xfca5a5 : 0x64748b);
    this.ambientLight.intensity = blueTurn || redTurn ? 0.46 : 0.42;
    this.skyLight.color.setHex(blueTurn ? 0xbfdbfe : redTurn ? 0xfecdd3 : 0xc7d2fe);
  }

  syncTutorialPointer(state) {
    const target = state.tutorialPointer;
    if (!target) {
      this.tutorialPointer.hide();
      return;
    }

    if (target.kind === 'cell') {
      this.tutorialPointer.pointAt(tileWorldPosition(target.row, target.col, state.boardSize));
      return;
    }

    this.tutorialPointer.hide();
  }

  sync(state) {
    if (state.animating) return;

    this.boardSize = state.boardSize;
    this.tileGrid.ensureSize(state.boardSize);
    this.unitManager.setBoardSize(state.boardSize);
    this.attackFx.setBoardSize(state.boardSize);
    this.highlightSystem.update(state);
    this.bombMarkers.sync(state.pendingBombs ?? []);
    this.mapPropManager.sync(state.mapProps ?? null);
    this.unitManager.syncBoard(state.board, state);
    this.syncTutorialPointer(state);
    this.input.setState(state);
    this.updateTurnAmbience(state);

    if (this.visible) {
      this.scheduleResize();
    }
  }

  playAttackFx(fx) {
    return this.attackFx.play(fx);
  }

  playBlessFx(fx) {
    return this.attackFx.playBlessing(fx);
  }

  // Fired when a unit enters a cell holding a prop. The state has already been
  // resolved, so this is purely presentation and is deliberately not awaited by
  // the game loop.
  playMapPropFx(fx) {
    const arrived = this.unitManager.waitForArrival(fx.unitId, fx.row, fx.col);
    this.mapPropManager.trigger(fx, arrived);

    arrived.then(() => {
      if (fx.kind === 'potion' && fx.heal > 0) {
        // Same green flash the priest blessing uses, so healing reads the same
        // way wherever it comes from.
        this.attackFx.flashTile(fx.row, fx.col, 0x86efac, 340);
        this.attackFx.showTerrainHeal(fx.row, fx.col, fx.heal);
      } else if (fx.kind === 'spikes' && fx.damage > 0) {
        this.attackFx.showTerrainDamage(fx.row, fx.col, fx.damage, fx.killed);
      } else if (fx.kind === 'web') {
        this.attackFx.flashTile(fx.row, fx.col, 0xcbd5e1, 320);
      }
    });
  }

  setVisible(show) {
    this.visible = show;
    this.container.classList.toggle('hidden', !show);
    if (show) {
      this.scheduleResize();
    }
  }

  clear() {
    this.unitManager.syncBoard([], { actedUnitIds: [], draggingUnitId: null });
    this.highlightSystem.clear();
    this.bombMarkers.clear();
    this.mapPropManager.clear();
    this.tutorialPointer.hide();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;
    if (this.visible) {
      this.unitManager.tick(delta, elapsed);
      this.mapPropManager.tick();
      this.devStats?.begin();
      this.renderer.render(this.scene, this.camera);
      this.devStats?.end();
      this.labelRenderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.envMap.dispose();
    this.pmrem.dispose();
    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.unitManager.dispose();
    this.mapPropManager.clear();
    this.tutorialPointer.dispose();
    this.tileGrid.clear();
    this.highlightSystem.clear();
    this.devStats?.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    this.container.removeChild(this.labelRenderer.domElement);
  }
}
