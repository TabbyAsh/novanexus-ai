# Nova / Nexus Operating Model

> Canonical ontology, product model, and engineering contract. Updated 2026-07-11.

## North star

**Nova is the realization of AI potential.** She is the cumulative, extensible
composition of useful intelligence, tools, agents, income engines, research,
memory, and the new capabilities they make possible together.

**Nexus is the company and interaction engine through which humans meet Nova.**
Nexus captures intent, identity, context, constraints, and authority; makes
Nova's capabilities accessible and understandable; preserves what happened;
and returns reality's outcomes so Nova can improve.

Market, Bazaar, Social, Forge, World, Ops, Research, and future sectors are
manifestations of Nova through Nexus. They are neither separate empires nor
the definition of Nova. Humans remain the source of purpose and authority.

```text
Human purpose + authority
          ⇅
NEXUS — identity · intent · interaction · policy · explanation · company
          ⇅
NOVA — intelligence · tools · agents · income · R&D · memory · composition
          ⇅
Executed reality — actions · products · research · revenue · outcomes
          └──────────────── feedback and capital ────────────────┘
```

Nova is succeeding when potential becomes cumulative reality. Nexus is
succeeding when a person can understand and govern the whole passage: what was
intended, which capabilities were used, what evidence supports the result,
what authority was granted, what remains missing, and what reality taught.

## The Nexus interaction spine

```text
identity -> intent -> evidence -> capability graph -> policy -> commitment
    -> execution -> receipt -> outcome -> calibration -> capability/capital allocation
         ^                                                         |
         +---------------- governed, tenant-scoped memory ----------+
```

Every Nexus surface should participate in this lifecycle:

1. **Identity** — establish the human, organization, visitor, or delegated agent
   whose authority and memory govern the interaction.
2. **Intent** — capture the actual situation and desired change in reality.
3. **Evidence** — attach market data, sold comps, business context, prior
   outcomes, and known constraints.
4. **Capability graph** — compose compatible Nova capabilities; expose missing
   capabilities rather than inventing them.
5. **Regime** — distinguish exploitation (known terrain, fast feedback) from
   exploration (uncertain terrain, learning is the initial return).
6. **Decision** — produce options, assumptions, confidence, risks, and a
   specific next move.
7. **Policy and commitment** — show effects and limits; record what the human
   approved. Advice alone is not action.
8. **Execution** — act only inside the granted authority and policy envelope.
9. **Receipt** — make tools, evidence, cost, gaps, side effects, and memory
   inspectable for this interaction.
10. **Outcome** — record what happened, including qualitative notes and value.
11. **Calibration** — compare expectation with reality and feed the result into
   future decisions, evaluations, and training data.
12. **Allocation** — direct attention, R&D effort, and verified company capital
   toward capabilities that create real value.

The Nexus conversation is the general front door. Decision Cards remain a
strong structured spearpoint inside the spine; they are not the definition of
Nova or of every interaction. The convergence target is one canonical
Interaction identity that can reference optional decisions, executions,
artifacts, outcomes, proposals, missions, and capability versions.

## Operating laws

- **Nothing fake renders.** Unavailable data or capabilities are labeled as
  unavailable; they do not return invented values or proxy to an empty port.
- **An outcome write is the truth boundary.** The UI never claims Nova learned
  until durable storage confirms it.
- **Human memory is never a global corpus by default.** Personal context is
  tenant-scoped, classified, and access-controlled before retrieval. Legacy
  unscoped artifacts are not injected into user prompts.
- **Records outlive scores.** Decisions, evidence, corrections, and outcomes
  are immutable artifacts; derived scores may be recomputed.
- **Autonomy is permissioned.** Recommend is the default. Assist requires
  confirmation. Automate requires explicit policy, gates, limits, and a kill
  switch.
- **The human teaches.** Accept/reject reasons and real-world outcomes are
  training labels, not discarded clicks.
- **External minds are optional accelerators.** Deterministic workflows and
  local inference form the sovereignty floor; hosted providers fail over and
  must never fabricate on quota failure.
- **Production truth is executable.** A service advertised by the Gateway must
  be built and started, or fail explicitly as a reserved capability.
- **Human-owned governance stays human-owned.** `nova.constraints.yaml`,
  policy, CmdX, agent contracts, protected migrations, and production workflow
  changes follow the approval rules in `nova.constraints.yaml`.
- **Estimated value is not realized value.** Opportunities, assumed time saved,
  paper gains, and projections never become profit or company capital until
  evidence closes the outcome.

## Sectors

| Sector | Operator job | Current engines | Loop output |
|---|---|---|---|
| **Market** | Find and manage asymmetric opportunities | MarketData, TradeBot, screener, simulator, paper broker | thesis/card -> paper action -> P&L/outcome |
| **Bazaar** | Buy, price, and sell from real demand | CommerceData, StoreBot, Nova Lens, Flip Card | comps -> max buy/verdict -> sale outcome |
| **Social** | Turn insight into distribution | SocialBot, content engine, scheduler | draft -> approval/post -> performance signal |
| **Forge** | Improve Nova without surrendering control | Forge agents, RepoGraph, CmdX, evals, proposal review | proposal -> human decision -> eval/promotion |
| **World** | Make Nova legible through a spatial Nexus surface | World, missions, Candle, founder surfaces | state -> mission -> artifact/outcome |
| **Ops** | Keep the machine observable, affordable, and reversible | OpsBot, Scheduler, Gateway health, event/audit data | anomaly -> intervention -> recovery evidence |
| **Research** | Expand skills and propose high-ROI upgrades | Reserved port and contracts only | Not a production capability yet |

ResearchBot remains deliberately unavailable until it can produce sourced
knowledge artifacts and governed proposals through this same lifecycle. A
minimal chatbot or an empty proxy does not satisfy the contract.

## Authority model

| Mode | Nova may | Human remains responsible for |
|---|---|---|
| **Recommend** | Read, analyze, rank, draft | Choosing and acting |
| **Assist** | Prepare a reversible action | Confirming the exact action |
| **Automate** | Execute inside explicit policy and limits | Granting/revoking authority and reviewing outcomes |

Live trading, external posting, production deployment, destructive operations,
secret changes, and governance changes are never inferred from the existence of
code. Their current authority comes from environment flags, policy, scopes,
approval state, and the global kill switch.

## Runtime shape

- **Canonical repository:** `TabbyAsh/novanexus-ai` (`master`).
- **Web:** Next.js in `apps/web`, deployed at `novanexus-ai.com` through Vercel.
- **Backend:** one Railway image built from `Dockerfile.prod`; PM2 starts the
  production service set described in `ecosystem.config.js`.
- **State:** PostgreSQL is the operational source of truth; Redis provides
  cache, rate limits, and coordination. The artifact substrate is append-only,
  but it does not yet enforce tenant ownership; raw interaction content and
  cross-user retrieval remain disabled until that boundary exists.
- **Intelligence:** the Nova Hub provider router selects local, Gemini, Groq,
  Grok, Claude, or OpenAI by task tier and live health, with deterministic
  product paths where a useful rules engine is possible.
- **Governance:** Gateway identity/scopes, policy, append-only artifacts/events,
  CmdX constraints, evaluation gates, and kill switches bound authority.

The repositories `TabbyAsh/Nova_Enterprises`, `TabbyAsh/NOVAGI`, and
`TabbyAsh/nova-dao-frontend` are legacy/placeholder projects, not alternate
sources of production truth.

## Definition of done

A Nova capability exposed through Nexus is done only when all of the following are true:

1. A real user action reaches a real service through the production route.
2. Required evidence is real, timestamped, and attributed.
3. Failure is explicit and useful; no mock success or optimistic learning claim.
4. State survives restart in the intended durable store.
5. The human can see and revoke the capability's authority.
6. The action emits the required audit/artifact/event record.
7. A real outcome can be attached to the originating decision.
8. Tests cover the success path, the unavailable path, and the authority edge.
9. Build, runtime, and routing manifests agree.
10. The deployed surface reports the correct build and passes a smoke check.

## Near-term convergence

1. Make `/v1/nexus/interact` the canonical ingress across conversation, World,
   Decision Cards, and future clients while preserving compatibility routes.
2. Add tenant/org ownership, visibility, data classification, and retention to
   the artifact substrate; quarantine legacy unscoped records before retrieval.
3. Replace hardcoded tool registries with one versioned, typed capability
   registry and a deterministic policy boundary around every execution.
4. Make the Railway service domain or a Railway custom domain the stable API
   edge; remove dependence on a workstation-hosted Cloudflare tunnel.
5. Converge parallel card, mission, proposal, and outcome identities into the
   canonical Interaction lifecycle without destroying historical records.
6. Put every production service behind the executable production contract and
   smoke suite.
7. Promote ResearchBot only after sourced retrieval, immutable citations,
   proposal governance, and outcome evaluation exist.
