jest.mock('../substrate', () => ({ writeArtifact: jest.fn() }));

import { codexSpecialistAvailable, runCodexSpecialist } from '../codex-specialist';

describe('Codex specialist authority boundary', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = { ...original, CODEX_SPECIALIST_ENABLED: 'false' };
  });
  afterAll(() => { process.env = original; });

  it('is reserved unless every explicit runtime gate exists', () => {
    expect(codexSpecialistAvailable()).toBe(false);
  });

  it('fails closed without invoking an agent and reports immutable authority', async () => {
    await expect(runCodexSpecialist({ objective: 'Inspect the stack', mode: 'analyze' })).resolves.toEqual(expect.objectContaining({
      available: false,
      authority: {
        sandbox: 'read-only',
        networkAccess: false,
        approvalPolicy: 'never',
        filesChanged: false,
        activationPerformed: false,
      },
    }));
  });
});
