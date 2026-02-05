"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.query = query;
exports.getClient = getClient;
exports.transaction = transaction;
exports.closePool = closePool;
exports.queryOne = queryOne;
exports.exists = exists;
const pg_1 = require("pg");
let pool = null;
function getPool() {
    if (!pool) {
        pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL || 'postgresql://nova:nova_dev_password@localhost:5432/nova',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        pool.on('error', (err) => {
            console.error('Unexpected database pool error:', err);
        });
    }
    return pool;
}
async function query(text, params) {
    const start = Date.now();
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    if (duration > 100) {
        console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
    }
    return result;
}
async function getClient() {
    return getPool().connect();
}
async function transaction(fn) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    }
}
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
// Helper for single row queries
async function queryOne(text, params) {
    const result = await query(text, params);
    return result.rows[0] || null;
}
// Helper for checking existence
async function exists(text, params) {
    const result = await query(text, params);
    return result.rowCount !== null && result.rowCount > 0;
}
