#!/usr/bin/env node
/**
 * Environment Variable Validation
 * Fails fast with clear error messages if required vars are missing.
 * Called at startup of production entrypoint.
 */

const REQUIRED_VARS = [
  { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
  { name: 'JWT_SECRET', description: 'JWT signing secret (min 32 chars)' },
  { name: 'STRIPE_SECRET_KEY', description: 'Stripe API key for the paid Workflow Setup Pilot' },
  { name: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signing secret' },
];

const RECOMMENDED_VARS = [
  { name: 'REDIS_URL', description: 'Redis connection string (caching/rate limiting)' },
  { name: 'POLYGON_API_KEY', description: 'Polygon.io API key for market data' },
];

function validateEnv(options = {}) {
  const { exitOnError = true, silent = false } = options;
  const missing = [];
  const warnings = [];

  // Check required vars
  for (const v of REQUIRED_VARS) {
    if (!process.env[v.name]) {
      missing.push(`  - ${v.name}: ${v.description}`);
    }
  }

  // Check recommended vars
  for (const v of RECOMMENDED_VARS) {
    if (!process.env[v.name]) {
      warnings.push(`  - ${v.name}: ${v.description}`);
    }
  }

  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    missing.push('  - JWT_SECRET: Must be at least 32 characters');
  }

  // Validate DATABASE_URL format
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgres')) {
    missing.push('  - DATABASE_URL: Must be a valid PostgreSQL connection string');
  }

  // Report results
  if (!silent) {
    if (missing.length > 0) {
      console.error('\n❌ FATAL: Missing required environment variables:\n');
      console.error(missing.join('\n'));
      console.error('\nSet these variables before starting the application.\n');
    }

    if (warnings.length > 0 && missing.length === 0) {
      console.warn('\n⚠️  Warning: Recommended environment variables not set:\n');
      console.warn(warnings.join('\n'));
      console.warn('\nSome features may not work correctly.\n');
    }

    if (missing.length === 0) {
      console.log('✓ Environment validation passed');
    }
  }

  if (missing.length > 0 && exitOnError) {
    process.exit(1);
  }

  return { valid: missing.length === 0, missing, warnings };
}

// Run if called directly
if (require.main === module) {
  validateEnv();
}

module.exports = { validateEnv };
