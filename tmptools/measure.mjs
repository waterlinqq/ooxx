import { chromium } from 'playwright';

const width = Number(process.argv[2] ?? 400);
const height = Number(process.argv[3] ?? 800);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.click('#confirmRoster');
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      sel,
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
    };
  };
  return [
    '.app',
    '.app-header',
    '.battle-layout',
    '.board-wrap',
    '.score-bar',
    '.board-area',
    '.board-container',
    '#boardCanvas canvas',
    '.battle-panels',
    '#actionPanel',
    '.bottom-nav',
  ].map(pick).filter(Boolean);
});

console.log(`viewport ${width}x${height}`);
console.table(info);
await browser.close();
