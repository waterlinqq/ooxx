import puppeteer from '/private/tmp/ooxx-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? '5179';
const TAG = process.env.TAG ?? 'trigger';
const KINDS = (process.env.KINDS ?? 'potion,spikes,web').split(',');
const FRAMES = (process.env.FRAMES ?? '0,120,240,360,480,620,800').split(',').map(Number);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
  defaultViewport: { width: 640, height: 640, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));

await page.goto(`http://localhost:${PORT}/tmp-prop-trigger.html`, { waitUntil: 'networkidle0' });
for (let i = 0; i < 40; i++) {
  if (await page.evaluate(() => window.__ready === true)) break;
  await new Promise((r) => setTimeout(r, 250));
}

const clip = { x: 0, y: 0, width: 620, height: 620 };

for (const kind of KINDS) {
  await page.evaluate((k) => window.__arm(k), kind);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `shots/${TAG}-${kind}-idle.png`, clip });

  await page.evaluate((k) => window.__stepOn(k), kind);
  let elapsed = 0;
  for (const at of FRAMES) {
    await new Promise((r) => setTimeout(r, Math.max(0, at - elapsed)));
    elapsed = at;
    await page.screenshot({ path: `shots/${TAG}-${kind}-${String(at).padStart(4, '0')}.png`, clip });
  }
  console.log('wrote', kind);
}

await browser.close();
