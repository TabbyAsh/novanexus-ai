#!/usr/bin/env node
/** Deterministic source-to-single-HTML bundle, no new dependencies. */
import { readFile, writeFile } from 'node:fs/promises';
const base = new URL('../apps/web/public/tools/auction-desk/', import.meta.url);
const output = process.argv[2];
if (!output || process.argv.length !== 3) {
  console.error('Usage: node scripts/build-auction-desk-portable.mjs NEW-output.html');
  process.exitCode = 1;
} else {
  try {
    const [core, desk, html] = await Promise.all(['core.mjs', 'desk.mjs', 'index.html'].map(p => readFile(new URL(p, base), 'utf8')));
    const code = core.replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
    const ui = desk.slice(desk.indexOf('const KEY ='));
    const out = html.replace('<script type="module" src="./desk.mjs"></script>', '<script type="module">\n' + code + '\n' + ui + '\n</script>')
      .replace('<a class="button" href="/analyze" target="_top">Open existing item appraiser ↗</a>', '<span class="muted">Item appraisals can be imported as JSON.</span>');
    await writeFile(output, out, { flag: 'wx' });
    console.log(output);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
