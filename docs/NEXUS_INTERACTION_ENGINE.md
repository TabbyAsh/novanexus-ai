# Nexus Interaction Engine

Nexus is the company and interaction engine through which humans meet Nova.
Nova is the realization of AI potential: useful intelligence, tools, agents,
income engines, research, memory, and the capabilities created by composing
them.

This document describes the first executable Nexus contract. It does not claim
the entire convergence is complete.

## Canonical flow

```text
human intent
  -> authenticated Nexus interaction
  -> route or bounded capability composition
  -> Nova reasoning / tool execution
  -> evidence + gaps + cost + authority
  -> privacy-safe immutable receipt
  -> human outcome
  -> immutable outcome reference
```

The interaction identity is broader than a Decision Card. One interaction may
remain conversational, invoke a direct capability, compose multiple
capabilities, route to a structured decision surface, or expose a missing
capability for Forge.

## API contract

### `POST /v1/nexus/interact`

Authenticated request:

```json
{
  "message": "Compare current demand trends with flip opportunities and build me a plan",
  "conversationId": null
}
```

The response is a `NexusInteractionEnvelope` with:

- stable `interactionId` and `conversationId`;
- normalized intent and optional route;
- execution mode: `reasoning`, `direct`, or `composed`;
- capability IDs, evidence sources, gaps, and task cost;
- authority mode and an explicit external-side-effect statement;
- Nova's reply and provider;
- memory persistence truth and outcome-closure state;
- optional structured action data for the client.

General reasoning is never labeled as tool execution. Failed composition is
returned as a visible gap. Direct capabilities return their real evidence. The
current executor is bounded to six steps and only registered tools.

### `GET /v1/nexus/capabilities`

Returns the current capability manifest. `available`, `degraded`, `gated`, and
`reserved` are operational claims, not marketing labels. Every capability
states its sector, authority, entrypoint, side effects, and requirements.

### `GET /v1/nexus/potential`

Returns Nova's current potential frontier, derived from operational capability
states rather than marketing claims. It exposes current coverage, gated and
missing capability requirements, the wider AI horizon, and the recursive
improvement invariants.

### Codex engineering specialist

`POST /v1/agents/codex/run` integrates the official server-side Codex SDK as a
platform-owner-only Forge specialist. It is disabled by default and requires an
explicit workspace plus API credential. Runs use a read-only sandbox, disabled
network, no approval escalation, and cannot activate or apply their own output.
Nova records only a content-redacted execution receipt. Implementation remains a
separate human-approved act.

### `GET /v1/nexus/interactions`

Returns the caller's privacy-safe receipt summaries, selected by a one-way
owner reference. Receipts include an opaque conversation reference so lifecycle
records remain linkable without exposing raw conversation IDs. Conversation
content is not stored in the unscoped artifact substrate.

### `POST /v1/nexus/interactions/:id/outcome`

Accepts exactly one caller-owned outcome:

```json
{
  "result": "worked"
}
```

The receipt row is locked while its outcome is created, so the first concurrent
outcome wins and contradictory labels cannot be written. Ownership mismatch returns not-found
rather than revealing another person's receipt. Nexus reports success only
after the authoritative, content-redacted outcome artifact is durable. Free-form
notes and monetary value remain rejected until the typed, tenant-owned outcome
ledger exists; estimates are never allowed to masquerade as realized capital.

### Compatibility

- `POST /v1/nova/chat` now passes through Nexus and returns legacy chat fields
  plus the canonical receipt under `data.nexus`.
- `/dashboard/nova` remains the route path during migration but renders the
  Nexus interaction surface.
- `/nexus` redirects to that authenticated surface.
- `/dashboard/nexus` remains a compatibility path for the legacy Market
  Decision Center and is no longer presented as the whole Nexus.

## Authority and safety

- Nexus conversation capabilities currently observe or recommend. They perform
  no external side effects.
- World watcher and notification commands require a separate explicit
  confirmation before persistence.
- Public World email subscription is reserved until recipient verification and
  double opt-in exist; an address supplied in a hail is not stored.
- Gateway scopes are method-aware and enforced by longest-prefix match, so a
  read scope cannot authorize a mutation.
- Tenant organization ownership never grants platform control. Forge approval,
  prompt promotion, Ops, global proposals, and the kill switch require a
  separately configured platform-owner identity.
- State-changing automation fails closed when kill-switch authority cannot be
  verified. Scheduled agents, Forge, evaluation improvement, exploration,
  auditing, prediction resolution, memory seeding, and cache warming all
  consult this authority boundary; health monitoring stays available.
- Benchmark-winning agent prompts become inactive candidates. A human with
  `forge.approve` must approve a promotion record before activation.
- Recursive improvement means a bounded evidence cycle: observe outcomes,
  identify a falsifiable gap, propose, sandbox, evaluate against an incumbent,
  request human promotion, monitor, and retire or roll back. Generation alone
  is never accepted as proof of improvement.
- Estimated opportunities and assumed time savings do not become realized
  profit.

## Memory boundary

The existing `artifacts` table has no enforced tenant/org ownership. Until a
protected migration and access-context API establish that boundary:

- Nexus stores content-redacted receipt metadata only;
- public Decision Card artifacts store pointers rather than raw situations;
- global prior-situation retrieval returns no personal contexts;
- executor substrate search is marked degraded and returns no records;
- Explorer does not sample arbitrary artifacts.

PostgreSQL conversation rows and owned intake-card rows remain the durable
sources for raw user content. Legacy unscoped artifacts require quarantine or
classification before they can participate in retrieval.

The authenticated Nexus surface restores the caller's latest owned conversation
after reload. Composition planning receives that owned recent context, allowing
follow-up intent without sampling any other person's memory.

## Next convergence

1. Add tenant/org ownership, visibility, classification, and retention to the
   substrate through the protected migration process.
2. Replace the hardcoded registries with one versioned capability kernel using
   typed input/output/effect contracts.
3. Compile validated capability DAGs with per-node policy decisions,
   idempotency, retries, compensation, and receipts.
4. Adapt World, Decision Cards, missions, Forge, and sector clients to the same
   interaction identity.
5. Condition future reasoning only on owned/shared, resolved, relevant
   outcomes; expose when calibration was actually applied.
6. Separate verified company revenue from user opportunity estimates, then let
   human-approved allocation fund R&D and new capability acquisition.
