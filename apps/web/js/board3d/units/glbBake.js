import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildUnitModel } from '../UnitModels.js';
import { tagRigNodes } from './rigNames.js';
import { mergeBakeMeshes, countMeshes } from './glbBakeMerge.js';

/** Build a blue-team unit with stable node names, ready for GLB export. */
export function buildBakeableUnitModel(classId) {
  const model = buildUnitModel(classId, 'blue');
  tagRigNodes(model);
  const beforeMeshes = countMeshes(model.root);
  const { mergedGroups, meshCount } = mergeBakeMeshes(model.root);
  model.bakeStats = { beforeMeshes, meshCount, mergedGroups };
  return model;
}

export function exportUnitGlb(model) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      model.root,
      resolve,
      reject,
      { binary: true },
    );
  });
}
