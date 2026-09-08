import { buildUnitModel } from '../UnitModels.js';
import { getUnitAssetLoader } from './UnitAssetLoader.js';

/**
 * Prefer baked GLB (game pipeline); fall back to procedural while assets are in flux.
 */
export function resolveUnitModel(classId, team) {
  const loader = getUnitAssetLoader();
  if (loader.canInstantiate(classId)) {
    return { ...loader.instantiate(classId, team), fromGlb: true };
  }
  const model = buildUnitModel(classId, team);
  return { ...model, fromGlb: false, animation: null };
}

export function initUnitAssets(classIds) {
  return getUnitAssetLoader().init(classIds);
}
