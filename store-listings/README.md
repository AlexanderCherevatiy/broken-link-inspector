# Store listing copy

`listings.json` contains a product name, localized short summary and long store description for every bundled language. The JSON keys use BCP 47 language tags. The corresponding WebExtension catalog folder is given in `catalog`. The store forms determine which listing languages are available. If a form does not offer a locale, keep it in the extension and record the missing listing language in the release notes.

- **Edge Add-ons** uses the localized manifest name and summary. Add the long description in the listing editor for each available language. The validator checks Microsoft’s 250–10,000 character range.
- **Firefox Add-ons** uses the localized short summary and long description in the AMO listing form. Start with English and add other languages offered by the form.

Review every draft with a human before submission. Put the maintainer’s future public privacy-policy URL in the store’s privacy field. [Microsoft submission guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) · [Mozilla submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
