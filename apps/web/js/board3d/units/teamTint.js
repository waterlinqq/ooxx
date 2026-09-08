import * as THREE from 'three';
import { resolveUnitColor } from '../../units.js';

const GLOBAL_MATERIAL_NAMES = new Set(['steel', 'gold', 'leather', 'wood', 'skin', 'charcoal']);

/** Helmets overlap the head sphere in the bake; pull them back in depth to avoid eating the face. */
const HELMET_SLOTS = new Set(['armor', 'armorDeep', 'steel', 'trim', 'gold']);

function stampMaterialBaselines(material) {
  material.userData.baseColor = material.color.clone();
  material.userData.baseOpacity = material.opacity ?? 1;
  material.userData.baseEmissive = material.emissiveIntensity ?? 1;
}

function stampGlobalMaterialBaselines(material) {
  const slot = material.name ?? '';
  if (!GLOBAL_MATERIAL_NAMES.has(slot)) return;
  material.userData.globalShared = true;
  stampMaterialBaselines(material);
}

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
    if (keepColor(material) && slot !== 'ring') {
      stampMaterialBaselines(material);
      continue;
    }
    if (GLOBAL_MATERIAL_NAMES.has(slot) || skipTint(material)) continue;
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
    stampMaterialBaselines(material);
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


/** Keep shadow/ring translucent; force all other slots fully opaque (avoids GLB export glitches). */
export function normalizeGltfMaterials(materials) {
  for (const material of materials) {
    const slot = material.name ?? '';
    if (slot === 'shadow') {
      material.transparent = true;
      material.depthWrite = false;
      material.userData.skipTint = true;
      material.userData.baseOpacity = material.opacity;
      continue;
    }
    if (slot === 'ring') {
      material.transparent = true;
      material.depthWrite = false;
      material.userData.baseOpacity = material.opacity;
      continue;
    }
    if (material.userData.preserveTransparent) {
      material.transparent = true;
      material.depthWrite = false;
      material.userData.baseOpacity = material.opacity;
      if (slot === 'cloth') material.side = THREE.DoubleSide;
      continue;
    }
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.alphaTest = 0;
    material.alphaMap = null;
    material.polygonOffset = false;
    stampGlobalMaterialBaselines(material);
    if (slot === 'skin' || slot === 'charcoal') {
      // Head spheres can lose fragments to helmet depth fighting; keep both sides visible.
      material.side = THREE.DoubleSide;
    } else if (slot === 'cloth') {
      material.side = THREE.DoubleSide;
    } else if (HELMET_SLOTS.has(slot)) {
      material.side = THREE.FrontSide;
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    } else {
      material.side = THREE.FrontSide;
    }
  }
}

export function finalizeGltfMeshes(root) {
  const head = root.getObjectByName('ooxxHead');
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of mats) {
      if (!material) continue;
      const slot = material.name ?? '';
      obj.renderOrder = 0;
      // Skin on the head must draw after sibling helmet pieces when depth is tight.
      if (slot === 'skin' && head && obj.parent === head) {
        obj.renderOrder = 3;
      } else if (HELMET_SLOTS.has(slot) && head && obj.parent === head) {
        obj.renderOrder = 2;
      }
    }
  });
}
