'use client';

import { useState, useCallback, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api, type ScanOpportunity } from '@/lib/api';
import {
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  MapPin,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
  Search,
} from 'lucide-react';

// ─── Available cities (presets + custom text input) ──────────────────────────

const CITIES: { key: string; label: string }[] = [
  { key: 'miami',        label: 'Miami' },
  { key: 'chicago',      label: 'Chicago' },
  { key: 'losangeles',   label: 'Los Angeles' },
  { key: 'newyork',      label: 'New York' },
  { key: 'houston',      label: 'Houston' },
  { key: 'dallas',       label: 'Dallas' },
  { key: 'atlanta',      label: 'Atlanta' },
  { key: 'seattle',      label: 'Seattle' },
  { key: 'denver',       label: 'Denver' },
  { key: 'phoenix',      label: 'Phoenix' },
  { key: 'boston',       label: 'Boston' },
  { key: 'sandiego',     label: 'San Diego' },
  { key: 'lasvegas',     label: 'Las Vegas' },
  { key: 'nashville',    label: 'Nashville' },
  { key: 'austin',       label: 'Austin' },
  { key: 'portland',     label: 'Portland' },
  { key: 'minneapolis',  label: 'Minneapolis' },
  { key: 'philadelphia', label: 'Philadelphia' },
  { key: 'sfbay',        label: 'San Francisco' },
  { key: 'detroit',      label: 'Detroit' },
  { key: 'saltlakecity', label: 'Salt Lake City' },
  { key: 'orlando',      label: 'Orlando' },
  { key: 'tampabay',     label: 'Tampa' },
  { key: 'raleigh',      label: 'Raleigh' },
  { key: 'charlotte',    label: 'Charlotte' },
];

// Convert any city text to a Craigslist subdomain key
function cityToKey(input: string): string {
  return input.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const DEFAULT_CITIES = ['miami', 'chicago', 'losangeles'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verdictBadge(action: string) {
  if (action === 'BUY') {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 tracking-wide">
        BUY
      </span>
    );
  }
  if (action === 'OFFER') {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wide">
        NEGOTIATE
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/40 tracking-wide">
      {action}
    </span>
  );
}

function confidenceBar(pct: number) {
  const w = Math.round(Math.min(100, Math.max(0, pct)));
  const color =
    pct >= 55 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-500' : 'bg-gray-600';
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function formatCity(city: string): string {
  const found = CITIES.find(c => c.key === city);
  return found?.label ?? city.charAt(0).toUpperCase() + city.slice(1);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// localStorage skip list
const SKIP_KEY = 'nova_scanner_skipped_v1';
function loadSkipped(): Set<string> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SKIP_KEY) : null;
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveSkipped(set: Set<string>) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SKIP_KEY, JSON.stringify([...set]));
  }
}

// ─── Scan metadata type ───────────────────────────────────────────────────────

interface ScanSummary {
  totalFetched: number;
  totalEvaluated: number;
  opportunitiesFound: number;
  decisionCardsCreated: number;
  durationMs: number;
  ranAt: string;
  cities: string[];
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function OpportunityCard({
  opp,
  onSkip,
}: {
  opp: ScanOpportunity;
  onSkip: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);

  async function copyScript() {
    if (!opp.negotiationScript) return;
    try {
      await navigator.clipboard.writeText(opp.negotiationScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }

  async function markBought() {
    setExecuting(true);
    try {
      await api.executeNexusDecisionCard(opp.decisionCardId, {
        action: 'BUY',
        status: 'EXECUTED',
        executionPayload: { source: 'flip_finder', askingPrice: opp.askingPrice },
      });
      setExecuted(true);
    } catch { /* best effort */ } finally {
      setExecuting(false);
    }
  }

  const profitPositive = opp.expectedNetProfit > 0;

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden transition-all ${
      executed
        ? 'border-emerald-500/40 opacity-70'
        : opp.action === 'BUY'
          ? 'border-emerald-500/30 hover:border-emerald-500/50'
          : 'border-gray-700 hover:border-gray-600'
    }`}>
      {/* ── Card header ── */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {verdictBadge(opp.action)}
              {opp.governanceResult === 'allow' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  ✓ CLEARED
                </span>
              )}
              {opp.dataCompleteness === 'complete' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {opp.compCount} comps
                </span>
              )}
            </div>
            <h3 className="text-white font-semibold mt-2 text-base leading-snug truncate">
              {opp.title}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {opp.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {formatCity(opp.city)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                {opp.category}
              </span>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-gray-500 text-xs">Asking</p>
            <p className="text-white font-bold text-lg">${opp.askingPrice.toFixed(0)}</p>
          </div>
        </div>

        {/* ── Metrics row ── */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-gray-950 rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs">Est. Profit</p>
            <p className={`text-lg font-bold mt-0.5 ${profitPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {profitPositive ? '+' : ''}{opp.expectedNetProfit.toFixed(0)}
            </p>
          </div>
          <div className="bg-gray-950 rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs">ROI</p>
            <p className={`text-lg font-bold mt-0.5 ${opp.expectedRoiPct >= 15 ? 'text-emerald-400' : opp.expectedRoiPct >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
              {opp.expectedRoiPct.toFixed(0)}%
            </p>
          </div>
          <div className="bg-gray-950 rounded-xl p-3 text-center">
            <p className="text-gray-500 text-xs">Confidence</p>
            <p className={`text-lg font-bold mt-0.5 ${opp.confidencePct >= 55 ? 'text-cyan-400' : opp.confidencePct >= 35 ? 'text-amber-400' : 'text-gray-400'}`}>
              {opp.confidencePct.toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-3">{confidenceBar(opp.confidencePct)}</div>

        {/* ── Expand toggle ── */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs transition-colors w-full"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? 'Hide details' : 'See negotiation script & listing'}
        </button>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-gray-800 px-5 pb-5 pt-4 space-y-4">
          {/* Negotiation script */}
          {opp.negotiationScript && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  💬 Negotiation Script
                </p>
                <button
                  onClick={copyScript}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {copied
                    ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</>
                    : <><Copy className="w-3.5 h-3.5" /> Copy</>
                  }
                </button>
              </div>
              <p className="text-gray-300 text-sm bg-gray-950 rounded-lg p-3 italic">
                &ldquo;{opp.negotiationScript}&rdquo;
              </p>
            </div>
          )}

          {/* Suggested offer */}
          {opp.suggestedOffer !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Offer at:</span>
              <span className="text-amber-300 font-bold">${opp.suggestedOffer.toFixed(2)}</span>
            </div>
          )}

          {/* eBay listing title */}
          {opp.listingTitle && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                📋 eBay Listing Title
              </p>
              <p className="text-gray-200 text-sm bg-gray-950 rounded-lg p-3 font-mono text-xs leading-relaxed">
                {opp.listingTitle}
              </p>
            </div>
          )}

          {/* Platform */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <TrendingUp className="w-3.5 h-3.5" />
            Best platform: <span className="text-white">{opp.bestPlatform}</span>
          </div>

          {/* Data source note */}
          <p className="text-[11px] text-gray-600">
            {opp.compSource === 'db_cache'
              ? `Priced from ${opp.compCount} cached eBay sold comps.`
              : 'Priced from category heuristics — verify with live eBay comps before purchasing.'}
          </p>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="border-t border-gray-800 px-5 py-3 flex items-center gap-2">
        {opp.sourceUrl ? (
          <a
            href={opp.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View Listing
          </a>
        ) : null}

        {!executed ? (
          <button
            onClick={markBought}
            disabled={executing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all ${
              opp.action === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-medium'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            } disabled:opacity-50`}
          >
            {executing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            I Bought It
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" /> Logged
          </span>
        )}

        <button
          onClick={() => onSkip(opp.decisionCardId)}
          className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FlipFinderPage() {
  const [opportunities, setOpportunities] = useState<ScanOpportunity[]>([]);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // Scan config
  const [selectedCities, setSelectedCities] = useState<string[]>(DEFAULT_CITIES);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(800);
  const [showConfig, setShowConfig] = useState(false);
  const [customCity, setCustomCity] = useState('');
  const [scanProgress, setScanProgress] = useState('');
  const [scanController, setScanController] = useState<AbortController | null>(null);

  // Load skipped + existing opportunities on mount
  useEffect(() => {
    setSkipped(loadSkipped());
    loadOpportunities();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOpportunities() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getScannerOpportunities({ limit: 50 });
      if (res.success && res.data?.opportunities) {
        setOpportunities(res.data.opportunities);
      }
    } catch {
      // silently ok — user may not have run a scan yet
    } finally {
      setIsLoading(false);
    }
  }

  const cancelScan = () => {
    scanController?.abort();
    setScanController(null);
    setIsScanning(false);
    setScanProgress('');
  };

  const runScan = useCallback(async () => {
    if (selectedCities.length === 0) {
      setError('Select at least one city. Click a city chip or type one below.');
      return;
    }

    const controller = new AbortController();
    setScanController(controller);
    setIsScanning(true);
    setError(null);
    setScanProgress(`Starting scan in ${selectedCities.length} city${selectedCities.length > 1 ? 'ies' : ''}…`);

    // Timeout: kill after 120s
    const timeout = setTimeout(() => {
      controller.abort();
      setIsScanning(false);
      setScanProgress('');
      setError('Scan timed out after 2 minutes. Try fewer cities or a narrower price range.');
    }, 120_000);

    try {
      setScanProgress(`Scanning Craigslist in ${selectedCities.map(c => formatCity(c)).join(', ')}…`);
      const res = await api.runScanner({
        cities: selectedCities,
        maxPrice,
        minPrice,
        minProfit: 10,
        minConfidence: 25,
        maxResults: 30,
      });
      clearTimeout(timeout);
      if (res.success && res.data) {
        setOpportunities(res.data.opportunities);
        setScanSummary(res.data.summary);
        setShowConfig(false);
      } else {
        setError(res.error?.message ?? 'Scan failed. Try again.');
      }
    } catch (err) {
      clearTimeout(timeout);
      const msg = (err as Error).message ?? '';
      if (msg.includes('abort') || msg.includes('cancel')) {
        // user cancelled — already handled
      } else {
        setError('Scan failed. Craigslist may be temporarily blocking requests. Try again in a few minutes or select different cities.');
      }
    } finally {
      clearTimeout(timeout);
      setIsScanning(false);
      setScanProgress('');
      setScanController(null);
    }
  }, [selectedCities, maxPrice, minPrice]);

  function addCustomCity() {
    const key = cityToKey(customCity);
    if (!key || selectedCities.includes(key)) return;
    setSelectedCities(prev => [...prev, key]);
    setCustomCity('');
  }

  function skipCard(id: string) {
    const next = new Set(skipped);
    next.add(id);
    setSkipped(next);
    saveSkipped(next);
  }

  function toggleCity(key: string) {
    setSelectedCities(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  }

  // Visible opportunities: filter out skipped, sort by score
  const visible = opportunities
    .filter(o => !skipped.has(o.decisionCardId))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  const buyCount = visible.filter(o => o.action === 'BUY').length;
  const avgProfit =
    visible.length > 0
      ? visible.reduce((s, o) => s + o.expectedNetProfit, 0) / visible.length
      : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/30">
                <Search className="w-5 h-5 text-pink-300" />
              </span>
              Flip Finder
            </h1>
            <p className="text-gray-400 mt-1">
              Scans real Craigslist listings for items worth flipping. Evaluates margin, fees, and resale price.
              Each result is a live listing with a real buy/pass verdict.
            </p>
            {scanSummary && (
              <p className="text-gray-600 text-xs mt-1">
                Last scan: {timeAgo(scanSummary.ranAt)} &middot; {scanSummary.totalFetched} listings checked &middot;{' '}
                {scanSummary.cities.map(c => formatCity(c)).join(', ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowConfig(c => !c)}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors flex items-center gap-2"
            >
              {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Configure
            </button>
            <button
              onClick={runScan}
              disabled={isScanning}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Zap className={`w-4 h-4 ${isScanning ? 'animate-pulse' : ''}`} />
              {isScanning ? 'Scanning…' : 'Scan Now'}
            </button>
          </div>
        </div>

        {/* ── Config panel ── */}
        {showConfig && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-5">
            <h2 className="text-sm font-semibold text-white">Scan Configuration</h2>

            {/* City chips */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Cities</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CITIES.map(city => (
                  <button
                    key={city.key}
                    onClick={() => toggleCity(city.key)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      selectedCities.includes(city.key)
                        ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                        : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {city.label}
                  </button>
                ))}
                {/* Show any custom cities not in preset list */}
                {selectedCities.filter(k => !CITIES.find(c => c.key === k)).map(key => (
                  <button key={key} onClick={() => toggleCity(key)}
                    className="px-3 py-1.5 rounded-full text-sm bg-pink-500/20 text-pink-300 border border-pink-500/40">
                    {key} ×
                  </button>
                ))}
              </div>
            </div>

            {/* Custom city input */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Add any city</label>
              <div className="flex gap-2 mt-2">
                <input
                  value={customCity}
                  onChange={e => setCustomCity(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomCity()}
                  placeholder="e.g. Tampa, Sacramento, Tucson…"
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50"
                />
                <button onClick={addCustomCity}
                  className="px-4 py-2 bg-pink-600/80 hover:bg-pink-500 text-white text-sm rounded-lg transition">
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-700 mt-1">Type any US city. Nova will attempt to find that Craigslist market.</p>
            </div>

            {/* Price range — input boxes not slider */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Price range (asking price)</label>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-600 mb-1 block">Min $</label>
                  <input type="number" min={0} step={10} value={minPrice}
                    onChange={e => setMinPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50" />
                </div>
                <span className="text-gray-600 mt-4">–</span>
                <div className="flex-1">
                  <label className="text-xs text-gray-600 mb-1 block">Max $</label>
                  <input type="number" min={50} step={50} value={maxPrice}
                    onChange={e => setMaxPrice(Math.max(50, parseInt(e.target.value) || 800))}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500/50" />
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-600">
              Scans Craigslist in {selectedCities.length} {selectedCities.length === 1 ? 'city' : 'cities'} for items
              priced ${minPrice}–${maxPrice}. Takes 30–90s per city. Start with 1–2 cities for faster results.
            </p>
          </div>
        )}

        {/* ── Scanning state with cancel ── */}
        {isScanning && (
          <div className="bg-gray-900 border border-pink-500/30 rounded-2xl p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-pink-500 border-t-transparent animate-spin" />
            </div>
            <div>
              <p className="text-white font-semibold">{scanProgress || 'Scanning…'}</p>
              <p className="text-gray-500 text-sm mt-1">
                Fetching real Craigslist listings, evaluating flip margins, building Decision Cards.
                Takes 30–90 seconds. Select fewer cities for faster results.
              </p>
            </div>
            <button onClick={cancelScan}
              className="px-5 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition">
              Cancel Scan
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-red-300 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Stats bar (if results) ── */}
        {!isScanning && visible.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs">Opportunities</p>
              <p className="text-2xl font-bold text-white mt-1">{visible.length}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs">Buy Now</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{buyCount}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-500 text-xs">Avg. Est. Profit</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                ${avgProfit.toFixed(0)}
              </p>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {isLoading && !isScanning && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-pink-500 border-t-transparent animate-spin" />
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && !isScanning && visible.length === 0 && (
          <div className="bg-gray-900 border border-dashed border-gray-700 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-pink-500/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-pink-400" />
            </div>
            <h3 className="text-white font-semibold text-lg">No opportunities yet</h3>
            <p className="text-gray-500 mt-2 max-w-sm mx-auto">
              Run a scan and Nova will check Craigslist listings across your selected cities
              for items worth flipping. BUY-rated opportunities appear here first.
            </p>
            <button
              onClick={() => { setShowConfig(true); }}
              className="mt-6 px-6 py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium transition-colors"
            >
              Configure &amp; Scan
            </button>
          </div>
        )}

        {/* ── Opportunity grid ── */}
        {!isLoading && !isScanning && visible.length > 0 && (
          <>
            {/* BUY opportunities first */}
            {visible.filter(o => o.action === 'BUY').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                    Buy Now ({visible.filter(o => o.action === 'BUY').length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visible
                    .filter(o => o.action === 'BUY')
                    .map(opp => (
                      <OpportunityCard key={opp.decisionCardId} opp={opp} onSkip={skipCard} />
                    ))}
                </div>
              </div>
            )}

            {/* OFFER opportunities second */}
            {visible.filter(o => o.action === 'OFFER').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                    Negotiate First ({visible.filter(o => o.action === 'OFFER').length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visible
                    .filter(o => o.action === 'OFFER')
                    .map(opp => (
                      <OpportunityCard key={opp.decisionCardId} opp={opp} onSkip={skipCard} />
                    ))}
                </div>
              </div>
            )}

            {/* Footer note */}
            <div className="flex items-center gap-3 text-xs text-gray-600 border-t border-gray-800 pt-4">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Opportunities expire after 48 hours. Confidence scores are estimates based on
                eBay sold comps (where cached) or category heuristics. Always inspect items
                before purchasing.
              </span>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
