import puppeteer from '/private/tmp/ooxx-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? '5178';
const TAG = process.env.TAG ?? 'sheet';
const ONLY = process.env.ONLY ?? '';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
  defaultViewport: { width: 1240, height: 1000, deviceScaleFactor: Number(process.env.DSF ?? 1) },
});

const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));

for (const yaw of (process.env.YAWS ?? '0,0.7').split(',')) {
  const q = `?yaw=${yaw}${ONLY ? `&only=${ONLY}` : ''}${process.env.BOARD ? '&board=1' : ''}`;
  await page.goto(`http://localhost:${PORT}/tmp-models.html${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 300));
  const el = await page.$('#grid');
  await el.screenshot({ path: `shots/models-${TAG}-yaw${yaw}.png` });
  console.log('wrote', `shots/models-${TAG}-yaw${yaw}.png`);
}

await browser.close();
