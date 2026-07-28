#!/usr/bin/env node
/**
 * NOVA LEDGER — local-first money picture.
 *
 *   node scripts/ledger import            # read every CSV in .ledger/inbox
 *   node scripts/ledger runway --cash 2500
 *   node scripts/ledger recurring
 *   node scripts/ledger months
 *
 * Everything stays on this machine: .ledger/ is gitignored and nothing here
 * makes a network call. Drop exports from any bank, card, Webull or Cash App
 * into .ledger/inbox and run import — columns are detected by meaning, and the
 * mapping chosen for each file is printed so a wrong guess is visible.
 */
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./csv');
const { normalizeRecords } = require('./normalize');
const { findInternalTransfers, findRecurring, monthlySummary, computeRunway } = require('./analyze');
const { discover, SEARCH_DIRS } = require('./discover');
const { readPdf } = require('./pdf');
const { parseStatement } = require('./statements');

const ROOT = path.join(__dirname, '..', '..');
const LEDGER_DIR = path.join(ROOT, '.ledger');
const INBOX = path.join(LEDGER_DIR, 'inbox');
const STORE = path.join(LEDGER_DIR, 'transactions.json');

const money = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2);
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function cmdImport() {
  fs.mkdirSync(INBOX, { recursive: true });
  const files = fs.readdirSync(INBOX).filter((f) => /\.csv$/i.test(f));
  if (files.length === 0) {
    console.log(`No CSVs found in ${path.relative(ROOT, INBOX)}`);
    console.log('Export from your bank / card / Webull / Cash App and drop the files there, then run this again.');
    return;
  }

  const all = [];
  console.log(`Reading ${files.length} file${files.length === 1 ? '' : 's'}:\n`);

  for (const file of files) {
    const text = fs.readFileSync(path.join(INBOX, file), 'utf8');
    const { headers, records } = parseCsv(text);
    const account = file.replace(/\.csv$/i, '');
    const { transactions, mapping, skipped, signNote } = normalizeRecords(records, headers, file, account);

    console.log(`  ${file}`);
    console.log(`    detected  : ${mapping.source}`);
    console.log(`    rows      : ${transactions.length} imported${skipped ? `, ${skipped} skipped (no date or amount)` : ''}`);
    if (mapping.assumptions.length) console.log(`    assumed   : ${mapping.assumptions.join('; ')}`);
    if (signNote) console.log(`    NOTE      : ${signNote}`);
    if (transactions.length) {
      const dates = transactions.map((t) => t.date).sort();
      console.log(`    covering  : ${dates[0]} to ${dates[dates.length - 1]}`);
    }
    console.log('');
    all.push(...transactions);
  }

  all.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(STORE, JSON.stringify({ importedAt: new Date().toISOString(), transactions: all }, null, 2));

  const flags = findInternalTransfers(all);
  console.log(`${all.length} transactions saved to ${path.relative(ROOT, STORE)}`);
  if (flags.size) console.log(`${flags.size} look like internal transfers between your own accounts — excluded from income and spending.`);
  console.log('\nNext:  node scripts/ledger runway --cash <what you have liquid>');
}

function load() {
  if (!fs.existsSync(STORE)) {
    console.error('Nothing imported yet. Run:  node scripts/ledger import');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(STORE, 'utf8')).transactions;
}

function cmdMonths() {
  const tx = load();
  const flags = findInternalTransfers(tx);
  const months = monthlySummary(tx, flags);
  console.log('\nmonth      income        spend          net');
  console.log('------------------------------------------------');
  for (const m of months) {
    console.log(`${m.month}  ${money(m.income).padStart(10)}  ${money(m.spend).padStart(11)}  ${money(m.net).padStart(11)}`);
  }
  console.log('');
}

function cmdRunway() {
  const tx = load();
  const flags = findInternalTransfers(tx);
  const months = monthlySummary(tx, flags);
  const cashArg = arg('--cash');
  const cash = cashArg == null ? null : Number(String(cashArg).replace(/[$,]/g, ''));
  const r = computeRunway(months, cash);

  console.log('');
  if (!r.ok) { console.log(r.reason); return; }

  console.log(`Based on ${r.monthsConsidered} complete month${r.monthsConsidered === 1 ? '' : 's'} (${r.months.join(', ')})`);
  console.log(`  median income : ${money(r.medianMonthlyIncome)}`);
  console.log(`  median spend  : ${money(r.medianMonthlySpend)}`);
  console.log(`  median net    : ${money(r.medianMonthlyNet)}`);
  console.log('');
  console.log(r.verdict);
  if (r.runwayMonths != null) console.log(`  at this rate, funds run out around ${r.runwayDate}`);
  console.log('\nThe current month is excluded — it is incomplete, and counting it would');
  console.log('make burn look smaller than it is.\n');
}

function cmdRecurring() {
  const tx = load();
  const rec = findRecurring(tx);
  if (!rec.length) {
    console.log('\nNo monthly-cadence charges detected yet (needs 3+ occurrences of a similar amount).\n');
    return;
  }
  const total = rec.reduce((s, r) => s + r.monthly, 0);
  console.log(`\n${rec.length} recurring charges — ${money(total)}/month, ${money(total * 12)}/year:\n`);
  for (const r of rec) {
    console.log(`  ${money(r.monthly).padStart(10)}  ${r.label.padEnd(22)} ${r.occurrences}x, last ${r.lastSeen}`);
  }
  console.log('\nThese are detected from your own statements, not guessed. Cancelling one');
  console.log('is the fastest dollar in this whole system.\n');
}

/**
 * The whole thing in one command: find the exports, read them, and say what
 * they mean. No moving files, no flags, no knowing which number to supply.
 */
function cmdAuto() {
  console.log('\nLooking for financial exports in your Downloads, Desktop and Documents…\n');
  const found = discover([INBOX]);

  if (found.length === 0) {
    console.log('Found none yet. Nothing is wrong — there is just nothing to read.\n');
    console.log('Download a CSV export from your bank, card, Webull or Cash App');
    console.log('(see scripts/ledger/EXPORTS.md for exactly where the button is),');
    console.log('leave it wherever it lands, and run this again:\n');
    console.log('  node scripts/ledger auto\n');
    return;
  }

  console.log(`Found ${found.length} file${found.length === 1 ? '' : 's'} that look like money:\n`);
  const all = [];
  for (const f of found) {
    console.log(`  ${f.name}  —  ${f.institution}`);

    if (f.kind === 'pdf') {
      const r = readPdf(f.path);
      if (!r.text) {
        for (const w of r.warnings) console.log(`    ${w}`);
        console.log('');
        continue;
      }
      const p = parseStatement(r.text, f.name.replace(/\.pdf$/i, ''));
      if (p.transactions.length === 0) {
        console.log('    no transaction table found — skipping (probably not a statement)\n');
        continue;
      }
      const how = r.method === 'ocr' ? `scanned pages, read by OCR` : 'text in the PDF';
      console.log(`    ${p.transactions.length} transactions from ${how}`);
      console.log(`    ${p.reconciled} of ${p.transactions.length} reconcile against the running balance`);
      if (p.accounts.length > 1) console.log(`    accounts: ${p.accounts.join(' | ')}`);
      if (p.unreconciled > 0) {
        console.log(`    ${p.unreconciled} did not — their amounts come from the balance change, which is`);
        console.log('    the reliable column, but check those rows if a figure looks odd.');
      }
      console.log('');
      all.push(...p.transactions);
      continue;
    }

    const account = f.name.replace(/\.csv$/i, '');
    const { transactions, mapping, skipped, signNote } = normalizeRecords(f.records, f.headers, f.name, account);
    console.log(`    ${transactions.length} transactions${skipped ? `, ${skipped} rows skipped` : ''}`);
    if (mapping.assumptions.length) console.log(`    read as: ${mapping.assumptions.join('; ')}`);
    if (signNote) console.log(`    NOTE: ${signNote}`);
    console.log('');
    all.push(...transactions);
  }

  if (all.length === 0) {
    console.log('None of them had readable dates and amounts. Send me the output above and I will fix the parser.\n');
    return;
  }

  all.sort((a, b) => a.date.localeCompare(b.date));
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({ importedAt: new Date().toISOString(), transactions: all }, null, 2));

  const flags = findInternalTransfers(all);
  const months = monthlySummary(all, flags);
  const dates = all.map((t) => t.date);
  console.log('─'.repeat(64));
  console.log(`\n${all.length} transactions, ${dates[0]} to ${dates[dates.length - 1]}`);
  if (flags.size) console.log(`${flags.size} were transfers between your own accounts — not counted as income or spending.`);

  if (months.length) {
    console.log('\nmonth      income        spend          net');
    for (const m of months) {
      console.log(`${m.month}  ${money(m.income).padStart(10)}  ${money(m.spend).padStart(11)}  ${money(m.net).padStart(11)}`);
    }
  }

  // Use the statement's own closing balance when it has one, so there is no
  // number to look up. Labelled, because a credit-card balance is debt.
  const cashArg = arg('--cash');
  const inferred = inferCash(all);
  const cash = cashArg != null ? Number(String(cashArg).replace(/[$,]/g, '')) : inferred.total;

  const r = computeRunway(months, cash);
  console.log('');
  if (!r.ok) {
    console.log(r.reason);
  } else {
    if (cashArg == null && inferred.accounts.length) {
      console.log('Closing balances read from the statements themselves:');
      for (const a of inferred.accounts) console.log(`  ${money(a.balance).padStart(12)}  ${a.account} (as of ${a.date})`);
      console.log('  If any of those is a CREDIT CARD, that is debt, not cash —');
      console.log('  re-run with:  node scripts/ledger auto --cash <your real cash>');
      console.log('');
    }
    console.log(r.verdict);
    if (r.runwayMonths != null) console.log(`At this rate, funds run out around ${r.runwayDate}.`);
  }

  const rec = findRecurring(all);
  if (rec.length) {
    const total = rec.reduce((s, x) => s + x.monthly, 0);
    console.log(`\n${rec.length} recurring charges — ${money(total)}/month, ${money(total * 12)}/year:`);
    for (const x of rec.slice(0, 12)) {
      console.log(`  ${money(x.monthly).padStart(10)}  ${x.label.padEnd(22)} ${x.occurrences}x, last ${x.lastSeen}`);
    }
    console.log('\nRent and utilities belong here; so do subscriptions you forgot.');
    console.log('Cancelling one of the forgettable ones is the fastest dollar in this system.');
  }

  console.log('\nNothing left this machine. Paste this output to me and I will read it with you.\n');
}

/** Most recent closing balance per account, when the export carries one. */
function inferCash(transactions) {
  const latest = new Map();
  for (const t of transactions) {
    if (typeof t.balance !== 'number' || !Number.isFinite(t.balance)) continue;
    const cur = latest.get(t.account);
    if (!cur || t.date >= cur.date) latest.set(t.account, { account: t.account, balance: t.balance, date: t.date });
  }
  const accounts = [...latest.values()];
  return { accounts, total: accounts.length ? accounts.reduce((s, a) => s + a.balance, 0) : null };
}

const cmd = process.argv[2];
if (cmd === 'auto' || cmd === undefined) cmdAuto();
else if (cmd === 'import') cmdImport();
else if (cmd === 'runway') cmdRunway();
else if (cmd === 'recurring') cmdRecurring();
else if (cmd === 'months') cmdMonths();
else {
  console.log(`
NOVA LEDGER — your money, on your machine.

  node scripts/ledger import              read every CSV in .ledger/inbox
  node scripts/ledger runway --cash 2500  burn rate and how long it lasts
  node scripts/ledger recurring           subscriptions and repeat charges
  node scripts/ledger months              income/spend/net per month

Nothing leaves this machine. .ledger/ is gitignored.
`);
}
