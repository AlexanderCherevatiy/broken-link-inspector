# Broken Link Inspector

Broken Link Inspector checks HTTP and HTTPS links on the current page or in your bookmarks. It shows what each destination returned, lets you retry selected failures, and exports a CSV report. It runs in a browser tab and is free to use.

[Русская версия](README.ru.md) · [Privacy](PRIVACY.md) · [Build from source](BUILD.md) · [Distribution](RELEASE.md)

## Try the extension locally

Use a development build from the matching browser directory. The manifests specify desktop Edge 154 or newer and Firefox 140 or newer. See the [release guide](RELEASE.md) for the distribution status of each package.

- **Microsoft Edge**. Open `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/edge`. [Edge development installation](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)
- **Mozilla Firefox**. Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the Firefox XPI or `dist/firefox/manifest.json`. Temporary installation lasts until Firefox restarts. Regular installation requires a signed extension. [Firefox development installation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing)

## Check links

1. Open a normal HTTP or HTTPS page and choose **Scan current page** from the extension popup. To check browser bookmarks, choose **Scan bookmarks** and grant read access when the browser asks.
2. Read the network notice in the report. A check contacts the link destination, which can see the requested URL and your IP address. Grant access to the listed hosts you want to check.
3. Inspect the results and their sources. Select failed or uncertain rows and choose **Retry selected** to recheck them. **Show on source page** scrolls to and highlights an available page link. Bookmarks have no source page.
4. Choose **Stop** to cancel active checks. **Export CSV** saves the report. Use report settings for language, theme, local fixtures, or clearing saved reports.

| Result | Meaning |
| --- | --- |
| Working | The destination returned HTTP 2xx. |
| Missing | The destination returned HTTP 404 or 410. |
| Redirect | The destination returned HTTP 3xx. The report shows its target when the browser exposes it. |
| Uncertain | An error or ambiguous response, including HTTP 403, 429, 5xx, a timeout, or a network failure. |
| Not checked | Access is missing, the address was skipped, or the check was pending or interrupted. |

## What to expect

- A page scan reads links from the main document at the time you start it. It covers up to 1,000 unique links. Embedded frames and shadow DOM are outside the scan scope.
- Scans run while the report tab is open, with up to three concurrent checks per report and an eight-second timeout per link. Interrupted reports keep completed results and can be checked again.
- The first redirect is reported. Its destination is left for you to open or check separately.
- Local network targets are excluded from normal checks. The local-test setting allows designated loopback targets for controlled fixtures.
- Reports and settings are stored in the browser. Exported CSV files stay wherever you save them. [Privacy details](PRIVACY.md)
- The interface offers 20 languages. Machine-assisted translations marked for review still need native-speaker review. [Contributing translations](CONTRIBUTING.md#translations)

## Build, test, and contribute

Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` from the project root. The [build guide](BUILD.md) covers browser testing and packaging. See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and reports.

The project uses the [MIT License](LICENSE). Bundled dependencies retain their [own notices](THIRD_PARTY_NOTICES.txt).
