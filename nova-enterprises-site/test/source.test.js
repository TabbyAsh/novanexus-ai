const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeInquiry } = require('../lib/intake/validate');

function buyer(overrides = {}) {
  return {
    inquiry_type: 'buyer_sourcing',
    request_id: 'req-source-check0001',
    name: 'Avery Buyer',
    company: 'Example Retail',
    email: 'avery.buyer@example.com',
    product: 'Cotton terry towels',
    quantity: '200 towels',
    ...overrides,
  };
}

test('source is website or sourcing-landing, and anything else is rejected', () => {
  const landing = normalizeInquiry(buyer({ source: 'sourcing-landing', request_id: 'req-source-landing01' }), {
    env: { VERCEL_ENV: 'preview' },
  });
  assert.equal(landing.ok, true);
  assert.equal(landing.value.source, 'sourcing-landing');

  const omitted = normalizeInquiry(buyer({ request_id: 'req-source-default1' }), { env: {} });
  assert.equal(omitted.ok, true);
  assert.equal(omitted.value.source, 'website');

  const explicit = normalizeInquiry(buyer({ source: 'website', request_id: 'req-source-website1' }), { env: {} });
  assert.equal(explicit.ok, true);
  assert.equal(explicit.value.source, 'website');

  const preview = normalizeInquiry(buyer({ request_id: 'req-source-preview1' }), { env: { VERCEL_ENV: 'preview' } });
  assert.equal(preview.value.source, 'website-preview');

  const rejected = normalizeInquiry(buyer({ source: 'newsletter', request_id: 'req-source-rejected1' }), { env: {} });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.source, /sourcing-landing/);
});
