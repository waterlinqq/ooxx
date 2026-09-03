import Stats from 'three/examples/jsm/libs/stats.module.js';

export function attachDevRendererStats(renderer, { parent = document.body } = {}) {
  const stats = new Stats();
  stats.dom.style.position = parent === document.body ? 'fixed' : 'absolute';
  stats.dom.style.top = '8px';
  stats.dom.style.left = '8px';
  stats.dom.style.zIndex = '10000';

  const callsPanel = stats.addPanel(new Stats.Panel('DC', '#ff8', '#221'));
  const trisPanel = stats.addPanel(new Stats.Panel('TRI', '#f8f', '#202'));

  parent.appendChild(stats.dom);

  return {
    begin() {
      stats.begin();
    },
    end() {
      const { calls, triangles } = renderer.info.render;
      callsPanel.update(calls, Math.max(calls * 2, 64));
      trisPanel.update(triangles / 1000, Math.max(triangles / 500, 64));
      stats.end();
    },
    dispose() {
      stats.dom.remove();
    },
  };
}
