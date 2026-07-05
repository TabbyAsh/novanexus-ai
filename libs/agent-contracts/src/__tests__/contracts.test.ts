import {
  BudgetSchema,
  CommandRequestSchema,
  ForgeBranchSchema,
  isForgeBranch,
  PersonaSchema,
  PlanSchema,
  PromptVersionSchema,
  riskTierAtMost,
  TaskSpecSchema,
} from '../index';

describe('CommandRequestSchema (argv-only enforcement)', () => {
  const valid = {
    personaSlug: 'coder-agent',
    argv: ['git', 'status'],
  };

  it('accepts a minimal argv request and applies safe defaults', () => {
    const parsed = CommandRequestSchema.parse(valid);
    expect(parsed.argv).toEqual(['git', 'status']);
    expect(parsed.cwd).toBe('.');
    expect(parsed.riskTierRequested).toBe('T0');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.envRefs).toEqual([]);
  });

  it('rejects raw shell-string smuggling via unknown keys', () => {
    expect(() =>
      CommandRequestSchema.parse({ ...valid, cmd: 'rm -rf /' })
    ).toThrow();
    expect(() =>
      CommandRequestSchema.parse({ ...valid, shell: true })
    ).toThrow();
    expect(() =>
      CommandRequestSchema.parse({ ...valid, script: 'curl x | sh' })
    ).toThrow();
  });

  it('rejects empty argv and empty argv entries', () => {
    expect(() => CommandRequestSchema.parse({ ...valid, argv: [] })).toThrow();
    expect(() =>
      CommandRequestSchema.parse({ ...valid, argv: ['git', ''] })
    ).toThrow();
  });

  it('rejects unknown personas', () => {
    expect(() =>
      CommandRequestSchema.parse({ ...valid, personaSlug: 'rogue-agent' })
    ).toThrow();
  });

  it('rejects lowercase / malformed env refs', () => {
    expect(() =>
      CommandRequestSchema.parse({ ...valid, envRefs: ['path'] })
    ).toThrow();
    expect(() =>
      CommandRequestSchema.parse({ ...valid, envRefs: ['A B'] })
    ).toThrow();
  });

  it('bounds timeouts to the 30-minute ceiling', () => {
    expect(() =>
      CommandRequestSchema.parse({ ...valid, timeoutMs: 31 * 60 * 1000 })
    ).toThrow();
  });
});

describe('PlanSchema (DAG validation)', () => {
  const subtask = (name: string, dependsOn: string[] = []) => ({
    name,
    personaSlug: 'coder-agent',
    description: `do ${name}`,
    dependsOn,
  });

  it('accepts a valid DAG', () => {
    const plan = PlanSchema.parse({
      subtasks: [subtask('a'), subtask('b', ['a']), subtask('c', ['a', 'b'])],
    });
    expect(plan.subtasks).toHaveLength(3);
    expect(plan.version).toBe(1);
  });

  it('rejects self-dependency', () => {
    expect(() =>
      PlanSchema.parse({ subtasks: [subtask('a', ['a'])] })
    ).toThrow(/depends on itself/);
  });

  it('rejects unknown dependencies', () => {
    expect(() =>
      PlanSchema.parse({ subtasks: [subtask('a', ['ghost'])] })
    ).toThrow(/unknown/);
  });

  it('rejects cycles', () => {
    expect(() =>
      PlanSchema.parse({
        subtasks: [subtask('a', ['b']), subtask('b', ['a'])],
      })
    ).toThrow(/cycle/);
  });

  it('rejects duplicate subtask names', () => {
    expect(() =>
      PlanSchema.parse({ subtasks: [subtask('a'), subtask('a')] })
    ).toThrow(/duplicate/);
  });

  it('rejects empty plans', () => {
    expect(() => PlanSchema.parse({ subtasks: [] })).toThrow();
  });
});

describe('TaskSpecSchema', () => {
  it('requires acceptance criteria and applies budget defaults', () => {
    const spec = TaskSpecSchema.parse({
      title: 'Add health endpoint',
      goal: 'Every service exposes /health',
      acceptanceCriteria: ['GET /health returns 200'],
      repo: { remote: 'https://github.com/nova/nova.git' },
    });
    expect(spec.mode).toBe('ASSIST');
    expect(spec.budget.maxCommands).toBe(200);
    expect(spec.repo.baseRef).toBe('master');
  });

  it('rejects specs without acceptance criteria', () => {
    expect(() =>
      TaskSpecSchema.parse({
        title: 't',
        goal: 'g',
        acceptanceCriteria: [],
        repo: { remote: 'r' },
      })
    ).toThrow();
  });
});

describe('Budget bounds', () => {
  it('rejects zero / negative budgets', () => {
    expect(() => BudgetSchema.parse({ maxTokens: 0 })).toThrow();
    expect(() => BudgetSchema.parse({ maxUsd: -1 })).toThrow();
  });

  it('rejects budgets above hard ceilings', () => {
    expect(() => BudgetSchema.parse({ maxUsd: 10_000 })).toThrow();
    expect(() => BudgetSchema.parse({ maxTokens: 100_000_000 })).toThrow();
  });
});

describe('Forge branch namespace', () => {
  it('accepts forge/* branches only', () => {
    expect(isForgeBranch('forge/task-123')).toBe(true);
    expect(ForgeBranchSchema.parse('forge/task-123')).toBe('forge/task-123');
  });

  it('rejects master, main, and bare prefix', () => {
    expect(isForgeBranch('master')).toBe(false);
    expect(() => ForgeBranchSchema.parse('main')).toThrow();
    expect(() => ForgeBranchSchema.parse('forge/')).toThrow();
  });
});

describe('Persona and prompt versioning', () => {
  it('never allows T3 as an auto-grant tier (schema-level)', () => {
    expect(() =>
      PersonaSchema.parse({
        slug: 'release-agent',
        name: 'Release Agent',
        category: 'gated',
        maxAutoTier: 'T3',
      })
    ).toThrow();
  });

  it('requires semver on prompt versions', () => {
    expect(() =>
      PromptVersionSchema.parse({
        personaSlug: 'coder-agent',
        semver: 'v1',
        promptText: 'x',
        authorType: 'human',
      })
    ).toThrow();
    const ok = PromptVersionSchema.parse({
      personaSlug: 'coder-agent',
      semver: '1.0.0',
      promptText: 'x',
      authorType: 'agent',
    });
    expect(ok.status).toBe('draft');
  });
});

describe('Risk tier ordering', () => {
  it('orders tiers correctly', () => {
    expect(riskTierAtMost('T0', 'T2')).toBe(true);
    expect(riskTierAtMost('T2', 'T2')).toBe(true);
    expect(riskTierAtMost('T3', 'T2')).toBe(false);
  });
});
