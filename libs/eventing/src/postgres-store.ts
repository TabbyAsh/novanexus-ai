import { PoolClient } from 'pg';
import type { NovaEvent, ActorType, UUID } from '@nova/shared';
import { query, queryOne, transaction, computeEventHash, nowTimestamp, generateId } from '@nova/shared';
import type { EventEmitter, EventFilter } from './index';

/**
 * PostgreSQL-backed Event Store with append-only writes and hash chain integrity
 */
export class PostgresEventStore implements EventEmitter {
  /**
   * Append a single event to the store with hash chain verification
   */
  async emit(event: NovaEvent): Promise<void> {
    await transaction(async (client) => {
      await this.appendEventWithClient(client, event);
    });
  }

  /**
   * Append multiple events atomically
   */
  async emitBatch(events: NovaEvent[]): Promise<void> {
    if (events.length === 0) return;

    await transaction(async (client) => {
      for (const event of events) {
        await this.appendEventWithClient(client, event);
      }
    });
  }

  /**
   * Create and persist a new event, handling hash chain automatically
   */
  async createEvent(
    orgId: UUID,
    actorType: ActorType,
    actorId: UUID,
    type: string,
    payload: Record<string, unknown>
  ): Promise<NovaEvent> {
    return await transaction(async (client) => {
      // Get the last event hash for this org (for chain continuity)
      const lastEvent = await client.query<{ hash: string }>(
        'SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1 FOR UPDATE',
        [orgId]
      );
      const prevHash = lastEvent.rows[0]?.hash || '0'.repeat(64);

      const id = generateId();
      const ts = nowTimestamp();
      const hash = computeEventHash(prevHash, payload, type, ts, actorType, actorId);

      const event: NovaEvent = {
        id,
        orgId,
        actorType,
        actorId,
        type,
        ts,
        payload,
        prevHash,
        hash,
      };

      await this.insertEvent(client, event);
      return event;
    });
  }

  /**
   * Get events with filtering and pagination
   */
  async getEvents(filter: EventFilter): Promise<NovaEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.orgId) {
      conditions.push(`org_id = $${paramIndex++}`);
      params.push(filter.orgId);
    }

    if (filter.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filter.actorType);
    }

    if (filter.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(filter.actorId);
    }

    if (filter.types && filter.types.length > 0) {
      conditions.push(`type = ANY($${paramIndex++})`);
      params.push(filter.types);
    }

    if (filter.fromTs) {
      conditions.push(`ts >= $${paramIndex++}`);
      params.push(filter.fromTs);
    }

    if (filter.toTs) {
      conditions.push(`ts <= $${paramIndex++}`);
      params.push(filter.toTs);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit || 100;
    const offset = filter.offset || 0;

    const sql = `
      SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
      FROM events
      ${whereClause}
      ORDER BY ts DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const result = await query<{
      id: string;
      org_id: string;
      actor_type: ActorType;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: Record<string, unknown>;
      prev_hash: string;
      hash: string;
    }>(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      type: row.type,
      ts: new Date(row.ts).toISOString(),
      payload: row.payload_json,
      prevHash: row.prev_hash,
      hash: row.hash,
    }));
  }

  /**
   * Get a single event by ID
   */
  async getEventById(eventId: UUID): Promise<NovaEvent | null> {
    const row = await queryOne<{
      id: string;
      org_id: string;
      actor_type: ActorType;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: Record<string, unknown>;
      prev_hash: string;
      hash: string;
    }>(
      'SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash FROM events WHERE id = $1',
      [eventId]
    );

    if (!row) return null;

    return {
      id: row.id,
      orgId: row.org_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      type: row.type,
      ts: new Date(row.ts).toISOString(),
      payload: row.payload_json,
      prevHash: row.prev_hash,
      hash: row.hash,
    };
  }

  /**
   * Verify hash chain integrity for an organization
   * Returns details about any corruption found
   */
  async verifyChain(orgId: UUID): Promise<ChainVerificationResult> {
    const events = await this.getEventsChronological(orgId);

    if (events.length === 0) {
      return { valid: true, eventCount: 0, errors: [] };
    }

    const errors: ChainError[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Verify hash computation
      const expectedHash = computeEventHash(
        event.prevHash,
        event.payload,
        event.type,
        event.ts,
        event.actorType,
        event.actorId
      );

      if (event.hash !== expectedHash) {
        errors.push({
          eventId: event.id,
          eventIndex: i,
          errorType: 'HASH_MISMATCH',
          message: `Hash mismatch: expected ${expectedHash}, got ${event.hash}`,
        });
      }

      // Verify chain linkage (except for first event)
      if (i > 0) {
        const prevEvent = events[i - 1];
        if (event.prevHash !== prevEvent.hash) {
          errors.push({
            eventId: event.id,
            eventIndex: i,
            errorType: 'CHAIN_BREAK',
            message: `Chain break: prevHash ${event.prevHash} does not match previous event hash ${prevEvent.hash}`,
          });
        }
      } else {
        // First event should have genesis hash
        if (event.prevHash !== '0'.repeat(64)) {
          errors.push({
            eventId: event.id,
            eventIndex: i,
            errorType: 'INVALID_GENESIS',
            message: `First event should have genesis prevHash, got ${event.prevHash}`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      eventCount: events.length,
      errors,
      firstEventTs: events[0]?.ts,
      lastEventTs: events[events.length - 1]?.ts,
    };
  }

  /**
   * Count events by type for an organization
   */
  async countEventsByType(orgId: UUID): Promise<Record<string, number>> {
    const result = await query<{ type: string; count: string }>(
      'SELECT type, COUNT(*) as count FROM events WHERE org_id = $1 GROUP BY type ORDER BY count DESC',
      [orgId]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.type] = parseInt(row.count, 10);
    }
    return counts;
  }

  /**
   * Get total event count for an organization
   */
  async getTotalCount(orgId?: UUID): Promise<number> {
    const sql = orgId
      ? 'SELECT COUNT(*) as count FROM events WHERE org_id = $1'
      : 'SELECT COUNT(*) as count FROM events';
    const params = orgId ? [orgId] : [];
    const result = await queryOne<{ count: string }>(sql, params);
    return parseInt(result?.count || '0', 10);
  }

  // ============================================
  // Private helpers
  // ============================================

  private async appendEventWithClient(client: PoolClient, event: NovaEvent): Promise<void> {
    // Verify the hash is correct before inserting
    const expectedHash = computeEventHash(
      event.prevHash,
      event.payload,
      event.type,
      event.ts,
      event.actorType,
      event.actorId
    );

    if (event.hash !== expectedHash) {
      throw new Error(`Event hash mismatch: computed ${expectedHash}, provided ${event.hash}`);
    }

    // Verify chain continuity
    const lastEvent = await client.query<{ hash: string }>(
      'SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1 FOR UPDATE',
      [event.orgId]
    );

    const expectedPrevHash = lastEvent.rows[0]?.hash || '0'.repeat(64);
    if (event.prevHash !== expectedPrevHash) {
      throw new Error(
        `Chain continuity violation: expected prevHash ${expectedPrevHash}, got ${event.prevHash}`
      );
    }

    await this.insertEvent(client, event);
  }

  private async insertEvent(client: PoolClient, event: NovaEvent): Promise<void> {
    await client.query(
      `INSERT INTO events (id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        event.orgId,
        event.actorType,
        event.actorId,
        event.type,
        event.ts,
        JSON.stringify(event.payload),
        event.prevHash,
        event.hash,
      ]
    );
  }

  private async getEventsChronological(orgId: UUID): Promise<NovaEvent[]> {
    const result = await query<{
      id: string;
      org_id: string;
      actor_type: ActorType;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: Record<string, unknown>;
      prev_hash: string;
      hash: string;
    }>(
      'SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash FROM events WHERE org_id = $1 ORDER BY ts ASC',
      [orgId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      type: row.type,
      ts: new Date(row.ts).toISOString(),
      payload: row.payload_json,
      prevHash: row.prev_hash,
      hash: row.hash,
    }));
  }
}

/**
 * Result of chain verification
 */
export interface ChainVerificationResult {
  valid: boolean;
  eventCount: number;
  errors: ChainError[];
  firstEventTs?: string;
  lastEventTs?: string;
}

/**
 * Error found during chain verification
 */
export interface ChainError {
  eventId: string;
  eventIndex: number;
  errorType: 'HASH_MISMATCH' | 'CHAIN_BREAK' | 'INVALID_GENESIS';
  message: string;
}

// Singleton instance for convenience
let defaultStore: PostgresEventStore | null = null;

export function getEventStore(): PostgresEventStore {
  if (!defaultStore) {
    defaultStore = new PostgresEventStore();
  }
  return defaultStore;
}
