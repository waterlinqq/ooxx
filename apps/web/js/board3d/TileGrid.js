import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { webglShadowsEnabled } from './WebGLSceneRuntime.js';

export const TILE_SIZE = 0.88;
export const TILE_GAP = 0.16;
export const TILE_PITCH = TILE_SIZE + TILE_GAP;

const BASE_COLOR = 0xa8a491;
const BASE_EMISSIVE = 0x1c2420;
const TILE_HEIGHT = 0.14;

// The camera tilt means each tile's side wall covers the gap to the tile behind
// it, so untinted sides make the rows smear into one long stripe. Painting the
// sides as dark soil lets that occluded band read as part of the gap instead.
function createTileBox() {
  const geometry = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const TOP_FACE = 2; // BoxGeometry face order: +x, -x, +y, -y, +z, -z

  // Green-weighted so the covered band matches the shaded lawn showing through
  // the column gaps, instead of banding the board with dark bars.
  for (let i = 0; i < count; i++) {
    const isTop = Math.floor(i / 4) === TOP_FACE;
    colors[i * 3] = isTop ? 1 : 0.3;
    colors[i * 3 + 1] = isTop ? 1 : 0.46;
    colors[i * 3 + 2] = isTop ? 1 : 0.32;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const TILE_BOX = createTileBox();

let paverTexture = null;

// Each tile box carries its own 0..1 UV set, so a texture with darkened borders
// makes every cell read as a separate flagstone even where the physical gap is
// hidden by the tile in front of it.
function createPaverTexture() {
  if (paverTexture) return paverTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8f9587';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 12;
    const tone = 130 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${tone}, ${tone + 4}, ${tone - 8}, 0.16)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const edge = ctx.createLinearGradient(0, 0, 0, size);
  edge.addColorStop(0, 'rgba(60,66,58,0.55)');
  edge.addColorStop(0.12, 'rgba(60,66,58,0)');
  edge.addColorStop(0.88, 'rgba(60,66,58,0)');
  edge.addColorStop(1, 'rgba(48,54,46,0.65)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  const side = ctx.createLinearGradient(0, 0, size, 0);
  side.addColorStop(0, 'rgba(60,66,58,0.55)');
  side.addColorStop(0.12, 'rgba(60,66,58,0)');
  side.addColorStop(0.88, 'rgba(60,66,58,0)');
  side.addColorStop(1, 'rgba(48,54,46,0.6)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, size, size);

  paverTexture = new THREE.CanvasTexture(canvas);
  paverTexture.colorSpace = THREE.SRGBColorSpace;
  return paverTexture;
}

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

// Stable per-cell value in 0..1, so a flagstone keeps its shade across resyncs.
function cellNoise(row, col) {
  const h = Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663);
  return ((h >>> 8) & 0xffff) / 0xffff;
}

const TOP_VERTEX_START = 8;
const TOP_VERTEX_END = 12;

// One shared texture across every cell would tile into an obvious repeat, so
// each flagstone gets its own shade and a mirrored UV set.
function tileGeometryAt(row, col) {
  const geometry = TILE_BOX.clone();
  const noise = cellNoise(row, col);
  const colors = geometry.attributes.color;
  const uv = geometry.attributes.uv;

  const shade = 0.88 + noise * 0.22;
  const warm = 0.97 + noise * 0.06;
  for (let i = TOP_VERTEX_START; i < TOP_VERTEX_END; i++) {
    colors.setXYZ(i, colors.getX(i) * shade * warm, colors.getY(i) * shade, colors.getZ(i) * shade * (1.04 - noise * 0.08));
  }

  const flipU = noise > 0.5;
  const flipV = ((row + col) & 1) === 1;
  for (let i = TOP_VERTEX_START; i < TOP_VERTEX_END; i++) {
    uv.setXY(i, flipU ? 1 - uv.getX(i) : uv.getX(i), flipV ? 1 - uv.getY(i) : uv.getY(i));
  }

  colors.needsUpdate = true;
  uv.needsUpdate = true;
  return geometry;
}

function buildMergedTileMesh(boardSize) {
  const tilePieces = [];
  const edgePieces = [];
  const edgeSource = new THREE.EdgesGeometry(TILE_BOX);

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const pos = tileWorldPosition(r, c, boardSize);
      const tile = tileGeometryAt(r, c);
      tile.translate(pos.x, pos.y, pos.z);
      tilePieces.push(tile);
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
    map: createPaverTexture(),
    vertexColors: true,
    emissive: BASE_EMISSIVE,
    emissiveIntensity: 0.1,
    roughness: 0.9,
    metalness: 0.02,
  });
  const tileMesh = new THREE.Mesh(mergedTiles, tileMaterial);
  tileMesh.receiveShadow = webglShadowsEnabled();
  tileMesh.name = 'tileGridMerged';

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x3c4438,
    transparent: true,
    opacity: 0.35,
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
