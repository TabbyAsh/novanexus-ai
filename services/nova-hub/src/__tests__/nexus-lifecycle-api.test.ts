const routeHandlers: Record<string, any> = {};
const appMock = {
  use: jest.fn(),
  get: jest.fn((path: string, ...handlers: any[]) => {
    routeHandlers[`GET ${path}`] = handlers[handlers.length - 1];
  }),
  post: jest.fn((path: string, ...handlers: any[]) => {
    routeHandlers[`POST ${path}`] = handlers[handlers.length - 1];
  }),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  listen: jest.fn(),
};

const expressMock: any = () => appMock;
expressMock.json = jest.fn(() => (_req: any, _res: any, next: any) => next?.());

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
let idCounter = 0;

jest.spyOn(global, 'setInterval').mockImplementation((() => 0) as any);
jest.spyOn(global, 'setTimeout').mockImplementation((() => 0) as any);

jest.mock('express', () => ({
  __esModule: true,
  default: expressMock,
}));

jest.mock('@nova/telemetry', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@nova/shared', () => {
  const eventTypes = new Proxy({}, { get: (_target, prop) => String(prop) });
  return {
    SERVICE_PORTS: {},
    HTTP_STATUS: {
      BAD_REQUEST: 400,
      CREATED: 201,
      FORBIDDEN: 403,
      INTERNAL_SERVER_ERROR: 500,
      NOT_FOUND: 404,
      UNAUTHORIZED: 401,
      SERVICE_UNAVAILABLE: 503,
      UNPROCESSABLE_ENTITY: 422,
    },
    ERROR_CODES: {
      INVALID_INPUT: 'INVALID_INPUT',
      NOT_FOUND: 'NOT_FOUND',
      INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
      TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    },
    EVENT_TYPES: eventTypes,
    query: (...args: any[]) => mockQuery(...args),
    queryOne: (...args: any[]) => mockQueryOne(...args),
    transaction: async (fn: any) => fn({ query: jest.fn() }),
    verifyToken: jest.fn(() => ({
      type: 'access',
      userId: 'user-1',
      orgId: 'org-1',
      role: 'OWNER',
      scopes: [],
    })),
    nowTimestamp: () => '2026-05-12T00:00:00.000Z',
    generateId: () => `gen-${++idCounter}`,
    computeEventHash: () => 'a'.repeat(64),
  };
});

type StoredCard = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  opportunity_id: string;
  vertical: string;
  decision_action: string;
  confidence_pct: number;
  volatility_level: string;
  latest_version: number;
  status: string;
  created_at: string;
  updated_at: string;
};

const state: {
  cards: Map<string, StoredCard>;
  versions: Map<string, any>;
  outcomes: any[];
  executions: any[];
  snapshots: any[];
} = {
  cards: new Map(),
  versions: new Map(),
  outcomes: [],
  executions: [],
  snapshots: [],
};

function resetState() {
  state.cards.clear();
  state.versions.clear();
  state.outcomes = [];
  state.executions = [];
  state.snapshots = [];
}

function mockDbLayer() {
  mockQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('INSERT INTO nexus_opportunities')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO nexus_decision_card_versions')) {
      state.versions.set(params[1], { decision_card_id: params[1], version_no: 1, card_json: params[2] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT id, outcome_status, realized_net_profit')) {
      return { rows: state.outcomes.filter((o) => o.decision_card_id === params[0]).slice(0, 10) };
    }
    if (sql.includes('INSERT INTO nexus_decision_executions')) {
      state.executions.push({
        id: params[0],
        decision_card_id: params[1],
        status: params[6],
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('UPDATE nexus_decision_cards') && sql.includes('SET status = $2')) {
      const card = state.cards.get(params[0]);
      if (card) card.status = params[1];
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO nexus_decision_outcomes')) {
      state.outcomes.push({
        id: params[0],
        decision_card_id: params[1],
        execution_id: params[2],
        outcome_status: params[3],
        realized_net_profit: params[6],
        realized_hold_days: params[7],
        logged_at: '2026-05-12T00:00:00.000Z',
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO nexus_learning_snapshots')) {
      state.snapshots.push({
        id: params[0],
        decision_card_id: params[3],
        predicted_json: params[4],
        actual_json: params[5],
        learning_json: params[6],
        calibration_error_pct: params[7],
        created_at: '2026-05-12T00:00:00.000Z',
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes(`UPDATE nexus_decision_cards SET status = 'CLOSED'`)) {
      const card = state.cards.get(params[0]);
      if (card) card.status = 'CLOSED';
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT id, predicted_json, actual_json, learning_json')) {
      const rows = state.snapshots
        .filter((s) => s.decision_card_id === params[0])
        .map((s) => ({
          ...s,
          calibration_error_pct: s.calibration_error_pct,
        }));
      return { rows };
    }
    return { rows: [], rowCount: 0 };
  });

  mockQueryOne.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('INSERT INTO nexus_decision_cards')) {
      const row: StoredCard = {
        id: params[0],
        org_id: params[1],
        user_id: params[2],
        opportunity_id: params[3],
        vertical: 'flip_cards',
        decision_action: params[4],
        confidence_pct: Number(params[5]),
        volatility_level: params[6],
        latest_version: 1,
        status: 'OPEN',
        created_at: '2026-05-12T00:00:00.000Z',
        updated_at: '2026-05-12T00:00:00.000Z',
      };
      state.cards.set(row.id, row);
      return row;
    }
    if (sql.includes('SELECT * FROM nexus_decision_cards') && sql.includes('(org_id IS NULL OR org_id = $2)')) {
      return state.cards.get(params[0]) || null;
    }
    if (sql.includes('SELECT * FROM nexus_decision_card_versions')) {
      return state.versions.get(params[0]) || null;
    }
    if (sql.includes('SELECT calibration_error_pct, learning_json, created_at')) {
      const row = state.snapshots.filter((s) => s.decision_card_id === params[0]).slice(-1)[0];
      return row
        ? { calibration_error_pct: row.calibration_error_pct, learning_json: row.learning_json, created_at: row.created_at }
        : null;
    }
    if (sql.includes('SELECT id FROM nexus_decision_cards WHERE id = $1')) {
      return state.cards.has(params[0]) ? { id: params[0] } : null;
    }
    return null;
  });
}

function makeReqRes(overrides: any = {}) {
  const req: any = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { userId: 'user-1', orgId: 'org-1', role: 'OWNER', scopes: [] },
    ...overrides,
  };
  const res: any = {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.payload = payload;
      return this;
    },
  };
  return { req, res };
}

beforeAll(async () => {
  await import('../index');
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  mockDbLayer();
});

describe('nexus lifecycle API handlers', () => {
  it('runs observe -> execute -> outcome -> learning lifecycle', async () => {
    const observeHandler = routeHandlers['POST /v1/nexus/observe'];
    const executeHandler = routeHandlers['POST /v1/nexus/decision-cards/:id/execute'];
    const outcomeHandler = routeHandlers['POST /v1/nexus/decision-cards/:id/outcome'];
    const learningHandler = routeHandlers['GET /v1/nexus/decision-cards/:id/learning'];

    expect(observeHandler).toBeDefined();
    expect(executeHandler).toBeDefined();
    expect(outcomeHandler).toBeDefined();
    expect(learningHandler).toBeDefined();

    const observe = makeReqRes({
      body: {
        opportunity: {
          title: 'Nintendo Switch OLED',
          category: 'Gaming',
          condition: 'Like New',
          askingPrice: 190,
          soldComps: [240, 255, 248, 260],
          estimatedFees: 30,
          estimatedShipping: 12,
          sourceType: 'facebook_marketplace',
          sourceUrl: 'https://example.com/listing',
          location: 'Seattle',
        },
      },
    });
    await observeHandler(observe.req, observe.res);
    expect(observe.res.statusCode).toBe(201);
    expect(observe.res.payload.success).toBe(true);
    const cardId = observe.res.payload.data.cardId as string;
    expect(state.cards.has(cardId)).toBe(true);

    const execute = makeReqRes({
      params: { id: cardId },
      body: { action: 'OFFER', offerPrice: 175, executionPayload: { channel: 'local' } },
    });
    await executeHandler(execute.req, execute.res);
    expect(execute.res.statusCode).toBe(201);
    expect(execute.res.payload.data.status).toBe('EXECUTING');
    expect(state.cards.get(cardId)?.status).toBe('EXECUTING');

    const outcome = makeReqRes({
      params: { id: cardId },
      body: {
        executionId: execute.res.payload.data.executionId,
        realizedSalePrice: 249,
        realizedTotalCost: 206,
        realizedHoldDays: 8,
        outcomeStatus: 'PROFIT',
      },
    });
    await outcomeHandler(outcome.req, outcome.res);
    expect(outcome.res.statusCode).toBe(201);
    expect(outcome.res.payload.data.cardStatus).toBe('CLOSED');
    expect(state.cards.get(cardId)?.status).toBe('CLOSED');
    expect(state.snapshots.length).toBe(1);

    const learning = makeReqRes({ params: { id: cardId } });
    await learningHandler(learning.req, learning.res);
    expect(learning.res.statusCode).toBe(200);
    expect(learning.res.payload.success).toBe(true);
    expect(learning.res.payload.data.cardId).toBe(cardId);
    expect(learning.res.payload.data.snapshots.length).toBe(1);
    expect(learning.res.payload.data.snapshots[0].calibrationErrorPct).toBeGreaterThanOrEqual(0);
  });
});
