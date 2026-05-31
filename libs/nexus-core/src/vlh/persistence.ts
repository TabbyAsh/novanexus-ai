/**
 * VLH Persistence Adapter
 * =======================
 * Dependency-injection interface for database access.
 *
 * nexus-core has no direct database dependency. Callers (e.g. nova-hub)
 * provide a concrete adapter wrapping their DB client. This keeps the
 * intelligence layer independent and testable.
 *
 * Usage in nova-hub:
 *   import { query, queryOne } from '@nova/shared';
 *   const db = createNovaSharedAdapter(query, queryOne);
 */

export interface QueryResult<T> {
  rows: T[];
}

export interface TransactionClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface VLHPersistenceAdapter {
  /** Execute a query and return all matching rows. */
  queryRows<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;

  /** Execute a query and return the first row, or null. */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;

  /** Execute a statement with no return value needed. */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /** Run multiple statements in a single transaction. */
  transaction<T>(
    fn: (client: TransactionClient) => Promise<T>,
  ): Promise<T>;
}

/**
 * Factory: creates a VLHPersistenceAdapter from the @nova/shared db helpers.
 * Import and call this once per service process.
 *
 * @example
 * import { query, queryOne, transaction } from '@nova/shared';
 * export const vlhDb = createSharedDbAdapter({ query, queryOne, transaction });
 */
export function createSharedDbAdapter(deps: {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult<Record<string, unknown>>>;
  queryOne: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null>;
  transaction: <T>(fn: (client: TransactionClient) => Promise<T>) => Promise<T>;
}): VLHPersistenceAdapter {
  return {
    async queryRows<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const result = await deps.query(sql, params);
      return result.rows as T[];
    },

    async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      return deps.queryOne(sql, params) as Promise<T | null>;
    },

    async execute(sql: string, params?: unknown[]): Promise<void> {
      await deps.query(sql, params);
    },

    async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
      return deps.transaction(fn);
    },
  };
}
