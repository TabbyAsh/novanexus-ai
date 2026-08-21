import {
  MISSION_AUTHORITY_LEVELS,
  REVENUE_RECOVERY_PROOF_TEMPLATE,
  appendMissionEvent,
  claimMissionActionForDispatch,
  evaluateMissionActionTransition,
  evaluateMissionTransition,
  missionHash,
  normalizeMissionCloseout,
  preflightMissionAction,
  prepareMissionAction,
  validateMissionMandate,
  validateOpportunityCard,
  verifyMissionEventChain,
  type MissionActionApproval,
  type MissionActionRegistry,
  type MissionActionRequest,
  type MissionKillSwitchAssertion,
  type MissionMandate,
  type MissionMandateUsage,
  type MissionSnapshot,
} from '..';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const MISSION_ID = '00000000-0000-4000-8000-000000000002';
const OPPORTUNITY_ID = '00000000-0000-4000-8000-000000000003';
const MANDATE_ID = '00000000-0000-4000-8000-000000000004';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000005';
const ACTION_ID = '00000000-0000-4000-8000-000000000006';
const CLOSEOUT_ID = '00000000-0000-4000-8000-000000000007';
const EVENT_ONE_ID = '00000000-0000-4000-8000-000000000008';
const EVENT_TWO_ID = '00000000-0000-4000-8000-000000000009';
const NOW = '2026-08-22T12:00:00.000Z';

const actionRegistry: MissionActionRegistry = Object.freeze({
  read_case: Object.freeze({
    actionType: 'read_case', capabilityId: 'outcome_accounting', effect: 'READ_ONLY', minimumAuthority: 'OBSERVE',
  }),
  create_private_asset: Object.freeze({
    actionType: 'create_private_asset', capabilityId: 'communication_drafting', effect: 'PRIVATE_ARTIFACT', minimumAuthority: 'CREATE',
  }),
  draft_followup: Object.freeze({
    actionType: 'draft_followup', capabilityId: 'communication_drafting', effect: 'STAGED_EXTERNAL_ACTION', minimumAuthority: 'PREPARE',
  }),
  customer_followup_send: Object.freeze({
    actionType: 'customer_followup_send', capabilityId: 'communication_drafting', effect: 'EXTERNAL_COMMUNICATION', minimumAuthority: 'ACT_ONCE',
  }),
  destructive_cleanup: Object.freeze({
    actionType: 'destructive_cleanup', capabilityId: 'communication_drafting', effect: 'DESTRUCTIVE_EXTERNAL', minimumAuthority: 'ACT_ONCE',
  }),
});

const mission = (overrides: Partial<MissionSnapshot> = {}): MissionSnapshot => ({
  id: MISSION_ID,
  orgId: ORG_ID,
  opportunityCardId: OPPORTUNITY_ID,
  state: 'RUNNING',
  version: 3,
  capabilityIds: ['communication_drafting', 'outcome_accounting'],
  openActionCount: 0,
  closeoutHash: null,
  ...overrides,
});

const mandate = (overrides: Partial<MissionMandate> = {}): MissionMandate => ({
  id: MANDATE_ID,
  missionId: MISSION_ID,
  orgId: ORG_ID,
  purpose: 'Prepare a bounded follow-up proof for owner-provided records.',
  authority: 'PREPARE',
  allowedCapabilityIds: ['communication_drafting'],
  allowedActionTypes: ['draft_followup'],
  allowedExternalActionTypes: [],
  allowedExternalTargetRefs: [],
  approvedActionHash: null,
  maxActions: 20,
  maxExternalActions: 0,
  maxSpendCents: 0,
  currency: 'USD',
  issuedBy: 'human-owner-001',
  issuedAt: '2026-08-21T12:00:00Z',
  notBefore: '2026-08-21T12:00:00Z',
  expiresAt: '2026-08-23T12:00:00Z',
  ...overrides,
});

const usage = (overrides: Partial<MissionMandateUsage> = {}): MissionMandateUsage => ({
  totalActions: 0,
  externalActions: 0,
  spendCents: 0,
  actOnceDispatches: 0,
  revokedAt: null,
  revocationRef: null,
  ...overrides,
});

const action = (overrides: Partial<MissionActionRequest> = {}): MissionActionRequest => ({
  actionType: 'draft_followup',
  capabilityId: 'communication_drafting',
  targetRef: 'client-channel/contact-001',
  expectedSpendCents: 0,
  currency: 'USD',
  idempotencyKey: 'mission.action.00000001',
  approvalId: null,
  payload: { subject: 'A quick follow-up', body: 'Would you like to revisit the estimate?' },
  ...overrides,
});

const externalAction = (overrides: Partial<MissionActionRequest> = {}): MissionActionRequest => action({
  actionType: 'customer_followup_send',
  idempotencyKey: 'mission.external.000001',
  approvalId: APPROVAL_ID,
  payload: { channel: 'email', subject: 'Estimate follow-up', body: 'Would you like to move forward?' },
  ...overrides,
});

function prepared(request: MissionActionRequest = externalAction()) {
  const result = prepareMissionAction(request, actionRegistry);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

const externalMandate = (authority: 'ACT_ONCE' | 'OPERATE' = 'ACT_ONCE', request = externalAction()): MissionMandate => mandate({
  authority,
  purpose: 'Send approved follow-up messages to exact, owner-authorized targets.',
  allowedActionTypes: ['draft_followup', request.actionType],
  allowedExternalActionTypes: [request.actionType],
  allowedExternalTargetRefs: ['client-channel/contact-001'],
  approvedActionHash: authority === 'ACT_ONCE' ? prepared(request).actionEnvelopeHash : null,
  maxExternalActions: authority === 'ACT_ONCE' ? 1 : 3,
  maxSpendCents: 500,
  expiresAt: authority === 'OPERATE' ? '2026-08-25T12:00:00Z' : '2026-08-30T12:00:00Z',
});

const killSwitch = (overrides: Partial<MissionKillSwitchAssertion> = {}): MissionKillSwitchAssertion => ({
  missionId: MISSION_ID,
  orgId: ORG_ID,
  state: 'DISABLED',
  version: 2,
  observedAt: NOW,
  ...overrides,
});

const approval = (
  request: MissionActionRequest = externalAction(),
  overrides: Partial<MissionActionApproval> = {},
): MissionActionApproval => ({
  id: APPROVAL_ID,
  missionId: MISSION_ID,
  orgId: ORG_ID,
  mandateId: MANDATE_ID,
  actionEnvelopeHash: prepared(request).actionEnvelopeHash,
  approvedByActorType: 'HUMAN',
  approvedByActorId: 'human-owner-001',
  approvedAt: '2026-08-22T11:59:30Z',
  expiresAt: '2026-08-22T12:30:00Z',
  consumedAt: null,
  ...overrides,
});

function externalPreflight(request: MissionActionRequest = externalAction()) {
  return {
    mission: mission(),
    mandate: externalMandate('ACT_ONCE', request),
    usage: usage(),
    action: request,
    trustedActionRegistry: actionRegistry,
    verifiedApproval: approval(request),
    availableCapabilityIds: ['communication_drafting'],
    killSwitch: killSwitch(),
    now: NOW,
  };
}

describe('Mission Core experimental authority kernel', () => {
  it('defines exactly five ordered authority levels', () => {
    expect(MISSION_AUTHORITY_LEVELS).toEqual(['OBSERVE', 'CREATE', 'PREPARE', 'ACT_ONCE', 'OPERATE']);
  });

  it('requires persistence-compatible UUIDs and hashes opportunity cards deterministically', () => {
    const card = {
      id: OPPORTUNITY_ID,
      orgId: ORG_ID,
      status: 'VALIDATED',
      title: 'Recover unclosed estimates',
      buyer: 'Owner-led service firm with existing quoted demand',
      painfulJob: 'Quoted opportunities disappear because follow-up is inconsistent.',
      proposedValue: 'Prepare a bounded recovery workflow and record what actually settles.',
      evidence: [{
        ref: 'client-export/estimates-2026-08', contentHash: 'a'.repeat(64), source: 'OWNER_PROVIDED',
        observedAt: '2026-08-21T12:00:00Z', confidence: 1, summary: 'Owner-provided export contains open estimates.',
      }],
      assumptions: ['At least 25 records remain eligible for lawful follow-up.'],
      risks: ['The owner may not have permission to use every record.'],
      requiredCapabilityIds: ['communication_drafting'],
      minimumAuthority: 'PREPARE',
      nextTest: 'Validate eligibility and prepare a ten-day proof with no autonomous send.',
      estimate: {
        classification: 'ESTIMATE', currency: 'USD', estimatedRevenueCents: 150000, estimatedCostCents: 15000,
        confidence: 0.4, basis: 'A bounded planning estimate based on the owner-provided quote export.',
      },
      createdAt: '2026-08-21T12:00:00Z', expiresAt: '2026-09-21T12:00:00Z',
    };
    const valid = validateOpportunityCard(card);
    expect(valid).toMatchObject({ ok: true });
    expect(valid.ok && valid.value.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(validateOpportunityCard({ ...card, id: 'opportunity-001' })).toMatchObject({ ok: false, errors: { id: expect.any(String) } });
    expect(validateOpportunityCard({ ...card, estimate: { ...card.estimate, classification: 'REALIZED' } })).toMatchObject({
      ok: false, errors: { 'estimate.classification': expect.any(String) },
    });
  });

  it('requires bounded mandates and exact external allowlists', () => {
    expect(validateMissionMandate(mandate())).toMatchObject({ ok: true });
    expect(validateMissionMandate(externalMandate('OPERATE'))).toMatchObject({ ok: true });
    expect(validateMissionMandate({ ...mandate(), id: 'mandate-001' })).toMatchObject({ ok: false, errors: { id: expect.any(String) } });
    expect(validateMissionMandate({ ...externalMandate('OPERATE'), expiresAt: '2026-08-30T12:00:01Z' }))
      .toMatchObject({ ok: false, errors: { expiresAt: expect.any(String) } });
    expect(validateMissionMandate({ ...externalMandate(), allowedExternalTargetRefs: ['*'] }))
      .toMatchObject({ ok: false, errors: { externalAllowlist: expect.any(String) } });
    expect(validateMissionMandate({ ...mandate(), maxActions: 2_147_483_648 }))
      .toMatchObject({ ok: false, errors: { maxActions: expect.any(String) } });
  });

  it('derives effect from the trusted registry and rejects a caller downgrade', () => {
    const forged = { ...externalAction({ approvalId: null }), effect: 'READ_ONLY' } as unknown as MissionActionRequest;
    expect(prepareMissionAction(forged, actionRegistry)).toMatchObject({
      ok: true, value: { effect: 'EXTERNAL_COMMUNICATION', minimumAuthority: 'ACT_ONCE' },
    });
    expect(preflightMissionAction({
      mission: mission(), mandate: mandate({ allowedActionTypes: ['customer_followup_send'] }), usage: usage(), action: forged,
      trustedActionRegistry: actionRegistry, verifiedApproval: null,
      availableCapabilityIds: ['communication_drafting'], killSwitch: killSwitch(), now: NOW,
    })).toMatchObject({ ok: false, code: 'AUTHORITY_INSUFFICIENT' });
  });

  it('binds the canonical executable payload into the approved action envelope', () => {
    const original = externalAction();
    const reordered = externalAction({
      payload: { body: 'Would you like to move forward?', subject: 'Estimate follow-up', channel: 'email' },
    });
    const substituted = externalAction({ payload: { channel: 'email', subject: 'Changed', body: 'Send funds elsewhere.' } });
    expect(prepared(original).payloadHash).toBe(prepared(reordered).payloadHash);
    expect(prepared(original).actionEnvelopeHash).toBe(prepared(reordered).actionEnvelopeHash);
    expect(prepared(original).payloadHash).not.toBe(prepared(substituted).payloadHash);
    expect(prepared(original).actionEnvelopeHash).not.toBe(prepared(substituted).actionEnvelopeHash);
    expect(preflightMissionAction({
      ...externalPreflight(substituted), mandate: externalMandate('ACT_ONCE', original), verifiedApproval: approval(original),
    })).toMatchObject({ ok: false, code: 'ACTION_APPROVAL_REQUIRED' });
  });

  it('allows bounded preparation but requires the policy authority floor', () => {
    expect(preflightMissionAction({
      mission: mission(), mandate: mandate(), usage: usage(), action: action(),
      trustedActionRegistry: actionRegistry, verifiedApproval: null,
      availableCapabilityIds: ['communication_drafting'], killSwitch: null, now: NOW,
    })).toMatchObject({ ok: true, requiredAuthority: 'PREPARE' });
    expect(preflightMissionAction({
      mission: mission(), mandate: mandate({ authority: 'CREATE' }), usage: usage(), action: action(),
      trustedActionRegistry: actionRegistry, verifiedApproval: null,
      availableCapabilityIds: ['communication_drafting'], killSwitch: null, now: NOW,
    })).toMatchObject({ ok: false, code: 'AUTHORITY_INSUFFICIENT' });
  });

  it('fails ACT_ONCE closed unless live kill switch, target, envelope, and human approval are exact', () => {
    const base = externalPreflight();
    expect(preflightMissionAction({ ...base, killSwitch: null })).toMatchObject({ ok: false, code: 'EXTERNAL_KILL_SWITCH_CLOSED' });
    expect(preflightMissionAction({ ...base, killSwitch: killSwitch({ state: 'ENABLED' }) }))
      .toMatchObject({ ok: false, code: 'EXTERNAL_KILL_SWITCH_CLOSED' });
    expect(preflightMissionAction({ ...base, killSwitch: killSwitch({ observedAt: '2026-08-22T11:00:00Z' }) }))
      .toMatchObject({ ok: false, code: 'EXTERNAL_KILL_SWITCH_CLOSED' });
    expect(preflightMissionAction({ ...base, verifiedApproval: null })).toMatchObject({ ok: false, code: 'ACTION_APPROVAL_REQUIRED' });
    expect(preflightMissionAction({ ...base, verifiedApproval: approval(externalAction(), { consumedAt: '2026-08-22T11:59:50Z' }) }))
      .toMatchObject({ ok: false, code: 'ACTION_APPROVAL_REQUIRED' });
    expect(preflightMissionAction({ ...base, action: externalAction({ targetRef: 'someone-else' }) }))
      .toMatchObject({ ok: false, code: 'EXTERNAL_TARGET_NOT_ALLOWLISTED' });
    expect(preflightMissionAction(base)).toMatchObject({ ok: true, decision: 'ALLOW', remainingExternalActionsAfter: 0 });
  });

  it('requires envelope-bound human approval for destructive OPERATE actions', () => {
    const destructive = externalAction({ actionType: 'destructive_cleanup', idempotencyKey: 'mission.destructive.0001' });
    const base = {
      mission: mission(), mandate: externalMandate('OPERATE', destructive), usage: usage(), action: destructive,
      trustedActionRegistry: actionRegistry, availableCapabilityIds: ['communication_drafting'], killSwitch: killSwitch(), now: NOW,
    };
    expect(preflightMissionAction({ ...base, verifiedApproval: null })).toMatchObject({ ok: false, code: 'DESTRUCTIVE_APPROVAL_REQUIRED' });
    expect(preflightMissionAction({ ...base, verifiedApproval: approval(destructive) })).toMatchObject({ ok: true });
  });

  it('revalidates all live authority and single-use state at dispatch claim time', () => {
    const base = externalPreflight();
    const decision = preflightMissionAction(base);
    expect(decision).toMatchObject({ ok: true });
    if (!decision.ok) throw new Error(decision.message);
    const dispatch = {
      ...base,
      usage: usage({ totalActions: 1, externalActions: 1 }),
      record: {
        id: ACTION_ID, status: 'APPROVED' as const, preflightDecision: 'ALLOW' as const,
        mandateHash: decision.mandateHash, actionEnvelopeHash: decision.preparedAction.actionEnvelopeHash,
        idempotencyKey: decision.preparedAction.idempotencyKey,
      },
    };
    expect(claimMissionActionForDispatch(dispatch)).toMatchObject({
      ok: true, decision: 'ALLOW_DISPATCH', dispatchClaimHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(claimMissionActionForDispatch({ ...dispatch, mission: mission({ state: 'PAUSED' }) }))
      .toMatchObject({ ok: false, code: 'MISSION_NOT_RUNNING' });
    expect(claimMissionActionForDispatch({ ...dispatch, usage: usage({ totalActions: 1, externalActions: 1, revokedAt: NOW }) }))
      .toMatchObject({ ok: false, code: 'MANDATE_REVOKED' });
    expect(claimMissionActionForDispatch({ ...dispatch, now: '2026-09-01T12:00:00Z', killSwitch: killSwitch({ observedAt: '2026-09-01T12:00:00Z' }) }))
      .toMatchObject({ ok: false, code: 'MANDATE_INACTIVE' });
    expect(claimMissionActionForDispatch({ ...dispatch, killSwitch: killSwitch({ state: 'ENABLED' }) }))
      .toMatchObject({ ok: false, code: 'EXTERNAL_KILL_SWITCH_CLOSED' });
    expect(claimMissionActionForDispatch({ ...dispatch, usage: usage({ totalActions: 1, externalActions: 1, actOnceDispatches: 1 }) }))
      .toMatchObject({ ok: false, code: 'ACT_ONCE_ALREADY_USED' });
    expect(claimMissionActionForDispatch({ ...dispatch, record: { ...dispatch.record, status: 'RUNNING' } }))
      .toMatchObject({ ok: false, code: 'ACTION_NOT_DISPATCHABLE' });
  });

  it('enforces a forward-only action graph and evidence-gated success', () => {
    expect(evaluateMissionActionTransition('REQUESTED', 'APPROVED')).toEqual({ ok: true });
    expect(evaluateMissionActionTransition('APPROVED', 'RUNNING')).toEqual({ ok: true });
    expect(evaluateMissionActionTransition('RUNNING', 'REQUESTED')).toMatchObject({ ok: false, code: 'INVALID_ACTION_TRANSITION' });
    expect(evaluateMissionActionTransition('RUNNING', 'SUCCEEDED')).toMatchObject({ ok: false, code: 'ACTION_EVIDENCE_REQUIRED' });
    expect(evaluateMissionActionTransition('RUNNING', 'SUCCEEDED', ['receipt/action-001'])).toEqual({ ok: true });
    expect(evaluateMissionActionTransition('SUCCEEDED', 'RUNNING')).toMatchObject({ ok: false });
  });

  it('requires truthful terminal closeout and settled economics', () => {
    const closeout = {
      id: CLOSEOUT_ID, missionId: MISSION_ID, orgId: ORG_ID,
      outcome: {
        disposition: 'SUCCEEDED', verification: 'VERIFIED',
        summary: 'One previously unclosed estimate became completed and paid work.',
        observedAt: '2026-08-31T16:00:00Z', evidenceRefs: ['client-ledger/outcome-001'], unverifiedReason: null,
      },
      economics: {
        verification: 'VERIFIED', currency: 'USD', collectedRevenueCents: 100000, refundsCents: 0,
        directCostCents: 20000, externalSpendCents: 0, laborMinutes: 240,
        sourceRefs: ['client-ledger/economics-001'], settledRevenueEvidenceRef: 'payment-receipt/001',
      },
      learning: 'Prioritize recent estimates and escalate replies to the owner within one business hour.',
      closedBy: 'human-owner-001', closedAt: '2026-08-31T17:00:00Z',
    };
    expect(normalizeMissionCloseout(mission({ state: 'CLOSING' }), closeout)).toMatchObject({
      ok: true, value: { realizedNetCents: 80000, closeoutHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(normalizeMissionCloseout(mission({ state: 'RUNNING' }), closeout)).toMatchObject({ ok: false, errors: { state: expect.any(String) } });
    expect(normalizeMissionCloseout(mission({ state: 'CLOSING', openActionCount: 1 }), closeout))
      .toMatchObject({ ok: false, errors: { openActionCount: expect.any(String) } });
    expect(normalizeMissionCloseout(mission({ state: 'CLOSING' }), {
      ...closeout, economics: { ...closeout.economics, settledRevenueEvidenceRef: null },
    })).toMatchObject({ ok: false, errors: { 'economics.settledRevenueEvidenceRef': expect.any(String) } });
  });

  it('builds a normalized, duplicate-resistant tamper-evident event chain', () => {
    const first = appendMissionEvent([], {
      id: EVENT_ONE_ID, missionId: MISSION_ID, orgId: ORG_ID, eventType: 'MISSION_STARTED', actorType: 'HUMAN',
      actorId: 'human-owner-001', occurredAt: '2026-08-21T12:00:00Z', idempotencyKey: 'mission.event.000001', payload: { state: 'RUNNING' },
    });
    const second = appendMissionEvent([first], {
      id: EVENT_TWO_ID, missionId: MISSION_ID, orgId: ORG_ID, eventType: 'DRAFT_PREPARED', actorType: 'AGENT',
      actorId: 'nova-agent-001', occurredAt: '2026-08-21T12:05:00Z', idempotencyKey: 'mission.event.000002', payload: { records: 25 },
    });
    expect(verifyMissionEventChain([first, second])).toEqual({ ok: true, errors: [] });
    expect(() => appendMissionEvent([first], {
      id: EVENT_TWO_ID, missionId: MISSION_ID, orgId: ORG_ID, eventType: 'DUPLICATE', actorType: 'SYSTEM',
      actorId: 'mission-core', occurredAt: '2026-08-21T12:10:00Z', idempotencyKey: ' mission.event.000001 ', payload: {},
    })).toThrow('Duplicate mission event idempotency key');
    expect(verifyMissionEventChain([first, { ...second, id: first.id, eventHash: second.eventHash }])).toMatchObject({ ok: false });
    expect(verifyMissionEventChain([first, { ...second, payload: { records: 250 } }])).toMatchObject({ ok: false });
    expect(missionHash({ b: 2, a: 1 })).toBe(missionHash({ a: 1, b: 2 }));
  });

  it('makes closeout terminal and keeps the proof template non-autonomous', () => {
    expect(evaluateMissionTransition('CLOSING', 'CLOSED')).toEqual({ ok: true });
    expect(evaluateMissionTransition('CLOSED', 'RUNNING')).toMatchObject({ ok: false, code: 'MISSION_TERMINAL' });
    expect(REVENUE_RECOVERY_PROOF_TEMPLATE.defaultAuthority).toBe('PREPARE');
    expect(REVENUE_RECOVERY_PROOF_TEMPLATE.scope).toMatchObject({
      maximumRecords: 100, autonomousSendByDefault: false, revenueGuarantee: false,
    });
  });
});
