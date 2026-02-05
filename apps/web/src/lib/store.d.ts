interface User {
    id: string;
    email: string;
    status: string;
    role?: string;
    createdAt?: string;
}
interface Org {
    id: string;
    name: string;
}
interface AuthState {
    user: User | null;
    org: Org | null;
    scopes: string[];
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    register: (email: string, password: string, orgName?: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
    logout: () => Promise<void>;
    loadUser: () => Promise<void>;
    hasScope: (scope: string) => boolean;
}
export declare const useAuthStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AuthState>>;
interface DashboardState {
    stats: {
        goals: Record<string, number>;
        tasks: Record<string, number>;
        pendingApprovals: number;
        killSwitch: {
            enabled: boolean;
            enabledAt?: string;
            reason?: string;
        };
    } | null;
    isLoading: boolean;
    error: string | null;
    loadStats: () => Promise<void>;
}
export declare const useDashboardStore: import("zustand").UseBoundStore<import("zustand").StoreApi<DashboardState>>;
interface KillSwitchState {
    status: {
        enabled: boolean;
        enabledAt?: string;
        enabledBy?: string;
        reason?: string;
    } | null;
    isLoading: boolean;
    loadStatus: () => Promise<void>;
    toggle: (enable: boolean, reason?: string) => Promise<{
        success: boolean;
        error?: string;
    }>;
}
export declare const useKillSwitchStore: import("zustand").UseBoundStore<import("zustand").StoreApi<KillSwitchState>>;
export {};
