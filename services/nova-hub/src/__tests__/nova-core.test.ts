jest.mock('@nova/shared', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.mock('@nova/telemetry', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../ai-router', () => ({
  generateCard: jest.fn(),
  generateChat: jest.fn(),
}));

jest.mock('../flip-card', () => ({
  computeFlipCard: jest.fn(),
}));

import { query, queryOne } from '@nova/shared';
import { generateCard, generateChat } from '../ai-router';
import { novaChat, requestsComposition } from '../nova-core';

const queryMock = query as jest.Mock;
const queryOneMock = queryOne as jest.Mock;
const generateCardMock = generateCard as jest.Mock;
const generateChatMock = generateChat as jest.Mock;

describe('Nova capability interface behind Nexus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    generateCardMock.mockResolvedValue({ content: 'Start with the smallest real test.', provider: 'deterministic', free: true });
    generateChatMock.mockResolvedValue({ content: 'Your pipeline has one follow-up due.', provider: 'test-provider' });
  });

  it('refuses to load or append to a conversation the caller does not own', async () => {
    queryOneMock.mockResolvedValueOnce(null);

    await expect(novaChat('user-other', 'conversation-private', 'Hello'))
      .rejects.toThrow('Conversation not found.');

    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      ['conversation-private', 'user-other'],
    );
    expect(queryMock.mock.calls.some(call => String(call[0]).includes('SELECT role, content'))).toBe(false);
  });

  it('labels ordinary model reasoning as reasoning, not tool execution', async () => {
    queryOneMock.mockResolvedValueOnce({ id: 'conversation-owned' });

    const result = await novaChat('user-1', 'conversation-owned', 'Help me think clearly about my week');

    expect(result).toMatchObject({
      conversationId: 'conversation-owned',
      reply: 'Start with the smallest real test.',
      provider: 'deterministic',
      action: null,
      execution: {
        mode: 'reasoning', capabilities: [], evidence: [], gaps: [],
        cost: { aiCalls: 0, toolCalls: 0 },
      },
    });
  });

  it('recognizes intentions that benefit from capability composition', () => {
    expect(requestsComposition('Compare live trends and flip opportunities, then build me a plan')).toBe(true);
    expect(requestsComposition('What is the price of TSLA?')).toBe(false);
  });

  it('keeps customer names out of external business-summary prompts', async () => {
    queryOneMock.mockResolvedValueOnce({ id: 'conversation-owned' });
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM business_jobs')) {
        return {
          rows: [{
            status: 'LEAD', quoted_price: 500, final_price: null,
            follow_up_due: '2020-01-01', contact_name: 'Jane Private',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await novaChat('user-1', 'conversation-owned', 'How is my business pipeline?');

    const prompt = generateChatMock.mock.calls[0][0].user;
    expect(prompt).toContain('Follow-ups due today: 1');
    expect(prompt).not.toContain('Jane Private');
    expect(queryMock.mock.calls.find(call => String(call[0]).includes('FROM business_jobs'))?.[0])
      .not.toContain('contact_name');
  });
});
