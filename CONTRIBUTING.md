# Contributing

Use [BUILD.md](BUILD.md) to install dependencies and test a change locally. Keep changes focused. Include the browser and version, a short reproduction, and the verification commands in a pull request. Use fixture URLs or redacted examples in issues.

## Browser and privacy changes

Changes to permissions, outbound requests, storage, or supported locales should include a test and an update to any affected user-facing text. Review the [privacy policy](PRIVACY.md) and [release guide](RELEASE.md) against the behavior you change. Compare Edge and Firefox when a change touches an extension API.

Run the type check, unit tests, and both production builds before opening a pull request. For changes to permission prompts, page highlighting, bookmarks, or downloads, exercise the affected browser flows with a clean profile and the local fixtures.

## Translations

1. Use `_locales/en/messages.json` as the source catalog. A release locale needs its own `messages.json`.
2. Use a locale supported by both target manifests. Follow the existing directory aliases for regional locales. Keep the native language name and preserve every substitution and placeholder.
3. Add matching listing copy and leave the human review marker in place until a native speaker has reviewed the text in context.
4. Run `npm run check:locales` and `npm test`. Inspect the popup and report in both themes and at a narrow viewport. Include a long label and a permission or error message. For right-to-left languages, verify alignment, keyboard focus, and left-to-right URL and HTTP code rendering.
5. Note the language and any remaining wording issues in the pull request.

## Licensing

By contributing, you agree that your original contributions can be distributed under the project's [MIT License](LICENSE). Retain upstream notices and identify externally sourced assets or code. Release screenshots should use the test fixtures so they contain no personal information.
