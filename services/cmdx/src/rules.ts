import type { RiskTier } from '@nova/agent-contracts';

// ============================================================================
// Allowlist classifier. A command matches a rule when:
//   - argv[0] equals rule.binary exactly, AND
//   - args.join(' ') matches rule.argsPattern (anchored regex), AND
//   - forbiddenArgsPattern (if set) does NOT match.
// First matching rule wins (rules are ordered). No match => the pipeline
// falls through to NEEDS_APPROVAL (fail closed) — never to an allow.
//
// The DB table forge_command_rules is the runtime source of truth
// (human-edited); DEFAULT_COMMAND_RULES is the code-reviewed fallback and
// must stay in sync with infra/migrations/030_forge_control_plane.sql.
// ============================================================================

export interface CommandRule {
  id: string;
  binary: string;
  argsPattern: string;
  forbiddenArgsPattern?: string | null;
  tier: RiskTier;
  description: string;
  enabled: boolean;
}

const rule = (
  id: string,
  binary: string,
  argsPattern: string,
  tier: RiskTier,
  description: string,
  forbiddenArgsPattern: string | null = null
): CommandRule => ({ id, binary, argsPattern, forbiddenArgsPattern, tier, description, enabled: true });

export const DEFAULT_COMMAND_RULES: CommandRule[] = [
  // ---- T0: read-only --------------------------------------------------------
  rule('git-status', 'git', '^status( .*)?$', 'T0', 'git status'),
  rule('git-diff', 'git', '^diff( .*)?$', 'T0', 'git diff (workspace)'),
  rule('git-log', 'git', '^log( .*)?$', 'T0', 'git log'),
  rule('git-show', 'git', '^show( .*)?$', 'T0', 'git show'),
  rule('git-rev-parse', 'git', '^rev-parse( .*)?$', 'T0', 'git rev-parse'),
  rule('git-branch-list', 'git', '^branch( --list.*| -a| -r)?$', 'T0', 'git branch listing only'),
  rule('ls', 'ls', '^.*$', 'T0', 'list files'),
  rule('cat', 'cat', '^.*$', 'T0', 'read files'),
  rule('head', 'head', '^.*$', 'T0', 'read file heads'),
  rule('tail', 'tail', '^.*$', 'T0', 'read file tails (no follow)', '(^| )-f( |$)'),
  rule('grep', 'grep', '^.*$', 'T0', 'search file contents'),
  rule('rg', 'rg', '^.*$', 'T0', 'ripgrep search'),
  rule('wc', 'wc', '^.*$', 'T0', 'count lines/words'),
  rule('pwd', 'pwd', '^$', 'T0', 'print working directory'),
  rule('node-version', 'node', '^--version$', 'T0', 'node version'),
  rule('npm-version', 'npm', '^--version$', 'T0', 'npm version'),
  rule('npm-ls', 'npm', '^ls( .*)?$', 'T0', 'npm dependency tree'),
  rule('tsc-noemit', 'tsc', '^--noEmit( .*)?$', 'T0', 'typecheck only'),
  rule('npx-tsc-noemit', 'npx', '^tsc --noEmit( .*)?$', 'T0', 'typecheck via npx'),
  rule('eslint-check', 'eslint', '^(?!.*--fix).*$', 'T0', 'lint without fixing', '--fix'),
  rule('jest-list', 'jest', '^--listTests( .*)?$', 'T0', 'list tests'),

  // ---- T1: workspace-write --------------------------------------------------
  rule('git-add', 'git', '^add( .*)?$', 'T1', 'stage changes'),
  rule('git-commit', 'git', '^commit( .*)?$', 'T1', 'commit to workspace branch', '--amend|--no-verify'),
  rule('git-checkout-forge', 'git', '^checkout -b forge/.+$', 'T1', 'create forge/* branch'),
  rule('git-switch-forge', 'git', '^switch (-c )?forge/.+$', 'T1', 'switch to forge/* branch'),
  rule('git-restore', 'git', '^restore( .*)?$', 'T1', 'restore workspace files'),
  rule('git-reset', 'git', '^reset( --hard| --soft| --mixed)?( HEAD.*|[a-f0-9]{7,40})?$', 'T1', 'reset within workspace history'),
  rule('git-stash', 'git', '^stash( .*)?$', 'T1', 'stash workspace changes'),
  rule('jest-run', 'jest', '^(?!--listTests).*$', 'T1', 'run tests'),
  rule('eslint-fix', 'eslint', '^.*--fix.*$', 'T1', 'lint with autofix'),
  rule('tsc-build', 'tsc', '^(?!--noEmit).*$', 'T1', 'compile'),
  rule('npm-run', 'npm', '^run [a-zA-Z0-9:_.-]+( .*)?$', 'T1', 'run package scripts'),
  rule('npm-test', 'npm', '^test( .*)?$', 'T1', 'npm test'),
  rule('npx-turbo-run', 'npx', '^turbo run (build|test|lint|typecheck)( .*)?$', 'T1', 'turbo pipeline tasks'),
  rule('mkdir', 'mkdir', '^.*$', 'T1', 'create directories'),
  rule('touch', 'touch', '^.*$', 'T1', 'create files'),
  rule('cp', 'cp', '^.*$', 'T1', 'copy within workspace'),
  rule('mv', 'mv', '^.*$', 'T1', 'move within workspace'),
  rule('prettier', 'prettier', '^.*$', 'T1', 'format code'),

  // ---- T2: stateful-in-sandbox ----------------------------------------------
  rule('npm-install', 'npm', '^(install|ci|i)( .*)?$', 'T2', 'install deps (default registry only)', '--registry|--global|-g( |$)'),
  rule('npm-rebuild', 'npm', '^rebuild( .*)?$', 'T2', 'rebuild native deps'),

  // ---- T3: external — classification only; ALWAYS NEEDS_APPROVAL -------------
  rule('git-push-forge', 'git', '^push( -u| --set-upstream)?( origin)? forge/.+$', 'T3', 'push forge/* branch (human-approved)', '--force|-f( |$)|--force-with-lease|--delete|--mirror'),
];

export interface Classification {
  tier: RiskTier;
  ruleId: string;
}

export function classifyCommand(argv: string[], rules: CommandRule[]): Classification | null {
  const binary = argv[0] ?? '';
  const args = argv.slice(1).join(' ');
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.binary !== binary) continue;
    let argsRe: RegExp;
    try {
      argsRe = new RegExp(r.argsPattern);
    } catch {
      continue; // malformed rule never matches (fail closed)
    }
    if (!argsRe.test(args)) continue;
    if (r.forbiddenArgsPattern) {
      let forbiddenRe: RegExp;
      try {
        forbiddenRe = new RegExp(r.forbiddenArgsPattern);
      } catch {
        continue; // malformed forbidden pattern voids the rule (fail closed)
      }
      if (forbiddenRe.test(args)) continue;
    }
    return { tier: r.tier, ruleId: r.id };
  }
  return null;
}
