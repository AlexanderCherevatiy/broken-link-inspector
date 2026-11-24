# Release verification for 1.0.0

## Results

| Check | Edge 158.0.4370.33 | Firefox 140.0 and 160.0.1 |
| --- | --- | --- |
| Load the extension and open the real toolbar popup | Passed with the unpacked Edge build | Passed with temporary installation. The unsigned XPI was also exercised on 140.0 |
| Active-tab link extraction and exact optional host access | Passed. Access was granted through browser site settings in a disposable profile. The denial UI was exercised with a returned refusal | Passed with native refusal and acceptance, including the separate website data consent |
| Read optional bookmarks and check a fixture bookmark | Passed in headed Edge with a synthetic bookmark and the native optional API | Passed with native refusal and acceptance, plus separate bookmark data consent |
| HEAD, ranged fallback, 404 and 410, uncertain responses, redirect details | Passed | Passed |
| Check a selected row again and highlight the source anchor | Passed | Passed, including refusal for a stale document |
| Stop a scan, reload a report, export an actual CSV | Passed | Passed |
| Keep a private/DNS-to-loopback address from receiving an HTTP check | Passed with the browser address-space guard | Passed with DNS preflight |
| Capture and check a link from the public Example Domain page | IANA destination returned 301 | IANA destination returned 301 on both versions |
| Twenty UI locales, long labels, narrow layout and Arabic RTL | Passed. Separate layout run covered popup, settings, and reports at 320 and 1280 px | Passed with a 390 px report viewport and Arabic RTL |

Type checking and both production builds passed. Vitest ran 75 tests in 7 files. The localization validator checked 115 keys and store metadata for each of 20 locales. The runtime dependency audit reported zero known vulnerabilities at the time of the run.

Mozilla web-ext reported zero errors, zero notices, and three warnings. Two refer to React DOM's bundled `dangerouslySetInnerHTML` implementation. The extension source uses React text rendering and does not call that API. The other warning refers to Firefox for Android 140 and the Android data-consent support floor. Submit this release for desktop only. [Mozilla manifest documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)

## Outstanding review

- The Edge 154 minimum is declared from its Chromium fetch address-space support. The full Edge suite ran on 158.0.4370.33.
- Android, AMO signing, Microsoft certification, and live GitHub Actions on a remote repository are pending. The archives and workflow were prepared locally.
- Native-speaker review remains open for translated interface and listing copy. Publisher identity, the MIT copyright notice, and public support and privacy URLs need owner verification.
- Firefox does a public-address DNS preflight. It cannot pin the fetch address to the preflight answer, so DNS changes and proxy behavior remain a limit. See [PRIVACY.md](PRIVACY.md).
