import { query, queryOne } from '@nova/shared';
import type { ForgeMode, PersonaSlug, RiskTier } from '@nova/agent-contracts';
import { DEFAULT_COMMAND_RULES, type CommandRule } from './rules';

// ============================================================================
// Runtime loaders. The DB is the source of truth (human-edited tables from
// migration 030); code constants are the reviewed fallback so the broker
// stays fail-closed and deterministic even if the DB is unreachable —
// note the fallback only ever narrows (defaults), never widens.
// ============================================================================

export async function loadCommandRules(): Promise<{ rules: CommandRule[]; source: 'db' | 'defaults' }> {
  try {
    const result = await query<{
      id: string;
      binary: string;
      args_pattern: string;
      forbidden_args_pattern: string | null;
      tier: RiskTier;
      description: string;
      enabled: boolean;
    }>(
      `SELECT id, "binary", args_pattern, forbidden_args_pattern, tier, description, enabled
       FROM forge_command_rules WHERE enabled = true ORDER BY tier ASC, id ASC`
    );
    if (result.rows.length > 0) {
      return {
        rules: result.rows.map((r) => ({
          id: r.id,
          binary: r.binary,
          argsPattern: r.args_pattern,
          forbiddenArgsPattern: r.forbidden_args_pattern,
          tier: r.tier,
          description: r.description,
          enabled: r.enabled,
        })),
        source: 'db',
      };
    }
  } catch {
    // fall through to defaults
  }
  return { rules: DEFAULT_COMMAND_RULES, source: 'defaults' };
}

/** Fallback persona grants — mirrors the migration 030 seed exactly. */
const FALLBACK_PERSONA_TIERS: Record<PersonaSlug, RiskTier> = {
  'intake-agent': 'T0',
  'architect-agent': 'T0',
  'repo-analyst-agent': 'T0',
  'product-agent': 'T0',
  'reviewer-agent': 'T0',
  'research-agent': 'T0',
  'coder-agent': 'T2',
  'test-agent': 'T2',
  'debug-agent': 'T2',
  'refactor-agent': 'T2',
  'docs-agent': 'T1',
  'toolsmith-agent': 'T1',
  'release-agent': 'T1',
};

export interface PersonaGrant {
  slug: PersonaSlug;
  maxAutoTier: RiskTier;
  enabled: boolean;
}

export async function loadPersonaGrant(slug: PersonaSlug): Promise<PersonaGrant> {
  try {
    const row = await queryOne<{ slug: PersonaSlug; max_auto_tier: RiskTier; enabled: boolean }>(
      'SELECT slug, max_auto_tier, enabled FROM agent_personas WHERE slug = $1',
      [slug]
    );
    if (row) {
      return { slug: row.slug, maxAutoTier: row.max_auto_tier, enabled: row.enabled };
    }
  } catch {
    // fall through to fallback
  }
  return { slug, maxAutoTier: FALLBACK_PERSONA_TIERS[slug] ?? 'T0', enabled: true };
}

export async function loadTaskMode(taskId: string | null | undefined): Promise<ForgeMode> {
  if (!taskId) {
    return (process.env.CMDX_DEFAULT_MODE as ForgeMode) || 'ASSIST';
  }
  try {
    const row = await queryOne<{ mode: ForgeMode }>(
      'SELECT mode FROM forge_tasks WHERE id = $1',
      [taskId]
    );
    if (row?.mode) return row.mode;
  } catch {
    // fall through
  }
  // Unknown task: most restrictive mode.
  return 'RECOMMEND';
}

export async function getCommandRequest(id: string): Promise<Record<string, unknown> | null> {
  try {
    return await queryOne('SELECT * FROM forge_command_requests WHERE id = $1', [id]);
  } catch {
    return null;
  }
}

export async function listCommandRequests(limit: number): Promise<Record<string, unknown>[]> {
  try {
    const result = await query(
      'SELECT * FROM forge_command_requests ORDER BY created_at DESC LIMIT $1',
      [Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows;
  } catch {
    return [];
  }
}

// ============================================
// In-memory rate tracking (per broker instance)
// ============================================

export interface RateUsage {
  commandsThisRun: number;
  commandsThisMinute: number;
  consecutiveFailures: number;
}

interface RateBucket {
  total: number;
  minuteWindowStart: number;
  minuteCount: number;
  consecutiveFailures: number;
}

export class RateTracker {
  private buckets = new Map<string, RateBucket>();

  constructor(private readonly now: () => number = Date.now) {}

  private bucket(key: string): RateBucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { total: 0, minuteWindowStart: this.now(), minuteCount: 0, consecutiveFailures: 0 };
      this.buckets.set(key, b);
    }
    const elapsed = this.now() - b.minuteWindowStart;
    if (elapsed >= 60_000) {
      b.minuteWindowStart = this.now();
      b.minuteCount = 0;
    }
    return b;
  }

  usage(key: string): RateUsage {
    const b = this.bucket(key);
    return {
      commandsThisRun: b.total,
      commandsThisMinute: b.minuteCount,
      consecutiveFailures: b.consecutiveFailures,
    };
  }

  recordDecision(key: string): void {
    const b = this.bucket(key);
    b.total += 1;
    b.minuteCount += 1;
  }

  recordOutcome(key: string, failed: boolean): void {
    const b = this.bucket(key);
    b.consecutiveFailures = failed ? b.consecutiveFailures + 1 : 0;
  }
}
