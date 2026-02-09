'use client';

import GlassCard from '@/components/ui/GlassCard';

type GateInfo = {
  mode?: string;
  reasons?: string[];
  signalConfidence?: number;
  dataConfidence?: number;
  latencyClass?: string;
  sourceType?: string;
};

type IntegrityInfo = {
  source_type?: string;
  source_identifier?: string;
  latency_class?: string;
  confidence_score?: number;
  timestamp_range?: {
    expected?: number;
    actual?: number;
    missing?: number;
    gapFill?: boolean;
    gapFillCount?: number;
  };
  note?: string;
};

type StrategyInfo = {
  status?: string | null;
  fitnessScore?: number | null;
  drift?: any;
  expectancy?: number | null;
  monteCarlo?: { expectedValue?: number; probabilityProfit?: number };
  analyticsLocked?: boolean;
  evaluatedAt?: string | null;
};

function formatPercent(value?: number | null, digits: number = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(digits)}%`;
}

function formatNumber(value?: number | null, digits: number = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function formatReason(reason: string) {
  return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TrustPanel({
  title = 'Trust Panel',
  gate,
  integrity,
  strategy,
  expectedValue,
  observedReturn,
  observedPnl,
  analyticsDepth,
  analyticsLocked,
}: {
  title?: string;
  gate?: GateInfo | null;
  integrity?: IntegrityInfo | null;
  strategy?: StrategyInfo | null;
  expectedValue?: number | null;
  observedReturn?: number | null;
  observedPnl?: number | null;
  analyticsDepth?: number | null;
  analyticsLocked?: boolean;
}) {
  const reasons = gate?.reasons || [];
  const lock = analyticsLocked || strategy?.analyticsLocked || analyticsDepth === 0;
  const expectancy = expectedValue ?? strategy?.expectancy ?? strategy?.monteCarlo?.expectedValue ?? null;
  const integritySource = gate?.sourceType || integrity?.source_type || '—';
  const integrityLatency = gate?.latencyClass || integrity?.latency_class || '—';

  return (
    <GlassCard hover={false} glowColor="cyan">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {lock && (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
            Analytics Locked
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-300">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Execution Gate</span>
            <span className={`text-xs px-2 py-1 rounded-full border ${gate?.mode === 'live' ? 'border-green-500/40 text-green-300 bg-green-500/10' : gate?.mode === 'paper' ? 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10' : 'border-red-500/40 text-red-300 bg-red-500/10'}`}>
              {(gate?.mode || '—').toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Signal Confidence</span>
            <span>{formatPercent(gate?.signalConfidence)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Data Confidence</span>
            <span>{formatPercent(gate?.dataConfidence)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Source Type</span>
            <span>{integritySource}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Latency</span>
            <span>{integrityLatency}</span>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Gate Reasons</p>
            {reasons.length ? (
              <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                {reasons.map((reason) => (
                  <li key={reason}>{formatReason(reason)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No gate constraints.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Strategy Status</span>
            <span className={`${strategy?.status === 'QUARANTINED' ? 'text-red-300' : 'text-emerald-300'}`}>
              {strategy?.status || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Fitness Score</span>
            <span>{strategy?.fitnessScore !== null && strategy?.fitnessScore !== undefined ? formatNumber(strategy.fitnessScore, 1) : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Expected Value</span>
            <span>{expectancy !== null ? formatNumber(expectancy, 2) : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Observed Return</span>
            <span>{observedReturn !== null && observedReturn !== undefined ? `${formatNumber(observedReturn, 2)}%` : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Observed P&amp;L</span>
            <span>{observedPnl !== null && observedPnl !== undefined ? formatNumber(observedPnl, 2) : '—'}</span>
          </div>
          {integrity?.timestamp_range && (
            <div className="text-xs text-gray-500 mt-2">
              Integrity window: {integrity.timestamp_range.actual ?? '—'} / {integrity.timestamp_range.expected ?? '—'} bars · Missing {integrity.timestamp_range.missing ?? 0}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
