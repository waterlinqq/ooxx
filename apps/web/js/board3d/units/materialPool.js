const GLOBAL_SLOTS = new Set(['steel', 'gold', 'leather', 'wood', 'skin', 'charcoal']);

class UnitMaterialPool {
  constructor() {
    this.shadow = null;
    this.ring = new Map();
    this.global = new Map();
  }

  resolve(material, team) {
    const slot = material.name ?? '';
    if (slot === 'shadow') {
      if (!this.shadow) {
        material.userData.pooled = true;
        this.shadow = material;
      }
      return this.shadow;
    }
    if (slot === 'ring') {
      if (!this.ring.has(team)) {
        material.userData.pooled = true;
        this.ring.set(team, material);
      }
      return this.ring.get(team);
    }
    if (GLOBAL_SLOTS.has(slot)) {
      if (!this.global.has(slot)) {
        material.userData.pooled = true;
        this.global.set(slot, material);
      }
      return this.global.get(slot);
    }
    return material;
  }
}

let pool = new UnitMaterialPool();

export function getUnitMaterialPool() {
  return pool;
}

export function resetUnitMaterialPool() {
  pool = new UnitMaterialPool();
}

export function poolSharedMaterials(root, team) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const assign = (material) => {
      if (!material) return material;
      return pool.resolve(material, team);
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(assign);
      return;
    }
    child.material = assign(child.material);
  });
}

export function isPooledMaterial(material) {
  return Boolean(material?.userData?.pooled);
}

export function disposeMaterialsSafe(materials) {
  for (const material of materials) {
    if (!material || isPooledMaterial(material)) continue;
    material.dispose?.();
  }
}

export function collectUniqueMaterials(root) {
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

function isSharedMaterial(material) {
  return isPooledMaterial(material) || Boolean(material?.userData?.globalShared);
}

function detachMaterial(material) {
  if (!material || !isSharedMaterial(material)) return material;
  const clone = material.clone();
  delete clone.userData.pooled;
  delete clone.userData.globalShared;
  return clone;
}

/** Clone pooled/global materials on a dying unit so fade-out does not mutate shared instances. */
export function detachSharedMaterialsForFade(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map(detachMaterial);
      return;
    }
    child.material = detachMaterial(child.material);
  });
}
