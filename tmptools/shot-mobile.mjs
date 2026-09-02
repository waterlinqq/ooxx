import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.click('#confirmRoster');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tmptools/mobile-shot.png' });
await browser.close();
console.log('saved tmptools/mobile-shot.png');
