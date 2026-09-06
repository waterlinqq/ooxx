/**
 * One-off profiler: node --experimental-vm-modules apps/web/scripts/profile3d.mjs
 * (run from repo root)
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.resolve(__dirname, '..');
const threePath = path.join(repoRoot, 'node_modules/three/build/three.module.js');

// Minimal DOM for CanvasTexture used by unit/map prop models.
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') return {};
    const ctx = {
      createRadialGradient() {
        return { addColorStop() {} };
      },
      fillStyle: '',
      fillRect() {},
    };
    return { width: 128, height: 128, getContext: () => ctx };
  },
};

const THREE = await import(pathToFileURL(threePath).href);
const { buildUnitModel } = await import(pathToFileURL(path.join(webRoot, 'js/board3d/UnitModels.js')).href);
const { buildMapPropModel } = await import(pathToFileURL(path.join(webRoot, 'js/board3d/MapPropModels.js')).href);
const { CLASS_IDS } = await import(pathToFileURL(path.join(repoRoot, 'shared/units.js')).href);

function countObject3D(root) {
  let meshes = 0;
  let lines = 0;
  let triangles = 0;
  const materials = new Set();

  root.traverse((obj) => {
    if (obj.isMesh) {
      meshes += 1;
      const geo = obj.geometry;
      if (geo?.index) triangles += geo.index.count / 3;
      else if (geo?.attributes?.position) triangles += geo.attributes.position.count / 3;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) if (m) materials.add(m);
    }
    if (obj.isLineSegments || obj.isLine) {
      lines += 1;
      const geo = obj.geometry;
      if (geo?.attributes?.position) triangles += geo.attributes.position.count / 3;
    }
  });

  return { meshes, lines, triangles, materials: materials.size };
}

function tileStats(boardSize) {
  const tiles = boardSize * boardSize;
  return {
    meshes: 1,
    lines: 1,
    triangles: tiles * 12 + tiles * 24,
    materials: 2,
  };
}

function highlightStats() {
  return {
    meshes: 6,
    lines: 0,
    triangles: 0,
    materials: 6,
  };
}

function sum(...parts) {
  return parts.reduce(
    (acc, p) => ({
      meshes: acc.meshes + p.meshes,
      lines: acc.lines + p.lines,
      triangles: acc.triangles + p.triangles,
      materials: acc.materials + p.materials,
    }),
    { meshes: 0, lines: 0, triangles: 0, materials: 0 },
  );
}

console.log('=== Per-unit mesh / triangle counts ===\n');
const unitStats = new Map();
let maxUnit = { id: '', meshes: 0, triangles: 0 };
let totalUnitMeshes = 0;
let totalUnitTris = 0;

for (const classId of CLASS_IDS) {
  const model = buildUnitModel(classId, 'blue');
  const stats = countObject3D(model.root);
  unitStats.set(classId, stats);
  totalUnitMeshes += stats.meshes;
  totalUnitTris += stats.triangles;
  if (stats.meshes > maxUnit.meshes) maxUnit = { id: classId, meshes: stats.meshes, triangles: stats.triangles };
  console.log(
    `${classId.padEnd(14)} meshes ${String(stats.meshes).padStart(3)}  lines ${String(stats.lines).padStart(2)}  tris ${String(Math.round(stats.triangles)).padStart(5)}  materials ${stats.materials}`,
  );
}

const avgMeshes = totalUnitMeshes / CLASS_IDS.length;
const avgTris = totalUnitTris / CLASS_IDS.length;
console.log(`\navg meshes/unit: ${avgMeshes.toFixed(1)}  avg tris/unit: ${avgTris.toFixed(0)}  heaviest: ${maxUnit.id} (${maxUnit.meshes} meshes, ${Math.round(maxUnit.triangles)} tris)`);

console.log('\n=== Map prop counts ===\n');
const propKinds = ['potion', 'spikes', 'web', 'stone', 'flag'];
for (const kind of propKinds) {
  const model = buildMapPropModel(kind, 12345);
  if (!model) continue;
  const stats = countObject3D(model.root);
  console.log(`${kind.padEnd(8)} meshes ${stats.meshes}  tris ${Math.round(stats.triangles)}`);
}

function shadowCloneStats(count) {
  return {
    meshes: count * 2,
    lines: 0,
    triangles: count * 32,
    materials: Math.min(count, 2),
  };
}

function estimateScene(label, { boardSize, unitCount, highlightCount, propCount, shadowClones = 0, extraMeshes = 1 }) {
  const tiles = tileStats(boardSize);
  const crab = unitStats.get('crabGeneral') ?? { meshes: 30, triangles: 2000, lines: 0, materials: 15 };
  const avg = { meshes: Math.round(avgMeshes), triangles: avgTris, lines: 0, materials: 12 };
  const unit = {
    meshes: unitCount * avg.meshes,
    lines: 0,
    triangles: unitCount * avg.triangles,
    materials: unitCount * avg.materials,
  };
  const highlights = highlightStats();
  const props = propCount > 0
    ? { meshes: propCount * 8, lines: 0, triangles: propCount * 120, materials: propCount * 4 }
    : { meshes: 0, lines: 0, triangles: 0, materials: 0 };
  const clones = shadowCloneStats(shadowClones);
  const ground = { meshes: 1, lines: 0, triangles: 2, materials: 1 };

  const total = sum(tiles, unit, highlights, props, clones, ground);
  total.meshes += extraMeshes;

  // Draw calls ≈ opaque mesh batches + transparent overlays + shadow casters
  // Each unique material typically = 1 draw call (no instancing/batching).
  const estDrawCalls = total.meshes + total.lines;

  console.log(`\n--- ${label} (${boardSize}x${boardSize}, ${unitCount} units, ${highlightCount} highlights, ${propCount} props, ${shadowClones} clones) ---`);
  console.log(`  meshes:      ~${total.meshes}`);
  console.log(`  line segs:   ~${total.lines}`);
  console.log(`  triangles:   ~${Math.round(total.triangles).toLocaleString()}`);
  console.log(`  materials:   ~${total.materials} (proxy for draw-call pressure)`);
  console.log(`  est. draws:  ~${estDrawCalls} (no GPU instancing)`);
}

console.log('\n=== Scene estimates (BoardScene) ===');
estimateScene('3x3 typical turn', { boardSize: 3, unitCount: 5, highlightCount: 6, propCount: 0 });
estimateScene('4x4 mid game', { boardSize: 4, unitCount: 8, highlightCount: 12, propCount: 0 });
estimateScene('5x5 siege', { boardSize: 5, unitCount: 12, highlightCount: 18, propCount: 0 });
estimateScene('6x6 survival worst', { boardSize: 6, unitCount: 16, highlightCount: 24, propCount: 20, shadowClones: 2 });

console.log('\n=== Mobile reference thresholds ===');
console.log('  draw calls:  <100 comfortable, 100-300 ok, 300-500 heavy, >500 risky on mid phones');
console.log('  triangles:   <50k comfortable, 50k-150k ok, 150k-300k heavy, >300k risky');
console.log('  note: shadow pass can ~2x effective GPU work for casters/receivers');
