import type { NovaEvent, ActorType, UUID } from '@nova/shared';
import type { EventEmitter, EventFilter } from './index';
/**
 * PostgreSQL-backed Event Store with append-only writes and hash chain integrity
 */
export declare class PostgresEventStore implements EventEmitter {
    /**
     * Append a single event to the store with hash chain verification
     */
    emit(event: NovaEvent): Promise<void>;
    /**
     * Append multiple events atomically
     */
    emitBatch(events: NovaEvent[]): Promise<void>;
    /**
     * Create and persist a new event, handling hash chain automatically
     */
    createEvent(orgId: UUID, actorType: ActorType, actorId: UUID, type: string, payload: Record<string, unknown>): Promise<NovaEvent>;
    /**
     * Get events with filtering and pagination
     */
    getEvents(filter: EventFilter): Promise<NovaEvent[]>;
    /**
     * Get a single event by ID
     */
    getEventById(eventId: UUID): Promise<NovaEvent | null>;
    /**
     * Verify hash chain integrity for an organization
     * Returns details about any corruption found
     */
    verifyChain(orgId: UUID): Promise<ChainVerificationResult>;
    /**
     * Count events by type for an organization
     */
    countEventsByType(orgId: UUID): Promise<Record<string, number>>;
    /**
     * Get total event count for an organization
     */
    getTotalCount(orgId?: UUID): Promise<number>;
    private appendEventWithClient;
    private insertEvent;
    private getEventsChronological;
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
export declare function getEventStore(): PostgresEventStore;
