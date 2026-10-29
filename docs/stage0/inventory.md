# Stage 0 inventory

Inspected 2026-10-29 on branch `codex/revenue-doorway-hardening` at `acb215c` (`Build Nova Enterprises textile sourcing website`). Nothing here was deployed, emailed, or submitted to the live form. The attached live-surface notes (DNS, FormSubmit, CI, branches) were rechecked where a public request could do it without a write.

## What is real vs stub

| Path | What it is | Live? |
|---|---|---|
| `nova-enterprises-site/` | Static HTML/CSS/JS site plus this change's Vercel functions. No monorepo runtime dependency. | Yes. This is the site Vercel is serving. |
| `apps/web` | Next.js app (public office, `/services/workflow-setup`, `/office/inquiries`). Large and real in the repo. | No. Not the current Vercel output. |
| `apps/admin` | Next.js admin UI. | No public host found. |
| `apps/extension` | Nova Lens MV3 extension (eBay / bid13 capture). Real extension, not a website. | Installed in a browser only. |
| `libs/*` | Shared TypeScript libraries (`shared`, `telemetry`, `eventing`, `bot-sdk`, `nexus-core`, `policy`, `agent-contracts`). | Libraries only. |
| `services/gateway`, `auth`, `orchestrator`, `eventbus`, `billing`, `tradebot`, `marketdata`, `nova-hub`, `socialbot`, `storebot`, `commercedata`, `scheduler`, `opsbot` | Node services built into `Dockerfile.prod` and started by `ecosystem.config.js` (PM2). `nova-hub` holds the legacy service-inquiry store. | Not called by the live site. Railway process status was not visible from here. |
| `services/api`, `services/core`, `services/bots` | Python FastAPI / domain lineage. Not in the PM2 set. | Not the live site. |
| `services/audit`, `services/cmdx` | Node packages with entrypoints. Not in `ecosystem.config.js`. | Not in the production container process list. |
| `infra/migrations/001`–`036` | Postgres schema for the historical platform, including `service_inquiries` (035, 036). | Not connected to the public form. |
| Deal Desk and Motion Atlas | Hosted outside this repo (`*.tabbyash.chatgpt.site`). | Separate products. 401 without their sign-in. |

`services/api` is a sizable FastAPI app, not an empty folder, but it is a second backend lineage. It does not own the public website.

## Which directory and branch Vercel deploys

**Project root:** `nova-enterprises-site`. **Output:** `public`. **Production branch recorded in** `nova-enterprises-site/README.md`: `codex/revenue-doorway-hardening`. **Project name recorded in that README and in** `docs/web/PUBLIC-OFFICE.md`: `nova-enterprises`. **Team recorded in** `docs/web/PUBLIC-OFFICE.md`: `wyatts-projects-84eea5ea`.

How this was checked, without the Vercel dashboard (no token in this environment):

1. `https://novanexus-ai.com/` returns `server: Vercel` and the security headers in `nova-enterprises-site/vercel.json` (`nosniff`, `strict-origin-when-cross-origin`, `DENY`). The repo-root `vercel.json` does not set those headers. It builds `apps/web` (`npx turbo run build --filter=@nova/web`).
2. The live homepage is 14,384 bytes and matches `nova-enterprises-site/public/index.html` byte for byte (compared 2026-10-29).
3. `GET /about` and `GET /services/workflow-setup` return **308** to `/#about` and `/#products`, which is `nova-enterprises-site/vercel.json`, not the Next.js workflow-setup page.
4. `GET /api/proxy/health` on the live host is 404. The static project has no such route.

Root `vercel.json` is the old Next.js project config. It is not what the live domain is running.

## Railway

`railway.toml` builds `Dockerfile.prod` (Node 20, esbuild bundles, PM2). Health check path `/health`, one replica, restart on failure. `ecosystem.config.js` starts gateway, auth, orchestrator, eventbus, billing, tradebot, marketdata, nova-hub, socialbot, storebot, commercedata, scheduler, and opsbot in one container.

Dated docs name `https://abackend-production.up.railway.app` as a past API URL. `https://api.novanexus-ai.com` is a Cloudflare tunnel error (1033), not a Railway app response. The live HTML and `script.js` do not reference Railway. Whether a Railway service is still billing cannot be seen without the Railway dashboard. Stage 1 does not call it.

## Data stores and migrations

| Store | Where | Role today |
|---|---|---|
| None on the public form | `nova-enterprises-site/public/index.html` posts to `https://formsubmit.co/wkirby592@gmail.com` | Email-only. A GET of formsubmit.co during this pass returned Cloudflare 403, not a saved record. No inquiry was submitted. |
| Postgres | `infra/migrations/*.sql`, `DATABASE_URL` | Intended store for the Node/Python platform and for `service_inquiries`. CI applies every file in order against a throwaway Postgres. |
| Redis | `docker-compose.yml`, CI service | Cache / transient. Not an authority for inquiries. |
| SQLite | Not an application database in this repo | Estate designs mention it. It is not the public intake store. |
| Extension storage | `apps/extension` | Browser-local Lens data. |

`035_service_inquiries.sql` and `036_general_business_inquiries.sql` add `service_inquiries` (receipts like the legacy pilot, Stripe fields, `request_key`, payload hash). The Next.js queue at `apps/web/src/app/office/inquiries/page.tsx` reads that table through the gateway. The live static site does not. New public intake uses migration `037_public_intake.sql` so the textile/services forms are not forced into the pilot payment table. See ADR-001.

## Committed secrets (paths only)

No `.pem`, `.env`, or cloud private-key files are tracked. These tracked paths contain a credential or a hardcoded fallback secret. Values are not repeated here.

- `.github/workflows/ci.yml`
- `docker-compose.yml`
- `docker-compose.mvp.yml`
- `docs/REALITY_MAP.md`
- `docs/runbooks/DATABASE.md`
- `infra/docker-compose.nova.yml`
- `scripts/bootstrap-env.js`
- `scripts/db-seed.js`
- `services/nova-hub/src/index.ts`
- `services/scheduler/src/index.ts`

Placeholder strings such as `sk_live_...` in docs and scripts are not live keys.
