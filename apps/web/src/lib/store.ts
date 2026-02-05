import { create } from 'zustand';
import { api } from './api';

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
  
  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, orgName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  hasScope: (scope: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  org: null,
  scopes: [],
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    const result = await api.login(email, password);
    
    if (result.success && result.data) {
      api.setTokens(result.data.accessToken, result.data.refreshToken);
      
      // Fetch full user info
      const meResult = await api.getMe();
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

  register: async (email: string, password: string, orgName?: string) => {
    const result = await api.register(email, password, orgName);
    
    if (result.success && result.data) {
      api.setTokens(result.data.accessToken, result.data.refreshToken);
      
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
    await api.logout();
    set({
      user: null,
      org: null,
      scopes: [],
      isAuthenticated: false,
      isLoading: false,
    });
  },

  loadUser: async () => {
    if (!api.isAuthenticated()) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    
    const result = await api.getMe();
    
    if (result.success && result.data) {
      set({
        user: { ...result.data.user, role: result.data.role },
        org: result.data.org,
        scopes: result.data.scopes,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      api.clearTokens();
      set({
        user: null,
        org: null,
        scopes: [],
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  hasScope: (scope: string) => {
    return get().scopes.includes(scope);
  },
}));

// Dashboard stats store
interface DashboardState {
  stats: {
    goals: Record<string, number>;
    tasks: Record<string, number>;
    pendingApprovals: number;
    killSwitch: { enabled: boolean; enabledAt?: string; reason?: string };
  } | null;
  isLoading: boolean;
  error: string | null;
  loadStats: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  isLoading: false,
  error: null,

  loadStats: async () => {
    set({ isLoading: true, error: null });
    
    const result = await api.getStats();
    
    if (result.success && result.data) {
      set({ stats: result.data, isLoading: false });
    } else {
      set({ error: result.error?.message || 'Failed to load stats', isLoading: false });
    }
  },
}));

// Kill switch store
interface KillSwitchState {
  status: { enabled: boolean; enabledAt?: string; enabledBy?: string; reason?: string } | null;
  isLoading: boolean;
  loadStatus: () => Promise<void>;
  toggle: (enable: boolean, reason?: string) => Promise<{ success: boolean; error?: string }>;
}

export const useKillSwitchStore = create<KillSwitchState>((set) => ({
  status: null,
  isLoading: false,

  loadStatus: async () => {
    set({ isLoading: true });
    const result = await api.getKillSwitchStatus();
    if (result.success && result.data) {
      set({ status: result.data, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  toggle: async (enable: boolean, reason?: string) => {
    const result = enable 
      ? await api.enableKillSwitch(reason)
      : await api.disableKillSwitch();
    
    if (result.success && result.data) {
      set({ status: result.data });
      return { success: true };
    }
    
    return { success: false, error: result.error?.message };
  },
}));
