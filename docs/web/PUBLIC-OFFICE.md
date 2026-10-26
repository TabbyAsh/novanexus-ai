# Nova Enterprises public office

The public site at https://novanexus-ai.com introduces Nova Enterprises LLC and routes visitors to a small catalog, direct contact with Wyatt Kirby, and the appropriate workspace. Source starts from production commit ec005fe91bd4314092c1ce3bc43086df2e8223a0; unrelated private workspace records are not copied into this repository.

## Visitor paths

- `/products`: seven inspectable tools/services, individual detail pages, fixed service scopes and quote-based merchandise sourcing. No stocked merchandise or accepted supplier arrangement is asserted.
- `/tools/novaclean`: local CSV parsing, conservative cleaning, SKU/price exceptions and three spreadsheet-safe exports. Files are not uploaded. Original input remains unchanged. Limit: 1 MB / 5,000 data rows.
- `/tools/auction-desk/index.html`: public, manual evidence/cost worksheet from the existing tested Auction Desk. This is distinct from the owner's live finder; no public scraping or bidding is claimed.
- `/loop`: existing local Nova Loop retained.
- `/contact`: general request builder. It validates, reviews, copies/downloads or opens a prepared email to wyatt@novanexus-ai.com. It does not claim general requests are stored in the backend.
- `/services/workflow-setup`: existing durable inquiry intake and receipt retained with the exact service name and existing payment gates.
- `/start`: output-based onboarding.
- `/connections`: public health check plus explicit signed-in checks for account, market data, broker, AI readiness and billing. Checks do not generate AI output, enable trading, connect accounts or start subscriptions. Existing account settings manage permissions.
- `/office`: directory of public, account and owner workspaces. Atlas and Deal Desk retain their own access controls and data; navigation is not synchronization.

## Deployment

Retain the existing Vercel project `nova-enterprises`, custom domain, backend environment and Git connection. The source's existing BACKEND_URL resolution and same-origin proxy remain in place; no environment secret is introduced. The Vercel team is the existing `wyatts-projects-84eea5ea` team. Preview/testing and publication require the connected app's team access grant; no alternate personal project or DNS migration should be created to avoid that check.

The company name and business email are supplied by Wyatt. No active formation, EIN, merchant registration, licensing, revenue, supplier acceptance or customer testimonial is asserted. Scope acceptance and the proper contracting identity must be established before accepting paid work.

## Validation

- Existing web suites and new request validation/encoding tests.
- CSV regression checks for multiline values, leading zeros, duplicate conflicts, missing keys, ambiguous prices and spreadsheet formula neutralization.
- TypeScript / Next production build and the repository production-routing contract.
- Verify catalog links, a synthetic CSV export, the request review, mobile layout and the current connection check before release. Production inquiry submissions can send notifications; do not test with invented real contact details or send a test email without explicit instruction.

Rollback uses the previous known production deployment. Preserve private data and existing production environment variables.
