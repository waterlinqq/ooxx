import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import manifest from '../assets/units/manifest.json';
import { buildUnitAnimationClips } from '../js/board3d/units/humanoidClips.js';

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
const out = {};

for (const [classId, spec] of Object.entries(manifest.units)) {
  try {
    const gltf = await loader.loadAsync(`/units/${spec.file}`);
    const clips = buildUnitAnimationClips(gltf.scene, spec.clips ?? {});
    const buffer = await exportGlb(gltf.scene, clips);
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    out[classId] = {
      file: spec.file,
      base64: btoa(binary),
      bytes: bytes.length,
      clips: clips.map((clip) => clip.name),
    };
  } catch (error) {
    out[classId] = { error: String(error?.message ?? error) };
  }
}

window.__UNIT_ANIM_BAKE__ = out;
