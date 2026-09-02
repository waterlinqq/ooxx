import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildUnitModel } from './UnitModels.js';

const UNIT_BASE_Y = 0.072;

function captureRest(node) {
  if (!node) return null;
  return {
    node,
    rot: node.rotation.clone(),
    pos: node.position.clone(),
    scale: node.scale.clone(),
  };
}

function captureLegs(legs) {
  if (!legs) return null;
  return {
    left: { hip: captureRest(legs.left.hip), knee: captureRest(legs.left.knee) },
    right: { hip: captureRest(legs.right.hip), knee: captureRest(legs.right.knee) },
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
    const frustum = 2.4;

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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    containerEl.appendChild(this.renderer.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    this.scene.add(new THREE.HemisphereLight(0xbfdbfe, 0x1e293b, 0.7));

    const keyLight = new THREE.DirectionalLight(0xfff6e6, 1.9);
    keyLight.position.set(4, 8, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    fillLight.position.set(-3, 5, -4);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe0e7ff, 0.65);
    rimLight.position.set(-4, 3, 5);
    this.scene.add(rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.2 })
    );
    pedestal.position.y = 0.03;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this.scene.add(pedestal);

    this.clock = new THREE.Clock();
    this.preview = null;
    this.classId = null;
    this.visible = false;

    this.onResize = this.onResize.bind(this);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.visible) this.onResize();
    });
    this.resizeObserver.observe(containerEl);

    this.animate();
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;

    const aspect = width / height;
    const frustum = 2.4;
    this.camera.left = (-frustum * aspect) / 2;
    this.camera.right = (frustum * aspect) / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  disposePreview() {
    if (!this.preview) return;
    const { root, materials } = this.preview;
    this.scene.remove(root);
    root.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    });
    for (const material of materials) {
      material.dispose();
    }
    this.preview = null;
  }

  setClass(classId) {
    if (this.classId === classId && this.preview) return;
    this.classId = classId;
    this.disposePreview();

    const model = buildUnitModel(classId, 'blue');
    if (model.ring) model.ring.visible = false;

    model.root.position.set(0, UNIT_BASE_Y, 0);
    this.scene.add(model.root);

    const rig = model.rig;
    this.preview = {
      root: model.root,
      body: model.body,
      rig,
      rest: {
        group: captureRest(rig.group),
        legs: captureLegs(rig.legs),
        torso: captureRest(rig.torso),
        head: captureRest(rig.head),
        armL: captureRest(rig.armL),
        armR: captureRest(rig.armR),
        weapon: captureRest(rig.weapon),
        hood: captureRest(rig.hood),
        scarf: captureRest(rig.scarf),
        shield: captureRest(rig.shield),
        robe: captureRest(rig.robe),
        orb: captureRest(rig.orb),
        bomb: captureRest(rig.bomb),
      },
      seed: Math.random() * Math.PI * 2,
      materials: model.materials,
      shadow: model.shadow,
    };
  }

  posePreview(entry, time) {
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
      default:
        break;
    }

    if (rest.group) {
      rest.group.node.position.y = rest.group.pos.y + breath * 0.004;
    }
  }

  setVisible(show) {
    this.visible = show;
    if (show) {
      this.onResize();
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.visible || !this.preview) return;

    const time = this.clock.getElapsedTime();
    this.preview.body.rotation.y = Math.sin(time * 0.22) * 0.35;
    this.posePreview(this.preview, time);

    const hover = Math.sin(time * 2 + this.preview.seed) * 0.008;
    this.preview.root.position.y = UNIT_BASE_Y + hover;

    if (this.preview.shadow) {
      this.preview.shadow.position.y = 0.006 - hover;
      const tighten = Math.max(0.15, 1 - hover * 8);
      this.preview.shadow.scale.set(tighten, tighten, 1);
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.disposePreview();
    this.envMap.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
