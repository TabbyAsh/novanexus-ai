interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
    meta?: {
        page?: number;
        pageSize?: number;
        total?: number;
    };
}
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
type GuidedFlowResponse = {
    flow: {
        thesis: any;
        decisionCard: any;
        gate: any;
        analytics: {
            depth: number;
            locked: boolean;
            reason?: string | null;
        };
    };
    usage?: {
        plan: string;
        remaining: Record<string, number>;
        upgradeUrl?: string;
    };
};
declare class ApiClient {
    private accessToken;
    private refreshToken;
    constructor();
    setTokens(accessToken: string, refreshToken: string): void;
    clearTokens(): void;
    getAccessToken(): string | null;
    isAuthenticated(): boolean;
    private request;
    private refreshAccessToken;
    register(email: string, password: string, orgName?: string): Promise<ApiResponse<{
        user: {
            id: string;
            email: string;
            status: string;
        };
        org: {
            id: string;
            name: string;
        };
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>>;
    login(email: string, password: string): Promise<ApiResponse<{
        user: {
            id: string;
            email: string;
            status: string;
            role: string;
        };
        orgId: string;
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>>;
    logout(): Promise<ApiResponse<unknown>>;
    getMe(): Promise<ApiResponse<{
        user: {
            id: string;
            email: string;
            status: string;
            createdAt: string;
        };
        org: {
            id: string;
            name: string;
        } | null;
        role: string;
        scopes: string[];
    }>>;
    getUsage(): Promise<ApiResponse<UsageSnapshot>>;
    startGuidedFlow(input: {
        signal: Record<string, unknown>;
    } | Record<string, unknown>): Promise<ApiResponse<GuidedFlowResponse>>;
    getStats(): Promise<ApiResponse<{
        goals: Record<string, number>;
        tasks: Record<string, number>;
        pendingApprovals: number;
        killSwitch: {
            enabled: boolean;
            enabledAt?: string;
            reason?: string;
        };
    }>>;
    getGoals(status?: string): Promise<ApiResponse<{
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
    }>>;
    createGoal(title: string, intent: string, constraints?: Record<string, unknown>): Promise<ApiResponse<{
        goal: {
            id: string;
            title: string;
            intent: string;
            status: string;
        };
    }>>;
    updateGoalStatus(goalId: string, status: string): Promise<ApiResponse<{
        goalId: string;
        status: string;
    }>>;
    getTasks(goalId?: string, status?: string): Promise<ApiResponse<{
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
    }>>;
    getApprovals(status?: string): Promise<ApiResponse<{
        approvals: Array<{
            id: string;
            taskId: string;
            requiredRole: string;
            status: string;
            requestedAt: string;
            resolvedAt?: string;
        }>;
    }>>;
    approveApproval(approvalId: string): Promise<ApiResponse<{
        approvalId: string;
        status: string;
    }>>;
    rejectApproval(approvalId: string, reason?: string): Promise<ApiResponse<{
        approvalId: string;
        status: string;
    }>>;
    getKillSwitchStatus(): Promise<ApiResponse<{
        enabled: boolean;
        enabledAt?: string;
        enabledBy?: string;
        reason?: string;
    }>>;
    enableKillSwitch(reason?: string): Promise<ApiResponse<{
        enabled: boolean;
        enabledAt: string;
        enabledBy: string;
        reason?: string;
    }>>;
    disableKillSwitch(): Promise<ApiResponse<{
        enabled: boolean;
    }>>;
    getRecentEvents(limit?: number): Promise<ApiResponse<{
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
    }>>;
    getEventStats(): Promise<ApiResponse<{
        total: number;
        last24Hours: number;
        byType: Array<{
            type: string;
            count: number;
        }>;
    }>>;
    verifyEventChain(): Promise<ApiResponse<{
        valid: boolean;
        eventCount: number;
        brokenAt?: string;
        brokenReason?: string;
        lastHash: string;
    }>>;
    queryEvents(params: {
        limit?: number;
        offset?: number;
        type?: string;
        actor?: string;
    }): Promise<ApiResponse<{
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
    }>>;
    updateTask(taskId: string, status: string): Promise<ApiResponse<{
        taskId: string;
        status: string;
    }>>;
    decideApproval(approvalId: string, approved: boolean, reason?: string): Promise<ApiResponse<{
        approvalId: string;
        status: string;
    }>>;
    getBots(type?: string, status?: string): Promise<ApiResponse<{
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
    }>>;
    runScan(watchlistId?: string, filters?: {
        minScore?: number;
        signals?: string[];
    }): Promise<ApiResponse<{
        results: Array<{
            symbol: string;
            signal: string;
            score: number;
            indicators: Record<string, unknown>;
            integrity?: CandleIntegrity;
            quote: {
                symbol: string;
                price: number;
                change: number;
                changePercent: number;
                volume: number;
            };
        }>;
        scannedAt: string;
    }>>;
    runScreener(params?: {
        symbols?: string[];
        maxSymbols?: number;
        minConfidence?: number;
        signalType?: 'all' | 'bullish' | 'bearish';
        save?: boolean;
        name?: string;
    }): Promise<ApiResponse<{
        signals: any[];
        scannedAt: string;
        reportId?: string;
    }>>;
    saveScreenerReport(params: {
        name?: string;
        signals: any[];
        settings?: any;
        scannedAt?: string;
    }): Promise<ApiResponse<{
        reportId: string;
        scannedAt: string;
    }>>;
    getScreenerReports(): Promise<ApiResponse<{
        reports: any[];
    }>>;
    getScreenerReport(reportId: string): Promise<ApiResponse<{
        report: any;
    }>>;
    getDecisions(params?: {
        status?: string;
        symbol?: string;
        limit?: number;
        offset?: number;
    }): Promise<ApiResponse<{
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
    }>>;
    createDecision(params: {
        symbol: string;
        direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
        intent: string;
        constraints?: Record<string, unknown>;
        rationale?: Record<string, unknown>;
        journalEntryId?: string | null;
        source?: string;
    }): Promise<ApiResponse<{
        decision: any;
    }>>;
    appendDecisionEvent(decisionId: string, eventType: string, payload?: Record<string, unknown>): Promise<ApiResponse<{
        event: {
            decisionId: string;
            eventType: string;
            seq: number;
        };
    }>>;
    replayDecision(decisionId: string): Promise<ApiResponse<{
        decision: any;
        events: any[];
    }>>;
    getDecisionCards(params?: {
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
    }): Promise<ApiResponse<{
        cards: any[];
        analyticsDepth?: number;
    }>>;
    getDecisionCard(cardId: string): Promise<ApiResponse<{
        card: any;
        analyticsDepth?: number;
    }>>;
    replayDecisionCard(cardId: string): Promise<ApiResponse<{
        cardId: string;
        stored: any;
        recomputed: any;
        drift: any;
    }>>;
    runStrategySimulation(params: {
        symbol: string;
        strategyType: string;
        strategyTag?: string;
        startDate?: string;
        endDate?: string;
        initialCapital?: number;
        params?: Record<string, number>;
    }): Promise<ApiResponse<{
        simulation: any;
        performance: any;
        window: any;
        analyticsDepth?: number;
        disclaimer?: string;
    }>>;
    getStrategyPerformance(params?: {
        symbol?: string;
        strategyTag?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<ApiResponse<{
        strategies: any[];
        analyticsDepth?: number;
    }>>;
    getStrategyPerformanceDetail(id: string): Promise<ApiResponse<{
        strategy: any;
    }>>;
    getTheses(): Promise<ApiResponse<{
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
    }>>;
    createThesis(input: string | {
        symbol: string;
        entryPrice?: number;
        targetPrice?: number;
        stopLoss?: number;
        direction?: string;
        signal?: string;
        confidence?: number;
        reasoning?: string | string[];
        decisionCardId?: string | null;
    }): Promise<ApiResponse<{
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
    }>>;
    getPaperTrades(): Promise<ApiResponse<{
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
        portfolio: {
            cash: number;
            positions: Record<string, number>;
        };
    }>>;
    createPaperTrade(thesisId: string, quantity: number): Promise<ApiResponse<{
        trade: Record<string, unknown>;
    }>>;
    closePaperTrade(tradeId: string): Promise<ApiResponse<{
        trade: Record<string, unknown>;
    }>>;
    getAlpacaStatus(): Promise<ApiResponse<{
        connected: boolean;
        endpoint?: string;
        environment?: 'paper' | 'live';
        keyLast4?: string | null;
        lastVerifiedAt?: string | null;
    }>>;
    connectAlpaca(params: {
        apiKey: string;
        apiSecret: string;
        environment?: 'paper' | 'live';
        endpoint?: string;
    }): Promise<ApiResponse<{
        connected: boolean;
        endpoint: string;
        environment: 'paper' | 'live';
        keyLast4?: string;
        accountNumber?: string;
    }>>;
    disconnectAlpaca(): Promise<ApiResponse<{
        disconnected: boolean;
    }>>;
    getAlpacaAccount(): Promise<ApiResponse<{
        account: any;
    }>>;
    getAlpacaPositions(): Promise<ApiResponse<{
        positions: any[];
    }>>;
    getAlpacaOrders(status?: 'open' | 'closed' | 'all'): Promise<ApiResponse<{
        orders: any[];
    }>>;
    placeAlpacaOrder(params: {
        symbol: string;
        qty: number;
        side: 'buy' | 'sell';
        type?: string;
    }): Promise<ApiResponse<{
        order: any;
    }>>;
    getAlpacaHistory(params?: {
        period?: string;
        timeframe?: string;
    }): Promise<ApiResponse<{
        period: string;
        timeframe: string;
        plan: string;
        history: Array<{
            timestamp: string;
            equity: number;
            profitLoss: number;
            profitLossPct: number;
        }>;
    }>>;
    getProducts(): Promise<ApiResponse<{
        products: Array<{
            id: string;
            sku: string;
            title: string;
            status: string;
            meta: Record<string, unknown>;
            createdAt: string;
        }>;
    }>>;
    getInventoryAlerts(): Promise<ApiResponse<{
        alerts: Array<{
            id: string;
            productId: string;
            sku: string;
            title: string;
            alertType: string;
            message: string;
            severity: string;
            createdAt: string;
        }>;
    }>>;
    getPricingRecommendations(): Promise<ApiResponse<{
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
    }>>;
    getPosts(): Promise<ApiResponse<{
        posts: Array<{
            id: string;
            channel: string;
            title: string;
            status: string;
            scheduledAt?: string;
            publishedAt?: string;
            createdAt: string;
        }>;
    }>>;
    getSentimentAnalysis(): Promise<ApiResponse<{
        analysis: {
            overall: string;
            score: number;
            breakdown: {
                positive: number;
                neutral: number;
                negative: number;
            };
            trending: string[];
        };
    }>>;
    getEngagementMetrics(): Promise<ApiResponse<{
        metrics: {
            totalViews: number;
            totalLikes: number;
            totalComments: number;
            totalShares: number;
            averageEngagementRate: number;
            topPosts: Array<{
                id: string;
                title: string;
                engagementRate: number;
            }>;
        };
    }>>;
    getSocialAlerts(): Promise<ApiResponse<{
        alerts: Array<{
            id: string;
            type: string;
            message: string;
            severity: string;
            createdAt: string;
        }>;
    }>>;
    createTask(goalId: string, type: string, assignedToBot: string, input?: Record<string, unknown>): Promise<ApiResponse<{
        task: {
            id: string;
            type: string;
            status: string;
        };
    }>>;
}
export declare const api: ApiClient;
export type { ApiResponse };
