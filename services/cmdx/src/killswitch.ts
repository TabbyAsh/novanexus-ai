import { queryOne } from '@nova/shared';

// Shares the orchestrator's kill-switch state (system_state.kill_switch).
// Cached with a short TTL so a flipped switch drains CmdX within <=5s while
// avoiding a DB round-trip per command.

const TTL_MS = Number(process.env.CMDX_KILLSWITCH_TTL_MS || 5000);

interface CacheEntry {
  enabled: boolean;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

export async function isKillSwitchEnabled(now: () => number = Date.now): Promise<boolean> {
  if (cache && now() - cache.fetchedAt < TTL_MS) {
    return cache.enabled;
  }
  try {
    const row = await queryOne<{ value_json: unknown }>(
      "SELECT value_json FROM system_state WHERE key = 'kill_switch'"
    );
    let enabled = false;
    if (row) {
      const value =
        typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
      enabled = Boolean((value as { enabled?: boolean })?.enabled);
    }
    cache = { enabled, fetchedAt: now() };
    return enabled;
  } catch {
    // Fail closed: if we cannot read the switch, treat it as engaged.
    cache = { enabled: true, fetchedAt: now() };
    return true;
  }
}

export function _resetKillSwitchCache(): void {
  cache = null;
}
