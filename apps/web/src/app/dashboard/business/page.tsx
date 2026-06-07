'use client';

/**
 * NovaNexus Business OS — the flagship operator product.
 *
 * The productized "company-in-a-box": a persistent CRM/pipeline that any
 * service business owner can run. This is what Nova built by hand for Apex,
 * generalized for every user and backed by the database.
 *
 * Pipeline: LEAD → QUOTED → SCHEDULED → COMPLETED → PAID (or LOST)
 * Plus: automatic follow-up tracking, quote/invoice text generation,
 * and real revenue metrics.
 */

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  Plus, Phone, DollarSign, TrendingUp, Clock, AlertCircle,
  CheckCircle, X, Copy, MessageSquare, Trash2, RefreshCw,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';

const STATUSES = ['LEAD', 'QUOTED', 'SCHEDULED', 'COMPLETED', 'PAID', 'LOST'] as const;
type Status = typeof STATUSES[number];

const STATUS_CONFIG: Record<Status, { label: string; cls: string; next?: Status }> = {
  LEAD:      { label: 'New Lead',  cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30',       next: 'QUOTED' },
  QUOTED:    { label: 'Quoted',    cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30',    next: 'SCHEDULED' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',       next: 'COMPLETED' },
  COMPLETED: { label: 'Completed', cls: 'bg-violet-500/20 text-violet-400 border-violet-500/30', next: 'PAID' },
  PAID:      { label: 'Paid',      cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  LOST:      { label: 'Lost',      cls: 'bg-gray-600/20 text-gray-500 border-gray-600/30' },
};

interface Job {
  id: string;
  contact_name: string;
  contact_phone: string | null;
  service: string | null;
  status: Status;
  quoted_price: string | null;
  final_price: string | null;
  scheduled_date: string | null;
  notes: string | null;
  follow_up_due: string | null;
  created_at: string;
}

interface Metrics {
  total: number; revenue: number; pipeline: number;
  followUpsDue: number; unpaid: number; leads: number; scheduled: number; paid: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function BusinessOSPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<Status | 'ALL' | 'FOLLOWUP'>('ALL');
  const [form, setForm] = useState({ contactName: '', contactPhone: '', service: '', quotedPrice: '', notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/business/jobs`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json();
      if (d.success) { setJobs(d.data.jobs); setMetrics(d.data.metrics); }
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addJob = async () => {
    if (!form.contactName.trim()) return;
    await fetch(`${API}/v1/business/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, status: form.quotedPrice ? 'QUOTED' : 'LEAD' }),
    });
    setForm({ contactName: '', contactPhone: '', service: '', quotedPrice: '', notes: '' });
    setShowAdd(false);
    load();
  };

  const advance = async (job: Job) => {
    const next = STATUS_CONFIG[job.status].next;
    if (!next) return;
    const body: any = { status: next };
    if (next === 'PAID' && !job.final_price) body.finalPrice = job.quoted_price;
    await fetch(`${API}/v1/business/jobs/${job.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    load();
  };

  const setStatus = async (job: Job, status: Status) => {
    await fetch(`${API}/v1/business/jobs/${job.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const markContacted = async (job: Job) => {
    await fetch(`${API}/v1/business/jobs/${job.id}/contacted`, {
      method: 'POST', headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  };

  const removeJob = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    await fetch(`${API}/v1/business/jobs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    load();
  };

  const today = new Date().toISOString().split('T')[0];
  const filtered = jobs.filter(j => {
    if (filter === 'ALL') return true;
    if (filter === 'FOLLOWUP') return j.follow_up_due && j.follow_up_due <= today && ['LEAD', 'QUOTED'].includes(j.status);
    return j.status === filter;
  });

  const quoteText = (job: Job) => {
    const first = job.contact_name.split(' ')[0];
    const price = job.quoted_price ? `$${parseFloat(job.quoted_price).toFixed(0)}` : '[price]';
    return `Hi ${first}, following up on your ${job.service || 'service'} quote of ${price}. We can usually schedule within a few days — just reply to lock in a time. Thanks!`;
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Business OS</h1>
            <p className="text-gray-500 text-sm mt-1">
              Your leads, quotes, jobs, and revenue — in one pipeline. Never lose a lead or forget a follow-up.
            </p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricTile icon={DollarSign} label="Revenue (paid)" value={fmt(metrics.revenue)} cls="text-emerald-400" />
            <MetricTile icon={TrendingUp} label="Pipeline value" value={fmt(metrics.pipeline)} cls="text-cyan-400" />
            <MetricTile icon={Clock}      label="Active leads"   value={String(metrics.leads + metrics.scheduled)} cls="text-blue-400" />
            <MetricTile icon={AlertCircle}label="Follow-ups due" value={String(metrics.followUpsDue)} cls={metrics.followUpsDue > 0 ? 'text-amber-400' : 'text-gray-400'} />
            <MetricTile icon={CheckCircle}label="Unpaid jobs"    value={String(metrics.unpaid)} cls={metrics.unpaid > 0 ? 'text-amber-400' : 'text-gray-400'} />
          </div>
        )}

        {/* Follow-up alert */}
        {metrics && metrics.followUpsDue > 0 && (
          <button onClick={() => setFilter('FOLLOWUP')}
            className="w-full flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left hover:bg-amber-500/15 transition">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-sm text-amber-300">
              <strong>{metrics.followUpsDue} lead{metrics.followUpsDue > 1 ? 's' : ''} need following up.</strong> The #1 way operators lose money is forgetting to follow up. Tap to see them.
            </span>
          </button>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-400">New lead / job</span>
              <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))}
                placeholder="Customer name *" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50" />
              <input value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))}
                placeholder="Phone" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.service} onChange={e => setForm(p => ({ ...p, service: e.target.value }))}
                placeholder="Service (e.g. Driveway wash)" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50" />
              <input type="number" value={form.quotedPrice} onChange={e => setForm(p => ({ ...p, quotedPrice: e.target.value }))}
                placeholder="Quote $ (optional)" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50" />
            </div>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notes (optional)" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50" />
            <button onClick={addJob} disabled={!form.contactName.trim()}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm font-semibold text-white transition">
              Add to Pipeline
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label={`All (${jobs.length})`} />
          {metrics && metrics.followUpsDue > 0 && (
            <FilterChip active={filter === 'FOLLOWUP'} onClick={() => setFilter('FOLLOWUP')} label={`⏰ Follow up (${metrics.followUpsDue})`} amber />
          )}
          {STATUSES.map(s => {
            const count = jobs.filter(j => j.status === s).length;
            if (count === 0) return null;
            return <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={`${STATUS_CONFIG[s].label} (${count})`} />;
          })}
        </div>

        {/* Jobs list */}
        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="text-lg font-semibold text-white mb-2">{jobs.length === 0 ? 'No leads yet' : 'Nothing in this view'}</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-5">
              {jobs.length === 0
                ? 'Add your first lead. Track it from quote to paid. Nova reminds you to follow up so you never lose a job.'
                : 'Try a different filter.'}
            </p>
            {jobs.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
                Add First Lead
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(job => {
              const cfg = STATUS_CONFIG[job.status];
              const needsFollowUp = job.follow_up_due && job.follow_up_due <= today && ['LEAD', 'QUOTED'].includes(job.status);
              return (
                <div key={job.id} className={`rounded-2xl border bg-gray-900/50 p-4 ${needsFollowUp ? 'border-amber-500/30' : 'border-gray-800'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                        {needsFollowUp && <span className="text-[10px] font-bold text-amber-400">⏰ FOLLOW UP DUE</span>}
                      </div>
                      <h3 className="text-base font-semibold text-white mt-1.5">{job.contact_name}</h3>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        {job.contact_phone && (
                          <a href={`tel:${job.contact_phone}`} className="flex items-center gap-1 text-sky-400 hover:underline">
                            <Phone className="w-3 h-3" /> {job.contact_phone}
                          </a>
                        )}
                        {job.service && <span>{job.service}</span>}
                      </div>
                      {job.notes && <p className="text-xs text-gray-600 mt-1">{job.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {(job.final_price || job.quoted_price) && (
                        <div className="text-lg font-bold text-emerald-400">
                          {fmt(parseFloat(job.final_price || job.quoted_price || '0'))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {cfg.next && (
                      <button onClick={() => advance(job)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-xs font-semibold text-white transition">
                        → {STATUS_CONFIG[cfg.next].label}
                      </button>
                    )}
                    {['LEAD', 'QUOTED'].includes(job.status) && (
                      <>
                        {job.contact_phone && (
                          <a href={`sms:${job.contact_phone}?body=${encodeURIComponent(quoteText(job))}`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-sky-500/50 text-xs text-gray-400 hover:text-sky-400 transition">
                            <MessageSquare className="w-3 h-3" /> Text
                          </a>
                        )}
                        <button onClick={() => markContacted(job)}
                          className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 text-xs text-gray-400 hover:text-white transition">
                          Mark contacted
                        </button>
                      </>
                    )}
                    {job.status !== 'LOST' && job.status !== 'PAID' && (
                      <button onClick={() => setStatus(job, 'LOST')}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:text-red-400 transition">
                        Lost
                      </button>
                    )}
                    <button onClick={() => removeJob(job.id)} className="ml-auto p-1.5 text-gray-700 hover:text-red-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-700 text-center pt-2">
          This is your business operating system. Every lead tracked, every follow-up remembered, every dollar accounted for.
          Pair with the <a href="/dashboard/quote-builder" className="text-emerald-500 hover:text-emerald-400">Quote Builder</a> and{' '}
          <a href="/dashboard/invoice-builder" className="text-emerald-500 hover:text-emerald-400">Invoice Builder</a> for professional documents.
        </p>
      </div>
    </DashboardLayout>
  );
}

function MetricTile({ icon: Icon, label, value, cls }: { icon: React.ElementType; label: string; value: string; cls: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label, amber }: { active: boolean; onClick: () => void; label: string; amber?: boolean }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
        active
          ? amber ? 'bg-amber-600 text-white' : 'bg-white text-black'
          : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'
      }`}>
      {label}
    </button>
  );
}
