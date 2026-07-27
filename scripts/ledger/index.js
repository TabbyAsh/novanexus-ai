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

const cmd = process.argv[2];
if (cmd === 'import') cmdImport();
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
