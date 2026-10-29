const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

function formHtml(id) {
  const start = html.indexOf(`<form id="${id}"`);
  assert.notEqual(start, -1, `missing form ${id}`);
  const end = html.indexOf('</form>', start);
  assert.notEqual(end, -1, `unclosed form ${id}`);
  return html.slice(start, end);
}

function inputTag(form, id) {
  const match = form.match(new RegExp(`<(input|select|textarea)\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  assert.ok(match, `missing #${id}`);
  return match[0];
}

test('homepage forms keep the intake contract', () => {
  for (const id of ['services-form', 'supplier-form', 'quote-form']) {
    const form = formHtml(id);
    assert.match(form, new RegExp(`<form id="${id}"[^>]*action="/api/intake"[^>]*method="POST"`, 'i'));
    assert.match(form, /<input type="hidden" name="inquiry_type" value="(?:services|supplier|buyer_sourcing)">/);
    assert.match(form, /<input type="hidden" name="request_id" value="">/);
    assert.match(form, /name="company_website"/);
    assert.match(form, /<a href="\/privacy">Privacy<\/a>/);
  }

  const services = formHtml('services-form');
  assert.match(services, /name="inquiry_type" value="services"/);
  assert.match(services, /Your details are stored so Wyatt Kirby can reply\. If this form cannot save the inquiry, the next page will say so and nothing is kept\./);
  for (const [id, name, required] of [
    ['services-website', 'company_website', false],
    ['services-name', 'name', true],
    ['services-company', 'company', false],
    ['services-email', 'email', true],
    ['services-phone', 'phone', false],
    ['service-line', 'service_line', true],
    ['services-notes', 'notes', true],
  ]) {
    const tag = inputTag(services, id);
    assert.match(tag, new RegExp(`name="${name}"`));
    assert.equal(tag.includes('required'), required, id);
  }
  assert.match(services, /value="research_b2b_leads"/);
  assert.match(services, /value="research_government_bids"/);
  assert.match(services, /value="software_ai"/);

  const supplier = formHtml('supplier-form');
  assert.match(supplier, /name="inquiry_type" value="supplier"/);
  assert.match(supplier, /Your details are stored so Wyatt Kirby can reply\. If this form cannot save the inquiry, the next page will say so and nothing is kept\./);
  for (const [id, name, required] of [
    ['supplier-website', 'company_website', false],
    ['supplier-name', 'name', true],
    ['supplier-company', 'company', true],
    ['supplier-email', 'email', true],
    ['supplier-phone', 'phone', false],
    ['supplier-country', 'country', true],
    ['supplier-role', 'supplier_role', true],
    ['supplier-product', 'product', true],
    ['supplier-quantity', 'quantity', false],
    ['supplier-notes', 'notes', false],
    ['supplier-permission', 'contact_permission', true],
  ]) {
    const tag = inputTag(supplier, id);
    assert.match(tag, new RegExp(`name="${name}"`));
    assert.equal(/\srequired(?:=|\s|>)/.test(tag) || tag.endsWith('required>'), required, `${id} ${tag}`);
  }

  const quote = formHtml('quote-form');
  assert.match(quote, /name="inquiry_type" value="buyer_sourcing"/);
  assert.match(quote, /Your details are stored so Wyatt Kirby can reply to this inquiry\. If this form cannot save the inquiry, the next page will say so and nothing is kept\./);
  for (const [id, name, required] of [
    ['quote-website', 'company_website', false],
    ['name', 'name', true],
    ['company', 'company', true],
    ['email', 'email', true],
    ['phone', 'phone', false],
    ['country', 'country', false],
    ['product', 'product', true],
    ['quantity', 'quantity', true],
    ['target-date', 'target_date', false],
    ['notes', 'notes', false],
  ]) {
    const tag = inputTag(quote, id);
    assert.match(tag, new RegExp(`name="${name}"`));
    assert.equal(/\srequired(?:=|\s|>)/.test(tag) || tag.endsWith('required>'), required, `${id} ${tag}`);
  }
});

test('privacy page keeps the published retention sentence', () => {
  const privacy = fs.readFileSync(path.join(publicDir, 'privacy.html'), 'utf8');
  assert.match(
    privacy,
    /Inquiries are deleted automatically 24 months after they are received\. Network-address hashes are deleted after 90 days\./,
  );
  assert.equal(privacy.includes('unless they become an active business record'), false);
});

test('sourcing page keeps the buyer form and records sourcing-landing', () => {
  const page = fs.readFileSync(path.join(publicDir, 'sourcing.html'), 'utf8');
  const start = page.indexOf('<form id="quote-form"');
  assert.notEqual(start, -1);
  const form = page.slice(start, page.indexOf('</form>', start));
  assert.match(form, /action="\/api\/intake"[^>]*method="POST"/);
  assert.match(form, /name="inquiry_type" value="buyer_sourcing"/);
  assert.match(form, /name="request_id"/);
  assert.match(form, /name="company_website"/);
  assert.match(form, /name="source" value="sourcing-landing"/);
  assert.match(form, /Your details are stored so Wyatt Kirby can reply to this inquiry\. If this form cannot save the inquiry, the next page will say so and nothing is kept\./);
  assert.match(form, /<a href="\/privacy">Privacy<\/a>/);
  for (const name of ['name', 'company', 'email', 'phone', 'country', 'product', 'quantity', 'target_date', 'notes']) {
    assert.match(form, new RegExp(`name="${name}"`));
  }
  assert.match(page, /Now requesting written quotes from sock mills in Turkey\./);
  assert.match(page, /Retailers, wholesalers, uniform and workwear suppliers/);
  const nexus = fs.readFileSync(path.join(publicDir, 'nexus.html'), 'utf8');
  assert.match(nexus, /data-hero/);
  assert.match(nexus, /import\('\/hero\.js'\)/);
  assert.match(nexus, /Planned as/);
  assert.equal((nexus.match(/in development/gi) || []).length >= 2, true);
  assert.equal(/AI-powered/i.test(nexus), false);
  const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/novanexus-ai\.com\/sourcing/);
  assert.match(sitemap, /https:\/\/novanexus-ai\.com\/nexus/);
  assert.match(html, /href="\/sourcing"/);
  assert.match(html, /href="\/nexus"/);
});

test('homepage keeps the section anchors', () => {
  for (const id of ['products', 'research', 'software', 'trade', 'suppliers', 'quote', 'about', 'services-inquiry', 'supplier-form']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(html, /href="#services-form"[^>]*data-service="software_ai"/);
});

test('hero slot is sized, deferred, and still for reduced motion', () => {
  assert.match(html, /<div class="hero-slot" data-hero/);
  assert.match(html, /class="hero-fallback"/);
  assert.match(html, /addEventListener\('load'/);
  assert.match(html, /import\('\/hero\.js'\)/);
  assert.equal(/<script src="\/hero\.js"/.test(html), false);
  const preloads = html.match(/<link rel="preload" href="\/brand\/fonts\/[^"]+\.woff2" as="font"/g) || [];
  assert.deepEqual(preloads, [
    '<link rel="preload" href="/brand/fonts/space-grotesk-latin-700-normal.woff2" as="font"',
    '<link rel="preload" href="/brand/fonts/inter-latin-400-normal.woff2" as="font"',
  ]);
  const css = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8');
  assert.match(css, /\.hero-slot\{[^}]*aspect-ratio:1440\/900/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  const hero = fs.readFileSync(path.join(publicDir, 'hero.js'), 'utf8');
  assert.match(hero, /prefers-reduced-motion: reduce/);
  assert.match(hero, /IntersectionObserver/);
  assert.match(hero, /visibilitychange/);
  assert.match(hero, /Math\.min\(devicePixelRatio \|\| 1, 2\)/);
  assert.match(hero, /return null/);
  assert.equal(/linens/i.test(html + fs.readFileSync(path.join(publicDir, 'sourcing.html'), 'utf8') + fs.readFileSync(path.join(publicDir, 'nexus.html'), 'utf8')), false);
  assert.equal(/get written quotes/i.test(html), false);
});

test('header keeps a solid background before the translucent layer', () => {
  const css = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8');
  const header = css.match(/\.site-header\{[^}]+\}/);
  assert.ok(header);
  const plain = header[0].indexOf('background-color:var(--space-0)');
  const layer = header[0].indexOf('background:rgba');
  assert.ok(plain !== -1 && layer !== -1 && plain < layer);
});

test('public pages do not call third parties or use removed claims', () => {
  const textExt = new Set(['.html', '.css', '.js', '.svg', '.json', '.webmanifest', '.txt', '.md', '.xml']);
  const banned = [/pakistan/i, /verified/i, /vetted/i, /ready stock/i, /low minimum/i, /trusted by/i, /fonts\.googleapis/i, /fonts\.gstatic/i];
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (textExt.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  walk(publicDir);
  assert.ok(files.length > 5);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
    }
    assert.equal(text.includes('../brand/'), false, file);
  }
});
