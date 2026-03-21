#!/usr/bin/env node
/**
 * Nova — Stripe Founding Member Setup
 * =====================================
 * Creates the founding member product and price in Stripe.
 * Run once with your Stripe secret key.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-founding.js
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe-founding.js --live
 *
 * What it creates:
 *   - Product: "Nova Trader Intelligence — Founding Member"
 *   - Price: $29/month recurring
 *   - Metadata tags for internal routing
 *
 * After running, update .env with the printed STRIPE_PRICE_MONTHLY value.
 */

const https = require('https');
const querystring = require('querystring');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const IS_LIVE = process.argv.includes('--live');

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY environment variable is required.');
  console.error('');
  console.error('Usage:');
  console.error('  $env:STRIPE_SECRET_KEY = "sk_test_..."; node scripts/setup-stripe-founding.js');
  process.exit(1);
}

if (IS_LIVE && !STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  console.error('ERROR: --live flag used but key does not start with sk_live_');
  process.exit(1);
}

if (!IS_LIVE && STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  console.error('WARNING: You are using a live key without --live flag. Add --live to confirm.');
  process.exit(1);
}

// ============================================================================
// STRIPE API HELPER
// ============================================================================

function stripeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? querystring.stringify(data) : '';
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: `/v1${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Stripe ${res.statusCode}: ${parsed.error?.message || responseData}`));
          }
        } catch (e) {
          reject(new Error(`Stripe response parse error: ${responseData.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   NOVA — STRIPE FOUNDING MEMBER SETUP     ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
  console.log(`Mode: ${IS_LIVE ? 'LIVE' : 'TEST'}`);
  console.log(`Key: ${STRIPE_SECRET_KEY.slice(0, 12)}...${STRIPE_SECRET_KEY.slice(-4)}`);
  console.log('');

  // Step 1: Create the product
  console.log('[1/3] Creating product...');
  const product = await stripeRequest('POST', '/products', {
    name: 'Nova Trader Intelligence — Founding Member',
    description: 'Daily curated breakout watchlist with structured setup logic. Founding rate locked for life.',
    'metadata[plan]': 'FOUNDING',
    'metadata[tier]': 'founding',
    'metadata[seats]': '50',
  });
  console.log(`  ✓ Product created: ${product.id}`);

  // Step 2: Create the monthly price ($29/mo)
  console.log('[2/3] Creating price ($29/month)...');
  const price = await stripeRequest('POST', '/prices', {
    product: product.id,
    unit_amount: 2900, // $29.00 in cents
    currency: 'usd',
    'recurring[interval]': 'month',
    'metadata[plan]': 'FOUNDING',
    'metadata[display_name]': 'Founding Member — $29/mo',
  });
  console.log(`  ✓ Price created: ${price.id}`);

  // Step 3: Create a yearly price ($290/year = 2 months free)
  console.log('[3/3] Creating annual price ($290/year)...');
  const yearlyPrice = await stripeRequest('POST', '/prices', {
    product: product.id,
    unit_amount: 29000, // $290.00 in cents
    currency: 'usd',
    'recurring[interval]': 'year',
    'metadata[plan]': 'FOUNDING',
    'metadata[display_name]': 'Founding Member — $290/year',
  });
  console.log(`  ✓ Yearly price created: ${yearlyPrice.id}`);

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  SETUP COMPLETE');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('  Add these to your .env:');
  console.log('');
  console.log(`  STRIPE_PRODUCT_FOUNDING=${product.id}`);
  console.log(`  STRIPE_PRICE_MONTHLY=${price.id}`);
  console.log(`  STRIPE_PRICE_YEARLY=${yearlyPrice.id}`);
  console.log('');
  console.log('  Stripe Dashboard:');
  console.log(`  https://dashboard.stripe.com/${IS_LIVE ? '' : 'test/'}products/${product.id}`);
  console.log('');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
