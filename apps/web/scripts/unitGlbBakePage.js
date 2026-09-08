import { CLASS_IDS } from '@ooxx/shared/units.js';
import manifest from '../assets/units/manifest.json';
import { buildBakeableUnitModel, exportUnitGlb } from '../js/board3d/units/glbBake.js';

const out = {};

for (const classId of CLASS_IDS) {
  const spec = manifest.units[classId];
  if (!spec) {
    console.warn(`skip ${classId}: missing manifest entry`);
    continue;
  }

  const model = buildBakeableUnitModel(classId);
  const buffer = await exportUnitGlb(model);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  out[classId] = {
    file: spec.file,
    base64: btoa(binary),
    bytes: bytes.length,
    meshes: model.bakeStats?.meshCount ?? null,
    mergedGroups: model.bakeStats?.mergedGroups ?? 0,
    meshesBefore: model.bakeStats?.beforeMeshes ?? null,
  };
}

window.__UNIT_GLB_BAKE__ = out;
