import puppeteer from '/private/tmp/ooxx-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? '5178';
const TAG = process.env.TAG ?? 'board-props';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
  defaultViewport: { width: 940, height: 700, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));

for (const size of (process.env.SIZES ?? '5').split(',')) {
  await page.goto(`http://localhost:${PORT}/tmp-board-props.html?size=${size}`, { waitUntil: 'networkidle0' });
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => window.__ready === true)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `shots/${TAG}-${size}.png`, clip: { x: 0, y: 0, width: 900, height: 620 } });
  console.log('wrote', `shots/${TAG}-${size}.png`);
}

await browser.close();
