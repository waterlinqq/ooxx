import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.click('#confirmRoster');
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { sel, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
  };
  return [
    '.battle-layout',
    '.board-wrap',
    '.board-area',
    '.board-container',
    '#boardCanvas',
    '#boardCanvas canvas',
    '.battle-panels',
  ].map(pick);
});

console.table(info);
await browser.close();
