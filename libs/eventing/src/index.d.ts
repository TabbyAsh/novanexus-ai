import type { NovaEvent, ActorType, UUID } from '@nova/shared';
export { PostgresEventStore, getEventStore, ChainVerificationResult, ChainError } from './postgres-store';
/**
 * Event builder for creating properly formatted events
 */
export declare class EventBuilder {
    private orgId;
    private actorType;
    private actorId;
    private prevHash;
    constructor(orgId: UUID, actorType: ActorType, actorId: UUID);
    /**
     * Set the previous hash for chain continuity
     */
    setPrevHash(hash: string): this;
    /**
     * Build an event
     */
    build(type: string, payload: Record<string, unknown>): NovaEvent;
}
/**
 * Event emitter interface for publishing events
 */
export interface EventEmitter {
    emit(event: NovaEvent): Promise<void>;
    emitBatch(events: NovaEvent[]): Promise<void>;
}
/**
 * Event subscriber interface for consuming events
 */
export interface EventSubscriber {
    subscribe(eventTypes: string[], handler: EventHandler): void;
    unsubscribe(eventTypes: string[]): void;
}
/**
 * Event handler function type
 */
export type EventHandler = (event: NovaEvent) => Promise<void>;
/**
 * In-memory event bus for development/testing
 */
export declare class InMemoryEventBus implements EventEmitter, EventSubscriber {
    private events;
    private handlers;
    emit(event: NovaEvent): Promise<void>;
    emitBatch(events: NovaEvent[]): Promise<void>;
    subscribe(eventTypes: string[], handler: EventHandler): void;
    unsubscribe(eventTypes: string[]): void;
    /**
     * Get all events (for testing)
     */
    getEvents(): NovaEvent[];
    /**
     * Get events by type
     */
    getEventsByType(type: string): NovaEvent[];
    /**
     * Clear all events (for testing)
     */
    clear(): void;
    private notifyHandlers;
}
/**
 * Verify event chain integrity
 */
export declare function verifyEventChain(events: NovaEvent[]): boolean;
/**
 * Event filter for querying events
 */
export interface EventFilter {
    orgId?: UUID;
    actorType?: ActorType;
    actorId?: UUID;
    types?: string[];
    fromTs?: string;
    toTs?: string;
    limit?: number;
    offset?: number;
}
/**
 * Filter events based on criteria
 */
export declare function filterEvents(events: NovaEvent[], filter: EventFilter): NovaEvent[];
