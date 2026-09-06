import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TileGrid, TILE_PITCH, TILE_SIZE, tileWorldPosition } from './TileGrid.js';
import { UnitMeshManager } from './UnitMesh.js';
import { HighlightSystem } from './HighlightSystem.js';
import { BombMarkerManager } from './BombMarkerManager.js';
import { LandmineMarkerManager } from './LandmineMarkerManager.js';
import { MapPropManager } from './MapPropManager.js';
import { ShadowCloneManager } from './ShadowCloneManager.js';
import { InputController } from './InputController.js';
import { AttackFx3d } from './AttackFx3d.js';
import { TutorialPointer, DEFAULT_ANCHOR_HEIGHT, UNIT_ANCHOR_HEIGHT } from './TutorialPointer.js';
import { attachDevRendererStats } from './DevRendererStats.js';
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

// Headroom above the ground plane for unit models and their floating labels.
const CONTENT_HEIGHT = 1.35;
const FRAME_PADDING = 0.02;
// Small margin above the framed board (was 1.2 for manual orbit/zoom).
const BOARD_FRAMING_HEADROOM = 1.04;
const TILE_HALF_HEIGHT = 0.07;
const CONTENT_BOX = new THREE.Box3();
const TMP_VIEW = new THREE.Vector3();
const TMP_GROUND = new THREE.Vector3();
const GROUND_Y = -0.08;

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

    this.renderer = new THREE.WebGLRenderer(webglRendererOptions());
    this.renderer.setPixelRatio(webglPixelRatio());
    this.renderer.setSize(width, height);
    applyShadowRendererSettings(this.renderer);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    containerEl.appendChild(this.renderer.domElement);

    this.pmrem = null;
    this.envMap = null;
    this.rebuildEnvironmentMap();

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.className = 'board-3d-labels';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    containerEl.appendChild(this.labelRenderer.domElement);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
    this.scene.add(this.ambientLight);

    this.skyLight = new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 0.7);
    this.scene.add(this.skyLight);

    this.keyLight = new THREE.DirectionalLight(0xfff6e6, 1.9);
    this.keyLight.position.set(5, 9, 5);
    this.keyLight.castShadow = webglShadowsEnabled();
    if (this.keyLight.castShadow) {
      const shadowSize = webglShadowMapSize();
      this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
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
    }
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
    ground.receiveShadow = webglShadowsEnabled();
    this.scene.add(ground);

    this.boardPivot = new THREE.Group();
    this.boardPivot.name = 'boardPivot';
    this.scene.add(this.boardPivot);

    this.tileGrid = new TileGrid(this.boardPivot);
    this.unitManager = new UnitMeshManager(this.boardPivot);
    this.highlightSystem = new HighlightSystem(this.tileGrid);
    this.bombMarkers = new BombMarkerManager(this.tileGrid);
    this.landmineMarkers = new LandmineMarkerManager(this.tileGrid);
    this.mapPropManager = new MapPropManager(this.tileGrid);
    this.shadowCloneManager = new ShadowCloneManager(this.tileGrid);
    this.tutorialPointer = new TutorialPointer(this.boardPivot);
    this.attackFx = new AttackFx3d({
      scene: this.boardPivot,
      boardPivot: this.boardPivot,
      camera: this.camera,
      container: containerEl,
      fxLayer: fxLayerEl,
      tileGrid: this.tileGrid,
      unitManager: this.unitManager,
    });

    this.input = new InputController({
      domElement: containerEl,
      camera: this.camera,
      tileGrid: this.tileGrid,
      boardPivot: this.boardPivot,
      callbacks,
    });

    this.orbitControls = new LimitedOrbitControls({
      domElement: this.renderer.domElement,
      pivot: this.boardPivot,
      zoomViaScale: !isTouchDevice(),
      onChange: () => this.applyOrbitZoom(),
    });
    // Game board uses a fixed camera; player orbit is disabled.
    this.orbitControls.enabled = false;

    this.layoutFrustum = null;
    this.debugHud = isScene3dDebugEnabled() ? new Scene3dDebugHud(containerEl, 'board') : null;

    this.lastValidWidth = width;
    this.lastValidHeight = height;

    this.clock = new THREE.Clock();
    this.boardSize = 0;
    this.visible = true;
    this.pageHidden = document.hidden;
    this.animating = false;
    this.devStats = import.meta.env.DEV ? attachDevRendererStats(this.renderer) : null;

    this.contextRecovery = attachWebGLRecovery(this.renderer, {
      onRestore: () => this.restoreGpuResources(),
    });
    this.detachPageVisibility = attachPageVisibility((hidden) => {
      this.pageHidden = hidden;
      if (!hidden && this.shouldRender()) {
        this.clock.getDelta();
        this.scheduleResize();
      }
      this.updateAnimationLoop();
    });

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.visible) this.onResize();
    });
    this.resizeObserver.observe(containerEl);

    this.onResize();
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
    this.scheduleResize();
    this.updateAnimationLoop();
  }

  shouldRender() {
    return this.visible
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

  scheduleResize() {
    requestAnimationFrame(() => {
      this.onResize();
      requestAnimationFrame(() => this.onResize());
    });
  }

  contentGroundPoints() {
    const size = this.boardSize || 3;
    const halfGrid = (size * TILE_PITCH) / 2;
    const extent = halfGrid - TILE_PITCH / 2 + TILE_SIZE / 2;
    return [
      new THREE.Vector3(-extent, -TILE_HALF_HEIGHT, -extent),
      new THREE.Vector3(-extent, -TILE_HALF_HEIGHT, extent),
      new THREE.Vector3(extent, -TILE_HALF_HEIGHT, -extent),
      new THREE.Vector3(extent, -TILE_HALF_HEIGHT, extent),
    ];
  }

  fallbackContentBounds() {
    this.boardPivot.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of this.contentGroundPoints()) {
      for (const y of [-TILE_HALF_HEIGHT, CONTENT_HEIGHT]) {
        TMP_VIEW.set(point.x, y, point.z)
          .applyMatrix4(this.boardPivot.matrixWorld)
          .applyMatrix4(this.camera.matrixWorldInverse);
        minX = Math.min(minX, TMP_VIEW.x);
        maxX = Math.max(maxX, TMP_VIEW.x);
        minY = Math.min(minY, TMP_VIEW.y);
        maxY = Math.max(maxY, TMP_VIEW.y);
      }
    }

    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      halfW: ((maxX - minX) / 2 + FRAME_PADDING) * BOARD_FRAMING_HEADROOM,
      halfH: ((maxY - minY) / 2 + FRAME_PADDING) * BOARD_FRAMING_HEADROOM,
    };
  }

  extendBoundsForVisibleGround(bounds) {
    if (!bounds) return bounds;

    this.boardPivot.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    let minX = bounds.centerX - bounds.halfW;
    let maxX = bounds.centerX + bounds.halfW;
    let minY = bounds.centerY - bounds.halfH;
    let maxY = bounds.centerY + bounds.halfH;

    for (const point of this.contentGroundPoints()) {
      TMP_VIEW.set(point.x, 0, point.z).applyMatrix4(this.boardPivot.matrixWorld);
      TMP_GROUND.set(TMP_VIEW.x, GROUND_Y, TMP_VIEW.z).applyMatrix4(this.camera.matrixWorldInverse);
      minX = Math.min(minX, TMP_GROUND.x);
      maxX = Math.max(maxX, TMP_GROUND.x);
      minY = Math.min(minY, TMP_GROUND.y);
      maxY = Math.max(maxY, TMP_GROUND.y);
    }

    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      halfW: ((maxX - minX) / 2 + FRAME_PADDING) * BOARD_FRAMING_HEADROOM,
      halfH: ((maxY - minY) / 2 + FRAME_PADDING) * BOARD_FRAMING_HEADROOM,
    };
  }

  // Fit the board in camera view; includes current pivot orbit rotation/scale.
  // Use tile geometry only — unit hover/selection animation shifts bounding boxes
  // and would jitter the frame if included here.
  contentBounds() {
    this.boardPivot.updateMatrixWorld(true);

    CONTENT_BOX.makeEmpty();
    if (this.tileGrid.group.children.length) {
      CONTENT_BOX.expandByObject(this.tileGrid.group);
    }

    let bounds = CONTENT_BOX.isEmpty()
      ? this.fallbackContentBounds()
      : projectBoxToCameraBounds(CONTENT_BOX, this.camera, FRAME_PADDING, BOARD_FRAMING_HEADROOM);

    bounds = bounds ?? this.fallbackContentBounds();
    return this.extendBoundsForVisibleGround(bounds);
  }

  updateLayoutFrustum() {
    const width = this.container.clientWidth || this.lastValidWidth;
    const height = this.container.clientHeight || this.lastValidHeight;
    if (!width || !height) return false;

    const bounds = this.orbitControls.withNeutralOrbit(() => this.contentBounds());
    if (!isValidLayoutBounds(bounds)) return false;

    this.frustumBase = bounds.halfH * 2;
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
      const pos = tileWorldPosition(target.row, target.col, state.boardSize);
      const unit = state.board?.[target.row]?.[target.col] ?? null;
      const y = unit ? UNIT_ANCHOR_HEIGHT : DEFAULT_ANCHOR_HEIGHT;
      this.tutorialPointer.pointAt({ x: pos.x, y, z: pos.z });
      return;
    }

    this.tutorialPointer.hide();
  }

  sync(state) {
    // Input must stay in sync even while attack animations block board updates.
    this.input.setState(state);
    if (state.animating) return;

    const boardSizeChanged = this.boardSize !== state.boardSize;
    this.boardSize = state.boardSize;
    this.tileGrid.ensureSize(state.boardSize);
    this.unitManager.setBoardSize(state.boardSize);
    this.attackFx.setBoardSize(state.boardSize);
    this.highlightSystem.update(state);
    this.bombMarkers.sync(state.pendingBombs ?? []);
    this.landmineMarkers.sync(state.pendingLandmines ?? [], state.showLandmines ?? true);
    this.mapPropManager.sync(state.mapProps ?? null);
    this.shadowCloneManager.sync(state.shadowClones ?? []);
    this.unitManager.syncBoard(state.board, state);
    this.syncTutorialPointer(state);
    this.updateTurnAmbience(state);

    // Refit only when the grid dimensions change — routine state updates (e.g.
    // selecting a reserve card) must not reframe the camera.
    if (this.visible && boardSizeChanged) {
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
  playLandmineFx(fx) {
    const arrived = this.unitManager.waitForArrival(fx.unitId, fx.row, fx.col);
    this.landmineMarkers.trigger({ row: fx.row, col: fx.col }, arrived);

    arrived.then(() => {
      if (fx.damage > 0) {
        this.attackFx.showTerrainDamage(fx.row, fx.col, fx.damage, fx.killed);
      }
    });
  }

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
    this.updateAnimationLoop();
  }

  clear() {
    this.unitManager.syncBoard([], { actedUnitIds: [], draggingUnitId: null });
    this.highlightSystem.clear();
    this.bombMarkers.clear();
    this.landmineMarkers.clear();
    this.mapPropManager.clear();
    this.shadowCloneManager.clear();
    this.tutorialPointer.hide();
  }

  animate() {
    if (!this.animating) return;
    requestAnimationFrame(() => this.animate());
    if (!this.shouldRender()) {
      this.stopAnimationLoop();
      return;
    }

    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;
    this.unitManager.tick(delta, elapsed);
    this.mapPropManager.tick();
    this.landmineMarkers.tick(elapsed);
    this.devStats?.begin();
    this.renderer.render(this.scene, this.camera);
    this.devStats?.end();
    this.labelRenderer.render(this.scene, this.camera);
    if (this.debugHud) {
      this.debugHud.update(buildScene3dDebugSnapshot({
        renderer: this.renderer,
        camera: this.camera,
        pivot: this.boardPivot,
        orbitControls: this.orbitControls,
        layoutFrustum: this.layoutFrustum,
        container: this.container,
        boardSize: this.boardSize,
      }));
    }
  }

  dispose() {
    this.stopAnimationLoop();
    this.detachPageVisibility?.();
    window.removeEventListener('resize', this.onResize);
    this.envMap?.dispose();
    this.pmrem?.dispose();
    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.orbitControls?.dispose();
    this.debugHud?.dispose();
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
