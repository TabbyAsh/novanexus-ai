/* eslint-env browser */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
class ApiClient {
    accessToken = null;
    refreshToken = null;
    constructor() {
        if (typeof window !== 'undefined') {
            this.accessToken = localStorage.getItem('nova_access_token');
            this.refreshToken = localStorage.getItem('nova_refresh_token');
        }
    }
    setTokens(accessToken, refreshToken) {
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
    async request(method, path, body, options) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.accessToken && !options?.skipAuth) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }
        try {
            const response = await fetch(`${API_BASE}${path}`, {
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
        }
        catch (error) {
            console.error('API request failed:', error);
            return {
                success: false,
                error: { code: 'NETWORK_ERROR', message: 'Network request failed' },
            };
        }
    }
    async refreshAccessToken() {
        try {
            const response = await fetch(`${API_BASE}/v1/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken }),
            });
            const data = await response.json();
            if (data.success && data.data) {
                this.setTokens(data.data.accessToken, data.data.refreshToken);
                return true;
            }
        }
        catch (error) {
            console.error('Token refresh failed:', error);
        }
        this.clearTokens();
        return false;
    }
    // Auth endpoints
    async register(email, password, orgName) {
        return this.request('POST', '/v1/auth/register', { email, password, orgName }, { skipAuth: true });
    }
    async login(email, password) {
        return this.request('POST', '/v1/auth/login', { email, password }, { skipAuth: true });
    }
    async logout() {
        const result = await this.request('POST', '/v1/auth/logout');
        this.clearTokens();
        return result;
    }
    async getMe() {
        return this.request('GET', '/v1/me');
    }
    // Orchestrator endpoints
    async getStats() {
        return this.request('GET', '/v1/stats');
    }
    async getGoals(status) {
        const query = status ? `?status=${status}` : '';
        return this.request('GET', `/v1/goals${query}`);
    }
    async createGoal(title, intent, constraints) {
        return this.request('POST', '/v1/goals', { title, intent, constraints });
    }
    async updateGoalStatus(goalId, status) {
        return this.request('PATCH', `/v1/goals/${goalId}/status`, { status });
    }
    async getTasks(goalId, status) {
        const params = new URLSearchParams();
        if (goalId)
            params.append('goalId', goalId);
        if (status)
            params.append('status', status);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request('GET', `/v1/tasks${query}`);
    }
    async getApprovals(status = 'PENDING') {
        return this.request('GET', `/v1/approvals?status=${status}`);
    }
    async approveApproval(approvalId) {
        return this.request('POST', `/v1/approvals/${approvalId}/approve`);
    }
    async rejectApproval(approvalId, reason) {
        return this.request('POST', `/v1/approvals/${approvalId}/reject`, { reason });
    }
    // Kill switch
    async getKillSwitchStatus() {
        return this.request('GET', '/v1/kill-switch/status');
    }
    async enableKillSwitch(reason) {
        return this.request('POST', '/v1/kill-switch/enable', { reason });
    }
    async disableKillSwitch() {
        return this.request('POST', '/v1/kill-switch/disable');
    }
    // Events
    async getRecentEvents(limit = 50) {
        return this.request('GET', `/v1/events/recent?limit=${limit}`);
    }
    async getEventStats() {
        return this.request('GET', '/v1/events/stats');
    }
    async verifyEventChain() {
        return this.request('GET', '/v1/events/chain/verify');
    }
    async queryEvents(params) {
        return this.request('POST', '/v1/events/query', params);
    }
    async updateTask(taskId, status) {
        return this.request('PATCH', `/v1/tasks/${taskId}/status`, { status });
    }
    async decideApproval(approvalId, approved, reason) {
        const endpoint = approved
            ? `/v1/approvals/${approvalId}/approve`
            : `/v1/approvals/${approvalId}/reject`;
        return this.request('POST', endpoint, reason ? { reason } : undefined);
    }
    // Bot endpoints
    async getBots(type, status) {
        const params = new URLSearchParams();
        if (type)
            params.append('type', type);
        if (status)
            params.append('status', status);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request('GET', `/v1/bots${query}`);
    }
    // Trade endpoints
    async runScan(watchlistId, filters) {
        return this.request('POST', '/v1/trade/scan', { watchlistId, filters });
    }
    async getTheses() {
        return this.request('GET', '/v1/trade/theses');
    }
    async createThesis(symbol) {
        return this.request('POST', '/v1/trade/theses', { symbol });
    }
    async getPaperTrades() {
        return this.request('GET', '/v1/trade/paper-trades');
    }
    async createPaperTrade(thesisId, quantity) {
        return this.request('POST', '/v1/trade/paper-trades', { thesisId, quantity });
    }
    async closePaperTrade(tradeId) {
        return this.request('POST', `/v1/trade/paper-trades/${tradeId}/close`);
    }
    // Store endpoints
    async getProducts() {
        return this.request('GET', '/v1/store/products');
    }
    async getInventoryAlerts() {
        return this.request('GET', '/v1/store/alerts');
    }
    async getPricingRecommendations() {
        return this.request('GET', '/v1/store/pricing-recommendations');
    }
    // Social endpoints
    async getPosts() {
        return this.request('GET', '/v1/social/posts');
    }
    async getSentimentAnalysis() {
        return this.request('GET', '/v1/social/sentiment');
    }
    async getEngagementMetrics() {
        return this.request('GET', '/v1/social/engagement');
    }
    async getSocialAlerts() {
        return this.request('GET', '/v1/social/alerts');
    }
    // Task creation for bot workflows
    async createTask(goalId, type, assignedToBot, input) {
        return this.request('POST', '/v1/tasks', { goalId, type, assignedToBot, input });
    }
}
exports.api = new ApiClient();
