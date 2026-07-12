import { assessPotentialFrontier, RECURSIVE_IMPROVEMENT_CONTRACT } from '../potential-frontier';

describe('Nova potential frontier', () => {
  it('derives the improvement frontier from operational capability truth', () => {
    const result = assessPotentialFrontier([
      { id: 'a', name: 'A', sector: 'decision', description: 'a', status: 'available', authority: 'observe', entrypoint: null, sideEffects: [], requires: [] },
      { id: 'b', name: 'B', sector: 'forge', description: 'b', status: 'gated', authority: 'assist', entrypoint: null, sideEffects: [], requires: ['human approval'] },
    ]);
    expect(result.counts).toEqual({ available: 1, gated: 1 });
    expect(result.gaps).toEqual([expect.objectContaining({ capabilityId: 'b', requirements: ['human approval'] })]);
    expect(result.horizon).toContain('evaluation-driven recursive improvement');
  });

  it('forbids candidates from promoting themselves', () => {
    expect(RECURSIVE_IMPROVEMENT_CONTRACT.invariants).toContain('the candidate cannot promote itself');
  });
});
