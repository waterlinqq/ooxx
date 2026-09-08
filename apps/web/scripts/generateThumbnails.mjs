/**
 * Build-time thumbnail generator (Chromium WebGL → PNG files in public/thumbs/).
 * Run: node apps/web/scripts/generateThumbnails.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const thumbsRoot = path.join(webRoot, 'public', 'thumbs');
const assetVersionPath = path.join(webRoot, 'js', 'board3d', 'assetVersion.js');

async function bumpAssetVersion() {
  const version = Date.now().toString(36);
  await fs.writeFile(
    assetVersionPath,
    `/** Bumped by thumbnail/GLB bake so CDN/browser cache cannot pin stale assets. */\nexport const ASSET_VERSION = '${version}';\n`,
  );
  return version;
}

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

async function writeCategory(category, entries) {
  const outDir = path.join(thumbsRoot, category);
  await fs.mkdir(outDir, { recursive: true });
  let count = 0;
  for (const [id, dataUrl] of Object.entries(entries)) {
    await fs.writeFile(path.join(outDir, `${id}.png`), dataUrlToBuffer(dataUrl));
    count++;
  }
  return count;
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
  page.setDefaultTimeout(120_000);
  page.on('pageerror', (err) => {
    console.error('page error:', err.message);
  });
  await page.goto(`http://localhost:${port}/scripts/thumbnailBakePage.html`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await page.waitForFunction(() => window.__THUMBNAIL_BAKE__, { timeout: 120_000 });
  const thumbs = await page.evaluate(() => window.__THUMBNAIL_BAKE__);

  await browser.close();
  await server.close();

  const results = [];
  for (const [category, entries] of Object.entries(thumbs)) {
    results.push([category, await writeCategory(category, entries)]);
  }

  const version = await bumpAssetVersion();
  const total = results.reduce((sum, [, count]) => sum + count, 0);
  const summary = results.map(([category, count]) => `${category} ${count}`).join(', ');
  console.log(`Generated ${total} thumbnails (${summary}) in ${Date.now() - started}ms`);
  console.log(`Output: ${thumbsRoot}`);
  console.log(`Asset version: ${version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
