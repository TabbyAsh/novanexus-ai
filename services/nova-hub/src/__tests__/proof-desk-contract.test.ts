import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Proof Desk API contract', () => {
  const source = readFileSync(resolve(__dirname, '..', 'proof-desk.ts'), 'utf8');

  it('allows only ops.admin and never trusts UI visibility as authorization', () => {
    expect(source).toContain("req.user.scopes.includes('ops.admin')");
    expect(source).toContain("res.status(403)");
  });

  it('requires optimistic concurrency and idempotency for every command', () => {
    expect(source).toContain('validExpectedVersion(expectedVersion)');
    expect(source).toContain('validIdempotencyKey(idempotencyKey)');
    expect(source).toContain('STALE_PROOF_VERSION');
    expect(source).toContain('IDEMPOTENCY_KEY_REUSED');
  });

  it('commits mutation and tamper-evident audit event in one transaction', () => {
    const commandStart = source.indexOf('async function commandTransaction');
    const commandEnd = source.indexOf('function proofMarkdown', commandStart);
    const command = source.slice(commandStart, commandEnd);
    expect(command).toContain('return transaction(async client =>');
    expect(command).toContain('await appendProofEvent(client');
    expect(source).toContain('const eventHash = proofEventHash({');
  });

  it('has no command that manually marks payment paid or refunded', () => {
    const commandStart = source.indexOf('async function commandTransaction');
    const commandEnd = source.indexOf('function proofMarkdown', commandStart);
    const command = source.slice(commandStart, commandEnd);
    expect(command).not.toContain("payment_status = 'PAID'");
    expect(command).not.toContain("payment_status = 'REFUNDED'");
    expect(command).toContain('CHECKOUT_OWNED_BY_BILLING');
  });

  it('exports only after recording an authorized audit event', () => {
    const exportStart = source.indexOf("router.get('/:receipt/export'");
    const exportRoute = source.slice(exportStart);
    expect(exportRoute).toContain("eventType: 'proof.exported'");
    expect(exportRoute).toContain('await appendProofEvent(client');
  });
});
