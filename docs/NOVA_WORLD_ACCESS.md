# Nova private workspace

`/world` is the private entry. The public website remains a company catalog and reception. Public company details live in `apps/web/src/config/business.json`; `NEXT_PUBLIC_BUSINESS_EMAIL` can override the configured business mailbox. Personal owner names are not used as public page copy or account identity.

## Access

The existing Nova email/password service authenticates accounts. `/api/world/session` exchanges an existing access token for a Secure, HttpOnly, SameSite=Strict, 15-minute cookie. It accepts only same-origin mutations. Each private page and package download validates the cookie's opaque token with the configured backend `/v1/me`, requires an ACTIVE account and the platform `ops.admin` scope, and disables caching. Cookie presence, a decoded token, and a tenant OWNER role are insufficient.

The backend grants platform scopes through its existing `PLATFORM_OWNER_EMAILS` / `OWNER_EMAIL` configuration. This release does not invent a shared PIN, change that configuration, change account credentials, or grant a new account owner access. A missing or unavailable backend fails closed. A real owner sign-in must still be checked using the actual owner's account; synthetic tests cannot establish its configuration.

Private destinations are supplied by a server-only resource registry after verification. Set NOVA_PRIVATE_DESK_URL, NOVA_PRIVATE_ATLAS_URL and optionally NOVA_PRIVATE_ARCHIVES_JSON in private runtime configuration. No personal workspace URLs or Library identifiers are committed. A signed-in user may alternatively import a private links JSON file or configure browser-local workspace links in Tools. Desk and Atlas retain their own ChatGPT permissions; their data is not copied into the public website. Existing market and assistant tools retain backend/provider requirements. A navigation link does not prove a feed or AI provider is running.

## Working flow

- Focus: auction finder, pipeline, private Desk, Atlas, transport/training and the existing Nova assistant.
- Find: ten source entries spanning auctions, surplus, sold demand, procurement and filings. Each entry identifies automatic versus manual coverage. Keywords open explicit site web-search results, except eBay's direct sold-results query. Search results are not a live ingested feed.
- Notes: dated operator observations, demand evidence, costs/unknowns, deadlines and next verification. Notes are saved in this browser under the verified account ID. Export a backup. They are not synchronized to Desk or Atlas.
- Review with Nova: a short-lived, account-scoped per-tab handoff prepares an editable assistant draft. Source text is absent from the URL. Nothing is sent until the user sends the draft through the existing assistant.
- Tools: protected Lens ZIP, existing app routes, and original owner-protected Library archives for NovaAuction and Markets. Archived packages are not presented as verified live runtimes.
- `/world/lab`: preserves the previous spatial World behind the same server check.

## Lens source and package

The recovered extension refit is preserved in `apps/extension`, with `scripts/build-nova-lens-extension.mjs`, `scripts/nova-auction.mjs`, and tests under `tests/lens` and `tests/auction-desk`.

Patch 0.2.2 adds an explicit source-brief copy action that excludes personal ceilings, watch settings and the private cost ledger. Generic source URL normalization preserves query identifiers. The packaged cost engine is the existing Auction Desk engine, not a second calculation implementation.

Run `python scripts/package-nova-lens-download.py` after extension edits. It deterministically generates the server-only ZIP module used by the protected download route. No credentials or user records are packaged. Chrome installation still requires downloading, extracting and loading the unpacked folder locally; native permission/wake-up behavior has not been verified here.

## Verification

Build the web workspace, then run:

```
npm test --workspace @nova/web -- --runInBand
node --test tests/auction-desk/core.test.mjs tests/lens/core.test.cjs
python tests/world/access-http.py
```

The HTTP check starts the built Next server with an isolated synthetic authentication service. It verifies public privacy, locked page responses, forged-token and tenant-owner rejection, successful authorized rendering, cookie controls, protected archive contents/hash, lock behavior and absence of private resource destinations in client bundles. It never connects tests to production authentication. DOM adapter tests additionally use the explicitly configured linkedom path described in the extension README.
