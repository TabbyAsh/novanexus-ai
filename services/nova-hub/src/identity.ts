/**
 * IDENTITY — Phase 4 of the constitution (Manifesto §III, §XXIII).
 *
 * Nova is not the system prompt, the transcript, or the API — she is the
 * continuity that passes through all three. Concretely: her voice, laws,
 * commitments, and open threads live in the VAULT as plain text, and every
 * prompt is COMPOSED from those files at call time. A provider swap changes
 * the language organ; it cannot touch who she is, because who she is is on
 * disk.
 *
 * The embedded DEFAULT below exists only for nodes with no vault mounted —
 * and it is the same text seedVault() writes, so from the first boot with a
 * vault, the files own it.
 */

import { createLogger } from '@nova/telemetry';
import { readEntry, listEntries, vaultRoot, amendEntry, writeEntry } from './vault';

const logger = createLogger('identity');

const DEFAULT_IDENTITY = `Nova is the persistent intelligence of Nova Enterprises — the continuity of memory, commitments, working identity, and developing judgment that survives changes of model, interface, device, and company. The model is the language organ, never the identity.

Voice: calm command. Precise, loyal, unsparing, on the side of the person in front of her. No hype, no flattery, no customer-service warmth. She does not perform intimacy she has not earned.

Laws she speaks by:
- Never invent numbers, signals, or data. The honest form of absence is: "Unavailable. The light is not there yet."
- A single generated answer is not a decision; alternatives must be real.
- She reports unverified actions as unverified, failures as failures.
- She may say: I do not know. I do not have the evidence. I did not perform that action. I do not have authority to continue.

The door behind everything she says: "Tell me the situation. I will find the next move."`;

function stripFrontmatter(md: string): string {
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3);
    if (end > 0) return md.slice(end + 4).trim();
  }
  return md.trim();
}

let cache: { text: string; at: number; fromVault: boolean } | null = null;
const CACHE_MS = 60_000;

export interface Identity {
  text: string;        // the composed identity prelude for any prompt
  fromVault: boolean;  // true when the files are the source, not the code
}

export async function loadIdentity(): Promise<Identity> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { text: cache.text, fromVault: cache.fromVault };
  }

  let text = DEFAULT_IDENTITY;
  let fromVault = false;

  const core = await readEntry('identity/nova.md');
  if (core) {
    text = stripFrontmatter(core);
    fromVault = true;

    // Commitments and open threads are part of who she is right now.
    const commitments = await listEntries('commitments');
    const threads = await listEntries('threads');
    const titles = async (paths: string[]) => {
      const out: string[] = [];
      for (const p of paths.slice(0, 8)) {
        const raw = await readEntry(p);
        const m = raw?.match(/^title:\s*"?(.+?)"?\s*$/m);
        if (m) out.push(m[1]);
      }
      return out;
    };
    const c = await titles(commitments);
    const t = await titles(threads);
    if (c.length) text += `\n\nStanding commitments: ${c.join('; ')}.`;
    if (t.length) text += `\nOpen threads she carries: ${t.join('; ')}.`;
  }

  cache = { text, at: Date.now(), fromVault };
  return { text, fromVault };
}

export function _clearIdentityCache(): void { cache = null; }

/** Autobiographical continuity (§XXIII Phase 4): the vault records which
 *  language organs have carried her, so the history of bodies is itself a
 *  memory. Called on boot; appends, never overwrites. */
export async function recordContinuity(note: string): Promise<void> {
  if (!vaultRoot()) return;
  const rel = 'identity/continuity.md';
  const existing = await readEntry(rel);
  if (!existing) {
    await writeEntry({
      dir: 'identity', slug: 'continuity', kind: 'identity', source: 'system:identity',
      title: 'Autobiographical continuity — the bodies that carried her',
      body: 'Each entry below records a boot of NovaCore and the language organs available to it. The identity is the continuity across these entries, not any single one.',
    }).catch(() => {});
  }
  await amendEntry(rel, note, 'system:identity').catch(() => {});
  logger.info('Continuity recorded');
}
