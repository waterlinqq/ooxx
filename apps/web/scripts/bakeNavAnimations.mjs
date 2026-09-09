/**
 * Build-time nav icon animation baker (Chromium WebGL frames → animated WebP).
 * Run: node apps/web/scripts/bakeNavAnimations.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const navDir = path.join(webRoot, 'public', 'thumbs', 'nav');
const assetVersionPath = path.join(webRoot, 'js', 'board3d', 'assetVersion.js');

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

async function bumpAssetVersion() {
  const version = Date.now().toString(36);
  await fs.writeFile(
    assetVersionPath,
    `/** Bumped by thumbnail/GLB bake so CDN/browser cache cannot pin stale assets. */\nexport const ASSET_VERSION = '${version}';\n`,
  );
  return version;
}

async function encodeAnimatedWebp(frameDataUrls, frameDelay, loop = 0) {
  const frames = frameDataUrls.map(dataUrlToBuffer);
  return sharp(frames, { animated: true })
    .webp({
      quality: 82,
      effort: 4,
      delay: frameDelay,
      loop,
    })
    .toBuffer();
}

async function main() {
  const started = Date.now();
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
  await page.goto(`http://localhost:${port}/scripts/navAnimationBakePage.html`, {
    waitUntil: 'load',
    timeout: 180_000,
  });
  await page.waitForFunction(() => window.__NAV_ANIM_BAKE__, { timeout: 180_000 });
  const animations = await page.evaluate(() => window.__NAV_ANIM_BAKE__);

  await browser.close();
  await server.close();

  await fs.mkdir(navDir, { recursive: true });
  let count = 0;

  for (const [navId, baked] of Object.entries(animations)) {
    if (!baked) continue;
    const { introFrames, idleFrames, frameDelay } = baked;

    const introWebp = await encodeAnimatedWebp(introFrames, frameDelay, 1);
    await fs.writeFile(path.join(navDir, `${navId}-intro.webp`), introWebp);

    const idleWebp = await encodeAnimatedWebp(idleFrames, frameDelay, 0);
    await fs.writeFile(path.join(navDir, `${navId}-idle.webp`), idleWebp);

    count += 2;
    console.log(`  ${navId}: intro ${introFrames.length}f, idle ${idleFrames.length}f @ ${frameDelay}ms`);
  }

  const version = await bumpAssetVersion();
  console.log(`Baked ${count} nav animations in ${Date.now() - started}ms`);
  console.log(`Output: ${navDir}`);
  console.log(`Asset version: ${version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
