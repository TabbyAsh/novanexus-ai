'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Shield,
  AlertTriangle,
  User,
} from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';

type MeView = {
  email: string;
  role: string;
  orgName?: string;
  scopes: string[];
};

type EntitlementView = {
  plan: 'FREE' | 'LITE' | 'PRO';
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';
  currentPeriodEnd: string | null;
  features: string[];
};

export default function SettingsPage() {
  const [me, setMe] = useState<MeView | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementView | null>(null);
  const [alpaca, setAlpaca] = useState<{
    mode: 'server' | 'user' | 'none';
    connected: boolean;
    endpoint?: string;
    environment?: 'paper' | 'live';
    keyLast4?: string | null;
    lastVerifiedAt?: string | null;
    message?: string;
    reason?: string;
    canTradeLive?: boolean;
  } | null>(null);
  const [alpacaBusy, setAlpacaBusy] = useState(false);
  const [alpacaMessage, setAlpacaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [meRes, entRes, alpacaRes] = await Promise.all([
        api.getMe(),
        api.getBillingEntitlement(),
        api.getAlpacaStatus(),
      ]);

      if (meRes.success && meRes.data) {
        setMe({
          email: meRes.data.user.email,
          role: meRes.data.role,
          orgName: meRes.data.org?.name,
          scopes: meRes.data.scopes,
        });
      }

      if (entRes.success && entRes.data?.entitlement) {
        const e = entRes.data.entitlement;
        setEntitlement({
          plan: e.plan,
          status: e.status,
          currentPeriodEnd: e.currentPeriodEnd,
          features: e.features,
        });
      }

      if (alpacaRes.success && alpacaRes.data) {
        setAlpaca({
          mode: alpacaRes.data.mode || (alpacaRes.data.connected ? 'user' : 'none'),
          connected: alpacaRes.data.connected,
          endpoint: alpacaRes.data.endpoint,
          environment: alpacaRes.data.environment,
          keyLast4: alpacaRes.data.keyLast4,
          lastVerifiedAt: alpacaRes.data.lastVerifiedAt,
          message: alpacaRes.data.message,
          reason: alpacaRes.data.reason,
          canTradeLive: alpacaRes.data.canTradeLive,
        });
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openBillingPortal = async () => {
    setPortalLoading(true);
    setError(null);

    try {
      const res = await api.createBillingPortalSession();
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      setError(res.error?.message || 'Unable to open billing portal');
    } catch (err) {
      setError((err as Error).message || 'Unable to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const disconnectAlpaca = async () => {
    setAlpacaBusy(true);
    setAlpacaMessage(null);
    setError(null);

    try {
      const res = await api.disconnectAlpaca();
      if (res.success) {
        // Reload to get fresh status (will fall back to server mode)
        await load();
        setAlpacaMessage({ type: 'success', text: 'Personal account disconnected. Using platform intelligence.' });
      } else {
        setAlpacaMessage({ type: 'error', text: res.error?.message || 'Failed to disconnect' });
      }
    } catch (err) {
      setAlpacaMessage({ type: 'error', text: (err as Error).message || 'Failed to disconnect' });
    } finally {
      setAlpacaBusy(false);
    }
  };

  const connectPersonalAccount = async () => {
    // Future: OAuth flow with Alpaca
    // For now, show informational message
    setAlpacaMessage({ 
      type: 'success', 
      text: 'Personal account connection coming soon. Use platform intelligence for now.' 
    });
  };

  const badge = (ok: boolean, labelOk: string, labelBad: string) => (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
        ok ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-300'
      }`}
    >
      {ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {ok ? labelOk : labelBad}
    </span>
  );

  return (
    <DashboardLayout>
      <div className="p-8 bg-gray-950 min-h-screen">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Settings</h1>
            <p className="text-gray-400 mt-1">Account, billing, and connectivity status</p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/40 rounded-lg text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Account */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <User className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Account</h2>
            </div>

            {me ? (
              <div className="space-y-3">
                <div>
                  <p className="text-gray-500 text-xs">Email</p>
                  <p className="text-white">{me.email}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Organization</p>
                  <p className="text-white">{me.orgName || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Role</p>
                  <p className="text-white">{me.role}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Scopes</p>
                  <p className="text-gray-300 text-sm break-words">{me.scopes?.join(', ') || '—'}</p>
                </div>
              </div>
            ) : (
              <div className="text-gray-400">Loading account…</div>
            )}

            <div className="mt-6 text-xs text-gray-500">
              <Link href="/privacy" className="text-blue-400 hover:underline">Privacy</Link>
              <span className="mx-2">•</span>
              <Link href="/terms" className="text-blue-400 hover:underline">Terms</Link>
              <span className="mx-2">•</span>
              <Link href="/legal/risk-disclosure" className="text-blue-400 hover:underline">Risk Disclosure</Link>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <CreditCard className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Billing</h2>
            </div>

            {entitlement ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs">Plan</p>
                    <p className="text-white font-medium">{entitlement.plan}</p>
                  </div>
                  {badge(entitlement.status === 'ACTIVE' || entitlement.status === 'TRIALING', 'Active', entitlement.status)}
                </div>

                <div>
                  <p className="text-gray-500 text-xs">Current period end</p>
                  <p className="text-gray-300 text-sm">
                    {entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd).toLocaleString() : '—'}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500 text-xs">Features</p>
                  <p className="text-gray-300 text-sm break-words">
                    {entitlement.features?.length ? entitlement.features.join(', ') : '—'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={openBillingPortal}
                    disabled={portalLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {portalLoading ? 'Opening…' : 'Manage subscription'}
                  </button>
                  <Link
                    href="/pricing"
                    className="px-4 py-2 border border-white/15 hover:bg-white/10 text-white rounded-lg transition text-center"
                  >
                    View plans
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-gray-400">Loading billing…</div>
            )}

            <div className="mt-4 text-xs text-gray-500">
              Billing is handled by Stripe. Subscription changes are reflected via webhooks.
            </div>
          </div>

          {/* Connectivity */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Shield className="w-5 h-5 text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Broker Connection</h2>
            </div>

            <div className="space-y-4">
              {/* Mode-based status display */}
              {alpaca?.mode === 'server' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Platform Intelligence</p>
                      <p className="text-gray-500 text-xs">Analytics, screener, and paper trading active</p>
                    </div>
                    {badge(true, 'Active', '')}
                  </div>
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
                    <p className="text-cyan-300 text-sm">
                      {alpaca.message || 'Using platform intelligence. Connect your account to trade live.'}
                    </p>
                  </div>
                  {alpaca.environment && (
                    <div>
                      <p className="text-gray-500 text-xs">Environment</p>
                      <p className="text-gray-300 text-sm capitalize">{alpaca.environment}</p>
                    </div>
                  )}
                  <button
                    onClick={connectPersonalAccount}
                    disabled={alpacaBusy}
                    className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Trade with my account
                  </button>
                </>
              )}

              {alpaca?.mode === 'user' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Personal Account</p>
                      <p className="text-gray-500 text-xs">Your Alpaca account is connected</p>
                    </div>
                    {badge(true, 'Connected', '')}
                  </div>
                  {alpaca.environment && (
                    <div>
                      <p className="text-gray-500 text-xs">Environment</p>
                      <p className="text-gray-300 text-sm capitalize">{alpaca.environment}</p>
                    </div>
                  )}
                  {alpaca.keyLast4 && (
                    <div>
                      <p className="text-gray-500 text-xs">API Key</p>
                      <p className="text-gray-300 text-sm">•••• {alpaca.keyLast4}</p>
                    </div>
                  )}
                  {alpaca.lastVerifiedAt && (
                    <div>
                      <p className="text-gray-500 text-xs">Last Verified</p>
                      <p className="text-gray-300 text-sm">{new Date(alpaca.lastVerifiedAt).toLocaleString()}</p>
                    </div>
                  )}
                  {alpaca.canTradeLive && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                      <p className="text-green-300 text-sm">Live trading eligible (policy-gated)</p>
                    </div>
                  )}
                  <button
                    onClick={disconnectAlpaca}
                    disabled={alpacaBusy}
                    className="w-full px-4 py-2 border border-red-500/40 text-red-300 hover:bg-red-500/10 rounded-lg transition"
                  >
                    {alpacaBusy ? 'Disconnecting…' : 'Disconnect personal account'}
                  </button>
                </>
              )}

              {alpaca?.mode === 'none' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Broker</p>
                      <p className="text-gray-500 text-xs">No broker configured</p>
                    </div>
                    {badge(false, '', 'Unavailable')}
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-300 text-sm">
                      {alpaca.reason || 'Broker not configured. Contact support if this persists.'}
                    </p>
                  </div>
                </>
              )}

              {!alpaca && (
                <div className="text-gray-400 text-sm">Loading broker status…</div>
              )}

              {alpacaMessage && (
                <div
                  className={`text-xs px-3 py-2 rounded-lg ${
                    alpacaMessage.type === 'success'
                      ? 'bg-green-500/10 text-green-300 border border-green-500/30'
                      : 'bg-red-500/10 text-red-300 border border-red-500/30'
                  }`}
                >
                  {alpacaMessage.text}
                </div>
              )}

              <div className="pt-2 text-xs text-gray-500">
                Market data and execution are policy-gated. Platform intelligence works immediately.
                Connect your personal account to trade with your own capital.
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
