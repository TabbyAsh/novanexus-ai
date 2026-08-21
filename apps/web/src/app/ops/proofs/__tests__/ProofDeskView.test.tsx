import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProofCaseDetail, ProofPulse, ProofQueueItem } from '@/lib/api';
import { ProofCaseDetailView, ProofPulseView, ProofQueueView } from '../ProofDeskView';

const pulse: ProofPulse = {
  new_inquiries: 2,
  awaiting_review: 1,
  awaiting_payment: 1,
  ready_to_start: 1,
  active_work: 3,
  awaiting_outcome: 1,
  verified_outcomes: 4,
  overdue_actions: 1,
  risk_flags: 0,
  cash_collected_cents: '30000',
};

const queue: ProofQueueItem[] = [{
  id: 'case-1',
  receipt_id: 'svc_12345678901234567890',
  service_code: 'WORKFLOW_SETUP_PILOT',
  business: 'Tuesday Service Co.',
  status: 'IN_PROGRESS',
  payment_status: 'PAID',
  version: 7,
  next_action: 'Finish the client-owned workflow map',
  next_action_due_at: '2099-08-25',
  risk_code: null,
  outcome_status: 'PENDING',
  created_at: '2026-08-20T12:00:00.000Z',
  updated_at: '2026-08-21T12:00:00.000Z',
  age_days: 1,
}];

const detail: ProofCaseDetail = {
  case: {
    ...queue[0],
    name: 'Morgan Owner',
    email: 'morgan@example.test',
    challenge: 'Quotes are prepared but follow-up is inconsistent after busy service days.',
    org_id: 'org-1',
    assigned_user_id: '8fcf291e-fb12-4317-9a31-2ac81cb6a087',
    active_scope_version: 1,
    access_confirmed_at: '2026-08-21T10:00:00.000Z',
    work_started_at: '2026-08-21T10:00:00.000Z',
    handoff_recorded_at: null,
    delivered_at: null,
    outcome_json: null,
    learning: null,
    cancel_reason: null,
    closed_at: null,
    stripe_checkout_session_id: 'cs_test_1',
    stripe_payment_intent_id: 'pi_test_1',
    paid_at: '2026-08-21T09:00:00.000Z',
    checkout_generated_at: '2026-08-21T08:00:00.000Z',
    checkout_scope_hash: 'a'.repeat(64),
  },
  scope: {
    id: 'scope-1',
    version: 1,
    target_result: 'A bounded quote follow-up workflow owned by the client.',
    deliverables_json: [],
    exclusions_json: ['No advertising spend'],
    required_access_json: ['Client test inbox'],
    delivery_target_business_days: 7,
    amount_cents: 15000,
    currency: 'USD',
    acceptance_channel: 'EMAIL',
    acceptance_reference: 'client-email-42',
    accepted_by: 'Morgan Owner',
    accepted_at: '2026-08-20T14:00:00.000Z',
    scope_hash: 'b'.repeat(64),
    created_at: '2026-08-20T14:00:00.000Z',
  },
  deliverables: [{
    code: 'WORKFLOW_MAP',
    label: 'Written workflow map and handoff points',
    status: 'COMPLETE',
    evidence_reference: 'client-folder/workflow-map-v1',
    evidence_hash: 'c'.repeat(64),
    completed_at: '2026-08-21T12:00:00.000Z',
    updated_at: '2026-08-21T12:00:00.000Z',
  }],
  timeline: [{
    sequence: 1,
    aggregate_version: 1,
    actor_type: 'USER',
    actor_id: '8fcf291e-fb12-4317-9a31-2ac81cb6a087',
    event_type: 'proof.begin_review',
    from_state: 'RECEIVED',
    to_state: 'IN_REVIEW',
    payload_json: {},
    event_hash: 'd'.repeat(64),
    occurred_at: '2026-08-20T13:00:00.000Z',
  }],
  integrity: { eventCount: 1, headHash: 'd'.repeat(64), scopeHash: 'b'.repeat(64) },
};

describe('Proof Desk presentation', () => {
  it('labels confirmed cash and operational counts without invented performance claims', () => {
    const markup = renderToStaticMarkup(<ProofPulseView pulse={pulse} asOf="2026-08-21T12:00:00.000Z" />);
    expect(markup).toContain('Evidence-backed pulse');
    expect(markup).toContain('$300.00');
    expect(markup).toContain('Confirmed payment only');
    expect(markup).toContain('Verified outcomes');
    expect(markup).not.toContain('guaranteed');
  });

  it('shows the case queue with payment, outcome, version, and next action', () => {
    const markup = renderToStaticMarkup(<ProofQueueView cases={queue} selectedReceipt={queue[0].receipt_id} onSelect={() => {}} />);
    expect(markup).toContain('Tuesday Service Co.');
    expect(markup).toContain('v7');
    expect(markup).toContain('PAID');
    expect(markup).toContain('PENDING');
    expect(markup).toContain('Finish the client-owned workflow map');
  });

  it('renders scope, delivery evidence, outcome truth, and timeline integrity together', () => {
    const markup = renderToStaticMarkup(<ProofCaseDetailView detail={detail} commandPanel={<p>Versioned command panel</p>} />);
    expect(markup).toContain('Original need');
    expect(markup).toContain('Accepted scope');
    expect(markup).toContain('Delivery evidence');
    expect(markup).toContain('client-folder/workflow-map-v1');
    expect(markup).toContain('No outcome has been presented as verified');
    expect(markup).toContain('Timeline integrity');
    expect(markup).toContain('1 recorded events');
    expect(markup).toContain('Versioned command panel');
  });
});
