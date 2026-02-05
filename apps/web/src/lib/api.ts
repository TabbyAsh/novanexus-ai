// ==========================================================================
// DYNAMIC API URL RESOLUTION - Called at request time, not module load
// ==========================================================================
// This MUST be a function called at request time because:
// 1. During SSR, window is undefined
// 2. Module-level code runs on server first and gets cached
// 3. We need to detect the actual runtime environment

function getApiBase(): string {
  // Explicit env var always wins
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Client-side: detect from current URL
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Production domains
    if (hostname === 'novanexus-ai.com' || 
        hostname === 'www.novanexus-ai.com' ||
        hostname.endsWith('.vercel.app')) {
      return 'https://api.novanexus-ai.com';
    }
  }
  
  // Development fallback
  return 'http://localhost:3000';
}

function isProductionEnv(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'novanexus-ai.com' || 
         hostname === 'www.novanexus-ai.com' ||
         hostname.endsWith('.vercel.app');
}

function getTradebotUrl(): string {
  return isProductionEnv() ? getApiBase() : 'http://localhost:3010';
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  meta?: { page?: number; pageSize?: number; total?: number };
}

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
    options?: { skipAuth?: boolean }
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

      const data = await response.json();

      // Handle token expiry
      if (response.status === 401 && this.refreshToken && !options?.skipAuth) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry the request with new token
          return this.request(method, path, body, options);
        }
      }

      return data;
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

      const data = await response.json();

      if (data.success && data.data) {
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
        change: number;
        changePercent: number;
        volume: number;
        bid: number;
        ask: number;
        timestamp: string;
        source: string;
      };
    }>('GET', `/v1/market/quote/${symbol}`);
  }

  async getMarketQuotes(symbols: string[]) {
    return this.request<{
      quotes: Array<{
        symbol: string;
        price: number;
        change: number;
        changePercent: number;
        volume: number;
        timestamp: string;
      }>;
    }>('POST', '/v1/market/quotes', { symbols });
  }

  async getMarketIndicators(symbol: string) {
    return this.request<{
      indicators: {
        symbol: string;
        rsi: number;
        sma20: number;
        sma50: number;
        sma200: number;
        macd: { value: number; signal: number; histogram: number };
        vwap: number;
      };
    }>('GET', `/v1/market/indicators/${symbol}`);
  }

  async getWatchlistQuotes(watchlistId: string = 'default') {
    return this.tradebotRequest<{
      watchlist: { id: string; name: string; symbols: string[] };
      quotes: Array<{
        symbol: string;
        price: number;
        change: number;
        changePercent: number;
        volume: number;
      }>;
    }>('GET', `/api/watchlists/${watchlistId}/quotes`);
  }

  // Watchlist management
  async addToWatchlist(watchlistId: string, symbol: string) {
    return this.tradebotRequest<{ watchlist: any }>(
      'POST',
      `/api/watchlists/${watchlistId}/symbols`,
      { symbol }
    );
  }

  async removeFromWatchlist(watchlistId: string, symbol: string) {
    return this.tradebotRequest<{ watchlist: any }>(
      'DELETE',
      `/api/watchlists/${watchlistId}/symbols/${symbol}`
    );
  }

  // Create paper trade from signal directly
  async createPaperTradeFromSignal(signal: {
    symbol: string;
    type: 'bullish' | 'bearish';
    entry: number;
    target: number;
    stopLoss: number;
  }, quantity: number = 10) {
    // First create a thesis
    const thesisResult = await this.tradebotRequest<{ thesis: any }>(
      'POST',
      '/api/theses',
      { symbol: signal.symbol }
    );
    if (!thesisResult.success || !thesisResult.data?.thesis) {
      return { success: false, error: { code: 'THESIS_FAILED', message: 'Failed to create thesis' } };
    }
    // Then open a paper trade
    return this.tradebotRequest<{ trade: any }>(
      'POST',
      '/api/trades',
      { thesisId: thesisResult.data.thesis.id, quantity }
    );
  }

  // Trade endpoints
  async runScan(watchlistId?: string, filters?: { minScore?: number; signals?: string[] }) {
    return this.request<{
      results: Array<{
        symbol: string;
        signal: string;
        score: number;
        indicators: Record<string, unknown>;
        quote: { symbol: string; price: number; change: number; changePercent: number; volume: number };
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
      }>;
    }>('GET', '/v1/trade/theses');
  }

  async createThesis(symbol: string) {
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
      };
    }>('POST', '/v1/trade/theses', { symbol });
  }

  async getPaperTrades() {
    return this.request<{
      trades: Array<{
        id: string;
        thesisId: string;
        symbol: string;
        side: string;
        quantity: number;
        entryPrice: number;
        currentPrice?: number;
        exitPrice?: number;
        status: string;
        pnl?: number;
        pnlPercent?: number;
        openedAt: string;
        closedAt?: string;
      }>;
      stats: {
        totalTrades: number;
        openTrades: number;
        closedTrades: number;
        winRate: number;
        totalPnl: number;
        portfolioValue: number;
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
  // Tradebot Direct Endpoints
  // ==========================================================================

  private async tradebotRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    try {
      const isProd = isProductionEnv();
      const baseUrl = getTradebotUrl();
      // In production, convert /api/* to /v1/* for gateway
      const finalPath = isProd ? path.replace('/api/', '/v1/').replace('/api', '/v1') : path;
      const response = await fetch(`${baseUrl}${finalPath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await response.json();
    } catch (error) {
      console.error('Tradebot request failed:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network request failed' } };
    }
  }

  // Alpaca Trading
  async getAlpacaStatus() {
    return this.tradebotRequest<{ enabled: boolean; mode: string }>('GET', '/api/alpaca/status');
  }

  async getAlpacaAccount() {
    return this.tradebotRequest<{ account: any }>('GET', '/api/alpaca/account');
  }

  async getAlpacaPositions() {
    return this.tradebotRequest<{ positions: any[] }>('GET', '/api/alpaca/positions');
  }

  async getAlpacaOrders(status: 'open' | 'closed' | 'all' = 'all') {
    return this.tradebotRequest<{ orders: any[] }>('GET', `/api/alpaca/orders?status=${status}`);
  }

  async placeAlpacaOrder(params: { symbol: string; qty: number; side: 'buy' | 'sell'; type?: string }) {
    return this.tradebotRequest<{ order: any }>('POST', '/api/alpaca/orders', {
      ...params,
      type: params.type || 'market',
      time_in_force: 'day',
    });
  }

  // Market Scanner
  async scanMarket(watchlistId: string = 'default', filters?: any) {
    return this.tradebotRequest<{ results: any[]; scannedAt: string }>('POST', '/api/scan', { watchlistId, filters });
  }

  async getWatchlists() {
    return this.tradebotRequest<{ watchlists: any[] }>('GET', '/api/watchlists');
  }

  // AI Screener
  async getAIScreenerStatus() {
    return this.tradebotRequest<{ ready: boolean; openai: boolean; polygon: boolean }>('GET', '/api/ai-screener/status');
  }

  async runAIScreener(params?: { maxStocks?: number; minConfidence?: number; signalType?: string }) {
    return this.tradebotRequest<{ signals: any[]; count: number }>('POST', '/api/ai-screener/scan', params || {});
  }

  async analyzeStockWithAI(symbol: string) {
    return this.tradebotRequest<{ stock: any; indicators: any; signal: any }>('POST', '/api/ai-screener/analyze', { symbol });
  }

  // Nova Nexus AI
  async getNexusStatus() {
    return this.tradebotRequest<{ status: any }>('GET', '/api/nexus/status');
  }

  async initializeNexus() {
    return this.tradebotRequest<{ message: string; status: any }>('POST', '/api/nexus/initialize');
  }

  async analyzeTradeWithNexus(params: { symbol: string; signal: string; price: number; indicators?: any; confidence?: number }) {
    return this.tradebotRequest<{ decision: any; card: any; message: string }>('POST', '/api/nexus/analyze', params);
  }

  async executeNexusTrade(params: { symbol: string; signal: string; price: number; autoExecute?: boolean }) {
    return this.tradebotRequest<{ result: any; message: string }>('POST', '/api/nexus/execute', params);
  }

  async runAutonomousScan(params?: { watchlistId?: string; maxTrades?: number }) {
    return this.tradebotRequest<{ scanned: number; opportunities: number; executions: any[] }>('POST', '/api/nexus/autonomous-scan', params || {});
  }

  async getNexusLedger(limit: number = 50) {
    return this.tradebotRequest<{ ledger: any[] }>('GET', `/api/nexus/ledger?limit=${limit}`);
  }

  // Thesis Generation
  async generateThesis(symbol: string) {
    return this.tradebotRequest<{ thesis: any }>('POST', '/api/thesis/generate', { symbol });
  }

  async getActiveTheses() {
    return this.tradebotRequest<{ theses: any[] }>('GET', '/api/theses');
  }
}

export const api = new ApiClient();
export type { ApiResponse };
