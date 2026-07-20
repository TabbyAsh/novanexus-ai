'use client';

/**
 * THE WORLD — client orchestrator for the Nexus arrival (v2).
 *
 * Binds the 3D body (ArrivalScene) to real blood: /v1/world/pulse feeds the
 * swarm and the nebulae; /v1/world/hail is Nova speaking. The DOM layer
 * choreographs to the scene's beats: the detonation flash, the wordmark that
 * lands with the sigil and then lives in the corner, the window that opens
 * exactly where the X rounds out.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Beat, NovaMode, SwarmEventInput, NebulaData, WorldStage } from '../../components/world/ArrivalScene';
import { WORLD_KEY, getWorldKey } from './world-key';

const ArrivalScene = dynamic(() => import('../../components/world/ArrivalScene'), { ssr: false });

interface PulseEvent { id: string; kind: string; sector: 'core' | 'market' | 'bazaar' | 'forge'; label: string; ts: string }
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

interface Msg { role: 'nova' | 'visitor'; text: string }

const SEEN_KEY = 'nova_world_seen';
const VISITOR_KEY = 'nova_visitor_id';

function getVisitorId(): string {
  let v = localStorage.getItem(VISITOR_KEY);
  if (!v) {
    v = 'v_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(VISITOR_KEY, v);
  }
  return v;
}

interface MyAgent { id: string; name: string; symbol: string | null; latest_finding: string | null }

// ── NOVA OS (§XIII) — the deep state, founder's eyes only ─────────────
interface OSBlockage { sector: string; code: string; label: string; unlock: string }
interface OSAgent {
  id: string; name: string; mission: string; symbol: string | null; sector: string;
  status: string; lastRunAt: string | null; findings: number; flares: number; latestFinding: string | null;
}
interface OSSociety { id: string; name: string; role: string; writes: number; lastWriteAt: string | null }
interface WorldOS {
  blockages: OSBlockage[];
  scars: { anomalies14d: number; failedRuns7d: number; recent: Array<{ observation: string; at: string }> };
  agents: OSAgent[];
  society: OSSociety[];
  ledgers: {
    truth: { artifacts: number; byKind: Record<string, number> };
    trust: { predictionsLogged: number; predictionsResolved: number; meanBrier: number | null };
    event: { total: number; last24h: number };
    nonArrival: { absorbed: number; refusals: number; recent: Array<{ absorbed: string; carriedBy: string; at: string }> };
  };
  mind: {
    providers: Array<{ name: string; configured: boolean }>;
    capableOfLLM: boolean;
    sovereignty: { score: number; band: string; rationale: string };
  };
  vault: { mounted: boolean; note: string };
  continuance: { constitution: string; ratified: string; doorHasWord: boolean; laws: number };
}

function relTime(ts: string | null): string {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Evaluated once per page load, before the marker is written — StrictMode
// re-runs effects in dev, and she must never claim memory she does not have.
let wasHereBefore: boolean | null = null;
function evaluateReturning(): boolean {
  if (wasHereBefore === null) {
    wasHereBefore = localStorage.getItem(SEEN_KEY) === '1';
    localStorage.setItem(SEEN_KEY, '1');
  }
  return wasHereBefore;
}

export default function WorldClient() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [beat, setBeat] = useState<Beat>('void');
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [pulseDark, setPulseDark] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const returning = useRef(false);
  const firstPulseIds = useRef<Set<string> | null>(null);
  const visitorId = useRef<string>('');
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [encounter, setEncounter] = useState<string | null>(null);
  const encounterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The world explains what you just watched happen (§7).
  const onEncounter = useCallback((n: { reason: string }) => {
    setEncounter(n.reason);
    if (encounterTimer.current) clearTimeout(encounterTimer.current);
    encounterTimer.current = setTimeout(() => setEncounter(null), 7000);
  }, []);

  const fetchMyAgents = useCallback(async () => {
    if (!visitorId.current) return;
    try {
      const r = await fetch(`/api/proxy/v1/world/agents?visitor=${visitorId.current}`);
      const d = await r.json();
      if (d?.success) setMyAgents(d.data.agents || []);
    } catch { /* they remain even when we cannot see them */ }
  }, []);

  const open = beat === 'open';

  // Mutable shared state read by the render loop — not React state.
  const stage = useRef<WorldStage>({
    t: 0, beat: 'void' as Beat, beatT: 0,
    mode: 'idle' as NovaMode, skip: false, pulseAlive: false,
  });

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setIsMobile(window.innerWidth < 768);
    returning.current = evaluateReturning();
    visitorId.current = getVisitorId();
    fetchMyAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The pulse — poll real activity every 20s ────────────────────────
  const fetchPulse = useCallback(async () => {
    try {
      const r = await fetch('/api/proxy/v1/world/pulse');
      const d = await r.json();
      if (d?.success && d.data) {
        const p: Pulse = d.data;
        if (firstPulseIds.current === null) firstPulseIds.current = new Set(p.pulse.map(e => e.id));
        setPulse(p);
        setPulseDark(false);
        stage.current.pulseAlive = true;
      } else {
        setPulseDark(true);
        stage.current.pulseAlive = false;
      }
    } catch {
      setPulseDark(true); // darkness is allowed; darkness is honest
      stage.current.pulseAlive = false;
    }
  }, []);

  useEffect(() => {
    fetchPulse();
    const iv = setInterval(fetchPulse, 20_000);
    return () => clearInterval(iv);
  }, [fetchPulse]);

  // ── NOVA OS — the deep state. The key is proven server-side on every
  // call; if it dies, the world seals itself and returns you to the door.
  const [os, setOs] = useState<WorldOS | null>(null);
  const fetchOS = useCallback(async () => {
    const key = getWorldKey();
    if (!key) return;
    try {
      const r = await fetch('/api/proxy/v1/world/os', { headers: { 'x-world-key': key } });
      if (r.status === 401) {
        localStorage.removeItem(WORLD_KEY);
        window.location.reload(); // sealed — back to the door
        return;
      }
      const d = await r.json();
      if (d?.success && d.data) setOs(d.data);
    } catch { /* the deep state goes dark; the world keeps breathing on the pulse */ }
  }, []);

  useEffect(() => {
    fetchOS();
    const iv = setInterval(fetchOS, 45_000);
    return () => clearInterval(iv);
  }, [fetchOS]);

  // ── First words — only real numbers, only when present ──────────────
  const greet = useCallback(() => {
    setMessages(prev => {
      if (prev.length > 0) return prev;
      const lines: string[] = [];
      if (myAgents.length > 0) {
        const a = myAgents[0];
        lines.push(`Your ${a.name} remained while you were gone.${a.latest_finding ? ` Last report: ${a.latest_finding}.` : ''}`);
        lines.push('Tell me the situation — or forge another watcher.');
      } else if (returning.current) {
        lines.push('You have been here before. The work kept moving.');
        const f = pulse?.sectors.forge, b = pulse?.sectors.bazaar;
        const recent: string[] = [];
        if (f && f.forged24h > 0) recent.push(`${f.forged24h} card${f.forged24h === 1 ? '' : 's'} forged`);
        if (b && b.appraised24h > 0) recent.push(`${b.appraised24h} item${b.appraised24h === 1 ? '' : 's'} appraised`);
        if (recent.length) lines.push(`In the last day: ${recent.join(', ')}.`);
        lines.push('Tell me the situation. I will find the next move.');
      } else {
        lines.push('Tell me the situation. I will find the next move.');
      }
      return [{ role: 'nova', text: lines.join(' ') }];
    });
  }, [pulse, myAgents]);

  const onBeat = useCallback((b: Beat) => {
    setBeat(b);
    if (b === 'open') greet();
  }, [greet]);

  // Law Four: the visitor commands time — skip compresses, never amputates.
  const hasten = useCallback(() => { stage.current.skip = true; }, []);

  // ── Hail — speaking to Nova ──────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages(m => [...m, { role: 'visitor', text }]);
    setThinking(true);
    stage.current.mode = 'thinking';
    try {
      const r = await fetch('/api/proxy/v1/world/hail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, returning: returning.current, visitorId: visitorId.current }),
      });
      const d = await r.json();
      const reply = d?.data?.reply || d?.error?.message || 'Unavailable. The light is not there yet.';
      if (d?.data?.provider === 'forge') fetchMyAgents();
      // She stills when the move is found — the answer arrives with weight.
      stage.current.mode = 'found';
      setTimeout(() => {
        setMessages(m => [...m, { role: 'nova', text: reply }]);
        setThinking(false);
        setTimeout(() => { stage.current.mode = 'idle'; }, 2600);
      }, 650);
    } catch {
      stage.current.mode = 'idle';
      setThinking(false);
      setMessages(m => [...m, { role: 'nova', text: 'Unavailable. The light is not there yet.' }]);
    }
  }, [input, thinking]);

  // ── Swarm inputs — every mote is a real event ────────────────────────
  const events: SwarmEventInput[] = useMemo(() => {
    if (!pulse) return [];
    return pulse.pulse.map(e => ({
      id: e.id,
      sector: e.sector,
      kind: e.kind,
      fresh: firstPulseIds.current ? !firstPulseIds.current.has(e.id) : false,
    }));
  }, [pulse]);

  // ── Nebulae — light earned from real data; blockages dim honestly ────
  const nebulae: NebulaData[] = useMemo(() => {
    const m = pulse?.sectors.market ?? null;
    const b = pulse?.sectors.bazaar ?? null;
    const f = pulse?.sectors.forge ?? null;
    const blocked = (sector: string) => os?.blockages.some(x => x.sector === sector) ?? false;
    const mark = (sub: string | null, sector: string) =>
      sub === null ? null : blocked(sector) ? `${sub} · ⊘ blocked` : sub;
    return [
      {
        key: 'market', label: 'The Market', href: '/market',
        sub: mark(m ? `${m.symbol} $${m.price.toFixed(2)} · ${m.changePct >= 0 ? '+' : ''}${m.changePct.toFixed(2)}% · session ${m.session}` : null, 'market'),
        active: m ? (m.session === 'open' ? 0.9 : 0.4) : 0.08,
        weather: m ? Math.max(-1, Math.min(1, m.changePct / 2)) : 0,
      },
      {
        key: 'bazaar', label: 'The Bazaar', href: '/bazaar',
        sub: mark(b ? `${b.flipsTracked} items tracked · ${b.appraised24h} appraised today` : null, 'bazaar'),
        active: b ? Math.min(1, 0.3 + b.appraised24h * 0.2) : 0.08,
        weather: 0,
      },
      {
        key: 'forge', label: 'The Forge', href: '/forge',
        sub: mark(f ? `${f.cardsTotal} cards forged · ${f.forged24h} today` : null, 'forge'),
        active: f ? Math.min(1, 0.3 + f.forged24h * 0.15) : 0.08,
        weather: 0,
      },
    ];
  }, [pulse, os]);

  if (reduced === null) return <div className="fixed inset-0" style={{ background: '#01030a' }} />;

  // Reduced motion: the world without the journey — window immediately.
  if (reduced) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 px-4" style={{ background: 'radial-gradient(ellipse at 50% 38%, #0a1626 0%, #01030a 65%)' }}>
        <div className="text-[14px] tracking-[0.45em] uppercase" style={{ color: '#bfeaff' }}>N O V A N E X U S</div>
        <div
          className="w-40 h-40 rounded-full"
          style={{ background: 'radial-gradient(circle, #eafcff 0%, #7dd8ff 30%, transparent 70%)', filter: 'blur(6px)', opacity: 0.85 }}
        />
        <NexusChat
          open messages={messages.length ? messages : [{ role: 'nova', text: 'Tell me the situation. I will find the next move.' }]}
          input={input} setInput={setInput} send={send} thinking={thinking}
        />
      </div>
    );
  }

  const wordmarkLanded = beat === 'sigil';
  const wordmarkCorner = beat === 'window' || open;

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#01030a' }} onPointerDown={!open ? hasten : undefined}>
      <style>{`
        @keyframes novaflash { 0% { opacity: 0; } 12% { opacity: 0.85; } 100% { opacity: 0; } }
        @keyframes wordrise { from { opacity: 0; letter-spacing: 0.9em; } to { opacity: 1; letter-spacing: 0.5em; } }
      `}</style>

      <div className="absolute inset-0">
        <ArrivalScene stage={stage.current} events={events} nebulae={nebulae} isMobile={isMobile} onBeat={onBeat} onEncounter={onEncounter} />
      </div>

      {/* The detonation, felt in the room */}
      {beat === 'detonation' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 46%, #eafcff 0%, #7dd8ff33 40%, transparent 70%)',
            animation: 'novaflash 0.9s ease-out forwards',
          }}
        />
      )}

      {/* THE WORDMARK — lands with the sigil, then keeps watch from the corner */}
      {(wordmarkLanded || wordmarkCorner) && (
        <a
          href="/"
          className="absolute uppercase no-underline transition-all duration-1000 ease-in-out select-none"
          style={
            wordmarkCorner
              ? { left: '1.25rem', top: '1.25rem', transform: 'none', fontSize: 11, letterSpacing: '0.35em', color: '#7fa6c2', opacity: 0.9 }
              : {
                  left: '50%', top: '76%', transform: 'translateX(-50%)',
                  fontSize: isMobile ? 15 : 21, letterSpacing: '0.5em', color: '#d5f2ff',
                  animation: 'wordrise 1.4s ease-out both',
                  textShadow: '0 0 24px rgba(125,216,255,0.45)',
                  pointerEvents: 'none' as const,
                }
          }
        >
          novanexus
        </a>
      )}

      {/* Skip hint — the visitor commands time */}
      {!open && !stage.current.skip && (
        <div className="absolute bottom-6 right-6 text-[11px] tracking-[0.25em] uppercase" style={{ color: '#3d5266' }}>
          click to hasten
        </div>
      )}

      {/* The Nexus window — your words are in the nexus */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 transition-opacity duration-1000"
        style={{ top: '58%', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      >
        <NexusChat open={open} messages={messages} input={input} setInput={setInput} send={send} thinking={thinking} />
      </div>

      {/* An encounter, explained — the lights have reasons */}
      {open && encounter && (
        <div
          className="absolute left-1/2 -translate-x-1/2 text-[11px] tracking-[0.14em] italic transition-opacity duration-700"
          style={{ top: '13%', color: '#7fa6c2', textShadow: '0 0 12px rgba(125,216,255,0.3)', pointerEvents: 'none' }}
        >
          {encounter}
        </div>
      )}

      {/* RIGHT COLUMN — pulse · ledgers · blockages. Real rows only (§XIII). */}
      {open && (
        <div className="absolute right-4 top-16 w-64 hidden lg:block select-none space-y-5" style={{ pointerEvents: 'none' }}>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: '#3d5266' }}>
              {pulseDark ? 'the pulse is dark from here' : 'live pulse'}
            </div>
            {!pulseDark && pulse?.pulse.slice(0, 7).map((e, i) => (
              <div key={e.id} className="text-[11px] leading-relaxed truncate" style={{ color: '#5d7891', opacity: 1 - i * 0.12 }}>
                {e.label}
              </div>
            ))}
            {!pulseDark && pulse && pulse.pulse.length === 0 && (
              <div className="text-[11px]" style={{ color: '#5d7891' }}>
                Quiet. The systems are young — every light here will be earned.
              </div>
            )}
          </div>

          {os && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: '#3d5266' }}>
                the ledgers
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: '#5d7891' }}>
                truth — {os.ledgers.truth.artifacts} artifacts on the substrate
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: '#5d7891' }}>
                trust — {os.ledgers.trust.predictionsResolved} of {os.ledgers.trust.predictionsLogged} claims scored
                {os.ledgers.trust.meanBrier !== null ? ` · brier ${os.ledgers.trust.meanBrier}` : ''}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: '#5d7891' }}>
                events — {os.ledgers.event.last24h} today of {os.ledgers.event.total}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: '#5d7891' }}>
                non-arrival — {os.ledgers.nonArrival.absorbed} absorbed · {os.ledgers.nonArrival.refusals} honest refusals
              </div>
              {os.ledgers.nonArrival.recent[0] && (
                <div className="text-[10px] leading-snug italic mt-1 truncate" style={{ color: '#4d6a80' }}>
                  {os.ledgers.nonArrival.recent[0].absorbed}
                </div>
              )}
            </div>
          )}

          {os && os.blockages.length > 0 && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: '#6b4a35' }}>
                blockages — real constraints
              </div>
              {os.blockages.slice(0, 6).map(b => (
                <div key={b.code} className="text-[10px] leading-snug mb-1.5" style={{ color: '#c98a5e' }}>
                  ⊘ {b.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LEFT COLUMN — the watchers · the society · scars. All earned. */}
      {open && (
        <div className="absolute left-4 top-16 w-64 hidden lg:block select-none space-y-5" style={{ pointerEvents: 'none' }}>
          {(os?.agents.length || myAgents.length) ? (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: '#3d5266' }}>
                the watchers
              </div>
              {(os?.agents.slice(0, 5) || []).map(a => (
                <div key={a.id} className="mb-2">
                  <div className="text-[12px]" style={{ color: a.status === 'ACTIVE' ? '#9be8ff' : '#4d6a80' }}>
                    ◆ {a.name}{a.symbol ? ` · ${a.symbol}` : ''}
                    <span className="text-[9px] tracking-[0.2em] uppercase ml-2" style={{ color: '#3d5266' }}>
                      {a.status === 'ACTIVE' ? relTime(a.lastRunAt) : a.status.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-[10px] leading-snug truncate" style={{ color: '#5d7891' }}>
                    {a.latestFinding || `${a.findings} findings · ${a.flares} flares`}
                  </div>
                </div>
              ))}
              {!os && myAgents.map(a => (
                <div key={a.id} className="mb-2">
                  <div className="text-[12px]" style={{ color: '#9be8ff' }}>◆ {a.name}</div>
                  {a.latest_finding && (
                    <div className="text-[10px] leading-snug" style={{ color: '#5d7891' }}>{a.latest_finding}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {os && os.society.length > 0 && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: '#3d5266' }}>
                the society — presence is written
              </div>
              {os.society.slice(0, 6).map(s => (
                <div key={s.id} className="mb-1.5">
                  <div className="text-[11px]" style={{ color: '#7fb8d9' }}>
                    ◇ {s.name}
                    <span className="text-[9px] ml-2" style={{ color: '#3d5266' }}>
                      {s.writes} writes · {relTime(s.lastWriteAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {os && (os.scars.anomalies14d > 0 || os.scars.failedRuns7d > 0) && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: '#5a3d44 ' }}>
                scars
              </div>
              <div className="text-[10px] leading-snug" style={{ color: '#8a5a52' }}>
                {os.scars.anomalies14d} anomalies held 14d · {os.scars.failedRuns7d} failed runs 7d
              </div>
              {os.scars.recent[0] && (
                <div className="text-[10px] leading-snug italic mt-1 truncate" style={{ color: '#6b4a4a' }}>
                  {os.scars.recent[0].observation}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Standing — real platform truth, small, bottom-left */}
      {open && pulse?.standing && (
        <div className="absolute left-4 bottom-4 text-[10px] tracking-widest uppercase" style={{ color: '#3d5266' }}>
          {pulse.standing.users} operators · {pulse.standing.agentRunsCompleted} runs completed
        </div>
      )}

      {/* THE MIND · THE VAULT · THE CONTINUANCE — bottom-right, quiet truth */}
      {open && os && (
        <div className="absolute right-4 bottom-4 text-right hidden md:block select-none" style={{ pointerEvents: 'none' }}>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: os.mind.capableOfLLM ? '#5d7891' : '#8a5a52' }}>
            mind {os.mind.sovereignty.band} · {os.mind.sovereignty.score}% sovereign · {os.mind.providers.filter(p => p.configured).length}/{os.mind.providers.length} providers lit
          </div>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: os.vault.mounted ? '#5d7891' : '#8a5a52' }}>
            vault {os.vault.mounted ? os.vault.note : 'unmounted'}
          </div>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: '#3d5266' }}>
            the continuance · ratified {os.continuance.ratified}
          </div>
        </div>
      )}
    </div>
  );
}

// ── The window itself ──────────────────────────────────────────────────
function NexusChat({
  open, messages, input, setInput, send, thinking,
}: {
  open: boolean;
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  send: () => void;
  thinking: boolean;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  return (
    <div className="w-full">
      <div ref={logRef} className="max-h-56 overflow-y-auto mb-3 space-y-3 px-1" style={{ scrollbarWidth: 'none' }}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'visitor' ? 'text-right' : 'text-left'}>
            <span
              className="inline-block text-[13.5px] leading-relaxed max-w-[85%] text-left"
              style={{ color: m.role === 'nova' ? '#c8e8f5' : '#7d99ad', whiteSpace: 'pre-wrap' }}
            >
              {m.text}
            </span>
          </div>
        ))}
        {thinking && (
          <div className="text-left text-[12px] tracking-[0.3em] uppercase" style={{ color: '#4d6a80' }}>
            · · ·
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-3 rounded-full px-5 py-3 backdrop-blur-sm"
        style={{
          border: '1px solid rgba(150, 220, 255, 0.28)',
          background: 'rgba(4, 10, 20, 0.55)',
          boxShadow: '0 0 24px rgba(125, 216, 255, 0.10), inset 0 0 18px rgba(125, 216, 255, 0.04)',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder="Tell me the situation."
          disabled={!open}
          className="flex-1 bg-transparent outline-none text-[14px]"
          style={{ color: '#dbeefb', caretColor: '#7dd8ff' }}
        />
        <button
          onClick={send}
          disabled={thinking || !input.trim()}
          className="text-[11px] tracking-[0.25em] uppercase disabled:opacity-30"
          style={{ color: '#7dd8ff' }}
        >
          send
        </button>
      </div>
    </div>
  );
}
