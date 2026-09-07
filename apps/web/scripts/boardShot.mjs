/**
 * Board visual preview shots.
 * Run: node apps/web/scripts/boardShot.mjs [outDir]
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(webRoot, '../../.board-shots'));

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const server = await createServer({
    configFile: path.join(webRoot, 'vite.config.js'),
    root: webRoot,
    server: { port: 0, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const port = server.config.server.port;

  const browser = await chromium.launch({ headless: true });
  // Portrait phone aspect — where the old expand-to-fit left empty top/bottom bands.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => console.error('page error:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('console error:', msg.text());
  });

  await page.goto(`http://localhost:${port}/scripts/boardPreviewPage.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__PREVIEW_READY__, { timeout: 60_000 });

  const cases = [
    { size: 3, extras: false, name: 'board-3x3' },
    { size: 4, extras: false, name: 'board-4x4' },
    { size: 6, extras: false, name: 'board-6x6' },
    { size: 6, extras: false, survival: true, name: 'board-6x6-survival' },
    { size: 4, extras: true, name: 'board-4x4-props' },
  ];

  for (const { size, extras, survival, name } of cases) {
    await page.evaluate((s) => window.__PREVIEW__.render(s === 3 ? 5 : 3, false), size);
    await page.evaluate(([s, e, surv]) => window.__PREVIEW__.render(s, true, e, surv), [size, extras, survival ?? false]);
    await page.waitForTimeout(900);
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }

  await browser.close();
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
