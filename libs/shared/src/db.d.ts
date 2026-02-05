import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
export declare function getPool(): Pool;
export declare function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
export declare function getClient(): Promise<PoolClient>;
export declare function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
export declare function closePool(): Promise<void>;
export declare function queryOne<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T | null>;
export declare function exists(text: string, params?: any[]): Promise<boolean>;
