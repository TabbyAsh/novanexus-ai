# Nova / Nexus — System Status

> **Verified:** 2026-07-11
>
> **Canonical repository:** `TabbyAsh/novanexus-ai` (`master`)
>
> **Verified base commit:** `f00fba931d74ccc9624a56c2d006975b1a9ecafe`
>
> **Scope:** local code/build contracts, GitHub repository state, public Vercel
> surface, and read-only Railway status. No production mutation or deployment
> was performed.

## Executive truth

- The canonical ontology is now explicit in code and documentation: Nova is the
  realization of AI potential; Nexus is the company and interaction engine
  through which humans express intent, grant authority, access capabilities,
  understand evidence and gaps, and return outcomes.
- The local stack now has a canonical authenticated Nexus ingress,
  `/v1/nexus/interact`, a capability manifest, privacy-safe interaction
  receipts, caller-owned immutable outcome closure, conversation aliases, and a
  real Nexus dashboard surface. `/v1/nova/chat` remains a compatibility shim.
- The first composition path uses Nova Hub's bounded executor: multi-capability
  requests can plan up to six registered tool steps, return evidence/cost/gaps,
  and never disguise an unavailable capability as successful execution.
- `C:\Users\kibbl\nova-enterprises` is the active local checkout and
  `TabbyAsh/novanexus-ai` is the only substantive canonical GitHub repository.
  The similarly named `Nova_Enterprises`, `NOVAGI`, and `nova-dao-frontend`
  repositories are placeholders or legacy shells.
- `https://novanexus-ai.com` is live on Vercel and its compiled homepage points
  directly at `https://abackend-production.up.railway.app`.
- Railway project `novanexus-backend`, environment `production`, reports the
  `abackend` deployment as successful. Direct `/health` returned healthy on
  2026-07-10; `/v1/cards/calibration` and `/v1/cards/mine` returned valid empty
  states for a new read-only visitor probe.
- `https://api.novanexus-ai.com` is not a healthy API edge. It returned
  Cloudflare Tunnel error 1033 because the tunnel connector was unavailable.
  The web app currently avoids this failure by using the Railway service domain.
- The deployed `/version` reported commit `d37284d` (a March 2026 commit) for a
  July 2026 deployment. A stale manual `GIT_SHA` was overriding Railway's
  platform commit metadata. The local realization patch makes Railway metadata
  authoritative and reports its source; this remains pending deployment.
- The local production contract now requires 13 backend services to be both
  bundled by `Dockerfile.prod` and started by `ecosystem.config.js`. It also
  verifies the public Decision Card loop, four canonical Nexus Gateway routes,
  and rejects phantom Gateway targets.
- Paper trading contained a real runtime defect hidden by the esbuild-only
  production build: fee, slippage, price-resolution, and equity methods were
  attached to `ScannerEngine` while `PaperTradingSimulator` called them. The
  local patch moves the methods to their owning class, corrects Nexus regime
  access, and restores a green full-stack typecheck.
- Docker Desktop was not running during this audit. Cold boot, migrations,
  inter-service health, and the full Docker smoke suite remain unverified here.

## Interaction spine

Nexus brings human purpose into Nova through:

```text
identity -> intent -> evidence -> capability graph -> policy -> commitment
  -> execution -> receipt -> outcome -> calibration -> capability/capital allocation
```

The Decision Card public intake is now wired locally as a real return path:

- stable browser visitor identity;
- durable card ID;
- visitor/user ownership check on outcome writes;
- a returning track-record surface for unresolved cards;
- optional outcome note and realized value;
- honest success UI only after the server confirms the durable write;
- an immutable outcome artifact referencing the originating decision artifact;
- calibration over real resolved outcomes.

The deployed frontend predates this complete track-record UI and ownership
hardening. A deploy plus smoke test is required before calling the public loop
fully realized.

The artifact substrate still lacks enforced tenant/org ownership. The local
patch therefore redacts new interaction/card artifact content, disables global
prior-context retrieval and executor memory search, and removes arbitrary
artifact sampling from Explorer. A protected ownership migration and legacy
record quarantine remain required before personal memory retrieval is enabled.

## Production backend contract

Railway builds one image and PM2 runs the following local contract:

| Service | Port | Production role |
|---|---:|---|
| Gateway | 3000 | Public routing, auth, scopes, CORS, rate limits |
| Auth | 3001 | JWT, users, organizations, policy |
| Orchestrator | 3002 | Goals, tasks, bot registry, kill switch |
| EventBus | 3003 | Append-only event transport and verification |
| Billing | 3006 | Stripe and entitlements |
| TradeBot | 3010 | Trading tools and paper execution |
| StoreBot | 3011 | Commerce/listing workflows |
| SocialBot | 3012 | Content planning and social workflows |
| OpsBot | 3014 | Service health aggregation |
| MarketData | 3020 | Quotes, candles, market truth |
| CommerceData | 3022 | Commerce/sold-comps truth |
| Nova Hub | 3030 | Decision, AI, Bazaar, World, Forge-control logic |
| Scheduler | 3040 | Briefs, scheduled checks, delivery |

The web application is a separate Next.js deployment on Vercel.

`OpsBot` was bundled but omitted from PM2 in the verified base commit. The local
patch starts it and adds Scheduler to its health registry. Post-deploy health is
still required.

## Reserved and non-production capabilities

| Capability | Current truth |
|---|---|
| ResearchBot (3013) | Reserved design only; directory has no implementation. Gateway now reports explicit `501 RESEARCHBOT_NOT_IMPLEMENTED` locally instead of proxying to an empty port. |
| ForgeBot / Forge runner / RepoGraph / Forge eval services | Important control-plane work exists in the repository, but these are not part of the 13-service Railway runtime contract. |
| Audit / Notifier | Code exists but neither service is in the current Railway image/PM2 contract. Audit behavior also exists through shared events/artifacts and service-local routes; do not advertise standalone daemons as live. |
| Python `services/api`, `services/core`, `services/bots` | Experimental alternate implementation, not the canonical TypeScript production path. |
| Admin app | Buildable shell, not a separately verified public production surface. |

## Intelligence and authority

- Nova Hub routes across local, Gemini, Groq, Grok, Claude, and OpenAI providers
  by task tier and health. Deterministic Decision Card generation is the
  sovereignty floor; conversational surfaces halt honestly when no mind is
  available.
- Local configuration observed during this audit kept the global kill switch
  off, paper trading on, live trading off, automatic posting off, and automatic
  Forge execution off. These are an environment snapshot, not permanent policy.
- Authority must always be derived at runtime from scopes, policy, approvals,
  environment gates, and the kill switch. Presence of a code path is not
  permission to execute it.
- Gateway now enforces a method-aware route-scope map by longest-prefix match;
  read authority cannot authorize a mutation. Tenant owners do not receive
  platform Forge/Ops/admin authority unless their email is explicitly configured
  as a platform owner, and legacy refresh tokens are re-scoped on refresh.
- Autonomous agents, Forge/evaluation loops, exploration, auditing, prediction
  resolution, memory seeding, and cache warming fail closed when kill-switch
  authority cannot be read. Health monitoring remains available.
- World watcher creation requires explicit confirmation. Email notification
  enrollment is reserved until recipient verification and double opt-in exist,
  and public hail addresses are not stored.
- Nexus receipts and Forge proposals serialize human closure with row locks, so
  concurrent requests cannot create contradictory immutable outcomes.
- Benchmark-winning agent prompts are staged as inactive candidates; only a
  persisted human `forge.approve` promotion decision can activate them.
- Opportunity estimates and assumed time savings no longer count as realized
  profit. Financial summaries include only profit/flip-profit and losses.

## Verification state

| Gate | Result |
|---|---|
| Nova Hub interaction/governance tests | PASS — 99 tests across 14 suites |
| Auth platform-authority tests | PASS — 2 tests |
| Gateway method-authority tests | PASS — 3 tests |
| Nova Hub typecheck | PASS |
| Gateway build and typecheck | PASS |
| Production contract | PASS — 13 built/started services, 4 public card-loop routes, 4 Nexus route families, no phantom ResearchBot proxy |
| Full monorepo test | PASS — 28 Turbo tasks; no failing suite |
| Full monorepo build | PASS — 24/24 packages; 95 web routes; production contract runs first |
| Full monorepo lint | PASS — no errors; existing warnings remain |
| Full monorepo typecheck | PASS — 29/29 tasks, including TradeBot |
| Railway direct health | PASS |
| Public custom API domain | FAIL — Cloudflare 1033 |
| Docker cold boot and smoke | NOT RUN — Docker Engine unavailable |
| Production deployment of local patch | NOT PERFORMED |

## Known release gates

### P0 — stable public API edge

Point `api.novanexus-ai.com` at the Railway backend using a Railway custom domain
or another always-on edge. A workstation-hosted Cloudflare tunnel is not an
acceptable production dependency. Verify CORS, `/health`, `/version`, card
intake, and card outcome after the change.

### P0 — deploy and prove the closed loop

Deploy the local patch, create a test Decision Card through the browser, return
in a fresh session, mark an outcome, and confirm it appears in calibration and
as a linked substrate artifact. Then remove the test record through an approved
cleanup path if required.

### P1 — human-owned CI hardening

The current workflow tolerates migration failures and marks lint/tests
non-blocking. `nova.constraints.yaml` classifies `.github/workflows/**` as
human-owned, so this audit did not modify the workflow. A human-reviewed change
should make migrations fail on SQL errors, run `verify:production-contract`,
and make tests/lint blocking once the existing warning policy is agreed.

### P1 — Vercel project convergence

The checkout contains two local Vercel links: root project `nova-enterprises`
and nested `apps/web` project `web`. Choose one canonical project, move domain
and environment ownership there, and remove the stale link/config after a
verified deployment. The Vercel CLI was not authenticated during this audit, so
no remote project settings were changed.

### P2 — one Interaction identity

Nova currently has multiple decision/card/artifact models. Converge them
incrementally around one persistent Interaction identity so Bazaar evidence,
missions, proposals, actions, outcomes, and cockpit aggregates refer to the
same lifecycle without deleting historical records.

## Operator commands

```bash
npm run verify:production-contract
npm test
npm run lint
npm run build
npm run typecheck
```

For a live release, also run the approved production verification and smoke
commands from `docs/RUNBOOK.md`; do not treat a successful compile as a
successful deployment.
