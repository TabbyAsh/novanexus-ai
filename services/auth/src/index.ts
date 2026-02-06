import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  ERROR_CODES,
  EVENT_TYPES,
  query,
  queryOne,
  transaction,
  generateTokenPair,
  verifyToken,
  getDefaultScopes,
  computeEventHash,
  nowTimestamp,
} from '@nova/shared';
import type { ApiResponse, User, UserRole, Scope, Policy } from '@nova/shared';

const app = express();
const logger = createLogger('auth-service');
const PORT = process.env.PORT || SERVICE_PORTS.AUTH;
const BCRYPT_ROUNDS = 12;

// Middleware
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'healthy', service: 'auth', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'unhealthy',
      service: 'auth',
      error: 'Database connection failed',
    });
  }
});

// ============================================
// Validation Helpers
// ============================================

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

// ============================================
// Event Emission Helper
// ============================================

async function emitEvent(
  orgId: string,
  actorType: 'USER' | 'BOT' | 'SYSTEM',
  actorId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const lastEvent = await queryOne<{ hash: string }>(
      'SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1',
      [orgId]
    );
    const prevHash = lastEvent?.hash || '0'.repeat(64);
    const ts = nowTimestamp();
    const hash = computeEventHash(prevHash, payload, type, ts, actorType, actorId);

    await query(
      `INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, actorType, actorId, type, ts, JSON.stringify(payload), prevHash, hash]
    );
  } catch (error) {
    logger.error('Failed to emit event', error as Error);
  }
}

// ============================================
// Auth Routes
// ============================================

async function handleRegister(req: Request, res: Response) {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const { email, password, orgName } = req.body;

    if (!email || !password) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Email and password are required' },
      });
    }

    if (!validateEmail(email)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Invalid email format' },
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: passwordValidation.message },
      });
    }

    const existingUser = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingUser) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        error: { code: ERROR_CODES.ALREADY_EXISTS, message: 'User with this email already exists' },
      });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await transaction(async (client) => {
      const userResult = await client.query<{ id: string; email: string; status: string; created_at: string }>(
        `INSERT INTO users (email, hashed_pw, status)
         VALUES ($1, $2, 'ACTIVE')
         RETURNING id, email, status, created_at`,
        [email.toLowerCase(), hashedPassword]
      );
      const user = userResult.rows[0];

      const orgResult = await client.query<{ id: string; name: string }>(
        `INSERT INTO orgs (name) VALUES ($1) RETURNING id, name`,
        [orgName || `${email.split('@')[0]}'s Organization`]
      );
      const org = orgResult.rows[0];

      await client.query(
        `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [org.id, user.id]
      );

      const defaultPolicies = [
        { role: 'OWNER', action: '*', resource: '*', effect: 'ALLOW' },
        { role: 'ADMIN', action: 'trade.*', resource: '*', effect: 'ALLOW' },
        { role: 'ADMIN', action: 'store.*', resource: '*', effect: 'ALLOW' },
        { role: 'MEMBER', action: 'trade.read', resource: '*', effect: 'ALLOW' },
        { role: 'MEMBER', action: 'trade.paper.execute', resource: '*', effect: 'ALLOW' },
        { role: 'VIEWER', action: '*.read', resource: '*', effect: 'ALLOW' },
      ];

      for (const policy of defaultPolicies) {
        await client.query(
          `INSERT INTO policies (org_id, subject_role, action, resource, effect)
           VALUES ($1, $2, $3, $4, $5)`,
          [org.id, policy.role, policy.action, policy.resource, policy.effect]
        );
      }

      return { user, org };
    });

    const role: UserRole = 'OWNER';
    const scopes = getDefaultScopes(role);
    const tokens = generateTokenPair({ userId: result.user.id, orgId: result.org.id, role, scopes });

    emitEvent(result.org.id, 'USER', result.user.id, EVENT_TYPES.USER_CREATED, {
      userId: result.user.id,
      email: result.user.email,
      orgId: result.org.id,
    });

    logger.info('User registered successfully', { userId: result.user.id, requestId });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        user: { id: result.user.id, email: result.user.email, status: result.user.status },
        org: { id: result.org.id, name: result.org.name },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (error) {
    logger.error('Registration failed', error as Error, { requestId });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Registration failed' },
    });
  }
}

// POST /v1/auth/register - Register new user
app.post('/v1/auth/register', handleRegister);

// POST /v1/auth/signup - Alias for register
app.post('/v1/auth/signup', handleRegister);

// POST /v1/auth/login - Login user
app.post('/v1/auth/login', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Email and password are required' },
      });
    }

    const user = await queryOne<{ id: string; email: string; hashed_pw: string; status: string }>(
      'SELECT id, email, hashed_pw, status FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_CREDENTIALS, message: 'Invalid email or password' },
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Account is not active' },
      });
    }

    const passwordValid = await bcrypt.compare(password, user.hashed_pw);
    if (!passwordValid) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_CREDENTIALS, message: 'Invalid email or password' },
      });
    }

    const membership = await queryOne<{ org_id: string; role: string }>(
      'SELECT org_id, role FROM org_members WHERE user_id = $1 LIMIT 1',
      [user.id]
    );

    if (!membership) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'User has no organization' },
      });
    }

    const role = membership.role as UserRole;
    const scopes = getDefaultScopes(role);
    const tokens = generateTokenPair({ userId: user.id, orgId: membership.org_id, role, scopes });

    emitEvent(membership.org_id, 'USER', user.id, EVENT_TYPES.USER_LOGIN, {
      userId: user.id,
      email: user.email,
    });

    logger.info('User logged in', { userId: user.id, requestId });
    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, status: user.status, role: membership.role },
        orgId: membership.org_id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (error) {
    logger.error('Login failed', error as Error, { requestId });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_CREDENTIALS, message: 'Login failed' },
    });
  }
});

// GET /v1/me - Get current user
app.get('/v1/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Missing or invalid authorization header' },
      });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload || payload.type !== 'access') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid or expired token' },
      });
    }

    const user = await queryOne<{ id: string; email: string; status: string; created_at: string }>(
      'SELECT id, email, status, created_at FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'User not found' },
      });
    }

    const org = await queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM orgs WHERE id = $1',
      [payload.orgId]
    );

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, status: user.status, createdAt: user.created_at },
        org: org ? { id: org.id, name: org.name } : null,
        role: payload.role,
        scopes: payload.scopes,
      },
    });
  } catch (error) {
    logger.error('Get user failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Failed to get user' },
    });
  }
});

// POST /v1/auth/refresh - Refresh access token
app.post('/v1/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Refresh token is required' },
      });
    }

    const payload = verifyToken(refreshToken);

    if (!payload || payload.type !== 'refresh') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid or expired refresh token' },
      });
    }

    const user = await queryOne<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!user || user.status !== 'ACTIVE') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'User not found or inactive' },
      });
    }

    const tokens = generateTokenPair({
      userId: payload.userId,
      orgId: payload.orgId,
      role: payload.role,
      scopes: payload.scopes,
    });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (error) {
    logger.error('Token refresh failed', error as Error);
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid refresh token' },
    });
  }
});

// POST /v1/auth/logout - Logout
app.post('/v1/auth/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload) {
        emitEvent(payload.orgId, 'USER', payload.userId, EVENT_TYPES.USER_LOGOUT, { userId: payload.userId });
      }
    }
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (error) {
    res.json({ success: true, data: { message: 'Logged out' } });
  }
});

// ============================================
// Policy Routes
// ============================================

// GET /v1/policies - List policies for org
app.get('/v1/policies', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const payload = verifyToken(authHeader.substring(7));
    if (!payload) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid token' },
      });
    }

    const result = await query<Policy>(
      `SELECT id, org_id as "orgId", subject_role as "subjectRole", 
              action, resource, effect, conditions_json as conditions
       FROM policies WHERE org_id = $1`,
      [payload.orgId]
    );

    res.json({ success: true, data: { policies: result.rows } });
  } catch (error) {
    logger.error('List policies failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Failed to list policies' },
    });
  }
});

// POST /v1/policies - Create policy
app.post('/v1/policies', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const payload = verifyToken(authHeader.substring(7));
    if (!payload || !payload.scopes.includes('admin.users')) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Insufficient permissions' },
      });
    }

    const { subjectRole, action, resource, effect, conditions } = req.body;

    if (!subjectRole || !action || !resource || !effect) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields' },
      });
    }

    const result = await query<{ id: string }>(
      `INSERT INTO policies (org_id, subject_role, action, resource, effect, conditions_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [payload.orgId, subjectRole, action, resource, effect, conditions ? JSON.stringify(conditions) : null]
    );

    emitEvent(payload.orgId, 'USER', payload.userId, EVENT_TYPES.POLICY_CREATED, {
      policyId: result.rows[0].id,
      subjectRole,
      action,
      resource,
      effect,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { policy: { id: result.rows[0].id, orgId: payload.orgId, subjectRole, action, resource, effect, conditions } },
    });
  } catch (error) {
    logger.error('Create policy failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Failed to create policy' },
    });
  }
});

// ============================================
// Internal Routes (Service-to-service)
// ============================================

// POST /internal/verify-token - Verify JWT token
app.post('/internal/verify-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.json({ success: false, data: { valid: false, reason: 'No token provided' } });
    }

    const payload = verifyToken(token);

    if (!payload || payload.type !== 'access') {
      return res.json({ success: false, data: { valid: false, reason: 'Invalid or expired token' } });
    }

    const user = await queryOne<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!user || user.status !== 'ACTIVE') {
      return res.json({ success: false, data: { valid: false, reason: 'User not found or inactive' } });
    }

    res.json({
      success: true,
      data: { valid: true, userId: payload.userId, orgId: payload.orgId, role: payload.role, scopes: payload.scopes },
    });
  } catch (error) {
    logger.error('Token verification failed', error as Error);
    res.json({ success: false, data: { valid: false, reason: 'Verification error' } });
  }
});

// POST /internal/check-policy - Check if action is allowed
app.post('/internal/check-policy', async (req: Request, res: Response) => {
  try {
    const { orgId, role, action, resource } = req.body;

    if (!orgId || !role || !action) {
      return res.json({ success: false, data: { allowed: false, reason: 'Missing parameters' } });
    }

    const policies = await query<{ effect: string; action: string; resource: string }>(
      `SELECT effect, action, resource FROM policies 
       WHERE org_id = $1 AND subject_role = $2
       ORDER BY effect DESC`,
      [orgId, role]
    );

    for (const policy of policies.rows) {
      if (policy.effect === 'DENY' && matchesPattern(action, policy.action) && matchesPattern(resource || '*', policy.resource)) {
        return res.json({ success: true, data: { allowed: false, reason: 'Explicitly denied' } });
      }
    }

    for (const policy of policies.rows) {
      if (policy.effect === 'ALLOW' && matchesPattern(action, policy.action) && matchesPattern(resource || '*', policy.resource)) {
        return res.json({ success: true, data: { allowed: true } });
      }
    }

    res.json({ success: true, data: { allowed: false, reason: 'No matching allow policy' } });
  } catch (error) {
    logger.error('Policy check failed', error as Error);
    res.json({ success: false, data: { allowed: false, reason: 'Check error' } });
  }
});

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return value.startsWith(pattern.slice(0, -2));
  if (pattern.startsWith('*.')) return value.endsWith(pattern.slice(2));
  return value === pattern;
}

// Start server
app.listen(PORT, () => {
  logger.info(`Auth service started on port ${PORT}`);
});

export default app;
