import { MetaGovernance } from '../meta-governance';

describe('MetaGovernance', () => {
  test('ratifies a rollback proposal after required signatures', () => {
    const gov = new MetaGovernance();

    const proposal = gov.submitProposal(
      'rollback',
      'Rollback test',
      'Test rollback flow',
      'Testing governance',
      'tester',
      [
        {
          id: 'e1',
          type: 'audit_result',
          source: 'unit-test',
          data: { ok: true },
          confidence: 1,
          timestamp: Date.now(),
          verified: true,
        },
      ]
    );

    const sys = gov.signProposal(proposal.id, 'sys-1', 'system', 'approver');
    expect(sys.success).toBe(true);
    expect(proposal.status).toBe('voting');

    const human = gov.signProposal(proposal.id, 'human-1', 'human', 'approver');
    expect(human.success).toBe(true);
    expect(proposal.status).toBe('ratified');
    expect(proposal.ratifiedAt).toBeDefined();
  });

  test('veto rejects a proposal immediately', () => {
    const gov = new MetaGovernance();

    const proposal = gov.submitProposal(
      'rollback',
      'Rollback test',
      'Test rollback flow',
      'Testing governance',
      'tester',
      [
        {
          id: 'e1',
          type: 'audit_result',
          source: 'unit-test',
          data: { ok: true },
          confidence: 1,
          timestamp: Date.now(),
          verified: true,
        },
      ]
    );

    const veto = gov.signProposal(proposal.id, 'human-veto', 'human', 'veto');
    expect(veto.success).toBe(true);
    expect(proposal.status).toBe('rejected');
  });
});
