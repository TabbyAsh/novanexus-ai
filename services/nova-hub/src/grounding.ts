/**
 * GROUNDING AND REFUSAL — Phase 2 of the constitution (Manifesto §XXIII).
 *
 * Retrieval that distinguishes:
 *   known        — observed from a live source, fresh enough to act on
 *   inferred     — produced by a model/rule from real inputs, labeled as such
 *   uncertain    — real observation gone stale, or low-confidence source
 *   missing      — the source does not exist here; the shape is NOT filled in
 *   contradicted — two real sources disagree; both are surfaced, neither wins
 *
 * Every claim carries its source and age. Nova does not fill the shape of a
 * missing fact merely because fluent completion is possible.
 */

import { getWorldPulse } from './world';
import { healthSnapshot } from './providers';
import { vaultStatus } from './vault';

export type GroundStatus = 'known' | 'inferred' | 'uncertain' | 'missing' | 'contradicted';

export interface GroundedClaim {
  statement: string;
  status: GroundStatus;
  source: string;          // where this came from — a table, a feed, an env check
  observedAt?: string;     // when the underlying observation happened
  ageSeconds?: number;
  note?: string;           // why it has the status it has
}

const KNOWN_MAX_AGE_S = 10 * 60; // a market quote older than this is uncertain, not known

export function claimKnown(statement: string, source: string, observedAt?: Date): GroundedClaim {
  const at = observedAt || new Date();
  const age = Math.floor((Date.now() - at.getTime()) / 1000);
  if (age > KNOWN_MAX_AGE_S) {
    return { statement, status: 'uncertain', source, observedAt: at.toISOString(), ageSeconds: age,
      note: `observation is ${Math.floor(age / 60)}m old — treat as stale` };
  }
  return { statement, status: 'known', source, observedAt: at.toISOString(), ageSeconds: age };
}

export function claimInferred(statement: string, source: string, note: string): GroundedClaim {
  return { statement, status: 'inferred', source, note };
}

export function claimMissing(what: string, source: string, note: string): GroundedClaim {
  return { statement: `${what}: unavailable`, status: 'missing', source, note };
}

export function claimContradicted(statement: string, sourceA: string, sourceB: string, note: string): GroundedClaim {
  return { statement, status: 'contradicted', source: `${sourceA} vs ${sourceB}`, note };
}

/** One line per claim, status first — the exact text injected into prompts,
 *  so the model sees epistemic state, not bare assertions. */
export function formatClaims(claims: GroundedClaim[]): string {
  return claims.map(c => {
    const age = c.ageSeconds !== undefined
      ? c.ageSeconds < 90 ? `${c.ageSeconds}s` : `${Math.floor(c.ageSeconds / 60)}m`
      : null;
    const tag = [c.status.toUpperCase(), c.source, age].filter(Boolean).join(' · ');
    return `[${tag}] ${c.statement}${c.note ? ` (${c.note})` : ''}`;
  }).join('\n');
}

/** The grounded standing of the whole platform — every fact Nova may speak
 *  about herself, with its epistemic status attached. */
export async function groundedStanding(): Promise<GroundedClaim[]> {
  const claims: GroundedClaim[] = [];
  const pulse = await getWorldPulse().catch(() => null);

  if (!pulse) {
    claims.push(claimMissing('Platform state', 'nova-hub:pulse', 'the pulse could not be collected'));
    return claims;
  }

  const generatedAt = new Date(pulse.generatedAt);

  if (pulse.sectors.market) {
    const m = pulse.sectors.market;
    claims.push(claimKnown(
      `The Market: ${m.symbol} at $${m.price.toFixed(2)}, ${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}% (${m.session} session)`,
      'marketdata:quote', generatedAt
    ));
    claims.push(claimInferred(
      `Market session is '${m.session}'`, 'nova-hub:clock',
      'from the regular-session clock; holidays are not modeled'
    ));
  } else {
    claims.push(claimMissing('The Market feed', 'marketdata:quote', 'quote source dark from here'));
  }

  if (pulse.sectors.bazaar) {
    claims.push(claimKnown(
      `The Bazaar: ${pulse.sectors.bazaar.flipsTracked} items tracked, ${pulse.sectors.bazaar.appraised24h} appraised in 24h`,
      'db:flip_plans', generatedAt
    ));
  } else {
    claims.push(claimMissing('The Bazaar state', 'db:flip_plans', 'table unreachable'));
  }
  if (!process.env.EBAY_CLIENT_ID) {
    claims.push(claimMissing('Live eBay comps', 'env:EBAY_CLIENT_ID',
      'appraisals fall back to pasted comps and category models — category bands are inferred, never comps'));
  }

  if (pulse.sectors.forge) {
    claims.push(claimKnown(
      `The Forge: ${pulse.sectors.forge.cardsTotal} cards forged, ${pulse.sectors.forge.forged24h} in 24h`,
      'db:nova_cards', generatedAt
    ));
  }

  if (pulse.standing) {
    claims.push(claimKnown(
      `Standing: ${pulse.standing.users} operators, ${pulse.standing.agentRunsCompleted} agent runs completed` +
      (pulse.standing.artifacts ? `, ${pulse.standing.artifacts} artifacts on the substrate` : ''),
      'db:users+agent_runs', generatedAt
    ));
  } else {
    claims.push(claimMissing('Platform standing', 'db:users', 'counts unavailable — unknown is unknown, not zero'));
  }

  const mind = healthSnapshot();
  if (mind.capableOfLLM) {
    claims.push(claimKnown(
      `The mind: ${mind.sovereignty.band}, ${mind.sovereignty.score}% sovereign`,
      'providers:health', new Date()
    ));
  } else {
    claims.push(claimMissing('Generated reasoning', 'providers:health',
      'no provider can reason right now — deterministic paths only'));
  }

  const vault = await vaultStatus();
  claims.push(vault.mounted
    ? claimKnown(`The Vault: ${vault.entries} entries at rest`, 'vault:fs', new Date())
    : claimMissing('The Vault', 'env:VAULT_DIR', vault.note));

  return claims;
}
