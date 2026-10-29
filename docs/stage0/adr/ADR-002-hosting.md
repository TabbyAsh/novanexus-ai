# ADR-002: Hosting for Stage 1 intake

- **Status:** Accepted for Stage 1 (2026-10-29).
- **Choice:** Vercel serverless functions in the existing project, not Railway and not a new host.

## Context

`novanexus-ai.com` is already a Vercel deployment of `nova-enterprises-site` (see `docs/stage0/inventory.md`). Public intake has to answer when the owner's computer is off (brief §17). Railway is configured (`railway.toml`, `Dockerfile.prod`, PM2) for the old API and is not on the request path of the live site. `api.novanexus-ai.com` does not connect to an origin. A second host would be a second deploy, a second secret set, and a paid service. No new account is approved.

## Decision

1. Add Node serverless functions under `nova-enterprises-site/api/` in the **same** Vercel project that serves the static site (`outputDirectory`: `public`).
2. Do not deploy, restart, or point DNS at Railway for this stage. Do not add a domain, a project, or a paid Vercel/Neon/email account from this change.
3. A git push of a non-production branch may create a Vercel **preview**. Production promotion, `vercel --prod`, and merging to `master` are out of scope.
4. The functions stay short: validate, one transaction, optional notify, respond. Long-running workflows are not hosted here (ADR-003).
5. Install step for this project root becomes `npm ci --omit=dev` so the `pg` dependency exists. There is still no site build step. Static files stay in `public/`.

## Alternatives

- **Railway gateway in front of the form.** Rejected. The live hostname for that gateway is down, and Stage 1 traffic does not need the PM2 process list.
- **Next.js `apps/web` revived as the public app.** Rejected. It is hundreds of files away from what Vercel is publishing, and its smoke checks already fail against the static site.
- **A new Vercel project or a worker on the owner's PC.** Rejected. A new project splits the domain. A PC-only server drops inquiries when the machine sleeps.

## Consequences

- Vercel Hobby is documented by Vercel as non-commercial. Nova Enterprises LLC is a business. **Wyatt should confirm whether this project must move to Vercel Pro.** This change does not upgrade the plan.
- Serverless instances do not share memory. Rate limits are rows in Postgres, not an in-process counter.
- Cold starts on Neon and on the function are acceptable for a low-volume form. They are not a latency guarantee.
- Preview deployments have the code but persist nothing until `DATABASE_URL` is set on that Vercel environment. The form then returns a clear error and the address `wkirby592@gmail.com`.

## Validation

Preview checks are HTTP GETs and a POST against the preview URL only. Production is not promoted to prove this ADR.
