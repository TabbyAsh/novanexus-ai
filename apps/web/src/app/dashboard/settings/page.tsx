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
  Radio,
  Zap,
  Key,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';

type MeView = {
  email: string;
  role: string;
  orgName?: string;
  scopes: string[];
};

type ProviderView = {
  id: string;
  name: string;
  enabled: boolean;
  health: string;
  dataClass: string;
  requiresKey: boolean;
  configured: boolean;
  signupUrl: string | null;
  signupTime: string | null;
};

type MarketStatusView = {
  providers: ProviderView[];
  activeDataClass: string;
  upgradeHint: string | null;
  marketOpen: boolean;
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
  const [marketStatus, setMarketStatus] = useState<MarketStatusView | null>(null);
  const [aiStatus, setAiStatus] = useState<{ ready: boolean; openai: boolean; marketdata?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [meRes, entRes, alpacaRes, mktRes, aiRes] = await Promise.all([
        api.getMe(),
        api.getBillingEntitlement(),
        api.getAlpacaStatus(),
        api.getMarketStatus().catch(() => null),
        api.getAIScreenerStatus().catch(() => null),
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
      if (mktRes && mktRes.success && mktRes.data) {
        setMarketStatus({
          providers: mktRes.data.providers,
          activeDataClass: mktRes.data.activeDataClass,
          upgradeHint: mktRes.data.upgradeHint,
          marketOpen: mktRes.data.marketOpen,
        });
      }
      if (aiRes && aiRes.success && aiRes.data) {
        setAiStatus({ ready: aiRes.data.ready, openai: aiRes.data.openai, marketdata: aiRes.data.marketdata });
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

  // Alpaca connect form state
  const [showAlpacaForm, setShowAlpacaForm] = useState(false);
  const [alpacaApiKey, setAlpacaApiKey] = useState('');
  const [alpacaApiSecret, setAlpacaApiSecret] = useState('');
  const [alpacaEnv, setAlpacaEnv] = useState<'paper' | 'live'>('paper');
  const [showSecret, setShowSecret] = useState(false);

  const connectPersonalAccount = async () => {
    if (!showAlpacaForm) {
      setShowAlpacaForm(true);
      return;
    }

    if (!alpacaApiKey.trim() || !alpacaApiSecret.trim()) {
      setAlpacaMessage({ type: 'error', text: 'Both API Key and Secret are required.' });
      return;
    }

    setAlpacaBusy(true);
    setAlpacaMessage(null);

    try {
      const res = await api.connectAlpaca({
        apiKey: alpacaApiKey.trim(),
        apiSecret: alpacaApiSecret.trim(),
        environment: alpacaEnv,
      });

      if (res.success) {
        setAlpacaApiKey('');
        setAlpacaApiSecret('');
        setShowAlpacaForm(false);
        setAlpacaMessage({ type: 'success', text: `Connected! Account: ${res.data?.accountNumber || 'verified'} (${res.data?.environment || alpacaEnv})` });
        await load();
      } else {
        setAlpacaMessage({ type: 'error', text: res.error?.message || 'Connection failed. Check your keys.' });
      }
    } catch (err) {
      setAlpacaMessage({ type: 'error', text: (err as Error).message || 'Connection failed' });
    } finally {
      setAlpacaBusy(false);
    }
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

        {/* Data Sources Banner */}
        {marketStatus && marketStatus.activeDataClass !== 'real-time' && marketStatus.upgradeHint && (
          <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-start gap-3">
            <Zap className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-cyan-300 font-medium">Unlock Real-Time Market Data</p>
              <p className="text-gray-400 text-sm mt-1">{marketStatus.upgradeHint}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
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
                  {!showAlpacaForm ? (
                    <button
                      onClick={() => setShowAlpacaForm(true)}
                      disabled={alpacaBusy}
                      className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Key className="w-4 h-4" />
                      Connect my Alpaca account
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-gray-800 rounded-xl border border-gray-700">
                      <p className="text-white text-sm font-medium">Connect Alpaca Broker</p>
                      <p className="text-gray-400 text-xs">Your keys are encrypted (AES-256-GCM) and stored securely. We never see your plaintext keys.</p>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">API Key ID</label>
                        <input
                          type="text"
                          value={alpacaApiKey}
                          onChange={e => setAlpacaApiKey(e.target.value)}
                          placeholder="PK..."
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">Secret Key</label>
                        <div className="relative">
                          <input
                            type={showSecret ? 'text' : 'password'}
                            value={alpacaApiSecret}
                            onChange={e => setAlpacaApiSecret(e.target.value)}
                            placeholder="Your Alpaca secret key"
                            className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecret(!showSecret)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                          >
                            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">Environment</label>
                        <select
                          value={alpacaEnv}
                          onChange={e => setAlpacaEnv(e.target.value as 'paper' | 'live')}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                        >
                          <option value="paper">Paper Trading (recommended)</option>
                          <option value="live">Live Trading</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={connectPersonalAccount}
                          disabled={alpacaBusy || !alpacaApiKey.trim() || !alpacaApiSecret.trim()}
                          className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm"
                        >
                          {alpacaBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          {alpacaBusy ? 'Connecting...' : 'Connect & Verify'}
                        </button>
                        <button
                          onClick={() => { setShowAlpacaForm(false); setAlpacaApiKey(''); setAlpacaApiSecret(''); }}
                          className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Get your API keys at{' '}
                        <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                          app.alpaca.markets
                        </a>
                      </p>
                    </div>
                  )}
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
                      {alpaca.reason || 'No broker connected. Add your Alpaca API keys to start trading.'}
                    </p>
                  </div>
                  {!showAlpacaForm ? (
                    <button
                      onClick={() => setShowAlpacaForm(true)}
                      className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Key className="w-4 h-4" />
                      Connect Alpaca Account
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-gray-800 rounded-xl border border-gray-700">
                      <p className="text-white text-sm font-medium">Connect Alpaca Broker</p>
                      <p className="text-gray-400 text-xs">Your keys are encrypted (AES-256-GCM) and stored securely.</p>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">API Key ID</label>
                        <input type="text" value={alpacaApiKey} onChange={e => setAlpacaApiKey(e.target.value)}
                          placeholder="PK..." className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">Secret Key</label>
                        <div className="relative">
                          <input type={showSecret ? 'text' : 'password'} value={alpacaApiSecret} onChange={e => setAlpacaApiSecret(e.target.value)}
                            placeholder="Your Alpaca secret key" className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                          <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">Environment</label>
                        <select value={alpacaEnv} onChange={e => setAlpacaEnv(e.target.value as 'paper' | 'live')}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500">
                          <option value="paper">Paper Trading (recommended)</option>
                          <option value="live">Live Trading</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={connectPersonalAccount} disabled={alpacaBusy || !alpacaApiKey.trim() || !alpacaApiSecret.trim()}
                          className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm">
                          {alpacaBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          {alpacaBusy ? 'Connecting...' : 'Connect & Verify'}
                        </button>
                        <button onClick={() => { setShowAlpacaForm(false); setAlpacaApiKey(''); setAlpacaApiSecret(''); }}
                          className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition text-sm">Cancel</button>
                      </div>
                      <p className="text-xs text-gray-500">Get keys at <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">app.alpaca.markets</a></p>
                    </div>
                  )}
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
          {/* AI Configuration */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-violet-500/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">AI Configuration</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs">OpenAI</p>
                  <p className="text-white font-medium">GPT-4o-mini</p>
                </div>
                {aiStatus ? (
                  badge(aiStatus.openai, 'Connected', 'Not Configured')
                ) : (
                  <span className="text-gray-500 text-xs">Loading...</span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs">Market Data Service</p>
                  <p className="text-white font-medium">Quote & Candle Feed</p>
                </div>
                {aiStatus ? (
                  badge(aiStatus.ready, 'Ready', 'Unavailable')
                ) : (
                  <span className="text-gray-500 text-xs">Loading...</span>
                )}
              </div>

              {aiStatus && !aiStatus.openai && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-yellow-300 text-sm font-medium mb-1">AI features limited</p>
                  <p className="text-gray-400 text-xs">
                    Without OpenAI, the screener uses deterministic rules only. Content generation and AI analysis are disabled.
                  </p>
                </div>
              )}

              {aiStatus?.openai && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-green-300 text-sm">
                    AI screener, content generation, and analysis are fully active.
                  </p>
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <p>AI powers: Stock screener analysis, content plan generation, product listing creation, and trade thesis generation.</p>
                <p>OpenAI key is configured at the server level via <code className="text-violet-400">OPENAI_API_KEY</code> environment variable.</p>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Radio className="w-5 h-5 text-orange-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Data Sources</h2>
            </div>

            {marketStatus ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs">Active Data Class</p>
                    <p className="text-white font-medium capitalize">{marketStatus.activeDataClass}</p>
                  </div>
                  {badge(
                    marketStatus.activeDataClass === 'real-time',
                    'Real-Time',
                    marketStatus.activeDataClass === 'near-real-time' ? 'Near Real-Time' : 'Delayed'
                  )}
                </div>

                <div>
                  <p className="text-gray-500 text-xs mb-2">Market</p>
                  {badge(marketStatus.marketOpen, 'Open', 'Closed')}
                </div>

                <div className="pt-2">
                  <p className="text-gray-500 text-xs mb-2">Providers</p>
                  <div className="space-y-2">
                    {marketStatus.providers.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${p.enabled && p.health === 'healthy' ? 'bg-green-500' : p.enabled ? 'bg-yellow-500' : 'bg-gray-600'}`} />
                          <span className={p.enabled ? 'text-gray-200' : 'text-gray-500'}>{p.name}</span>
                        </div>
                        {!p.configured && p.signupUrl && (
                          <a
                            href={p.signupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 text-xs hover:underline flex items-center gap-1"
                          >
                            Setup <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {p.configured && (
                          <span className="text-xs text-green-400">Active</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {marketStatus.upgradeHint && marketStatus.activeDataClass !== 'real-time' && (
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mt-2">
                    <p className="text-cyan-300 text-xs">{marketStatus.upgradeHint}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-400 text-sm">Loading data sources…</div>
            )}

            <div className="mt-4 text-xs text-gray-500">
              Yahoo Finance provides zero-config data. Add free Alpaca or Finnhub keys for real-time.
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
