import * as THREE from 'three';
import { bakeGroupToLayers, disposeBakedSource } from './sceneryBake.js';

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);

class SceneryInstanceBatch {
  constructor(layers, capacity) {
    this.capacity = capacity;
    this.count = 0;
    this.meshes = [];

    for (const layer of layers) {
      const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, capacity);
      mesh.count = 0;
      mesh.castShadow = layer.castShadow;
      mesh.receiveShadow = layer.receiveShadow;
      mesh.renderOrder = layer.renderOrder;
      mesh.frustumCulled = false;
      mesh.userData.decorative = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
    }
  }

  addInstance({ x, y = 0, z, rotateY = 0, scale = 1 }) {
    if (this.count >= this.capacity) return false;

    _position.set(x, y, z);
    _quaternion.setFromAxisAngle(_yAxis, rotateY);
    const s = typeof scale === 'number' ? scale : 1;
    _scale.set(s, s, s);
    _matrix.compose(_position, _quaternion, _scale);

    for (const mesh of this.meshes) {
      mesh.setMatrixAt(this.count, _matrix);
    }
    this.count++;
    return true;
  }

  finalize() {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.instanceMatrix.needsUpdate = this.count > 0;
    }
  }

  attach(parent) {
    for (const mesh of this.meshes) parent.add(mesh);
  }

  detach(parent) {
    for (const mesh of this.meshes) parent.remove(mesh);
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry = null;
      mesh.material = null;
    }
    this.meshes = [];
    this.count = 0;
  }
}

/**
 * Batches decorative scenery props via InstancedMesh.
 * Prototypes are baked once per (kind, variant) and reused across boards.
 */
export class SceneryInstancePool {
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    this.prototypeLayers = new Map();
    this.batches = [];
  }

  getOrBakePrototype(key, buildPrototype) {
    let layers = this.prototypeLayers.get(key);
    if (layers) return layers;

    const root = buildPrototype();
    layers = bakeGroupToLayers(root);
    disposeBakedSource(root);
    this.prototypeLayers.set(key, layers);
    return layers;
  }

  createBatch(key, buildPrototype, capacity) {
    const layers = this.getOrBakePrototype(key, buildPrototype);
    if (layers.length === 0 || capacity <= 0) return null;

    const batch = new SceneryInstanceBatch(layers, capacity);
    batch.attach(this.parentGroup);
    this.batches.push(batch);
    return batch;
  }

  clearBatches() {
    for (const batch of this.batches) {
      batch.detach(this.parentGroup);
      batch.dispose();
    }
    this.batches = [];
  }

  dispose() {
    this.clearBatches();
    for (const layers of this.prototypeLayers.values()) {
      for (const layer of layers) {
        if (layer.geometry && !layer.geometry.userData?.shared) layer.geometry.dispose();
        if (layer.material && !layer.material.userData?.shared) layer.material.dispose();
      }
    }
    this.prototypeLayers.clear();
  }
}
