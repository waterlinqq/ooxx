import { chromium } from 'playwright';

const browser = await chromium.launch();

async function open(viewport, deviceScaleFactor = 2) {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  page.on('pageerror', (e) => console.log('[err]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console]', m.text());
  });
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.locator('#modeButtons .mode-btn').nth(2).click();
  await page.click('#confirmRoster');
  await page.click('#formationRandom');
  await page.click('#startBattle');
  await page.waitForTimeout(1500);
  return page;
}

const mobile = await open({ width: 390, height: 844 });
await mobile.screenshot({ path: 'tmptools/2v2-mobile.png' });
console.log('reserve labels', await mobile.locator('.reserve-label').count());
console.log('teammate reserve labels', await mobile.locator('.reserve-label.teammate').count());
console.log('legacy 2d panels', await mobile.locator('#teammatePanel, #reservePanel, #enemyPanel').count());

const desktop = await open({ width: 1024, height: 720 }, 3);
await desktop.screenshot({ path: 'tmptools/2v2-desktop.png' });

const mate = await desktop.locator('.reserve-label.teammate').first().boundingBox();
const own = await desktop.locator('.reserve-label:not(.enemy):not(.teammate)').first().boundingBox();
await desktop.screenshot({
  path: 'tmptools/2v2-zoom.png',
  clip: {
    x: Math.min(own.x, mate.x) - 40,
    y: own.y - 14,
    width: 260,
    height: mate.y + mate.height + 40 - (own.y - 14),
  },
});

// Deploy one of our units, then let the three AI seats play so a teammate unit reaches the board.
const canvas = await desktop.locator('#boardCanvas canvas').boundingBox();
await desktop.mouse.click(own.x + own.width / 2, own.y + own.height + 18);
await desktop.waitForTimeout(400);
await desktop.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
await desktop.waitForTimeout(5000);

const boardTexts = (await desktop.locator('.unit-3d-label:not(.reserve-label)').allTextContents()).map((t) =>
  t.replace(/\s+/g, ' ').trim()
);
console.log('board labels', JSON.stringify(boardTexts));

await desktop.screenshot({
  path: 'tmptools/2v2-board.png',
  clip: { x: canvas.x, y: canvas.y + canvas.height * 0.22, width: canvas.width, height: canvas.height * 0.5 },
});

await browser.close();
