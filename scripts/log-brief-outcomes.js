#!/usr/bin/env node
/**
 * Nova Daily Brief — Outcome Logger
 * ===================================
 * Post-market script that checks what happened to each setup from a brief.
 * Closes the feedback loop: Manifesto Section 4.5 Stage 6.
 *
 * Usage:
 *   node scripts/log-brief-outcomes.js
 *   node scripts/log-brief-outcomes.js --brief briefs/nova-daily-brief-2026-03-21.json
 *   node scripts/log-brief-outcomes.js --dry-run
 *
 * What it does:
 *   1. Loads the most recent (or specified) brief JSON
 *   2. Fetches current quotes for all symbols in the brief
 *   3. Compares current price against entry/stop/target
 *   4. Classifies each setup outcome: TRIGGERED, HIT_T1, HIT_T2, STOPPED_OUT, PENDING, NO_TRIGGER
 *   5. Saves outcome log to briefs/ and optionally to the database
 *
 * Requires:
 *   API running at localhost:3000 (for quotes) or ALPACA keys in env
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.GATEWAY_URL || 'http://localhost:3000';
const BRIEFS_DIR = path.join(__dirname, '..', 'briefs');
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const briefArg = (() => {
  const idx = args.indexOf('--brief');
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
})();

// ============================================================================
// LOAD BRIEF
// ============================================================================

function loadBrief() {
  let jsonPath = briefArg;
  if (!jsonPath) {
    const files = fs.readdirSync(BRIEFS_DIR)
      .filter(f => f.match(/nova-daily-brief-.*\.json$/) && !f.includes('outcome'))
      .sort()
      .reverse();
    if (files.length === 0) throw new Error('No brief JSON found in briefs/');
    jsonPath = path.join(BRIEFS_DIR, files[0]);
  }
  console.log(`[LOAD] ${jsonPath}`);
  return { data: JSON.parse(fs.readFileSync(jsonPath, 'utf-8')), path: jsonPath };
}

// ============================================================================
// FETCH CURRENT QUOTES
// ============================================================================

async function fetchQuotes(symbols) {
  const quotes = new Map();

  // Try Alpaca snapshots first
  if (ALPACA_API_KEY && ALPACA_SECRET_KEY) {
    try {
      const params = new URLSearchParams({ symbols: symbols.join(','), feed: 'iex' });
      const resp = await fetch(`${ALPACA_DATA_BASE}/v2/stocks/snapshots?${params}`, {
        headers: {
          'APCA-API-KEY-ID': ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json();
        for (const [sym, snap] of Object.entries(data)) {
          const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c;
          if (typeof price === 'number' && Number.isFinite(price)) {
            quotes.set(sym.toUpperCase(), price);
          }
        }
        console.log(`[QUOTES] Alpaca: ${quotes.size}/${symbols.length}`);
      }
    } catch (err) {
      console.warn(`[QUOTES] Alpaca failed: ${err.message}`);
    }
  }

  // Yahoo fallback for missing
  const missing = symbols.filter(s => !quotes.has(s));
  for (const sym of missing.slice(0, 20)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof price === 'number') quotes.set(sym, price);
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }

  return quotes;
}

// ============================================================================
// CLASSIFY OUTCOME
// ============================================================================

function classifyOutcome(card, currentPrice) {
  if (!currentPrice) return { status: 'NO_QUOTE', detail: 'Could not fetch current price' };

  const entry = card.entry || null;
  const stop = card.stop || card.stopLoss || null;
  const t1 = card.targets?.t1 || card.target || null;
  const t2 = card.targets?.t2 || null;
  const isLong = (card.direction || card.type) !== 'bearish' && (card.direction || '') !== 'SHORT';

  if (!entry) return { status: 'NO_ENTRY', detail: 'No entry price defined' };

  // Did entry trigger?
  const entryTriggered = isLong ? currentPrice >= entry * 0.995 : currentPrice <= entry * 1.005;

  if (!entryTriggered) {
    // Check if it moved away from entry
    const distFromEntry = ((currentPrice - entry) / entry) * 100;
    return {
      status: 'NO_TRIGGER',
      detail: `Price ${currentPrice.toFixed(2)} is ${distFromEntry > 0 ? '+' : ''}${distFromEntry.toFixed(1)}% from entry ${entry.toFixed(2)}`,
      currentPrice,
    };
  }

  // Check stop hit
  if (stop) {
    const stoppedOut = isLong ? currentPrice <= stop : currentPrice >= stop;
    if (stoppedOut) {
      const loss = isLong ? ((currentPrice - entry) / entry) * 100 : ((entry - currentPrice) / entry) * 100;
      return {
        status: 'STOPPED_OUT',
        detail: `Hit stop at ${stop.toFixed(2)} | Loss: ${loss.toFixed(1)}%`,
        currentPrice,
        pnlPercent: loss,
      };
    }
  }

  // Check targets
  if (t2) {
    const hitT2 = isLong ? currentPrice >= t2 : currentPrice <= t2;
    if (hitT2) {
      const gain = isLong ? ((currentPrice - entry) / entry) * 100 : ((entry - currentPrice) / entry) * 100;
      return {
        status: 'HIT_T2',
        detail: `Reached Target 2 at ${t2.toFixed(2)} | Gain: +${gain.toFixed(1)}%`,
        currentPrice,
        pnlPercent: gain,
      };
    }
  }

  if (t1) {
    const hitT1 = isLong ? currentPrice >= t1 : currentPrice <= t1;
    if (hitT1) {
      const gain = isLong ? ((currentPrice - entry) / entry) * 100 : ((entry - currentPrice) / entry) * 100;
      return {
        status: 'HIT_T1',
        detail: `Reached Target 1 at ${t1.toFixed(2)} | Gain: +${gain.toFixed(1)}%`,
        currentPrice,
        pnlPercent: gain,
      };
    }
  }

  // Entry triggered but neither stop nor target hit yet
  const unrealized = isLong ? ((currentPrice - entry) / entry) * 100 : ((entry - currentPrice) / entry) * 100;
  return {
    status: 'ACTIVE',
    detail: `Entry triggered, in position | Unrealized: ${unrealized > 0 ? '+' : ''}${unrealized.toFixed(1)}%`,
    currentPrice,
    pnlPercent: unrealized,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   NOVA DAILY BRIEF — OUTCOME LOGGER       ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  const { data: scanData, path: briefPath } = loadBrief();
  const signals = scanData.signals || [];
  if (signals.length === 0) {
    console.log('[LOAD] No signals in brief. Nothing to track.');
    return;
  }
  console.log(`[LOAD] ✓ ${signals.length} signals to track`);

  // Fetch current quotes
  const symbols = [...new Set(signals.map(s => s.symbol))];
  const quotes = await fetchQuotes(symbols);
  console.log(`[QUOTES] ✓ ${quotes.size}/${symbols.length} quotes fetched`);

  // Classify each signal
  const outcomes = signals.map(card => {
    const currentPrice = quotes.get(card.symbol) || null;
    const result = classifyOutcome(card, currentPrice);
    return {
      symbol: card.symbol,
      setupType: card.setupType || card.board || card.pattern || 'unknown',
      confidence: card.confidence || 0,
      entry: card.entry || null,
      stop: card.stop || card.stopLoss || null,
      target1: card.targets?.t1 || card.target || null,
      ...result,
    };
  });

  // Summary
  const counts = {};
  for (const o of outcomes) counts[o.status] = (counts[o.status] || 0) + 1;

  console.log('');
  console.log('── OUTCOME SUMMARY ──────────────────────────');
  for (const [status, count] of Object.entries(counts).sort()) {
    const icon = status === 'HIT_T1' || status === 'HIT_T2' ? '✓' :
      status === 'STOPPED_OUT' ? '✕' :
      status === 'ACTIVE' ? '◎' : '·';
    console.log(`  ${icon} ${status}: ${count}`);
  }
  console.log('');

  // Detail per signal
  console.log('── DETAIL ──────────────────────────────────');
  for (const o of outcomes) {
    const icon = o.status === 'HIT_T1' || o.status === 'HIT_T2' ? '✓' :
      o.status === 'STOPPED_OUT' ? '✕' :
      o.status === 'ACTIVE' ? '◎' : '·';
    console.log(`  ${icon} ${o.symbol.padEnd(6)} [${o.status.padEnd(12)}] ${o.detail}`);
  }
  console.log('');

  // Save outcome file
  const dateStr = new Date().toISOString().split('T')[0];
  const outcomePath = path.join(BRIEFS_DIR, `nova-brief-outcomes-${dateStr}.json`);
  const outcomeData = {
    briefSource: briefPath,
    evaluatedAt: new Date().toISOString(),
    summary: counts,
    outcomes,
  };

  if (!DRY_RUN) {
    fs.writeFileSync(outcomePath, JSON.stringify(outcomeData, null, 2), 'utf-8');
    console.log(`[SAVED] ${outcomePath}`);
  } else {
    console.log('[DRY RUN] Would save to:', outcomePath);
  }

  // Win rate calc
  const resolved = outcomes.filter(o => ['HIT_T1', 'HIT_T2', 'STOPPED_OUT'].includes(o.status));
  if (resolved.length > 0) {
    const wins = resolved.filter(o => o.status === 'HIT_T1' || o.status === 'HIT_T2').length;
    console.log(`\n  Win rate (resolved): ${wins}/${resolved.length} (${(wins / resolved.length * 100).toFixed(0)}%)`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
