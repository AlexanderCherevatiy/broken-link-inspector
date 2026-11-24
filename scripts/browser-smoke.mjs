import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { fixtureServer } from '../fixtures/server.mjs';

async function until(read, label, timeout = 5_000) {
  const end = Date.now() + timeout;
  do {
    const value = await read();
    if (value) return value;
    await delay(40);
  } while (Date.now() < end);
  throw new Error('Timed out waiting for ' + label);
}

async function popupClient(browser, targetId) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: false });
  let sequence = 0;
  async function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      function finish(error, result) {
        clearTimeout(timer);
        browser.off('Target.receivedMessageFromTarget', listener);
        if (error) reject(error);
        else resolve(result);
      }
      function listener(event) {
        if (event.sessionId !== sessionId) return;
        const response = JSON.parse(event.message);
        if (response.id !== id) return;
        finish(response.error ? new Error(response.error.message) : null, response.result);
      }
      const timer = setTimeout(() => finish(new Error('Popup command timed out: ' + method)), 2_000);
      browser.on('Target.receivedMessageFromTarget', listener);
      void browser.send('Target.sendMessageToTarget', {
        sessionId, message: JSON.stringify({ id, method, params }),
      }).catch(finish);
    });
  }
  await send('Runtime.runIfWaitingForDebugger');
  return async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? expression);
    return response.result.value;
  };
}

async function openScan(context, browser, id, source, url) {
  await source.goto(url);
  await source.bringToFront();
  const targets = (await browser.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos;
  const tab = targets.find((item) => item.embedderData?.tabActive && item.url === url);
  assert.ok(tab, 'Source must be the active browser tab');
  const allTargets = async () => (await browser.send('Target.getTargets', { filter: [{}] })).targetInfos;
  const existing = new Set((await allTargets()).map((item) => item.targetId));
  await browser.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const popup = await until(async () => (await allTargets()).find((item) =>
    !existing.has(item.targetId) && (item.type === 'other' || item.url.endsWith('/popup.html'))), 'action popup');
  const evaluate = await popupClient(browser, popup.targetId);
  await until(() => evaluate(`document.querySelector('.popup-address')?.textContent === ${JSON.stringify(url)}
    && document.querySelector('.popup-scan')?.disabled === false`), 'enabled scan button in the action popup');
  const opened = context.waitForEvent('page');
  await evaluate("void document.querySelector('.popup-scan').click()");
  const report = await opened;
  await report.waitForURL('chrome-extension://' + id + '/report.html?*');
  await until(async () => !(await allTargets()).some((item) => item.targetId === popup.targetId), 'popup closure');
  return report;
}

async function waitForPhase(page, phase, timeout = 12_000) {
  await page.getByRole('status').filter({ hasText: phase }).waitFor({ timeout });
}

function rowFor(page, url) {
  return page.getByRole('row').filter({ has: page.getByRole('link', { name: url, exact: true }) });
}

async function approveFixtureHost(context, id, origin) {
  const settings = await context.newPage();
  try {
    await settings.goto(process.env.SMOKE_EXTENSIONS_URL ?? 'chrome://extensions/');
    // Approve one fixture host in Chrome's site controls inside the disposable test profile.
    // The extension's Allow access button still activates the optional grant through its real API.
    await settings.evaluate(({ id, origin }) => new Promise((resolve, reject) => {
      chrome.developerPrivate.addHostPermission(id, origin, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    }), { id, origin });
  } finally {
    await settings.close();
  }
}

const dnsHost = 'bli-fixture.example.org';
const requests = [];
const server = fixtureServer((request) => requests.push(request));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const dist = fileURLToPath(new URL('../dist/edge', import.meta.url));
let context;

try {
  context = await chromium.launchPersistentContext('', {
    channel: process.env.SMOKE_BROWSER_PATH ? undefined : 'chromium',
    executablePath: process.env.SMOKE_BROWSER_PATH,
    headless: process.env.SMOKE_HEADFUL !== '1',
    viewport: { width: 1280, height: 950 },
    acceptDownloads: true,
    args: ['--disable-extensions-except=' + dist, '--load-extension=' + dist,
      '--enable-unsafe-extension-debugging', '--no-proxy-server',
      '--host-resolver-rules=MAP ' + dnsHost + ' 127.0.0.1'],
  });
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  const browser = await context.browser().newBrowserCDPSession();
  const listExtensions = async () => (await browser.send('Extensions.getExtensions')).extensions;
  let extensions = await listExtensions();
  if (!extensions.some((item) => item.name === 'Broken Link Inspector')) {
    await browser.send('Extensions.loadUnpacked', { path: dist });
    extensions = await listExtensions();
  }
  const extension = extensions.find((item) => item.name === 'Broken Link Inspector');
  assert.equal(extension?.version, '1.0.0');
  const { id } = extension;
  const version = await browser.send('Browser.getVersion');
  const source = context.pages()[0];
  await source.goto('chrome-extension://' + id + '/report.html');
  assert.deepEqual((await source.evaluate(() => chrome.permissions.getAll())).origins, []);
  await source.evaluate(() => chrome.storage.local.set({ locale: 'en' }));
  await context.addCookies([{ name: 'fixture', value: 'present', url: base }]);

  const report = await openScan(context, browser, id, source, base + '/');
  await waitForPhase(report, 'Scan complete');
  assert.equal(await report.locator('tbody tr').count(), 15);
  assert.equal(await report.locator('tbody .badge.notChecked').count(), 15);
  assert.equal(requests.filter(({ pathname }) => pathname.startsWith('/targets/')).length, 0);
  assert.equal(await report.getByRole('button', { name: 'Allow access' }).count(), 0);
  console.log('PASS: unpacked MV3 install, real action popup, DOM capture, deduplication and default private-host blocking');

  await report.getByRole('button', { name: 'Settings' }).click();
  await report.getByRole('radio', { name: 'Light' }).check();
  await report.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await report.getByRole('radio', { name: 'System' }).check();
  await report.emulateMedia({ colorScheme: 'dark' });
  await report.waitForFunction(() => getComputedStyle(document.documentElement).colorScheme === 'dark');
  await report.emulateMedia({ colorScheme: 'light' });
  await report.waitForFunction(() => getComputedStyle(document.documentElement).colorScheme === 'light');
  await report.getByRole('radio', { name: 'Dark' }).check();
  await report.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await report.getByRole('checkbox', { name: 'Allow local test links' }).check();
  await report.getByRole('button', { name: 'Close' }).click();
  await report.getByRole('button', { name: 'Allow access' }).waitFor();
  assert.match(await rowFor(report, base + '/targets/ok').innerText(), /Not checked/);
  await approveFixtureHost(context, id, 'http://127.0.0.1/*');
  await report.bringToFront();
  assert.equal(await report.evaluate(() => chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] })), false);
  await report.getByRole('button', { name: 'Allow access' }).click();
  await waitForPhase(report, 'Scanning links');
  await waitForPhase(report, 'Scan complete');
  assert.equal(await report.evaluate(() => chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] })), true);

  for (const [path, category, status] of [
    ['ok', 'Working', 200], ['no-content', 'Working', 204], ['missing', 'Missing', 404],
    ['gone', 'Missing', 410], ['redirect', 'Redirect', 302], ['auth', 'Uncertain', 401],
    ['forbidden', 'Uncertain', 403], ['rate-limit', 'Uncertain', 429], ['error', 'Uncertain', 503],
    ['fallback', 'Working', 206], ['large', 'Working', 200],
  ]) {
    const row = rowFor(report, base + '/targets/' + path);
    assert.equal(await row.locator('.badge').innerText(), category, path);
    assert.equal(await row.locator('.http-code').innerText(), String(status), path);
  }
  assert.match(await rowFor(report, base + '/targets/redirect').innerText(), /landing\?via=redirect/);
  assert.match(await rowFor(report, base + '/targets/slow').innerText(), /timed out/);
  assert.match(await rowFor(report, base + '/targets/disconnect').innerText(), /could not reach/);
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/landing'), false);
  assert.equal(requests.some(({ pathname, method, range, cookie }) =>
    pathname === '/targets/fallback' && method === 'GET' && range === 'bytes=0-0' && !cookie), true);
  console.log('PASS: exact optional host grant, HTTP status, redirect metadata, loopback fixtures, HEAD/GET, timeout and network error');

  const missing = rowFor(report, base + '/targets/missing');
  assert.equal(await missing.locator('.result-source bdi').innerText(), base + '/');
  await missing.getByRole('button', { name: 'Show on source page' }).click();
  assert.equal(await source.evaluate(() => document.activeElement.getAttribute('href')), 'missing');
  assert.equal(await source.evaluate(() => document.activeElement.getAnimations().length > 0), true);
  await report.bringToFront();
  const requestStart = requests.length;
  await missing.getByRole('checkbox').check();
  await report.getByRole('button', { name: 'Retry selected' }).click();
  await until(() => requests.slice(requestStart).some(({ pathname }) => pathname === '/targets/missing'), 'selected retry request');
  await waitForPhase(report, 'Scan complete');
  assert.deepEqual(requests.slice(requestStart).filter(({ pathname }) => pathname.startsWith('/targets/'))
    .map(({ pathname, method }) => [pathname, method]), [['/targets/missing', 'HEAD']]);
  console.log('PASS: row source address, original anchor highlight and selected-only retry');
  if (process.env.SMOKE_STORE_ASSETS) {
    await mkdir(process.env.SMOKE_STORE_ASSETS, { recursive: true });
    await report.setViewportSize({ width: 1280, height: 800 });
    await report.getByRole('button', { name: 'Settings' }).click();
    await report.getByRole('radio', { name: 'Light' }).check();
    await report.getByRole('button', { name: 'Close' }).click();
    await report.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await report.screenshot({ path: process.env.SMOKE_STORE_ASSETS + '/edge-report-en.png', animations: 'disabled' });
    await report.getByRole('button', { name: 'Settings' }).click();
    await report.getByRole('radio', { name: 'Dark' }).check();
    await report.getByRole('button', { name: 'Close' }).click();
    await report.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  }

  await report.getByRole('button', { name: 'Missing', exact: true }).click();
  assert.equal(await report.locator('tbody tr').count(), 2);
  const downloadPromise = report.waitForEvent('download');
  await report.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^broken-link-inspector-127\.0\.0\.1-.*\.csv$/);
  const csv = await readFile(await download.path(), 'utf8');
  assert.match(csv, /^\uFEFF"Link URL","Source page","HTTP","Category","Error","Redirect URL"\r\n/);
  assert.ok(csv.includes(`"${base}/targets/missing","${base}/","404","Missing","The page was not found.",""`));
  assert.ok(csv.includes(`"${base}/targets/ok","${base}/","200","Working"`));
  await report.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await report.getByRole('heading', { name: 'Проверка ссылок' }).waitFor();
  await report.reload();
  await waitForPhase(report, 'Проверка завершена');
  assert.equal(await rowFor(report, base + '/targets/missing').locator('.http-code').innerText(), '404');
  assert.equal(await report.locator('html').getAttribute('data-theme'), 'dark');
  await report.getByRole('combobox', { name: 'Язык' }).selectOption('en');
  await report.getByRole('heading', { name: 'Link Inspection' }).waitFor();
  await report.setViewportSize({ width: 380, height: 900 });
  assert.equal(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const langs = await report.locator('.toolbar select option').evaluateAll(nodes => nodes.map(node => node.value));
  assert.equal(langs.length, 20);
  for (const code of langs) {
    await report.locator('.toolbar select').selectOption(code);
    await report.waitForFunction(code => document.documentElement.lang === code, code);
    assert.equal(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, code);
    assert.equal(await report.locator('html').getAttribute('dir'), code === 'ar' ? 'rtl' : 'ltr', code);
    if (code === 'ar' && process.env.SMOKE_STORE_ASSETS) {
      await report.setViewportSize({ width: 1280, height: 800 });
      await report.screenshot({ path: process.env.SMOKE_STORE_ASSETS + '/edge-report-ar.png', animations: 'disabled' });
      await report.setViewportSize({ width: 380, height: 900 });
    }
  }
  await report.locator('.toolbar select').selectOption('en');
  await report.getByRole('heading', { name: 'Link Inspection' }).waitFor();
  console.log('PASS: 20 locales in a narrow report and Arabic RTL');
  if (process.env.SMOKE_SCREENSHOT) {
    await report.setViewportSize({ width: 1280, height: 950 });
    await report.screenshot({ path: process.env.SMOKE_SCREENSHOT });
  }
  console.log('PASS: result filters, real CSV download, Russian localization, theme and report restoration, narrow viewport');

  const slow = await openScan(context, browser, id, source, base + '/stop.html');
  await waitForPhase(slow, 'Scanning links');
  await rowFor(slow, base + '/targets/ok').locator('.badge.working').waitFor();
  const duplicate = await context.newPage();
  await duplicate.goto(slow.url());
  await duplicate.getByText(/This report is running in another tab/).waitFor();
  await slow.getByRole('button', { name: 'Stop', exact: true }).click();
  await waitForPhase(slow, 'Scan stopped');
  await waitForPhase(duplicate, 'Scan stopped', 2_000);
  assert.equal(await rowFor(duplicate, base + '/targets/ok').locator('.http-code').innerText(), '200');
  await duplicate.close();
  assert.match(await rowFor(slow, base + '/targets/delay/5').innerText(), /scan was stopped/);
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/delay/5'), false);
  await slow.getByRole('button', { name: 'Scan', exact: true }).click();
  await waitForPhase(slow, 'Scanning links');
  await rowFor(slow, base + '/targets/ok').locator('.badge.working').waitFor();
  await slow.reload();
  await waitForPhase(slow, 'Scan interrupted');
  assert.equal(await rowFor(slow, base + '/targets/ok').locator('.http-code').innerText(), '200');
  assert.match(await rowFor(slow, base + '/targets/delay/5').innerText(), /closed or reloaded/);
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/delay/5'), false);
  console.log('PASS: Stop, duplicate report synchronization and interrupted scan recovery');

  await slow.getByRole('button', { name: 'Scan', exact: true }).click();
  await waitForPhase(slow, 'Scanning links');
  await rowFor(slow, base + '/targets/ok').locator('.badge.working').waitFor();
  await report.getByRole('button', { name: 'Settings' }).click();
  await report.getByRole('checkbox', { name: 'Allow local test links' }).uncheck();
  await waitForPhase(slow, 'Scan stopped', 2_000);
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/delay/5'), false);
  await report.getByRole('checkbox', { name: 'Allow local test links' }).check();
  await report.getByRole('button', { name: 'Close' }).click();
  console.log('PASS: turning off local test links stops a loopback scan in a different report tab');

  const permission = await openScan(context, browser, id, source, base + '/permissions.html');
  await waitForPhase(permission, 'Scan complete');
  assert.match(await rowFor(permission, 'https://example.org/').innerText(), /Site access was not granted/);
  assert.match(await rowFor(permission, 'http://192.168.1.1/').innerText(), /private address skipped/);
  // Exercise the UI response to a refusal without relying on platform-specific native dialog automation.
  await permission.evaluate(() => {
    chrome.permissions.request = async ({ origins }) => {
      window.requestedFixtureOrigins = origins;
      return false;
    };
  });
  await permission.getByRole('button', { name: 'Allow access' }).click();
  await permission.getByRole('alert').filter({ hasText: 'Access was declined' }).waitFor();
  assert.deepEqual(await permission.evaluate(() => window.requestedFixtureOrigins), [
    'https://example.org/*', 'https://www.iana.org/*', 'http://localhost/*',
  ]);
  assert.match(await rowFor(permission, 'https://example.org/').innerText(), /Site access was not granted/);
  console.log('PASS: exact requested hosts, denial feedback, ungranted hosts and private addresses');

  const alias = 'http://' + dnsHost + ':' + server.address().port;
  const protectedReport = await openScan(context, browser, id, source, alias + '/dns.html');
  await waitForPhase(protectedReport, 'Scan complete');
  await approveFixtureHost(context, id, 'http://' + dnsHost + '/*');
  await protectedReport.bringToFront();
  await protectedReport.getByRole('button', { name: 'Allow access' }).click();
  await rowFor(protectedReport, alias + '/targets/dns-guard').locator('.badge.uncertain').waitFor();
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/dns-guard'), false);
  console.log('PASS: the address-space guard blocks HTTP to a DNS name that resolves to loopback');
  assert.deepEqual(errors, []);
  let bookmarkReport;
  if (process.env.SMOKE_HEADFUL === '1') {
    // Use the browser's bookmark manager only in this disposable profile.
    const manager = await context.newPage();
    await manager.goto(process.env.SMOKE_EXTENSIONS_URL?.startsWith('edge:') ? 'edge://favorites/' : 'chrome://bookmarks/');
    await manager.evaluate((url) => chrome.bookmarks.create({ url, title: 'Local QA bookmark' }), base + '/targets/missing');
    await manager.close();
    bookmarkReport = await context.newPage();
    await bookmarkReport.goto('chrome-extension://' + id + '/report.html?bookmarks=1');
    await bookmarkReport.bringToFront();
    assert.equal(await bookmarkReport.evaluate(() => chrome.permissions.contains({ permissions: ['bookmarks'] })), false);
    await bookmarkReport.getByRole('button', { name: 'Scan bookmarks', exact: true }).click();
    const bookmarked = rowFor(bookmarkReport, base + '/targets/missing');
    try {
      await bookmarked.locator('.badge.missing').waitFor({ timeout: 20_000 });
    } catch (error) {
      throw new Error('Bookmark grant or fixture check did not complete. ' +
        (await bookmarkReport.locator('body').innerText()).slice(0, 900), { cause: error });
    }
    assert.equal(await bookmarkReport.evaluate(() => chrome.permissions.contains({ permissions: ['bookmarks'] })), true);
    assert.equal(await bookmarked.locator('.result-source').innerText(), 'Bookmarks');
    const bookmarksCsv = bookmarkReport.waitForEvent('download');
    await bookmarkReport.getByRole('button', { name: 'Export CSV' }).click();
    assert.match(await readFile(await (await bookmarksCsv).path(), 'utf8'), /"Bookmarks","404","Missing"/);
    console.log('PASS: optional native Bookmarks API, fixture bookmark status and CSV');
  }
  if (process.env.SMOKE_PUBLIC) {
    const live = await openScan(context, browser, id, source, 'https://example.org/');
    await waitForPhase(live, 'Scan complete');
    const publicTarget = await live.locator('tbody .link-address').first().getAttribute('href');
    assert.ok(publicTarget?.startsWith('https://'));
    const origin = new URL(publicTarget).origin + '/*';
    await approveFixtureHost(context, id, origin);
    await live.bringToFront();
    await live.getByRole('button', { name: 'Allow access' }).click();
    const liveRow = rowFor(live, publicTarget);
    await liveRow.locator('.badge:not(.notChecked)').waitFor();
    await waitForPhase(live, 'Scan complete');
    const code = await liveRow.locator('.http-code').innerText();
    const category = await liveRow.locator('.badge').innerText();
    assert.ok(/^[2345]\d\d$/.test(code) || category === 'Redirect', await liveRow.innerText());
    console.log('PASS: live capture and HTTP response for ' + publicTarget + ' (' + category + ', ' + code + ')');
  }
  const clearFrom = bookmarkReport ?? report;
  await clearFrom.getByRole('button', { name: 'Settings' }).click();
  clearFrom.once('dialog', (dialog) => dialog.accept());
  await clearFrom.getByRole('button', { name: 'Clear saved reports' }).click();
  await clearFrom.getByRole('status').filter({ hasText: 'Saved reports cleared' }).waitFor();
  await clearFrom.getByRole('heading', { name: 'No report yet' }).waitFor();
  console.log('PASS: clearing saved reports');
  console.log('Browser: ' + version.product);
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
}
