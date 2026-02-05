"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useKillSwitchStore = exports.useDashboardStore = exports.useAuthStore = void 0;
const zustand_1 = require("zustand");
const api_1 = require("./api");
exports.useAuthStore = (0, zustand_1.create)((set, get) => ({
    user: null,
    org: null,
    scopes: [],
    isLoading: true,
    isAuthenticated: false,
    login: async (email, password) => {
        const result = await api_1.api.login(email, password);
        if (result.success && result.data) {
            api_1.api.setTokens(result.data.accessToken, result.data.refreshToken);
            // Fetch full user info
            const meResult = await api_1.api.getMe();
            if (meResult.success && meResult.data) {
                set({
                    user: { ...meResult.data.user, role: meResult.data.role },
                    org: meResult.data.org,
                    scopes: meResult.data.scopes,
                    isAuthenticated: true,
                    isLoading: false,
                });
            }
            return { success: true };
        }
        return { success: false, error: result.error?.message || 'Login failed' };
    },
    register: async (email, password, orgName) => {
        const result = await api_1.api.register(email, password, orgName);
        if (result.success && result.data) {
            api_1.api.setTokens(result.data.accessToken, result.data.refreshToken);
            set({
                user: result.data.user,
                org: result.data.org,
                scopes: [], // Will be populated on loadUser
                isAuthenticated: true,
                isLoading: false,
            });
            // Load full user data
            await get().loadUser();
            return { success: true };
        }
        return { success: false, error: result.error?.message || 'Registration failed' };
    },
    logout: async () => {
        await api_1.api.logout();
        set({
            user: null,
            org: null,
            scopes: [],
            isAuthenticated: false,
            isLoading: false,
        });
    },
    loadUser: async () => {
        if (!api_1.api.isAuthenticated()) {
            set({ isLoading: false, isAuthenticated: false });
            return;
        }
        const result = await api_1.api.getMe();
        if (result.success && result.data) {
            set({
                user: { ...result.data.user, role: result.data.role },
                org: result.data.org,
                scopes: result.data.scopes,
                isAuthenticated: true,
                isLoading: false,
            });
        }
        else {
            api_1.api.clearTokens();
            set({
                user: null,
                org: null,
                scopes: [],
                isAuthenticated: false,
                isLoading: false,
            });
        }
    },
    hasScope: (scope) => {
        return get().scopes.includes(scope);
    },
}));
exports.useDashboardStore = (0, zustand_1.create)((set) => ({
    stats: null,
    isLoading: false,
    error: null,
    loadStats: async () => {
        set({ isLoading: true, error: null });
        const result = await api_1.api.getStats();
        if (result.success && result.data) {
            set({ stats: result.data, isLoading: false });
        }
        else {
            set({ error: result.error?.message || 'Failed to load stats', isLoading: false });
        }
    },
}));
exports.useKillSwitchStore = (0, zustand_1.create)((set) => ({
    status: null,
    isLoading: false,
    loadStatus: async () => {
        set({ isLoading: true });
        const result = await api_1.api.getKillSwitchStatus();
        if (result.success && result.data) {
            set({ status: result.data, isLoading: false });
        }
        else {
            set({ isLoading: false });
        }
    },
    toggle: async (enable, reason) => {
        const result = enable
            ? await api_1.api.enableKillSwitch(reason)
            : await api_1.api.disableKillSwitch();
        if (result.success && result.data) {
            set({ status: result.data });
            return { success: true };
        }
        return { success: false, error: result.error?.message };
    },
}));
