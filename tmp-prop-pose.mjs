import puppeteer from '/private/tmp/ooxx-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? '5179';
const TAG = process.env.TAG ?? 'pose';
const KINDS = (process.env.KINDS ?? 'potion,spikes,web').split(',');
const STEPS = (process.env.STEPS ?? '0,0.1,0.25,0.4,0.55,0.75,1').split(',').map(Number);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
  defaultViewport: { width: 640, height: 640, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[err]', e.message));

await page.goto(`http://localhost:${PORT}/tmp-prop-trigger.html`, { waitUntil: 'networkidle0' });
for (let i = 0; i < 40; i++) {
  if (await page.evaluate(() => window.__ready === true)) break;
  await new Promise((r) => setTimeout(r, 250));
}

// Crop tight to the middle cell: the trigger only ever plays on one tile.
const clip = { x: 190, y: 170, width: 250, height: 300 };

for (const kind of KINDS) {
  await page.evaluate(() => window.__resetPose());
  await page.evaluate((k) => window.__plant(k), kind);
  await new Promise((r) => setTimeout(r, 900));

  for (const p of STEPS) {
    const ok = await page.evaluate((k, v) => window.__pose(k, v), kind, p);
    if (!ok) console.log('no marker for', kind);
    await new Promise((r) => setTimeout(r, 90));
    await page.screenshot({ path: `shots/${TAG}-${kind}-p${String(p).replace('.', '')}.png`, clip });
  }
  console.log('wrote', kind);
}

await browser.close();
