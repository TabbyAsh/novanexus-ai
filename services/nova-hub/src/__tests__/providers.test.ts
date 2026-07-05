/**
 * SOVEREIGNTY ACCEPTANCE TESTS — the core anti-fabrication guarantees.
 *
 * Proves, with no network, that:
 *  - a quota-exhausted provider fails over to the next configured provider
 *  - when ALL providers fail, the chain returns providerUnavailable with
 *    NULL content (no hallucinated output)
 *  - a provider in quota cooldown is skipped without being called
 *  - tiered routing puts local first and respects env fallback order
 *  - the sovereignty score reflects local availability
 */

import {
  runProviderChain, orderFor, sovereignty, setConfigured, markQuota, isEligible,
  _resetHealth, type ProviderCall, type ProviderName,
} from '../providers';

beforeEach(() => _resetHealth());

function caller(name: ProviderName, outcome: any): ProviderCall {
  return { name, call: async () => outcome };
}

describe('provider failover', () => {
  test('quota on A fails over to B', async () => {
    setConfigured('gemini', true);
    setConfigured('groq', true);
    const calls: string[] = [];
    const chain = await runProviderChain([
      { name: 'gemini', call: async () => { calls.push('gemini'); return { status: 'quota' }; } },
      { name: 'groq', call: async () => { calls.push('groq'); return { status: 'ok', content: 'answer from groq' }; } },
    ]);
    expect(chain.provider).toBe('groq');
    expect(chain.content).toBe('answer from groq');
    expect(chain.providerUnavailable).toBe(false);
    expect(calls).toEqual(['gemini', 'groq']);
  });

  test('error on A fails over to B', async () => {
    setConfigured('gemini', true); setConfigured('grok', true);
    const chain = await runProviderChain([
      caller('gemini', { status: 'error', reason: 'http 500' }),
      caller('grok', { status: 'ok', content: 'grok saved it' }),
    ]);
    expect(chain.provider).toBe('grok');
    expect(chain.content).toBe('grok saved it');
  });
});

describe('no fabrication when all providers fail', () => {
  test('all quota → providerUnavailable, null content', async () => {
    setConfigured('gemini', true); setConfigured('groq', true);
    const chain = await runProviderChain([
      caller('gemini', { status: 'quota' }),
      caller('groq', { status: 'quota' }),
    ]);
    expect(chain.providerUnavailable).toBe(true);
    expect(chain.content).toBeNull();
    expect(chain.provider).toBeNull();
  });

  test('mixed failures → still null, never invented', async () => {
    setConfigured('gemini', true); setConfigured('claude', true); setConfigured('openai', true);
    const chain = await runProviderChain([
      caller('gemini', { status: 'quota' }),
      caller('claude', { status: 'error', reason: 'timeout' }),
      caller('openai', { status: 'error', reason: 'http 401' }),
    ]);
    expect(chain.providerUnavailable).toBe(true);
    expect(chain.content).toBeNull();
  });

  test('unconfigured providers are absent, not fabricated', async () => {
    // none configured
    const chain = await runProviderChain([
      caller('gemini', { status: 'absent' }),
    ]);
    expect(chain.providerUnavailable).toBe(true);
    expect(chain.content).toBeNull();
  });
});

describe('quota cooldown', () => {
  test('a quota-dark provider is skipped without being called again', async () => {
    setConfigured('gemini', true);
    markQuota('gemini'); // now in cooldown
    expect(isEligible('gemini')).toBe(false);
    let called = false;
    const chain = await runProviderChain([
      { name: 'gemini', call: async () => { called = true; return { status: 'ok', content: 'should not run' }; } },
    ]);
    expect(called).toBe(false);
    expect(chain.providerUnavailable).toBe(true);
  });
});

describe('tiered routing', () => {
  test('deterministic tier uses NO llm (empty order)', () => {
    expect(orderFor('deterministic')).toEqual([]);
  });

  test('local is preferred first for coding', () => {
    const order = orderFor('coding');
    expect(order[0]).toBe('local');
  });

  test('env fallback order wins', () => {
    const order = orderFor('coding', { envOrder: ['grok', 'gemini'] });
    expect(order[0]).toBe('grok');
    expect(order[1]).toBe('gemini');
  });

  test('per-agent preference floats to front', () => {
    const order = orderFor('reasoning', { prefer: 'claude' });
    expect(order[0]).toBe('claude');
  });
});

describe('sovereignty score', () => {
  test('deterministic-only floor is 25% with nothing configured', () => {
    const s = sovereignty();
    expect(s.score).toBe(25);
  });

  test('external-only is 40% (LLM tasks depend on rented minds)', () => {
    setConfigured('gemini', true);
    expect(sovereignty().score).toBe(40);
  });

  test('local available crosses to 75%', () => {
    setConfigured('local', true);
    setConfigured('gemini', true);
    expect(sovereignty().score).toBe(75);
  });

  test('local-only is 100% sovereign', () => {
    setConfigured('local', true);
    const s = sovereignty();
    expect(s.score).toBe(100);
    expect(s.band).toBe('sovereign');
  });
});
