// ============================================================================
// CmdX static denylist — the "never, in any mode, at any trust" layer.
// Pure functions, no I/O: fully unit-testable.
//
// Commands arrive as argv arrays (enforced by @nova/agent-contracts). These
// checks assume NO shell is ever involved (the sandbox driver never uses
// shell:true); the denylist is defense-in-depth on top of that guarantee.
// ============================================================================

export interface DenyVerdict {
  code: string;
  detail: string;
}

/** Binaries agents may never invoke, in any mode. */
const FORBIDDEN_BINARIES = new Set([
  // privilege / system
  'sudo', 'su', 'doas', 'mount', 'umount', 'mkfs', 'dd', 'shutdown', 'reboot',
  'systemctl', 'service', 'crontab', 'at', 'chroot',
  // remote shells / raw sockets / file transfer
  'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'netcat', 'telnet', 'ftp',
  // network fetchers (research goes through the brokered web tool, not curl)
  'curl', 'wget',
  // container / cluster escape vectors
  'docker', 'dockerd', 'docker-compose', 'kubectl', 'helm', 'nerdctl', 'podman',
  // deploy / billing / cloud CLIs — human rituals, never agent commands
  'railway', 'vercel', 'stripe', 'gh', 'aws', 'gcloud', 'az', 'terraform',
  'ansible', 'packer', 'flyctl', 'heroku',
]);

/** Shell interpreters: agents must send structured argv, never shell strings. */
const SHELL_INTERPRETERS = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell',
  'powershell.exe', 'cmd', 'cmd.exe',
]);

/** Binaries that write/delete/move: subject to path discipline. */
const WRITE_BINARIES = new Set([
  'rm', 'rimraf', 'mv', 'cp', 'mkdir', 'touch', 'sed', 'tee', 'truncate',
  'chmod', 'chown', 'ln', 'unlink', 'rmdir', 'shred',
]);

/** Args that only make sense if the requester hopes a shell will parse them. */
const STANDALONE_SHELL_TOKENS = new Set(['|', ';', '&', '&&', '||', '>', '>>', '<', '<<']);

/** Sandbox DSN hosts must self-identify as sandbox resources. */
const DSN_REGEX = /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([^\s/@]*@)?([^\s/:]+)/i;

function isAbsoluteOrEscapingPath(arg: string): boolean {
  if (arg.startsWith('-')) return false; // flags handled elsewhere
  const p = arg.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(p)) return true; // windows drive root
  if (p.startsWith('/') || p.startsWith('~')) return true;
  if (p === '..' || p.startsWith('../') || p.includes('/../')) return true;
  return false;
}

function normalizeRelPath(arg: string): string {
  return arg.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Minimal glob matcher for protected paths: supports exact matches and
 * `dir/**` prefixes. Intentionally simple and reviewable.
 */
export function matchesProtectedPath(argPath: string, protectedPaths: string[]): boolean {
  const p = normalizeRelPath(argPath);
  for (const pattern of protectedPaths) {
    const pat = normalizeRelPath(pattern);
    if (pat.endsWith('/**')) {
      const prefix = pat.slice(0, -3);
      if (p === prefix || p.startsWith(`${prefix}/`)) return true;
    } else if (p === pat) {
      return true;
    }
  }
  return false;
}

function checkGitCommand(args: string[]): DenyVerdict | null {
  const sub = args[0] ?? '';
  const joined = args.join(' ');

  if (sub === 'push') {
    if (/(^| )(--force|--force-with-lease|--mirror|--delete|-f)( |$)/.test(joined)) {
      return { code: 'GIT_FORCE_PUSH', detail: 'force/mirror/delete pushes are never allowed' };
    }
    // Determine the refspec being pushed; require an explicit forge/* target.
    const positional = args.slice(1).filter((a) => !a.startsWith('-'));
    // positional: [remote?, refspec?]
    const refspec = positional.length >= 2 ? positional[positional.length - 1] : undefined;
    if (!refspec) {
      return { code: 'GIT_PUSH_IMPLICIT', detail: 'push requires an explicit forge/* refspec' };
    }
    const dst = refspec.includes(':') ? refspec.split(':').pop() ?? '' : refspec;
    const normalized = dst.replace(/^refs\/heads\//, '');
    if (!normalized.startsWith('forge/')) {
      return { code: 'GIT_BRANCH_GUARD', detail: `pushes are restricted to forge/* branches (got '${dst}')` };
    }
    return null; // classified T3 by rules → NEEDS_APPROVAL downstream
  }

  if (sub === 'remote' && args.length > 1 && ['add', 'set-url', 'remove', 'rm'].includes(args[1])) {
    return { code: 'GIT_REMOTE_MUTATION', detail: 'changing remotes is an exfiltration vector' };
  }

  if (sub === 'config') {
    if (/(^| )(--global|--system)( |$)/.test(joined)) {
      return { code: 'GIT_CONFIG_SCOPE', detail: 'global/system git config is off-limits' };
    }
    if (/credential|core\.sshcommand|http\.proxy|url\./i.test(joined)) {
      return { code: 'GIT_CONFIG_SENSITIVE', detail: 'credential/transport git config is off-limits' };
    }
  }

  if (sub === 'filter-branch' || sub === 'filter-repo' || (sub === 'reflog' && args[1] === 'expire')) {
    return { code: 'GIT_HISTORY_REWRITE', detail: 'history rewriting is never allowed' };
  }

  return null;
}

/**
 * Evaluate the static denylist. Returns a verdict when the command is
 * categorically denied; null means "not denied here" (allowlist/classifier
 * still applies — absence of a deny is NOT an allow).
 */
export function checkDenylist(argv: string[], protectedPaths: string[]): DenyVerdict | null {
  const binary = (argv[0] ?? '').toLowerCase();
  const bare = binary.split('/').pop()?.split('\\').pop() ?? binary;
  const args = argv.slice(1);

  if (bare !== binary || binary.includes('/') || binary.includes('\\')) {
    return { code: 'BINARY_PATH', detail: 'binaries must be invoked by bare name, not path' };
  }

  if (SHELL_INTERPRETERS.has(bare)) {
    return { code: 'SHELL_INTERPRETER', detail: 'shells are never allowed; send structured argv' };
  }

  if (FORBIDDEN_BINARIES.has(bare)) {
    return { code: 'FORBIDDEN_BINARY', detail: `'${bare}' is never allowed for agents` };
  }

  for (const arg of args) {
    if (STANDALONE_SHELL_TOKENS.has(arg)) {
      return { code: 'SHELL_METACHAR', detail: `standalone shell token '${arg}' has no meaning in argv` };
    }
    if (arg.includes('`') || arg.includes('$(')) {
      return { code: 'COMMAND_SUBSTITUTION', detail: 'command substitution syntax is never allowed' };
    }
  }

  // Supply-chain and package-manager guards.
  if (['npm', 'yarn', 'pnpm'].includes(bare)) {
    const sub = args[0] ?? '';
    if (['publish', 'adduser', 'login', 'logout', 'token', 'owner', 'access', 'config', 'set', 'exec', 'version', 'deprecate'].includes(sub)) {
      return { code: 'PACKAGE_SUPPLY_CHAIN', detail: `'${bare} ${sub}' is never allowed for agents` };
    }
  }
  if (bare === 'npx' && args.some((a) => a === '-y' || a === '--yes')) {
    return { code: 'NPX_AUTO_INSTALL', detail: 'npx -y auto-installs arbitrary code' };
  }

  // Write-path discipline: workspace-relative only, protected paths immutable.
  if (WRITE_BINARIES.has(bare)) {
    for (const arg of args) {
      if (isAbsoluteOrEscapingPath(arg)) {
        return { code: 'PATH_ESCAPE', detail: `'${arg}' escapes the workspace (absolute or ..)` };
      }
      if (!arg.startsWith('-') && matchesProtectedPath(arg, protectedPaths)) {
        return { code: 'PROTECTED_PATH', detail: `'${arg}' is control-plane protected` };
      }
    }
    if (/(^| )--no-preserve-root( |$)/.test(args.join(' '))) {
      return { code: 'DESTRUCTIVE_ROOT', detail: '--no-preserve-root is never allowed' };
    }
  }

  // Redirecting sed/tee style edits into protected paths via flags is covered
  // by the loop above (path args are positional for these binaries).

  if (bare === 'git') {
    const verdict = checkGitCommand(args);
    if (verdict) return verdict;
    // git write-ish subcommands touching protected paths
    const sub = args[0] ?? '';
    if (['checkout', 'restore', 'apply', 'clean', 'rm', 'mv'].includes(sub)) {
      for (const arg of args.slice(1)) {
        if (!arg.startsWith('-') && matchesProtectedPath(arg, protectedPaths)) {
          return { code: 'PROTECTED_PATH', detail: `'${arg}' is control-plane protected` };
        }
      }
    }
  }

  // Database clients: sandbox DSNs only.
  const dbClients = new Set(['psql', 'pg_dump', 'pg_restore', 'mysql', 'mysqldump', 'mongosh', 'mongo', 'redis-cli']);
  for (const arg of args) {
    const m = DSN_REGEX.exec(arg);
    if (m) {
      const host = (m[3] ?? '').toLowerCase();
      if (!host.includes('sandbox')) {
        return { code: 'NON_SANDBOX_DSN', detail: `connection to '${host}' is not a sandbox resource` };
      }
    }
  }
  if (dbClients.has(bare)) {
    const joined = args.join(' ');
    const hostFlag = /(?:^| )(?:-h|--host)[ =]([^\s]+)/.exec(joined);
    if (hostFlag && !hostFlag[1].toLowerCase().includes('sandbox')) {
      return { code: 'NON_SANDBOX_DSN', detail: `db host '${hostFlag[1]}' is not a sandbox resource` };
    }
    if (!DSN_REGEX.test(joined) && !hostFlag) {
      // Implicit localhost/env-based connection: env is sanitized, but deny
      // anyway — db access must be explicit and sandbox-addressed.
      return { code: 'IMPLICIT_DB_TARGET', detail: 'db clients must target an explicit sandbox host' };
    }
  }

  return null;
}

export const DEFAULT_PROTECTED_PATHS = [
  'nova.constraints.yaml',
  'CODEOWNERS',
  '.github/workflows/**',
  'services/cmdx/**',
  'libs/policy/**',
  'libs/agent-contracts/**',
  'services/forge-evals/**',
  'infra/migrations/**',
];
