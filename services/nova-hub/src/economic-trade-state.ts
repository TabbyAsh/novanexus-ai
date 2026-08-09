import { query, queryOne } from '@nova/shared';

export type ProvenanceStatus =
  | 'UNKNOWN'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'OBSERVED'
  | 'SOURCE_VERIFIED'
  | 'USER_CONFIRMED'
  | 'SYSTEM_VERIFIED';

export type CapabilityRouteStatus = 'AVAILABLE' | 'GATED' | 'RESERVED' | 'DEGRADED';
export type CapabilityAuthority = 'OBSERVE' | 'RECOMMEND' | 'ASSIST' | 'AUTOMATE';

export interface CapabilityRouteView {
  id: string;
  name: string;
  providerType: 'EXTERNAL_DATA' | 'LOCAL_TOOL' | 'HUMAN_TASK';
  status: CapabilityRouteStatus;
  authority: CapabilityAuthority;
  riskTier: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  expectedConfidence: number | null;
  expectedCostUsd: number | null;
  blockingReason: string | null;
  description: string;
}

export interface EconomicGapView {
  id: string;
  code: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';
  blocking: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  provenance: ProvenanceStatus;
  blockedRequirement: string;
  requiredCapability: string;
  requiredConfidence: number | null;
  routes: CapabilityRouteView[];
}

export interface EconomicActionView {
  id: string;
  type: string;
  title: string;
  status: 'QUEUED' | 'AWAITING_HUMAN' | 'RUNNING' | 'EVIDENCE_SUBMITTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  authority: CapabilityAuthority;
  riskTier: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
}

export interface EconomicTradeEventView {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface EconomicTradeView {
  id: string;
  reference: string;
  title: string;
  seller: string;
  buyer: string;
  market: string;
  stage: string;
  status: string;
  currency: string;
  expectedRevenue: number | null;
  actualRevenue: number;
  provenance: ProvenanceStatus;
  gaps: EconomicGapView[];
  actions: EconomicActionView[];
  events: EconomicTradeEventView[];
  nextAction: {
    id: string;
    label: string;
    capabilityId: string;
    authority: CapabilityAuthority;
    reason: string;
  } | null;
  updatedAt: string;
}

export interface EconomicTradeCommandResult {
  reply: string;
  capabilityId: 'economic.trade.inspect' | 'economic.trade.field_measurement_task';
  source: string;
  trade: EconomicTradeView;
  command: 'inspect' | 'field_measurement_task_created';
}

interface TradeRow {
  id: string;
  reference: string;
  title: string;
  seller: string;
  buyer: string;
  market: string;
  stage: string;
  status: string;
  currency: string;
  expected_revenue: string | null;
  actual_revenue: string;
  provenance_status: ProvenanceStatus;
  updated_at: string;
}

interface GapRow {
  id: string;
  code: string;
  title: string;
  description: string;
  status: EconomicGapView['status'];
  blocking: boolean;
  severity: EconomicGapView['severity'];
  provenance_status: ProvenanceStatus;
  blocked_requirement: string;
  required_capability: string;
  required_confidence: string | null;
  routes_json: CapabilityRouteView[] | string;
}

interface ActionRow {
  id: string;
  action_type: string;
  title: string;
  status: EconomicActionView['status'];
  authority: CapabilityAuthority;
  risk_tier: EconomicActionView['riskTier'];
  payload_json: Record<string, unknown> | string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  payload_json: Record<string, unknown> | string;
}

let tablesReady = false;

function jsonValue<T>(value: T | string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureTables(): Promise<void> {
  if (tablesReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS economic_trades (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL,
      reference VARCHAR(32) NOT NULL,
      title TEXT NOT NULL,
      seller TEXT NOT NULL,
      buyer TEXT NOT NULL,
      market TEXT NOT NULL,
      stage VARCHAR(40) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      expected_revenue NUMERIC,
      actual_revenue NUMERIC NOT NULL DEFAULT 0,
      provenance_status VARCHAR(32) NOT NULL DEFAULT 'USER_CONFIRMED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, reference)
    )
  `, []);

  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_gaps (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      code VARCHAR(80) NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
      blocking BOOLEAN NOT NULL DEFAULT true,
      severity VARCHAR(16) NOT NULL DEFAULT 'HIGH',
      provenance_status VARCHAR(32) NOT NULL DEFAULT 'USER_CONFIRMED',
      blocked_requirement TEXT NOT NULL,
      required_capability VARCHAR(160) NOT NULL,
      required_confidence NUMERIC,
      routes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      UNIQUE(trade_id, code)
    )
  `, []);

  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_actions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      action_type VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      status VARCHAR(32) NOT NULL,
      authority VARCHAR(16) NOT NULL,
      risk_tier VARCHAR(4) NOT NULL,
      idempotency_key VARCHAR(220) NOT NULL UNIQUE,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, []);

  await query(`
    CREATE TABLE IF NOT EXISTS economic_trade_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trade_id UUID NOT NULL REFERENCES economic_trades(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, []);

  await query('CREATE INDEX IF NOT EXISTS idx_economic_trades_user_ref ON economic_trades(user_id, reference)', []);
  await query('CREATE INDEX IF NOT EXISTS idx_economic_trade_gaps_trade_status ON economic_trade_gaps(trade_id, status)', []);
  await query('CREATE INDEX IF NOT EXISTS idx_economic_trade_actions_trade_created ON economic_trade_actions(trade_id, created_at DESC)', []);
  await query('CREATE INDEX IF NOT EXISTS idx_economic_trade_events_trade_occurred ON economic_trade_events(trade_id, occurred_at DESC)', []);

  tablesReady = true;
}

async function getConfiguredTrade0001Id(userId: string): Promise<string> {
  await ensureTables();
  const trade = await queryOne<{ id: string }>(
    `SELECT id FROM economic_trades WHERE user_id = $1 AND reference = '0001'`,
    [userId],
  );
  if (!trade?.id) {
    throw new Error('Trade #0001 is not configured for this account. Explicit case creation and provenance confirmation are required.');
  }
  return trade.id;
}

function mapGap(row: GapRow): EconomicGapView {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
    blocking: row.blocking,
    severity: row.severity,
    provenance: row.provenance_status,
    blockedRequirement: row.blocked_requirement,
    requiredCapability: row.required_capability,
    requiredConfidence: row.required_confidence == null ? null : Number(row.required_confidence),
    routes: jsonValue<CapabilityRouteView[]>(row.routes_json, []),
  };
}

function mapAction(row: ActionRow): EconomicActionView {
  return {
    id: row.id,
    type: row.action_type,
    title: row.title,
    status: row.status,
    authority: row.authority,
    riskTier: row.risk_tier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: jsonValue<Record<string, unknown>>(row.payload_json, {}),
  };
}

function mapEvent(row: EventRow): EconomicTradeEventView {
  return {
    id: row.id,
    type: row.event_type,
    occurredAt: row.occurred_at,
    payload: jsonValue<Record<string, unknown>>(row.payload_json, {}),
  };
}

export async function getTrade0001(userId: string): Promise<EconomicTradeView> {
  const tradeId = await getConfiguredTrade0001Id(userId);

  const [trade, gaps, actions, events] = await Promise.all([
    queryOne<TradeRow>(
      `SELECT id, reference, title, seller, buyer, market, stage, status, currency,
              expected_revenue, actual_revenue, provenance_status, updated_at
       FROM economic_trades WHERE id = $1 AND user_id = $2`,
      [tradeId, userId],
    ),
    query<GapRow>(
      `SELECT id, code, title, description, status, blocking, severity,
              provenance_status, blocked_requirement, required_capability,
              required_confidence, routes_json
       FROM economic_trade_gaps WHERE trade_id = $1
       ORDER BY blocking DESC, created_at ASC`,
      [tradeId],
    ),
    query<ActionRow>(
      `SELECT id, action_type, title, status, authority, risk_tier,
              payload_json, created_at, updated_at
       FROM economic_trade_actions WHERE trade_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 20`,
      [tradeId, userId],
    ),
    query<EventRow>(
      `SELECT id, event_type, occurred_at, payload_json
       FROM economic_trade_events WHERE trade_id = $1 AND user_id = $2
       ORDER BY occurred_at DESC LIMIT 40`,
      [tradeId, userId],
    ),
  ]);

  if (!trade) throw new Error('Trade #0001 is unavailable.');

  const mappedGaps = gaps.rows.map(mapGap);
  const mappedActions = actions.rows.map(mapAction);
  const geometryGap = mappedGaps.find(gap => gap.code === 'geometry-and-parcel-membership' && gap.status !== 'RESOLVED');
  const activeFieldTask = mappedActions.find(action => action.type === 'FIELD_MEASUREMENT' && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(action.status));

  const nextAction = activeFieldTask
    ? {
        id: activeFieldTask.id,
        label: 'Complete the field-measurement checklist and submit dimensions/photos.',
        capabilityId: 'property.structure_geometry.measure',
        authority: 'ASSIST' as const,
        reason: 'A durable human task already exists; creating another would duplicate work.',
      }
    : geometryGap
      ? {
          id: 'create-field-measurement-task',
          label: 'Create the field-measurement task.',
          capabilityId: 'property.structure_geometry.measure',
          authority: 'ASSIST' as const,
          reason: 'It is the only currently available route expected to satisfy the geometry confidence threshold.',
        }
      : null;

  return {
    id: trade.id,
    reference: trade.reference,
    title: trade.title,
    seller: trade.seller,
    buyer: trade.buyer,
    market: trade.market,
    stage: trade.stage,
    status: trade.status,
    currency: trade.currency,
    expectedRevenue: trade.expected_revenue == null ? null : Number(trade.expected_revenue),
    actualRevenue: Number(trade.actual_revenue || 0),
    provenance: trade.provenance_status,
    gaps: mappedGaps,
    actions: mappedActions,
    events: events.rows.map(mapEvent),
    nextAction,
    updatedAt: trade.updated_at,
  };
}

export async function createFieldMeasurementTask(userId: string): Promise<EconomicTradeView> {
  const trade = await getTrade0001(userId);
  const geometryGap = trade.gaps.find(gap => gap.code === 'geometry-and-parcel-membership');
  if (!geometryGap || geometryGap.status === 'RESOLVED') return trade;

  const idempotencyKey = `${userId}:${trade.id}:field-measurement:v1`;
  const payload = {
    gapId: geometryGap.id,
    capabilityId: 'property.structure_geometry.measure',
    providerId: 'field_measurement_task',
    checklist: [
      'Confirm which permanent structures are inside the quoted parcel/scope.',
      'Assign a stable label to each included structure.',
      'Measure exterior length, width, wall height, and gable height where applicable.',
      'Photograph every exterior face with the structure label visible in the submission.',
      'Photograph roll-up doors, trim, gutters/downspouts, entrances, access restrictions, and water-source location.',
      'Record measurement method, units, date, person, and any inaccessible surface.',
    ],
    completionRule: 'The geometry gap remains open until submitted evidence is evaluated at confidence >= 0.90.',
  };

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO economic_trade_actions (
       trade_id, user_id, action_type, title, status, authority, risk_tier,
       idempotency_key, payload_json
     ) VALUES ($1, $2, 'FIELD_MEASUREMENT', $3, 'AWAITING_HUMAN', 'ASSIST', 'R1', $4, $5::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [trade.id, userId, 'Measure and photograph the commercial site structures', idempotencyKey, JSON.stringify(payload)],
  );

  if (inserted?.id) {
    await query(
      `UPDATE economic_trade_gaps SET status = 'IN_PROGRESS', updated_at = NOW()
       WHERE id = $1 AND status = 'OPEN'`,
      [geometryGap.id],
    );
    await query(
      `UPDATE economic_trades SET updated_at = NOW() WHERE id = $1`,
      [trade.id],
    );
    await query(
      `INSERT INTO economic_trade_events (trade_id, user_id, event_type, payload_json)
       VALUES ($1, $2, 'FIELD_MEASUREMENT_TASK_CREATED', $3::jsonb)`,
      [trade.id, userId, JSON.stringify({ actionId: inserted.id, gapId: geometryGap.id, authority: 'ASSIST', externalSideEffectsPerformed: false })],
    );
  }

  return getTrade0001(userId);
}

export function targetsTrade0001(message: string): boolean {
  return /\btrade\s*#?\s*0*1\b/i.test(message)
    || /\bcommercial\s+site\b/i.test(message)
    || /\bfield[-\s]?measurement\b/i.test(message);
}

export function requestsFieldMeasurementTask(message: string): boolean {
  return /\b(create|start|open|make|generate)\b[\s\S]{0,80}\b(field[-\s]?measurement|measurement task|site measurement|measurement checklist)\b/i.test(message)
    || /\bfield[-\s]?measurement task\b[\s\S]{0,50}\b(create|start|open|make|generate)\b/i.test(message);
}

function formatTradeReply(trade: EconomicTradeView, command: EconomicTradeCommandResult['command']): string {
  const openBlocking = trade.gaps.filter(gap => gap.blocking && gap.status !== 'RESOLVED' && gap.status !== 'WAIVED');
  const lines = [
    `Trade #${trade.reference} — ${trade.title}`,
    `Stage: ${trade.stage}. Expected revenue: ${trade.expectedRevenue == null ? 'UNKNOWN' : `${trade.currency} ${trade.expectedRevenue}`}. Actual revenue: ${trade.currency} ${trade.actualRevenue}.`,
    '',
    `${openBlocking.length} blocking gap${openBlocking.length === 1 ? '' : 's'} remain:`,
    ...openBlocking.map((gap, index) => `${index + 1}. ${gap.title} — blocks ${gap.blockedRequirement}`),
  ];

  if (command === 'field_measurement_task_created') {
    const task = trade.actions.find(action => action.type === 'FIELD_MEASUREMENT');
    lines.push(
      '',
      task
        ? `Created durable task ${task.id}. Status: ${task.status}. Authority: ${task.authority}; no external side effect was performed.`
        : 'The field-measurement task already existed; no duplicate was created.',
      'The geometry gap remains open until measurements and photographs are submitted and evaluated.',
    );
  } else if (trade.nextAction) {
    lines.push('', `Next action: ${trade.nextAction.label}`, `Why: ${trade.nextAction.reason}`);
  }

  return lines.join('\n');
}

export async function handleEconomicTradeCommand(
  userId: string,
  message: string,
): Promise<EconomicTradeCommandResult | null> {
  if (!targetsTrade0001(message)) return null;

  if (requestsFieldMeasurementTask(message)) {
    const trade = await createFieldMeasurementTask(userId);
    return {
      reply: formatTradeReply(trade, 'field_measurement_task_created'),
      capabilityId: 'economic.trade.field_measurement_task',
      source: 'postgres:economic_trade_actions',
      trade,
      command: 'field_measurement_task_created',
    };
  }

  const trade = await getTrade0001(userId);
  return {
    reply: formatTradeReply(trade, 'inspect'),
    capabilityId: 'economic.trade.inspect',
    source: 'postgres:economic_trades+economic_trade_gaps',
    trade,
    command: 'inspect',
  };
}
