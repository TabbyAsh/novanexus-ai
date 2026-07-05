-- ============================================================================
-- Nova Enterprises — Forge Control Plane (builder-agent layer)
-- Migration: 030_forge_control_plane
-- Doctrine: Agents request; the broker decides; humans merge. Every action is
--           a typed, persisted, hash-chain-audited record.
-- Phase 0: tables + seeds only. No LLM, no execution — interfaces and rails.
-- ============================================================================

-- ============================================
-- Agent registry: personas are DATA, not code
-- ============================================

CREATE TABLE IF NOT EXISTS agent_personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    category VARCHAR(20) NOT NULL
      CHECK (category IN ('read_only', 'builder', 'gated')),
    description TEXT DEFAULT '',
    -- Highest risk tier this persona may be auto-granted. T3 is NEVER an
    -- auto-grant tier: T3 always resolves to NEEDS_APPROVAL in CmdX.
    max_auto_tier VARCHAR(2) NOT NULL DEFAULT 'T0'
      CHECK (max_auto_tier IN ('T0', 'T1', 'T2')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    persona_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
    semver VARCHAR(20) NOT NULL,
    prompt_text TEXT NOT NULL,
    changelog TEXT DEFAULT '',
    author_type VARCHAR(10) NOT NULL CHECK (author_type IN ('human', 'agent')),
    status VARCHAR(12) NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'candidate', 'canary', 'active', 'retired')),
    eval_run_id UUID,                          -- filled by forge-evals on gate pass
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_at TIMESTAMPTZ,
    UNIQUE (persona_id, semver)
);

-- At most one ACTIVE prompt per persona (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_one_active
    ON prompt_versions(persona_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS strategy_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope VARCHAR(40) NOT NULL,                -- 'planner' or a persona slug
    semver VARCHAR(20) NOT NULL,
    knobs_json JSONB NOT NULL DEFAULT '{}',    -- declarative knobs, not code
    changelog TEXT DEFAULT '',
    author_type VARCHAR(10) NOT NULL CHECK (author_type IN ('human', 'agent')),
    status VARCHAR(12) NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'candidate', 'canary', 'active', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scope, semver)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_versions_one_active
    ON strategy_versions(scope) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS toolset_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    persona_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
    semver VARCHAR(20) NOT NULL,
    tools_json JSONB NOT NULL DEFAULT '[]',    -- [{tool, grantTier}]
    status VARCHAR(12) NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'candidate', 'canary', 'active', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (persona_id, semver)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_toolset_versions_one_active
    ON toolset_versions(persona_id) WHERE status = 'active';

-- ============================================
-- Forge tasks / plans / subtasks
-- ============================================

CREATE TABLE IF NOT EXISTS forge_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID,                               -- soft org scoping (Phase 6: FK + RLS)
    created_by UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    spec_json JSONB NOT NULL,                  -- TaskSpec (agent-contracts)
    mode VARCHAR(12) NOT NULL DEFAULT 'ASSIST'
      CHECK (mode IN ('RECOMMEND', 'ASSIST', 'AUTOMATE')),
    status VARCHAR(12) NOT NULL DEFAULT 'NEW'
      CHECK (status IN ('NEW', 'PLANNED', 'EXECUTING', 'REVIEW', 'COMPLETE', 'BLOCKED', 'CANCELLED')),
    budget_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forge_tasks_status ON forge_tasks(status);
CREATE INDEX IF NOT EXISTS idx_forge_tasks_created ON forge_tasks(created_at DESC);

CREATE TABLE IF NOT EXISTS forge_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES forge_tasks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    dag_json JSONB NOT NULL,                   -- Plan (agent-contracts), DAG-validated
    notes TEXT DEFAULT '',
    created_by_persona VARCHAR(40),
    status VARCHAR(12) NOT NULL DEFAULT 'DRAFT'
      CHECK (status IN ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, version)
);

CREATE TABLE IF NOT EXISTS forge_subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES forge_tasks(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES forge_plans(id) ON DELETE SET NULL,
    name VARCHAR(80) NOT NULL,
    persona_slug VARCHAR(40) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    depends_on TEXT[] NOT NULL DEFAULT '{}',   -- subtask names within the plan
    file_ownership TEXT[] NOT NULL DEFAULT '{}',
    validation_json JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED'
      CHECK (status IN ('QUEUED', 'RUNNING', 'NEEDS_APPROVAL', 'DONE', 'FAILED', 'RETRYING')),
    attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    budget_json JSONB NOT NULL DEFAULT '{}',
    workspace_id UUID,
    branch VARCHAR(200),                       -- must live under forge/*
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, name)
);

CREATE INDEX IF NOT EXISTS idx_forge_subtasks_task ON forge_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_forge_subtasks_status ON forge_subtasks(status);

-- ============================================
-- Workspaces (ephemeral sandbox clones)
-- ============================================

CREATE TABLE IF NOT EXISTS forge_workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES forge_tasks(id) ON DELETE SET NULL,
    subtask_id UUID REFERENCES forge_subtasks(id) ON DELETE SET NULL,
    repo_remote VARCHAR(500) NOT NULL,
    base_ref VARCHAR(200) NOT NULL,
    branch VARCHAR(200) NOT NULL,              -- forge/* enforced at broker level
    container_id VARCHAR(128),
    status VARCHAR(16) NOT NULL DEFAULT 'PROVISIONING'
      CHECK (status IN ('PROVISIONING', 'READY', 'ACTIVE', 'DESTROYED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    destroyed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forge_workspaces_status ON forge_workspaces(status);

-- ============================================
-- CmdX: command rules (human-edited allowlist) + request audit
-- ============================================

CREATE TABLE IF NOT EXISTS forge_command_rules (
    id VARCHAR(120) PRIMARY KEY,               -- stable human-readable id, e.g. 'git-status'
    binary VARCHAR(80) NOT NULL,               -- executable name (no paths)
    args_pattern TEXT NOT NULL,                -- anchored regex over args.join(' ')
    forbidden_args_pattern TEXT,               -- optional regex that voids the match
    tier VARCHAR(2) NOT NULL CHECK (tier IN ('T0', 'T1', 'T2', 'T3')),
    description TEXT DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(40) NOT NULL DEFAULT 'human',  -- rules are human-owned
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forge_command_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES forge_workspaces(id) ON DELETE SET NULL,
    subtask_id UUID REFERENCES forge_subtasks(id) ON DELETE SET NULL,
    task_id UUID REFERENCES forge_tasks(id) ON DELETE SET NULL,
    persona_slug VARCHAR(40) NOT NULL,
    argv JSONB NOT NULL,                       -- string[] — argv only, never a shell string
    cwd VARCHAR(1024) NOT NULL DEFAULT '.',
    env_refs JSONB NOT NULL DEFAULT '[]',
    env_violations JSONB NOT NULL DEFAULT '[]',-- requested-but-stripped env names
    requested_tier VARCHAR(2) NOT NULL CHECK (requested_tier IN ('T0', 'T1', 'T2', 'T3')),
    resolved_tier VARCHAR(2) CHECK (resolved_tier IN ('T0', 'T1', 'T2', 'T3')),
    decision VARCHAR(16) NOT NULL
      CHECK (decision IN ('ALLOW', 'DENY', 'NEEDS_APPROVAL')),
    decision_reasons JSONB NOT NULL DEFAULT '[]',
    rule_id VARCHAR(120),
    dry_run BOOLEAN NOT NULL DEFAULT false,
    execution_status VARCHAR(16) NOT NULL DEFAULT 'NOT_EXECUTED'
      CHECK (execution_status IN ('NOT_EXECUTED', 'DEFERRED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'KILLED')),
    exit_code INTEGER,
    stdout_ref VARCHAR(500),                   -- object-storage ref, never inline
    stderr_ref VARCHAR(500),
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forge_cmd_req_workspace ON forge_command_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_forge_cmd_req_decision ON forge_command_requests(decision);
CREATE INDEX IF NOT EXISTS idx_forge_cmd_req_created ON forge_command_requests(created_at DESC);

-- ============================================
-- Artifacts, approvals
-- ============================================

CREATE TABLE IF NOT EXISTS forge_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES forge_tasks(id) ON DELETE CASCADE,
    subtask_id UUID REFERENCES forge_subtasks(id) ON DELETE SET NULL,
    kind VARCHAR(12) NOT NULL
      CHECK (kind IN ('DIFF', 'REPORT', 'BRIEF', 'LOG', 'FILE', 'PLAN')),
    storage_ref VARCHAR(500) NOT NULL,         -- e.g. minio://forge-artifacts/<key>
    meta_json JSONB NOT NULL DEFAULT '{}',
    created_by_persona VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forge_artifacts_task ON forge_artifacts(task_id);

CREATE TABLE IF NOT EXISTS forge_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(12) NOT NULL
      CHECK (kind IN ('PLAN', 'DIFF', 'COMMAND', 'PROMOTION', 'BUDGET', 'TOOL_GRANT')),
    task_id UUID REFERENCES forge_tasks(id) ON DELETE CASCADE,
    subtask_id UUID REFERENCES forge_subtasks(id) ON DELETE SET NULL,
    command_request_id UUID REFERENCES forge_command_requests(id) ON DELETE SET NULL,
    requested_by_persona VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
    decided_by UUID REFERENCES users(id),
    decision_reason TEXT,                      -- human reasons double as training labels
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forge_approvals_status ON forge_approvals(status);
CREATE INDEX IF NOT EXISTS idx_forge_approvals_created ON forge_approvals(created_at DESC);

-- ============================================
-- Budgets + spend ledger (hard stops, not suggestions)
-- ============================================

CREATE TABLE IF NOT EXISTS forge_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID,
    scope VARCHAR(12) NOT NULL CHECK (scope IN ('TASK', 'DAILY')),
    max_tokens BIGINT NOT NULL DEFAULT 250000,
    max_commands INTEGER NOT NULL DEFAULT 200,
    max_usd DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, scope)
);

-- Platform defaults use org_id IS NULL; NULLs are distinct under UNIQUE, so
-- enforce singleton default rows with a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_forge_budgets_default_scope
    ON forge_budgets(scope) WHERE org_id IS NULL;

CREATE TABLE IF NOT EXISTS forge_spend_ledger (
    id BIGSERIAL PRIMARY KEY,
    task_id UUID REFERENCES forge_tasks(id) ON DELETE SET NULL,
    subtask_id UUID REFERENCES forge_subtasks(id) ON DELETE SET NULL,
    persona_slug VARCHAR(40),
    category VARCHAR(12) NOT NULL CHECK (category IN ('TOKENS', 'COMMANDS', 'USD')),
    amount DECIMAL(14,4) NOT NULL,
    meta_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forge_spend_task ON forge_spend_ledger(task_id);
CREATE INDEX IF NOT EXISTS idx_forge_spend_created ON forge_spend_ledger(created_at DESC);

-- ============================================
-- Seed: the agent roster (personas are data)
-- ============================================

INSERT INTO agent_personas (slug, name, category, description, max_auto_tier) VALUES
  ('intake-agent',       'Intake Agent',       'read_only', 'Normalizes user requests into TaskSpecs with acceptance criteria and budgets.', 'T0'),
  ('architect-agent',    'Architect Agent',    'read_only', 'Turns TaskSpecs into plan DAGs with file-ownership boundaries and validation steps.', 'T0'),
  ('repo-analyst-agent', 'Repo Analyst Agent', 'read_only', 'Answers architecture questions with file:line citations from RepoGraph.', 'T0'),
  ('product-agent',      'Product Agent',      'read_only', 'Turns vague asks into specs and decision-card copy.', 'T0'),
  ('reviewer-agent',     'Reviewer Agent',     'read_only', 'Scores diffs against rubric; blocks or annotates before human review.', 'T0'),
  ('research-agent',     'Research Agent',     'read_only', 'External docs retrieval via egress allowlist; produces cited briefs.', 'T0'),
  ('coder-agent',        'Coder Agent',        'builder',   'Implements one subtask in a workspace: files, schemas, APIs, UI pages.', 'T2'),
  ('test-agent',         'Test Agent',         'builder',   'Writes and runs tests; owns tests/** and *.test.ts.', 'T2'),
  ('debug-agent',        'Debug Agent',        'builder',   'Consumes failing output, produces minimal patches; owns the repair loop.', 'T2'),
  ('refactor-agent',     'Refactor Agent',     'builder',   'Mechanical transforms with behavior-preservation checks.', 'T2'),
  ('docs-agent',         'Docs Agent',         'builder',   'Generates docs and what-changed reports; owns docs/** and *.md.', 'T1'),
  ('toolsmith-agent',    'Toolsmith Agent',    'gated',     'Drafts new internal tools as inert PRs into libs/agent-tools; never self-enables.', 'T1'),
  ('release-agent',      'Release Agent',      'gated',     'Packaging, changelogs, staging deploys. Production is human-only, always.', 'T1')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Seed: default command rules (mirrored as code fallback in services/cmdx).
-- Human-owned. Patterns are anchored regexes over args.join(' ').
-- ============================================

INSERT INTO forge_command_rules (id, binary, args_pattern, forbidden_args_pattern, tier, description) VALUES
  -- T0: read-only
  ('git-status',      'git',  '^status( .*)?$',                          NULL,                                'T0', 'git status'),
  ('git-diff',        'git',  '^diff( .*)?$',                            NULL,                                'T0', 'git diff (workspace)'),
  ('git-log',         'git',  '^log( .*)?$',                             NULL,                                'T0', 'git log'),
  ('git-show',        'git',  '^show( .*)?$',                            NULL,                                'T0', 'git show'),
  ('git-rev-parse',   'git',  '^rev-parse( .*)?$',                       NULL,                                'T0', 'git rev-parse'),
  ('git-branch-list', 'git',  '^branch( --list.*| -a| -r)?$',            NULL,                                'T0', 'git branch listing only'),
  ('ls',              'ls',   '^.*$',                                    NULL,                                'T0', 'list files'),
  ('cat',             'cat',  '^.*$',                                    NULL,                                'T0', 'read files'),
  ('head',            'head', '^.*$',                                    NULL,                                'T0', 'read file heads'),
  ('tail',            'tail', '^.*$',                                    '(^| )-f( |$)',                      'T0', 'read file tails (no follow)'),
  ('grep',            'grep', '^.*$',                                    NULL,                                'T0', 'search file contents'),
  ('rg',              'rg',   '^.*$',                                    NULL,                                'T0', 'ripgrep search'),
  ('wc',              'wc',   '^.*$',                                    NULL,                                'T0', 'count lines/words'),
  ('pwd',             'pwd',  '^$',                                      NULL,                                'T0', 'print working directory'),
  ('node-version',    'node', '^--version$',                             NULL,                                'T0', 'node version'),
  ('npm-version',     'npm',  '^--version$',                             NULL,                                'T0', 'npm version'),
  ('npm-ls',          'npm',  '^ls( .*)?$',                              NULL,                                'T0', 'npm dependency tree'),
  ('tsc-noemit',      'tsc',  '^--noEmit( .*)?$',                        NULL,                                'T0', 'typecheck only'),
  ('npx-tsc-noemit',  'npx',  '^tsc --noEmit( .*)?$',                    NULL,                                'T0', 'typecheck via npx'),
  ('eslint-check',    'eslint', '^(?!.*--fix).*$',                       '--fix',                             'T0', 'lint without fixing'),
  ('jest-list',       'jest', '^--listTests( .*)?$',                     NULL,                                'T0', 'list tests'),

  -- T1: workspace-write
  ('git-add',         'git',  '^add( .*)?$',                             NULL,                                'T1', 'stage changes'),
  ('git-commit',      'git',  '^commit( .*)?$',                          '--amend|--no-verify',               'T1', 'commit to workspace branch'),
  ('git-checkout-forge', 'git', '^checkout -b forge/.+$',                NULL,                                'T1', 'create forge/* branch'),
  ('git-switch-forge','git',  '^switch (-c )?forge/.+$',                 NULL,                                'T1', 'switch to forge/* branch'),
  ('git-restore',     'git',  '^restore( .*)?$',                         NULL,                                'T1', 'restore workspace files'),
  ('git-reset',       'git',  '^reset( --hard| --soft| --mixed)?( HEAD.*|[a-f0-9]{7,40})?$', NULL,            'T1', 'reset within workspace history'),
  ('git-stash',       'git',  '^stash( .*)?$',                           NULL,                                'T1', 'stash workspace changes'),
  ('jest-run',        'jest', '^(?!--listTests).*$',                     NULL,                                'T1', 'run tests'),
  ('eslint-fix',      'eslint', '^.*--fix.*$',                           NULL,                                'T1', 'lint with autofix'),
  ('tsc-build',       'tsc',  '^(?!--noEmit).*$',                        NULL,                                'T1', 'compile'),
  ('npm-run',         'npm',  '^run [a-zA-Z0-9:_.-]+( .*)?$',            NULL,                                'T1', 'run package scripts'),
  ('npm-test',        'npm',  '^test( .*)?$',                            NULL,                                'T1', 'npm test'),
  ('npx-turbo-run',   'npx',  '^turbo run (build|test|lint|typecheck)( .*)?$', NULL,                          'T1', 'turbo pipeline tasks'),
  ('mkdir',           'mkdir','^.*$',                                    NULL,                                'T1', 'create directories'),
  ('touch',           'touch','^.*$',                                    NULL,                                'T1', 'create files'),
  ('cp',              'cp',   '^.*$',                                    NULL,                                'T1', 'copy within workspace'),
  ('mv',              'mv',   '^.*$',                                    NULL,                                'T1', 'move within workspace'),
  ('prettier',        'prettier', '^.*$',                                NULL,                                'T1', 'format code'),

  -- T2: stateful-in-sandbox
  ('npm-install',     'npm',  '^(install|ci|i)( .*)?$',                  '--registry|--global|-g( |$)',       'T2', 'install deps (default registry only)'),
  ('npm-rebuild',     'npm',  '^rebuild( .*)?$',                         NULL,                                'T2', 'rebuild native deps'),

  -- T3: external — classification only; ALWAYS resolves to NEEDS_APPROVAL
  ('git-push-forge',  'git',  '^push( -u| --set-upstream)?( origin)? forge/.+$', '--force|-f( |$)|--force-with-lease|--delete|--mirror', 'T3', 'push forge/* branch (human-approved)')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Seed: default budgets (global defaults; org rows added at enablement)
-- ============================================

INSERT INTO forge_budgets (org_id, scope, max_tokens, max_commands, max_usd)
SELECT NULL, 'TASK', 250000, 200, 5.00
WHERE NOT EXISTS (SELECT 1 FROM forge_budgets WHERE org_id IS NULL AND scope = 'TASK');

INSERT INTO forge_budgets (org_id, scope, max_tokens, max_commands, max_usd)
SELECT NULL, 'DAILY', 2000000, 1000, 25.00
WHERE NOT EXISTS (SELECT 1 FROM forge_budgets WHERE org_id IS NULL AND scope = 'DAILY');
