#!/usr/bin/env node
/**
 * Nova Daily Brief — Email Delivery
 * ==================================
 * Sends the generated Daily Brief to all active subscribers.
 *
 * Usage:
 *   node scripts/send-daily-brief.js
 *   node scripts/send-daily-brief.js --dry-run          # Preview without sending
 *   node scripts/send-daily-brief.js --brief briefs/nova-daily-brief-2026-03-21.json
 *   node scripts/send-daily-brief.js --to user@email.com  # Send to single address (testing)
 *
 * Requires:
 *   RESEND_API_KEY  — Resend.com API key (preferred, easiest setup)
 *   -- or --
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD — standard SMTP
 *
 *   DATABASE_URL — to fetch subscriber list (or use --to for manual)
 *
 * Install Resend: npm install resend (already in package.json if added)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ============================================================================
// CONFIG
// ============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Nova Trader Intelligence <brief@novanexus-ai.com>';
const DATABASE_URL = process.env.DATABASE_URL || '';

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'daily-brief-email.html');
const BRIEFS_DIR = path.join(__dirname, '..', 'briefs');

// ============================================================================
// ARGS
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const singleTo = getArg('--to');
const briefPath = getArg('--brief');

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  const eq = args.find(a => a.startsWith(flag + '='));
  return eq ? eq.split('=').slice(1).join('=') : null;
}

// ============================================================================
// LOAD BRIEF DATA
// ============================================================================

function loadBriefData() {
  // Find the most recent brief JSON
  let jsonPath = briefPath;
  if (!jsonPath) {
    if (!fs.existsSync(BRIEFS_DIR)) {
      throw new Error(`No briefs/ directory. Run 'npm run brief' first.`);
    }
    const files = fs.readdirSync(BRIEFS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) {
      throw new Error(`No brief JSON files found in briefs/. Run 'npm run brief' first.`);
    }
    jsonPath = path.join(BRIEFS_DIR, files[0]);
  }

  console.log(`[LOAD] Reading brief from ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(raw);
}

// ============================================================================
// BUILD HTML EMAIL FROM TEMPLATE + DATA
// ============================================================================

function confidenceTier(score) {
  if (score >= 80) return { dots: '●●●●', label: 'A-tier' };
  if (score >= 65) return { dots: '●●●○', label: 'B-tier' };
  if (score >= 50) return { dots: '●●○○', label: 'C-tier' };
  return { dots: '●○○○', label: 'D-tier' };
}

function regimeLabel(regime) {
  if (!regime) return 'TRANSITIONAL';
  const t = regime.trend || 'TRANSITIONAL';
  const v = regime.vol || 'NORMAL';
  if (t === 'TRENDING' && v === 'HIGH') return 'TRENDING + HIGH VOL';
  if (t === 'TRENDING') return 'TRENDING';
  if (t === 'RANGING') return 'RANGING';
  if (v === 'HIGH') return 'HIGH VOL';
  return t;
}

function buildSetupBlock(card) {
  const tier = confidenceTier(card.confidence || 0);
  const direction = card.direction || (card.type === 'bearish' ? 'Short' : 'Long');
  const setupType = (card.setupType || card.board || card.pattern || 'Setup').replace(/_/g, ' ');

  let entry = card.entry ? `$${Number(card.entry).toFixed(2)}` : '—';
  let stop = card.stop ? `$${Number(card.stop).toFixed(2)}` : '—';
  let t1 = card.targets?.t1 ? `$${Number(card.targets.t1).toFixed(2)}` : (card.target ? `$${Number(card.target).toFixed(2)}` : '—');
  let rr = '—';
  if (card.entry && card.stop && (card.targets?.t1 || card.target)) {
    const risk = Math.abs(card.entry - card.stop);
    const reward = Math.abs((card.targets?.t1 || card.target) - card.entry);
    if (risk > 0) rr = `1:${(reward / risk).toFixed(1)}`;
  } else if (card.riskReward) {
    rr = `1:${card.riskReward.toFixed(1)}`;
  }

  const caution = (card.riskFlags && card.riskFlags.length > 0)
    ? `<div style="font-size:12px;color:#fbbf24;margin-bottom:4px;">⚠ ${card.riskFlags.join(', ')}</div>` : '';
  const invalidation = card.scenarioTree?.ifFails
    ? card.scenarioTree.ifFails
    : (card.stopLoss ? `Close below $${Number(card.stopLoss).toFixed(2)}` : 'See stop level');

  return `<tr><td style="padding:8px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111827;border:1px solid #1f2937;border-radius:8px;">
<tr><td style="padding:16px;">
<div style="margin-bottom:8px;"><span style="font-size:20px;font-weight:bold;color:#fff;">${card.symbol}</span><span style="font-size:14px;color:#a78bfa;margin-left:8px;">— ${setupType} ${direction}</span></div>
<div style="font-size:13px;color:#d1d5db;margin-bottom:12px;">${card.reasoning || card.entryTrigger || ''}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
<tr>
<td style="width:25%;padding:4px 0;"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Entry</div><div style="font-size:14px;color:#34d399;font-weight:600;">${entry}</div></td>
<td style="width:25%;padding:4px 0;"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Stop</div><div style="font-size:14px;color:#f87171;font-weight:600;">${stop}</div></td>
<td style="width:25%;padding:4px 0;"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Target 1</div><div style="font-size:14px;color:#34d399;font-weight:600;">${t1}</div></td>
<td style="width:25%;padding:4px 0;"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;">R:R</div><div style="font-size:14px;color:#fff;font-weight:600;">${rr}</div></td>
</tr></table>
<div style="margin-bottom:8px;"><span style="font-size:11px;color:#6b7280;">CONFIDENCE:</span> <span style="font-size:13px;color:#34d399;">${tier.dots}</span> <span style="font-size:11px;color:#9ca3af;">(${tier.label})</span></div>
${caution}
<div style="font-size:12px;color:#f87171;">✕ Invalidation: ${invalidation}</div>
</td></tr></table></td></tr>`;
}

function buildEmailHtml(scanData) {
  const signals = scanData.signals || [];
  const sorted = [...signals].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const priority = sorted.slice(0, 5);
  const supporting = sorted.slice(5, 12);

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const regime = priority[0]?.regime ? regimeLabel(priority[0].regime) : 'TRANSITIONAL';

  const setupBlocks = priority.map(c => buildSetupBlock(c)).join('\n');
  const supportingList = supporting.map(c => {
    const tier = confidenceTier(c.confidence || 0);
    return `${c.symbol} — ${(c.reasoning || c.pattern || '').slice(0, 50)} [${tier.label}]`;
  }).join('<br>');

  // Read template and replace placeholders
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  html = html.replace(/\{\{DATE\}\}/g, date);
  html = html.replace(/\{\{REGIME\}\}/g, regime);

  // Replace the setup block placeholder with real setups
  const setupStart = html.indexOf('<!-- {{PRIORITY_SETUPS_START}} -->');
  const setupEnd = html.indexOf('<!-- {{PRIORITY_SETUPS_END}} -->');
  if (setupStart >= 0 && setupEnd >= 0) {
    const endTag = '<!-- {{PRIORITY_SETUPS_END}} -->';
    html = html.substring(0, setupStart) + setupBlocks + html.substring(setupEnd + endTag.length);
  }

  html = html.replace('{{SUPPORTING_LIST}}', supportingList || 'No supporting setups today.');
  html = html.replace('{{REGIME_CONTEXT}}', '[Operator: Add SPY/VIX/QQQ context here before sending]');
  html = html.replace('{{UNSUBSCRIBE_URL}}', 'https://novanexus-ai.com/settings/billing');

  return html;
}

// ============================================================================
// SEND VIA RESEND API (simplest path — no SMTP config needed)
// ============================================================================

async function sendViaResend(to, subject, html) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      from: EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Resend API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ============================================================================
// SEND VIA SMTP (nodemailer-free minimal implementation)
// ============================================================================

async function sendViaSMTP(to, subject, html) {
  // For SMTP we need nodemailer — check if available
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error(
      'SMTP sending requires nodemailer. Install it:\n  npm install nodemailer\n\n' +
      'Or use Resend instead (set RESEND_API_KEY).'
    );
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  const result = await transporter.sendMail({
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  });

  return result;
}

// ============================================================================
// GET SUBSCRIBER LIST FROM DATABASE
// ============================================================================

async function getSubscribers() {
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set. Cannot fetch subscriber list.\n' +
      'Use --to email@example.com for manual sending.'
    );
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    throw new Error('pg module not found. Run: npm install');
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Get all active founding/lite/pro users with email
    const result = await client.query(`
      SELECT DISTINCT u.email
      FROM users u
      JOIN entitlements e ON e.user_id = u.id
      WHERE e.status = 'ACTIVE'
        AND e.plan IN ('FOUNDING', 'LITE', 'PRO')
        AND u.email IS NOT NULL
        AND u.email != ''
      ORDER BY u.email
    `);
    return result.rows.map(r => r.email);
  } finally {
    await client.end();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   NOVA DAILY BRIEF — EMAIL DELIVERY       ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  // Determine send method
  let sendFn;
  if (RESEND_API_KEY) {
    sendFn = sendViaResend;
    console.log('[CONFIG] Delivery method: Resend API');
  } else if (SMTP_HOST) {
    sendFn = sendViaSMTP;
    console.log('[CONFIG] Delivery method: SMTP');
  } else {
    console.error('[CONFIG] ✕ No email delivery configured.');
    console.error('  Set RESEND_API_KEY (recommended) or SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD');
    if (!DRY_RUN) process.exit(1);
    console.log('[CONFIG] Continuing in dry-run mode...');
  }

  // Load brief data
  let scanData;
  try {
    scanData = loadBriefData();
    console.log(`[LOAD] ✓ Brief loaded with ${scanData.signals?.length || 0} signals`);
  } catch (err) {
    console.error(`[LOAD] ✕ ${err.message}`);
    process.exit(1);
  }

  // Build HTML
  const html = buildEmailHtml(scanData);
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const subject = `Nova Daily Brief — ${date}`;
  console.log(`[BUILD] ✓ Email HTML built (${(html.length / 1024).toFixed(1)} KB)`);

  // Get recipients
  let recipients;
  if (singleTo) {
    recipients = [singleTo];
    console.log(`[SEND] Target: ${singleTo} (manual)`);
  } else {
    try {
      recipients = await getSubscribers();
      console.log(`[SEND] ✓ ${recipients.length} active subscribers found`);
    } catch (err) {
      console.error(`[SEND] ✕ ${err.message}`);
      process.exit(1);
    }
  }

  if (recipients.length === 0) {
    console.log('[SEND] No recipients. Nothing to send.');
    return;
  }

  if (DRY_RUN) {
    console.log('');
    console.log('[DRY RUN] Would send to:');
    for (const r of recipients) console.log(`  → ${r}`);
    console.log(`[DRY RUN] Subject: ${subject}`);
    console.log(`[DRY RUN] HTML size: ${html.length} bytes`);

    // Save preview
    const previewPath = path.join(BRIEFS_DIR, 'email-preview.html');
    if (!fs.existsSync(BRIEFS_DIR)) fs.mkdirSync(BRIEFS_DIR, { recursive: true });
    fs.writeFileSync(previewPath, html, 'utf-8');
    console.log(`[DRY RUN] Preview saved to ${previewPath}`);
    return;
  }

  // Send
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await sendFn(recipient, subject, html);
      sent++;
      console.log(`[SENT] ✓ ${recipient}`);
    } catch (err) {
      failed++;
      console.error(`[FAIL] ✕ ${recipient}: ${err.message}`);
    }
    // Rate limit: 100ms between sends
    if (recipients.length > 1) await new Promise(r => setTimeout(r, 100));
  }

  console.log('');
  console.log(`[DONE] Sent: ${sent} | Failed: ${failed} | Total: ${recipients.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
