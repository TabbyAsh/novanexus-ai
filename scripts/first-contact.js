#!/usr/bin/env node
/**
 * FIRST CONTACT DETECTOR
 * ======================
 * The whole strategy's win condition is "a stranger uses a tool and gets real
 * value." Until now nothing measured it: appraisals were logged to flip_events
 * and never read, and the outbound email path is dead, so a real arrival could
 * have come and gone unnoticed.
 *
 * This answers one question honestly: has anyone who is NOT the founder used
 * the flip tool, and when?
 *
 *   node scripts/first-contact.js            # report state, remember it
 *   node scripts/first-contact.js --all      # every visitor, not just new ones
 *   node scripts/first-contact.js --reset    # forget the watermark
 *
 * Connection: uses DATABASE_PUBLIC_URL / DATABASE_URL from the environment if
 * set, otherwise asks the Railway CLI for the Postgres service's public URL.
 * (The service's own DATABASE_URL is an internal hostname and is unreachable
 * from this machine — that is why the public proxy URL is required.)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Traffic that is known to be us, not the market. Override or extend with
// NOVA_KNOWN_IPS="1.2.3.4,5.6.7.8" — the founder's home IP will change, and a
// stale entry here would hide a real arrival, which is the one thing this
// script exists to prevent.
const KNOWN_OURS = new Set([
  '::1', '127.0.0.1', 'localhost', 'unknown', '184.18.13.70',
  ...String(process.env.NOVA_KNOWN_IPS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

const STATE_FILE = path.join(__dirname, '..', '.first-contact.json');
const args = process.argv.slice(2);
const showAll = args.includes('--all');
const doReset = args.includes('--reset');

function resolveDbUrl() {
  const fromEnv = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (fromEnv && !/railway\.internal/.test(fromEnv)) return fromEnv;
  try {
    // Node refuses to execFile a .cmd shim on Windows, so go through the shell.
    const out = execSync('npx @railway/cli variables --service Postgres --json', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000,
    });
    const v = JSON.parse(out);
    if (v.DATABASE_PUBLIC_URL) return v.DATABASE_PUBLIC_URL;
  } catch { /* fall through to the honest error below */ }
  return null;
}

// x-forwarded-for arrives as "client, proxy1, proxy2" — the client is first.
const clientIp = (raw) => String(raw || 'unknown').split(',')[0].trim();

(async () => {
  if (doReset) {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    console.log('watermark cleared.');
    return;
  }

  const url = resolveDbUrl();
  if (!url) {
    console.error('Could not resolve a reachable database URL.');
    console.error('Set DATABASE_PUBLIC_URL, or run `npx @railway/cli login` first.');
    process.exit(2);
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const { rows } = await pool.query(`
    SELECT ip, created_at, details
    FROM flip_events
    WHERE event = 'analyzed'
    ORDER BY created_at ASC`);
  await pool.end();

  const visitors = new Map(); // client ip -> { hits, first, last, verdicts }
  for (const r of rows) {
    const ip = clientIp(r.ip);
    if (KNOWN_OURS.has(ip)) continue;
    const v = visitors.get(ip) || { hits: 0, first: r.created_at, last: r.created_at, verdicts: [] };
    v.hits++;
    v.last = r.created_at;
    const verdict = r.details && (r.details.verdict || r.details.decision);
    if (verdict) v.verdicts.push(verdict);
    visitors.set(ip, v);
  }

  const prev = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : { seen: [] };
  const seen = new Set(prev.seen || []);
  const fresh = [...visitors.keys()].filter((ip) => !seen.has(ip));

  console.log(`total appraisals recorded : ${rows.length}`);
  console.log(`appraisals from strangers : ${[...visitors.values()].reduce((n, v) => n + v.hits, 0)}`);
  console.log(`distinct strangers        : ${visitors.size}`);
  console.log('');

  if (visitors.size === 0) {
    console.log('NO STRANGER HAS EVER USED THE TOOL.');
    console.log('Every appraisal on record traces to this machine or the founder\'s IP.');
    console.log('Nothing is broken — nobody has arrived. The gap is distribution.');
  } else {
    if (fresh.length > 0) {
      console.log(`*** ${fresh.length} NEW STRANGER${fresh.length === 1 ? '' : 'S'} SINCE LAST CHECK ***`);
      console.log('');
    }
    const list = showAll ? [...visitors.keys()] : (fresh.length ? fresh : [...visitors.keys()]);
    for (const ip of list) {
      const v = visitors.get(ip);
      const marker = fresh.includes(ip) ? 'NEW  ' : '     ';
      const verdicts = v.verdicts.length ? ` verdicts=[${[...new Set(v.verdicts)].join(',')}]` : '';
      console.log(`${marker}${ip.padEnd(40)} checks=${String(v.hits).padStart(3)}  first=${new Date(v.first).toISOString().slice(0, 16)}  last=${new Date(v.last).toISOString().slice(0, 16)}${verdicts}`);
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify({ seen: [...visitors.keys()], checkedAt: new Date().toISOString() }, null, 2));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
