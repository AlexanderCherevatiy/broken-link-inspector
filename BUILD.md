# Build and test

Use Node.js 24 and npm 11. Packaging also requires the system `zip` command. The source archive includes `package-lock.json` so `npm ci` installs the locked dependencies. Build from the directory containing `package.json`.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

| Output | Use |
| --- | --- |
| `dist/edge/` | Unpacked Edge Manifest V3 build |
| `dist/firefox/` | Unpacked Firefox Manifest V3 build |
| `release/broken-link-inspector-1.0.0-edge.zip` | Partner Center upload |
| `release/broken-link-inspector-1.0.0-firefox.xpi` | Unsigned Firefox development and AMO upload package |
| `release/broken-link-inspector-1.0.0-source.zip` | Readable source for GitHub and matching AMO review |

Both browser archives contain `manifest.json` at the root. The packaging command writes their SHA-256 digests to `release/SHA256SUMS.txt`. Firefox AMO review also requires the matching readable source archive with these build instructions. The publisher should keep the exact source revision and lockfile used for each binary. [Firefox source submission guidelines](https://extensionworkshop.com/documentation/publish/source-code-submission/)

The build uses shared TypeScript, React and local message catalogs. A build target selects the applicable browser manifest and browser-specific behavior. The Firefox package identifies the add-on and declares the browser's built-in data consent categories. The Edge package declares a minimum Chromium version. Checks live in the report tab and the manifests require no background page or service worker.

## Controlled test pages

Run `npm run fixtures`, then visit `http://127.0.0.1:4173/` in a browser with the matching extension loaded. In the report, turn on **Allow local test links** and grant only the fixture host. The default page covers successful requests, missing resources, redirects, uncertain responses, a timeout and a private-address link. The page at `/stop.html` exercises cancellation and reopening a report. The page at `/permissions.html` exercises optional host grants.

For release verification, use a fresh browser profile with no personal bookmarks. Add one working fixture URL and one broken fixture URL as bookmarks. Use the popup to scan them and check read permission and site permission separately. In a page scan, select a 404 row to verify retry and highlighting, then verify CSV includes the original source. Also try a public website after granting only the intended host, and record any behavior specific to that site or browser.

## Browser checks

The Chromium E2E harness needs a DevTools build supporting `Extensions.getExtensions` and `Extensions.triggerAction`. Install Chromium for Testing or point the harness to a compatible Edge executable.

```bash
npx playwright install chromium
npm run test:browser
```

```bash
SMOKE_BROWSER_PATH=/path/to/edge \
SMOKE_EXTENSIONS_URL=edge://extensions/ \
SMOKE_HEADFUL=1 SMOKE_PUBLIC=1 \
npm run test:browser
```

The headful Edge run exercises the native bookmarks grant. Run `npm run test:locales-browser` for all 20 popup and report layouts.

Run the Firefox E2E harness with current versions of Firefox and geckodriver available locally. It uses a disposable profile.

```bash
GECKODRIVER=/path/to/geckodriver FIREFOX_BINARY=/path/to/firefox npm run test:firefox
```

Use the unpacked directories for manual confirmation of genuine platform permission dialogs and store build behavior. [Local Edge installation](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading) · [Temporary Firefox installation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing)

The GitHub Actions workflow installs locked dependencies and runs type checking, unit tests, production builds, and packaging. Browser QA uses the local profiles and fixtures described here.
