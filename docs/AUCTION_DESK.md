# Nova Auction Desk

A review-only companion to the existing `/analyze` item appraiser. It does not create another Nova runtime or memory vault.

## What it implements

- Empty auction workspace; no simulated auctions, business activity, or profit.
- Source-linked item observations and low/mid/high gross resale scenarios.
- Complete explicit cost ledger. Blank means unknown; zero must be entered intentionally.
- Conditional low-case bid ceiling accounting for buyer premium, selected tax base, selling fees, operating costs, owner labor value, refundable deposit, cash limit and required economic profit.
- Versioned forecast snapshots with SHA-256 integrity checks and append-only actual outcome records.
- No new forecast for an auction with an already recorded outcome; one auction cannot inflate learning counts through multiple forecast revisions.
- Browser-local storage and JSON import/export; invalid imports are rejected without replacing the active ledger.
- Read-only deterministic CLI reports and a no-overwrite forecast-lock command for an existing authorized worker.

## Run locally

Node 20+ is required for the CLI. No new npm packages or paid API access are required.

```sh
node --test tests/auction-desk/core.test.mjs
python -m http.server 8765 --bind 127.0.0.1 --directory apps/web/public
```

Open `http://127.0.0.1:8765/tools/auction-desk/index.html`.
The added Next.js route is `/analyze/auction`.

```sh
node scripts/nova-auction.mjs report path/to/ledger.json
node scripts/nova-auction.mjs lock path/to/ledger.json path/to/NEW-ledger.json
node scripts/build-auction-desk-portable.mjs NEW-auction-desk.html
```

`report` emits JSON. Exit 0 means a complete conditional scenario (review or skip), NOT permission to bid; 1 means invalid invocation/file; 2 invalid calculation; 3 missing inputs. `lock` writes only a new file and refuses overwrite.

The browser tests require Python Playwright and Chromium:

```sh
python tests/auction-desk/browser.smoke.py
python tests/auction-desk/dom.smoke.py
```

The second command explicitly uses in-memory storage and a Python SHA-256 adapter. It cannot establish native persistence, browser cryptography, real navigation or full application integration.

## Assumptions and limits

All amounts are USD scenario inputs, not live fee or tax quotes. Percentage expenses round upward to cents. The largest whole-cent bid satisfying BOTH the low-case economic profit target and low-case cash reserve limit is displayed. An infeasible bid is different from a feasible zero-dollar bid.

Cash costs include acquisition, modeled selling costs and operating costs. Economic profit additionally subtracts owner labor value. The refundable deposit consumes cash but is assumed returned, so is not an expense. Cash reserve includes modeled low-case selling expenses but is not a timing-accurate cash-flow forecast; higher realized sales may incur higher selling fees.

The first version supports 200 items, quantities 1–1000, two decimal places, USD amounts and aggregate gross proceeds up to $1,000,000, and percentage inputs 0–100. Nonlinear fee tiers, other tax bases, financing, probabilistic sell-through and dynamic time-dependent costs are not modeled.

The existing item-appraisal JSON adapter preserves only explicitly sold, comparable, non-outlier HTTP(S) evidence references. Imported claims remain unverified. It does not call the appraisal API, scrape marketplaces or authenticate sources.

## Privacy and evidence

LocalStorage is unencrypted and tied to one browser profile/origin, not a secure multi-user database or NovaVault integration. Browser cleanup can erase it. Export backups; never store secrets or personal customer information here.

Checksums detect changed exports but do not establish truth, identity or trusted timestamps. An editor can regenerate a checksum. Forecast dates use the executing machine clock.

Lost/no-bid outcomes remain in the ledger; they are not zero-dollar sales. Only finalized wins with complete self-reported sales, costs and hours enter descriptive profit/error summaries. This selected sample is not unbiased out-of-sample model performance. No model has been trained.

## Verification status

Implementation and test code have been written. Test execution is pending for this staging revision; no passing test count or browser result is claimed here. Before deployment, run the slice tests, native browser test and full repository checks, and verify the route inside the actual Next.js app.

No production deployment, live provider call, auction scrape, bid, purchase, receipt of revenue, canonical-runtime modification or NovaVault access is part of this change.
