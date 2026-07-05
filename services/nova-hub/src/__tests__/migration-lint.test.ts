/**
 * MIGRATION RESERVED-WORD LINT — catches the `binary`-class bug before deploy.
 *
 * A production deploy FAILED because migration 030 used `binary` (a Postgres
 * reserved word) as an unquoted column name; the migration threw at runtime
 * and rolled back the whole release. This test scans every migration for
 * reserved words used as unquoted column names in CREATE TABLE bodies and
 * fails CI so it can never reach production again.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Postgres reserved words commonly (and accidentally) used as column names.
const RESERVED = new Set([
  'binary', 'user', 'order', 'limit', 'table', 'column', 'default', 'check',
  'references', 'array', 'analyse', 'analyze', 'primary', 'foreign', 'grant',
  'window', 'select', 'where', 'from', 'group', 'desc', 'asc', 'all', 'any',
  'authorization', 'collation', 'concurrently', 'freeze', 'ilike', 'natural',
]);

// A column definition line looks like:  <name> <TYPE> ...
const COL_DEF = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+(VARCHAR|INT|INTEGER|BIGINT|TEXT|UUID|BOOLEAN|BOOL|JSONB|JSON|TIMESTAMPTZ|TIMESTAMP|NUMERIC|DECIMAL|REAL|SERIAL|BIGSERIAL|DATE|BYTEA)\b/i;

function migrationsDir(): string {
  // services/nova-hub/src/__tests__ -> repo root -> infra/migrations
  return join(__dirname, '..', '..', '..', '..', 'infra', 'migrations');
}

describe('migration reserved-word lint', () => {
  const dir = migrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

  test('there are migrations to lint', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${file} uses no unquoted reserved-word columns`, () => {
      const sql = readFileSync(join(dir, file), 'utf8');
      const offenders: string[] = [];
      let inCreate = false;
      for (const rawLine of sql.split('\n')) {
        const line = rawLine.replace(/--.*$/, ''); // strip line comments
        if (/create table/i.test(line)) inCreate = true;
        if (inCreate) {
          const m = line.match(COL_DEF);
          if (m) {
            const col = m[1].toLowerCase();
            // quoted identifiers ("binary") are safe and won't match COL_DEF's bare-name group
            if (RESERVED.has(col)) offenders.push(`${col} — ${rawLine.trim().slice(0, 60)}`);
          }
          if (/^\s*\)\s*;?\s*$/.test(line)) inCreate = false; // end of CREATE TABLE
        }
      }
      if (offenders.length) {
        throw new Error(`Reserved-word column(s) must be double-quoted in ${file}:\n  ${offenders.join('\n  ')}`);
      }
      expect(offenders).toEqual([]);
    });
  }
});
