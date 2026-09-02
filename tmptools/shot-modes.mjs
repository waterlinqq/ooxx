import { chromium } from 'playwright';

const tag = process.argv[2] || 'now';
const viewports = [
  { label: 'd', width: 1280, height: 800 },
  { label: 'm', width: 390, height: 844 },
];

const browser = await chromium.launch();

async function enterBattle(page, modeIndex) {
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForSelector('#modeButtons .mode-btn', { state: 'visible' });
  await page.locator('#modeButtons .mode-btn').nth(modeIndex).click();
  await page.locator('#confirmRoster').click();
  await page.waitForSelector('#formationRandom', { state: 'visible' });
  await page.locator('#formationRandom').click();
  await page.waitForTimeout(200);
  await page.locator('#startBattle').click();
  await page.waitForSelector('#battleContent:not(.hidden)');
  await page.waitForTimeout(2500);
}

for (const v of viewports) {
  for (const [label, index] of [['3x3', 0], ['4x4', 1], ['5x5', 2]]) {
    const context = await browser.newContext({ viewport: { width: v.width, height: v.height } });
    const page = await context.newPage();
    await enterBattle(page, index);
    await page.screenshot({ path: `tmptools/${tag}-${v.label}-${label}.png` });
    const box = await page.locator('.board-container').boundingBox();
    console.log(v.label, label, Math.round(box.width), 'x', Math.round(box.height));
    await context.close();
  }
}

await browser.close();
