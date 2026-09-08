/**
 * Inject swordsman animation clips into the static GLB via Three.js.
 * Run: node apps/web/scripts/rigSwordsman.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const outputGlb = path.join(webRoot, 'public', 'units', 'swordsman.glb');

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

async function bakeWithThree() {
  const server = await createServer({
    configFile: path.join(webRoot, 'vite.config.js'),
    root: webRoot,
    server: { port: 0, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const port = server.config.server.port;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', (err) => {
    console.error('page error:', err.message);
  });
  await page.goto(`http://localhost:${port}/scripts/animateSwordsmanPage.html`, {
    waitUntil: 'load',
    timeout: 180_000,
  });
  await page.waitForFunction(() => window.__SWORDSMAN_ANIM_BAKE__, { timeout: 180_000 });
  const baked = await page.evaluate(() => window.__SWORDSMAN_ANIM_BAKE__);
  if (baked.error) throw new Error(baked.error);
  await browser.close();
  await server.close();
  return baked;
}

async function main() {
  const started = Date.now();
  const baked = await bakeWithThree();
  const buffer = base64ToBuffer(baked.base64);
  await fs.writeFile(outputGlb, buffer);
  console.log(`Animated swordsman -> ${outputGlb} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log('Clips:', baked.clips.join(', '));
  console.log(`Done in ${Date.now() - started}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
