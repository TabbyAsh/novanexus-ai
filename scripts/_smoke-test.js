#!/usr/bin/env node
// Smoke test: verify pages render with expected content

const pages = [
  { url: 'http://localhost:4100', expect: ['Flip Card', 'worth flipping', 'Get Started'] },
  { url: 'http://localhost:4100/flip', expect: ['Analyze a Flip', 'Item title', 'Get My Flip Card'] },
  { url: 'http://localhost:4100/pricing', expect: ['Flip Card', 'transparent pricing'] },
];

async function main() {
  let pass = 0, fail = 0;

  for (const page of pages) {
    try {
      const res = await fetch(page.url, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();

      const found = page.expect.filter(e => html.includes(e));
      const missing = page.expect.filter(e => !html.includes(e));

      if (missing.length === 0) {
        console.log(`✅ ${page.url} — all ${found.length} checks passed`);
        pass++;
      } else {
        console.log(`❌ ${page.url} — missing: ${missing.join(', ')}`);
        console.log(`   found: ${found.join(', ')}`);
        console.log(`   HTML length: ${html.length}`);
        fail++;
      }
    } catch (err) {
      console.log(`❌ ${page.url} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
