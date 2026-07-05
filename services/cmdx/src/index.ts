import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  ERROR_CODES,
  verifyToken,
} from '@nova/shared';
import type { JWTPayload } from '@nova/shared';
import { CommandRequestSchema, type ExecutionStatus } from '@nova/agent-contracts';
import { evaluateCommand } from './policy';
import { buildSandboxEnv } from './env';
import { isKillSwitchEnabled } from './killswitch';
import { DEFAULT_PROTECTED_PATHS } from './denylist';
import {
  loadCommandRules,
  loadPersonaGrant,
  loadTaskMode,
  getCommandRequest,
  listCommandRequests,
  RateTracker,
} from './store';
import { recordCommandDecision, recordApprovalRequest } from './audit';

// ============================================================================
// CmdX — the Forge command-execution broker (port 3017).
//
// Phase 0 scope (deliberate): evaluate + audit + approve pipeline is REAL;
// execution is NOT implemented. Allowed commands are recorded as DEFERRED.
// The sandbox driver (Docker) arrives in Phase 2 behind this same API, so
// nothing upstream changes when execution turns on.
// ============================================================================

const app = express();
const logger = createLogger('cmdx-service');
const PORT = process.env.PORT || SERVICE_PORTS.CMDX;

const EXECUTION_ENABLED = process.env.CMDX_EXECUTION_ENABLED === 'true'; // Phase 2+
const REQUIRE_AUTH = process.env.CMDX_REQUIRE_AUTH !== 'false';

const rateTracker = new RateTracker();

const LIMITS = {
  maxCommandsPerRun: Number(process.env.CMDX_MAX_COMMANDS_PER_RUN || 200),
  maxCommandsPerMinute: Number(process.env.CMDX_MAX_COMMANDS_PER_MINUTE || 20),
  circuitBreakerThreshold: Number(process.env.CMDX_CIRCUIT_BREAKER_THRESHOLD || 5),
};

app.use(express.json({ limit: '256kb' }));
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

function extractAuth(req: Request): JWTPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.substring(7));
}

function requireAuth(req: Request, res: Response): boolean {
  if (!REQUIRE_AUTH) return true;
  const auth = extractAuth(req);
  if (!auth) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
    });
    return false;
  }
  return true;
}

// ============================================
// Health
// ============================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const killSwitch = await isKillSwitchEnabled();
    const { source } = await loadCommandRules();
    res.json({
      status: 'healthy',
      service: 'cmdx',
      killSwitch,
      executionEnabled: EXECUTION_ENABLED,
      rulesSource: source,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'unhealthy',
      service: 'cmdx',
      error: 'health check failed',
    });
  }
});

// ============================================
// Command requests
// ============================================

// POST /v1/cmdx/requests — evaluate (and in later phases, execute) a command.
app.post('/v1/cmdx/requests', async (req: Request, res: Response) => {
  try {
    if (!requireAuth(req, res)) return;

    const parsed = CommandRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: 'CommandRequest failed schema validation',
          issues: parsed.error.issues,
        },
      });
    }
    const request = parsed.data;

    const [killSwitchEnabled, { rules }, persona, mode] = await Promise.all([
      isKillSwitchEnabled(),
      loadCommandRules(),
      loadPersonaGrant(request.personaSlug),
      loadTaskMode(request.taskId),
    ]);

    const rateKey = request.subtaskId || `${request.personaSlug}:${request.workspaceId ?? 'global'}`;
    const usage = rateTracker.usage(rateKey);

    const evaluation = evaluateCommand({
      request,
      mode,
      killSwitchEnabled,
      rules,
      protectedPaths: DEFAULT_PROTECTED_PATHS,
      personaMaxAutoTier: persona.enabled ? persona.maxAutoTier : 'T0',
      rateLimit: {
        commandsThisRun: usage.commandsThisRun,
        maxCommandsPerRun: LIMITS.maxCommandsPerRun,
        commandsThisMinute: usage.commandsThisMinute,
        maxCommandsPerMinute: LIMITS.maxCommandsPerMinute,
        consecutiveFailures: usage.consecutiveFailures,
        circuitBreakerThreshold: LIMITS.circuitBreakerThreshold,
      },
    });

    rateTracker.recordDecision(rateKey);

    // Env sanitation: strip everything not on the allowlist, record violations.
    const { violations } = buildSandboxEnv(request.envRefs);

    const executionStatus: ExecutionStatus =
      evaluation.decision === 'ALLOW'
        ? EXECUTION_ENABLED
          ? 'DEFERRED' // queued for the sandbox driver (Phase 2)
          : 'DEFERRED' // execution disabled in Phase 0 — recorded honestly
        : 'NOT_EXECUTED';

    const persisted = await recordCommandDecision(request, evaluation, violations, executionStatus);

    if (evaluation.decision === 'NEEDS_APPROVAL' && persisted) {
      await recordApprovalRequest(persisted.id, request, evaluation);
    }

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        id: persisted?.id ?? null,
        decision: evaluation.decision,
        resolvedTier: evaluation.resolvedTier,
        ruleId: evaluation.ruleId,
        reasons: evaluation.reasons,
        envViolations: violations,
        execution: {
          status: executionStatus,
          note: EXECUTION_ENABLED
            ? 'execution driver not yet wired (Phase 2)'
            : 'CMDX_EXECUTION_ENABLED=false (Phase 0: evaluate + audit only)',
        },
      },
    });
  } catch (error) {
    logger.error('failed to process command request', error as Error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'internal error' },
    });
  }
});

// GET /v1/cmdx/requests — recent decisions (audit view).
app.get('/v1/cmdx/requests', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const limit = Number(req.query.limit || 50);
  const rows = await listCommandRequests(limit);
  res.json({ success: true, data: rows });
});

// GET /v1/cmdx/requests/:id
app.get('/v1/cmdx/requests/:id', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const row = await getCommandRequest(req.params.id);
  if (!row) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'not found' },
    });
  }
  return res.json({ success: true, data: row });
});

// GET /v1/cmdx/rules — active allowlist (transparency for the Forge console).
app.get('/v1/cmdx/rules', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { rules, source } = await loadCommandRules();
  res.json({ success: true, data: { source, rules } });
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`CmdX broker listening on port ${PORT}`, {
      executionEnabled: EXECUTION_ENABLED,
      requireAuth: REQUIRE_AUTH,
    });
  });
}

export default app;
