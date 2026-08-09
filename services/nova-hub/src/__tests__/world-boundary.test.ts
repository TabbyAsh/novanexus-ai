import fs from 'node:fs';
import path from 'node:path';

describe('World ownership boundary', () => {
  const hubSource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
  const forgeSource = fs.readFileSync(path.resolve(__dirname, '..', 'forge.ts'), 'utf8');
  const agentsRoute = hubSource.slice(
    hubSource.indexOf("app.get('/v1/world/agents'"),
    hubSource.indexOf('// THE SMITH'),
  );
  const hailRoute = hubSource.slice(
    hubSource.indexOf("app.post('/v1/world/hail'"),
    hubSource.indexOf('// ── GET /v1/admin/users'),
  );

  it('does not treat a caller-supplied visitor ID as watcher ownership', () => {
    expect(agentsRoute).toContain('authMiddleware');
    expect(agentsRoute).toContain('status(410)');
    expect(agentsRoute).not.toContain('req.query.visitor');
    expect(agentsRoute).not.toContain('listAgents');
  });

  it('refuses watcher creation without claiming an external effect', () => {
    expect(hailRoute).toContain('WORLD_WATCHERS_RESERVED');
    expect(hailRoute).toContain('externalSideEffectsPerformed: false');
    expect(hailRoute).toContain('No watcher was created');
    expect(hailRoute).not.toContain('forgeAgent(');
  });

  it('stops ticking legacy anonymous watcher rows', () => {
    expect(forgeSource).toContain('AND user_id IS NOT NULL');
  });
});
