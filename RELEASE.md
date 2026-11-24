# Release guide for 1.0.0

Use [BUILD.md](BUILD.md) to reproduce the two store packages. Use the exact source archive matching the submitted Firefox package. The Edge manifest targets desktop Edge on Chromium 154 or newer. The Firefox manifest targets desktop Firefox 140 or newer for built-in data consent. Edge uses Chromium 154 as the baseline for enforcing the destination address space. See [RELEASE-QA.md](RELEASE-QA.md) for browser versions and the scenarios exercised.

The maintainer must confirm the rights-holder name for the [MIT license](LICENSE), the store publisher display name, and the public support and privacy addresses before publication. Use [PRIVACY.md](PRIVACY.md) as the source for the published policy. The release owner authorizes all uploads separately.

## Permission justifications

| Permission | Why it is requested |
| --- | --- |
| `activeTab` | Access the current page after the user invokes the extension without requesting access to every page at install time. |
| `scripting` | Extract links from the authorized main document and find and highlight an original link on request. |
| `storage` | Keep language, appearance, and the loopback fixture setting in local extension storage. Reports are kept separately in IndexedDB. |
| `webRequest` | Observe authorized check responses to recover redirect status and location when a manual redirect response is opaque. It does not modify requests. |
| `bookmarks` (optional) | Read bookmark addresses when the user explicitly chooses a bookmark scan. |
| Host patterns (optional) | Allow an extension page to check a specific HTTP or HTTPS host. The manifest permits both schemes as a declaration of what could be requested. The runtime request names the individual scheme and host. |
| `dns` (Firefox only) | Verify that addresses returned for a public-looking hostname are public before sending a check. Edge uses its native address-space check instead. |
| Firefox data consent (optional) | Enable the user-initiated request of URLs from pages or bookmarks directly to their destinations. The publisher receives no report, bookmark list, or telemetry. |

The local-test option grants no site permissions by itself. It permits designated loopback destinations after the user enables the option and grants the matching host. The app works from its popup and report tab. It does not request history, cookies, unrestricted tabs, downloads, or mandatory host access. CSV export uses a local download from a blob. Remote code, tracking, and developer servers are absent. DNS checks remain subject to browser and system network settings, so keep the private-network limitation in the listing and reviewer notes.

## Microsoft Edge Add-ons

1. Sign in to [Microsoft Partner Center](https://partner.microsoft.com/dashboard) and enroll in the Microsoft Edge extensions program. Microsoft lists no registration fee for this program. [Registration instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account)
2. Choose **Create a new extension** and upload `release/broken-link-inspector-1.0.0-edge.zip`. Check the package version and detected locales. Enter store languages accepted by Partner Center. Keep the rest available in the extension’s own language picker.
3. Under **Availability**, choose the intended markets and visibility. Under **Properties**, supply the category, publisher details and support link.
4. Under **Privacy**, describe the single purpose, enter the permission justifications above, disclose local processing and requests to the checked sites, and use the public policy URL. Select the remote code response that reflects the code shipped in this package. [Partner Center privacy fields](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#step-6-enter-privacy-information)
5. Fill out **Store listings** for the accepted locales using the [localized listing drafts](store-listings/README.md). Microsoft requires a long description of at least 250 characters and a square logo per listing. Upload the supplied `store-assets/icon-300.png` and one or more 1280 × 800 screenshots from the same folder. [Microsoft listing fields and image sizes](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#step-7-enter-store-listing-details-for-each-language)
6. Add certification notes from the reviewer checklist below. Review the final draft and click **Publish** when authorized. This sends the package to certification. [Microsoft submission instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#step-8-enter-certification-testing-notes-and-submit-the-extension)

## Firefox Add-ons (AMO)

1. Sign in with a Mozilla account at the [Add-ons Developer Hub](https://addons.mozilla.org/developers/) and choose **Submit a New Add-on**. Choose **On this site** for an AMO listing.
2. Upload `release/broken-link-inspector-1.0.0-firefox.xpi` as a desktop Firefox package. Validate the exact Gecko ID and minimum version in the submission. This XPI is unsigned. Firefox supports temporary installation for testing while AMO handles public signing. [Submission and signing](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
3. When prompted for sources, upload the matching source ZIP and use [BUILD.md](BUILD.md) to reproduce it. The package contains bundled code, so supply sources rather than relying on a link alone. [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
4. Enter the localized summary and long description, screenshot and support assets, MIT license, and the published privacy policy. Describe the direct transmission to checked sites and the optional website and bookmark URL consent in Firefox. [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) · [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
5. Add reviewer notes and submit the authorized version. Check AMO for the validator and reviewer outcome. Keep the same Gecko ID for future updates.

## GitHub

1. Review the tracked files. Include source, lockfile, tests, browser manifests, docs, localizations, listing assets, and CI. Exclude dependency folders, build caches, browser profiles, personal bookmarks, and local test artifacts.
2. Create the repository in the maintainer's GitHub account and upload the reviewed source only when authorized. Run the CI workflow before preparing a release. [Create a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
3. Draft a release tagged `v1.0.0`, copy the relevant changelog, and attach the Edge ZIP, source archive, and the corresponding SHA-256 digests. Label the Firefox build as unsigned and for temporary testing unless attaching a signed XPI. For public Firefox installation, link the approved AMO listing or obtain a signed self-distribution XPI. [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) · [Firefox self-distribution](https://extensionworkshop.com/documentation/publish/self-distribution/)

## Reviewer checklist

- Start a page scan from an ordinary HTTP or HTTPS tab, read the network notice and grant access to a specific destination. Verify a granted link and an unchecked link from a host whose grant was declined.
- Use the controlled fixtures in [BUILD.md](BUILD.md) to verify 404 and 410, 403 and 429, retry, cancellation, source highlighting, and CSV export. The loopback fixture setting is explicit and test-only.
- In a clean profile, add two fixture bookmarks and exercise the bookmark prompt. In Firefox, verify the independent data consent for the report source and verify its effect when declined.
- Verify user-visible rendering in the included languages with the long-label and Arabic checks. Check [translation review markers](LOCALIZATION.md) before treating each locale as editorially finalized.
- Record the real versions tested and any gaps. Store certification, AMO signing, and GitHub publication are separate from a successful local build.
