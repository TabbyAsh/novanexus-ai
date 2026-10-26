# Nova Lens 0.2.2 — appraise and watch

A refit of the existing Nova Lens extension in `TabbyAsh/novanexus-ai`. It reuses the exact Auction Desk cost/forecast engine rather than creating a new Nova runtime. This is a development build, not a published Chrome Store release.

## Install the prepared folder on a desktop PC

1. Extract `Nova-Lens-0.2.2.zip`.
2. In desktop Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `Nova-Lens` folder containing `manifest.json`.
3. Pin Nova Lens in the extensions menu. Refresh any already-open auction/listing tabs.
4. Click Lens → **Scan current page**. Open the Lens workspace to review evidence, comparisons, costs and watch settings.

These steps follow [Chrome's unpacked-extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). Native installation and permission behavior have not been verified in this build environment. This package targets desktop Chromium browsers; phone installation has not been validated.

When developing from the repository, first build the prepared folder:

```
node scripts/build-nova-lens-extension.mjs /absolute/path/to/NEW-Nova-Lens-folder
```

The builder copies Auction Desk's `core.mjs` into the extension as `auction-core.mjs`. Loading `apps/extension` directly without this build step is unsupported.

## What works in this slice

- **Read current pages:** eBay item pages, visible eBay sold-result rows, and supported US BID13 listings. Other product pages can be manually scanned from the toolbar when they expose Product JSON-LD. Unsupported fields stay unknown.
- **Appraise from evidence:** retain each comparable's item URL, title, displayed price, sale date, condition text, shipping, capture time and undisclosed-offer flag. A person confirms model, quantity, condition and sale-price comparability for the selected visible item. Asking prices do not establish value.
- **Watch changes:** capture a source, enable watching, and keep its tab visible for 5-second DOM observations. The site itself controls how quickly its page receives new data. Explicitly enabled BID13 background refresh targets 5 minutes while the browser runs. One global public request per minute, round-robin due sources, source crawl rules and browser suspension can make it slower. Source-rule discovery uses its own request; first listing refresh can occur on the next tick.
- **Inspect evidence:** view source photos and pickup/cleanout clauses; track bid, end time, deposit, title, photos and terms changes. Last-known closing windows produce local event records. They do not prove a sale occurred.
- **Decide with complete costs:** use the source's price/deposit in the existing Auction Desk engine; enter fees, tax base, transport, rental, disposal, storage, shipping, packaging, returns, cash cap and labor. Every cost can retain an operator-linked source or assumption note. Linked references are not automatically verified. Unknown costs block a numerical ceiling.
- **Preserve forecasts:** lock source snapshots, individual comp evidence and the cost scenario before outcomes; export an Auction Desk-compatible ledger. Use the existing Auction Desk to append actual resale outcomes. Later source changes invalidate the current Lens decision without rewriting old forecasts.

Use **Copy source brief for Nova** in the workspace to copy captured public facts and selected comp records into your assistant conversation. It excludes personal ceilings, watch settings and the private cost ledger. Copying is explicit; it does not automatically send data or start a model call.

## Evidence rules and limits

This build uses USD only. It requires at least three distinct, operator-matched sold items, with explicit sale dates within 90 days and captures checked within 7 days. These are conservative eligibility rules, not measured model accuracy. The displayed range is observed item-price minimum / median / maximum, excluding buyer shipping. It is not a probability interval, professional appraisal or guarantee of resale.

Auction cleanout logistics still need human verification. The extension does not know whether you have a suitable vehicle, rental reservation, help, storage space or a disposal destination. A unit's current bid is not its winning bid or resale value. Sealed boxes and unseen contents receive no inferred value.

No automatic all-marketplace collector, automatic model/condition recognition, unrestricted sold-data feed, API credentials, paid AI, NovaVault synchronization, unattended cloud worker, push-notification delivery, bidding, purchasing or resale execution is connected. The eBay adapter reads the rendered results you open; it does not fetch searches behind the page or send them to the old Railway appraiser. Broader auction providers need adapters and actual source-access verification before being labeled connected.

Workspace data is unencrypted local Chrome extension storage. Export backups. Normal updates retain the `nova:lens:v2` workspace, but uninstalling can erase it. Watch histories keep up to 200 changed snapshots per source, 300 sources, 1,000 comparable rows and 500 events. No financial or identity credentials belong in these records.

## Verification, October 26, 2026

- The original refit passed 59 checks. Patch 0.2.2 adds source-brief privacy and query-identifier regression checks; run the commands below for current results.
- DOM tests execute the source extractor and workspace flow with explicit extension/DOM adapters. They verify evidence qualification, unknown costs, source-rich locking and invalidation after changed terms. They do not prove native Chrome permissions, installation, background wake-up or visual layout.
- A real public M10 source check read its current bid, deposit, closing timestamp and pickup window; it did not appraise contents, bid or spend.
- Native Chromium integration/visual tests were not run: no browser executable was available and the browser download returned invalid archive data. A separate native test harness is retained in `tests/lens/browser.test.cjs` for an environment with Chromium.
- This source is preserved in the Nova website repository. See the pull request checks and production version endpoint for release status. Existing Windows/runtime/Vault integration remains unverified.

Run deterministic tests from the repo with Node 20+:

```
node --test tests/auction-desk/core.test.mjs tests/lens/core.test.cjs
```

DOM-adapter tests additionally need `linkedom@0.18.12`; point `NOVA_LENS_DOM_MODULE` at its installed module directory, then run `tests/lens/dom.test.cjs`. Native browser tests use Playwright and its Chromium executable. The application package itself has no npm or paid-service dependency.
