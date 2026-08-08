'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../lib/store';
import { hasWorldAuthority } from '../../lib/world-authority';

interface EconomicGapView {
  code: string;
  title: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';
}

interface EconomicTradeView {
  id: string;
  reference: string;
  title: string;
  stage: string;
  currency: string;
  expectedRevenue: number | null;
  actualRevenue: number;
  gaps: EconomicGapView[];
}

interface ScopeStructureView {
  label: string;
  lengthFt: number;
  widthFt: number;
  wallHeightFt: number;
  gableHeightFt: number | null;
  rectangularWallSqFt: number;
  gableSqFt: number;
  totalVerticalSqFt: number;
}

interface TradeScopeView {
  id: string;
  version: number;
  totalWashableSqFt: number;
  structures: ScopeStructureView[];
  inclusions: string[];
  exclusions: string[];
  evidenceIds: string[];
  createdAt: string;
}

interface TradePriceView {
  id: string;
  scopeId: string;
  totalWashableSqFt: number;
  benchmarkRatePerSqFt: number;
  marketBasePrice: number;
  laborCost: number;
  directCost: number;
  minimumPriceForMargin: number;
  contingencyPercent: number;
  preRoundedPrice: number;
  fixedPrice: number;
  expectedGrossProfit: number;
  expectedGrossMargin: number;
  benchmarkSourceRef: string;
  benchmarkObservedAt: string;
  createdAt: string;
}

interface ScopePricingSummary {
  scope: TradeScopeView | null;
  price: TradePriceView | null;
}

interface NexusInteraction {
  conversationId: string;
  nova: { reply: string; provider: string };
  execution: { cost: { aiCalls: number; toolCalls: number }; gaps: string[] };
  action: {
    type?: string;
    trade?: EconomicTradeView;
    scopePricingSummary?: ScopePricingSummary;
  } | null;
}

interface PricingDraft {
  benchmarkRatePerSqFt: string;
  benchmarkSourceRef: string;
  benchmarkObservedAt: string;
  laborHours: string;
  internalLaborCostPerHour: string;
  chemicalCost: string;
  travelCost: string;
  equipmentCost: string;
  contingencyPercent: string;
  targetGrossMargin: string;
  roundingIncrement: '1' | '5' | '10' | '25' | '50' | '100';
  notes: string;
}

const INPUT = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/75 outline-none focus:border-cyan-200/35 placeholder:text-white/18';

function currentLocalMinute(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function initialDraft(): PricingDraft {
  return {
    benchmarkRatePerSqFt: '',
    benchmarkSourceRef: '',
    benchmarkObservedAt: currentLocalMinute(),
    laborHours: '',
    internalLaborCostPerHour: '',
    chemicalCost: '',
    travelCost: '',
    equipmentCost: '',
    contingencyPercent: '10',
    targetGrossMargin: '50',
    roundingIncrement: '50',
    notes: '',
  };
}

function money(value: number | null, currency = 'USD', digits = 0): string {
  if (value == null) return 'UNKNOWN';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export default function ScopePricingDock({ onChanged }: { onChanged: () => void }) {
  const { scopes, isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'scope' | 'pricing'>('scope');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [trade, setTrade] = useState<EconomicTradeView | null>(null);
  const [summary, setSummary] = useState<ScopePricingSummary>({ scope: null, price: null });
  const [draft, setDraft] = useState<PricingDraft>(initialDraft);

  const isFounder = isAuthenticated && hasWorldAuthority(scopes);

  const callNexus = useCallback(async (message: string): Promise<NexusInteraction> => {
    const token = localStorage.getItem('nova_access_token') || '';
    if (!token) throw new Error('Founder session token is unavailable.');
    const response = await fetch('/api/proxy/v1/nexus/interact', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId }),
    });
    const body = await response.json();
    if (!response.ok || !body?.success || !body?.data) {
      throw new Error(body?.error?.message || 'Nexus could not complete the scope/pricing operation.');
    }
    const interaction = body.data as NexusInteraction;
    setConversationId(interaction.conversationId);
    if (interaction.action?.trade) setTrade(interaction.action.trade);
    if (interaction.action?.scopePricingSummary) setSummary(interaction.action.scopePricingSummary);
    setNotice(interaction.nova.reply);
    return interaction;
  }, [conversationId]);

  const refresh = useCallback(async () => {
    setBusy('Reading measured scope and price state');
    try {
      await callNexus('Trade #0001\nSCOPE_STATE');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Scope/pricing state is unavailable.');
    } finally {
      setBusy(null);
    }
  }, [callNexus]);

  useEffect(() => {
    if (open && isFounder && !busy && !trade && !notice) void refresh();
  }, [busy, isFounder, notice, open, refresh, trade]);

  const composeScope = useCallback(async () => {
    setBusy('Composing measured scope from accepted evidence');
    try {
      await callNexus('Trade #0001\nCOMPOSE_SCOPE');
      onChanged();
      setTab('pricing');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Scope composition failed.');
    } finally {
      setBusy(null);
    }
  }, [callNexus, onChanged]);

  const calculatePrice = useCallback(async () => {
    const payload = {
      benchmarkRatePerSqFt: Number(draft.benchmarkRatePerSqFt),
      benchmarkSourceRef: draft.benchmarkSourceRef.trim(),
      benchmarkObservedAt: new Date(draft.benchmarkObservedAt).toISOString(),
      laborHours: Number(draft.laborHours),
      internalLaborCostPerHour: Number(draft.internalLaborCostPerHour),
      chemicalCost: Number(draft.chemicalCost),
      travelCost: Number(draft.travelCost),
      equipmentCost: Number(draft.equipmentCost),
      contingencyPercent: Number(draft.contingencyPercent) / 100,
      targetGrossMargin: Number(draft.targetGrossMargin) / 100,
      roundingIncrement: Number(draft.roundingIncrement),
      notes: draft.notes.trim(),
    };
    setBusy('Calculating and persisting one exact fixed bid');
    try {
      await callNexus(`Trade #0001\nPRICING_EVIDENCE:${JSON.stringify(payload)}`);
      onChanged();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Fixed-bid calculation failed.');
    } finally {
      setBusy(null);
    }
  }, [callNexus, draft, onChanged]);

  const evidenceGatesPassed = useMemo(() => {
    if (!trade) return false;
    return ['geometry-and-parcel-membership', 'current-surface-condition']
      .every(code => trade.gaps.find(gap => gap.code === code)?.status === 'RESOLVED');
  }, [trade]);

  if (!isFounder) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-28 right-4 z-[85] rounded-full border border-violet-200/20 bg-[#070510]/85 px-4 py-2 text-[10px] uppercase tracking-[.22em] text-violet-100/70 shadow-2xl backdrop-blur-xl hover:text-white"
      >
        Scope & fixed bid {summary.price ? `· ${money(summary.price.fixedPrice)}` : ''}
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] bg-black/70 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-violet-200/15 bg-[#080710]/98 text-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-white/7 px-5 py-4">
              <div>
                <div className="text-[9px] uppercase tracking-[.32em] text-violet-100/40">Nova OS · Commercial execution</div>
                <h2 className="mt-2 text-xl font-semibold">Measured scope → fixed bid</h2>
                <p className="mt-1 text-xs text-white/35">No category guess. The scope comes from accepted field evidence; the price exposes every input and formula.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45 disabled:opacity-30">refresh</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45">close</button>
              </div>
            </header>

            <nav className="flex gap-2 border-b border-white/7 px-5 py-3">
              {(['scope', 'pricing'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[.18em] ${tab === value ? 'border-violet-200/30 bg-violet-200/8 text-violet-100' : 'border-white/7 text-white/35'}`}
                >
                  {value}
                </button>
              ))}
            </nav>

            <main className="min-h-0 flex-1 overflow-y-auto p-5">
              {busy && <div className="mb-4 rounded-2xl border border-amber-200/15 bg-amber-200/5 px-4 py-3 text-[10px] uppercase tracking-[.2em] text-amber-100/60">{busy}</div>}
              {notice && <div className="mb-4 whitespace-pre-wrap rounded-2xl border border-violet-200/10 bg-violet-200/[.025] px-4 py-3 text-xs leading-relaxed text-violet-50/55">{notice}</div>}

              {tab === 'scope' ? (
                <ScopePanel
                  trade={trade}
                  scope={summary.scope}
                  evidenceGatesPassed={evidenceGatesPassed}
                  busy={Boolean(busy)}
                  onCompose={() => void composeScope()}
                />
              ) : (
                <PricingPanel
                  trade={trade}
                  scope={summary.scope}
                  price={summary.price}
                  draft={draft}
                  setDraft={setDraft}
                  busy={Boolean(busy)}
                  onCalculate={() => void calculatePrice()}
                />
              )}
            </main>
          </div>
        </div>
      )}
    </>
  );
}

function ScopePanel({
  trade,
  scope,
  evidenceGatesPassed,
  busy,
  onCompose,
}: {
  trade: EconomicTradeView | null;
  scope: TradeScopeView | null;
  evidenceGatesPassed: boolean;
  busy: boolean;
  onCompose: () => void;
}) {
  if (!scope) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-white/8 bg-white/[.02] p-5">
          <div className="text-[9px] uppercase tracking-[.24em] text-white/30">Scope gate</div>
          <h3 className="mt-3 text-lg font-semibold">Accepted property evidence required</h3>
          <p className="mt-3 text-xs leading-relaxed text-white/42">Both geometry/parcel membership and current surface-condition fractures must be resolved before Nova will produce a washable-surface takeoff.</p>
          <div className="mt-4 space-y-2">
            {trade?.gaps.filter(gap => ['geometry-and-parcel-membership', 'current-surface-condition'].includes(gap.code)).map(gap => (
              <div key={gap.code} className="flex items-center justify-between rounded-xl border border-white/7 bg-black/20 px-3 py-2 text-xs">
                <span className="text-white/55">{gap.title}</span>
                <span className={gap.status === 'RESOLVED' ? 'text-emerald-300' : 'text-rose-200'}>{gap.status}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onCompose}
            disabled={busy || !evidenceGatesPassed}
            className="mt-5 w-full rounded-2xl border border-violet-200/25 bg-violet-200/8 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.2em] text-violet-100 disabled:opacity-30"
          >
            Compose measured scope
          </button>
        </section>
        <section className="rounded-2xl border border-white/7 bg-black/15 p-5 text-xs leading-relaxed text-white/35">
          The takeoff formula uses each accepted structure’s exterior perimeter × wall height, then adds the combined gable area. The result is versioned, content-hashed, and linked to the exact accepted geometry and condition evidence IDs.
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Scope ID" value={scope.id.slice(0, 8)} />
        <Metric label="Version" value={String(scope.version)} />
        <Metric label="Washable vertical area" value={`${scope.totalWashableSqFt.toLocaleString()} sq ft`} />
        <Metric label="Evidence links" value={String(scope.evidenceIds.length)} />
      </div>
      <section className="overflow-hidden rounded-2xl border border-white/8">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[.035] text-[9px] uppercase tracking-wider text-white/30">
            <tr><th className="px-3 py-2">Structure</th><th className="px-3 py-2">Dimensions</th><th className="px-3 py-2">Walls</th><th className="px-3 py-2">Gables</th><th className="px-3 py-2">Total</th></tr>
          </thead>
          <tbody>
            {scope.structures.map(item => (
              <tr key={item.label} className="border-t border-white/6 text-white/55">
                <td className="px-3 py-3 font-medium text-white/70">{item.label}</td>
                <td className="px-3 py-3">{item.lengthFt} × {item.widthFt} × {item.wallHeightFt} ft</td>
                <td className="px-3 py-3">{item.rectangularWallSqFt.toLocaleString()} sq ft</td>
                <td className="px-3 py-3">{item.gableSqFt.toLocaleString()} sq ft</td>
                <td className="px-3 py-3 text-violet-200">{item.totalVerticalSqFt.toLocaleString()} sq ft</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="Included" items={scope.inclusions} tone="emerald" />
        <ListCard title="Excluded" items={scope.exclusions} tone="rose" />
      </div>
    </div>
  );
}

function PricingPanel({
  trade,
  scope,
  price,
  draft,
  setDraft,
  busy,
  onCalculate,
}: {
  trade: EconomicTradeView | null;
  scope: TradeScopeView | null;
  price: TradePriceView | null;
  draft: PricingDraft;
  setDraft: (draft: PricingDraft) => void;
  busy: boolean;
  onCalculate: () => void;
}) {
  const update = (patch: Partial<PricingDraft>) => setDraft({ ...draft, ...patch });

  if (!scope) {
    return <div className="rounded-2xl border border-amber-200/15 bg-amber-200/5 p-5 text-sm text-amber-100/60">Pricing is blocked until the measured scope is composed.</div>;
  }

  return (
    <div className="space-y-5">
      {price && (
        <section className="rounded-3xl border border-emerald-300/20 bg-[radial-gradient(circle_at_15%_15%,rgba(75,255,180,.12),transparent_40%),rgba(5,24,18,.7)] p-5">
          <div className="text-[9px] uppercase tracking-[.3em] text-emerald-100/40">Persisted fixed bid</div>
          <div className="mt-3 text-4xl font-semibold text-emerald-200">{money(price.fixedPrice, trade?.currency || 'USD')}</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <Metric label="Measured area" value={`${price.totalWashableSqFt.toLocaleString()} sq ft`} />
            <Metric label="Direct cost" value={money(price.directCost)} />
            <Metric label="Gross profit" value={money(price.expectedGrossProfit)} />
            <Metric label="Gross margin" value={`${Math.round(price.expectedGrossMargin * 100)}%`} />
          </div>
          <div className="mt-4 text-[10px] leading-relaxed text-white/35">Market base {money(price.marketBasePrice, 'USD', 2)} · margin floor {money(price.minimumPriceForMargin, 'USD', 2)} · contingency {Math.round(price.contingencyPercent * 100)}% · source {price.benchmarkSourceRef}</div>
        </section>
      )}

      <form
        onSubmit={event => { event.preventDefault(); onCalculate(); }}
        className="rounded-2xl border border-white/8 bg-white/[.02] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-[.25em] text-white/30">Pricing inputs</div>
            <h3 className="mt-2 text-lg font-semibold">Expose every assumption</h3>
          </div>
          <div className="text-right text-[10px] text-white/30">Scope {scope.id.slice(0, 8)}<br />{scope.totalWashableSqFt.toLocaleString()} sq ft</div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Field label="Benchmark $ / sq ft"><input required min="0.01" max="10" step="0.01" type="number" value={draft.benchmarkRatePerSqFt} onChange={event => update({ benchmarkRatePerSqFt: event.target.value })} className={INPUT} /></Field>
          <Field label="Benchmark source ref"><input required value={draft.benchmarkSourceRef} onChange={event => update({ benchmarkSourceRef: event.target.value })} placeholder="https://… or evidence://…" className={INPUT} /></Field>
          <Field label="Benchmark observed at"><input required type="datetime-local" value={draft.benchmarkObservedAt} onChange={event => update({ benchmarkObservedAt: event.target.value })} className={INPUT} /></Field>
          <Field label="Estimated labor hours"><input required min="0.1" step="0.1" type="number" value={draft.laborHours} onChange={event => update({ laborHours: event.target.value })} className={INPUT} /></Field>
          <Field label="Internal labor cost / hour"><input required min="0" step="0.01" type="number" value={draft.internalLaborCostPerHour} onChange={event => update({ internalLaborCostPerHour: event.target.value })} className={INPUT} /></Field>
          <Field label="Chemical cost"><input required min="0" step="0.01" type="number" value={draft.chemicalCost} onChange={event => update({ chemicalCost: event.target.value })} className={INPUT} /></Field>
          <Field label="Travel cost"><input required min="0" step="0.01" type="number" value={draft.travelCost} onChange={event => update({ travelCost: event.target.value })} className={INPUT} /></Field>
          <Field label="Equipment / rental cost"><input required min="0" step="0.01" type="number" value={draft.equipmentCost} onChange={event => update({ equipmentCost: event.target.value })} className={INPUT} /></Field>
          <Field label="Contingency %"><input required min="0" max="50" step="1" type="number" value={draft.contingencyPercent} onChange={event => update({ contingencyPercent: event.target.value })} className={INPUT} /></Field>
          <Field label="Target gross margin %"><input required min="1" max="90" step="1" type="number" value={draft.targetGrossMargin} onChange={event => update({ targetGrossMargin: event.target.value })} className={INPUT} /></Field>
          <Field label="Round fixed bid up to"><select value={draft.roundingIncrement} onChange={event => update({ roundingIncrement: event.target.value as PricingDraft['roundingIncrement'] })} className={INPUT}><option value="1">$1</option><option value="5">$5</option><option value="10">$10</option><option value="25">$25</option><option value="50">$50</option><option value="100">$100</option></select></Field>
          <Field label="Notes"><input value={draft.notes} onChange={event => update({ notes: event.target.value })} className={INPUT} /></Field>
        </div>
        <div className="mt-4 rounded-xl border border-white/7 bg-black/20 p-3 text-[10px] leading-relaxed text-white/35">
          Nova calculates the market-rate price and the minimum price required for your target margin, uses the higher value, adds contingency, then rounds upward. It does not silently choose the most flattering number.
        </div>
        <button type="submit" disabled={busy} className="mt-4 w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/8 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-200 disabled:opacity-30">Calculate and persist exact fixed bid</button>
      </form>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/7 bg-black/20 px-3 py-2"><div className="text-[8px] uppercase tracking-wider text-white/25">{label}</div><div className="mt-1 text-xs font-semibold text-white/65">{value}</div></div>;
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: 'emerald' | 'rose' }) {
  return (
    <section className={`rounded-2xl border p-4 ${tone === 'emerald' ? 'border-emerald-300/15 bg-emerald-300/[.035]' : 'border-rose-300/15 bg-rose-300/[.035]'}`}>
      <h3 className="text-[9px] uppercase tracking-[.24em] text-white/35">{title}</h3>
      <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-white/48">{items.map(item => <li key={item}>- {item}</li>)}</ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[9px] uppercase tracking-[.16em] text-white/30"><span className="mb-1.5 block">{label}</span>{children}</label>;
}
