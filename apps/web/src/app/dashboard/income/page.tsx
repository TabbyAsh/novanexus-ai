'use client';

/**
 * Income Tracker — for gig workers, service providers, freelancers.
 *
 * Tracks earnings from any real-world work: DoorDash, Uber, cleaning,
 * lawn care, handyman, freelance, etc.
 *
 * Shows:
 * - Real hourly rate AFTER expenses (most gig workers don't know this)
 * - Best vs worst sessions
 * - Running total this week/month
 * - Expense deduction (gas, miles, supplies)
 * - Which platform/client actually pays best
 *
 * This is a zero-capital income tool. No investing, no inventory, no risk.
 * You work → you log it → Nova shows you where your time is actually worth the most.
 */

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Plus, TrendingUp, TrendingDown, Clock, DollarSign, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const IRS_RATE_PER_MILE = 0.67; // 2024 IRS standard mileage rate

interface Session {
  id: string;
  date: string;
  platform: string; // DoorDash, Uber Eats, lawn care, cleaning, etc.
  grossEarnings: number;
  hours: number;
  miles: number;
  otherExpenses: number; // supplies, tools, etc.
  notes: string;
  createdAt: string;
}

const PLATFORMS = [
  'DoorDash', 'Uber Eats', 'Instacart', 'Shipt', 'Amazon Flex',
  'Uber', 'Lyft', 'TaskRabbit', 'Fiverr', 'Upwork',
  'Lawn care', 'Cleaning', 'Handyman', 'Painting', 'Pressure washing',
  'Dog walking', 'Babysitting', 'Tutoring', 'Other',
];

function calcSession(s: Session) {
  const milesCost = s.miles * IRS_RATE_PER_MILE;
  const totalExpenses = milesCost + s.otherExpenses;
  const net = s.grossEarnings - totalExpenses;
  const hourlyGross = s.hours > 0 ? s.grossEarnings / s.hours : 0;
  const hourlyNet = s.hours > 0 ? net / s.hours : 0;
  return { net, milesCost, totalExpenses, hourlyGross, hourlyNet };
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

const STORAGE_KEY = 'nova_income_sessions';

function loadSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveSessions(s: Session[]) {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function IncomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    platform: '',
    grossEarnings: '',
    hours: '',
    miles: '',
    otherExpenses: '',
    notes: '',
  });

  useEffect(() => { setSessions(loadSessions()); }, []);

  const addSession = () => {
    if (!form.platform || !form.grossEarnings || !form.hours) return;
    const s: Session = {
      id: Date.now().toString(),
      date: form.date,
      platform: form.platform,
      grossEarnings: parseFloat(form.grossEarnings) || 0,
      hours: parseFloat(form.hours) || 0,
      miles: parseFloat(form.miles) || 0,
      otherExpenses: parseFloat(form.otherExpenses) || 0,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    };
    const updated = [s, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], platform: '', grossEarnings: '', hours: '', miles: '', otherExpenses: '', notes: '' });
  };

  const removeSession = (id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
  };

  // Aggregate stats
  const allCalc = sessions.map(s => ({ ...s, ...calcSession(s) }));
  const totalGross = allCalc.reduce((a, s) => a + s.grossEarnings, 0);
  const totalNet = allCalc.reduce((a, s) => a + s.net, 0);
  const totalHours = allCalc.reduce((a, s) => a + s.hours, 0);
  const totalMilesCost = allCalc.reduce((a, s) => a + s.milesCost, 0);
  const avgNetHourly = totalHours > 0 ? totalNet / totalHours : 0;

  // Platform breakdown
  const byPlatform: Record<string, { net: number; hours: number; sessions: number }> = {};
  allCalc.forEach(s => {
    if (!byPlatform[s.platform]) byPlatform[s.platform] = { net: 0, hours: 0, sessions: 0 };
    byPlatform[s.platform].net += s.net;
    byPlatform[s.platform].hours += s.hours;
    byPlatform[s.platform].sessions += 1;
  });
  const platformRanked = Object.entries(byPlatform)
    .map(([name, d]) => ({ name, ...d, hourlyNet: d.hours > 0 ? d.net / d.hours : 0 }))
    .sort((a, b) => b.hourlyNet - a.hourlyNet);

  // This week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const thisWeek = allCalc.filter(s => s.date >= weekAgo);
  const weekNet = thisWeek.reduce((a, s) => a + s.net, 0);
  const weekHours = thisWeek.reduce((a, s) => a + s.hours, 0);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Income Tracker</h1>
            <p className="text-gray-500 text-sm mt-1">
              Log any gig or service work. See your real hourly rate after expenses.
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
            <Plus className="w-4 h-4" /> Log Session
          </button>
        </div>

        {/* Add session form */}
        {showForm && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-4">
            <div className="text-sm font-semibold text-emerald-400">Log a work session</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Platform / Type of work</label>
                <select value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50">
                  <option value="">Select...</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Gross earnings ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.grossEarnings} onChange={e => setForm(p => ({ ...p, grossEarnings: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Hours worked</label>
                <input type="number" step="0.25" min="0" placeholder="0"
                  value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Miles driven (auto-costs ${IRS_RATE_PER_MILE}/mi)</label>
                <input type="number" step="1" min="0" placeholder="0"
                  value={form.miles} onChange={e => setForm(p => ({ ...p, miles: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Other expenses (supplies, tools, etc.)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.otherExpenses} onChange={e => setForm(p => ({ ...p, otherExpenses: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
              </div>
            </div>

            {/* Live preview */}
            {form.grossEarnings && form.hours && (
              <div className="rounded-lg bg-gray-900 border border-gray-800 p-3 text-sm grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xs text-gray-500">Gross/hr</div>
                  <div className="font-bold text-white">{fmt((parseFloat(form.grossEarnings)||0) / (parseFloat(form.hours)||1))}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Expenses</div>
                  <div className="font-bold text-red-400">-{fmt((parseFloat(form.miles)||0)*IRS_RATE_PER_MILE + (parseFloat(form.otherExpenses)||0))}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Real net/hr</div>
                  <div className="font-bold text-emerald-400">
                    {fmt(((parseFloat(form.grossEarnings)||0) - (parseFloat(form.miles)||0)*IRS_RATE_PER_MILE - (parseFloat(form.otherExpenses)||0)) / (parseFloat(form.hours)||1))}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
              <input type="text" placeholder="e.g. Slow day, restaurant area, bad weather"
                value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
            </div>

            <div className="flex gap-3">
              <button onClick={addSession} disabled={!form.platform || !form.grossEarnings || !form.hours}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm font-semibold text-white transition">
                Log Session
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-5 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><DollarSign className="w-3 h-3" /> Total earned (net)</div>
              <div className={`text-xl font-bold ${totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totalNet)}</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Clock className="w-3 h-3" /> Real hourly rate</div>
              <div className={`text-xl font-bold ${avgNetHourly >= 15 ? 'text-emerald-400' : avgNetHourly >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                {fmt(avgNetHourly)}/hr
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><TrendingDown className="w-3 h-3" /> Miles cost (total)</div>
              <div className="text-xl font-bold text-red-400">-{fmt(totalMilesCost)}</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><TrendingUp className="w-3 h-3" /> This week</div>
              <div className="text-xl font-bold text-white">{fmt(weekNet)}</div>
              <div className="text-xs text-gray-600">{weekHours.toFixed(1)}h worked</div>
            </div>
          </div>
        )}

        {/* Platform breakdown */}
        {platformRanked.length > 1 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Which platform pays you best (real hourly after expenses)
            </div>
            {platformRanked.map((p, i) => (
              <div key={p.name} className="flex items-center px-4 py-3 border-b border-gray-800/50 last:border-0">
                <div className="flex items-center gap-2 flex-1">
                  {i === 0 && <span className="text-emerald-400 text-xs font-bold">BEST</span>}
                  {i === platformRanked.length - 1 && platformRanked.length > 2 && <span className="text-red-400 text-xs">worst</span>}
                  <span className="text-sm text-white">{p.name}</span>
                  <span className="text-xs text-gray-600">{p.sessions} session{p.sessions !== 1 ? 's' : ''} · {p.hours.toFixed(1)}h</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${i === 0 ? 'text-emerald-400' : 'text-gray-300'}`}>{fmt(p.hourlyNet)}/hr net</div>
                  <div className="text-xs text-gray-600">{fmt(p.net)} total</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-10 text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-semibold text-white mb-2">No sessions logged yet</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-5">
              Log your first work session. Most gig workers make 20–40% less than they think once you subtract gas and mileage. This shows you the real number.
            </p>
            <button onClick={() => setShowForm(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
              Log First Session
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-widest font-semibold">
              Sessions ({sessions.length})
            </div>
            {allCalc.map(s => (
              <div key={s.id} className="border-b border-gray-800/50 last:border-0">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition">
                  <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    className="text-gray-600 hover:text-gray-400 shrink-0">
                    {expandedId === s.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{s.platform}</span>
                      <span className="text-xs text-gray-600">{new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span className="text-xs text-gray-600">· {s.hours}h</span>
                      {s.notes && <span className="text-xs text-gray-700 truncate hidden md:block">{s.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${s.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(s.net)}</div>
                    <div className="text-xs text-gray-600">{fmt(s.hourlyNet)}/hr net</div>
                  </div>
                  <button onClick={() => removeSession(s.id)}
                    className="p-1 text-gray-700 hover:text-red-400 transition shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {expandedId === s.id && (
                  <div className="px-4 pb-3 grid grid-cols-3 md:grid-cols-6 gap-3 text-xs text-center bg-gray-950/50">
                    {[
                      { label: 'Gross', value: fmt(s.grossEarnings), cls: 'text-white' },
                      { label: 'Miles cost', value: `-${fmt(s.milesCost)}`, cls: 'text-red-400' },
                      { label: 'Other exp.', value: `-${fmt(s.otherExpenses)}`, cls: 'text-red-400' },
                      { label: 'Net', value: fmt(s.net), cls: s.net >= 0 ? 'text-emerald-400' : 'text-red-400' },
                      { label: 'Gross/hr', value: fmt(s.hourlyGross), cls: 'text-gray-400' },
                      { label: 'Net/hr', value: fmt(s.hourlyNet), cls: s.hourlyNet >= 15 ? 'text-emerald-400' : 'text-amber-400' },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-900 rounded-lg p-2">
                        <div className="text-gray-600 mb-0.5">{item.label}</div>
                        <div className={`font-bold ${item.cls}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-700 text-center">
          Mileage deduction uses the IRS standard rate of ${IRS_RATE_PER_MILE}/mile (2024).
          This is not tax advice — consult a tax professional for your specific situation.
        </p>
      </div>
    </DashboardLayout>
  );
}
