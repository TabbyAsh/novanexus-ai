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

test('homepage keeps the section anchors', () => {
  for (const id of ['products', 'research', 'software', 'trade', 'suppliers', 'quote', 'about', 'services-inquiry', 'supplier-form']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(html, /href="#services-form"[^>]*data-service="software_ai"/);
});

test('header color-mix has a solid background fallback first', () => {
  const css = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8');
  const header = css.match(/\.site-header\{[^}]+\}/);
  assert.ok(header);
  const plain = header[0].indexOf('background-color:var(--c-bg)');
  const mix = header[0].indexOf('color-mix(');
  assert.ok(plain !== -1 && mix !== -1 && plain < mix);
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
