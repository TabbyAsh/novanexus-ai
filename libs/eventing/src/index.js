"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryEventBus = exports.EventBuilder = exports.getEventStore = exports.PostgresEventStore = void 0;
exports.verifyEventChain = verifyEventChain;
exports.filterEvents = filterEvents;
const shared_1 = require("@nova/shared");
// Re-export PostgresEventStore
var postgres_store_1 = require("./postgres-store");
Object.defineProperty(exports, "PostgresEventStore", { enumerable: true, get: function () { return postgres_store_1.PostgresEventStore; } });
Object.defineProperty(exports, "getEventStore", { enumerable: true, get: function () { return postgres_store_1.getEventStore; } });
/**
 * Event builder for creating properly formatted events
 */
class EventBuilder {
    orgId;
    actorType;
    actorId;
    prevHash = '0'.repeat(64); // Genesis hash
    constructor(orgId, actorType, actorId) {
        this.orgId = orgId;
        this.actorType = actorType;
        this.actorId = actorId;
    }
    /**
     * Set the previous hash for chain continuity
     */
    setPrevHash(hash) {
        this.prevHash = hash;
        return this;
    }
    /**
     * Build an event
     */
    build(type, payload) {
        const id = (0, shared_1.generateId)();
        const ts = (0, shared_1.nowTimestamp)();
        const hash = (0, shared_1.computeEventHash)(this.prevHash, payload, type, ts, this.actorType, this.actorId);
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
exports.EventBuilder = EventBuilder;
/**
 * In-memory event bus for development/testing
 */
class InMemoryEventBus {
    events = [];
    handlers = new Map();
    async emit(event) {
        this.events.push(event);
        await this.notifyHandlers(event);
    }
    async emitBatch(events) {
        for (const event of events) {
            await this.emit(event);
        }
    }
    subscribe(eventTypes, handler) {
        for (const type of eventTypes) {
            const existing = this.handlers.get(type) || [];
            existing.push(handler);
            this.handlers.set(type, existing);
        }
    }
    unsubscribe(eventTypes) {
        for (const type of eventTypes) {
            this.handlers.delete(type);
        }
    }
    /**
     * Get all events (for testing)
     */
    getEvents() {
        return [...this.events];
    }
    /**
     * Get events by type
     */
    getEventsByType(type) {
        return this.events.filter((e) => e.type === type);
    }
    /**
     * Clear all events (for testing)
     */
    clear() {
        this.events = [];
    }
    async notifyHandlers(event) {
        const handlers = this.handlers.get(event.type) || [];
        const wildcardHandlers = this.handlers.get('*') || [];
        for (const handler of [...handlers, ...wildcardHandlers]) {
            try {
                await handler(event);
            }
            catch (error) {
                console.error(`Event handler error for ${event.type}:`, error);
            }
        }
    }
}
exports.InMemoryEventBus = InMemoryEventBus;
/**
 * Verify event chain integrity
 */
function verifyEventChain(events) {
    if (events.length === 0)
        return true;
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        // Verify hash computation
        const expectedHash = (0, shared_1.computeEventHash)(event.prevHash, event.payload, event.type, event.ts, event.actorType, event.actorId);
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
 * Filter events based on criteria
 */
function filterEvents(events, filter) {
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
        result = result.filter((e) => filter.types.includes(e.type));
    }
    if (filter.fromTs) {
        result = result.filter((e) => e.ts >= filter.fromTs);
    }
    if (filter.toTs) {
        result = result.filter((e) => e.ts <= filter.toTs);
    }
    // Sort by timestamp descending
    result.sort((a, b) => b.ts.localeCompare(a.ts));
    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    result = result.slice(offset, offset + limit);
    return result;
}
