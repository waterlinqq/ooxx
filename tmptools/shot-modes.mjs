import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'tmptools/m-lobby.png' });

for (const [label, index] of [['4x4', 1], ['5x5', 2]]) {
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.locator('#modeButtons .mode-btn').nth(index).click();
  await page.click('#confirmRoster');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `tmptools/m-${label}.png` });
  const box = await page.locator('.board-container').boundingBox();
  console.log(label, Math.round(box.width), 'x', Math.round(box.height));
}

await browser.close();
