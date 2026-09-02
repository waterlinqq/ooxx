import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('tmptools', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.click('#confirmRoster');
await page.waitForTimeout(1200);
await page.locator('#boardCanvas canvas').first().screenshot({ path: 'tmptools/board-shot.png' });
await page.screenshot({ path: 'tmptools/full-shot.png', fullPage: false });
await browser.close();
console.log('saved tmptools/board-shot.png');
