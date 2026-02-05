import type { NovaEvent, ActorType, UUID } from '@nova/shared';
import { generateId, nowTimestamp, computeEventHash } from '@nova/shared';

// Re-export PostgresEventStore
export { PostgresEventStore, getEventStore, ChainVerificationResult, ChainError } from './postgres-store';

/**
 * Event builder for creating properly formatted events
 */
export class EventBuilder {
  private orgId: UUID;
  private actorType: ActorType;
  private actorId: UUID;
  private prevHash: string = '0'.repeat(64); // Genesis hash

  constructor(orgId: UUID, actorType: ActorType, actorId: UUID) {
    this.orgId = orgId;
    this.actorType = actorType;
    this.actorId = actorId;
  }

  /**
   * Set the previous hash for chain continuity
   */
  setPrevHash(hash: string): this {
    this.prevHash = hash;
    return this;
  }

  /**
   * Build an event
   */
  build(type: string, payload: Record<string, unknown>): NovaEvent {
    const id = generateId();
    const ts = nowTimestamp();
    const hash = computeEventHash(
      this.prevHash,
      payload,
      type,
      ts,
      this.actorType,
      this.actorId
    );

    return {
      id,
      orgId: this.orgId,
      actorType: this.actorType,
      actorId: this.actorId,
      type,
      ts,
      payload,
      prevHash: this.prevHash,
      hash,
    };
  }
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
export class InMemoryEventBus implements EventEmitter, EventSubscriber {
  private events: NovaEvent[] = [];
  private handlers: Map<string, EventHandler[]> = new Map();

  async emit(event: NovaEvent): Promise<void> {
    this.events.push(event);
    await this.notifyHandlers(event);
  }

  async emitBatch(events: NovaEvent[]): Promise<void> {
    for (const event of events) {
      await this.emit(event);
    }
  }

  subscribe(eventTypes: string[], handler: EventHandler): void {
    for (const type of eventTypes) {
      const existing = this.handlers.get(type) || [];
      existing.push(handler);
      this.handlers.set(type, existing);
    }
  }

  unsubscribe(eventTypes: string[]): void {
    for (const type of eventTypes) {
      this.handlers.delete(type);
    }
  }

  /**
   * Get all events (for testing)
   */
  getEvents(): NovaEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string): NovaEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events = [];
  }

  private async notifyHandlers(event: NovaEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    const wildcardHandlers = this.handlers.get('*') || [];
    
    for (const handler of [...handlers, ...wildcardHandlers]) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Event handler error for ${event.type}:`, error);
      }
    }
  }
}

/**
 * Verify event chain integrity
 */
export function verifyEventChain(events: NovaEvent[]): boolean {
  if (events.length === 0) return true;

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
      console.error(`Hash mismatch at event ${i}: ${event.id}`);
      return false;
    }

    // Verify chain linkage (except for first event)
    if (i > 0 && event.prevHash !== events[i - 1].hash) {
      console.error(`Chain break at event ${i}: ${event.id}`);
      return false;
    }
  }

  return true;
}

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
export function filterEvents(events: NovaEvent[], filter: EventFilter): NovaEvent[] {
  let result = events;

  if (filter.orgId) {
    result = result.filter((e) => e.orgId === filter.orgId);
  }

  if (filter.actorType) {
    result = result.filter((e) => e.actorType === filter.actorType);
  }

  if (filter.actorId) {
    result = result.filter((e) => e.actorId === filter.actorId);
  }

  if (filter.types && filter.types.length > 0) {
    result = result.filter((e) => filter.types!.includes(e.type));
  }

  if (filter.fromTs) {
    result = result.filter((e) => e.ts >= filter.fromTs!);
  }

  if (filter.toTs) {
    result = result.filter((e) => e.ts <= filter.toTs!);
  }

  // Sort by timestamp descending
  result.sort((a, b) => b.ts.localeCompare(a.ts));

  // Apply pagination
  const offset = filter.offset || 0;
  const limit = filter.limit || 100;
  result = result.slice(offset, offset + limit);

  return result;
}
