'use client';

/**
 * API Key Management — Founding Member + Pro feature.
 * Generate keys to call the Nova API from your own code, scripts, or tools.
 */

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Key, Plus, Copy, Trash2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null); // shown ONCE after creation
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/api-keys`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json();
      if (d.success) setKeys(d.data?.keys ?? []);
    } catch { /* */ } finally { setLoading(false); }
  };

  const create = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/api-keys`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setNewKey(d.data.key);
        setNewKeyName('');
        setShowForm(false);
        await load();
      } else {
        setError(d.error?.message || 'Failed to create key.');
      }
    } catch { setError('Request failed.'); } finally { setCreating(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this key? Any apps using it will stop working.')) return;
    await fetch(`${API}/v1/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setKeys((prev) => prev.filter((k) => k.id !== id));
    if (newKey) setNewKey(null);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => { load(); }, []);

  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Key className="w-6 h-6 text-violet-400" /> API Keys
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Use your API keys to call Nova from scripts, automations, or other tools.
            </p>
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Newly created key — shown ONCE */}
        {newKey && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span className="font-semibold text-emerald-300">Key created. Copy it now — it won&apos;t be shown again.</span>
            </div>
            <div className="flex items-center gap-3">
              <code className="flex-1 font-mono text-sm text-emerald-300 bg-gray-950 rounded-lg px-3 py-2 truncate">{newKey}</code>
              <button onClick={() => copy(newKey)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white transition">
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500">Use as: <code className="text-gray-400">Authorization: Bearer {'<your-key>'}</code></p>
          </div>
        )}

        {/* Existing keys */}
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        ) : (
          <>
            {keys.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-800/60 last:border-0">
                    <Key className="w-4 h-4 text-violet-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{k.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{k.key_prefix}••••••••</div>
                    </div>
                    <div className="text-xs text-gray-600 shrink-0">
                      {k.last_used_at ? `Used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                    </div>
                    <button onClick={() => revoke(k.id)}
                      className="shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Create new key */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-700 hover:border-violet-500/50 text-gray-400 hover:text-violet-400 text-sm transition w-full justify-center">
                <Plus className="w-4 h-4" /> Create new API key
              </button>
            ) : (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
                <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. My Script, Automation)"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white text-sm focus:border-violet-500/60 outline-none" />
                <div className="flex gap-2">
                  <button onClick={create} disabled={creating || !newKeyName.trim()}
                    className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-semibold text-white transition">
                    {creating ? 'Generating…' : 'Generate Key'}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-400 transition">
                    Cancel
                  </button>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
              </div>
            )}
          </>
        )}

        {/* Usage docs */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Using your API key</h3>
          <div className="space-y-2 text-sm text-gray-400">
            <p>Add your key as a Bearer token in any request to the Nova API:</p>
            <code className="block bg-gray-950 rounded-lg px-4 py-3 text-xs text-gray-300 font-mono">
              curl https://abackend-production.up.railway.app/v1/flip/appraise \<br />
              &nbsp;&nbsp;-H &quot;Authorization: Bearer nova_xxxxx&quot; \<br />
              &nbsp;&nbsp;-d &apos;{`{"title":"AirPods Pro","buy_price":80}`}&apos;
            </code>
            <p className="text-xs text-gray-600">
              API access is available to Lite and Founding Member plans. Keys are hashed server-side — store yours securely.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
