import {
  PROOF_CURRENCY,
  PROOF_DELIVERABLES,
  PROOF_PRICE_CENTS,
  evaluateProofCommand,
  normalizeAcceptedScope,
  normalizeDeliverableEvidence,
  normalizeProofOutcome,
  proofCheckoutMatchesAuthority,
  proofHash,
  type ProofSnapshot,
} from '..';

const snapshot = (overrides: Partial<ProofSnapshot> = {}): ProofSnapshot => ({
  state: 'RECEIVED',
  paymentState: 'NOT_STARTED',
  outcomeState: 'PENDING',
  version: 1,
  assignedUserId: null,
  nextAction: null,
  nextActionDueAt: null,
  activeScopeVersion: null,
  accessConfirmedAt: null,
  handoffRecordedAt: null,
  completedDeliverables: [],
  learning: null,
  ...overrides,
});

const acceptedScope = () => ({
  targetResult: 'Create one reliable path from customer intake through follow-up and payment.',
  deliverables: PROOF_DELIVERABLES.map(item => ({ code: item.code, detail: `${item.label} tailored to the accepted workflow.` })),
  exclusions: ['No customer-system automation', 'No credentials stored by Nova'],
  requiredAccess: ['Client-owned shared folder during setup'],
  deliveryTargetBusinessDays: 7,
  amountCents: PROOF_PRICE_CENTS,
  currency: PROOF_CURRENCY,
  acceptanceChannel: 'EMAIL',
  acceptanceReference: 'client-owned-email-2026-08-21',
  acceptedBy: 'Client owner',
  acceptedAt: '2026-08-21T16:00:00Z',
});

describe('Nova Proof Desk domain kernel', () => {
  it('requires all five public deliverables and a server-fixed price', () => {
    expect(normalizeAcceptedScope(acceptedScope())).toMatchObject({ ok: true });
    expect(normalizeAcceptedScope({ ...acceptedScope(), amountCents: 14900 })).toMatchObject({
      ok: false,
      errors: { amountCents: expect.any(String) },
    });
    expect(normalizeAcceptedScope({ ...acceptedScope(), deliverables: acceptedScope().deliverables.slice(0, 4) })).toMatchObject({
      ok: false,
      errors: { deliverables: expect.any(String) },
    });
  });

  it('makes accepted scope hashing deterministic', () => {
    const first = normalizeAcceptedScope(acceptedScope());
    const second = normalizeAcceptedScope({ ...acceptedScope(), exclusions: [...acceptedScope().exclusions] });
    expect(first.ok && second.ok && first.hash).toBe(second.ok ? second.hash : 'invalid');
    expect(proofHash({ b: 2, a: 1 })).toBe(proofHash({ a: 1, b: 2 }));
  });

  it('blocks checkout before scope acceptance', () => {
    expect(evaluateProofCommand(snapshot(), 'GENERATE_PAYMENT_LINK')).toMatchObject({
      ok: false, code: 'SCOPE_NOT_ACCEPTED',
    });
    expect(evaluateProofCommand(snapshot({ state: 'SCOPE_ACCEPTED', activeScopeVersion: 1 }), 'GENERATE_PAYMENT_LINK')).toEqual({ ok: true });
  });

  it('blocks work until scope, webhook payment, owner, action, due date, and access are real', () => {
    expect(evaluateProofCommand(snapshot({ state: 'SCOPE_ACCEPTED', activeScopeVersion: 1 }), 'START_WORK')).toMatchObject({
      ok: false,
      code: 'START_GATE_FAILED',
      unmet: expect.arrayContaining(['verified payment', 'assigned owner', 'next action', 'access readiness check']),
    });
    expect(evaluateProofCommand(snapshot({
      state: 'SCOPE_ACCEPTED', activeScopeVersion: 1, paymentState: 'PAID',
      assignedUserId: 'user-1', nextAction: 'Build the accepted workspace', nextActionDueAt: '2026-08-22',
    }), 'START_WORK', { accessConfirmed: true })).toEqual({ ok: true });
  });

  it('blocks delivery until exactly five evidenced deliverables are complete', () => {
    expect(evaluateProofCommand(snapshot({ state: 'IN_PROGRESS', completedDeliverables: ['WORKFLOW_MAP'] }), 'RECORD_HANDOFF'))
      .toMatchObject({ ok: false, code: 'DELIVERABLES_INCOMPLETE' });
    expect(evaluateProofCommand(snapshot({
      state: 'IN_PROGRESS', completedDeliverables: PROOF_DELIVERABLES.map(item => item.code),
    }), 'RECORD_HANDOFF')).toEqual({ ok: true });
  });

  it('requires full evidence for verified outcomes and no attributed value for unverified ones', () => {
    expect(normalizeProofOutcome({ status: 'VERIFIED', note: 'It worked.' }).ok).toBe(false);
    expect(normalizeProofOutcome({
      status: 'VERIFIED', baseline: 'Six missed follow-ups in the prior month', observation: 'Zero missed follow-ups',
      unit: 'missed follow-ups', period: '30 days after handoff', source: 'client-owned open-work tracker',
      evidenceRef: 'tracker-export-2026-09', note: 'The client reviewed the export and confirmed the observation.', valueCents: 15000,
    }).ok).toBe(true);
    expect(normalizeProofOutcome({ status: 'UNVERIFIED', reason: 'The client did not provide a baseline.', note: 'The workflow was delivered, but impact could not be measured.', valueCents: 1 }).ok).toBe(false);
  });

  it('records outcome evidence once instead of allowing silent replacement', () => {
    const normalized = normalizeProofOutcome({
      status: 'UNVERIFIED',
      reason: 'The client has not yet supplied a trustworthy baseline.',
      note: 'Delivery is evidenced, but impact cannot be attributed from the available records.',
    });
    if (normalized.ok === false) throw new Error('test outcome must normalize');
    expect(evaluateProofCommand(snapshot({ state: 'DELIVERED' }), 'RECORD_OUTCOME', { outcome: normalized.value })).toEqual({ ok: true });
    expect(evaluateProofCommand(snapshot({ state: 'DELIVERED', outcomeState: 'UNVERIFIED' }), 'RECORD_OUTCOME', { outcome: normalized.value }))
      .toMatchObject({ ok: false, code: 'OUTCOME_ALREADY_RECORDED' });
  });

  it('rejects unsafe evidence references with embedded URL secrets', () => {
    expect(normalizeDeliverableEvidence({
      code: 'WORKFLOW_MAP', label: 'Workflow map stored in client folder',
      evidenceRef: 'https://example.com/file?token=secret', evidenceHash: 'a'.repeat(64),
    }).ok).toBe(false);
    expect(normalizeDeliverableEvidence({
      code: 'WORKFLOW_MAP', label: 'Workflow map stored in client folder',
      evidenceRef: 'client-folder/workflow-map-v1', evidenceHash: 'a'.repeat(64),
    }).ok).toBe(true);
  });

  it('binds paid webhooks to receipt, exact amount, currency, case, scope, and service', () => {
    const authority = {
      receiptId: `svc_${'A'.repeat(24)}`, caseId: 'case-1', scopeHash: 'b'.repeat(64),
      amountCents: 15000, currency: 'USD', checkoutSessionId: 'cs_proof',
    };
    const session = {
      id: 'cs_proof', mode: 'payment', payment_status: 'paid', client_reference_id: authority.receiptId,
      payment_intent: 'pi_proof', amount_total: 15000, currency: 'usd',
      metadata: { proofCaseId: 'case-1', receiptId: authority.receiptId, scopeHash: authority.scopeHash, amountCents: '15000', currency: 'usd', serviceCode: 'WORKFLOW_SETUP_PILOT' },
    };
    expect(proofCheckoutMatchesAuthority(session, authority)).toMatchObject({ ok: true, paymentIntentId: 'pi_proof' });
    expect(proofCheckoutMatchesAuthority({ ...session, id: 'cs_unissued' }, authority)).toEqual({ ok: false, reason: 'issued_session' });
    expect(proofCheckoutMatchesAuthority({ ...session, amount_total: 999 }, authority)).toEqual({ ok: false, reason: 'amount' });
    expect(proofCheckoutMatchesAuthority({ ...session, metadata: { ...session.metadata, scopeHash: 'wrong' } }, authority)).toEqual({ ok: false, reason: 'metadata:scopeHash' });
  });

  it('cannot close without handoff, explicit outcome classification, and learning', () => {
    expect(evaluateProofCommand(snapshot({ state: 'DELIVERED' }), 'CLOSE_CASE', { learning: 'Too short' })).toMatchObject({
      ok: false, code: 'CLOSE_GATE_FAILED',
    });
    expect(evaluateProofCommand(snapshot({ state: 'DELIVERED', handoffRecordedAt: '2026-08-22T00:00:00Z', outcomeState: 'UNVERIFIED' }), 'CLOSE_CASE', {
      learning: 'Keep the intake form shorter and confirm ownership before beginning setup.',
    })).toEqual({ ok: true });
  });
});
