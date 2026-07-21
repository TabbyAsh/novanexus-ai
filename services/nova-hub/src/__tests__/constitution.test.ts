/**
 * THE CONSTITUTION UNDER TEST — Phases 1, 4, 5.
 *
 * Phase 1 proof: meaning survives with no index, no database, no cache —
 *   search is a walk over plain files.
 * Phase 1 law: nothing is silently overwritten; corrections append.
 * Phase 4 proof: identity comes from the vault files and is byte-identical
 *   regardless of which providers are configured.
 * Phase 5 law: fewer than two genuine alternatives is not a decision.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('Phase 1 — The Vault', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-vault-'));
    process.env.VAULT_DIR = dir;
    jest.resetModules();
  });
  afterEach(async () => {
    delete process.env.VAULT_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes three-form entries and retrieves them with zero indexes', async () => {
    const vault = await import('../vault');
    const w = await vault.writeEntry({
      dir: 'lessons', slug: 'reality-answers', kind: 'lesson', source: 'test',
      title: 'Reality answers', body: 'When the world contradicts the model, the model changes.',
    });
    expect('path' in w).toBe(true);

    // Retrieval is a plain-file walk — no index existed, none was built.
    const hits = await vault.searchVault('contradicts the model');
    expect(hits.length).toBe(1);
    expect(hits[0].path).toContain('lessons/reality-answers.md');

    // The structured form (frontmatter) and human form (prose) both present.
    const raw = await vault.readEntry('lessons/reality-answers.md');
    expect(raw).toContain('kind: lesson');
    expect(raw).toContain('the model changes');
  });

  it('never silently overwrites — corrections append with history intact', async () => {
    const vault = await import('../vault');
    await vault.writeEntry({
      dir: 'memories', slug: 'first', kind: 'memory', source: 'test',
      title: 'First belief', body: 'The market always goes up.',
    });
    const rel = (await vault.listEntries('memories'))[0];

    // A second write to the same slug is refused, not merged.
    const clobber = await vault.writeEntry({
      dir: 'memories', slug: 'first', kind: 'memory', source: 'test',
      title: 'Replaced', body: 'Overwritten!',
    });
    expect('error' in clobber).toBe(true);

    // The correction appends; the original words remain.
    await vault.amendEntry(rel, 'It did not. The belief was wrong.', 'test');
    const raw = await vault.readEntry(rel);
    expect(raw).toContain('The market always goes up.');
    expect(raw).toContain('## Correction');
    expect(raw).toContain('The belief was wrong.');
  });

  it('escaping the vault root is refused', async () => {
    const vault = await import('../vault');
    expect(await vault.readEntry('../../etc/passwd')).toBeNull();
    expect(await vault.readEntry('/etc/passwd')).toBeNull();
  });

  it('reads back every seeded entry by its listed path', async () => {
    // Regression: the old prefix-string containment check silently nulled
    // EVERY read on the mounted volume in production while search worked.
    const vault = await import('../vault');
    await vault.seedVault();
    const paths = await vault.listEntries();
    expect(paths.length).toBeGreaterThan(3);
    for (const p of paths) {
      expect(await vault.readEntry(p)).not.toBeNull();
    }
  });

  it('records continuity into the identity file', async () => {
    const vault = await import('../vault');
    const identity = await import('../identity');
    await vault.seedVault();
    await identity.recordContinuity('Boot. Providers configured: test.');
    const raw = await vault.readEntry('identity/continuity.md');
    expect(raw).toContain('Boot. Providers configured: test.');
  });
});

describe('Phase 4 — Identity is provider-independent', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-vault-'));
    process.env.VAULT_DIR = dir;
    jest.resetModules();
  });
  afterEach(async () => {
    delete process.env.VAULT_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('loads the same identity bytes no matter which providers exist', async () => {
    const vault = await import('../vault');
    await vault.seedVault();

    const identity = await import('../identity');

    process.env.GEMINI_API_KEY = 'a';
    delete process.env.GROQ_API_KEY;
    const a = await identity.loadIdentity();

    identity._clearIdentityCache();
    delete process.env.GEMINI_API_KEY;
    process.env.GROQ_API_KEY = 'b';
    const b = await identity.loadIdentity();
    delete process.env.GROQ_API_KEY;

    expect(a.fromVault).toBe(true);
    expect(a.text).toBe(b.text); // the language organ changed; she did not
    expect(a.text).toContain('calm command');
  });
});

describe('Phase 5 — the decision shape is law', () => {
  const valid = {
    happening: 'the flip pipeline is stalled on missing comps',
    unknown: 'whether live comps exist for this category',
    alternatives: [
      { move: 'ship now', consequence: 'fast, riskier' },
      { move: 'wait for comps', consequence: 'slower, grounded' },
    ],
    choice: 'wait', why: 'evidence first',
    authority: { mode: 'recommend', boundary: 'no money moves' },
    proof: 'deploy id + healthcheck', learn: 'was speed worth it',
  };

  it('accepts a genuine two-alternative decision', async () => {
    const { validateDecisionShape } = await import('../mindspace');
    expect(validateDecisionShape(valid)).toBeNull();
  });

  it('refuses a single answer pretending to be a decision', async () => {
    const { validateDecisionShape } = await import('../mindspace');
    expect(validateDecisionShape({ ...valid, alternatives: [valid.alternatives[0]] }))
      .toMatch(/single generated answer/);
  });

  it('refuses duplicate alternatives dressed as choice', async () => {
    const { validateDecisionShape } = await import('../mindspace');
    expect(validateDecisionShape({
      ...valid,
      alternatives: [{ move: 'Ship now', consequence: 'a' }, { move: 'ship now', consequence: 'b' }],
    })).toMatch(/genuinely distinct/);
  });

  it('refuses a decision with no authority boundary', async () => {
    const { validateDecisionShape } = await import('../mindspace');
    expect(validateDecisionShape({ ...valid, authority: { mode: 'automate' } }))
      .toMatch(/boundary/);
  });
});
