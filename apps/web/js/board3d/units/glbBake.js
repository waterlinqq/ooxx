import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildUnitModel } from '../UnitModels.js';
import { tagRigNodes } from './rigNames.js';

/** Build a blue-team unit with stable node names, ready for GLB export. */
export function buildBakeableUnitModel(classId) {
  const model = buildUnitModel(classId, 'blue');
  tagRigNodes(model);
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
