#!/usr/bin/env node
/**
 * Nova Ledger tests.  Run:  node scripts/ledger/ledger.test.js
 *
 * Fixtures are shaped like genuine exports — quoted descriptions containing
 * commas, debit/credit column pairs, all-positive amounts with the direction
 * in a type column, and the same money appearing in two accounts because it
 * was transferred between them.
 */
const { parseCsv, parseMoney, parseDate } = require('./csv');
const { normalizeRecords } = require('./normalize');
const { findInternalTransfers, findRecurring, monthlySummary, computeRunway } = require('./analyze');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
};

console.log('\ncsv parsing');
{
  const text = 'Date,Description,Amount\n2026-07-01,"COFFEE SHOP, DOWNTOWN",-4.50\n2026-07-02,"SAID ""HELLO""",-2.00\n';
  const { headers, records } = parseCsv(text);
  check('headers found', headers.join(',') === 'Date,Description,Amount');
  check('quoted comma survives', records[0].Description === 'COFFEE SHOP, DOWNTOWN');
  check('escaped quotes survive', records[1].Description === 'SAID "HELLO"');
  check('money parses', parseMoney('-4.50') === -4.5);
  check('parenthesised negatives', parseMoney('(45.00)') === -45);
  check('currency symbols and commas', parseMoney('$1,234.56') === 1234.56);
  check('blank is null not zero', parseMoney('') === null);
  check('US dates', parseDate('07/25/2026') === '2026-07-25');
  check('ISO dates', parseDate('2026-07-25 14:03:00') === '2026-07-25');
  check('written dates', parseDate('Jul 25, 2026') === '2026-07-25');
}

console.log('\ndebit/credit column pairs');
{
  const text = 'Posted Date,Details,Debit,Credit,Balance\n07/01/2026,PAYROLL,,2000.00,2500.00\n07/02/2026,RENT,900.00,,1600.00\n';
  const { headers, records } = parseCsv(text);
  const { transactions, mapping } = normalizeRecords(records, headers, 'bank.csv', 'bank');
  check('credit is inflow', transactions[0].amount === 2000);
  check('debit is outflow', transactions[1].amount === -900, `got ${transactions[1].amount}`);
  check('mapping is reported', mapping.assumptions.length >= 2);
}

console.log('\nall-positive amounts with direction in a type column');
{
  const text = 'Date,Transaction Type,Amount\n2026-07-01,Deposit,500.00\n2026-07-03,Purchase,42.10\n2026-07-05,Withdrawal,60.00\n';
  const { headers, records } = parseCsv(text);
  const { transactions, signNote } = normalizeRecords(records, headers, 'cashapp.csv', 'cashapp');
  check('deposit stays positive', transactions[0].amount === 500);
  check('purchase becomes negative', transactions[1].amount === -42.1, `got ${transactions[1].amount}`);
  check('withdrawal becomes negative', transactions[2].amount === -60);
  check('the inference is disclosed', /direction inferred/.test(signNote || ''));
}

console.log('\ninternal transfers — the double-count trap');
{
  const tx = [
    { date: '2026-05-02', amount: -500, description: 'TRANSFER TO BROKERAGE', account: 'bank' },
    { date: '2026-05-03', amount: 500, description: 'ACH DEPOSIT', account: 'webull' },
    { date: '2026-05-04', amount: -80, description: 'GROCERIES', account: 'bank' },
    { date: '2026-05-06', amount: 1200, description: 'CLIENT PAYMENT', account: 'bank' },
  ];
  const flags = findInternalTransfers(tx);
  check('both legs flagged', flags.size === 2, `flagged ${flags.size}`);
  check('real expense untouched', !flags.has(2));
  check('real income untouched', !flags.has(3));

  const months = monthlySummary(tx, flags);
  check('income excludes the transfer', months[0].income === 1200, `income=${months[0].income}`);
  check('spend excludes the transfer', months[0].spend === 80, `spend=${months[0].spend}`);

  // Same amount, same account, weeks apart — must NOT be paired.
  const notTransfer = findInternalTransfers([
    { date: '2026-05-01', amount: -50, description: 'GAS', account: 'bank' },
    { date: '2026-05-28', amount: 50, description: 'REFUND', account: 'bank' },
  ]);
  check('same-account pairs are not transfers', notTransfer.size === 0);
}

console.log('\nburn and runway');
{
  const tx = [];
  for (const m of ['04', '05', '06']) {
    tx.push({ date: `2026-${m}-01`, amount: 1000, description: 'INCOME', account: 'bank' });
    tx.push({ date: `2026-${m}-15`, amount: -1400, description: 'LIFE', account: 'bank' });
  }
  // Incomplete current month — must not drag burn down.
  tx.push({ date: '2026-07-01', amount: -50, description: 'PARTIAL MONTH', account: 'bank' });

  const months = monthlySummary(tx, findInternalTransfers(tx));
  const r = computeRunway(months, 1200, { today: '2026-07-25' });
  check('current month excluded', !r.months.includes('2026-07'), `months=${r.months}`);
  check('burn is the real monthly gap', r.burn === 400, `burn=${r.burn}`);
  check('runway divides cash by burn', r.runwayMonths === 3, `runway=${r.runwayMonths}`);
  check('a date is given', /^\d{4}-\d{2}-\d{2}$/.test(r.runwayDate));

  const surplus = computeRunway(
    [{ month: '2026-05', income: 3000, spend: 1000, net: 2000, count: 2 },
     { month: '2026-06', income: 3000, spend: 1000, net: 2000, count: 2 }],
    500, { today: '2026-07-25' }
  );
  check('no burn when income covers spend', surplus.burn === 0 && surplus.runwayMonths === null);

  const empty = computeRunway([{ month: '2026-07', income: 0, spend: 10, net: -10, count: 1 }], 100, { today: '2026-07-25' });
  check('refuses with no complete month', empty.ok === false);
}

console.log('\nrecurring charges');
{
  const tx = [
    { date: '2026-04-03', amount: -15.99, description: 'NETFLIX.COM 8829', account: 'card' },
    { date: '2026-05-03', amount: -15.99, description: 'NETFLIX.COM 1042', account: 'card' },
    { date: '2026-06-03', amount: -15.99, description: 'NETFLIX.COM 7781', account: 'card' },
    { date: '2026-04-11', amount: -62.4, description: 'GROCERY MART', account: 'card' },
    { date: '2026-04-19', amount: -12.0, description: 'GROCERY MART', account: 'card' },
    { date: '2026-05-02', amount: -140.0, description: 'GROCERY MART', account: 'card' },
  ];
  const rec = findRecurring(tx);
  check('finds the subscription', rec.some((r) => r.label.includes('netflix')), JSON.stringify(rec.map((r) => r.label)));
  check('reports its monthly cost', rec.find((r) => r.label.includes('netflix')).monthly === 15.99);
  check('varying amounts are not called recurring', !rec.some((r) => r.label.includes('grocery')));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
