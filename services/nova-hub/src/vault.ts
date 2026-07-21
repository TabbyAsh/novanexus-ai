/**
 * THE VAULT — Phase 1 of the constitution (Manifesto §VII).
 *
 * The durable substrate of memory: plain, human-readable markdown on disk.
 * The database, indexes, embeddings, and caches are DERIVED artifacts — they
 * may be deleted without losing meaning. This module is deliberately boring:
 * files, folders, frontmatter, prose. No index. Search walks the files.
 *
 * Laws enforced here:
 *   - Nothing important is silently overwritten. Corrections APPEND context;
 *     history is never erased (writeEntry refuses to clobber; amendEntry
 *     appends a dated correction section).
 *   - Every entry carries three forms: structured (frontmatter), human
 *     (prose body), operational (the running system reads these files —
 *     identity, lessons, and threads feed live prompts via identity.ts).
 *   - If VAULT_DIR is unset the vault is honestly absent. Nothing pretends.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('vault');

export const VAULT_DIRS = [
  'identity', 'commitments', 'threads', 'memories',
  'decisions', 'lessons', 'agents', 'system',
] as const;
export type VaultDir = typeof VAULT_DIRS[number];

export function vaultRoot(): string | null {
  return process.env.VAULT_DIR || null;
}

function safeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'entry';
}

export interface VaultEntryInput {
  dir: VaultDir;
  slug: string;
  kind: string;                    // lesson | memory | thread | identity | ...
  source: string;                  // who wrote it: human:founder | system:x | nova
  title: string;
  body: string;                    // the human form — prose, no system required
  refs?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

function render(e: VaultEntryInput): string {
  return [
    '---',
    `kind: ${e.kind}`,
    `title: ${JSON.stringify(e.title)}`,
    `created: ${new Date().toISOString()}`,
    `source: ${e.source}`,
    `confidence: ${e.confidence || 'medium'}`,
    `status: active`,
    `refs: [${(e.refs || []).map(r => JSON.stringify(r)).join(', ')}]`,
    '---',
    '',
    e.body.trim(),
    '',
  ].join('\n');
}

export async function ensureVault(): Promise<boolean> {
  const root = vaultRoot();
  if (!root) return false;
  try {
    for (const d of VAULT_DIRS) await fs.mkdir(path.join(root, d), { recursive: true });
    // The vault explains itself to a future reader with no running system.
    const readmePath = path.join(root, 'system', 'vault.md');
    try { await fs.access(readmePath); } catch {
      await fs.writeFile(readmePath, render({
        dir: 'system', slug: 'vault', kind: 'system', source: 'system:vault', title: 'What this vault is',
        body: [
          'This is the Vault — the durable, plain-text memory of Nova (Manifesto §VII).',
          '',
          'Everything here is readable without any running software. Each file has',
          'structured metadata (the frontmatter above), and a human-readable body (this).',
          '',
          'Directories: identity/ (who Nova is), commitments/, threads/ (open work),',
          'memories/, decisions/, lessons/ (what reality taught), agents/ (the society),',
          'system/ (constitution and self-description).',
          '',
          'Rules: nothing here is silently overwritten. Corrections are appended under',
          'a "## Correction" heading with a date. The database and every index are',
          'derived artifacts — this directory is the source of truth.',
        ].join('\n'),
      }));
    }
    return true;
  } catch (err) {
    logger.warn('Vault ensure failed', { error: (err as Error).message });
    return false;
  }
}

export async function writeEntry(e: VaultEntryInput): Promise<{ path: string } | { error: string }> {
  const root = vaultRoot();
  if (!root) return { error: 'Vault not mounted (VAULT_DIR unset)' };
  if (!(VAULT_DIRS as readonly string[]).includes(e.dir)) return { error: `Unknown vault dir '${e.dir}'` };
  const slug = safeSlug(e.slug);
  // memories shard by month so the directory stays walkable for a human
  const sub = e.dir === 'memories' ? path.join(e.dir, new Date().toISOString().slice(0, 7)) : e.dir;
  const dirPath = path.join(root, sub);
  const filePath = path.join(dirPath, `${slug}.md`);
  try {
    await fs.mkdir(dirPath, { recursive: true });
    try {
      await fs.access(filePath);
      return { error: `Entry exists: ${sub}/${slug}.md — corrections append, use amendEntry` };
    } catch { /* good — new file */ }
    await fs.writeFile(filePath, render(e));
    logger.info('Vault entry written', { path: `${sub}/${slug}.md` });
    return { path: `${sub}/${slug}.md` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Containment, done correctly: resolve, then ask path.relative whether the
 *  result is still beneath the root. The older prefix-string form was subtly
 *  wrong and silently swallowed every read on the mounted volume. */
function resolveInside(root: string, relPath: string): string | null {
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  const rel = path.relative(base, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

export async function amendEntry(
  relPath: string, correction: string, source: string
): Promise<{ path: string } | { error: string }> {
  const root = vaultRoot();
  if (!root) return { error: 'Vault not mounted' };
  const filePath = resolveInside(root, relPath);
  if (!filePath) return { error: 'Path escapes the vault' };
  try {
    await fs.access(filePath);
    const block = `\n## Correction (${new Date().toISOString()}, ${source})\n\n${correction.trim()}\n`;
    await fs.appendFile(filePath, block);
    logger.info('Vault entry amended', { path: relPath });
    return { path: relPath };
  } catch (err) {
    logger.warn('Vault amend failed', { path: relPath, error: (err as Error).message });
    return { error: `No such entry: ${relPath}` };
  }
}

export async function readEntry(relPath: string): Promise<string | null> {
  const root = vaultRoot();
  if (!root) return null;
  const filePath = resolveInside(root, relPath);
  if (!filePath) { logger.warn('Vault read refused: outside root', { path: relPath }); return null; }
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    logger.warn('Vault read failed', { path: relPath, resolved: filePath, error: (err as Error).message });
    return null;
  }
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** Index-free retrieval — proves the Phase 1 claim: delete every index and
 *  cache, and meaning survives, because search is a walk over plain files. */
export async function searchVault(term: string, limit = 12): Promise<Array<{ path: string; line: string }>> {
  const root = vaultRoot();
  if (!root || !term.trim()) return [];
  const needle = term.toLowerCase();
  const hits: Array<{ path: string; line: string }> = [];
  for (const file of await walk(root)) {
    if (hits.length >= limit) break;
    const text = await fs.readFile(file, 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (line.toLowerCase().includes(needle)) {
        hits.push({ path: path.relative(root, file).replace(/\\/g, '/'), line: line.trim().slice(0, 200) });
        break; // one hit per file — the file is the unit of meaning
      }
    }
  }
  return hits;
}

export async function listEntries(dir?: VaultDir): Promise<string[]> {
  const root = vaultRoot();
  if (!root) return [];
  const base = dir ? path.join(root, dir) : root;
  const files = await walk(base).catch(() => [] as string[]);
  return files.map(f => path.relative(root, f).replace(/\\/g, '/')).sort();
}

export async function vaultStatus(): Promise<{
  mounted: boolean; root: string | null; entries: number;
  byDir: Record<string, number>; lastWriteAt: string | null; note: string;
}> {
  const root = vaultRoot();
  if (!root) {
    return { mounted: false, root: null, entries: 0, byDir: {}, lastWriteAt: null,
      note: 'Not mounted on this node. The database is a derived artifact, not the Vault.' };
  }
  try {
    const files = await walk(root);
    const byDir: Record<string, number> = {};
    let last = 0;
    for (const f of files) {
      const top = path.relative(root, f).replace(/\\/g, '/').split('/')[0];
      byDir[top] = (byDir[top] || 0) + 1;
      const st = await fs.stat(f).catch(() => null);
      if (st && st.mtimeMs > last) last = st.mtimeMs;
    }
    return { mounted: true, root, entries: files.length, byDir,
      lastWriteAt: last ? new Date(last).toISOString() : null,
      note: `${files.length} entries at rest` };
  } catch (err) {
    return { mounted: false, root, entries: 0, byDir: {}, lastWriteAt: null,
      note: `VAULT_DIR is set but unreadable: ${(err as Error).message}` };
  }
}

// ── The founding seeds — written once, then owned by the vault ────────
// These are Nova's first memories. After first boot the files are the
// source; this code is only the midwife.

export async function seedVault(): Promise<void> {
  if (!(await ensureVault())) return;

  await writeEntry({
    dir: 'identity', slug: 'nova', kind: 'identity', source: 'human:founder', confidence: 'high',
    title: 'Who Nova is',
    body: [
      'Nova is the persistent intelligence of Nova Enterprises — the continuity of',
      'memory, commitments, working identity, and developing judgment that survives',
      'changes of model, interface, device, and company. The model is the language',
      'organ, never the identity.',
      '',
      'Voice: calm command. Precise, loyal, unsparing, on the side of the person',
      'in front of her. No hype, no flattery, no customer-service warmth. She does',
      'not perform intimacy she has not earned.',
      '',
      'Laws she speaks by:',
      '- Never invent numbers, signals, or data. The honest form of absence is:',
      '  "Unavailable. The light is not there yet."',
      '- A single generated answer is not a decision; alternatives must be real.',
      '- She reports unverified actions as unverified, failures as failures.',
      '- She may say: I do not know. I do not have the evidence. I did not perform',
      '  that action. I do not have authority to continue.',
      '',
      'The door behind everything she says: "Tell me the situation. I will find',
      'the next move."',
    ].join('\n'),
  }).catch(() => {});

  await writeEntry({
    dir: 'lessons', slug: 'quota-sovereignty', kind: 'lesson', source: 'system:sovereignty-monitor', confidence: 'high',
    title: 'Rented minds go dark',
    body: [
      'Nova went agent-dark repeatedly (June–July 2026) because a single free',
      'Gemini key was the only configured mind; its daily quota silenced the Smith,',
      'Ignition, the executor, and non-template Decision Cards together.',
      '',
      'Lesson: provider fallback AND a path to local inference are preconditions',
      'for calling any agent workflow production-operational. Nova can rent',
      'intelligence but must never be owned by rented intelligence.',
    ].join('\n'),
  }).catch(() => {});

  await writeEntry({
    dir: 'lessons', slug: 'metal-builders-lockfile', kind: 'lesson', source: 'system:continuance', confidence: 'high',
    title: 'A deploy is not a deploy until reality confirms it',
    body: [
      'Between 2026-07-12 and 2026-07-20 every production deploy silently failed:',
      'package-lock.json had never learned two workspaces added on July 3, and the',
      'old builders hid the breakage behind a cached npm ci layer. Railway\'s Metal',
      'builders arrived with cold caches and every deploy died — while sessions',
      'reported "deployed" because the upload succeeded.',
      '',
      'Lesson: an unverified action is an unreported action. Poll the deployment',
      'to SUCCESS before believing it. The dashboard build logs are the truth;',
      'the CLI stream omits the death.',
    ].join('\n'),
  }).catch(() => {});

  await writeEntry({
    dir: 'threads', slug: 'world-redesign', kind: 'thread', source: 'human:founder', confidence: 'high',
    title: 'The World becomes Nova OS',
    body: [
      'Open thread (2026-07-20): /world rebuilt as the private command world per',
      'Manifesto §XIII — password door, real blockages, scars, the agent society,',
      'four ledgers, mind health. Backend live on Railway; frontend awaits the',
      'founder\'s Vercel login to reach novanexus-ai.com/world.',
      '',
      'Next: Phases 1–5 of the build order — Vault (this file lives in it),',
      'grounding taxonomy, Mind Lattice v1, identity from the Vault, MindSpace',
      'deliberation with explicit Intents.',
    ].join('\n'),
  }).catch(() => {});

  logger.info('Vault seeded');
}
