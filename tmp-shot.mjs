import puppeteer from '/tmp/ooxx-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:5178/tmp-spawn.html';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--window-size=940,700'],
  defaultViewport: { width: 940, height: 700, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 900));

await page.evaluate(() => {
  window.__scene.onResize = () => {};
  window.__scene.scheduleResize = () => {};
});

await page.evaluate(() => {
  window.__setT(0);
  window.__deployAll();
});

const frames = [0, 80, 160, 240, 320, 400, 480, 560, 660, 800];
for (const t of frames) {
  await page.evaluate((ms) => window.__setT(ms), t);
  await new Promise((r) => setTimeout(r, 120));
  await page.screenshot({ path: `shots/spawn-${String(t).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: 900, height: 620 } });
}

await browser.close();
console.log('done');
