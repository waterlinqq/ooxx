import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { webglShadowsEnabled } from './WebGLSceneRuntime.js';

export const TILE_SIZE = 0.88;
export const TILE_GAP = 0.12;
export const TILE_PITCH = TILE_SIZE + TILE_GAP;

const BASE_COLOR = 0x1e293b;
const BASE_EMISSIVE = 0x0f172a;
const TILE_HEIGHT = 0.14;

const TILE_BOX = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);

export function tileWorldPosition(row, col, boardSize) {
  const offset = ((boardSize - 1) * TILE_PITCH) / 2;
  return {
    x: col * TILE_PITCH - offset,
    y: 0,
    z: row * TILE_PITCH - offset,
  };
}

function translatedGeometry(geometry, x, y, z) {
  const copy = geometry.clone();
  copy.translate(x, y, z);
  return copy;
}

function buildMergedTileMesh(boardSize) {
  const tilePieces = [];
  const edgePieces = [];
  const edgeSource = new THREE.EdgesGeometry(TILE_BOX);

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const pos = tileWorldPosition(r, c, boardSize);
      tilePieces.push(translatedGeometry(TILE_BOX, pos.x, pos.y, pos.z));
      edgePieces.push(translatedGeometry(edgeSource, pos.x, pos.y, pos.z));
    }
  }

  edgeSource.dispose();

  const mergedTiles = mergeGeometries(tilePieces, false);
  for (const piece of tilePieces) piece.dispose();

  const mergedEdges = mergeGeometries(edgePieces, false);
  for (const piece of edgePieces) piece.dispose();

  const tileMaterial = new THREE.MeshStandardMaterial({
    color: BASE_COLOR,
    emissive: BASE_EMISSIVE,
    emissiveIntensity: 0.35,
    roughness: 0.65,
    metalness: 0.15,
  });
  const tileMesh = new THREE.Mesh(mergedTiles, tileMaterial);
  tileMesh.receiveShadow = webglShadowsEnabled();
  tileMesh.name = 'tileGridMerged';

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.6,
  });
  const edgeLines = new THREE.LineSegments(mergedEdges, edgeMaterial);
  edgeLines.name = 'tileGridEdges';

  return { tileMesh, edgeLines };
}

function createTileAnchor(row, col, boardSize) {
  const anchor = new THREE.Object3D();
  const pos = tileWorldPosition(row, col, boardSize);
  anchor.position.set(pos.x, pos.y, pos.z);
  anchor.userData = { kind: 'tile', row, col };
  return anchor;
}

export class TileGrid {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'tileGrid';
    scene.add(this.group);
    this.tiles = new Map();
    this.boardSize = 0;
    this.mergedTiles = null;
    this.mergedEdges = null;
  }

  ensureSize(boardSize) {
    if (this.boardSize === boardSize) return;
    this.clear();
    this.boardSize = boardSize;

    const { tileMesh, edgeLines } = buildMergedTileMesh(boardSize);
    this.mergedTiles = tileMesh;
    this.mergedEdges = edgeLines;
    this.group.add(tileMesh, edgeLines);

    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const key = `${r},${c}`;
        this.tiles.set(key, createTileAnchor(r, c, boardSize));
      }
    }
  }

  getTile(row, col) {
    return this.tiles.get(`${row},${col}`) ?? null;
  }

  getTileAtWorld(x, z) {
    for (const anchor of this.tiles.values()) {
      const { row, col } = anchor.userData;
      const pos = tileWorldPosition(row, col, this.boardSize);
      const half = TILE_SIZE / 2;
      if (
        x >= pos.x - half &&
        x <= pos.x + half &&
        z >= pos.z - half &&
        z <= pos.z + half
      ) {
        return anchor;
      }
    }
    return null;
  }

  clear() {
    if (this.mergedTiles) {
      this.group.remove(this.mergedTiles);
      this.mergedTiles.geometry.dispose();
      this.mergedTiles.material.dispose();
      this.mergedTiles = null;
    }
    if (this.mergedEdges) {
      this.group.remove(this.mergedEdges);
      this.mergedEdges.geometry.dispose();
      this.mergedEdges.material.dispose();
      this.mergedEdges = null;
    }
    this.tiles.clear();
    this.boardSize = 0;
  }
}
