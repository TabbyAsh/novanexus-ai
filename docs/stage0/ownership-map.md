# Ownership map

One row per live or recently-live feature. "Branch" is the git branch that holds the code, not a claim that every host is running it. Checked 2026-10-29.

| Feature | Repo path | Branch | Host | Data store |
|---|---|---|---|---|
| Public homepage, styles, menu, contact | `nova-enterprises-site/public/` | `codex/revenue-doorway-hardening` (deployed) | Vercel project `nova-enterprises`, team `wyatts-projects-84eea5ea`, domain `novanexus-ai.com` (apex DNS-only to Vercel; `www` Cloudflare-proxied) | None. Files only. |
| Old path redirects (`/about`, `/contact`, `/services/*`, `/pricing`, …) | `nova-enterprises-site/vercel.json` | same | Vercel | None |
| Quote form (until this change) | `nova-enterprises-site/public/index.html` form `#quote-form` | same | Browser posts to FormSubmit (`formsubmit.co`) | FormSubmit email to `wkirby592@gmail.com`, if that inbox was ever activated. No database. |
| Public intake (this change) | `nova-enterprises-site/api/`, `nova-enterprises-site/lib/intake/`, `infra/migrations/037_public_intake.sql` | preview branch off `codex/revenue-doorway-hardening` | Same Vercel project, serverless functions. Not production until an owner promotes it. | Postgres via `DATABASE_URL` (Neon, not created here). Table `public_inquiries`. |
| Owner queue and CSV | `nova-enterprises-site/api/owner/` | same preview branch | Same Vercel project, `/owner` and `/api/owner/*` | Same Postgres. Export is not a second store. |
| Legacy $150 workflow-setup offer | `apps/web` (`/services/workflow-setup`) | `codex/revenue-doorway-hardening` in git; **not** the live Vercel output | Previously this Vercel project when root `vercel.json` was active. Live URL now 308s to `/#products`. | `service_inquiries` through `services/nova-hub` if that process and its database are up. |
| Legacy owner inquiry screen | `apps/web/src/app/office/inquiries/page.tsx`, `apps/web/src/lib/service-inquiry-queue.server.ts` | same | Not served by the current static project (`/office` is 404 on the live host) | Gateway `GET /v1/admin/service-inquiries` |
| API hostname | DNS only. No route in the static project. | n/a | `api.novanexus-ai.com` returns Cloudflare 1033 (tunnel without an origin) | None |
| Railway backend | `railway.toml`, `Dockerfile.prod`, `ecosystem.config.js` | present on this branch and on `master` | Railway. Public hostname not discoverable. Historical docs cite `abackend-production.up.railway.app`. | Platform Postgres (`DATABASE_URL` on Railway), not the website form |
| CI | `.github/workflows/ci.yml` | `master` and `codex/revenue-doorway-hardening` | GitHub Actions | Throwaway Postgres and Redis services |
| Production smoke | `.github/workflows/deploy.yml` | **`master` is what the schedule runs.** This branch's copy is the corrected file. | GitHub Actions cron against `https://novanexus-ai.com` | None (HTTP reads) |
| Nova Lens | `apps/extension/` | repo | Visitor's browser | Extension local storage |
| Deal Desk / Motion Atlas | not in this repo | n/a | `nova-deal-desk-wyatt.tabbyash.chatgpt.site`, `nova-motion-atlas.tabbyash.chatgpt.site` | Their own (sign-in required) |

`master` (last recorded commit 2026-08-25 in the live-surface notes) is behind this branch and is not the site Vercel is publishing. Do not merge this work to `master` or promote a Vercel deployment as part of Stage 1 delivery.
