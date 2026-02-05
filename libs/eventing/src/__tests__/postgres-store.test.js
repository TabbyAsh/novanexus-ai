"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_store_1 = require("../postgres-store");
const shared_1 = require("@nova/shared");
// Mock pg module
jest.mock('pg', () => {
    const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
    };
    const mockPool = {
        query: jest.fn(),
        connect: jest.fn(() => Promise.resolve(mockClient)),
        end: jest.fn(),
        on: jest.fn(),
    };
    return {
        Pool: jest.fn(() => mockPool),
    };
});
// Get the mocked pool
const pg_1 = require("pg");
const mockPool = new pg_1.Pool();
const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
};
describe('PostgresEventStore', () => {
    let store;
    const testOrgId = 'org-123';
    const testActorId = 'user-456';
    beforeEach(() => {
        jest.clearAllMocks();
        store = new postgres_store_1.PostgresEventStore();
        mockPool.connect.mockResolvedValue(mockClient);
        mockClient.query.mockImplementation((sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [], rowCount: 0 });
            }
            return Promise.resolve({ rows: [], rowCount: 0 });
        });
    });
    describe('createEvent', () => {
        it('should create event with correct hash chain', async () => {
            // Mock empty chain (genesis)
            mockClient.query.mockImplementation((sql, params) => {
                if (sql.includes('SELECT hash FROM events')) {
                    return Promise.resolve({ rows: [] });
                }
                if (sql.includes('INSERT INTO events')) {
                    return Promise.resolve({ rowCount: 1 });
                }
                return Promise.resolve({ rows: [], rowCount: 0 });
            });
            const event = await store.createEvent(testOrgId, 'USER', testActorId, 'test.event.created', { test: 'data' });
            expect(event.orgId).toBe(testOrgId);
            expect(event.actorType).toBe('USER');
            expect(event.actorId).toBe(testActorId);
            expect(event.type).toBe('test.event.created');
            expect(event.prevHash).toBe('0'.repeat(64));
            expect(event.hash).toHaveLength(64);
            // Verify hash is correctly computed
            const expectedHash = (0, shared_1.computeEventHash)(event.prevHash, event.payload, event.type, event.ts, event.actorType, event.actorId);
            expect(event.hash).toBe(expectedHash);
        });
        it('should chain events correctly', async () => {
            const firstEventHash = 'abc123'.padEnd(64, '0');
            // Mock existing chain
            mockClient.query.mockImplementation((sql) => {
                if (sql.includes('SELECT hash FROM events')) {
                    return Promise.resolve({ rows: [{ hash: firstEventHash }] });
                }
                if (sql.includes('INSERT INTO events')) {
                    return Promise.resolve({ rowCount: 1 });
                }
                return Promise.resolve({ rows: [], rowCount: 0 });
            });
            const event = await store.createEvent(testOrgId, 'USER', testActorId, 'test.event.second', { sequence: 2 });
            expect(event.prevHash).toBe(firstEventHash);
        });
    });
    describe('emit - append-only enforcement', () => {
        it('should reject events with incorrect hash', async () => {
            mockClient.query.mockImplementation((sql) => {
                if (sql.includes('SELECT hash FROM events')) {
                    return Promise.resolve({ rows: [] });
                }
                return Promise.resolve({ rows: [], rowCount: 0 });
            });
            const badEvent = {
                id: (0, shared_1.generateId)(),
                orgId: testOrgId,
                actorType: 'USER',
                actorId: testActorId,
                type: 'test.event',
                ts: (0, shared_1.nowTimestamp)(),
                payload: { data: 'test' },
                prevHash: '0'.repeat(64),
                hash: 'wrong_hash_that_does_not_match_computation',
            };
            await expect(store.emit(badEvent)).rejects.toThrow('Event hash mismatch');
        });
        it('should reject events with broken chain', async () => {
            const existingHash = 'existing_hash'.padEnd(64, '0');
            mockClient.query.mockImplementation((sql) => {
                if (sql.includes('SELECT hash FROM events')) {
                    return Promise.resolve({ rows: [{ hash: existingHash }] });
                }
                return Promise.resolve({ rows: [], rowCount: 0 });
            });
            const ts = (0, shared_1.nowTimestamp)();
            const payload = { data: 'test' };
            const wrongPrevHash = 'wrong_prev_hash'.padEnd(64, '0');
            const hash = (0, shared_1.computeEventHash)(wrongPrevHash, payload, 'test.event', ts, 'USER', testActorId);
            const badEvent = {
                id: (0, shared_1.generateId)(),
                orgId: testOrgId,
                actorType: 'USER',
                actorId: testActorId,
                type: 'test.event',
                ts,
                payload,
                prevHash: wrongPrevHash,
                hash,
            };
            await expect(store.emit(badEvent)).rejects.toThrow('Chain continuity violation');
        });
    });
});
describe('Hash Chain Integrity', () => {
    it('should compute consistent hashes', () => {
        const prevHash = '0'.repeat(64);
        const payload = { action: 'test', value: 123 };
        const type = 'test.event';
        const ts = '2024-01-01T00:00:00.000Z';
        const actorType = 'USER';
        const actorId = 'user-123';
        // Compute hash multiple times - should be deterministic
        const hash1 = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, actorType, actorId);
        const hash2 = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, actorType, actorId);
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64);
    });
    it('should detect payload tampering', () => {
        const prevHash = '0'.repeat(64);
        const originalPayload = { amount: 100 };
        const tamperedPayload = { amount: 1000 };
        const type = 'payment.created';
        const ts = '2024-01-01T00:00:00.000Z';
        const actorType = 'USER';
        const actorId = 'user-123';
        const originalHash = (0, shared_1.computeEventHash)(prevHash, originalPayload, type, ts, actorType, actorId);
        const tamperedHash = (0, shared_1.computeEventHash)(prevHash, tamperedPayload, type, ts, actorType, actorId);
        expect(originalHash).not.toBe(tamperedHash);
    });
    it('should detect timestamp tampering', () => {
        const prevHash = '0'.repeat(64);
        const payload = { action: 'test' };
        const type = 'test.event';
        const actorType = 'USER';
        const actorId = 'user-123';
        const ts1 = '2024-01-01T00:00:00.000Z';
        const ts2 = '2024-01-01T00:00:01.000Z';
        const hash1 = (0, shared_1.computeEventHash)(prevHash, payload, type, ts1, actorType, actorId);
        const hash2 = (0, shared_1.computeEventHash)(prevHash, payload, type, ts2, actorType, actorId);
        expect(hash1).not.toBe(hash2);
    });
    it('should detect actor tampering', () => {
        const prevHash = '0'.repeat(64);
        const payload = { action: 'test' };
        const type = 'test.event';
        const ts = '2024-01-01T00:00:00.000Z';
        const hash1 = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, 'USER', 'user-123');
        const hash2 = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, 'USER', 'user-456');
        expect(hash1).not.toBe(hash2);
    });
    it('should detect chain break', () => {
        // Simulate a chain of events
        const genesis = '0'.repeat(64);
        const event1Payload = { seq: 1 };
        const event1Type = 'event.1';
        const ts1 = '2024-01-01T00:00:00.000Z';
        const event1Hash = (0, shared_1.computeEventHash)(genesis, event1Payload, event1Type, ts1, 'USER', 'user-1');
        // Event 2 should reference event 1's hash
        const event2Payload = { seq: 2 };
        const event2Type = 'event.2';
        const ts2 = '2024-01-01T00:00:01.000Z';
        const correctEvent2Hash = (0, shared_1.computeEventHash)(event1Hash, event2Payload, event2Type, ts2, 'USER', 'user-1');
        // If someone tries to use wrong prevHash
        const wrongPrevHash = 'wrong'.padEnd(64, '0');
        const tamperedEvent2Hash = (0, shared_1.computeEventHash)(wrongPrevHash, event2Payload, event2Type, ts2, 'USER', 'user-1');
        expect(correctEvent2Hash).not.toBe(tamperedEvent2Hash);
    });
});
describe('verifyEventChain', () => {
    it('should verify valid chain', () => {
        const events = [];
        let prevHash = '0'.repeat(64);
        // Build a valid chain of 5 events
        for (let i = 0; i < 5; i++) {
            const payload = { seq: i };
            const type = `event.${i}`;
            const ts = new Date(Date.now() + i * 1000).toISOString();
            const hash = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, 'USER', 'user-1');
            events.push({
                id: `event-${i}`,
                orgId: 'org-1',
                actorType: 'USER',
                actorId: 'user-1',
                type,
                ts,
                payload,
                prevHash,
                hash,
            });
            prevHash = hash;
        }
        // Import verifyEventChain from index
        const { verifyEventChain } = require('../index');
        expect(verifyEventChain(events)).toBe(true);
    });
    it('should detect tampered event in chain', () => {
        const events = [];
        let prevHash = '0'.repeat(64);
        // Build a valid chain
        for (let i = 0; i < 3; i++) {
            const payload = { seq: i };
            const type = `event.${i}`;
            const ts = new Date(Date.now() + i * 1000).toISOString();
            const hash = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, 'USER', 'user-1');
            events.push({
                id: `event-${i}`,
                orgId: 'org-1',
                actorType: 'USER',
                actorId: 'user-1',
                type,
                ts,
                payload,
                prevHash,
                hash,
            });
            prevHash = hash;
        }
        // Tamper with middle event's payload (hash won't match)
        events[1].payload = { seq: 999 };
        const { verifyEventChain } = require('../index');
        expect(verifyEventChain(events)).toBe(false);
    });
});
