const fs = require('fs');
const path = require('path');

const REQUIRED_TABLES = [
  'inquiry_notification_outbox',
  'intake_rate_events',
  'public_inquiries',
];

function migrationSqlPath() {
  return path.join(__dirname, 'sql', '037_public_intake.sql');
}

function loadMigrationSql() {
  return fs.readFileSync(migrationSqlPath(), 'utf8');
}

function redactSecrets(value) {
  return String(value == null ? '' : value)
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted]')
    .replace(/\bpassword=[^\s&'"]+/gi, 'password=[redacted]');
}

async function applyPublicIntakeMigration(db) {
  await db.query(loadMigrationSql());
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`INSERT INTO schema_migrations (version) VALUES ('037') ON CONFLICT DO NOTHING`);
  const found = await db.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [REQUIRED_TABLES],
  );
  const tables = found.rows.map(row => row.table_name);
  if (tables.length !== REQUIRED_TABLES.length) {
    throw new Error('Intake tables were not all present after migration.');
  }
  return tables;
}

module.exports = {
  REQUIRED_TABLES,
  applyPublicIntakeMigration,
  loadMigrationSql,
  migrationSqlPath,
  redactSecrets,
};
