/**
 * Inject humanoid animation clips into all static unit GLBs.
 * Run: node apps/web/scripts/rigUnits.mjs
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
  page.setDefaultTimeout(300_000);
  page.on('pageerror', (err) => {
    console.error('page error:', err.message);
  });
  await page.goto(`http://localhost:${port}/scripts/animateUnitsPage.html`, {
    waitUntil: 'load',
    timeout: 300_000,
  });
  await page.waitForFunction(() => window.__UNIT_ANIM_BAKE__, { timeout: 300_000 });
  const baked = await page.evaluate(() => window.__UNIT_ANIM_BAKE__);
  await browser.close();
  await server.close();
  return baked;
}

async function main() {
  const started = Date.now();
  const baked = await bakeWithThree();

  let ok = 0;
  let failed = 0;
  for (const [classId, entry] of Object.entries(baked)) {
    if (entry.error) {
      failed++;
      console.warn(`${classId.padEnd(14)} SKIP  ${entry.error}`);
      continue;
    }
    const outPath = path.join(unitsRoot, entry.file);
    const buffer = base64ToBuffer(entry.base64);
    await fs.writeFile(outPath, buffer);
    ok++;
    console.log(
      `${classId.padEnd(14)} → ${entry.file} (${(buffer.length / 1024).toFixed(1)} KB)  clips: ${entry.clips.join(', ')}`,
    );
  }

  console.log(`\nRigged ${ok} units (${failed} skipped) in ${Date.now() - started}ms`);
  console.log(`Output: ${unitsRoot}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
