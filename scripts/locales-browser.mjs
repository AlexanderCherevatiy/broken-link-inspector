import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../dist/edge', import.meta.url));
const localeRoot = new URL('../_locales/', import.meta.url);
const folders = (await readdir(localeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const context = await chromium.launchPersistentContext('', {
  executablePath: process.env.SMOKE_BROWSER_PATH,
  channel: process.env.SMOKE_BROWSER_PATH ? undefined : 'chromium',
  headless: true,
  args: [
    '--disable-extensions-except=' + dist, '--load-extension=' + dist, '--enable-unsafe-extension-debugging',
  ],
});

async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth, viewport: window.innerWidth,
    controls: [...document.querySelectorAll('button, summary')].filter((node) => (
      node.getClientRects().length && node.clientWidth && node.scrollWidth > node.clientWidth + 2
    )).map((node) => node.textContent.trim()),
  }));
  assert.ok(metrics.document <= metrics.viewport + 1, label + ' page width ' + JSON.stringify(metrics));
  assert.deepEqual(metrics.controls, [], label + ' clipped controls');
}

try {
  const cdp = await context.browser().newBrowserCDPSession();
  const list = async () => (await cdp.send('Extensions.getExtensions')).extensions;
  let extension = (await list()).find((candidate) => candidate.name === 'Broken Link Inspector');
  if (!extension) {
    await cdp.send('Extensions.loadUnpacked', { path: dist });
    extension = (await list()).find((candidate) => candidate.name === 'Broken Link Inspector');
  }
  assert.ok(extension);
  const base = 'chrome-extension://' + extension.id + '/';
  const report = await context.newPage();
  await report.goto(base + 'report.html');
  await report.locator('.initial-empty').waitFor();
  const reportId = 'locale-layout-fixture';
  await report.evaluate(async (id) => {
    const opened = indexedDB.open('broken-link-inspector');
    const db = await new Promise((resolve, reject) => {
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['reports', 'results'], 'readwrite');
      const sourceUrl = 'https://source.example.org/a-long-source-page-for-layout';
      const links = Array.from({ length: 9 }, (_, index) => ({
        url: 'https://www.example.org/a-long-destination-' + (index + 1),
        label: 'A long label in plain text',
      }));
      tx.objectStore('reports').add({
        id, sourceUrl, title: 'Localization fixture', links, total: links.length,
        captureLimited: false, createdAt: Date.now(), phase: 'finished',
      });
      for (const [index] of links.entries()) {
        const missing = index % 2 === 0;
        tx.objectStore('results').put({
          reportId: id, index, outcome: {
            category: missing ? 'missing' : 'uncertain', status: missing ? 404 : 503,
            method: 'HEAD', reason: 'httpError',
          },
        });
      }
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, reportId);
  await report.goto(base + 'report.html?id=' + reportId);
  await report.locator('tbody tr').first().waitFor();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 370, height: 600 });
  await popup.goto(base + 'popup.html');

  const screenshots = process.env.LOCALE_SCREENSHOTS_DIR;
  if (screenshots) await mkdir(screenshots, { recursive: true });
  for (const folder of folders) {
    const code = Intl.getCanonicalLocales(folder.replaceAll('_', '-'))[0];
    const catalog = JSON.parse(await readFile(new URL(folder + '/messages.json', localeRoot), 'utf8'));
    const direction = code === 'ar' ? 'rtl' : 'ltr';
    await report.locator('.toolbar select').selectOption(code);
    for (const page of [report, popup]) {
      await page.waitForFunction(({ code, direction }) => (
        document.documentElement.lang === code && document.documentElement.dir === direction
      ), { code, direction });
    }
    assert.equal(await popup.locator('.popup-scan').innerText(), catalog.scanCurrentPage.message);
    assert.equal(await popup.locator('.popup-bookmarks').innerText(), catalog.scanBookmarks.message);
    assert.equal(await report.locator('h1').innerText(), catalog.reportTitle.message);
    assert.equal(await report.locator('.result-actions button').first().innerText(), catalog.retrySelected.message);
    for (const width of [320, 1280]) {
      await report.setViewportSize({ width, height: 900 });
      await assertNoOverflow(report, code + ' report at ' + width + 'px');
    }
    await assertNoOverflow(popup, code + ' popup');
    assert.equal(await popup.locator('.popup-address').innerText(), catalog.sourceUnavailable.message);
    assert.ok(await popup.locator('.popup-address').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      code + ' unavailable-page hint must wrap without clipping');
    await report.setViewportSize({ width: 320, height: 900 });
    await report.locator('.settings-button').click();
    assert.equal(await report.locator('#settings-title').innerText(), catalog.settings.message);
    await assertNoOverflow(report, code + ' settings dialog');
    await report.keyboard.press('Escape');

    if (code === 'ar') {
      const geometry = await report.evaluate(() => ({
        brand: document.querySelector('.toolbar .brand').getBoundingClientRect().left,
        actions: document.querySelector('.toolbar-actions').getBoundingClientRect().left,
        direction: getComputedStyle(document.querySelector('.link-address')).direction,
      }));
      assert.ok(geometry.brand > geometry.actions, 'Arabic toolbar starts on the right');
      assert.equal(geometry.direction, 'ltr', 'URLs remain left to right in the Arabic table');
      if (screenshots) {
        await popup.locator('.popup-shell').screenshot({ path: resolve(screenshots, 'popup-ar.png') });
        await report.screenshot({ path: resolve(screenshots, 'report-ar-narrow.png') });
      }
    }
  }
  console.log('PASS: ' + folders.length + ' locales in the popup, narrow/wide report, and settings. Arabic toolbar mirrors and URLs stay LTR.');
} finally {
  await context.close();
}
