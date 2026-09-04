import puppeteer from '/private/tmp/ooxx-tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT ?? '5178';
const TAG = process.env.TAG ?? 'props';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
  defaultViewport: { width: 1320, height: 400, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));

for (const t of (process.env.TS ?? '0.4').split(',')) {
  await page.goto(`http://localhost:${PORT}/tmp-props.html?t=${t}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 300));
  const el = await page.$('#grid');
  await el.screenshot({ path: `shots/${TAG}-t${t}.png` });
  console.log('wrote', `shots/${TAG}-t${t}.png`);
}

await browser.close();
