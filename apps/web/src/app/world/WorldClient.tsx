'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  Beat,
  NovaMode,
  SwarmEventInput,
  NebulaData,
  WorldStage,
} from '../../components/world/ArrivalScene';

const ArrivalScene = dynamic(() => import('../../components/world/ArrivalScene'), { ssr: false });

interface PulseEvent {
  id: string;
  kind: string;
  sector: 'core' | 'market' | 'bazaar' | 'forge';
  label: string;
  ts: string;
}

interface Pulse {
  pulse: PulseEvent[];
  sectors: {
    market: { session: 'open' | 'closed'; symbol: string; price: number; changePct: number } | null;
    bazaar: { flipsTracked: number; appraised24h: number } | null;
    forge: { cardsTotal: number; forged24h: number } | null;
  };
  standing: { users: number; agentRunsCompleted: number; outcomeValue: number } | null;
  generatedAt: string;
}

interface CapabilityRouteView {
  id: string;
  name: string;
  providerType: 'EXTERNAL_DATA' | 'LOCAL_TOOL' | 'HUMAN_TASK';
  status: 'AVAILABLE' | 'GATED' | 'RESERVED' | 'DEGRADED';
  authority: 'OBSERVE' | 'RECOMMEND' | 'ASSIST' | 'AUTOMATE';
  riskTier: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  expectedConfidence: number | null;
  expectedCostUsd: number | null;
  blockingReason: string | null;
  description: string;
}

interface EconomicGapView {
  id: string;
  code: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'WAIVED';
  blocking: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  provenance: string;
  blockedRequirement: string;
  requiredCapability: string;
  requiredConfidence: number | null;
  routes: CapabilityRouteView[];
}

interface EconomicActionView {
  id: string;
  type: string;
  title: string;
  status: string;
  authority: string;
  riskTier: string;
  createdAt: string;
  updatedAt: string;
  payload: {
    checklist?: string[];
    completionRule?: string;
    [key: string]: unknown;
  };
}

interface EconomicEventView {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

interface EconomicTradeView {
  id: string;
  reference: string;
  title: string;
  seller: string;
  buyer: string;
  market: string;
  stage: string;
  status: string;
  currency: string;
  expectedRevenue: number | null;
  actualRevenue: number;
  provenance: string;
  gaps: EconomicGapView[];
  actions: EconomicActionView[];
  events: EconomicEventView[];
  nextAction: {
    id: string;
    label: string;
    capabilityId: string;
    authority: string;
    reason: string;
  } | null;
  updatedAt: string;
}

interface NexusInteraction {
  interactionId: string;
  conversationId: string;
  execution: {
    mode: 'reasoning' | 'direct' | 'composed';
    capabilities: string[];
    evidence: Array<{ capabilityId: string; summary: string; source: string }>;
    gaps: string[];
    cost: { aiCalls: number; toolCalls: number };
  };
  authority: {
    mode: 'observe' | 'recommend' | 'assist' | 'automate';
    externalSideEffectsPerformed: boolean;
    humanApprovalRequiredForSideEffects: boolean;
  };
  nova: { reply: string; provider: string };
  memory: { persisted: boolean; artifactId: string | null; outcomeClosable: boolean };
  action: {
    type?: string;
    deterministic?: boolean;
    command?: string;
    trade?: EconomicTradeView;
    [key: string]: unknown;
  } | null;
}

interface Message {
  role: 'nova' | 'visitor';
  text: string;
  provider?: string;
  interaction?: NexusInteraction;
}

interface MyAgent {
  id: string;
  name: string;
  symbol: string | null;
  latest_finding: string | null;
}

const SEEN_KEY = 'nova_world_seen';
const VISITOR_KEY = 'nova_visitor_id';
let wasHereBefore: boolean | null = null;

function getToken(): string {
  return typeof window === 'undefined' ? '' : localStorage.getItem('nova_access_token') || '';
}

function getVisitorId(): string {
  let value = localStorage.getItem(VISITOR_KEY);
  if (!value) {
    value = 'v_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(VISITOR_KEY, value);
  }
  return value;
}

function evaluateReturning(): boolean {
  if (wasHereBefore === null) {
    wasHereBefore = localStorage.getItem(SEEN_KEY) === '1';
    localStorage.setItem(SEEN_KEY, '1');
  }
  return wasHereBefore;
}

function money(value: number | null, currency = 'USD'): string {
  if (value == null) return 'UNKNOWN';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function timeLabel(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusTone(status: string): string {
  if (status === 'AVAILABLE' || status === 'SUCCEEDED' || status === 'RESOLVED') return '#67f2bd';
  if (status === 'GATED' || status === 'IN_PROGRESS' || status === 'AWAITING_HUMAN') return '#ffd27a';
  if (status === 'RESERVED' || status === 'DEGRADED') return '#7f96aa';
  if (status === 'FAILED') return '#ff738f';
  return '#9adff5';
}

export default function WorldClient() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [beat, setBeat] = useState<Beat>('void');
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [pulseDark, setPulseDark] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [trade, setTrade] = useState<EconomicTradeView | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastInteraction, setLastInteraction] = useState<NexusInteraction | null>(null);
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [encounter, setEncounter] = useState<string | null>(null);
  const encounterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returning = useRef(false);
  const firstPulseIds = useRef<Set<string> | null>(null);
  const visitorId = useRef('');
  const bootTradeRequested = useRef(false);

  const stage = useRef<WorldStage>({
    t: 0,
    beat: 'void' as Beat,
    beatT: 0,
    mode: 'idle' as NovaMode,
    skip: false,
    pulseAlive: false,
  });

  const open = beat === 'open';

  const onEncounter = useCallback((notice: { reason: string }) => {
    setEncounter(notice.reason);
    if (encounterTimer.current) clearTimeout(encounterTimer.current);
    encounterTimer.current = setTimeout(() => setEncounter(null), 7000);
  }, []);

  const fetchMyAgents = useCallback(async () => {
    if (!visitorId.current) return;
    try {
      const response = await fetch(`/api/proxy/v1/world/agents?visitor=${visitorId.current}`);
      const body = await response.json();
      if (body?.success) setMyAgents(body.data.agents || []);
    } catch {
      setMyAgents([]);
    }
  }, []);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setIsMobile(window.innerWidth < 768);
    returning.current = evaluateReturning();
    stage.current.skip = returning.current;
    visitorId.current = getVisitorId();
    fetchMyAgents();
  }, [fetchMyAgents]);

  const fetchPulse = useCallback(async () => {
    try {
      const response = await fetch('/api/proxy/v1/world/pulse');
      const body = await response.json();
      if (body?.success && body.data) {
        const nextPulse = body.data as Pulse;
        if (firstPulseIds.current === null) firstPulseIds.current = new Set(nextPulse.pulse.map(event => event.id));
        setPulse(nextPulse);
        setPulseDark(false);
        stage.current.pulseAlive = true;
      } else {
        setPulseDark(true);
        stage.current.pulseAlive = false;
      }
    } catch {
      setPulseDark(true);
      stage.current.pulseAlive = false;
    }
  }, []);

  useEffect(() => {
    fetchPulse();
    const interval = setInterval(fetchPulse, 20_000);
    return () => clearInterval(interval);
  }, [fetchPulse]);

  const callNexus = useCallback(async (message: string, currentConversationId: string | null): Promise<NexusInteraction> => {
    const token = getToken();
    if (!token) throw new Error('Founder session token is unavailable.');

    const response = await fetch('/api/proxy/v1/nexus/interact', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, conversationId: currentConversationId }),
    });
    const body = await response.json();
    if (!response.ok || !body?.success || !body?.data) {
      throw new Error(body?.error?.message || 'Nexus could not complete the interaction.');
    }
    return body.data as NexusInteraction;
  }, []);

  const applyInteraction = useCallback((interaction: NexusInteraction, showReply = true) => {
    setConversationId(interaction.conversationId);
    setLastInteraction(interaction);
    const economicTrade = interaction.action?.type === 'economic_trade' ? interaction.action.trade : null;
    if (economicTrade) {
      setTrade(economicTrade);
      setTradeOpen(true);
    }
    if (showReply) {
      setMessages(current => [...current, {
        role: 'nova',
        text: interaction.nova.reply,
        provider: interaction.nova.provider,
        interaction,
      }]);
    }
  }, []);

  const loadTradeState = useCallback(async () => {
    if (bootTradeRequested.current) return;
    bootTradeRequested.current = true;
    setOperation('Reading durable Trade state');
    stage.current.mode = 'thinking';
    try {
      const interaction = await callNexus('What is blocking the current field-measurement case, and how do we close it?', null);
      applyInteraction(interaction, true);
      stage.current.mode = 'found';
      setTimeout(() => { stage.current.mode = 'idle'; }, 900);
    } catch (error) {
      bootTradeRequested.current = false;
      setMessages(current => [...current, {
        role: 'nova',
        text: error instanceof Error ? error.message : 'Trade state is unavailable.',
        provider: 'system',
      }]);
      stage.current.mode = 'idle';
    } finally {
      setOperation(null);
    }
  }, [applyInteraction, callNexus]);

  useEffect(() => {
    if (reduced === null) return;
    const timeout = setTimeout(loadTradeState, 120);
    return () => clearTimeout(timeout);
  }, [loadTradeState, reduced]);

  const send = useCallback(async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || thinking) return;
    setInput('');
    setMessages(current => [...current, { role: 'visitor', text: message }]);
    setThinking(true);
    setOperation(/field[-\s]?measurement/i.test(message) ? 'Creating durable human task' : 'Resolving through Nexus');
    stage.current.mode = 'thinking';

    try {
      const interaction = await callNexus(message, conversationId);
      applyInteraction(interaction, true);
      stage.current.mode = 'found';
      setTimeout(() => { stage.current.mode = 'idle'; }, 900);
    } catch (error) {
      setMessages(current => [...current, {
        role: 'nova',
        text: error instanceof Error ? error.message : 'Nexus is unavailable.',
        provider: 'system',
      }]);
      stage.current.mode = 'idle';
    } finally {
      setThinking(false);
      setOperation(null);
    }
  }, [applyInteraction, callNexus, conversationId, input, thinking]);

  const createFieldMeasurementTask = useCallback(() => {
    void send('Create the field measurement task for the private operating case.');
  }, [send]);

  const onBeat = useCallback((nextBeat: Beat) => setBeat(nextBeat), []);
  const hasten = useCallback(() => { stage.current.skip = true; }, []);

  const events: SwarmEventInput[] = useMemo(() => {
    if (!pulse) return [];
    return pulse.pulse.map(event => ({
      id: event.id,
      sector: event.sector,
      kind: event.kind,
      fresh: firstPulseIds.current ? !firstPulseIds.current.has(event.id) : false,
    }));
  }, [pulse]);

  const nebulae: NebulaData[] = useMemo(() => {
    const market = pulse?.sectors.market ?? null;
    const bazaar = pulse?.sectors.bazaar ?? null;
    const forge = pulse?.sectors.forge ?? null;
    return [
      {
        key: 'market',
        label: 'The Market',
        href: '/market',
        sub: market ? `${market.symbol} $${market.price.toFixed(2)} · ${market.changePct >= 0 ? '+' : ''}${market.changePct.toFixed(2)}% · ${market.session}` : null,
        active: market ? (market.session === 'open' ? 0.9 : 0.4) : 0.08,
        weather: market ? Math.max(-1, Math.min(1, market.changePct / 2)) : 0,
      },
      {
        key: 'bazaar',
        label: 'The Bazaar',
        href: '/bazaar',
        sub: bazaar ? `${bazaar.flipsTracked} tracked · ${bazaar.appraised24h} appraised today` : null,
        active: bazaar ? Math.min(1, 0.3 + bazaar.appraised24h * 0.2) : 0.08,
        weather: 0,
      },
      {
        key: 'forge',
        label: 'The Forge',
        href: '/forge',
        sub: forge ? `${forge.cardsTotal} cards · ${forge.forged24h} today` : null,
        active: forge ? Math.min(1, 0.3 + forge.forged24h * 0.15) : 0.08,
        weather: 0,
      },
    ];
  }, [pulse]);

  if (reduced === null) return <div className="fixed inset-0 bg-[#01030a]" />;

  if (reduced) {
    return (
      <div className="fixed inset-0 overflow-auto bg-[#01030a] text-white p-4 md:p-8">
        <div className="mx-auto max-w-7xl grid gap-4 lg:grid-cols-[1fr_430px]">
          <section className="min-h-[70vh] rounded-3xl border border-cyan-300/15 bg-[radial-gradient(circle_at_50%_25%,rgba(65,170,220,.16),transparent_40%),rgba(4,9,18,.92)] p-5 flex flex-col">
            <header className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[.42em] text-cyan-200/55">Nova OS · Private</div>
                <h1 className="mt-2 text-2xl font-semibold">Functional World Cockpit</h1>
              </div>
              <RuntimeBadge interaction={lastInteraction} operation={operation} pulseDark={pulseDark} />
            </header>
            <div className="flex-1 flex items-center justify-center py-12">
              <TradeOrb trade={trade} selected={tradeOpen} onSelect={() => setTradeOpen(true)} />
            </div>
            <NexusChat messages={messages} input={input} setInput={setInput} send={() => void send()} thinking={thinking} operation={operation} />
          </section>
          <TradeInspector trade={trade} open={tradeOpen} onClose={() => setTradeOpen(false)} onCreateTask={createFieldMeasurementTask} busy={thinking} />
        </div>
      </div>
    );
  }

  const wordmarkCorner = beat === 'window' || open;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#01030a]" onPointerDown={!open ? hasten : undefined}>
      <div className="absolute inset-0">
        <ArrivalScene
          stage={stage.current}
          events={events}
          nebulae={nebulae}
          isMobile={isMobile}
          onBeat={onBeat}
          onEncounter={onEncounter}
        />
      </div>

      {wordmarkCorner && (
        <a
          href="/"
          className="absolute left-5 top-5 z-20 text-[11px] uppercase tracking-[.35em] text-[#7fa6c2] no-underline"
        >
          novanexus
        </a>
      )}

      {open && (
        <div className="absolute left-4 top-14 z-20 flex flex-col gap-3">
          <RuntimeBadge interaction={lastInteraction} operation={operation} pulseDark={pulseDark} />
          <TradeOrb trade={trade} selected={tradeOpen} onSelect={() => setTradeOpen(value => !value)} />
          {myAgents.length > 0 && (
            <div className="w-64 rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur-xl">
              <div className="mb-2 text-[9px] uppercase tracking-[.3em] text-white/35">durable watchers</div>
              {myAgents.slice(0, 4).map(agent => (
                <div key={agent.id} className="mb-2 last:mb-0">
                  <div className="text-xs text-cyan-100/75">◆ {agent.name}</div>
                  {agent.latest_finding && <div className="mt-0.5 text-[10px] leading-snug text-white/35">{agent.latest_finding}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {open && tradeOpen && (
        <div className="absolute right-3 top-3 bottom-28 z-30 w-[min(430px,calc(100vw-1.5rem))]">
          <TradeInspector trade={trade} open onClose={() => setTradeOpen(false)} onCreateTask={createFieldMeasurementTask} busy={thinking} />
        </div>
      )}

      {open && encounter && (
        <div className="absolute left-1/2 top-[11%] z-20 -translate-x-1/2 text-[11px] italic tracking-[.14em] text-[#7fa6c2]">
          {encounter}
        </div>
      )}

      {!open && !stage.current.skip && (
        <div className="absolute bottom-6 right-6 z-20 text-[10px] uppercase tracking-[.25em] text-white/25">
          click to enter cockpit
        </div>
      )}

      <div
        className="absolute left-1/2 z-30 w-full max-w-3xl -translate-x-1/2 px-4 transition-opacity duration-700"
        style={{ bottom: 18, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      >
        <NexusChat messages={messages} input={input} setInput={setInput} send={() => void send()} thinking={thinking} operation={operation} />
      </div>
    </div>
  );
}

function RuntimeBadge({
  interaction,
  operation,
  pulseDark,
}: {
  interaction: NexusInteraction | null;
  operation: string | null;
  pulseDark: boolean;
}) {
  const aiCalls = interaction?.execution.cost.aiCalls ?? null;
  const provider = interaction?.nova.provider || null;
  const deterministic = provider?.startsWith('deterministic:') || aiCalls === 0;

  return (
    <div className="w-fit rounded-full border border-cyan-200/15 bg-black/40 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[.22em] text-white/45">
        <span className={`h-1.5 w-1.5 rounded-full ${operation ? 'animate-pulse bg-amber-300' : pulseDark ? 'bg-slate-500' : 'bg-emerald-300'}`} />
        {operation || (deterministic ? 'state lane · zero llm' : provider || 'runtime ready')}
      </div>
    </div>
  );
}

function TradeOrb({
  trade,
  selected,
  onSelect,
}: {
  trade: EconomicTradeView | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const blockers = trade?.gaps.filter(gap => gap.blocking && !['RESOLVED', 'WAIVED'].includes(gap.status)).length ?? 0;
  return (
    <button
      type="button"
      onClick={event => { event.stopPropagation(); onSelect(); }}
      className="group relative w-64 overflow-hidden rounded-3xl border p-4 text-left backdrop-blur-xl transition hover:-translate-y-0.5"
      style={{
        borderColor: selected ? 'rgba(130,225,255,.5)' : 'rgba(130,225,255,.18)',
        background: 'radial-gradient(circle at 18% 10%, rgba(112,220,255,.18), transparent 42%), rgba(2,8,18,.74)',
        boxShadow: blockers > 0 ? '0 0 42px rgba(255,105,135,.10)' : '0 0 38px rgba(95,230,190,.10)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-[.32em] text-cyan-100/45">Private operating case</div>
          <div className="mt-2 text-sm font-semibold text-white/90">Durable verification workspace</div>
          <div className="mt-1 text-[10px] text-white/35">{trade?.stage || 'reading durable state…'}</div>
        </div>
        <div className="relative h-12 w-12 shrink-0 rounded-full border border-cyan-200/20 bg-cyan-200/5">
          <div className="absolute inset-2 rounded-full border border-cyan-200/25" />
          {blockers > 0 && <div className="absolute left-1/2 top-0 h-full w-px -rotate-[28deg] bg-rose-300/70 shadow-[0_0_12px_rgba(255,100,140,.8)]" />}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat label="blockers" value={trade ? String(blockers) : '—'} tone={blockers ? '#ff8ca3' : '#67f2bd'} />
        <MiniStat label="expected" value={trade ? money(trade.expectedRevenue, trade.currency) : '—'} />
        <MiniStat label="realized" value={trade ? money(trade.actualRevenue, trade.currency) : '—'} />
      </div>
      <div className="mt-3 text-[10px] text-cyan-100/45 group-hover:text-cyan-100/70">Select to inspect and operate →</div>
    </button>
  );
}

function MiniStat({ label, value, tone = '#c6e9f5' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[.025] px-2 py-2">
      <div className="text-[8px] uppercase tracking-wider text-white/25">{label}</div>
      <div className="mt-1 truncate text-[11px] font-semibold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function TradeInspector({
  trade,
  open,
  onClose,
  onCreateTask,
  busy,
}: {
  trade: EconomicTradeView | null;
  open: boolean;
  onClose: () => void;
  onCreateTask: () => void;
  busy: boolean;
}) {
  if (!open) return null;
  if (!trade) {
    return (
      <aside className="h-full rounded-3xl border border-cyan-200/15 bg-[#050b15]/95 p-5 text-white shadow-2xl backdrop-blur-2xl">
        <div className="text-[10px] uppercase tracking-[.3em] text-white/35">Trade inspector</div>
        <div className="mt-8 text-sm text-white/45">Reading durable Trade state…</div>
      </aside>
    );
  }

  const openGaps = trade.gaps.filter(gap => gap.status !== 'RESOLVED' && gap.status !== 'WAIVED');
  const fieldTask = trade.actions.find(action => action.type === 'FIELD_MEASUREMENT');

  return (
    <aside className="h-full overflow-y-auto rounded-3xl border border-cyan-200/15 bg-[#050b15]/95 p-5 text-white shadow-2xl backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[9px] uppercase tracking-[.32em] text-cyan-100/40">Trade #{trade.reference}</div>
          <h2 className="mt-2 text-lg font-semibold leading-tight">{trade.title}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-wider">
            <span className="rounded-full border border-cyan-200/15 px-2 py-1 text-cyan-100/60">{trade.stage}</span>
            <span className="rounded-full border border-white/10 px-2 py-1 text-white/40">{trade.provenance}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/40 hover:text-white">close</button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <MiniStat label="Expected revenue" value={money(trade.expectedRevenue, trade.currency)} />
        <MiniStat label="Actual revenue" value={money(trade.actualRevenue, trade.currency)} />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-[.28em] text-white/40">Blocking fractures</h3>
          <span className="text-[10px] text-rose-200/70">{openGaps.length} open</span>
        </div>
        <div className="space-y-3">
          {openGaps.map(gap => (
            <div key={gap.id} className="rounded-2xl border border-rose-300/12 bg-rose-300/[.035] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/85">{gap.title}</div>
                  <div className="mt-1 text-[10px] text-white/35">ID {gap.id}</div>
                </div>
                <span className="rounded-full border px-2 py-1 text-[8px] uppercase tracking-wider" style={{ color: statusTone(gap.status), borderColor: `${statusTone(gap.status)}44` }}>{gap.status}</span>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/48">{gap.description}</p>
              <div className="mt-3 rounded-xl border border-white/6 bg-black/20 p-2.5 text-[10px] leading-relaxed text-white/45">
                <div><span className="text-white/25">Blocks:</span> {gap.blockedRequirement}</div>
                <div className="mt-1"><span className="text-white/25">Capability:</span> {gap.requiredCapability}</div>
                <div className="mt-1"><span className="text-white/25">Confidence required:</span> {gap.requiredConfidence == null ? 'not set' : `${Math.round(gap.requiredConfidence * 100)}%`}</div>
              </div>

              <div className="mt-3 space-y-2">
                {gap.routes.map(route => (
                  <div key={route.id} className="rounded-xl border border-white/7 bg-white/[.025] p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium text-white/70">{route.name}</div>
                      <span className="text-[8px] uppercase tracking-wider" style={{ color: statusTone(route.status) }}>{route.status}</span>
                    </div>
                    <div className="mt-1 text-[9px] text-white/30">{route.providerType} · {route.authority} · {route.riskTier} · confidence {route.expectedConfidence == null ? 'unknown' : `${Math.round(route.expectedConfidence * 100)}%`}</div>
                    <p className="mt-2 text-[10px] leading-relaxed text-white/38">{route.description}</p>
                    {route.blockingReason && <p className="mt-1 text-[9px] leading-relaxed text-amber-200/50">Blocked: {route.blockingReason}</p>}
                    {route.id === 'field_measurement_task' && !fieldTask && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={onCreateTask}
                        className="mt-3 w-full rounded-xl border border-emerald-300/25 bg-emerald-300/8 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 disabled:opacity-40"
                      >
                        Create durable field task
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {fieldTask && (
        <section className="mt-6 rounded-2xl border border-amber-200/15 bg-amber-200/[.035] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-[.25em] text-amber-100/45">Active human task</div>
              <div className="mt-2 text-sm font-semibold text-white/80">{fieldTask.title}</div>
            </div>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: statusTone(fieldTask.status) }}>{fieldTask.status}</span>
          </div>
          <div className="mt-2 text-[9px] text-white/30">Task {fieldTask.id} · {fieldTask.authority} · {fieldTask.riskTier}</div>
          {Array.isArray(fieldTask.payload.checklist) && (
            <ol className="mt-4 space-y-2">
              {fieldTask.payload.checklist.map((item, index) => (
                <li key={item} className="flex gap-2 text-[10px] leading-relaxed text-white/48">
                  <span className="text-amber-200/55">{index + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          )}
          {fieldTask.payload.completionRule && <div className="mt-4 border-t border-white/7 pt-3 text-[9px] leading-relaxed text-white/35">{fieldTask.payload.completionRule}</div>}
        </section>
      )}

      <section className="mt-6">
        <h3 className="text-[10px] uppercase tracking-[.28em] text-white/40">Event nerve</h3>
        <div className="mt-3 space-y-2">
          {trade.events.slice(0, 8).map(event => (
            <div key={event.id} className="border-l border-cyan-200/15 pl-3">
              <div className="text-[10px] text-white/55">{event.type.replace(/_/g, ' ')}</div>
              <div className="mt-0.5 text-[8px] text-white/25">{timeLabel(event.occurredAt)}</div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function NexusChat({
  messages,
  input,
  setInput,
  send,
  thinking,
  operation,
}: {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  send: () => void;
  thinking: boolean;
  operation: string | null;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  return (
    <div className="w-full rounded-3xl border border-cyan-200/15 bg-[#040a14]/80 p-3 shadow-2xl backdrop-blur-2xl">
      <div ref={logRef} className="max-h-48 overflow-y-auto space-y-3 px-2" style={{ scrollbarWidth: 'none' }}>
        {messages.slice(-10).map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === 'visitor' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-[12px] leading-relaxed ${message.role === 'visitor' ? 'bg-cyan-300/8 text-cyan-50/60' : 'text-cyan-50/78'}`}
            >
              {message.text}
            </div>
            {message.provider && message.role === 'nova' && (
              <div className="mt-1 px-3 text-[8px] uppercase tracking-[.18em] text-white/20">
                {message.provider}{message.interaction ? ` · ${message.interaction.execution.cost.aiCalls} ai / ${message.interaction.execution.cost.toolCalls} tool` : ''}
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="px-3 py-2 text-[9px] uppercase tracking-[.26em] text-amber-100/45">
            {operation || 'working'}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-full border border-cyan-200/20 bg-black/30 px-4 py-3">
        <input
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) send(); }}
          placeholder="Command Nova OS…"
          className="min-w-0 flex-1 bg-transparent text-sm text-cyan-50/80 outline-none placeholder:text-white/20"
        />
        <button
          type="button"
          onClick={send}
          disabled={thinking || !input.trim()}
          className="text-[10px] uppercase tracking-[.22em] text-cyan-200 disabled:opacity-25"
        >
          execute
        </button>
      </div>
    </div>
  );
}
