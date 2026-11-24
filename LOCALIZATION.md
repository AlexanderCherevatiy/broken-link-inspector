# Localization

Version 1.0 ships 20 UI languages. Listed translations and store copy are working drafts pending human linguistic review. Automated checks verify completeness and formatting. A native speaker should review terminology, tone, permission and privacy wording, and localized screenshots before submission.

| Languages | Review status |
| --- | --- |
| English and Russian | Existing translations and new v1.0 strings need human release review |
| Spanish, German, French, Brazilian Portuguese, Italian, Polish, Ukrainian, Turkish, Dutch | Human review needed |
| Japanese, Simplified Chinese, Traditional Chinese, Korean | Human review needed |
| Arabic, Hindi, Indonesian, Vietnamese, Thai | Human review needed |

## Add or review a language

1. Copy `_locales/en/messages.json` to `_locales/<locale>/messages.json`. Use WebExtension folder spelling, for example `pt_BR`, `zh_CN`, `zh_TW` or `id`. Both packages use the same catalog directories.
2. Translate each message. Leave the product name and technical identifiers intact. Give `localeName` the native name of the language. The runtime automatically adds catalogs to the language selector and uses BCP 47 tags in the interface.
3. Keep positional substitutions such as `$1` and `$2`. They may appear in a different order. Write `$$` for one literal dollar sign.
4. Add the language’s store copy to `store-listings/listings.json`. Keep its review status as `needs-human-review` until a human reviews that text.
5. Run `npm run check:locales` and `npm test`. After building the Edge package, run `node scripts/locales-browser.mjs` to detect clipped controls and document overflow and verify Arabic layout and URL direction. The script uses the bundled Playwright Chromium or the browser binary in `SMOKE_BROWSER_PATH`. Manually review errors, permission prompts, keyboard navigation, CSV headers and typography as part of the human review.

The runtime prefers exact, script, and base language matches. It maps Chinese locale variants to the available writing system, maps other Portuguese variants to the Brazilian catalog when needed, and otherwise falls back to English.

[Chromium locale identifiers](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales) · [Firefox localization rules](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization)
