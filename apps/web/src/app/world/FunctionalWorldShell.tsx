'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../../lib/store';
import { hasWorldAuthority } from '../../lib/world-authority';
import WorldClient from './WorldClient';

type GapStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';

interface EconomicGapView {
  id: string;
  code: string;
  title: string;
  status: GapStatus;
  blockedRequirement: string;
  requiredCapability: string;
  requiredConfidence: number | null;
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
  actions: Array<{ id: string; type: string; title: string; status: string }>;
}

interface EvidenceView {
  id: string;
  type: 'GEOMETRY_MEASUREMENT' | 'SURFACE_CONDITION';
  provenance: string;
  confidence: number;
  contentHash: string;
  createdAt: string;
}

interface EvaluationView {
  id: string;
  gapCode: string;
  evidenceId: string;
  evaluatorType: 'DETERMINISTIC';
  criteriaVersion: string;
  passed: boolean;
  score: number;
  findings: string[];
  createdAt: string;
}

interface EvidenceSummary {
  evidence: EvidenceView[];
  evaluations: EvaluationView[];
}

interface NexusInteraction {
  conversationId: string;
  nova: { reply: string; provider: string };
  execution: { cost: { aiCalls: number; toolCalls: number }; gaps: string[] };
  action: {
    type?: string;
    trade?: EconomicTradeView;
    evidenceSummary?: EvidenceSummary;
  } | null;
}

interface GeometryStructureDraft {
  id: string;
  label: string;
  lengthFt: string;
  widthFt: string;
  wallHeightFt: string;
  gableHeightFt: string;
  parcelMembership: 'CONFIRMED' | 'UNCONFIRMED';
  photoRefs: string;
  notes: string;
}

interface ConditionSurfaceDraft {
  id: string;
  structureLabel: string;
  face: string;
  material: string;
  condition: string;
  contamination: string;
  accessConstraints: string;
  photoRefs: string;
}

const INPUT_CLASS = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs normal-case tracking-normal text-white/75 outline-none focus:border-cyan-200/35';

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function newStructure(): GeometryStructureDraft {
  return {
    id: newId('structure'),
    label: 'Building A',
    lengthFt: '',
    widthFt: '',
    wallHeightFt: '',
    gableHeightFt: '',
    parcelMembership: 'UNCONFIRMED',
    photoRefs: '',
    notes: '',
  };
}

function newSurface(): ConditionSurfaceDraft {
  return {
    id: newId('surface'),
    structureLabel: 'Building A',
    face: 'North',
    material: 'Painted ribbed metal',
    condition: '',
    contamination: '',
    accessConstraints: '',
    photoRefs: '',
  };
}

function splitRefs(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))];
}

function money(value: number | null, currency: string): string {
  if (value == null) return 'UNKNOWN';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function tone(status: string): string {
  if (status === 'RESOLVED' || status === 'AVAILABLE' || status === 'PASSED') return 'text-emerald-300 border-emerald-300/25 bg-emerald-300/5';
  if (status === 'IN_PROGRESS' || status === 'AWAITING_HUMAN') return 'text-amber-200 border-amber-200/25 bg-amber-200/5';
  return 'text-rose-200 border-rose-200/20 bg-rose-200/5';
}

export default function FunctionalWorldShell() {
  const { scopes, isAuthenticated, isLoading, loadUser } = useAuthStore();
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'state' | 'geometry' | 'condition' | 'receipts'>('state');
  const [trade, setTrade] = useState<EconomicTradeView | null>(null);
  const [evidenceSummary, setEvidenceSummary] = useState<EvidenceSummary>({ evidence: [], evaluations: [] });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [worldRevision, setWorldRevision] = useState(0);

  useEffect(() => {
    loadUser().finally(() => setChecked(true));
  }, [loadUser]);

  const isFounder = hasWorldAuthority(scopes);

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
      throw new Error(body?.error?.message || 'Nexus could not complete the operation.');
    }
    const interaction = body.data as NexusInteraction;
    setConversationId(interaction.conversationId);
    if (interaction.action?.type === 'economic_trade') {
      if (interaction.action.trade) setTrade(interaction.action.trade);
      if (interaction.action.evidenceSummary) setEvidenceSummary(interaction.action.evidenceSummary);
    }
    setNotice(interaction.nova.reply);
    return interaction;
  }, [conversationId]);

  const refresh = useCallback(async () => {
    setBusy('Reading durable Trade state');
    try {
      await callNexus('What is blocking Trade #0001, and how do we close it?');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Trade state is unavailable.');
    } finally {
      setBusy(null);
    }
  }, [callNexus]);

  useEffect(() => {
    if (open && !trade && !busy && !notice) void refresh();
  }, [busy, notice, open, refresh, trade]);

  const submitEvidence = useCallback(async (marker: 'GEOMETRY_EVIDENCE:' | 'CONDITION_EVIDENCE:', payload: unknown) => {
    setBusy(marker.startsWith('GEOMETRY') ? 'Evaluating geometry evidence' : 'Evaluating condition evidence');
    try {
      await callNexus(`Trade #0001\n${marker}${JSON.stringify(payload)}`);
      setWorldRevision(value => value + 1);
      setTab('receipts');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Evidence submission failed.');
    } finally {
      setBusy(null);
    }
  }, [callNexus]);

  const blockerCount = useMemo(
    () => trade?.gaps.filter(gap => !['RESOLVED', 'WAIVED'].includes(gap.status)).length ?? null,
    [trade],
  );

  if (!checked || isLoading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white/30 text-xs uppercase tracking-[.32em]">Resolving authority</div>;
  }

  if (!isAuthenticated || !isFounder) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <div className="max-w-md space-y-5">
          <div className="mx-auto h-12 w-12 rounded-2xl border border-cyan-200/20 bg-cyan-200/5 flex items-center justify-center">N</div>
          <h1 className="text-2xl font-semibold">This chamber is private.</h1>
          <p className="text-sm leading-relaxed text-white/45">Nova World is the founder operating floor. Public users receive the focused products, not the internal organism.</p>
          <div className="flex justify-center gap-3">
            <Link href="/login" className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/70 hover:text-white">Sign in</Link>
            <Link href="/flip-calculator" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-5 py-3 text-sm text-emerald-200">Open a public tool</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <WorldClient key={worldRevision} />

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-4 top-4 z-[80] rounded-full border border-cyan-200/20 bg-[#040a14]/85 px-4 py-2 text-[10px] uppercase tracking-[.22em] text-cyan-100/70 shadow-2xl backdrop-blur-xl hover:text-white"
      >
        Evidence intake {blockerCount == null ? '' : `· ${blockerCount} fracture${blockerCount === 1 ? '' : 's'}`}
      </button>

      {open && (
        <div className="absolute inset-0 z-[100] bg-black/65 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-cyan-200/15 bg-[#050b15]/98 text-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-white/7 px-5 py-4">
              <div>
                <div className="text-[9px] uppercase tracking-[.32em] text-cyan-100/40">Nova OS · Evidence boundary</div>
                <h2 className="mt-2 text-xl font-semibold">Trade #0001 verification</h2>
                <p className="mt-1 text-xs text-white/35">Submission does not close a fracture. The deterministic evaluator decides whether the explicit rule passed.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45 hover:text-white disabled:opacity-30">refresh</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45 hover:text-white">close</button>
              </div>
            </header>

            <nav className="flex flex-wrap gap-2 border-b border-white/7 px-5 py-3">
              {(['state', 'geometry', 'condition', 'receipts'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[.18em] ${tab === value ? 'border-cyan-200/30 bg-cyan-200/8 text-cyan-100' : 'border-white/7 text-white/35'}`}
                >
                  {value}
                </button>
              ))}
            </nav>

            <main className="min-h-0 flex-1 overflow-y-auto p-5">
              {busy && <div className="mb-4 rounded-2xl border border-amber-200/15 bg-amber-200/5 px-4 py-3 text-[10px] uppercase tracking-[.2em] text-amber-100/60">{busy}</div>}
              {notice && <div className="mb-4 whitespace-pre-wrap rounded-2xl border border-cyan-200/10 bg-cyan-200/[.025] px-4 py-3 text-xs leading-relaxed text-cyan-50/55">{notice}</div>}

              {tab === 'state' && <TradeState trade={trade} />}
              {tab === 'geometry' && (
                <GeometryEvidenceForm
                  disabled={Boolean(busy) || trade?.gaps.find(gap => gap.code === 'geometry-and-parcel-membership')?.status === 'RESOLVED'}
                  onSubmit={payload => submitEvidence('GEOMETRY_EVIDENCE:', payload)}
                />
              )}
              {tab === 'condition' && (
                <ConditionEvidenceForm
                  disabled={Boolean(busy) || trade?.gaps.find(gap => gap.code === 'current-surface-condition')?.status === 'RESOLVED'}
                  onSubmit={payload => submitEvidence('CONDITION_EVIDENCE:', payload)}
                />
              )}
              {tab === 'receipts' && <Receipts summary={evidenceSummary} />}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeState({ trade }: { trade: EconomicTradeView | null }) {
  if (!trade) return <div className="text-sm text-white/35">Open this panel’s refresh action to read durable Trade state.</div>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-2xl border border-white/7 bg-white/[.02] p-4">
        <div className="text-[9px] uppercase tracking-[.25em] text-white/30">Trade state</div>
        <h3 className="mt-3 text-lg font-semibold">{trade.title}</h3>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Fact label="Stage" value={trade.stage} />
          <Fact label="Expected" value={money(trade.expectedRevenue, trade.currency)} />
          <Fact label="Realized" value={money(trade.actualRevenue, trade.currency)} />
          <Fact label="Actions" value={String(trade.actions.length)} />
        </div>
      </section>
      <section className="space-y-3">
        {trade.gaps.map(gap => (
          <article key={gap.id} className={`rounded-2xl border p-4 ${tone(gap.status)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{gap.title}</h3>
                <div className="mt-1 text-[9px] opacity-55">{gap.id}</div>
              </div>
              <span className="text-[9px] uppercase tracking-wider">{gap.status}</span>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed opacity-70">Blocks: {gap.blockedRequirement}</p>
            <p className="mt-2 text-[10px] opacity-50">Capability: {gap.requiredCapability} · threshold {gap.requiredConfidence == null ? 'unset' : `${Math.round(gap.requiredConfidence * 100)}%`}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/7 bg-black/20 px-3 py-2">
      <div className="text-[8px] uppercase tracking-wider text-white/25">{label}</div>
      <div className="mt-1 text-xs text-white/65">{value}</div>
    </div>
  );
}

function GeometryEvidenceForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (payload: unknown) => void }) {
  const [measuredBy, setMeasuredBy] = useState('Wyatt Kirby');
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [method, setMethod] = useState('Laser distance meter and tape cross-check');
  const [allCaptured, setAllCaptured] = useState(false);
  const [attested, setAttested] = useState(false);
  const [structures, setStructures] = useState<GeometryStructureDraft[]>([newStructure()]);

  const update = (id: string, patch: Partial<GeometryStructureDraft>) => setStructures(current => current.map(item => item.id === id ? { ...item, ...patch } : item));

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSubmit({
          measuredAt: new Date(measuredAt).toISOString(),
          measuredBy,
          measurementMethod: method,
          allInScopeStructuresCaptured: allCaptured,
          attestedAccurate: attested,
          structures: structures.map(item => ({
            label: item.label,
            lengthFt: Number(item.lengthFt),
            widthFt: Number(item.widthFt),
            wallHeightFt: Number(item.wallHeightFt),
            gableHeightFt: item.gableHeightFt ? Number(item.gableHeightFt) : null,
            parcelMembership: item.parcelMembership,
            photoRefs: splitRefs(item.photoRefs),
            notes: item.notes,
          })),
        });
      }}
      className="space-y-4"
    >
      <FormIntro title="Geometry and parcel evidence" text="Measure every included permanent structure. At least two evidence references per structure are required, and parcel membership must be confirmed before the geometry fracture can close." resolved={disabled} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Measured by"><input required value={measuredBy} onChange={event => setMeasuredBy(event.target.value)} className={INPUT_CLASS} /></Field>
        <Field label="Measured at"><input required type="datetime-local" value={measuredAt} onChange={event => setMeasuredAt(event.target.value)} className={INPUT_CLASS} /></Field>
        <Field label="Method"><input required value={method} onChange={event => setMethod(event.target.value)} className={INPUT_CLASS} /></Field>
      </div>
      {structures.map((item, index) => (
        <section key={item.id} className="rounded-2xl border border-white/8 bg-white/[.02] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-white/70">Structure {index + 1}</h3>
            {structures.length > 1 && <button type="button" onClick={() => setStructures(current => current.filter(value => value.id !== item.id))} className="text-[9px] text-rose-200/55">remove</button>}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Field label="Stable label"><input required value={item.label} onChange={event => update(item.id, { label: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Length ft"><input required min="0.01" step="0.01" type="number" value={item.lengthFt} onChange={event => update(item.id, { lengthFt: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Width ft"><input required min="0.01" step="0.01" type="number" value={item.widthFt} onChange={event => update(item.id, { widthFt: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Wall height ft"><input required min="0.01" step="0.01" type="number" value={item.wallHeightFt} onChange={event => update(item.id, { wallHeightFt: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Gable height ft"><input min="0.01" step="0.01" type="number" value={item.gableHeightFt} onChange={event => update(item.id, { gableHeightFt: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Parcel membership"><select value={item.parcelMembership} onChange={event => update(item.id, { parcelMembership: event.target.value as GeometryStructureDraft['parcelMembership'] })} className={INPUT_CLASS}><option value="UNCONFIRMED">Unconfirmed</option><option value="CONFIRMED">Confirmed</option></select></Field>
            <Field label="Evidence refs (2+)"><textarea required rows={2} value={item.photoRefs} onChange={event => update(item.id, { photoRefs: event.target.value })} placeholder="attachment://…&#10;attachment://…" className={INPUT_CLASS} /></Field>
            <Field label="Notes"><textarea rows={2} value={item.notes} onChange={event => update(item.id, { notes: event.target.value })} className={INPUT_CLASS} /></Field>
          </div>
        </section>
      ))}
      <button type="button" onClick={() => setStructures(current => [...current, { ...newStructure(), label: `Building ${String.fromCharCode(65 + current.length)}` }])} className="rounded-xl border border-white/10 px-4 py-2 text-[10px] text-white/50">Add structure</button>
      <Attest checked={allCaptured} onChange={setAllCaptured} text="Every in-scope permanent structure is represented." />
      <Attest checked={attested} onChange={setAttested} text="I attest that these measurements and evidence references are current and accurate." />
      <Submit disabled={disabled} label={disabled ? 'Geometry fracture already resolved' : 'Persist and evaluate geometry evidence'} />
    </form>
  );
}

function ConditionEvidenceForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (payload: unknown) => void }) {
  const [observedBy, setObservedBy] = useState('Wyatt Kirby');
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [allCaptured, setAllCaptured] = useState(false);
  const [attested, setAttested] = useState(false);
  const [waterAccess, setWaterAccess] = useState<'CONFIRMED' | 'UNCONFIRMED' | 'UNKNOWN'>('UNKNOWN');
  const [surfaces, setSurfaces] = useState<ConditionSurfaceDraft[]>([newSurface()]);

  const update = (id: string, patch: Partial<ConditionSurfaceDraft>) => setSurfaces(current => current.map(item => item.id === id ? { ...item, ...patch } : item));

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSubmit({
          observedAt: new Date(observedAt).toISOString(),
          observedBy,
          allInScopeFacesCaptured: allCaptured,
          attestedAccurate: attested,
          waterAccess,
          surfaces: surfaces.map(item => ({
            structureLabel: item.structureLabel,
            face: item.face,
            material: item.material,
            condition: item.condition,
            contamination: splitRefs(item.contamination),
            accessConstraints: item.accessConstraints,
            photoRefs: splitRefs(item.photoRefs),
          })),
        });
      }}
      className="space-y-4"
    >
      <FormIntro title="Current surface-condition evidence" text="Record every in-scope exterior face, current material and contamination, access constraints, water status, and at least one current photo reference per face." resolved={disabled} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Observed by"><input required value={observedBy} onChange={event => setObservedBy(event.target.value)} className={INPUT_CLASS} /></Field>
        <Field label="Observed at"><input required type="datetime-local" value={observedAt} onChange={event => setObservedAt(event.target.value)} className={INPUT_CLASS} /></Field>
        <Field label="Water access"><select value={waterAccess} onChange={event => setWaterAccess(event.target.value as typeof waterAccess)} className={INPUT_CLASS}><option value="UNKNOWN">Unknown</option><option value="UNCONFIRMED">Unconfirmed</option><option value="CONFIRMED">Confirmed</option></select></Field>
      </div>
      {surfaces.map((item, index) => (
        <section key={item.id} className="rounded-2xl border border-white/8 bg-white/[.02] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-white/70">Structure face {index + 1}</h3>
            {surfaces.length > 1 && <button type="button" onClick={() => setSurfaces(current => current.filter(value => value.id !== item.id))} className="text-[9px] text-rose-200/55">remove</button>}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Field label="Structure label"><input required value={item.structureLabel} onChange={event => update(item.id, { structureLabel: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Face / orientation"><input required value={item.face} onChange={event => update(item.id, { face: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Material"><input required value={item.material} onChange={event => update(item.id, { material: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Current condition"><textarea required rows={2} value={item.condition} onChange={event => update(item.id, { condition: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Contamination"><textarea rows={2} value={item.contamination} onChange={event => update(item.id, { contamination: event.target.value })} placeholder="organic growth, surface dirt" className={INPUT_CLASS} /></Field>
            <Field label="Access constraints"><textarea required rows={2} value={item.accessConstraints} onChange={event => update(item.id, { accessConstraints: event.target.value })} className={INPUT_CLASS} /></Field>
            <Field label="Current photo refs"><textarea required rows={2} value={item.photoRefs} onChange={event => update(item.id, { photoRefs: event.target.value })} placeholder="attachment://…" className={INPUT_CLASS} /></Field>
          </div>
        </section>
      ))}
      <button type="button" onClick={() => setSurfaces(current => [...current, newSurface()])} className="rounded-xl border border-white/10 px-4 py-2 text-[10px] text-white/50">Add structure face</button>
      <Attest checked={allCaptured} onChange={setAllCaptured} text="Every in-scope exterior face is represented." />
      <Attest checked={attested} onChange={setAttested} text="I attest that these observations and photo references are current and accurate." />
      <Submit disabled={disabled} label={disabled ? 'Condition fracture already resolved' : 'Persist and evaluate condition evidence'} />
    </form>
  );
}

function Receipts({ summary }: { summary: EvidenceSummary }) {
  if (!summary.evidence.length && !summary.evaluations.length) return <div className="text-sm text-white/35">No typed evidence receipts have been recorded yet.</div>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h3 className="text-[10px] uppercase tracking-[.25em] text-white/35">Evidence</h3>
        <div className="mt-3 space-y-3">
          {summary.evidence.map(item => (
            <article key={item.id} className="rounded-2xl border border-white/8 bg-white/[.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-semibold text-white/70">{item.type.replace(/_/g, ' ')}</div>
                <span className="text-[9px] text-cyan-200/55">{Math.round(item.confidence * 100)}%</span>
              </div>
              <div className="mt-2 text-[9px] text-white/30">{item.id} · {item.provenance}</div>
              <div className="mt-1 text-[8px] text-white/20">hash {item.contentHash.slice(0, 16)}…</div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-[10px] uppercase tracking-[.25em] text-white/35">Evaluations</h3>
        <div className="mt-3 space-y-3">
          {summary.evaluations.map(item => (
            <article key={item.id} className={`rounded-2xl border p-4 ${item.passed ? tone('RESOLVED') : tone('OPEN')}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold">{item.gapCode.replace(/-/g, ' ')}</div>
                  <div className="mt-1 text-[9px] opacity-45">{item.criteriaVersion} · {item.evaluatorType}</div>
                </div>
                <span className="text-[9px] font-semibold">{item.passed ? 'PASSED' : 'FAILED'} · {Math.round(item.score * 100)}%</span>
              </div>
              {item.findings.length > 0 && <ul className="mt-3 space-y-1 text-[10px] opacity-65">{item.findings.map(finding => <li key={finding}>- {finding}</li>)}</ul>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FormIntro({ title, text, resolved }: { title: string; text: string; resolved: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${resolved ? tone('RESOLVED') : 'border-cyan-200/10 bg-cyan-200/[.025]'}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-[11px] leading-relaxed opacity-60">{resolved ? 'This fracture is already resolved. The form is locked to preserve the accepted evidence path.' : text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[9px] uppercase tracking-[.16em] text-white/30"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function Attest({ checked, onChange, text }: { checked: boolean; onChange: (value: boolean) => void; text: string }) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[.02] p-3 text-[11px] leading-relaxed text-white/50">
      <input required type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5" />
      <span>{text}</span>
    </label>
  );
}

function Submit({ disabled, label }: { disabled: boolean; label: string }) {
  return <button type="submit" disabled={disabled} className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/8 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-200 disabled:opacity-35">{label}</button>;
}
