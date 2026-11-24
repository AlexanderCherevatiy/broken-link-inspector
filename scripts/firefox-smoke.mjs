import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { fixtureServer } from '../fixtures/server.mjs';

const addonId = 'broken-link-inspector@bli.invalid';
const dnsHost = 'bli-fixture.example.org';
const elementKey = 'element-6066-11e4-a52e-4f735466cecf';

async function until(check, label, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await check();
    if (value) return value;
    await delay(45);
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + label);
}

async function localPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

class FirefoxDriver {
  constructor(port) {
    this.endpoint = 'http://127.0.0.1:' + port;
    this.session = null;
  }

  async request(route, data, method = data === undefined ? 'GET' : 'POST') {
    const response = await fetch(this.endpoint + route, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(25_000),
    });
    const { value } = await response.json();
    if (!response.ok) throw new Error(method + ' ' + route + ': ' + (value.message ?? JSON.stringify(value)));
    return value;
  }

  command(route, data, method) {
    return this.request('/session/' + this.session + route, data, method);
  }

  script(script, args = [], async = false) {
    return this.command('/execute/' + (async ? 'async' : 'sync'), { script, args });
  }

  async chrome(script, args = [], async = false) {
    await this.command('/moz/context', { context: 'chrome' });
    try {
      return await this.script(script, args, async);
    } finally {
      await this.command('/moz/context', { context: 'content' });
    }
  }

  goto(url) {
    return this.command('/url', { url });
  }

  switchTab(handle) {
    return this.command('/window', { handle });
  }

  async click(selector, name, withinUrl) {
    const ref = await until(() => this.script(`
      const [selector, name, withinUrl] = arguments;
      const row = withinUrl && [...document.querySelectorAll('tbody tr')].find(candidate =>
        [...candidate.querySelectorAll('a[href]')].some(link => link.href === withinUrl));
      if (withinUrl && !row) return null;
      return [...(row || document).querySelectorAll(selector)].find(element => {
        if (element.disabled || !element.getClientRects().length) return false;
        const label = element.getAttribute('aria-label') || element.labels?.[0]?.textContent.trim() || element.textContent.trim();
        return name === null || label === name || element.title === name;
      }) || null;
    `, [selector, name ?? null, withinUrl ?? null]), name ?? selector);
    return this.command('/element/' + ref[elementKey] + '/click', {});
  }

  async close() {
    if (this.session) await this.command('', undefined, 'DELETE');
  }
}

async function extensionPopup(driver, script, args = []) {
  const outcome = await driver.chrome(`
    const [script, args, done] = arguments;
    (async () => {
      const popup = [...document.querySelectorAll('browser.webextension-popup-browser')]
        .find(browser => browser.currentURI.spec.endsWith('/popup.html'));
      if (!popup) return { value: null };
      const actor = popup.browsingContext.currentWindowGlobal?.getActor('MarionetteCommands');
      if (!actor) return { value: null };
      return { value: await actor.executeScript(script, args, {}) };
    })().then(done, error => done({ error: error.message }));
  `, [script, args], true);
  if (outcome.error) throw new Error('Firefox popup: ' + outcome.error);
  return outcome.value;
}

async function openReport(driver, sourceHandle, sourceUrl, mode = 'page') {
  await driver.switchTab(sourceHandle);
  await driver.goto(sourceUrl);
  const existing = new Set(await driver.command('/window/handles'));
  await driver.chrome(`
    const [id] = arguments;
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    let customizable;
    try {
      customizable = ChromeUtils.importESModule(
        'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs',
      );
    } catch {
      customizable = ChromeUtils.importESModule('resource:///modules/CustomizableUI.sys.mjs');
    }
    const { CustomizableUI } = customizable;
    const extension = ExtensionParent.GlobalManager.getExtension(id);
    const action = extension.apiManager.global.browserActionFor(extension);
    CustomizableUI.addWidgetToArea(action.id, CustomizableUI.AREA_NAVBAR);
    action.triggerAction(window);
  `, [addonId]);
  await until(() => extensionPopup(driver, `
    const [mode, url] = arguments;
    const action = mode === 'page' ? document.querySelector('.popup-scan')
      : [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Scan bookmarks');
    return action && !action.disabled && (mode !== 'page'
      || document.querySelector('.popup-address')?.textContent === url);
  `, [mode, sourceUrl]), 'usable Firefox action popup');
  await extensionPopup(driver, `
    const [mode] = arguments;
    const action = mode === 'page' ? document.querySelector('.popup-scan')
      : [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Scan bookmarks');
    action.click();
  `, [mode]);
  const handle = await until(async () => (await driver.command('/window/handles'))
    .find((item) => !existing.has(item)), 'new Firefox report tab');
  await driver.switchTab(handle);
  await until(() => driver.script("return location.protocol === 'moz-extension:' && location.pathname === '/report.html'"),
    'Firefox report URL');
  return handle;
}

async function respondToPermission(driver, allow) {
  return until(() => driver.chrome(`
    const [allow] = arguments;
    const panel = window.PopupNotifications.panel;
    if (!window.PopupNotifications.getNotification('addon-webext-permissions') || panel.state !== 'open') return null;
    const notification = panel.firstElementChild;
    const button = allow ? notification.button : notification.secondaryButton;
    if (!button || button.disabled) return null;
    button.click();
    return true;
  `, [allow]), 'native Firefox optional permission prompt');
}

function phase(driver, value, timeout) {
  return until(() => driver.script(`
    return [...document.querySelectorAll('[role="status"]')].some(status => status.textContent.trim() === arguments[0]);
  `, [value]), value, timeout);
}

function rowInfo(driver, url) {
  return driver.script(`
    const row = [...document.querySelectorAll('tbody tr')].find(candidate =>
      [...candidate.querySelectorAll('a[href]')].some(link => link.href === arguments[0]));
    if (!row) return null;
    return { category: row.querySelector('.badge')?.textContent.trim(), code: row.querySelector('.http-code')?.textContent.trim(),
      text: row.innerText, source: row.querySelector('.result-source :is(bdi, span)')?.textContent.trim() };
  `, [url]);
}

async function setupBookmarks(driver, base) {
  const result = await driver.chrome(`
    const [base, done] = arguments;
    const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
    (async () => {
      // This removes only defaults in geckodriver's disposable profile.
      await PlacesUtils.bookmarks.eraseEverything();
      for (const [title, url] of [['Fixture OK', base + '/targets/ok'],
        ['Fixture Missing', base + '/targets/missing'], ['Fixture duplicate', base + '/targets/ok']]) {
        await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, title, url });
      }
    })().then(() => done({ ok: true }), error => done({ error: error.message }));
  `, [base], true);
  assert.ok(result.ok, result.error);
}

async function saveScreenshot(driver, directory, file, element) {
  await mkdir(directory, { recursive: true });
  const command = element ? '/element/' + element[elementKey] + '/screenshot' : '/screenshot';
  await writeFile(join(directory, file), Buffer.from(await driver.command(command), 'base64'));
}

async function setWindowViewport(driver, width, height) {
  const current = await driver.command('/window/rect');
  await driver.command('/window/rect', { width, height: current.height });
  const extra = await driver.script('return outerHeight - innerHeight');
  await driver.command('/window/rect', { width, height: height + extra });
}

async function startDriver(port, temporaryPath) {
  const subprocess = spawn(process.env.GECKODRIVER || 'geckodriver',
    ['--allow-system-access', '--host', '127.0.0.1', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const driver = new FirefoxDriver(port);
  let log = '';
  let launchError;
  const append = (buffer) => { log = (log + buffer.toString()).slice(-12_000); };
  subprocess.stdout.on('data', append);
  subprocess.stderr.on('data', append);
  subprocess.once('error', (error) => { launchError = error; });
  try {
    await until(async () => {
      if (launchError) throw launchError;
      return driver.request('/status').catch(() => false);
    }, 'geckodriver');
    const browserOptions = {
      args: ['-headless'],
      prefs: {
        'browser.aboutwelcome.enabled': false,
        'browser.shell.checkDefaultBrowser': false,
        'browser.startup.homepage_override.mstone': 'ignore',
        'intl.locale.requested': 'en-US',
        'network.dns.localDomains': dnsHost,
        'network.proxy.type': 0,
        'browser.download.folderList': 2,
        'browser.download.dir': temporaryPath,
        'browser.download.useDownloadDir': true,
        'browser.download.alwaysOpenPanel': false,
        'browser.helperApps.neverAsk.saveToDisk': 'text/csv,text/plain,application/octet-stream',
      },
    };
    if (process.env.FIREFOX_BINARY) browserOptions.binary = resolve(process.env.FIREFOX_BINARY);
    const session = await driver.request('/session', {
      capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': browserOptions } },
    });
    driver.session = session.sessionId;
    await driver.command('/timeouts', { script: 8_000, pageLoad: 18_000 });
    return { driver, subprocess, version: session.capabilities.browserVersion, logs: () => log };
  } catch (error) {
    subprocess.kill();
    if (log) console.error(log);
    throw error;
  }
}

const requests = [];
const fixture = fixtureServer((request) => requests.push(request));
fixture.listen(0, '127.0.0.1');
await once(fixture, 'listening');
const base = 'http://127.0.0.1:' + fixture.address().port;
const downloads = await mkdtemp(join(tmpdir(), 'bli-firefox-'));
const dist = process.env.FIREFOX_SMOKE_PACKAGE
  ? resolve(process.env.FIREFOX_SMOKE_PACKAGE)
  : fileURLToPath(new URL('../dist/firefox', import.meta.url));
let browser;

try {
  browser = await startDriver(await localPort(), downloads);
  const { driver, version } = browser;
  const installed = await driver.command('/moz/addon/install', { path: dist, temporary: true });
  assert.equal(installed, addonId);
  const source = await driver.command('/window');
  await driver.goto(base + '/');
  await driver.command('/cookie', { cookie: { name: 'fixture', value: 'present' } });
  const report = await openReport(driver, source, base + '/');
  await phase(driver, 'Scan complete');
  assert.equal(await driver.script("return document.querySelectorAll('tbody .badge.notChecked').length"), 15);
  assert.equal(requests.filter(({ pathname }) => pathname.startsWith('/targets/')).length, 0);
  assert.equal(await driver.script("return Boolean(document.querySelector('tbody tr'))"), true);
  assert.deepEqual(await driver.script("return browser.permissions.getAll().then(p => p.origins)"), []);
  console.log('PASS Firefox: temporary package, real toolbar popup, page capture and default private-host blocking');

  await driver.click('button', 'Settings');
  await driver.click('input[type="radio"]', 'Dark');
  await until(() => driver.script("return document.documentElement.dataset.theme === 'dark'"), 'dark theme');
  await driver.click('.loopback-setting input');
  await driver.click('button', 'Close');

  await driver.click('button', 'Allow access');
  await respondToPermission(driver, false);
  assert.equal(await driver.script("return browser.permissions.contains({origins:['http://127.0.0.1/*']})"), false);
  assert.equal((await rowInfo(driver, base + '/targets/ok')).category, 'Not checked');
  await driver.click('button', 'Allow access');
  await respondToPermission(driver, true);
  await phase(driver, 'Scanning links');
  await phase(driver, 'Scan complete', 15_000);
  assert.equal(await driver.script("return browser.permissions.contains({origins:['http://127.0.0.1/*']})"), true);
  assert.equal(await driver.script("return browser.permissions.contains({origins:['http://localhost/*']})"), false);
  assert.equal(await driver.script("return browser.permissions.contains({data_collection:['websiteContent']})"), true);
  for (const [target, category, status] of [
    ['ok', 'Working', 200], ['no-content', 'Working', 204], ['missing', 'Missing', 404],
    ['gone', 'Missing', 410], ['redirect', 'Redirect', 302], ['auth', 'Uncertain', 401],
    ['forbidden', 'Uncertain', 403], ['rate-limit', 'Uncertain', 429], ['error', 'Uncertain', 503],
    ['fallback', 'Working', 206], ['large', 'Working', 200],
  ]) {
    const row = await rowInfo(driver, base + '/targets/' + target);
    assert.equal(row?.category, category, target);
    assert.equal(row?.code, String(status), target);
    assert.equal(row.source, base + '/', target + ' has an explicit source URL column');
  }
  assert.match((await rowInfo(driver, base + '/targets/redirect')).text, /landing\?via=redirect/);
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/landing'), false);
  assert.match((await rowInfo(driver, base + '/targets/slow')).text, /timed out/);
  assert.equal((await rowInfo(driver, base + '/targets/disconnect')).category, 'Uncertain');
  assert.ok(requests.some(({ pathname, method, range, cookie }) =>
    pathname === '/targets/fallback' && method === 'GET' && range === 'bytes=0-0' && !cookie));
  console.log('PASS Firefox: native permission denial/acceptance, scoped requests, source links, HTTP status, HEAD/GET and redirect metadata');

  const missesBefore = requests.filter(({ pathname }) => pathname === '/targets/missing').length;
  const requestsBeforeRetry = requests.length;
  const missingUrl = base + '/targets/missing';
  await driver.click('input[type="checkbox"]', 'Select link for retry: ' + missingUrl, missingUrl);
  await driver.click('button', 'Retry selected');
  await until(() => requests.filter(({ pathname }) => pathname === '/targets/missing').length === missesBefore + 1,
    'repeat HEAD for selected link');
  await phase(driver, 'Scan complete');
  assert.deepEqual(requests.slice(requestsBeforeRetry).filter(({ pathname }) => pathname.startsWith('/targets/'))
    .map(({ pathname }) => pathname), ['/targets/missing']);

  await driver.click('button', 'Show on source page', missingUrl);
  await until(() => driver.chrome('return gBrowser.selectedBrowser.currentURI.spec === arguments[0]', [base + '/']),
    'extension selecting the original source tab');
  await driver.switchTab(source);
  await until(() => driver.script(`
    const link = document.querySelector('a[href="missing"]');
    return link && document.activeElement === link && link.getAnimations().length > 0;
  `), 'original anchor focus/highlight');
  await driver.command('/refresh', {});
  await driver.switchTab(report);
  await driver.click('button', 'Show on source page', missingUrl);
  await until(() => driver.script(`
    return [...document.querySelectorAll('[role="alert"]')].some(el => /original link could not be highlighted/i.test(el.textContent));
  `), 'unavailable original DOM after source reload');
  console.log('PASS Firefox: selected retry, original-link highlight, and stale-document refusal');

  await driver.click('button', 'Missing');
  assert.equal(await driver.script("return document.querySelectorAll('tbody tr').length"), 2);
  await driver.click('button', 'Export CSV');
  const csvFile = await until(async () => (await readdir(downloads)).find(file => file.endsWith('.csv')),
    'Firefox CSV download');
  const csv = await until(async () => {
    const text = await readFile(join(downloads, csvFile), 'utf8');
    return text.includes('/targets/ok') ? text : false;
  }, 'complete CSV');
  assert.match(csv, /^\uFEFF"Link URL","Source page","HTTP","Category","Error","Redirect URL"\r\n/);
  assert.ok(csv.includes(`"${missingUrl}","${base}/","404","Missing"`));
  assert.ok(csv.includes(`"${base}/targets/ok","${base}/","200","Working"`));

  await driver.command('/refresh', {});
  await phase(driver, 'Scan complete');
  assert.equal((await rowInfo(driver, missingUrl)).code, '404');
  assert.equal(await driver.script('return document.documentElement.dataset.theme'), 'dark');
  if (process.env.FIREFOX_SMOKE_SCREENSHOTS) {
    await setWindowViewport(driver, 1280, 800);
    await saveScreenshot(driver, process.env.FIREFOX_SMOKE_SCREENSHOTS, 'firefox-report-dark.png');
    await driver.click('button', 'Settings');
    await driver.click('input[type="radio"]', 'Light');
    await driver.click('button', 'Close');
    await until(() => driver.script("return document.documentElement.dataset.theme === 'light'"), 'light theme');
    await saveScreenshot(driver, process.env.FIREFOX_SMOKE_SCREENSHOTS, 'firefox-report-en.png');
  }

  const locales = await driver.script(`
    return [...document.querySelector('select[aria-label="Language"]').options].map(option => option.value);
  `);
  assert.equal(locales.length, 20);
  // Firefox does not allow BiDi viewport overrides on its privileged extension pages.
  // A same-origin extension frame supplies a true narrow viewport for the built report.
  const reportUrl = await driver.command('/url');
  const responsiveTab = await driver.command('/window/new', { type: 'tab' });
  await driver.switchTab(responsiveTab.handle);
  await driver.goto(new URL('popup.html', reportUrl).href);
  await until(() => driver.script("return Boolean(document.querySelector('.popup-shell'))"), 'responsive test wrapper');
  const frame = await driver.script(`
    const frame = document.createElement('iframe');
    frame.src = arguments[0];
    frame.style.cssText = 'display:block;width:390px;height:800px;border:0';
    document.body.replaceChildren(frame);
    return frame;
  `, [reportUrl]);
  await driver.command('/frame', { id: frame });
  await until(() => driver.script("return Boolean(document.querySelector('.toolbar select'))"), 'framed report');
  assert.equal(await driver.script('return innerWidth'), 390, 'responsive test uses a mobile-width viewport');
  for (const locale of locales) {
    await driver.script(`
      const select = document.querySelector('.toolbar select');
      select.value = arguments[0];
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `, [locale]);
    await until(() => driver.script('return document.documentElement.lang === arguments[0]', [locale]), locale + ' locale');
    assert.equal(await driver.script('return document.documentElement.scrollWidth <= innerWidth'), true, locale);
    assert.equal(await driver.script('return document.documentElement.dir'), locale === 'ar' ? 'rtl' : 'ltr');
    const overflowing = await driver.script(`
      return [...document.querySelectorAll('.toolbar button, .page-heading button, .scan-actions button, .filters button')]
        .filter(button => button.getClientRects().length && button.scrollWidth > button.clientWidth + 1)
        .map(button => button.textContent.trim());
    `);
    assert.deepEqual(overflowing, [], locale + ' button labels fit');
    if (locale === 'ar' && process.env.FIREFOX_SMOKE_SCREENSHOTS) {
      await driver.command('/frame', { id: null });
      await saveScreenshot(driver, process.env.FIREFOX_SMOKE_SCREENSHOTS, 'firefox-report-rtl.png', frame);
      await driver.command('/frame', { id: frame });
    }
  }
  await driver.script(`
    const select = document.querySelector('.toolbar select');
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  await until(() => driver.script("return document.documentElement.lang === 'en'"), 'English locale');
  await driver.command('/frame', { id: null });
  await driver.command('/window', undefined, 'DELETE');
  await driver.switchTab(report);
  console.log('PASS Firefox: filtered table, actual CSV file, report reload, 20 locales at 390px and Arabic RTL');

  const slow = await openReport(driver, source, base + '/stop.html');
  await phase(driver, 'Scanning links');
  await driver.click('button', 'Stop');
  await phase(driver, 'Scan stopped');
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/delay/5'), false);
  await driver.click('button', 'Scan');
  await phase(driver, 'Scanning links');
  await until(async () => (await rowInfo(driver, base + '/targets/ok'))?.code === '200', 'persisted completed row');
  await driver.command('/refresh', {});
  await phase(driver, 'Scan interrupted');
  assert.equal((await rowInfo(driver, base + '/targets/ok')).code, '200');
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/delay/5'), false);
  await driver.switchTab(slow);
  console.log('PASS Firefox: cancellation and recovery after reload');

  await setupBookmarks(driver, base);
  await openReport(driver, source, base + '/', 'bookmarks');
  assert.equal(await driver.script("return browser.permissions.contains({permissions:['bookmarks']})"), false);
  await driver.click('button', 'Scan bookmarks');
  await respondToPermission(driver, false);
  await until(() => driver.script(`
    return [...document.querySelectorAll('[role="alert"]')].some(el => /bookmark access was declined/i.test(el.textContent));
  `), 'bookmark permission refusal message');
  assert.equal(await driver.script("return browser.permissions.contains({permissions:['bookmarks']})"), false);
  await driver.click('button', 'Scan bookmarks');
  await respondToPermission(driver, true);
  await phase(driver, 'Scan complete');
  assert.equal(await driver.script("return browser.permissions.contains({permissions:['bookmarks']})"), true);
  assert.equal(await driver.script("return document.querySelectorAll('tbody tr').length"), 2);
  assert.equal((await rowInfo(driver, base + '/targets/ok')).category, 'Not checked');
  await driver.click('button', 'Allow access');
  await respondToPermission(driver, true);
  await until(async () => (await rowInfo(driver, base + '/targets/ok'))?.code === '200', 'bookmark results');
  await phase(driver, 'Scan complete');
  assert.equal(await driver.script("return browser.permissions.contains({data_collection:['bookmarksInfo']})"), true);
  assert.equal((await rowInfo(driver, base + '/targets/ok')).code, '200');
  assert.equal((await rowInfo(driver, missingUrl)).code, '404');
  assert.equal((await rowInfo(driver, missingUrl)).source, 'Bookmarks');
  console.log('PASS Firefox: native optional Bookmarks API grant, library read, deduplication and bookmark checks');

  const alias = 'http://' + dnsHost + ':' + fixture.address().port;
  await openReport(driver, source, alias + '/dns.html');
  await phase(driver, 'Scan complete');
  await driver.click('button', 'Allow access');
  await respondToPermission(driver, true);
  const aliasUrl = alias + '/targets/dns-guard';
  await until(async () => {
    const row = await rowInfo(driver, aliasUrl);
    return row?.category === 'Not checked' && /public|private|local/i.test(row.text);
  }, 'blocked DNS alias');
  assert.equal(requests.some(({ pathname }) => pathname === '/targets/dns-guard'), false);
  console.log('PASS Firefox: hostname resolving to loopback blocked before HTTP');

  if (process.env.FIREFOX_SMOKE_PUBLIC === '1') {
    await openReport(driver, source, 'https://example.org/');
    await phase(driver, 'Scan complete');
    const rows = await driver.script("return document.querySelectorAll('tbody tr').length");
    assert.ok(rows > 0, 'the live source has links');
    await driver.click('button', 'Allow access');
    await respondToPermission(driver, true);
    await until(() => driver.script(`
      return [...document.querySelectorAll('tbody .http-code')].map(cell => cell.textContent.trim())
        .filter(code => /^\\d{3}$/.test(code)).join(',') || false;
    `), 'HTTP response from real website', 15_000);
    const statuses = await driver.script("return [...document.querySelectorAll('tbody .http-code')].map(cell => cell.textContent.trim())");
    console.log('PASS Firefox: live https://example.org/ scan, ' + rows + ' links, HTTP ' + statuses.join(', '));
  }
  console.log('Browser: Mozilla Firefox ' + version);
} catch (error) {
  if (browser?.logs()) console.error(browser.logs());
  throw error;
} finally {
  await browser?.driver.close().catch(() => {});
  browser?.subprocess.kill();
  fixture.closeAllConnections();
  await new Promise((done) => fixture.close(done));
  await rm(downloads, { recursive: true, force: true });
}
