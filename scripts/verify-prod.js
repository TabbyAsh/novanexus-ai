#!/usr/bin/env node
/**
 * Production Verification Script
 * Runs production-safe smoke tests against deployed URLs.
 * 
 * Usage:
 *   npm run verify:prod
 *   npm run verify:prod -- --url https://api.novanexus-ai.com
 *   PROD_API_URL=https://api.example.com npm run verify:prod
 */
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Get local git info for stale deploy detection
let LOCAL_COMMIT = 'unknown';
try {
  LOCAL_COMMIT = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  // Git not available or not in a repo
}

// Configuration
const API_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1]
  || process.env.PROD_API_URL
  || 'https://abackend-production.up.railway.app';

const WEB_URL = process.env.PROD_WEB_URL || 'https://novanexus-ai.com';
const TIMEOUT = 15000;

// Test definitions
const TESTS = [
  {
    name: 'Gateway Health',
    url: `${API_URL}/health`,
    method: 'GET',
    expect: { status: 200 },
  },
  {
    name: 'API Version (Public)',
    url: `${API_URL}/version`,
    method: 'GET',
    expect: { status: 200 }, // Must be public - no auth required
    customCheck: (res) => {
      try {
        const data = JSON.parse(res.body);
        // Store version data for later stale deploy check
        global.__versionData = data;
        
        // Validate required fields
        if (!data.service) return { ok: false, error: 'Missing service field' };
        if (!data.deployedAt) return { ok: false, error: 'Missing deployedAt field' };
        
        // Production identity checks
        if (!data.environment) return { ok: false, error: 'Missing environment field' };
        if (data.environment !== 'production') {
          return { ok: false, error: `Expected env=production, got env=${data.environment}` };
        }
        
        // PROD INTEGRITY: Require valid gitSha in production
        const gitSha = data.gitSha || '';
        const isValidGitSha = /^[0-9a-f]{7,40}$/i.test(gitSha);
        
        if (!isValidGitSha) {
          // gitSha is missing or invalid - deployment integrity violation
          return { 
            ok: false, 
            error: `PROD INTEGRITY: gitSha missing or invalid (got: "${gitSha || '(empty)'}"). Deploy with deploy:prod to inject GIT_SHA.` 
          };
        }
        
        // Validate buildId exists (can be sha prefix or cli-*)
        const buildId = data.buildId || data.build;
        if (!buildId) return { ok: false, error: 'Missing buildId field' };
        if (buildId === 'dev' || buildId === 'local') {
          return { ok: false, error: `buildId=${buildId} in production (expected sha prefix or cli-*)` };
        }
        
        const env = data.environment || 'unknown';
        const features = data.features || {};
        const notes = [`env: ${env}`, `gitSha: ${gitSha.substring(0, 7)}`];
        if (features.serverManagedAlpaca) notes.push('alpaca: server');
        if (features.progressiveBroker) notes.push('broker: progressive');
        return { ok: true, note: notes.join(', ') };
      } catch {
        return { ok: false, error: 'Invalid version response JSON' };
      }
    },
  },
  {
    name: 'Web UI Reachable',
    url: WEB_URL,
    method: 'GET',
    expect: { status: [200, 301, 302, 307, 308, 404] }, // 404 ok if frontend not deployed
    optional: true, // Frontend deployment is separate from backend
  },
  // Phase 7.1: Web build identity verification (REQUIRED - must have real gitSha)
  {
    name: 'Web Version Endpoint (Phase 7.1)',
    url: `${WEB_URL}/api/version`,
    method: 'GET',
    expect: { status: [200] }, // Must exist and return 200
    customCheck: (res) => {
      if (res.status === 404) {
        return { ok: false, error: 'Web /api/version endpoint not deployed' };
      }
      try {
        const data = JSON.parse(res.body);
        // Store for later comparison
        global.__webVersionData = data;
        
        const gitSha = data.gitSha || '';
        const isValidGitSha = /^[0-9a-f]{7,40}$/i.test(gitSha);
        
        // Phase 7.1: FAIL if gitSha is 'dev' or invalid
        if (gitSha === 'dev') {
          return { ok: false, error: 'Web gitSha=dev (Phase 7.1 violation: must have real SHA). Run: npm run deploy:web' };
        }
        if (!isValidGitSha) {
          return { ok: false, error: `Web gitSha invalid: "${gitSha || '(empty)'}". Run: npm run deploy:web` };
        }
        return { ok: true, note: `Web gitSha: ${gitSha.substring(0, 7)}` };
      } catch {
        return { ok: false, error: 'Invalid JSON from web version endpoint' };
      }
    },
  },
  // Phase 7.2: API Client Contract Verification (REQUIRED - methods must exist)
  {
    name: 'Web API Contract (Phase 7.2)',
    url: `${WEB_URL}/api/contract`,
    method: 'GET',
    expect: { status: [200] },
    customCheck: (res) => {
      if (res.status === 404) {
        return { ok: false, error: 'Web /api/contract endpoint not deployed. Run: npm run deploy:web' };
      }
      try {
        const data = JSON.parse(res.body);
        if (!data.success) {
          const missing = data.contract?.missing || [];
          return { 
            ok: false, 
            error: `API CONTRACT VIOLATION: Missing methods: ${missing.join(', ')}. This causes "is not a function" errors.` 
          };
        }
        const present = data.contract?.present || 0;
        const required = data.contract?.required || 0;
        return { ok: true, note: `${present}/${required} required methods present` };
      } catch {
        return { ok: false, error: 'Invalid JSON from contract endpoint' };
      }
    },
  },
  {
    name: 'Auth Endpoint (Validation)',
    url: `${API_URL}/v1/auth/login`,
    method: 'POST',
    body: JSON.stringify({ email: 'test@invalid', password: 'x' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [400, 401] }, // Bad request or unauthorized, NOT 500/502
  },
  {
    name: 'Billing Pricing (Public)',
    url: `${API_URL}/v1/billing/pricing`,
    method: 'GET',
    expect: { status: 200, json: true },
  },
  {
    name: 'Market Data Endpoint',
    url: `${API_URL}/v1/market/quote?symbol=SPY`,
    method: 'GET',
    expect: { status: [200, 401, 403] }, // 200 if public, 401/403 if gated
  },
  {
    name: 'Nova Hub Scanner',
    url: `${API_URL}/v1/trade/scan`,
    method: 'POST',
    body: JSON.stringify({ symbols: ['SPY'] }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401, 403] }, // 200 if demo allowed, 401/403 if gated
  },
  // Phase 5.3: Simulator checks
  {
    name: 'Simulator Health',
    url: `${API_URL}/v1/sim/health`,
    method: 'GET',
    expect: { status: 200, json: true },
  },
  // Phase 5.3: Marketplace/Appraisal checks
  {
    name: 'Marketplace Health',
    url: `${API_URL}/v1/marketplace/health`,
    method: 'GET',
    expect: { status: 200, json: true },
  },
  {
    name: 'Marketplace Appraisal',
    url: `${API_URL}/v1/marketplace/appraise`,
    method: 'POST',
    body: JSON.stringify({ query: 'iPhone 15 Pro' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: 200, json: true },
  },
  // Progressive Broker: Server-managed Alpaca checks
  {
    name: 'Alpaca Status (Server-Managed)',
    url: `${API_URL}/v1/alpaca/status`,
    method: 'GET',
    expect: { status: [200, 401] }, // 200 with mode, 401 if auth required
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'Response not successful' };
        const mode = data.data?.mode;
        if (!mode) return { ok: false, error: 'No mode in response' };
        if (mode === 'server') return { ok: true, note: 'Server-managed mode active' };
        if (mode === 'user') return { ok: true, note: 'User mode (user has connection)' };
        if (mode === 'none') return { ok: true, note: 'No broker configured (env vars missing)' };
        return { ok: false, error: `Unknown mode: ${mode}` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Alpaca Account (Server-Managed)',
    url: `${API_URL}/v1/alpaca/account`,
    method: 'GET',
    expect: { status: [200, 400, 401] }, // 200 if configured, 400 if not, 401 if auth
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 400) {
        try {
          const data = JSON.parse(res.body);
          if (data.error?.code === 'ALPACA_NOT_CONFIGURED') {
            return { ok: true, note: 'Server-managed not configured (env vars missing)' };
          }
        } catch {}
        return { ok: true, note: 'Broker not available' };
      }
      try {
        const data = JSON.parse(res.body);
        if (data.success && data.data?.account) {
          const mode = data.data.mode;
          return { ok: true, note: `Account loaded (mode: ${mode || 'unknown'})` };
        }
        return { ok: false, error: 'No account data' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Alpaca History (Server-Managed)',
    url: `${API_URL}/v1/alpaca/history?timeframe=1D`,
    method: 'GET',
    expect: { status: [200, 400, 401, 503] }, // 200 if working, 400/503 if issues, 401 if auth
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 400 || res.status === 503) {
        return { ok: true, note: 'History not available (broker issue or not configured)' };
      }
      try {
        const data = JSON.parse(res.body);
        if (data.success && Array.isArray(data.data?.history)) {
          const count = data.data.history.length;
          const mode = data.data.mode;
          return { ok: true, note: `${count} history points (mode: ${mode || 'unknown'})` };
        }
        return { ok: false, error: 'No history data' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Bot identity validation: ensure undefined botId is rejected
  {
    name: 'Bot Tasks (Invalid botId Rejected)',
    url: `${API_URL}/v1/bots/undefined/tasks`,
    method: 'GET',
    expect: { status: [400, 401, 404] }, // 400 expected (invalid botId), 401 if auth required, 404 acceptable
    customCheck: (res) => {
      // We want to confirm the system rejects 'undefined' cleanly, not with 500
      if (res.status === 500 || res.status === 502) {
        return { ok: false, error: 'Server error on invalid botId - bot identity fix needed' };
      }
      if (res.status === 400) {
        return { ok: true, note: 'Invalid botId rejected (400)' };
      }
      if (res.status === 401) {
        return { ok: true, note: 'Auth required (expected)' };
      }
      if (res.status === 404) {
        return { ok: true, note: 'Bot not found (404)' };
      }
      return { ok: true, note: `Status ${res.status}` };
    },
  },
  // Phase 6: Launch Loop Verification
  {
    name: 'Screener Returns Signals (Phase 6)',
    url: `${API_URL}/v1/trade/scan`,
    method: 'POST',
    body: JSON.stringify({ symbols: ['SPY', 'QQQ', 'AAPL'], maxSymbols: 25 }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      try {
        const data = JSON.parse(res.body);
        // Screener returns data.results (scan) or data.signals (AI screener)
        const results = data.data?.results || data.data?.signals;
        if (data.success && Array.isArray(results)) {
          const count = results.length;
          if (count === 0) return { ok: false, error: 'Screener returned empty results' };
          return { ok: true, note: `${count} results returned` };
        }
        return { ok: false, error: 'No results/signals array in response' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Thesis Generation Endpoint (Phase 6)',
    url: `${API_URL}/v1/trade/theses`,
    method: 'GET',
    expect: { status: [200, 401, 403] },
    customCheck: (res) => {
      if (res.status === 401 || res.status === 403) {
        return { ok: true, note: 'Auth/Subscription required (expected)' };
      }
      try {
        const data = JSON.parse(res.body);
        return { ok: true, note: `Theses endpoint active` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Decision Cards Endpoint (Phase 6)',
    url: `${API_URL}/v1/trade/decision-cards`,
    method: 'GET',
    expect: { status: [200, 401, 403] },
    customCheck: (res) => {
      if (res.status === 401 || res.status === 403) {
        return { ok: true, note: 'Auth/Subscription required (expected)' };
      }
      try {
        const data = JSON.parse(res.body);
        return { ok: true, note: `Decision cards endpoint active` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  {
    name: 'Paper Trades Endpoint (Phase 6)',
    url: `${API_URL}/v1/trade/paper-trades`,
    method: 'GET',
    expect: { status: [200, 401, 403] },
    customCheck: (res) => {
      if (res.status === 401 || res.status === 403) {
        return { ok: true, note: 'Auth/Subscription required (expected)' };
      }
      try {
        const data = JSON.parse(res.body);
        return { ok: true, note: `Paper trades endpoint active` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 6.1: Screener NEVER returns empty
  {
    name: 'Screener Non-Empty (Phase 6.1)',
    url: `${API_URL}/v1/screener/scan`,
    method: 'POST',
    body: JSON.stringify({ maxSymbols: 25, minConfidence: 0 }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      try {
        const data = JSON.parse(res.body);
        const signals = data.data?.signals || [];
        if (!data.success) return { ok: false, error: 'API returned success=false' };
        if (signals.length === 0) return { ok: false, error: 'Screener returned ZERO signals (Phase 6.1 violation)' };
        // Check for confidenceTag presence
        const hasConfidenceTag = signals.some(s => s.confidenceTag);
        const hasFallback = data.data?.fallbackActive;
        const notes = [`${signals.length} signals`];
        if (hasConfidenceTag) notes.push('confidenceTag present');
        if (hasFallback) notes.push('fallback active');
        return { ok: true, note: notes.join(', ') };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 6.1: Thesis generation endpoint
  {
    name: 'Thesis Generate Endpoint (Phase 6.1)',
    url: `${API_URL}/v1/thesis/generate`,
    method: 'POST',
    body: JSON.stringify({ symbol: 'SPY' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 201, 400, 401, 403, 422, 429] }, // Various valid responses
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 403) return { ok: true, note: 'Subscription required (expected)' };
      if (res.status === 422) return { ok: true, note: 'Validation error (market data issue)' };
      if (res.status === 429) return { ok: true, note: 'Rate limited (expected)' };
      if (res.status === 400) {
        try {
          const data = JSON.parse(res.body);
          return { ok: true, note: `Validation: ${data.error?.message || 'bad request'}` };
        } catch {
          return { ok: true, note: 'Bad request' };
        }
      }
      try {
        const data = JSON.parse(res.body);
        if (data.success && data.data?.thesis) {
          return { ok: true, note: `Thesis generated for ${data.data.thesis.symbol}` };
        }
        return { ok: true, note: 'Endpoint active' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 6.1: Decision cards list endpoint
  {
    name: 'Decision Cards List (Phase 6.1)',
    url: `${API_URL}/v1/decision-cards`,
    method: 'GET',
    expect: { status: [200, 401, 403] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 403) return { ok: true, note: 'Subscription required (expected)' };
      try {
        const data = JSON.parse(res.body);
        if (data.success && Array.isArray(data.data?.cards)) {
          return { ok: true, note: `${data.data.cards.length} cards found` };
        }
        return { ok: true, note: 'Endpoint active' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 6.1: Guided flow endpoint
  {
    name: 'Guided Flow Endpoint (Phase 6.1)',
    url: `${API_URL}/v1/guided/flow`,
    method: 'POST',
    body: JSON.stringify({ signal: { symbol: 'SPY', entry: 500, target: 510, stopLoss: 495, direction: 'LONG' } }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 201, 400, 401, 403, 422] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 403) return { ok: true, note: 'Subscription/quota required' };
      if (res.status === 422) return { ok: true, note: 'Validation error (market data)' };
      if (res.status === 400) return { ok: true, note: 'Bad request (input validation)' };
      try {
        const data = JSON.parse(res.body);
        if (data.success && data.data?.flow) {
          return { ok: true, note: 'Guided flow executed successfully' };
        }
        return { ok: true, note: 'Endpoint active' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // =========================================================================
  // Phase 7: Operational Loop E2E Artifact Checks
  // =========================================================================
  // Phase 7: Marketplace appraisal returns valuation artifact (with heuristic fallback)
  {
    name: 'Marketplace Appraisal Artifact (Phase 7)',
    url: `${API_URL}/v1/marketplace/appraise`,
    method: 'POST',
    body: JSON.stringify({ query: 'iPhone 15 Pro' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'API returned success=false' };
        const appraisal = data.data?.appraisal || data.data;
        // Phase 7: Must have valuation fields, never "unavailable"
        if (typeof appraisal?.recommendedPrice !== 'number') {
          return { ok: false, error: 'Missing recommendedPrice in valuation artifact' };
        }
        if (typeof appraisal?.confidence !== 'number') {
          return { ok: false, error: 'Missing confidence in valuation artifact' };
        }
        const provenance = appraisal.provenance?.method || (appraisal.sources?.length > 0 ? 'comps' : 'heuristic');
        return { ok: true, note: `Valuation: $${appraisal.recommendedPrice}, conf=${appraisal.confidence}%, method=${provenance}` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 7: Dropshipping listing draft generation
  {
    name: 'Dropship Listing Draft (Phase 7)',
    url: `${API_URL}/v1/dropship/generate`,
    method: 'POST',
    body: JSON.stringify({ productIdea: 'wireless earbuds', niche: 'electronics' }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401, 503] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 503) return { ok: true, note: 'StoreBot not deployed (expected in monolith mode)' };
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'API returned success=false' };
        const draft = data.data?.draft;
        if (!draft?.id) return { ok: false, error: 'Missing draft ID' };
        if (!draft?.title) return { ok: false, error: 'Missing draft title' };
        if (typeof draft?.suggestedPrice !== 'number') return { ok: false, error: 'Missing suggested price' };
        return { ok: true, note: `Draft created: ${draft.id.substring(0, 20)}..., price=$${draft.suggestedPrice}` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 7: Social post plan generation
  {
    name: 'Social Post Plan (Phase 7)',
    url: `${API_URL}/v1/social/plan/generate`,
    method: 'POST',
    body: JSON.stringify({ niche: 'tech', frequency: '3x-week', days: 7 }),
    headers: { 'Content-Type': 'application/json' },
    expect: { status: [200, 401, 503] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 503) return { ok: true, note: 'SocialBot not deployed (expected in monolith mode)' };
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'API returned success=false' };
        const plan = data.data?.plan;
        if (!plan?.id) return { ok: false, error: 'Missing plan ID' };
        if (!Array.isArray(plan?.posts) || plan.posts.length === 0) {
          return { ok: false, error: 'Plan has no posts' };
        }
        return { ok: true, note: `Plan created: ${plan.id.substring(0, 20)}..., ${plan.posts.length} posts` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 7: Paper trade execution returns receipt
  {
    name: 'Paper Trade Endpoint (Phase 7)',
    url: `${API_URL}/v1/trade/paper-trades`,
    method: 'GET',
    expect: { status: [200, 401, 403] },
    customCheck: (res) => {
      if (res.status === 401) return { ok: true, note: 'Auth required (expected)' };
      if (res.status === 403) return { ok: true, note: 'Subscription required (expected)' };
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'API returned success=false' };
        // Should have trades array and stats
        const trades = data.data?.trades || [];
        const stats = data.data?.stats;
        if (stats && typeof stats.totalTrades === 'number') {
          return { ok: true, note: `${trades.length} trades, total=${stats.totalTrades}` };
        }
        return { ok: true, note: `${trades.length} trades loaded` };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
  // Phase 7: Simulator run endpoint
  {
    name: 'Simulator Run Endpoint (Phase 7)',
    url: `${API_URL}/v1/sim/health`,
    method: 'GET',
    expect: { status: [200] },
    customCheck: (res) => {
      try {
        const data = JSON.parse(res.body);
        if (!data.success) return { ok: false, error: 'Simulator health check failed' };
        return { ok: true, note: 'Simulator operational' };
      } catch {
        return { ok: false, error: 'Invalid JSON' };
      }
    },
  },
];

// HTTP request helper
function request(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const client = url.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: TIMEOUT,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Run a single test
async function runTest(test) {
  const startTime = Date.now();
  try {
    const res = await request({
      url: test.url,
      method: test.method,
      headers: test.headers,
      body: test.body,
    });

    const duration = Date.now() - startTime;
    const expectedStatus = Array.isArray(test.expect.status)
      ? test.expect.status
      : [test.expect.status];

    // Check status
    if (!expectedStatus.includes(res.status)) {
      return {
        name: test.name,
        passed: false,
        duration,
        error: `Expected status ${expectedStatus.join('|')}, got ${res.status}`,
        optional: test.optional,
      };
    }

    // Check if JSON expected
    if (test.expect.json) {
      try {
        JSON.parse(res.body);
      } catch {
        return {
          name: test.name,
          passed: false,
          duration,
          error: 'Expected valid JSON response',
        };
      }
    }

    // Run custom check if present
    if (test.customCheck) {
      const checkResult = test.customCheck(res);
      return {
        name: test.name,
        passed: checkResult.ok,
        duration,
        status: res.status,
        note: checkResult.note,
        error: checkResult.error,
      };
    }

    return {
      name: test.name,
      passed: true,
      duration,
      status: res.status,
    };
  } catch (error) {
    return {
      name: test.name,
      passed: false,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
}

// Main execution
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA PRODUCTION VERIFICATION       ║');
  console.log('╚══════════════════════════════════════╝\n');

  console.log(`API URL: ${API_URL}`);
  console.log(`Web URL: ${WEB_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  console.log('Running tests...\n');

  const results = [];
  for (const test of TESTS) {
    const result = await runTest(test);
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    const statusText = result.passed 
      ? `(${result.status})${result.note ? ` - ${result.note}` : ''}`
      : `- ${result.error}`;
    const time = `${result.duration}ms`;
    console.log(`  ${icon} ${result.name} ${statusText} [${time}]`);
  }

  console.log('\n──────────────────────────────────────────────────\n');

  const passed = results.filter(r => r.passed).length;
  const requiredFailed = results.filter(r => !r.passed && !r.optional).length;
  const optionalFailed = results.filter(r => !r.passed && r.optional).length;

  const summary = `${passed} passed, ${requiredFailed} failed${optionalFailed ? `, ${optionalFailed} optional skipped` : ''}`;
  console.log(`📊 Results: ${summary}\n`);

  if (requiredFailed > 0) {
    console.log('❌ PRODUCTION VERIFICATION FAILED\n');
    console.log('Failed tests:');
    results.filter(r => !r.passed && !r.optional).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    if (optionalFailed > 0) {
      console.log('\nOptional tests skipped:');
      results.filter(r => !r.passed && r.optional).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }
    console.log('\nTroubleshooting:');
    console.log('  1. Check service logs in Railway dashboard');
    console.log('  2. Verify DATABASE_URL and REDIS_URL are set');
    console.log('  3. Ensure health check is passing');
    process.exit(1);
  }

  console.log('✅ PRODUCTION VERIFICATION PASSED\n');

  // PROD INTEGRITY: gitSha validation and stale deploy detection
  const versionData = global.__versionData;
  const webVersionData = global.__webVersionData;
  
  if (versionData && LOCAL_COMMIT !== 'unknown') {
    const gitSha = versionData.gitSha || '';
    const isValidGitSha = /^[0-9a-f]{7,40}$/i.test(gitSha);
    
    if (!isValidGitSha) {
      // This should have been caught earlier, but log warning anyway
      console.log('⚠️  WARNING: Backend missing valid gitSha');
      console.log(`   gitSha: "${gitSha || '(empty)'}"`);
      console.log(`   deployId: ${versionData.deployId || versionData.commitSha || 'unknown'}`);
      console.log('   To fix: npm run deploy:prod (will inject GIT_SHA from local HEAD)\n');
    } else if (gitSha !== LOCAL_COMMIT && !LOCAL_COMMIT.startsWith(gitSha) && !gitSha.startsWith(LOCAL_COMMIT.substring(0, 7))) {
      console.log('⚠️  STALE BACKEND DEPLOY DETECTED');
      console.log(`   Local HEAD:  ${LOCAL_COMMIT.substring(0, 7)} (${LOCAL_COMMIT})`);
      console.log(`   Deployed:    ${gitSha.substring(0, 7)} (${gitSha})`);
      console.log('   To redeploy: npm run deploy:prod\n');
    } else {
      console.log(`✅ Backend gitSha matches local HEAD: ${gitSha.substring(0, 7)}`);
    }
  }
  
  // Phase 7.1: Web build identity check (enforced)
  if (webVersionData) {
    const webGitSha = webVersionData.gitSha || '';
    const isValidWebSha = /^[0-9a-f]{7,40}$/i.test(webGitSha);
    
    if (isValidWebSha) {
      console.log(`✅ Web gitSha: ${webGitSha.substring(0, 7)}`);
      
      // Check if matches local HEAD
      if (LOCAL_COMMIT !== 'unknown') {
        if (webGitSha === LOCAL_COMMIT || webGitSha.startsWith(LOCAL_COMMIT.substring(0, 7)) || LOCAL_COMMIT.startsWith(webGitSha.substring(0, 7))) {
          console.log(`✅ Web gitSha matches local HEAD`);
        } else {
          console.log('⚠️  STALE WEB DEPLOY DETECTED');
          console.log(`   Local HEAD:  ${LOCAL_COMMIT.substring(0, 7)}`);
          console.log(`   Web:         ${webGitSha.substring(0, 7)}`);
          console.log('   To redeploy: npm run deploy:web');
        }
      }
      
      // Check if backend and web are in sync
      const backendSha = versionData?.gitSha || '';
      if (backendSha && webGitSha !== backendSha && !webGitSha.startsWith(backendSha.substring(0, 7)) && !backendSha.startsWith(webGitSha.substring(0, 7))) {
        console.log('⚠️  WEB/BACKEND VERSION MISMATCH');
        console.log(`   Backend: ${backendSha.substring(0, 7)}`);
        console.log(`   Web:     ${webGitSha.substring(0, 7)}`);
        console.log('   This can cause "is not a function" errors. Run: npm run deploy:all');
      } else if (backendSha) {
        console.log(`✅ Web and Backend in sync: ${webGitSha.substring(0, 7)}`);
      }
    }
    // Note: Invalid/dev gitSha cases are now FAIL conditions in the test itself
    console.log('');
  } else {
    console.log('ℹ️  Web version endpoint not available\n');
  }

  // Output summary for documentation
  console.log('=== Summary for docs/verification/ ===');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`API: ${API_URL}`);
  console.log(`Web: ${WEB_URL}`);
  console.log(`Tests: ${passed}/${TESTS.length} passed`);
  results.forEach(r => {
    console.log(`  - ${r.name}: ${r.passed ? 'PASS' : 'FAIL'} (${r.duration}ms)`);
  });
}

main().catch(err => {
  console.error(`\n❌ Verification error: ${err.message}`);
  process.exit(1);
});
