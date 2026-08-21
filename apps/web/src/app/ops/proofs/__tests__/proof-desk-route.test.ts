import fs from 'node:fs';
import path from 'node:path';

describe('private Proof Desk route', () => {
  const routeRoot = path.resolve(__dirname, '..');
  const client = fs.readFileSync(path.join(routeRoot, 'ProofDeskClient.tsx'), 'utf8');
  const layout = fs.readFileSync(path.resolve(routeRoot, '..', 'layout.tsx'), 'utf8');

  it('uses both proof reads and sends bounded versioned commands', () => {
    expect(client).toContain('api.getProofDesk');
    expect(client).toContain('api.getProofCase');
    expect(client).toContain('api.sendProofCommand');
    expect(client).toContain('expectedVersion');
    expect(client).toContain('idempotencyKey');
  });

  it('routes checkout through governed billing and refreshes the proof version after success', () => {
    expect(client).toContain('api.createProofCheckout');
    expect(client).toContain('checkoutRetryRef');
    expect(client).toContain('await loadCase(receiptId)');
    expect(client).toContain('Open checkout');
    expect(client).toContain('Copy link');
    expect(client).not.toContain("onCommand('GENERATE_PAYMENT_LINK'");
  });

  it('requires authenticated platform-operator authority before rendering', () => {
    expect(layout).toContain('isAuthenticated');
    expect(layout).toContain('hasWorldAuthority(scopes)');
    expect(layout).toContain('configured platform operator');
  });

  it('keeps billing and claims truth explicit in operator language', () => {
    expect(client).toContain('Proof Desk cannot mark payment');
    expect(client).toContain('Do not begin delivery or represent this case as paid');
    expect(client).toContain('Choose verified only when the source and evidence reference support the observation');
  });
});
