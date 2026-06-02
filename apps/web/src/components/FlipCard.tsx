'use client';

/**
 * FlipCard — renders a real Nova Decision Card (card_type = FLIP).
 *
 * Bound to the universal DecisionCard schema (libs/shared/src/types.ts).
 * Doctrine Law 01 — No Fake Numbers: any null metric renders "Unavailable",
 * never a guessed value. The card explains what data was missing and why.
 */

import React from 'react';

// ---- Minimal mirror of the shared DecisionCard schema (FLIP subset) ----
export interface FlipMetrics {
  medianSoldPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  sampleCount: number;
  staleness: number | null;
  estimatedFees: number | null;
  estimatedShipping: number | null;
  estimatedProfit: number | null;
  profitMarginPercent: number | null;
  buyPrice: number | null;
}

export interface DataSource {
  name: string;
  endpoint?: string;
  fetchedAt: string;
  recordCount?: number;
}

export interface DecisionCard {
  id: string;
  card_type: string;
  created_at: string;
  analysis: {
    confidence: number | null;
    reasoning: string[];
    data_used: DataSource[];
    missing: string[];
    warnings: string[];
  };
  recommendation: {
    action: 'BUY' | 'SELL' | 'WATCH' | 'SKIP' | 'INVESTIGATE' | string;
    summary: string;
    details: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | string;
  };
  metrics: FlipMetrics | null;
}

const fmtMoney = (n: number | null | undefined): string =>
  typeof n === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
    : 'Unavailable';

const fmtPct = (n: number | null | undefined): string =>
  typeof n === 'number' ? `${n}%` : 'Unavailable';

const ACTION_STYLES: Record<string, string> = {
  BUY: 'bg-emerald-600 text-white',
  SELL: 'bg-emerald-600 text-white',
  WATCH: 'bg-amber-500 text-black',
  INVESTIGATE: 'bg-sky-600 text-white',
  SKIP: 'bg-red-600 text-white',
};

const RISK_STYLES: Record<string, string> = {
  LOW: 'text-emerald-400',
  MEDIUM: 'text-amber-400',
  HIGH: 'text-orange-400',
  EXTREME: 'text-red-400',
};

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const unavailable = value === 'Unavailable';
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div className="text-[0.6rem] uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`mt-1 font-mono text-lg ${unavailable ? 'text-gray-600 italic text-sm' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-[0.6rem] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function FlipCard({ card }: { card: DecisionCard }) {
  const m = card.metrics;
  const action = card.recommendation.action;
  const actionStyle = ACTION_STYLES[action] || 'bg-gray-700 text-white';
  const riskStyle = RISK_STYLES[card.recommendation.risk_level] || 'text-gray-400';
  const confidence = card.analysis.confidence;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
        <div>
          <div className="flex items-center gap-3">
            <span className={`rounded px-2.5 py-1 text-xs font-bold tracking-wide ${actionStyle}`}>
              {action}
            </span>
            <span className="text-[0.6rem] uppercase tracking-widest text-gray-500">
              Flip Decision Card
            </span>
          </div>
          <p className="mt-2 text-white text-sm leading-relaxed">{card.recommendation.summary}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-500">Confidence</div>
          <div className={`font-mono text-2xl ${confidence === null ? 'text-gray-600 italic text-sm' : 'text-white'}`}>
            {confidence === null ? 'Unavailable' : `${Math.round(confidence * 100)}%`}
          </div>
          <div className={`text-xs mt-1 ${riskStyle}`}>Risk: {card.recommendation.risk_level}</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-5 py-4">
        <Metric label="Median Resale" value={fmtMoney(m?.medianSoldPrice)} />
        <Metric
          label="Price Range (20–80%)"
          value={m?.lowPrice != null && m?.highPrice != null ? `${fmtMoney(m.lowPrice)} – ${fmtMoney(m.highPrice)}` : 'Unavailable'}
        />
        <Metric label="Suggested Buy" value={fmtMoney(m?.buyPrice)} />
        <Metric label="Est. Fees" value={fmtMoney(m?.estimatedFees)} sub="12.9% eBay + 3% payment" />
        <Metric label="Est. Shipping" value={fmtMoney(m?.estimatedShipping)} sub="estimate" />
        <Metric label="Net Profit" value={fmtMoney(m?.estimatedProfit)} sub={`${fmtPct(m?.profitMarginPercent)} margin`} />
      </div>

      {/* Reasoning */}
      {card.analysis.reasoning.length > 0 && (
        <div className="px-5 pb-2">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-500 mb-1">Reasoning</div>
          <ul className="space-y-1">
            {card.analysis.reasoning.map((r, i) => (
              <li key={i} className="text-sm text-gray-300 flex gap-2">
                <span className="text-emerald-500">›</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {card.analysis.warnings.length > 0 && (
        <div className="px-5 py-2">
          <div className="text-[0.6rem] uppercase tracking-widest text-amber-500 mb-1">Warnings</div>
          <ul className="space-y-1">
            {card.analysis.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-300/90">⚠ {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing data — honesty about what we don't know */}
      {card.analysis.missing.length > 0 && (
        <div className="px-5 py-2">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-500 mb-1">Data Not Available</div>
          <div className="flex flex-wrap gap-1.5">
            {card.analysis.missing.map((mi, i) => (
              <span key={i} className="rounded bg-gray-900 border border-gray-800 px-2 py-0.5 text-[0.65rem] text-gray-500">
                {mi}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provenance */}
      <div className="border-t border-gray-800 px-5 py-3 flex items-center justify-between">
        <div className="text-[0.65rem] text-gray-500">
          {card.analysis.data_used.length > 0 ? (
            <>
              Sources:{' '}
              {card.analysis.data_used.map((d, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {d.name}
                  {typeof d.recordCount === 'number' ? ` (${d.recordCount})` : ''}
                </span>
              ))}
            </>
          ) : (
            <span className="italic">No external data sources</span>
          )}
        </div>
        <div className="text-[0.6rem] font-mono text-gray-600">{card.id.slice(0, 12)}</div>
      </div>
    </div>
  );
}
