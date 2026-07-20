/**
 * MINDSPACE — Phase 5, the deliberation half (Manifesto §VI, §X).
 *
 * For a specific decision, Nova projects a temporary MindSpace Court from
 * the lattice: a bounded deliberative environment containing the relevant
 * facts (grounded, with status), minds (lattice nodes), memories (vault
 * hits), and constraints. The output is the 10-line decision shape — and
 * the shape is ENFORCED in code:
 *
 *   "A single generated answer is not a decision." — fewer than two genuinely
 *   distinct alternatives is a refusal, not a decision. The validator, not
 *   the model, holds that line.
 *
 * A valid deliberation persists as an immutable decision_card artifact and
 * issues an Intent in 'proposed' status. Nothing here executes anything.
 */

import { createLogger } from '@nova/telemetry';
import { generateChat } from './ai-router';
import { groundedStanding, formatClaims } from './grounding';
import { searchVault } from './vault';
import { loadIdentity } from './identity';
import { writeArtifact } from './substrate';
import { issueIntent } from './intents';
import { query } from '@nova/shared';

const logger = createLogger('mindspace');

export interface TenLineDecision {
  happening: string;          // 1. what is happening
  unknown: string;            // 2. what remains unknown
  alternatives: Array<{ move: string; consequence: string }>; // 3+4, >= 2 REAL ones
  choice: string;             // 5. the choice recommended
  why: string;                // 6. why
  authority: { mode: 'recommend' | 'assist' | 'automate'; boundary: string }; // 7 + 9
  proof: string;              // 8. what would prove the action occurred
  learn: string;              // 10. what should be learned afterward
  regime?: string;
}

/** The code-side law. Returns null when valid, else the reason it is not a
 *  decision. Never bypassed — the model's output passes through here or dies. */
export function validateDecisionShape(d: any): string | null {
  const req = ['happening', 'unknown', 'choice', 'why', 'proof', 'learn'];
  for (const k of req) {
    if (typeof d?.[k] !== 'string' || d[k].trim().length < 3) return `missing or empty '${k}'`;
  }
  if (!Array.isArray(d.alternatives) || d.alternatives.length < 2) {
    return 'fewer than two alternatives — a single generated answer is not a decision (§V)';
  }
  const moves = d.alternatives.map((a: any) => String(a?.move || '').trim().toLowerCase()).filter(Boolean);
  if (moves.length < 2 || new Set(moves).size < 2) {
    return 'alternatives are not genuinely distinct';
  }
  if (!d.authority || !['recommend', 'assist', 'automate'].includes(d.authority.mode)) {
    return 'authority.mode must be recommend | assist | automate';
  }
  if (typeof d.authority.boundary !== 'string' || d.authority.boundary.trim().length < 3) {
    return 'authority.boundary missing — a decision must state where authority ends';
  }
  return null;
}

/** Assemble the court: only what is relevant, each piece labeled by origin. */
async function assembleCourt(situation: string): Promise<string> {
  const parts: string[] = [];

  const claims = await groundedStanding().catch(() => []);
  if (claims.length) parts.push('GROUNDED FACTS (respect every status tag):\n' + formatClaims(claims));

  const terms = situation.split(/\s+/).filter(w => w.length > 4).slice(0, 4);
  const memories: string[] = [];
  for (const t of terms) {
    for (const hit of await searchVault(t, 2).catch(() => [])) {
      memories.push(`- vault:${hit.path} — ${hit.line}`);
    }
  }
  if (memories.length) parts.push('RELEVANT MEMORY (from the Vault):\n' + [...new Set(memories)].slice(0, 5).join('\n'));

  const nodes = await query<any>(
    `SELECT key, kind, label, state_json FROM lattice_nodes
     WHERE kind IN ('sector', 'constraint', 'project') ORDER BY updated_at DESC LIMIT 12`
  ).catch(() => ({ rows: [] as any[] }));
  if (nodes.rows.length) {
    parts.push('THE LATTICE (minds and forces in play):\n' +
      nodes.rows.map((n: any) => `- [${n.kind}] ${n.label}${n.state_json && Object.keys(n.state_json).length ? ' — ' + JSON.stringify(n.state_json) : ''}`).join('\n'));
  }

  return parts.join('\n\n');
}

export async function deliberate(situation: string): Promise<
  | { decision: TenLineDecision; cardRef: string | null; intentId: string | null; provider: string }
  | { refusal: string; reason: string }
> {
  const identity = await loadIdentity();
  const court = await assembleCourt(situation);

  const system = `${identity.text}

You are deliberating inside MindSpace — a bounded court assembled for one decision. Use ONLY the material below plus the situation; facts tagged MISSING stay missing.

${court}

Respond with ONLY a JSON object, no prose around it:
{
  "happening": "what is actually happening",
  "unknown": "what remains unknown",
  "alternatives": [ {"move": "...", "consequence": "..."}, {"move": "...", "consequence": "..."} ],
  "choice": "the recommended move",
  "why": "why this one",
  "authority": { "mode": "recommend", "boundary": "where authority ends — what this decision may NOT do" },
  "proof": "what evidence would prove the action occurred",
  "learn": "what should be learned after the outcome"
}
At least two genuinely distinct alternatives are REQUIRED. If the situation cannot support two real alternatives, say so in "unknown" and still list the honest options (including 'do nothing yet').`;

  const result = await generateChat({ system, user: situation.slice(0, 2000), maxTokens: 900, temperature: 0.4 });
  if (!result) {
    return { refusal: 'Unavailable. The light is not there yet.', reason: 'no provider can reason right now — MindSpace does not fabricate deliberation' };
  }

  let parsed: any = null;
  try {
    const jsonText = result.content.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
    parsed = JSON.parse(jsonText.slice(jsonText.indexOf('{'), jsonText.lastIndexOf('}') + 1));
  } catch {
    return { refusal: 'The deliberation did not take the shape of a decision.', reason: 'model output was not parseable JSON — refused rather than repaired into meaning' };
  }

  const invalid = validateDecisionShape(parsed);
  if (invalid) {
    logger.warn('Deliberation refused by shape validator', { invalid });
    return { refusal: 'That is not yet a decision.', reason: invalid };
  }

  const decision = parsed as TenLineDecision;

  // Persist: the immutable decision artifact, then the Intent (proposed).
  const cardRef = await writeArtifact({
    kind: 'decision_card',
    authorType: 'nova',
    authorId: 'mindspace',
    payload: { content: decision as unknown as Record<string, unknown>, situation: situation.slice(0, 500), shape: 'ten-line-v1' },
  });
  const intentId = await issueIntent({
    cardRef,
    what: decision.choice,
    why: decision.why,
    authorityMode: decision.authority.mode,
    authorityBoundary: decision.authority.boundary,
    completionEvidence: decision.proof,
    haltConditions: decision.unknown,
  });

  logger.info('MindSpace deliberation complete', { cardRef, intentId, provider: result.provider });
  return { decision, cardRef, intentId, provider: result.provider };
}
