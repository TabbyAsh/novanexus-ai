// ==========================================================================
// DYNAMIC API URL RESOLUTION - Called at request time, not module load
// ==========================================================================
// This MUST be a function called at request time because:
// 1. During SSR, window is undefined
// 2. Module-level code runs on server first and gets cached
// 3. We need to detect the actual runtime environment

import { resolveBackendUrl } from './backend-url';

function getApiBase(): string {
  // In browser: use same-origin proxy to avoid CORS issues
  // The proxy routes to the actual backend (Railway)
  if (typeof window !== 'undefined') {
    return '/api/proxy';
  }
  
  // Server-side deployments must be wired explicitly. This prevents a preview
  // or local build from silently sending tokens and writes to production.
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    throw new Error('BACKEND_URL is not configured for this deployment');
  }
  return backendUrl;
}


interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requiredPlan?: string;
    limit?: number;
    used?: number;
    remaining?: number;
    upgradeUrl?: string;
  };
  meta?: { page?: number; pageSize?: number; total?: number };
}

export type ProofState =
  | 'RECEIVED'
  | 'IN_REVIEW'
  | 'SCOPE_ACCEPTED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

export type ProofPaymentState = 'NOT_STARTED' | 'PAID' | 'REFUNDED';
export type ProofOutcomeState = 'PENDING' | 'VERIFIED' | 'UNVERIFIED';
export type ProofCommand =
  | 'BEGIN_REVIEW'
  | 'SET_NEXT_ACTION'
  | 'RECORD_SCOPE_ACCEPTANCE'
  | 'START_WORK'
  | 'COMPLETE_DELIVERABLE'
  | 'REOPEN_DELIVERABLE'
  | 'RECORD_HANDOFF'
  | 'RECORD_OUTCOME'
  | 'CLOSE_CASE'
  | 'CANCEL_CASE';

export type ProofPulse = {
  new_inquiries: number;
  awaiting_review: number;
  awaiting_payment: number;
  ready_to_start: number;
  active_work: number;
  awaiting_outcome: number;
  verified_outcomes: number;
  overdue_actions: number;
  risk_flags: number;
  cash_collected_cents: number | string;
};

export type ProofQueueItem = {
  id: string;
  receipt_id: string;
  service_code: string;
  business: string;
  status: ProofState;
  payment_status: ProofPaymentState;
  version: number;
  next_action: string | null;
  next_action_due_at: string | null;
  risk_code: string | null;
  outcome_status: ProofOutcomeState;
  created_at: string;
  updated_at: string;
  age_days: number;
};

export type ProofCaseRecord = Omit<ProofQueueItem, 'age_days'> & {
  name: string;
  email: string;
  challenge: string;
  org_id: string | null;
  assigned_user_id: string | null;
  active_scope_version: number | null;
  access_confirmed_at: string | null;
  work_started_at: string | null;
  handoff_recorded_at: string | null;
  delivered_at: string | null;
  outcome_json: Record<string, unknown> | string | null;
  learning: string | null;
  cancel_reason: string | null;
  closed_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  checkout_generated_at: string | null;
  checkout_scope_hash: string | null;
};

export type ProofScope = {
  id: string;
  version: number;
  target_result: string;
  deliverables_json: Array<{ code: string; detail: string }>;
  exclusions_json: string[];
  required_access_json: string[];
  delivery_target_business_days: number;
  amount_cents: number;
  currency: string;
  acceptance_channel: string;
  acceptance_reference: string;
  accepted_by: string;
  accepted_at: string;
  scope_hash: string;
  created_at: string;
};

export type ProofDeliverable = {
  code: string;
  label: string;
  status: 'OPEN' | 'COMPLETE';
  evidence_reference: string | null;
  evidence_hash: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type ProofTimelineEvent = {
  sequence: number;
  aggregate_version: number;
  actor_type: string;
  actor_id: string;
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  payload_json: Record<string, unknown>;
  event_hash: string;
  occurred_at: string;
};

export type ProofCaseDetail = {
  case: ProofCaseRecord;
  scope: ProofScope | null;
  deliverables: ProofDeliverable[];
  timeline: ProofTimelineEvent[];
  integrity: { eventCount: number; headHash: string | null; scopeHash: string | null };
};
type CandleIntegrity = {
  source_type: string;
  source_identifier: string;
  latency_class: string;
  confidence_score: number;
  timestamp_range: {
    start: string;
    end: string;
    expected: number;
    actual: number;
    missing: number;
    gapFill?: boolean;
    gapFillCount?: number;
  };
  note?: string;
};

type UsageSnapshot = {
  plan: 'FREE' | 'LITE' | 'PRO' | string;
  limits: Record<string, number>;
  analyticsDepth: number;
  usage: Record<string, number>;
  remaining: Record<string, number>;
  upgradeUrl?: string;
};

export type ScanOpportunity = {
  decisionCardId: string;
  opportunityId: string;
  title: string;
  askingPrice: number;
  city: string;
  sourceUrl: string;
  /** flip-engine action: BUY | OFFER | WAIT | SKIP */
  action: string;
  /** VLH recommendation: execute | wait | pass */
  recommendation: string;
  expectedNetProfit: number;
  expectedRoiPct: number;
  confidencePct: number;
  riskScore: number;
  dataCompleteness: string;
  governanceResult: string;
  category: string;
  negotiationScript: string;
  suggestedOffer: number | null;
  listingTitle: string;
  bestPlatform: string;
  compSource: 'db_cache' | 'heuristic';
  compCount: number;
  opportunityScore: number;
};

type GuidedFlowResponse = {
  flow: {
    thesis: any;
    decisionCard: any;
    gate: any;
    analytics: { depth: number; locked: boolean; reason?: string | null };
  };
  usage?: {
    plan: string;
    remaining: Record<string, number>;
    upgradeUrl?: string;
  };
};

// The universal Nova Decision Card (mirrors libs/shared DecisionCard).
export type DecisionCardDTO = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  card_type: 'TRADE' | 'FLIP' | 'PRICING' | 'CONTENT' | 'OPS' | 'LIFE' | string;
  user_id: string;
  session_id: string;
  observation: { source: string; raw_input: unknown; context: Record<string, unknown>; timestamp: string };
  analysis: {
    confidence: number | null;
    reasoning: string[];
    data_used: Array<{ name: string; endpoint?: string; fetchedAt: string; recordCount?: number }>;
    missing: string[];
    warnings: string[];
  };
  recommendation: { action: string; summary: string; details: string; risk_level: string };
  metrics: Record<string, unknown> | null;
  action_steps: Array<Record<string, unknown>>;
  governance: {
    mode: string;
    approved_by: string | null;
    approved_at: string | null;
    executed_at: string | null;
    kill_switch: boolean;
  };
  outcome: {
    status: 'PENDING' | 'EXECUTED' | 'SKIPPED' | 'CANCELLED' | string;
    result: unknown | null;
    actual_vs_expected: string | null;
    lesson: string | null;
    logged_at: string | null;
  };
  event_hash: string;
};

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('nova_access_token');
      this.refreshToken = localStorage.getItem('nova_refresh_token');
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('nova_access_token', accessToken);
      localStorage.setItem('nova_refresh_token', refreshToken);
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nova_access_token');
      localStorage.removeItem('nova_refresh_token');
    }
  }

  getAccessToken() {
    return this.accessToken;
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { skipAuth?: boolean; headers?: Record<string, string> }
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    if (this.accessToken && !options?.skipAuth) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle token expiry (retry once after refresh)
      if (response.status === 401 && this.refreshToken && !options?.skipAuth) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request(method, path, body, options);
        }
      }

      const contentType = response.headers.get('content-type') || '';
      let data: unknown = null;

      if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => '');
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }

        if (!data) {
          return {
            success: false,
            error: {
              code: 'BAD_RESPONSE',
              message: `Unexpected response from API (HTTP ${response.status})`,
            },
          };
        }
      }

      if (!data || typeof data !== 'object' || typeof (data as any).success !== 'boolean') {
        return {
          success: false,
          error: {
            code: 'BAD_RESPONSE',
            message: `Invalid API response shape (HTTP ${response.status})`,
          },
        };
      }

      return data as ApiResponse<T>;
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Network request failed' },
      };
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data: any = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

      if (data?.success && data?.data?.accessToken && data?.data?.refreshToken) {
        this.setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }

    this.clearTokens();
    return false;
  }

  // Auth endpoints
  async register(email: string, password: string, orgName?: string) {
    return this.request<{
      user: { id: string; email: string; status: string };
      org: { id: string; name: string };
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>('POST', '/v1/auth/register', { email, password, orgName }, { skipAuth: true });
  }

  async login(email: string, password: string) {
    return this.request<{
      user: { id: string; email: string; status: string; role: string };
      orgId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>('POST', '/v1/auth/login', { email, password }, { skipAuth: true });
  }

  async logout() {
    const result = await this.request('POST', '/v1/auth/logout');
    this.clearTokens();
    return result;
  }

  async getMe() {
    return this.request<{
      user: { id: string; email: string; status: string; createdAt: string };
      org: { id: string; name: string } | null;
      role: string;
      scopes: string[];
    }>('GET', '/v1/me');
  }

  // Private Proof Desk. Server-side ops.admin authorization remains authoritative.
  async getProofDesk(params?: { status?: ProofState | ''; cursor?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<{
      pulse: ProofPulse;
      cases: ProofQueueItem[];
      page: { nextCursor: string | null; hasMore: boolean };
      asOf: string;
    }>('GET', `/v1/ops/proofs${suffix}`);
  }

  async getProofCase(receiptId: string) {
    return this.request<ProofCaseDetail>('GET', `/v1/ops/proofs/${encodeURIComponent(receiptId)}`);
  }

  async sendProofCommand(input: {
    receiptId: string;
    command: ProofCommand;
    expectedVersion: number;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  }) {
    return this.request<ProofCaseDetail & { command: { idempotent: boolean; version: number } }>(
      'POST',
      `/v1/ops/proofs/${encodeURIComponent(input.receiptId)}/commands`,
      {
        command: input.command,
        expectedVersion: input.expectedVersion,
        payload: input.payload || {},
      },
      { headers: { 'Idempotency-Key': input.idempotencyKey } },
    );
  }

  async createProofCheckout(input: {
    receiptId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    return this.request<{
      sessionId: string;
      url: string;
      version: number;
      idempotent: boolean;
    }>(
      'POST',
      '/v1/billing/service-checkout',
      { receiptId: input.receiptId, expectedVersion: input.expectedVersion },
      { headers: { 'Idempotency-Key': input.idempotencyKey } },
    );
  }

  // Billing endpoints
  async getBillingEntitlement() {
    return this.request<{
      entitlement: {
        plan: 'FREE' | 'LITE' | 'PRO';
        status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';
        currentPeriodEnd: string | null;
        features: string[];
      };
    }>('GET', '/v1/billing/entitlement');
  }

  async createBillingPortalSession() {
    return this.request<{ url: string }>('POST', '/v1/billing/portal');
  }

  // Orchestrator endpoints
  async getStats() {
    return this.request<{
      goals: Record<string, number>;
      tasks: Record<string, number>;
      pendingApprovals: number;
      killSwitch: { enabled: boolean; enabledAt?: string; reason?: string };
    }>('GET', '/v1/stats');
  }

  async getGoals(status?: string) {
    const query = status ? `?status=${status}` : '';
    return this.request<{
      goals: Array<{
        id: string;
        orgId: string;
        createdBy: string;
        title: string;
        intent: string;
        constraints: Record<string, unknown>;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('GET', `/v1/goals${query}`);
  }

  async createGoal(title: string, intent: string, constraints?: Record<string, unknown>) {
    return this.request<{ goal: { id: string; title: string; intent: string; status: string } }>(
      'POST',
      '/v1/goals',
      { title, intent, constraints }
    );
  }

  async updateGoalStatus(goalId: string, status: string) {
    return this.request<{ goalId: string; status: string }>(
      'PATCH',
      `/v1/goals/${goalId}/status`,
      { status }
    );
  }

  async getTasks(goalId?: string, status?: string) {
    const params = new URLSearchParams();
    if (goalId) params.append('goalId', goalId);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      tasks: Array<{
        id: string;
        goalId: string;
        assignedToBot: string;
        type: string;
        status: string;
        input: Record<string, unknown>;
        output?: Record<string, unknown>;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('GET', `/v1/tasks${query}`);
  }

  async getApprovals(status = 'PENDING') {
    return this.request<{
      approvals: Array<{
        id: string;
        taskId: string;
        requiredRole: string;
        status: string;
        requestedAt: string;
        resolvedAt?: string;
      }>;
    }>('GET', `/v1/approvals?status=${status}`);
  }

  async approveApproval(approvalId: string) {
    return this.request<{ approvalId: string; status: string }>(
      'POST',
      `/v1/approvals/${approvalId}/approve`
    );
  }

  async rejectApproval(approvalId: string, reason?: string) {
    return this.request<{ approvalId: string; status: string }>(
      'POST',
      `/v1/approvals/${approvalId}/reject`,
      { reason }
    );
  }

  // Kill switch
  async getKillSwitchStatus() {
    return this.request<{ enabled: boolean; enabledAt?: string; enabledBy?: string; reason?: string }>(
      'GET',
      '/v1/kill-switch/status'
    );
  }

  async enableKillSwitch(reason?: string) {
    return this.request<{ enabled: boolean; enabledAt: string; enabledBy: string; reason?: string }>(
      'POST',
      '/v1/kill-switch/enable',
      { reason }
    );
  }

  async disableKillSwitch() {
    return this.request<{ enabled: boolean }>('POST', '/v1/kill-switch/disable');
  }

  // Events
  async getRecentEvents(limit = 50) {
    return this.request<{
      events: Array<{
        id: string;
        orgId: string;
        actorType: string;
        actorId: string;
        type: string;
        ts: string;
        payload: Record<string, unknown>;
        hash: string;
      }>;
    }>('GET', `/v1/events/recent?limit=${limit}`);
  }

  async getEventStats() {
    return this.request<{
      total: number;
      last24Hours: number;
      byType: Array<{ type: string; count: number }>;
    }>('GET', '/v1/events/stats');
  }

  async verifyEventChain() {
    return this.request<{
      valid: boolean;
      eventCount: number;
      brokenAt?: string;
      brokenReason?: string;
      lastHash: string;
    }>('GET', '/v1/events/chain/verify');
  }

  async repairEventChain() {
    return this.request<{
      repaired: number;
      eventCount: number;
      lastHash: string;
      message: string;
    }>('POST', '/v1/events/chain/repair');
  }

  async queryEvents(params: {
    limit?: number;
    offset?: number;
    type?: string;
    actor?: string;
  }) {
    return this.request<{
      events: Array<{
        id: string;
        type: string;
        actor: string;
        payload: Record<string, unknown>;
        hash: string;
        prev_hash: string | null;
        created_at: string;
      }>;
      total: number;
    }>('POST', '/v1/events/query', params);
  }

  async updateTask(taskId: string, status: string) {
    return this.request<{ taskId: string; status: string }>(
      'PATCH',
      `/v1/tasks/${taskId}/status`,
      { status }
    );
  }

  async decideApproval(approvalId: string, approved: boolean, reason?: string) {
    const endpoint = approved 
      ? `/v1/approvals/${approvalId}/approve`
      : `/v1/approvals/${approvalId}/reject`;
    return this.request<{ approvalId: string; status: string }>(
      'POST',
      endpoint,
      reason ? { reason } : undefined
    );
  }

  // Bot endpoints
  async getBots(type?: string, status?: string) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      bots: Array<{
        id: string;
        botType: string;
        instanceId: string;
        status: string;
        capabilities: string[];
        permissions: string[];
        lastHeartbeat: string | null;
        registeredAt: string;
      }>;
    }>('GET', `/v1/bots${query}`);
  }

  // Market Data endpoints
  async getMarketQuote(symbol: string) {
    return this.request<{
      quote: {
        symbol: string;
        price: number;
        change: number | null;
        changePercent: number | null;
        volume: number | null;
        bid: number | null;
        ask: number | null;
        timestamp: string;
        source: string;
      };
    }>('GET', `/v1/market/quote/${symbol}`);
  }

  async getMarketStatus() {
    return this.request<{
      providers: Array<{
        id: string;
        name: string;
        enabled: boolean;
        health: string;
        dataClass: string;
        requiresKey: boolean;
        configured: boolean;
        signupUrl: string | null;
        signupTime: string | null;
      }>;
      activeDataClass: string;
      upgradeHint: string | null;
      marketOpen: boolean;
      timestamp: string;
    }>('GET', '/v1/market/status');
  }

  async getMarketQuotes(symbols: string[]) {
    return this.request<{
      quotes: Array<{
        symbol: string;
        price: number;
        change: number | null;
        changePercent: number | null;
        volume: number | null;
        timestamp: string;
        source?: string;
      }>;
      unavailableSymbols?: string[];
    }>('POST', '/v1/market/quotes', { symbols });
  }

  async getMarketIndicators(symbol: string) {
    return this.request<{
      indicators: {
        symbol: string;
        rsi: number | null;
        adx?: number | null;
        plusDI?: number | null;
        minusDI?: number | null;
        sma20: number | null;
        sma50: number | null;
        sma200: number | null;
        macd: { value: number; signal: number; histogram: number } | null;
        vwap: number | null;
        asOf?: string | null;
        computedAt?: string;
        provider?: string;
        integrity?: CandleIntegrity;
      };
    }>('GET', `/v1/market/indicators/${symbol}`);
  }

  // ==========================================================================
  // Nova Hub (Journal / Backtests / Trade Ideas)
  // ==========================================================================
  async getUsage() {
    return this.request<UsageSnapshot>('GET', '/v1/usage');
  }

  async startGuidedFlow(input: { signal: Record<string, unknown> } | Record<string, unknown>) {
    const payload = (input as any).signal ? input : { signal: input };
    return this.request<GuidedFlowResponse>('POST', '/v1/guided/flow', payload);
  }

  async getJournal(params?: {
    symbol?: string;
    status?: string;
    strategy?: string;
    limit?: number;
    offset?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.symbol) qs.set('symbol', params.symbol);
    if (params?.status) qs.set('status', params.status);
    if (params?.strategy) qs.set('strategy', params.strategy);
    if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';

    return this.request<{
      entries: Array<{
        id: string;
        symbol: string;
        direction: string;
        entryPrice: number;
        exitPrice: number | null;
        positionSize: number;
        entryDate: string;
        exitDate: string | null;
        status: string;
        thesis: string | null;
        notes: string | null;
        strategyTag: string | null;
        pnl: number | null;
        pnlPercent: number | null;
        createdAt: string;
      }>;
      metrics: {
        totalTrades: number;
        winningTrades: number;
        winRate: number;
        totalPnl: number;
        avgPnlPercent: number;
      };
    }>('GET', `/v1/journal${query}`);
  }

  async createJournalEntry(entry: {
    symbol: string;
    direction: string;
    entryPrice: number;
    exitPrice?: number | null;
    positionSize: number;
    entryDate: string;
    exitDate?: string | null;
    thesis?: string | null;
    notes?: string | null;
    strategyTag?: string | null;
    paperTradeId?: string | null;
  }) {
    return this.request<{ entry: unknown }>('POST', '/v1/journal', entry);
  }

  async getJournalStreak() {
    return this.request<{ currentStreak: number; longestStreak: number; totalDays: number }>('GET', '/v1/journal/streak');
  }

  async getWeeklyReport() {
    return this.request<{
      period: { start: string; end: string };
      journal: {
        trades: number; wins: number; losses: number; winRate: number;
        totalPnl: number; avgPnlPercent: number; bestTradePct: number; worstTradePct: number;
      };
      comparison: { priorTrades: number; priorWinRate: number; winRateDelta: number; pnlDelta: number };
      decisionCards: { total: number; accuracy: number | null; avgConfidence: number };
      streak: { current: number; longest: number; totalDays: number };
      topMistakes: Array<{ strategy: string; count: number; totalLoss: number }>;
      topWins: Array<{ strategy: string; count: number; totalGain: number }>;
      generatedAt: string;
    }>('GET', '/v1/weekly-report');
  }

  // Decisions (Decision -> Replay)
  async getDecisions(params?: { status?: string; symbol?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.symbol) qs.set('symbol', params.symbol);
    if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';

    return this.request<{
      decisions: Array<{
        id: string;
        symbol: string;
        direction: string;
        intent: string;
        status: string;
        source: string;
        journalEntryId: string | null;
        constraints: Record<string, unknown>;
        rationale: Record<string, unknown>;
        createdAt: string;
        updatedAt: string;
        eventCount: number;
        lastEventAt: string | null;
      }>;
    }>('GET', `/v1/decisions${query}`);
  }

  async createDecision(params: {
    symbol: string;
    direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
    intent: string;
    constraints?: Record<string, unknown>;
    rationale?: Record<string, unknown>;
    journalEntryId?: string | null;
    source?: string;
  }) {
    return this.request<{ decision: any }>('POST', '/v1/decisions', params);
  }

  async appendDecisionEvent(decisionId: string, eventType: string, payload?: Record<string, unknown>) {
    return this.request<{ event: { decisionId: string; eventType: string; seq: number } }>(
      'POST',
      `/v1/decisions/${decisionId}/events`,
      { eventType, payload }
    );
  }

  async replayDecision(decisionId: string) {
    return this.request<{ decision: any; events: any[] }>(
      'POST',
      `/v1/decisions/${decisionId}/replay`
    );
  }

  // Decision Cards (Phase 2)
  async getDecisionCards(params?: {
    symbol?: string;
    strategy?: string;
    sourceType?: string;
    latencyClass?: string;
    regime?: string;
    status?: string;
    minConfidence?: number;
    maxConfidence?: number;
    limit?: number;
    offset?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.symbol) qs.set('symbol', params.symbol);
    if (params?.strategy) qs.set('strategy', params.strategy);
    if (params?.sourceType) qs.set('sourceType', params.sourceType);
    if (params?.latencyClass) qs.set('latencyClass', params.latencyClass);
    if (params?.regime) qs.set('regime', params.regime);
    if (params?.status) qs.set('status', params.status);
    if (typeof params?.minConfidence === 'number') qs.set('minConfidence', String(params.minConfidence));
    if (typeof params?.maxConfidence === 'number') qs.set('maxConfidence', String(params.maxConfidence));
    if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';

    return this.request<{ cards: any[]; analyticsDepth?: number }>('GET', `/v1/decision-cards${query}`);
  }

  async getDecisionCard(cardId: string) {
    return this.request<{ card: any; analyticsDepth?: number }>('GET', `/v1/decision-cards/${cardId}`);
  }

  async replayDecisionCard(cardId: string) {
    return this.request<{ cardId: string; stored: any; recomputed: any; drift: any }>(
      'POST',
      `/v1/decision-cards/${cardId}/replay`
    );
  }

  async getBacktests() {
    return this.request<{
      results: Array<{
        id: string;
        name: string;
        symbol: string;
        strategyType: string;
        totalReturnPct: number;
        winRate: number;
        sharpeRatio: number;
        totalTrades: number;
        createdAt: string;
      }>;
    }>('GET', '/v1/backtest');
  }

  async runBacktest(params: {
    symbol: string;
    strategyType: string;
    startDate: string;
    endDate: string;
    initialCapital?: number;
    params?: Record<string, number>;
    name?: string;
  }) {
    return this.request<{ result: unknown; disclaimer?: string }>('POST', '/v1/backtest', params);
  }

  async runStrategySimulation(params: {
    symbol: string;
    strategyType: string;
    strategyTag?: string;
    startDate?: string;
    endDate?: string;
    initialCapital?: number;
    params?: Record<string, number>;
  }) {
    return this.request<{ simulation: any; performance: any; window: any; analyticsDepth?: number; disclaimer?: string }>(
      'POST',
      '/v1/strategy-simulator',
      params
    );
  }

  async getStrategyPerformance(params?: {
    symbol?: string;
    strategyTag?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.symbol) qs.set('symbol', params.symbol);
    if (params?.strategyTag) qs.set('strategyTag', params.strategyTag);
    if (params?.status) qs.set('status', params.status);
    if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<{ strategies: any[]; analyticsDepth?: number }>('GET', `/v1/strategy-performance${query}`);
  }

  async getStrategyPerformanceDetail(id: string) {
    return this.request<{ strategy: any }>('GET', `/v1/strategy-performance/${id}`);
  }

  async getTradeIdeas(status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<{ theses: any[] }>('GET', `/v1/thesis${query}`);
  }

  async createTradeIdea(params: {
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    targetPrice?: number;
    stopLoss?: number;
    thesisText: string;
    reasoning?: string[];
  }) {
    return this.request<{ thesis: any }>('POST', '/v1/thesis', params);
  }

  // Watchlists (Tradebot)
  async getWatchlistQuotes(watchlistId: string = 'default') {
    return this.request<{
      watchlist: { id: string; name: string; symbols: string[] };
      quotes: Array<{
        symbol: string;
        price: number;
        change: number | null;
        changePercent: number | null;
        volume: number | null;
        timestamp?: string;
        source?: string;
      }>;
    }>('GET', `/v1/watchlists/${watchlistId}/quotes`);
  }

  // Watchlist management (via gateway)
  async addToWatchlist(watchlistId: string, symbol: string) {
    return this.request<{ watchlist: any }>('POST', `/v1/watchlists/${watchlistId}/symbols`, { symbol });
  }

  async removeFromWatchlist(watchlistId: string, symbol: string) {
    return this.request<{ watchlist: any }>('DELETE', `/v1/watchlists/${watchlistId}/symbols/${symbol}`);
  }

  // Create paper trade from signal directly (via gateway trade endpoints)
  async createPaperTradeFromSignal(
    signal: {
      symbol: string;
      type: 'bullish' | 'bearish';
      entry: number;
      target: number;
      stopLoss: number;
      confidence?: number;
      reasoning?: string | string[];
    },
    quantity: number = 10
  ) {
    // First create a thesis card
    const thesisResult = await this.createThesis({
      symbol: signal.symbol,
      entryPrice: signal.entry,
      targetPrice: signal.target,
      stopLoss: signal.stopLoss,
      direction: signal.type === 'bearish' ? 'SHORT' : 'LONG',
      confidence: signal.confidence,
      reasoning: signal.reasoning,
    });
    if (!thesisResult.success || !thesisResult.data?.thesis) {
      return {
        success: false,
        error: {
          code: 'THESIS_FAILED',
          message: thesisResult.error?.message || 'Failed to create thesis',
        },
      };
    }

    // Then open a paper trade
    return this.createPaperTrade(thesisResult.data.thesis.id, quantity);
  }

  // Trade endpoints
  async runScan(watchlistId?: string, filters?: { minScore?: number; signals?: string[] }) {
    return this.request<{
      results: Array<{
        symbol: string;
        signal: string;
        score: number;
        indicators: Record<string, unknown>;
        integrity?: CandleIntegrity;
        quote: {
          symbol: string;
          price: number;
          change: number | null;
          changePercent: number | null;
          volume: number | null;
        };
      }>;
      scannedAt: string;
    }>('POST', '/v1/trade/scan', { watchlistId, filters });
  }

  async getTheses() {
    return this.request<{
      theses: Array<{
        id: string;
        symbol: string;
        signal: string;
        entryPrice: number;
        targetPrice: number;
        stopLoss: number;
        riskRewardRatio: number;
        confidence: number;
        reasoning: string[];
        createdAt: string;
        expiresAt: string;
        dataIntegrity?: CandleIntegrity;
        decisionCardId?: string | null;
      }>;
    }>('GET', '/v1/trade/theses');
  }

  async createThesis(input: string | {
    symbol: string;
    entryPrice?: number;
    targetPrice?: number;
    stopLoss?: number;
    direction?: string;
    signal?: string;
    confidence?: number;
    reasoning?: string | string[];
    decisionCardId?: string | null;
  }) {
    const payload = typeof input === 'string' ? { symbol: input } : input;
    return this.request<{
      thesis: {
        id: string;
        symbol: string;
        signal: string;
        entryPrice: number;
        targetPrice: number;
        stopLoss: number;
        confidence: number;
        reasoning: string[];
        dataIntegrity?: CandleIntegrity;
        decisionCardId?: string | null;
      };
    }>('POST', '/v1/trade/theses', payload);
  }

  async getPaperTrades() {
    return this.request<{
      trades: Array<{
        id: string;
        thesisId: string;
        decisionCardId?: string | null;
        symbol: string;
        side: string;
        quantity: number;
        entryPrice: number;
        entryPriceRaw?: number;
        currentPrice?: number;
        exitPrice?: number;
        exitPriceRaw?: number;
        status: string;
        pnl?: number;
        pnlPercent?: number;
        fees?: number;
        entryFees?: number;
        exitFees?: number;
        entrySlippageBps?: number;
        exitSlippageBps?: number;
        dataIntegrity?: CandleIntegrity;
        openedAt: string;
        closedAt?: string;
      }>;
      stats: {
        totalTrades: number;
        openTrades: number;
        closedTrades: number;
        winRate: number;
        totalPnl: number;
        realizedPnl: number;
        unrealizedPnl: number;
        totalFees: number;
        avgSlippageBps: number;
        maxDrawdown: number;
        portfolioValue: number | null;
      };
      portfolio: { cash: number; positions: Record<string, number> };
    }>('GET', '/v1/trade/paper-trades');
  }

  async createPaperTrade(thesisId: string, quantity: number) {
    return this.request<{ trade: Record<string, unknown> }>(
      'POST',
      '/v1/trade/paper-trades',
      { thesisId, quantity }
    );
  }

  async closePaperTrade(tradeId: string) {
    return this.request<{ trade: Record<string, unknown> }>(
      'POST',
      `/v1/trade/paper-trades/${tradeId}/close`
    );
  }

  // Store endpoints
  async getProducts() {
    return this.request<{
      products: Array<{
        id: string;
        sku: string;
        title: string;
        status: string;
        meta: Record<string, unknown>;
        createdAt: string;
      }>;
    }>('GET', '/v1/store/products');
  }

  async getStoreCatalog() {
    return this.request<{
      products: Array<{
        id: string;
        sku: string;
        name: string;
        description: string;
        category: string;
        base_cost: number;
        current_price: number;
        min_price: number;
        max_price: number;
        stock_quantity: number;
        reorder_point: number;
      }>;
    }>('GET', '/v1/store/products/catalog');
  }

  async getInventoryAlerts() {
    return this.request<{
      alerts: Array<{
        id: string;
        productId: string;
        sku: string;
        title: string;
        alertType: string;
        message: string;
        severity: 'HIGH' | 'MEDIUM' | 'LOW';
        createdAt: string;
      }>;
    }>('GET', '/v1/store/alerts');
  }

  async getPricingRecommendations() {
    return this.request<{
      recommendations: Array<{
        id: string;
        productId: string;
        sku: string;
        title: string;
        currentPrice: number;
        recommendedPrice: number;
        reason: string;
        confidence: number;
        createdAt: string;
      }>;
    }>('GET', '/v1/store/pricing-recommendations');
  }

  async analyzeStorePricing() {
    return this.request<{
      recommendations: Array<{
        product_id: string;
        current_price: number;
        recommended_price: number;
        reason: string;
        confidence: number;
        projected_margin: number;
        projected_revenue_change: number;
      }>;
      analyzedAt: string;
    }>('GET', '/v1/store/pricing/analyze');
  }

  async applyStorePrice(params: { productId: string; newPrice: number; reason: string }) {
    return this.request<{ success: boolean; message: string }>('POST', '/v1/store/pricing/apply', params);
  }

  async appraiseStoreProduct(query: string) {
    return this.request<{
      appraisal: {
        query: string;
        avgPrice: number;
        minPrice: number;
        maxPrice: number;
        medianPrice: number;
        priceRange: string;
        recommendedPrice: number;
        marketDemand: 'low' | 'medium' | 'high';
        confidence: number;
        sources: Array<{
          title: string;
          price: number;
          currency?: string;
          source: string;
          url: string;
          rating?: number;
          condition?: string;
        }>;
        appraisedAt: string;
      };
    }>('POST', '/v1/store/products/appraise', { query });
  }

  // Social endpoints
  async getPosts() {
    return this.request<{
      posts: Array<{
        id: string;
        channel: string;
        title: string;
        status: string;
        scheduledAt?: string;
        publishedAt?: string;
        createdAt: string;
      }>;
    }>('GET', '/v1/social/posts');
  }

  async getSentimentAnalysis() {
    return this.request<{
      analysis: {
        overall: string;
        score: number;
        breakdown: { positive: number; neutral: number; negative: number };
        trending: string[];
      };
    }>('GET', '/v1/social/sentiment');
  }

  async getEngagementMetrics() {
    return this.request<{
      metrics: {
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        averageEngagementRate: number;
        topPosts: Array<{ id: string; title: string; engagementRate: number }>;
      };
    }>('GET', '/v1/social/engagement');
  }

  async getSocialAlerts() {
    return this.request<{
      alerts: Array<{
        id: string;
        type: string;
        message: string;
        severity: string;
        createdAt: string;
      }>;
    }>('GET', '/v1/social/alerts');
  }

  // SocialBot Content Manager endpoints
  async getContentAccounts() {
    return this.request<{
      accounts: Array<{
        id: string;
        platform: string;
        account_name: string;
        follower_count: number;
        engagement_rate: number;
      }>;
    }>('GET', '/v1/content/accounts');
  }

  async getContentPosts(params?: { status?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();

    return this.request<{
      posts: Array<{
        id: string;
        platform: string;
        content_type: string;
        content: string;
        status: string;
        scheduled_for: string | null;
        published_at: string | null;
        performance: {
          impressions: number;
          likes: number;
          comments: number;
          shares: number;
          engagement_rate: number;
        } | null;
      }>;
    }>('GET', `/v1/content/posts${query ? `?${query}` : ''}`);
  }

  async getContentSuggestions(platform?: string) {
    const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
    return this.request<{
      suggestions: Array<{
        platform: string;
        content_type: string;
        suggested_content: string;
        suggested_hashtags: string[];
        optimal_time: string;
        predicted_engagement: number;
        reasoning: string;
      }>;
    }>('GET', `/v1/content/suggestions${query}`);
  }

  async getContentAnalytics(days: number = 30) {
    return this.request<{
      analytics: {
        total_posts: number;
        total_impressions: number;
        total_engagement: number;
        avg_engagement_rate: number;
        platform_breakdown: Record<string, { posts: number; engagement: number }>;
        growth_trend: number;
      };
    }>('GET', `/v1/content/analytics?days=${days}`);
  }

  async createContentPost(params: { platform: string; content_type: string; content: string }) {
    return this.request<{ post: unknown }>('POST', '/v1/content/posts', params);
  }

  // Task creation for bot workflows
  async createTask(goalId: string, type: string, assignedToBot: string, input?: Record<string, unknown>) {
    return this.request<{ task: { id: string; type: string; status: string } }>(
      'POST',
      '/v1/tasks',
      { goalId, type, assignedToBot, input }
    );
  }

  // ==========================================================================
  // Trade / Nexus / Alpaca / AI Screener (via Gateway)
  // ==========================================================================
  // NOTE: Client traffic must go through NEXT_PUBLIC_API_URL (gateway). Do not call service ports directly.

  // Alpaca Trading
  async getAlpacaStatus() {
    return this.request<{
      connected: boolean;
      endpoint?: string;
      environment?: 'paper' | 'live';
      keyLast4?: string | null;
      lastVerifiedAt?: string | null;
      liveTradingEnabled?: boolean;
      enabled?: boolean;
      mode?: 'server' | 'user' | 'none';
      message?: string;
      reason?: string;
      canTradeLive?: boolean;
    }>('GET', '/v1/alpaca/status');
  }

  async connectAlpaca(params: { apiKey: string; apiSecret: string; environment?: 'paper' | 'live'; endpoint?: string }) {
    return this.request<{
      connected: boolean;
      endpoint: string;
      environment: 'paper' | 'live';
      keyLast4?: string;
      accountNumber?: string;
    }>('POST', '/v1/alpaca/connect', params);
  }

  async disconnectAlpaca() {
    return this.request<{ disconnected: boolean }>('DELETE', '/v1/alpaca/connect');
  }

  async getAlpacaAccount() {
    return this.request<{ account: any }>('GET', '/v1/alpaca/account');
  }

  async getAlpacaPositions() {
    return this.request<{ positions: any[] }>('GET', '/v1/alpaca/positions');
  }

  async getAlpacaOrders(status: 'open' | 'closed' | 'all' = 'all') {
    return this.request<{ orders: any[] }>('GET', `/v1/alpaca/orders?status=${status}`);
  }

  async placeAlpacaOrder(params: { symbol: string; qty: number; side: 'buy' | 'sell'; type?: string }) {
    return this.request<{ order: any }>('POST', '/v1/alpaca/orders', {
      ...params,
      type: params.type || 'market',
      time_in_force: 'day',
    });
  }

  async getAlpacaHistory(params?: { period?: string; timeframe?: string }) {
    const qs = new URLSearchParams();
    if (params?.period) qs.set('period', params.period);
    if (params?.timeframe) qs.set('timeframe', params.timeframe);
    const query = qs.toString();
    return this.request<{
      period: string;
      timeframe: string;
      plan: string;
      history: Array<{ timestamp: string; equity: number; profitLoss: number; profitLossPct: number }>;
    }>('GET', `/v1/alpaca/history${query ? `?${query}` : ''}`);
  }

  // Market Scanner
  async scanMarket(watchlistId: string = 'default', filters?: any) {
    return this.request<{ results: any[]; scannedAt: string }>('POST', '/v1/trade/scan', { watchlistId, filters });
  }

  // Watchlists
  async getWatchlists() {
    return this.request<{ watchlists: any[] }>('GET', '/v1/watchlists');
  }
  // Deterministic Screener (Nova Hub)
  async runScreener(params?: {
    symbols?: string[];
    maxSymbols?: number;
    minConfidence?: number;
    signalType?: 'all' | 'bullish' | 'bearish';
    sortMode?: string;
    board?: string;
    save?: boolean;
    name?: string;
  }) {
    return this.request<{ signals: any[]; scannedAt: string; reportId?: string; totalCandidates?: number; sortMode?: string; boardFilter?: string; boardDistribution?: Record<string, number> }>(
      'POST',
      '/v1/screener/scan',
      params || {}
    );
  }

  async saveScreenerReport(params: { name?: string; signals: any[]; settings?: any; scannedAt?: string }) {
    return this.request<{ reportId: string; scannedAt: string }>('POST', '/v1/screener/reports', params);
  }

  async getScreenerReports() {
    return this.request<{ reports: any[] }>('GET', '/v1/screener/reports');
  }

  async getScreenerReport(reportId: string) {
    return this.request<{ report: any }>('GET', `/v1/screener/reports/${reportId}`);
  }

  // AI Screener
  async getAIScreenerStatus() {
    return this.request<{ ready: boolean; openai: boolean; marketdata?: boolean; polygon?: boolean }>('GET', '/v1/ai-screener/status');
  }

  async runAIScreener(params?: { maxStocks?: number; minConfidence?: number; signalType?: string }) {
    return this.request<{ signals: any[]; count: number; scannedAt?: string }>('POST', '/v1/ai-screener/scan', params || {});
  }

  async analyzeStockWithAI(symbol: string) {
    return this.request<{ stock: any; indicators: any; signal: any }>('POST', '/v1/ai-screener/analyze', { symbol });
  }

  // Nova Nexus AI
  async getNexusStatus() {
    return this.request<{ status: any }>('GET', '/v1/nexus/status');
  }

  async initializeNexus() {
    return this.request<{ message: string; status: any }>('POST', '/v1/nexus/initialize');
  }

  async analyzeTradeWithNexus(params: { symbol: string; signal: string; price: number; indicators?: any; confidence?: number }) {
    return this.request<{ decision: any; card: any; message: string }>('POST', '/v1/nexus/analyze', params);
  }

  async executeNexusTrade(params: { symbol: string; signal: string; price: number; autoExecute?: boolean }) {
    return this.request<{ result: any; message: string }>('POST', '/v1/nexus/execute', params);
  }

  async runAutonomousScan(params?: { watchlistId?: string; maxTrades?: number }) {
    return this.request<{ scanned: number; opportunities: number; executions: any[] }>(
      'POST',
      '/v1/nexus/autonomous-scan',
      params || {}
    );
  }

  async getNexusLedger(limit: number = 50) {
    return this.request<{ ledger: any[] }>('GET', `/v1/nexus/ledger?limit=${limit}`);
  }

  // Nova Hub thesis generation (server-side; uses real market data)
  async generateThesis(symbol: string, context?: string) {
    return this.request<{ thesis: any; disclaimer?: string }>('POST', '/v1/thesis/generate', { symbol, context });
  }

  // TradeBot thesis cards (scanner-generated)
  async getActiveTheses() {
    return this.request<{ theses: any[] }>('GET', '/v1/trade/theses');
  }

  // Phase 7.4: Decision Cards
  async getCardWallet() {
    return this.request<{ balance: number; lastUpdated: string }>('GET', '/v1/cards/wallet');
  }

  async getCardLedger() {
    return this.request<{ transactions: Array<{ id: string; type: string; amount: number; reason: string; createdAt: string }> }>('GET', '/v1/cards/ledger');
  }

  async applyCard(params: { symbol: string; strategyId?: string }) {
    return this.request<{ runId: string; snapshot: any; sim: any; costs: any; tradeoffs: string[]; requiredCards: number }>('POST', '/v1/cards/apply', params);
  }

  async confirmCard(params: { runId: string }) {
    return this.request<{ confirmed: boolean; runId: string; paperExecutionId: string; balance: number; execution: any }>('POST', '/v1/cards/confirm', params);
  }

  async getCardExecutions() {
    return this.request<{ executions: any[] }>('GET', '/v1/cards/executions');
  }

  // ==========================================================================
  // UDM v2: Universal Decision Matrix (3-Tier)
  // ==========================================================================
  async getUdmWallet() {
    return this.request<{ clarity: number; foresight: number; autonomy: number }>('GET', '/v1/udm/wallet');
  }

  async applyUdm(params: { domain: string; target: string; tier: 'clarity' | 'foresight' | 'autonomy'; notional?: number }) {
    return this.request<{
      runId: string;
      snapshot: any;
      preview: any;
      sim: any | null;
      actionability: any;
      status: string;
    }>('POST', '/v1/udm/apply', params);
  }

  async quoteUdm(params: { runId: string; notional?: number }) {
    return this.request<{
      runId: string;
      notional: number;
      sim: any;
      knobs: any;
    }>('POST', '/v1/udm/quote', params);
  }

  async confirmUdm(params: { runId: string; notional: number }) {
    return this.request<{
      confirmed: boolean;
      runId: string;
      executionId: string | null;
      wallet: { clarity: number; foresight: number; autonomy: number };
    }>('POST', '/v1/udm/confirm', params);
  }

  async getUdmRun(runId: string) {
    return this.request<{ run: any }>('GET', `/v1/udm/runs/${runId}`);
  }

  async getDailyDrop() {
    return this.request<{
      items: Array<{
        symbol: string;
        actionability: number;
        strategyId: string;
        preview: any;
      }>;
      generatedAt: string;
      count: number;
    }>('GET', '/v1/daily-drop');
  }

  async getLatestProofPack() {
    return this.request<{
      proofPack: {
        id: string;
        generatedAt: string;
        gitSha: string;
        tests: any;
        deployment: any;
        signature: string;
      } | null;
    }>('GET', '/v1/proofpacks/latest');
  }

  // Reality check (via proxy to backend)
  async getReality() {
    return this.request<{
      online: boolean;
      marketOpen: boolean;
      dataFresh: boolean;
      backendsHealthy: boolean;
      lastCheck: string;
    }>('GET', '/v1/reality');
  }

  // ==========================================================================
  // Value Radar — Cross-market opportunity aggregator
  // ==========================================================================
  async getValueRadarOpportunities(category?: string) {
    const qs = category ? `?category=${category}` : '';
    return this.request<{
      opportunities: Array<{
        id: string;
        title: string;
        category: string;
        source: string;
        currentPrice: number;
        estimatedValue: number;
        score: number;
        tags: string[];
        detectedAt: string;
        url?: string;
      }>;
      total: number;
      scannedAt: string;
    }>('GET', `/v1/value-radar/opportunities${qs}`);
  }

  // ==========================================================================
  // Content Engine — Auto-generate content from platform activity
  // ==========================================================================
  async generateContent(type: string) {
    return this.request<{
      draft: {
        id: string;
        type: string;
        title: string;
        body: string;
        status: string;
        generatedAt: string;
        tags: string[];
      };
    }>('POST', '/v1/content/generate', { type });
  }

  async getContentDrafts() {
    return this.request<{
      drafts: Array<{
        id: string;
        type: string;
        title: string;
        body: string;
        status: string;
        generatedAt: string;
        tags: string[];
      }>;
    }>('GET', '/v1/content/drafts');
  }

  // ==========================================================================
  // Marketplace — Live product search + appraisal + flip analysis + trending
  // ==========================================================================
  async searchMarketplace(query: string) {
    return this.request<{
      products: Array<{ title: string; price: number; currency: string; source: string; url: string; imageUrl?: string; rating?: number; condition?: string; scrapedAt: string }>;
      totalFound: number;
      searchedAt: string;
    }>('GET', `/v1/marketplace/search?q=${encodeURIComponent(query)}`);
  }

  async appraiseProduct(query: string) {
    return this.request<{
      appraisal: {
        query: string;
        avgPrice: number;
        minPrice: number;
        maxPrice: number;
        medianPrice: number;
        priceRange: string;
        recommendedBuyPrice: number;
        recommendedSellPrice: number;
        recommendedPrice: number;
        estimatedProfit: number;
        estimatedProfitPercent: number;
        platformFees: number;
        shippingEstimate: number;
        marketDemand: 'low' | 'medium' | 'high';
        confidence: number;
        flipVerdict: 'strong-buy' | 'buy' | 'hold' | 'pass';
        flipExplanation: string;
        sources: Array<{ title: string; price: number; source: string; url: string; condition?: string; imageUrl?: string }>;
        appraisedAt: string;
        provenance: { method: string; sourceCount?: number; category?: string; note: string };
      };
    }>('POST', '/v1/marketplace/appraise', { query });
  }

  async getMarketplaceTrending() {
    return this.request<{
      categories: Array<{ category: string; icon: string; avgPrice: number; demand: string; examples: string[] }>;
      updatedAt: string;
    }>('GET', '/v1/marketplace/trending');
  }

  // ==========================================================================
  // Social Plans — Content plan generation + export
  // ==========================================================================
  async generateSocialPlan(params: { name?: string; frequency?: string; platforms?: string[]; niche?: string; days?: number }) {
    return this.request<{
      plan: {
        id: string;
        name: string;
        frequency: string;
        platforms: string[];
        niche: string;
        posts: Array<{
          id: string;
          platform: string;
          contentType: string;
          caption: string;
          hashtags: string[];
          imagePrompt?: string;
          optimalTime: string;
          dayOfWeek: string;
          predictedEngagement: number;
        }>;
        createdAt: string;
      };
      message: string;
    }>('POST', '/v1/social/plan/generate', params);
  }

  async getSocialPlans() {
    return this.request<{
      plans: Array<{ id: string; name: string; frequency: string; platforms: string[]; niche: string; postCount: number; createdAt: string }>;
      count: number;
    }>('GET', '/v1/social/plans');
  }

  async getSocialPlan(planId: string) {
    return this.request<{ plan: any }>('GET', `/v1/social/plans/${planId}`);
  }

  async exportSocialPlan(planId: string) {
    return this.request<{ csv: string; postCount: number; downloadUrl: string }>('GET', `/v1/social/plan/export/${planId}`);
  }

  // ==========================================================================
  // Dropshipping — Listing generation + export
  // ==========================================================================
  async generateDropshipListing(params: { productIdea: string; niche?: string }) {
    return this.request<{
      draft: {
        id: string;
        productIdea: string;
        title: string;
        description: string;
        category: string;
        suggestedPrice: number;
        priceRange: { min: number; max: number };
        imageRequirements: string[];
        keywords: string[];
        targetMarketplace: string;
        profitMargin: number;
        confidence: number;
        createdAt: string;
      };
      message: string;
    }>('POST', '/v1/dropship/generate', params);
  }

  async getDropshipDrafts() {
    return this.request<{
      drafts: Array<{
        id: string;
        productIdea: string;
        title: string;
        category: string;
        suggestedPrice: number;
        profitMargin: number;
        confidence: number;
        createdAt: string;
      }>;
      count: number;
    }>('GET', '/v1/dropship/drafts');
  }

  async getDropshipDraft(draftId: string) {
    return this.request<{ draft: any }>('GET', `/v1/dropship/drafts/${draftId}`);
  }

  async exportDropshipDraft(draftId: string) {
    return this.request<{ csv: string; downloadUrl: string }>('GET', `/v1/dropship/export/${draftId}`);
  }

  async exportAllDropshipDrafts() {
    return this.request<{ csv: string; count: number }>('GET', '/v1/dropship/export');
  }

  // ==========================================================================
  // Flip Pipeline
  // ==========================================================================
  async getFlips(status?: string) {
    const qs = status ? `?status=${status}` : '';
    return this.request<{
      flips: Array<any>;
      summary: { totalInvested: number; totalRevenue: number; totalFees: number; netProfit: number; count: number };
    }>('GET', `/v1/flips${qs}`);
  }

  async createFlip(params: { itemName: string; category?: string; source?: string; sourceUrl?: string; purchasePrice?: number; repairCost?: number; listingPrice?: number; notes?: string }) {
    return this.request<{ flip: any }>('POST', '/v1/flips', params);
  }

  async updateFlip(id: string, params: { status?: string; listingPrice?: number; soldPrice?: number; shippingCost?: number; platformFees?: number; repairCost?: number; notes?: string }) {
    return this.request<{ flip: any }>('PUT', `/v1/flips/${id}`, params);
  }

  async deleteFlip(id: string) {
    return this.request<{ deleted: boolean }>('DELETE', `/v1/flips/${id}`);
  }

  // ==========================================================================
  // Universal Decision Cards (Sprint Zero) — real eBay-backed Flip Cards
  // ==========================================================================

  /** Analyze a product into a real FLIP Decision Card (StoreBot + commercedata). */
  async analyzeFlipCard(params: {
    value: string;
    inputType?: 'description' | 'url';
    askingPrice?: number | null;
    condition?: string;
  }) {
    return this.request<{ card: DecisionCardDTO; persisted: boolean }>(
      'POST',
      '/v1/flips/analyze',
      params
    );
  }

  /** List the current user's Decision Cards (newest first). */
  async getCards(params?: { type?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<{ cards: DecisionCardDTO[]; count: number }>('GET', `/v1/cards${query}`);
  }

  /** Fetch a single Decision Card by ULID. */
  async getCard(id: string) {
    return this.request<{ card: DecisionCardDTO }>('GET', `/v1/cards/${id}`);
  }

  /** Record the real-world outcome of a Decision Card (Sprint Zero T9). */
  async updateCardOutcome(id: string, outcome: {
    status: 'EXECUTED' | 'SKIPPED' | 'CANCELLED';
    result?: unknown;
    actual_vs_expected?: string;
    lesson?: string;
  }) {
    return this.request<{ card: DecisionCardDTO }>('PATCH', `/v1/cards/${id}/outcome`, outcome);
  }

  // ==========================================================================
  // Nova Nexus Decision Infrastructure (Observe -> Decide -> Execute -> Learn)
  // ==========================================================================
  async observeOpportunity(opportunity: {
    title: string;
    category?: string;
    condition?: string;
    askingPrice: number;
    estimatedFees?: number;
    estimatedShipping?: number;
    estimatedRefurbishment?: number;
    estimatedStorage?: number;
    expectedHoldDays?: number;
    soldComps?: number[];
    location?: string;
    sourceType?: string;
    sourceUrl?: string;
    notes?: string;
  }) {
    return this.request<{
      cardId: string;
      opportunityId: string;
      decision: any;
      confidence: any;
      card: any;
      usage?: {
        plan: string;
        remaining: Record<string, number>;
        upgradeUrl?: string;
      };
    }>(
      'POST',
      '/v1/nexus/observe',
      { opportunity }
    );
  }

  async getNexusDecisionCard(cardId: string) {
    return this.request<{
      id: string;
      status: string;
      action: string;
      confidencePct: number;
      volatilityLevel: string;
      latestVersion: number;
      card: any;
      outcomes: any[];
      latestLearning: any;
      createdAt: string;
      updatedAt: string;
    }>('GET', `/v1/nexus/decision-cards/${cardId}`);
  }

  async executeNexusDecisionCard(cardId: string, payload: {
    action?: 'BUY' | 'SELL' | 'SKIP' | 'WAIT' | 'OFFER';
    offerPrice?: number;
    executionPayload?: Record<string, unknown>;
    status?: 'PLANNED' | 'EXECUTED' | 'FAILED' | 'CANCELLED';
  }) {
    return this.request<{ executionId: string; cardId: string; status: string }>(
      'POST',
      `/v1/nexus/decision-cards/${cardId}/execute`,
      payload
    );
  }

  async logNexusOutcome(cardId: string, payload: {
    executionId?: string;
    realizedSalePrice?: number;
    realizedTotalCost?: number;
    realizedNetProfit?: number;
    realizedHoldDays?: number;
    outcomeStatus?: 'PROFIT' | 'LOSS' | 'BREAKEVEN' | 'ABANDONED';
    notes?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.request<{ outcomeId: string; learningSnapshotId: string; learning: any; cardStatus: string }>(
      'POST',
      `/v1/nexus/decision-cards/${cardId}/outcome`,
      payload
    );
  }

  async getNexusLearning(cardId: string) {
    return this.request<{ cardId: string; snapshots: any[] }>(
      'GET',
      `/v1/nexus/decision-cards/${cardId}/learning`
    );
  }

  // ==========================================================================
  // Manifesto: Agent Engine
  // ==========================================================================
  async getAgentDefinitions() {
    return this.request<{ agents: Array<{ id: string; name: string; slug: string; sector: string; description: string; steps_template: any[]; risk_level: string; requires_mode: string; enabled: boolean }> }>('GET', '/v1/agents/definitions');
  }

  async runAgent(agentSlug: string, params: Record<string, unknown> = {}) {
    return this.request<{ runId: string; status: string; steps: any[]; resultSummary: any }>('POST', '/v1/agents/run', { agentSlug, params });
  }

  async getAgentRuns(limit = 20, offset = 0) {
    return this.request<{ runs: Array<any> }>('GET', `/v1/agents/runs?limit=${limit}&offset=${offset}`);
  }

  async getAgentRun(runId: string) {
    return this.request<{ run: any; steps: any[] }>('GET', `/v1/agents/runs/${runId}`);
  }

  async getAgentSchedules() {
    return this.request<{ schedules: Array<any> }>('GET', '/v1/agents/schedules');
  }

  async createAgentSchedule(agentSlug: string, cronExpression: string, params: Record<string, unknown> = {}, enabled = true) {
    return this.request<{ scheduleId: string }>('POST', '/v1/agents/schedules', { agentSlug, cronExpression, params, enabled });
  }

  // ==========================================================================
  // Manifesto: Usage Metering
  // ==========================================================================
  async getBillingUsage() {
    return this.request<{ period: { start: string; end: string }; meters: Array<{ type: string; consumed: number; included: number; remaining: number }>; totalEvents: number }>('GET', '/v1/billing/usage');
  }

  async getPricingTiers() {
    return this.request<{ tiers: Array<any> }>('GET', '/v1/billing/tiers');
  }

  // ==========================================================================
  // Manifesto: Outcome Tracking
  // ==========================================================================
  async getOutcomesSummary() {
    return this.request<{
      allTime: { totalValue: number; totalEvents: number; profit: number; loss: number; timeSavedMinutes: number };
      thisWeek: { totalValue: number; totalEvents: number; timeSavedMinutes: number };
      agentActivity: { runsThisWeek: number; completedThisWeek: number };
      sectorBreakdown: Record<string, { value: number; events: number }>;
      generatedAt: string;
    }>('GET', '/v1/outcomes/summary');
  }

  async getCalibration() {
    return this.request<{
      calibrated: boolean;
      tier?: 'early-training' | 'learning' | 'calibrated';
      sampleSize: number;
      meanPredictionBiasPct?: number;
      meanCalibrationErrorPct?: number;
      meanConfidenceDeltaPct?: number;
      message: string;
    }>('GET', '/v1/outcomes/calibration');
  }

  // ==========================================================================
  // Command Layer — Founder Enterprise Control
  // ==========================================================================
  async getCommandPulse() {
    return this.request<{
      revenue: { mrr: number; totalActiveSubscribers: number; totalUsers: number; byPlan: Record<string, { active: number; canceled: number; pastDue: number; trialing: number }> } | null;
      briefDelivery: { recentRuns: Array<{ job_name: string; status: string; duration_ms: number; created_at: string; details: any }>; totals: Record<string, number>; successRate: number | null } | null;
      outcomes: { byStatus: Record<string, { count: number; avgPnl: number }>; totalTracked: number; resolved: number; winRate: number | null; wins: number; losses: number } | null;
      calibration: { metrics: Array<any> } | null;
      scheduler: { recentRuns: Array<{ job_name: string; status: string; duration_ms: number; created_at: string }> } | null;
      deployment: { version: string; nodeVersion: string; uptime: number; env: string } | null;
      threats: { recentFailures: Array<any>; pastDueSubscriptions: number } | null;
      opportunities: { decisionCardsThisWeek: number; newUsersThisWeek: number } | null;
      _meta: { generatedAt: string; durationMs: number; errors?: string[] };
    }>('GET', '/v1/command/pulse');
  }

  async postCommandReview(review: { wins?: string; losses?: string; decisions?: string; nextPriorities?: string; notes?: string }) {
    return this.request<{ reviewId: string }>('POST', '/v1/command/review', review);
  }

  async triggerSchedulerJob(job: 'brief' | 'outcomes' | 'health') {
    return this.request<{ success: boolean; message?: string; data?: any }>('POST', `/v1/scheduler/trigger/${job}`);
  }

  async getSchedulerStatus() {
    return this.request<{
      uptime: number;
      schedulesActive: boolean;
      healthMonitorActive: boolean;
      recentRuns: Array<any>;
      serviceHealth: Array<{ service: string; url: string; status: string; responseTimeMs: number; statusCode: number | null; error: string | null }>;
    }>('GET', '/v1/scheduler/status');
  }

  async getSchedulerHistory() {
    return this.request<{ runs: Array<any> }>('GET', '/v1/scheduler/history');
  }

  async logCommandAction(actionType: string, target: string, result: string, details?: Record<string, any>) {
    return this.request<{ actionId: string }>('POST', '/v1/command/action', { actionType, target, result, details });
  }

  async getCommandReviews() {
    return this.request<{ reviews: Array<any> }>('GET', '/v1/command/reviews');
  }

  async getCommandGovernance() {
    return this.request<{ governance: Array<any>; computedAt: string }>('GET', '/v1/command/governance');
  }

  async setGovernanceOverride(setupType: string, status: 'eligible' | 'watch' | 'quarantine', reason?: string) {
    return this.request<{ setupType: string; status: string; manualOverride: boolean }>(
      'POST', `/v1/command/governance/${encodeURIComponent(setupType)}`, { status, reason }
    );
  }

  // ==========================================================================
  // Dashboard — Aggregate stats
  // ==========================================================================
  // ==========================================================================
  // Marketplace Scanner — Active Opportunity Discovery
  // ==========================================================================

  /** Run a live Craigslist scan for flip opportunities. May take up to 60s. */
  async runScanner(params?: {
    cities?: string[];
    maxPrice?: number;
    minPrice?: number;
    minProfit?: number;
    minConfidence?: number;
    maxResults?: number;
  }) {
    return this.request<{
      summary: {
        totalFetched: number;
        totalEvaluated: number;
        opportunitiesFound: number;
        decisionCardsCreated: number;
        durationMs: number;
        ranAt: string;
        cities: string[];
      };
      opportunities: ScanOpportunity[];
    }>('POST', '/v1/scanner/run', params || {});
  }

  /** Fetch scanner-generated opportunities from the last 48 hours. */
  async getScannerOpportunities(params?: {
    limit?: number;
    minConfidence?: number;
    action?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (typeof params?.minConfidence === 'number') qs.set('minConfidence', String(params.minConfidence));
    if (params?.action && params.action !== 'all') qs.set('action', params.action);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<{
      opportunities: ScanOpportunity[];
      count: number;
      note?: string;
    }>('GET', `/v1/scanner/opportunities${query}`);
  }

  async getDashboardStats() {
    return this.request<{
      sectors: {
        wallStreet?: { activeSignals: number; openTrades: number; portfolioValue: number | null; marketOpen: boolean };
        marketplace?: { appraisalsToday: number; trendingCategories: number };
        social?: { contentDrafts: number; scheduledPosts: number };
        research?: { eventsToday: number };
        ops?: { systemHealthy: boolean };
      };
      performance: { totalTrades: number; winRate: number; winCount: number };
      updatedAt: string;
    }>('GET', '/v1/dashboard/stats');
  }
}

export const api = new ApiClient();
export type { ApiResponse };
