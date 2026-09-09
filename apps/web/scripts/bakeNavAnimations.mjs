/**
 * Build-time nav icon animation baker (Chromium WebGL frames → animated WebP).
 * Run: node apps/web/scripts/bakeNavAnimations.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const execFileAsync = promisify(execFile);

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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nav-anim-'));
  const framePaths = [];
  try {
    for (let i = 0; i < frameDataUrls.length; i++) {
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(4, '0')}.png`);
      await fs.writeFile(framePath, dataUrlToBuffer(frameDataUrls[i]));
      framePaths.push(framePath);
    }

    const outPath = path.join(tmpDir, 'out.webp');
    await execFileAsync('img2webp', [
      '-lossy',
      '-q', '82',
      '-m', '4',
      '-d', String(frameDelay),
      '-loop', String(loop),
      ...framePaths,
      '-o', outPath,
    ]);

    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
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
