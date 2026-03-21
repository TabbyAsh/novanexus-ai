#!/usr/bin/env node
/**
 * Nova Daily Brief Generator
 * ==========================
 * Runs the screener engine and formats the output into the Daily Brief structure.
 *
 * Usage:
 *   node scripts/generate-daily-brief.js
 *   node scripts/generate-daily-brief.js --output briefs/2026-03-21.txt
 *   node scripts/generate-daily-brief.js --json briefs/2026-03-21.json
 *
 * Requirements:
 *   - Nova Hub service running (port 3030) OR gateway running (port 3000)
 *   - Valid API credentials (Alpaca keys configured in .env)
 *
 * This script is Step 1-2 of the Daily Brief production workflow.
 * Step 3 (human curation) happens after reviewing the output.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIG
// ============================================================================

// Nova Hub scan endpoint is at /v1/screener/scan (requires auth)
// Gateway proxies /v1/trade/scan to nova-hub
const API_BASE = process.env.NOVA_HUB_URL || 'http://localhost:3030';
const AUTH_TOKEN = process.env.NOVA_AUTH_TOKEN || '';
const OUTPUT_DIR = path.join(__dirname, '..', 'briefs');
const MAX_PRIORITY = 5;
const MAX_SUPPORTING = 7;
const MIN_CONFIDENCE = 40;

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchScan() {
  const url = `${API_BASE}/v1/screener/scan`;
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;

  console.log(`[SCAN] Hitting ${url}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      maxSymbols: 200,
      minConfidence: MIN_CONFIDENCE,
      signalType: 'all',
      sortMode: 'BEST_TRADES_NOW',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scan failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(`Scan returned error: ${data.error?.message || JSON.stringify(data.error)}`);
  }

  return data.data;
}

async function fetchReality() {
  const url = `${API_BASE}/v1/reality`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

// ============================================================================
// CONFIDENCE TIER
// ============================================================================

function confidenceTier(score) {
  if (score >= 80) return { dots: '●●●●', label: 'A-tier' };
  if (score >= 65) return { dots: '●●●○', label: 'B-tier' };
  if (score >= 50) return { dots: '●●○○', label: 'C-tier' };
  return { dots: '●○○○', label: 'D-tier' };
}

// ============================================================================
// REGIME LABEL
// ============================================================================

function regimeLabel(regime) {
  if (!regime) return 'UNKNOWN';
  const trend = regime.trend || 'TRANSITIONAL';
  const vol = regime.vol || 'NORMAL';
  if (trend === 'TRENDING' && vol === 'HIGH') return 'TRENDING + HIGH VOL';
  if (trend === 'TRENDING') return 'TRENDING';
  if (trend === 'RANGING') return 'RANGING';
  if (vol === 'HIGH') return 'HIGH VOL';
  if (vol === 'LOW') return 'LOW VOL';
  return 'TRANSITIONAL';
}

// ============================================================================
// FORMAT SINGLE SETUP
// ============================================================================

function formatSetup(card, index) {
  const tier = confidenceTier(card.confidence || 0);
  const direction = card.direction || (card.type === 'bearish' ? 'Short' : 'Long');
  const setupType = card.setupType || card.board || card.pattern || 'Setup';

  // Compute R:R from entry/stop/target if available
  let rrLabel = '—';
  if (card.entry && card.stop && card.targets?.t1) {
    const risk = Math.abs(card.entry - card.stop);
    const reward = Math.abs(card.targets.t1 - card.entry);
    if (risk > 0) rrLabel = `1:${(reward / risk).toFixed(1)}`;
  } else if (card.riskReward) {
    rrLabel = `1:${card.riskReward.toFixed(1)}`;
  }

  const lines = [];
  lines.push(`[${index}] ${card.symbol} — ${setupType.replace(/_/g, ' ')} ${direction}`);

  if (card.reasoning || card.entryTrigger) {
    lines.push(`    Setup:     ${card.reasoning || card.entryTrigger || ''}`);
  }

  if (card.entry) {
    lines.push(`    Entry:     $${Number(card.entry).toFixed(2)}`);
  }
  if (card.stop) {
    lines.push(`    Stop:      $${Number(card.stop).toFixed(2)}`);
  }
  if (card.targets?.t1) {
    const pct1 = card.entry ? ((card.targets.t1 - card.entry) / card.entry * 100).toFixed(1) : '?';
    lines.push(`    Target 1:  $${Number(card.targets.t1).toFixed(2)} (${pct1 > 0 ? '+' : ''}${pct1}%)`);
  }
  if (card.targets?.t2) {
    const pct2 = card.entry ? ((card.targets.t2 - card.entry) / card.entry * 100).toFixed(1) : '?';
    lines.push(`    Target 2:  $${Number(card.targets.t2).toFixed(2)} (${pct2 > 0 ? '+' : ''}${pct2}%)`);
  }
  lines.push(`    R:R:       ${rrLabel}`);
  lines.push(`    Confidence: ${tier.dots} (${tier.label})`);

  if (card.regime) {
    lines.push(`    Regime fit: ${regimeLabel(card.regime)}`);
  }

  if (card.riskFlags && card.riskFlags.length > 0) {
    lines.push(`    Caution:   ${card.riskFlags.join(', ')}`);
  }

  if (card.scenarioTree?.ifFails) {
    lines.push(`    Invalidation: ${card.scenarioTree.ifFails}`);
  } else if (card.stopLoss) {
    lines.push(`    Invalidation: Close below $${Number(card.stopLoss).toFixed(2)}`);
  }

  return lines.join('\n');
}

// ============================================================================
// FORMAT SUPPORTING (SHORT FORM)
// ============================================================================

function formatSupporting(card) {
  const tier = confidenceTier(card.confidence || 0);
  const note = card.reasoning || card.entryTrigger || card.pattern || '';
  return `  ${card.symbol.padEnd(6)} — ${note.slice(0, 60)} [${tier.label}]`;
}

// ============================================================================
// GENERATE FULL BRIEF
// ============================================================================

function generateBrief(scanData) {
  const signals = scanData.signals || [];
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Split into priority and supporting
  const sorted = [...signals].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const priority = sorted.slice(0, MAX_PRIORITY);
  const supporting = sorted.slice(MAX_PRIORITY, MAX_PRIORITY + MAX_SUPPORTING);
  const watchOnly = sorted.slice(MAX_PRIORITY + MAX_SUPPORTING, MAX_PRIORITY + MAX_SUPPORTING + 5);

  // Detect overall regime from first card or scan metadata
  const overallRegime = priority[0]?.regime
    ? regimeLabel(priority[0].regime)
    : 'TRANSITIONAL';

  const lines = [];

  lines.push('═══════════════════════════════════════════════════');
  lines.push(`NOVA DAILY BRIEF — ${date}`);
  lines.push(`Market Regime: ${overallRegime}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  // Priority Setups
  lines.push(`── PRIORITY SETUPS (${priority.length} names) ──────────────────`);
  lines.push('');
  for (let i = 0; i < priority.length; i++) {
    lines.push(formatSetup(priority[i], i + 1));
    lines.push('');
  }

  // Supporting Setups
  if (supporting.length > 0) {
    lines.push(`── SUPPORTING SETUPS (${supporting.length} names) ────────────────`);
    lines.push('');
    lines.push('  These are developing or lower-confidence. Watch, don\'t chase.');
    lines.push('');
    for (const card of supporting) {
      lines.push(formatSupporting(card));
    }
    lines.push('');
  }

  // Watch Only
  if (watchOnly.length > 0) {
    lines.push('── WATCH ONLY ───────────────────────────────────');
    lines.push('');
    lines.push(`  Names on radar but not actionable today:`);
    lines.push(`  ${watchOnly.map(c => c.symbol).join(', ')}`);
    lines.push('');
  }

  // Regime Context (placeholder — human fills in specifics)
  lines.push('── REGIME CONTEXT ───────────────────────────────');
  lines.push('');
  lines.push('  [OPERATOR: Add SPY/VIX/QQQ context and event flags here]');
  lines.push('');

  lines.push('═══════════════════════════════════════════════════');
  lines.push('Nova Trader Intelligence — novanexus-ai.com');
  lines.push('Not financial advice. Trade your own plan.');
  lines.push('═══════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const outputArg = args.find(a => a.startsWith('--output='))?.split('=')[1]
    || args[args.indexOf('--output') + 1];
  const jsonArg = args.find(a => a.startsWith('--json='))?.split('=')[1]
    || args[args.indexOf('--json') + 1];

  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   NOVA DAILY BRIEF GENERATOR              ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  // Step 1: Run scan
  let scanData;
  try {
    scanData = await fetchScan();
    console.log(`[SCAN] ✓ ${scanData.signals?.length || 0} signals from ${scanData.totalCandidates || '?'} candidates`);
  } catch (err) {
    console.error(`[SCAN] ✕ Failed: ${err.message}`);
    console.error('');
    console.error('Make sure the Nova stack is running:');
    console.error('  npm run nova:mvp   (Docker)');
    console.error('  -- or --');
    console.error('  npm run dev:nodocker');
    process.exit(1);
  }

  if (!scanData.signals || scanData.signals.length === 0) {
    console.error('[SCAN] ✕ No signals returned. Check market data configuration.');
    process.exit(1);
  }

  // Step 2: Generate brief
  const brief = generateBrief(scanData);
  console.log(`[BRIEF] ✓ Generated with ${Math.min(MAX_PRIORITY, scanData.signals.length)} priority + ${Math.min(MAX_SUPPORTING, Math.max(0, scanData.signals.length - MAX_PRIORITY))} supporting setups`);

  // Step 3: Output
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().split('T')[0];

  if (outputArg) {
    const outPath = path.resolve(outputArg);
    fs.writeFileSync(outPath, brief, 'utf-8');
    console.log(`[OUTPUT] ✓ Saved to ${outPath}`);
  } else {
    const defaultPath = path.join(OUTPUT_DIR, `nova-daily-brief-${dateStr}.txt`);
    fs.writeFileSync(defaultPath, brief, 'utf-8');
    console.log(`[OUTPUT] ✓ Saved to ${defaultPath}`);
  }

  if (jsonArg) {
    const jsonPath = path.resolve(jsonArg);
    fs.writeFileSync(jsonPath, JSON.stringify(scanData, null, 2), 'utf-8');
    console.log(`[JSON]   ✓ Raw scan data saved to ${jsonPath}`);
  } else {
    const defaultJsonPath = path.join(OUTPUT_DIR, `nova-daily-brief-${dateStr}.json`);
    fs.writeFileSync(defaultJsonPath, JSON.stringify(scanData, null, 2), 'utf-8');
    console.log(`[JSON]   ✓ Raw scan data saved to ${defaultJsonPath}`);
  }

  // Print brief to stdout
  console.log('');
  console.log(brief);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
