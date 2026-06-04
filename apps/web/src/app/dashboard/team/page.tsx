'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Users, Plus, Copy, CheckCircle, RefreshCw, Crown } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : ''; }

interface Member { user_id: string; email: string; role: string; joined_at: string; }

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/team/members`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json();
      if (d.success) setMembers(d.data?.members ?? []);
    } catch { /* */ } finally { setLoading(false); }
  };

  const generateInvite = async () => {
    setGenerating(true);
    try {
      const r = await fetch(`${API}/v1/team/invite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      if (d.success) setInviteUrl(d.data.inviteUrl);
    } catch { /* */ } finally { setGenerating(false); }
  };

  const copy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => { load(); }, []);

  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Users className="w-6 h-6 text-blue-400" /> Team
            </h1>
            <p className="text-gray-500 text-sm mt-1">Invite team members to share your Nova workspace.</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Generate invite */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Invite a Member</div>
              <div className="text-xs text-gray-500">Generates a 7-day invite link. Anyone with the link can join your org.</div>
            </div>
            <button onClick={generateInvite} disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white transition">
              <Plus className="w-4 h-4" />
              {generating ? 'Generating…' : 'New Invite Link'}
            </button>
          </div>

          {inviteUrl && (
            <div className="flex items-center gap-3">
              <code className="flex-1 truncate bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono">
                {inviteUrl}
              </code>
              <button onClick={copy} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white transition">
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {/* Member list */}
        {loading ? (
          <div className="flex justify-center py-10"><RefreshCw className="w-6 h-6 text-blue-400 animate-spin" /></div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-widest">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </div>
            {members.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">No members yet. Generate an invite link above.</div>
            ) : members.map((m, i) => (
              <div key={m.user_id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-800/60 last:border-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-700/50 text-gray-400'
                }`}>
                  {i === 0 ? <Crown className="w-4 h-4" /> : m.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{m.email}</div>
                  <div className="text-xs text-gray-500">Joined {new Date(m.joined_at).toLocaleDateString()}</div>
                </div>
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{m.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
