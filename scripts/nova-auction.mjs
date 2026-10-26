#!/usr/bin/env node
/** Read one explicitly provided ledger, validate it, and emit machine-readable work.
 * Never crawls directories, reads credentials, places bids, or overwrites files.
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { analyze, validateState, learningSummary, lockLedgerForecast } from '../apps/web/public/tools/auction-desk/core.mjs';
const [command, input, output] = process.argv.slice(2);
try {
  if (!['report', 'lock'].includes(command) || !input || (command === 'lock' && !output) || (command === 'report' && output) || process.argv.length > 5) {
    throw new Error('Usage: node scripts/nova-auction.mjs report ledger.json\n       node scripts/nova-auction.mjs lock ledger.json NEW-ledger.json');
  }
  if ((await stat(input)).size > 5_000_000) throw new Error('Ledger exceeds 5 MB limit.');
  const state = await validateState(JSON.parse(await readFile(input, 'utf8')));
  if (command === 'lock') {
    if (state.forecasts.length >= 1000) throw new Error('Forecast limit reached.');
    state.forecasts.push(await lockLedgerForecast(state));
    await writeFile(output, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ status: 'written', path: output, forecastId: state.forecasts.at(-1).id }));
  } else {
    const report = analyze(state.dossier);
    console.log(JSON.stringify({ schemaVersion: 1, report, learning: learningSummary(state),
      provenance: 'Local deterministic calculation on operator-supplied data; not model or market verification' }, null, 2));
    if (report.status === 'invalid') process.exitCode = 2;
    else if (report.status === 'needs_data') process.exitCode = 3;
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
