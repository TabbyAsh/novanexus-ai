const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockClientQuery = jest.fn();
const mockRunSmithTask = jest.fn();
const mockGenerateChat = jest.fn();
const mockReadArtifacts = jest.fn();
const mockWriteArtifact = jest.fn();

jest.mock('@nova/shared', () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  transaction: (fn: any) => fn({ query: (...args: any[]) => mockClientQuery(...args) }),
}));

jest.mock('@nova/telemetry', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../ai-router', () => ({
  generateChat: (...args: any[]) => mockGenerateChat(...args),
}));

jest.mock('../smith', () => ({
  SMITH_SYSTEM: 'incumbent prompt',
  runSmithTask: (...args: any[]) => mockRunSmithTask(...args),
}));

jest.mock('../substrate', () => ({
  readArtifacts: (...args: any[]) => mockReadArtifacts(...args),
  writeArtifact: (...args: any[]) => mockWriteArtifact(...args),
}));

import { decidePromptPromotion, proposeAndGate } from '../agent-evals';

describe('human-owned prompt promotion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    mockReadArtifacts.mockResolvedValue([]);
    mockWriteArtifact.mockResolvedValue('artifact-1');
  });

  it('stages a benchmark-winning agent prompt as a candidate instead of activating it', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null) // no active DB prompt; use the code incumbent
      .mockResolvedValueOnce({ id: 'persona-1' })
      .mockResolvedValueOnce({ n: '2' })
      .mockResolvedValueOnce({ id: 'approval-1' });
    mockGenerateChat.mockResolvedValue({ content: 'candidate prompt', provider: 'test', free: true });
    mockRunSmithTask.mockImplementation(async (_problem: string, systemOverride?: string) => ({
      solved: systemOverride === 'candidate prompt', iterations: 1,
    }));

    const result = await proposeAndGate('coder-agent');

    expect(result).toMatchObject({
      promoted: false,
      passedGate: true,
      approvalId: 'approval-1',
      candidateSemver: '0.2.0',
    });
    const versionInsert = mockQuery.mock.calls.find(call => String(call[0]).includes('INSERT INTO prompt_versions'));
    expect(versionInsert).toBeDefined();
    expect(versionInsert![1][4]).toBe('candidate');
    expect(mockQuery.mock.calls.some(call => String(call[0]).includes("status = 'retired'") && String(call[0]).includes("status = 'active'"))).toBe(false);
    expect(mockQueryOne.mock.calls.some(call => String(call[0]).includes('INSERT INTO forge_approvals'))).toBe(true);
  });

  it('activates a candidate only inside an explicit human approval transaction', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'approval-1', status: 'PENDING', payload_json: { agent: 'coder-agent', semver: '0.2.0' } }] })
      .mockResolvedValueOnce({ rows: [{ id: 'persona-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'prompt-2' }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await decidePromptPromotion({
      approvalId: 'approval-1', approve: true, decidedBy: 'user-1', reason: 'Held-out behavior is materially better.',
    });

    expect(result).toEqual({ ok: true, agent: 'coder-agent', semver: '0.2.0', status: 'APPROVED' });
    expect(mockClientQuery.mock.calls.some(call => String(call[0]).includes("SET status = 'active'"))).toBe(true);
    expect(mockClientQuery.mock.calls.some(call => String(call[0]).includes('decided_by'))).toBe(true);
  });
});
