import { EMPTY_NOVA_LOOP, formatOperatingRecord, operatingStatus } from '../nova-loop-record';

describe('Nova operating record', () => {
  it('keeps an unevidenced action explicitly open', () => {
    const draft = {
      ...EMPTY_NOVA_LOOP,
      changed: 'A promised handoff stopped arriving on time.',
      decision: 'Decide whether to change the handoff owner.',
      unknowns: 'The failure point and current workload are unknown.',
      nextAction: 'Observe the next handoff and record each transition.',
      owner: 'Operations lead',
      boundary: 'Do not contact the customer or change commitments yet.',
      requiredEvidence: 'Timestamped handoff events and the final receipt.',
      reviewAt: 'After the next handoff',
    };

    expect(operatingStatus(draft)).toContain('OPEN');
    const record = formatOperatingRecord(draft, '2026-08-08T00:00:00.000Z');
    expect(record).toContain('its result is not yet evidenced');
    expect(record).toContain('Evidence observed: [open]');
    expect(record).not.toContain('successfully completed');
  });

  it('describes operator-recorded evidence without claiming independent proof', () => {
    const draft = {
      ...EMPTY_NOVA_LOOP,
      observedEvidence: 'Receipt stored in the client-owned folder.',
      learning: 'The approval step, not the handoff, caused the delay.',
    };

    expect(operatingStatus(draft)).toContain('recorded by the operator');
    expect(formatOperatingRecord(draft, 'now')).toContain('does not prove that an external action occurred');
  });
});
