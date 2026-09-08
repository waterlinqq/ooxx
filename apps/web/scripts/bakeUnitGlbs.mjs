/**
 * Bake procedural unit meshes to engine-neutral GLB files.
 * Run: node apps/web/scripts/bakeUnitGlbs.mjs
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const unitsRoot = path.join(webRoot, 'public', 'units');

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
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
  await page.goto(`http://localhost:${port}/scripts/unitGlbBakePage.html`, {
    waitUntil: 'load',
    timeout: 180_000,
  });
  await page.waitForFunction(() => window.__UNIT_GLB_BAKE__, { timeout: 180_000 });
  const baked = await page.evaluate(() => window.__UNIT_GLB_BAKE__);

  await browser.close();
  await server.close();

  await fs.mkdir(unitsRoot, { recursive: true });
  let count = 0;
  let totalBytes = 0;
  for (const [classId, entry] of Object.entries(baked)) {
    const outPath = path.join(unitsRoot, entry.file);
    const buffer = base64ToBuffer(entry.base64);
    await fs.writeFile(outPath, buffer);
    count++;
    totalBytes += buffer.length;
    console.log(`${classId.padEnd(14)} → ${entry.file} (${(buffer.length / 1024).toFixed(1)} KB)  meshes ${entry.meshesBefore}→${entry.meshes}`);
  }

  console.log(`\nBaked ${count} unit GLBs (${(totalBytes / 1024).toFixed(1)} KB total) in ${Date.now() - started}ms`);
  console.log(`Output: ${unitsRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
