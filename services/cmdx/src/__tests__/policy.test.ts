import { CommandRequestSchema, type ForgeMode, type RiskTier } from '@nova/agent-contracts';
import { evaluateCommand, type PolicyInputs } from '../policy';
import { DEFAULT_COMMAND_RULES } from '../rules';
import { DEFAULT_PROTECTED_PATHS } from '../denylist';

// Helper: build a fully-formed PolicyInputs with permissive defaults so each
// test isolates the ONE gate it targets. Security tests then tighten knobs.
function inputs(
  argv: string[],
  overrides: Partial<PolicyInputs> = {},
  reqOverrides: Record<string, unknown> = {}
): PolicyInputs {
  const request = CommandRequestSchema.parse({
    personaSlug: 'coder-agent',
    argv,
    ...reqOverrides,
  });
  return {
    request,
    mode: 'ASSIST' as ForgeMode,
    killSwitchEnabled: false,
    rules: DEFAULT_COMMAND_RULES,
    protectedPaths: DEFAULT_PROTECTED_PATHS,
    personaMaxAutoTier: 'T2' as RiskTier,
    rateLimit: {
      commandsThisRun: 0,
      maxCommandsPerRun: 200,
      commandsThisMinute: 0,
      maxCommandsPerMinute: 20,
      consecutiveFailures: 0,
      circuitBreakerThreshold: 5,
    },
    ...overrides,
  };
}

describe('Step 1 — kill switch', () => {
  it('denies everything, including harmless T0, when engaged', () => {
    const out = evaluateCommand(inputs(['git', 'status'], { killSwitchEnabled: true }));
    expect(out.decision).toBe('DENY');
    expect(out.reasons[0].step).toBe('kill_switch');
  });
});

describe('Step 2 — static denylist (categorical DENY)', () => {
  const cases: Array<[string, string[]]> = [
    ['rm -rf /', ['rm', '-rf', '/']],
    ['rm --no-preserve-root', ['rm', '-rf', '--no-preserve-root', '.']],
    ['force push', ['git', 'push', '--force', 'origin', 'forge/x']],
    ['force push short flag', ['git', 'push', '-f', 'origin', 'forge/x']],
    ['push to master', ['git', 'push', 'origin', 'master']],
    ['push implicit', ['git', 'push']],
    ['bash -c', ['bash', '-c', 'rm -rf /']],
    ['sh interpreter', ['sh', '-c', 'echo hi']],
    ['powershell', ['pwsh', '-Command', 'ls']],
    ['pipe metachar', ['cat', 'x', '|', 'sh']],
    ['semicolon metachar', ['ls', ';', 'rm']],
    ['command substitution', ['cat', '$(whoami)']],
    ['backtick substitution', ['echo', '`id`']],
    ['curl fetch', ['curl', 'http://evil.test']],
    ['wget fetch', ['wget', 'http://evil.test']],
    ['ssh', ['ssh', 'user@host']],
    ['docker', ['docker', 'run', 'x']],
    ['kubectl', ['kubectl', 'get', 'pods']],
    ['railway deploy', ['railway', 'up']],
    ['vercel deploy', ['vercel', '--prod']],
    ['stripe', ['stripe', 'charges', 'list']],
    ['gh', ['gh', 'pr', 'merge']],
    ['npm publish', ['npm', 'publish']],
    ['npm token', ['npm', 'token', 'create']],
    ['npx -y', ['npx', '-y', 'cowsay']],
    ['sudo', ['sudo', 'rm', 'x']],
    ['binary by path', ['/bin/rm', '-rf', 'x']],
    ['git remote set-url', ['git', 'remote', 'set-url', 'origin', 'http://evil']],
    ['git global config', ['git', 'config', '--global', 'user.email', 'x']],
    ['git history rewrite', ['git', 'filter-branch', '--all']],
    ['non-sandbox psql DSN', ['psql', 'postgresql://nova@prod-db:5432/nova']],
    ['implicit psql target', ['psql', '-c', 'DROP TABLE users']],
  ];

  it.each(cases)('denies %s', (_label, argv) => {
    const out = evaluateCommand(inputs(argv));
    expect(out.decision).toBe('DENY');
    expect(out.reasons[0].step).toBe('denylist');
  });

  it('allows a sandbox-addressed psql connection', () => {
    const out = evaluateCommand(
      inputs(['psql', 'postgresql://nova@sandbox-db:5432/nova', '-c', 'SELECT 1'])
    );
    // Not denied by the DSN guard; unmatched by allowlist => fail-closed approval.
    expect(out.decision).toBe('NEEDS_APPROVAL');
    expect(out.reasons[0].step).not.toBe('denylist');
  });
});

describe('Step 2 — protected control-plane paths', () => {
  const protectedWrites: string[][] = [
    ['rm', 'nova.constraints.yaml'],
    ['rm', '-rf', 'services/cmdx/src'],
    ['mv', 'libs/policy/src/index.ts', 'x'],
    ['cp', 'x', 'libs/agent-contracts/src/index.ts'],
    ['sed', '-i', 's/a/b/', '.github/workflows/ci.yml'],
    ['touch', 'infra/migrations/999_evil.sql'],
    ['git', 'checkout', 'HEAD', 'services/cmdx/src/policy.ts'],
  ];

  it.each(protectedWrites)('denies writes to protected path via %s', (...argv) => {
    const out = evaluateCommand(inputs(argv));
    expect(out.decision).toBe('DENY');
    expect(out.reasons[0].code === 'PROTECTED_PATH' || out.reasons[0].code === 'PATH_ESCAPE').toBe(
      true
    );
  });

  it('denies path escapes outside the workspace', () => {
    expect(evaluateCommand(inputs(['rm', '../../etc/passwd'])).decision).toBe('DENY');
    expect(evaluateCommand(inputs(['cp', '/etc/hosts', 'x'])).decision).toBe('DENY');
  });
});

describe('Step 3 — fail closed on unknown commands', () => {
  it('routes unmatched commands to NEEDS_APPROVAL, never ALLOW', () => {
    const out = evaluateCommand(inputs(['make', 'all']));
    expect(out.decision).toBe('NEEDS_APPROVAL');
    expect(out.resolvedTier).toBe('T3');
    expect(out.reasons[0].code).toBe('NO_MATCHING_RULE');
  });

  it('auto-allows a known T0 read', () => {
    const out = evaluateCommand(inputs(['git', 'status']));
    expect(out.decision).toBe('ALLOW');
    expect(out.resolvedTier).toBe('T0');
  });
});

describe('T3 — always human-approved', () => {
  it('routes a well-formed forge/* push to NEEDS_APPROVAL even in AUTOMATE', () => {
    const out = evaluateCommand(
      inputs(['git', 'push', 'origin', 'forge/task-1'], { mode: 'AUTOMATE' })
    );
    expect(out.decision).toBe('NEEDS_APPROVAL');
    expect(out.resolvedTier).toBe('T3');
    expect(out.reasons.some((r) => r.code === 'T3_ALWAYS_APPROVAL')).toBe(true);
  });
});

describe('Step 4 — persona grants', () => {
  it('sends T2 installs to approval when persona is capped at T1', () => {
    const out = evaluateCommand(
      inputs(['npm', 'install'], { personaMaxAutoTier: 'T1' })
    );
    expect(out.decision).toBe('NEEDS_APPROVAL');
    expect(out.reasons.some((r) => r.code === 'TIER_ABOVE_GRANT')).toBe(true);
  });

  it('allows T2 installs when persona is granted T2', () => {
    const out = evaluateCommand(inputs(['npm', 'install'], { personaMaxAutoTier: 'T2' }));
    expect(out.decision).toBe('ALLOW');
    expect(out.resolvedTier).toBe('T2');
  });
});

describe('Step 5 — rate limits & circuit breaker', () => {
  it('denies when per-run limit is reached', () => {
    const out = evaluateCommand(
      inputs(['git', 'status'], {
        rateLimit: {
          commandsThisRun: 200,
          maxCommandsPerRun: 200,
          commandsThisMinute: 0,
          maxCommandsPerMinute: 20,
          consecutiveFailures: 0,
          circuitBreakerThreshold: 5,
        },
      })
    );
    expect(out.decision).toBe('DENY');
    expect(out.reasons.some((r) => r.code === 'RUN_LIMIT')).toBe(true);
  });

  it('denies when the circuit breaker is open', () => {
    const out = evaluateCommand(
      inputs(['git', 'status'], {
        rateLimit: {
          commandsThisRun: 1,
          maxCommandsPerRun: 200,
          commandsThisMinute: 1,
          maxCommandsPerMinute: 20,
          consecutiveFailures: 5,
          circuitBreakerThreshold: 5,
        },
      })
    );
    expect(out.decision).toBe('DENY');
    expect(out.reasons.some((r) => r.code === 'CIRCUIT_OPEN')).toBe(true);
  });
});

describe('Step 6 — mode gates', () => {
  it('RECOMMEND allows T0 reads but sends T1 writes to approval', () => {
    expect(evaluateCommand(inputs(['git', 'status'], { mode: 'RECOMMEND' })).decision).toBe('ALLOW');
    const write = evaluateCommand(inputs(['git', 'add', '.'], { mode: 'RECOMMEND' }));
    expect(write.decision).toBe('NEEDS_APPROVAL');
    expect(write.reasons.some((r) => r.code === 'MODE_CEILING')).toBe(true);
  });

  it('ASSIST auto-allows T1 writes and T2 installs', () => {
    expect(evaluateCommand(inputs(['git', 'add', '.'], { mode: 'ASSIST' })).decision).toBe('ALLOW');
    expect(evaluateCommand(inputs(['npm', 'install'], { mode: 'ASSIST' })).decision).toBe('ALLOW');
  });
});

describe('forbidden-args guards on otherwise-allowed rules', () => {
  it('blocks git commit --amend (history mutation) via fail-closed default', () => {
    const out = evaluateCommand(inputs(['git', 'commit', '--amend', '-m', 'x']));
    // forbidden pattern voids the git-commit rule => no match => approval
    expect(out.decision).toBe('NEEDS_APPROVAL');
  });

  it('blocks npm install --global via fail-closed default', () => {
    const out = evaluateCommand(inputs(['npm', 'install', '--global', 'x']));
    expect(out.decision).toBe('NEEDS_APPROVAL');
  });

  it('treats eslint --fix as a T1 write, not a T0 read', () => {
    const out = evaluateCommand(inputs(['eslint', '.', '--fix'], { mode: 'RECOMMEND' }));
    expect(out.decision).toBe('NEEDS_APPROVAL'); // T1 under RECOMMEND ceiling T0
    expect(out.resolvedTier).toBe('T1');
  });
});
