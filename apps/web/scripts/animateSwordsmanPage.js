import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  buildSwordsmanAnimationClips,
  prepareSwordsmanRig,
} from '../js/board3d/units/swordsmanClips.js';

async function exportGlb(root, animations) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      root,
      resolve,
      reject,
      { binary: true, animations },
    );
  });
}

const loader = new GLTFLoader();
try {
  const gltf = await loader.loadAsync('/units/swordsman.glb');
  const root = gltf.scene;
  prepareSwordsmanRig(root);
  const clips = buildSwordsmanAnimationClips(root);
  const buffer = await exportGlb(root, clips);

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

  window.__SWORDSMAN_ANIM_BAKE__ = {
    base64: btoa(binary),
    bytes: bytes.length,
    clips: clips.map((clip) => clip.name),
  };
} catch (error) {
  window.__SWORDSMAN_ANIM_BAKE__ = { error: String(error?.message ?? error) };
  console.error(error);
}
