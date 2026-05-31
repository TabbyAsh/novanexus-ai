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

type UsageRow = {
  journal_entries_count: number;
  backtests_count: number;
  ai_thesis_count: number;
  decision_cards_count: number;
};

const unlimitedPlanLimits = {
  daily_journal_entries: -1,
  daily_backtests: -1,
  daily_decision_cards: -1,
  max_watchlists: 10,
  max_alerts: 100,
  max_paper_trades: 1000,
  ai_thesis_daily: -1,
  strategy_analytics_depth: 2,
  csv_export: true,
  pdf_reports: true,
};

const state: {
  cards: Map<string, StoredCard>;
  versions: Map<string, any>;
  outcomes: any[];
  executions: any[];
  snapshots: any[];
  usage: UsageRow;
  plan: string;
  planLimits: Record<string, unknown>;
} = {
  cards: new Map(),
  versions: new Map(),
  outcomes: [],
  executions: [],
  snapshots: [],
  usage: {
    journal_entries_count: 0,
    backtests_count: 0,
    ai_thesis_count: 0,
    decision_cards_count: 0,
  },
  plan: 'LITE',
  planLimits: { ...unlimitedPlanLimits },
};

function resetState() {
  state.cards.clear();
  state.versions.clear();
  state.outcomes = [];
  state.executions = [];
  state.snapshots = [];
  state.usage = {
    journal_entries_count: 0,
    backtests_count: 0,
    ai_thesis_count: 0,
    decision_cards_count: 0,
  };
  state.plan = 'LITE';
  state.planLimits = { ...unlimitedPlanLimits };
}

function mockDbLayer() {
  mockQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('INSERT INTO usage_tracking')) {
      if (sql.includes('journal_entries_count')) state.usage.journal_entries_count += 1;
      if (sql.includes('backtests_count')) state.usage.backtests_count += 1;
      if (sql.includes('ai_thesis_count')) state.usage.ai_thesis_count += 1;
      if (sql.includes('decision_cards_count')) state.usage.decision_cards_count += 1;
      return { rows: [], rowCount: 1 };
    }
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
        org_id: params[1],
        user_id: params[2],
        decision_card_id: params[3],
        predicted_json: params[4],
        actual_json: params[5],
        learning_json: params[6],
        calibration_error_pct: params[7],
        created_at: '2026-05-12T00:00:00.000Z',
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM nexus_learning_snapshots') && sql.includes('WHERE org_id = $1 AND user_id = $2')) {
      return {
        rows: state.snapshots
          .filter((s) => s.org_id === params[0] && s.user_id === params[1])
          .slice(-50)
          .reverse()
          .map((s) => ({
            predicted_json: s.predicted_json,
            learning_json: s.learning_json,
            calibration_error_pct: s.calibration_error_pct,
          })),
      };
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
    if (sql.includes('SELECT plan FROM entitlements WHERE user_id = $1')) {
      return { plan: state.plan };
    }
    if (sql.includes('SELECT limits_json FROM plan_configs WHERE plan = $1')) {
      return { limits_json: JSON.stringify(state.planLimits) };
    }
    if (sql.includes('SELECT journal_entries_count, backtests_count, ai_thesis_count, decision_cards_count FROM usage_tracking')) {
      return { ...state.usage };
    }
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
  it('runs full Observe-Decide-Execute-Log lifecycle as an end-to-end endpoint flow', async () => {
    const observeHandler = routeHandlers['POST /v1/nexus/observe'];
    const getCardHandler = routeHandlers['GET /v1/nexus/decision-cards/:id'];
    const executeHandler = routeHandlers['POST /v1/nexus/decision-cards/:id/execute'];
    const outcomeHandler = routeHandlers['POST /v1/nexus/decision-cards/:id/outcome'];
    const learningHandler = routeHandlers['GET /v1/nexus/decision-cards/:id/learning'];

    expect(observeHandler).toBeDefined();
    expect(getCardHandler).toBeDefined();
    expect(executeHandler).toBeDefined();
    expect(outcomeHandler).toBeDefined();
    expect(learningHandler).toBeDefined();

    const observe = makeReqRes({
      body: {
        opportunity: {
          title: 'Nintendo Switch OLED',
          category: 'Gaming',
          condition: 'Like New',
          askingPrice: '190',
          soldComps: '240,255,248,260',
          estimatedFees: 30,
          estimatedShipping: 12,
          rawText: 'Nintendo Switch OLED like new asking $190 sold comps: 240,255,248,260',
          sourceUrl: 'https://example.com/listing',
          location: 'Seattle',
        },
      },
    });
    await observeHandler(observe.req, observe.res);
    expect(observe.res.statusCode).toBe(201);
    expect(observe.res.payload.success).toBe(true);
    expect(observe.res.payload.data.ingestion.version).toBe('nexus.ingest.v2');
    expect(Array.isArray(observe.res.payload.data.ingestion.derivedFields)).toBe(true);
    const cardId = observe.res.payload.data.cardId as string;
    expect(state.cards.has(cardId)).toBe(true);
    const decidedOpen = makeReqRes({ params: { id: cardId } });
    await getCardHandler(decidedOpen.req, decidedOpen.res);
    expect(decidedOpen.res.statusCode).toBe(200);
    expect(decidedOpen.res.payload.success).toBe(true);
    expect(decidedOpen.res.payload.data.id).toBe(cardId);
    expect(decidedOpen.res.payload.data.status).toBe('OPEN');
    expect(decidedOpen.res.payload.data.action).toBeDefined();
    expect(decidedOpen.res.payload.data.card).toBeDefined();
    expect(decidedOpen.res.payload.data.card.confidence.confidenceBounds).toBeDefined();
    expect(decidedOpen.res.payload.data.card.confidence.uncertaintyDrivers).toBeDefined();
    expect(decidedOpen.res.payload.data.card.marketIntel).toBeDefined();
    expect(decidedOpen.res.payload.data.card.financialModel).toBeDefined();

    const execute = makeReqRes({
      params: { id: cardId },
      body: { action: 'OFFER', offerPrice: 175, executionPayload: { channel: 'local' } },
    });
    await executeHandler(execute.req, execute.res);
    expect(execute.res.statusCode).toBe(201);
    expect(execute.res.payload.data.status).toBe('EXECUTING');
    expect(state.cards.get(cardId)?.status).toBe('EXECUTING');
    const decidedExecuting = makeReqRes({ params: { id: cardId } });
    await getCardHandler(decidedExecuting.req, decidedExecuting.res);
    expect(decidedExecuting.res.statusCode).toBe(200);
    expect(decidedExecuting.res.payload.data.status).toBe('EXECUTING');

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
    const decidedClosed = makeReqRes({ params: { id: cardId } });
    await getCardHandler(decidedClosed.req, decidedClosed.res);
    expect(decidedClosed.res.statusCode).toBe(200);
    expect(decidedClosed.res.payload.data.status).toBe('CLOSED');
    expect(decidedClosed.res.payload.data.outcomes.length).toBe(1);
    expect(decidedClosed.res.payload.data.latestLearning).toBeDefined();

    const learning = makeReqRes({ params: { id: cardId } });
    await learningHandler(learning.req, learning.res);
    expect(learning.res.statusCode).toBe(200);
    expect(learning.res.payload.success).toBe(true);
    expect(learning.res.payload.data.cardId).toBe(cardId);
    expect(learning.res.payload.data.snapshots.length).toBe(1);
    expect(learning.res.payload.data.snapshots[0].calibrationErrorPct).toBeGreaterThanOrEqual(0);
  });

  it('ingests raw text input and returns a v2 Decision Card end-to-end', async () => {
    const observeHandler = routeHandlers['POST /v1/nexus/observe'];
    const getCardHandler = routeHandlers['GET /v1/nexus/decision-cards/:id'];

    const observe = makeReqRes({
      body: {
        opportunity: {
          rawText: 'Dyson V8 vacuum like new asking $120 sold comps: 165, 172, 168',
          sourceUrl: 'https://www.facebook.com/marketplace/item/123',
          location: 'Austin, TX',
        },
      },
    });

    await observeHandler(observe.req, observe.res);
    expect(observe.res.statusCode).toBe(201);
    expect(observe.res.payload.success).toBe(true);
    expect(observe.res.payload.data.ingestion.version).toBe('nexus.ingest.v2');
    expect(observe.res.payload.data.ingestion.source).toBe('hybrid');
    expect(observe.res.payload.data.ingestion.derivedFields).toEqual(
      expect.arrayContaining(['askingPrice', 'soldComps', 'sourceType', 'category', 'condition'])
    );
    expect(observe.res.payload.data.card.financials.askingPrice).toBe(120);
    expect(observe.res.payload.data.card.marketIntelligence.soldRange.mid).toBeGreaterThan(0);
    expect(observe.res.payload.data.card.marketIntel).toBeDefined();
    expect(observe.res.payload.data.card.financialModel).toBeDefined();

    const insertOpportunityCall = mockQuery.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO nexus_opportunities')
    );
    expect(insertOpportunityCall).toBeDefined();
    const persistedRawInput = JSON.parse(insertOpportunityCall![1][5]);
    expect(persistedRawInput.ingestion.version).toBe('nexus.ingest.v2');
    expect(persistedRawInput.raw.rawText).toContain('Dyson V8 vacuum');
    expect(persistedRawInput.normalized.askingPrice).toBe(120);
    expect(persistedRawInput.normalized.sourceType).toBe('facebook_marketplace');

    const cardId = observe.res.payload.data.cardId as string;
    const getCard = makeReqRes({ params: { id: cardId } });
    await getCardHandler(getCard.req, getCard.res);
    expect(getCard.res.statusCode).toBe(200);
    expect(getCard.res.payload.success).toBe(true);
    expect(getCard.res.payload.data.card.financials.askingPrice).toBe(120);
    expect(['BUY', 'OFFER', 'SKIP', 'WAIT', 'SELL']).toContain(getCard.res.payload.data.card.decision.action);
  });

  it('adapts new decision cards after poor realized outcomes are logged', async () => {
    const observeHandler = routeHandlers['POST /v1/nexus/observe'];
    const outcomeHandler = routeHandlers['POST /v1/nexus/decision-cards/:id/outcome'];

    const observeBaseline = makeReqRes({
      body: {
        opportunity: {
          title: 'Sony WH-1000XM5 Headphones',
          category: 'Electronics',
          condition: 'Used',
          askingPrice: 120,
          soldComps: [180, 185, 190, 188, 176, 182],
          estimatedFees: 22,
          estimatedShipping: 10,
          location: 'Denver',
          sourceType: 'facebook_marketplace',
        },
      },
    });
    await observeHandler(observeBaseline.req, observeBaseline.res);
    expect(observeBaseline.res.statusCode).toBe(201);
    const baselineNet = observeBaseline.res.payload.data.card.financials.expectedNetProfit;
    const baselineConfidence = observeBaseline.res.payload.data.card.confidence.confidencePct;
    expect(observeBaseline.res.payload.data.calibration).toBeNull();

    for (let i = 0; i < 3; i++) {
      const observeTraining = makeReqRes({
        body: {
          opportunity: {
            title: `Training Opportunity ${i + 1}`,
            category: 'Electronics',
            condition: 'Used',
            askingPrice: 120,
            soldComps: [180, 185, 190, 188, 176, 182],
            estimatedFees: 22,
            estimatedShipping: 10,
            location: 'Denver',
            sourceType: 'facebook_marketplace',
          },
        },
      });
      await observeHandler(observeTraining.req, observeTraining.res);
      const trainingCardId = observeTraining.res.payload.data.cardId;

      const outcome = makeReqRes({
        params: { id: trainingCardId },
        body: {
          realizedNetProfit: -60,
          realizedHoldDays: 20,
          outcomeStatus: 'LOSS',
        },
      });
      await outcomeHandler(outcome.req, outcome.res);
      expect(outcome.res.statusCode).toBe(201);
    }

    const observePostLearning = makeReqRes({
      body: {
        opportunity: {
          title: 'Sony WH-1000XM5 Headphones (Post Learning)',
          category: 'Electronics',
          condition: 'Used',
          askingPrice: 120,
          soldComps: [180, 185, 190, 188, 176, 182],
          estimatedFees: 22,
          estimatedShipping: 10,
          location: 'Denver',
          sourceType: 'facebook_marketplace',
        },
      },
    });
    await observeHandler(observePostLearning.req, observePostLearning.res);
    expect(observePostLearning.res.statusCode).toBe(201);
    expect(observePostLearning.res.payload.data.calibration).toBeDefined();
    expect(observePostLearning.res.payload.data.calibration.sampleSize).toBeGreaterThanOrEqual(3);

    const adaptedNet = observePostLearning.res.payload.data.card.financials.expectedNetProfit;
    const adaptedConfidence = observePostLearning.res.payload.data.card.confidence.confidencePct;

    expect(adaptedNet).toBeLessThan(baselineNet);
    expect(adaptedConfidence).toBeLessThan(baselineConfidence);
    expect(observePostLearning.res.payload.data.card.confidence.assumptions.join(' ')).toContain('Outcome feedback applied');
  });

  it('shifts ROI and risk-adjusted value after multiple negative outcome logs', async () => {
    const observeHandler = routeHandlers['POST /v1/nexus/observe'];
    const outcomeHandler = routeHandlers['POST /v1/nexus/decision-cards/:id/outcome'];

    const createOpportunity = (title: string) => ({
      title,
      category: 'Electronics',
      condition: 'Used',
      askingPrice: 150,
      soldComps: [210, 220, 215, 225, 218, 212],
      estimatedFees: 28,
      estimatedShipping: 12,
      location: 'Phoenix',
      sourceType: 'facebook_marketplace',
    });

    const baselineObserve = makeReqRes({ body: { opportunity: createOpportunity('Baseline Opportunity') } });
    await observeHandler(baselineObserve.req, baselineObserve.res);
    expect(baselineObserve.res.statusCode).toBe(201);
    const baselineCard = baselineObserve.res.payload.data.card;
    expect(baselineObserve.res.payload.data.calibration).toBeNull();

    for (let i = 0; i < 4; i++) {
      const trainingObserve = makeReqRes({ body: { opportunity: createOpportunity(`Negative Training ${i + 1}`) } });
      await observeHandler(trainingObserve.req, trainingObserve.res);
      const trainingCardId = trainingObserve.res.payload.data.cardId as string;

      const lossOutcome = makeReqRes({
        params: { id: trainingCardId },
        body: {
          realizedNetProfit: -90,
          realizedHoldDays: 26,
          outcomeStatus: 'LOSS',
        },
      });
      await outcomeHandler(lossOutcome.req, lossOutcome.res);
      expect(lossOutcome.res.statusCode).toBe(201);
    }

    const postObserve = makeReqRes({ body: { opportunity: createOpportunity('Post Negative Outcomes') } });
    await observeHandler(postObserve.req, postObserve.res);
    expect(postObserve.res.statusCode).toBe(201);
    const postCard = postObserve.res.payload.data.card;
    const postCalibration = postObserve.res.payload.data.calibration;

    expect(postCalibration).toBeDefined();
    expect(postCalibration.sampleSize).toBeGreaterThanOrEqual(4);
    expect(postCard.financials.expectedRoiPct).toBeLessThan(baselineCard.financials.expectedRoiPct);
    expect(postCard.financials.riskAdjustedValue).toBeLessThan(baselineCard.financials.riskAdjustedValue);
    expect(postCard.confidence.confidencePct).toBeLessThan(baselineCard.confidence.confidencePct);
  });

  it('returns quota upgrade metadata when decision-card quota is exceeded', async () => {
    const observeHandler = routeHandlers['POST /v1/nexus/observe'];

    state.plan = 'FREE';
    state.planLimits = {
      daily_journal_entries: 3,
      daily_backtests: 1,
      daily_decision_cards: 1,
      max_watchlists: 1,
      max_alerts: 5,
      max_paper_trades: 10,
      ai_thesis_daily: 0,
      strategy_analytics_depth: 0,
      csv_export: false,
      pdf_reports: false,
    };
    state.usage.decision_cards_count = 1;

    const observe = makeReqRes({
      body: {
        opportunity: {
          title: 'Quota Test Listing',
          askingPrice: 110,
          soldComps: [160, 155, 150],
        },
      },
    });

    await observeHandler(observe.req, observe.res);
    expect(observe.res.statusCode).toBe(403);
    expect(observe.res.payload.success).toBe(false);
    expect(observe.res.payload.error.code).toBe('QUOTA_EXCEEDED');
    expect(observe.res.payload.error.requiredPlan).toBe('LITE');
    expect(observe.res.payload.error.limit).toBe(1);
    expect(observe.res.payload.error.used).toBe(1);
    expect(observe.res.payload.error.upgradeUrl).toBe('/pricing');
  });
});
