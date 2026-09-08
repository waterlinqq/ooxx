import * as THREE from 'three';
import { resolveUnitColor } from '../../units.js';

const GLOBAL_MATERIAL_NAMES = new Set(['steel', 'gold', 'leather', 'wood', 'skin', 'charcoal']);

function keepColor(material) {
  return Boolean(material.userData?.keepColor);
}

function skipTint(material) {
  return Boolean(material.userData?.skipTint);
}

/**
 * Apply runtime team colours to cloned glTF materials.
 * Baked GLBs use the blue team as the authoring baseline.
 */
export function applyTeamTintToMaterials(materials, team, tintSlots = []) {
  const tintSet = new Set(tintSlots);
  const base = new THREE.Color(resolveUnitColor(team));
  const deep = base.clone().lerp(new THREE.Color(0x0b1220), 0.55);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.5);
  const glow = base.clone().lerp(new THREE.Color(0xffffff), 0.25);

  for (const material of materials) {
    const slot = material.name ?? '';
    if (!slot || GLOBAL_MATERIAL_NAMES.has(slot) || skipTint(material)) continue;
    if (tintSet.size > 0 && !tintSet.has(slot)) continue;

    switch (slot) {
      case 'armor':
        material.color.copy(base);
        material.emissive = deep.clone();
        material.emissiveIntensity = 0.3;
        break;
      case 'armorDeep':
        material.color.copy(deep);
        break;
      case 'cloth':
        material.color.copy(base.clone().lerp(new THREE.Color(0x111827), 0.62));
        break;
      case 'trim':
        material.color.copy(light);
        material.emissive = light.clone();
        material.emissiveIntensity = 0.25;
        break;
      case 'eye':
        material.color.copy(glow);
        material.emissive = glow.clone();
        material.emissiveIntensity = 1.6;
        break;
      case 'ring':
        material.userData.keepColor = true;
        material.color.copy(base);
        material.emissive = base.clone();
        material.emissiveIntensity = 1.1;
        break;
      case 'ember':
      case 'arcane':
        break;
      default:
        material.color.copy(base);
        break;
    }

    // Capture team-tinted values so acted/selection fades restore the right colour.
    material.userData.baseColor = material.color.clone();
    material.userData.baseOpacity = material.opacity;
    material.userData.baseEmissive = material.emissiveIntensity;
  }
}

export function collectMeshMaterials(root) {
  const materials = [];
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of mats) {
      if (!material || seen.has(material.uuid)) continue;
      seen.add(material.uuid);
      materials.push(material);
    }
  });
  return materials;
}
