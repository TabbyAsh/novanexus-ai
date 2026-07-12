import { queryOne } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('automation-authority');

/** Autonomous work is allowed only when the shared authority state is present,
 * readable, and explicitly not killed. Missing infrastructure fails closed. */
export async function automationAllowed(): Promise<boolean> {
  try {
    const row = await queryOne<{ value_json: string | { enabled?: boolean } }>(
      `SELECT value_json FROM system_state WHERE key = 'kill_switch'`,
    );
    if (!row) return false;
    const state = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    return state?.enabled !== true;
  } catch (err) {
    logger.error('Automation authority unavailable; failing closed', err as Error);
    return false;
  }
}
