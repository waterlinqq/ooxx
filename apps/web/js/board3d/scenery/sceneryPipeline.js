/**
 * Scenery render pipeline:
 * - baked (default, Level 3): vertex-color scene merge → ~4–6 draw calls
 * - instanced (Level 1+2): InstancedMesh per prototype → debug / comparison
 *
 * Toggle: ?scenery=baked | ?scenery=instanced
 */
export function getSceneryRenderMode() {
  try {
    const query = new URLSearchParams(window.location.search).get('scenery');
    if (query === 'baked' || query === 'instanced') return query;
    const stored = localStorage.getItem('ooxx-scenery-mode');
    if (stored === 'baked' || stored === 'instanced') return stored;
  } catch {
    // non-browser (tests)
  }
  return 'baked';
}

export function getMapPropStoneMode() {
  return getSceneryRenderMode() === 'instanced' ? 'instanced' : 'baked';
}
