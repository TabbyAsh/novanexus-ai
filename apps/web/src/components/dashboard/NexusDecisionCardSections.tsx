'use client';
import type { ReactNode } from 'react';

type CardSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

type ValueRowProps = {
  label: string;
  value: string | number | null | undefined;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
};

type DecisionCardPayload = {
  card?: {
    opportunity?: Record<string, unknown>;
    marketIntel?: Record<string, unknown>;
    financialModel?: Record<string, unknown>;
    decision?: Record<string, unknown>;
    confidence?: Record<string, unknown>;
  };
};

type NexusCardResource = {
  id: string;
  status: string;
  action: string;
  confidencePct: number;
  volatilityLevel: string;
  latestVersion: number;
  card?: DecisionCardPayload['card'];
  latestLearning?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

const toneClasses: Record<NonNullable<ValueRowProps['tone']>, string> = {
  default: 'text-white',
  positive: 'text-green-300',
  negative: 'text-red-300',
  warning: 'text-yellow-300',
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function formatMoney(value: unknown): string {
  const n = asNumber(value);
  return n === null ? '—' : `$${n.toFixed(2)}`;
}

function formatPct(value: unknown): string {
  const n = asNumber(value);
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

function formatDate(value: unknown): string {
  const raw = asString(value);
  if (!raw) return '—';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}

export function CardSection({ title, subtitle, children }: CardSectionProps) {
  return (
    <section className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function ValueRow({ label, value, tone = 'default' }: ValueRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${toneClasses[tone]}`}>{value ?? '—'}</span>
    </div>
  );
}

export function OpportunitySection({ card }: { card: NexusCardResource }) {
  const opportunity = card.card?.opportunity ?? {};
  const soldComps = Array.isArray(opportunity.soldComps) ? opportunity.soldComps : [];
  return (
    <CardSection title="Opportunity" subtitle="Observed input data and sourcing context">
      <div className="space-y-1">
        <ValueRow label="Title" value={asString(opportunity.title) || '—'} />
        <ValueRow label="Category" value={asString(opportunity.category) || '—'} />
        <ValueRow label="Condition" value={asString(opportunity.condition) || '—'} />
        <ValueRow label="Asking Price" value={formatMoney(opportunity.askingPrice)} />
        <ValueRow label="Source Type" value={asString(opportunity.sourceType) || '—'} />
        <ValueRow label="Location" value={asString(opportunity.location) || '—'} />
      </div>
      {soldComps.length > 0 && (
        <div className="mt-3 text-xs text-gray-400">
          Sold comps: {soldComps.map((entry) => (typeof entry === 'number' ? `$${entry.toFixed(2)}` : '—')).join(', ')}
        </div>
      )}
    </CardSection>
  );
}

export function MarketIntelSection({ card }: { card: NexusCardResource }) {
  const intel = card.card?.marketIntel ?? {};
  return (
    <CardSection title="Market Intelligence" subtitle="Comparable pricing and demand signals">
      <div className="space-y-1">
        <ValueRow label="Demand Band" value={asString(intel.localDemandBand) || '—'} />
        <ValueRow label="Avg Comparable Price" value={formatMoney(intel.averageComparablePrice)} />
        <ValueRow label="Comparable Spread" value={formatPct(intel.comparableSpreadPct)} />
        <ValueRow label="Estimated Days to Sell" value={asNumber(intel.estimatedDaysToSell) ?? '—'} />
        <ValueRow label="Price Trend" value={asString(intel.priceTrend) || '—'} />
      </div>
    </CardSection>
  );
}

export function FinancialSection({ card }: { card: NexusCardResource }) {
  const financial = card.card?.financialModel ?? {};
  const netProfit = asNumber(financial.expectedNetProfit);
  return (
    <CardSection title="Economics" subtitle="Expected return, downside, and opportunity cost">
      <div className="space-y-1">
        <ValueRow label="Expected Sale Price" value={formatMoney(financial.expectedSalePrice)} />
        <ValueRow label="Expected Total Cost" value={formatMoney(financial.expectedTotalCost)} />
        <ValueRow
          label="Expected Net Profit"
          value={formatMoney(netProfit)}
          tone={netProfit !== null && netProfit < 0 ? 'negative' : 'positive'}
        />
        <ValueRow label="Expected ROI" value={formatPct(financial.expectedRoiPct)} />
        <ValueRow label="Max Downside" value={formatMoney(financial.maxDownside)} tone="warning" />
        <ValueRow label="Opportunity Cost" value={formatMoney(financial.opportunityCost)} />
        <ValueRow label="Risk-Adjusted Value" value={formatMoney(financial.riskAdjustedValue)} />
      </div>
    </CardSection>
  );
}

export function DecisionSummarySection({ card }: { card: NexusCardResource }) {
  const decision = card.card?.decision ?? {};
  return (
    <CardSection title="Decision Summary" subtitle="Recommended action and confidence profile">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500">Action</p>
          <p className="text-lg font-semibold text-cyan-300 mt-1">{asString(decision.action) || card.action || '—'}</p>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500">Confidence</p>
          <p className="text-lg font-semibold text-white mt-1">{formatPct(asNumber(decision.confidencePct) ?? card.confidencePct)}</p>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500">Volatility</p>
          <p className="text-lg font-semibold text-yellow-300 mt-1">{asString(decision.volatility) || card.volatilityLevel || '—'}</p>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500">Status</p>
          <p className="text-lg font-semibold text-white mt-1">{card.status}</p>
        </div>
      </div>
      <p className="text-sm text-gray-300 mt-4">{asString(decision.rationale) || 'No rationale provided.'}</p>
    </CardSection>
  );
}

export function ConfidenceSection({ card }: { card: NexusCardResource }) {
  const confidence = card.card?.confidence ?? {};
  const assumptions = asStringArray(confidence.assumptions);
  const missing = asStringArray(confidence.missingInformation);
  const uncertainty = asStringArray(confidence.uncertaintyDrivers);

  return (
    <CardSection title="Confidence & Uncertainty" subtitle="Explicit assumptions and unknowns">
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Assumptions</p>
          <ul className="mt-2 list-disc list-inside text-sm text-gray-300 space-y-1">
            {assumptions.length === 0 ? <li>None recorded</li> : assumptions.map((entry, idx) => <li key={idx}>{entry}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Missing Information</p>
          <ul className="mt-2 list-disc list-inside text-sm text-gray-300 space-y-1">
            {missing.length === 0 ? <li>None recorded</li> : missing.map((entry, idx) => <li key={idx}>{entry}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Uncertainty Drivers</p>
          <ul className="mt-2 list-disc list-inside text-sm text-gray-300 space-y-1">
            {uncertainty.length === 0 ? <li>None recorded</li> : uncertainty.map((entry, idx) => <li key={idx}>{entry}</li>)}
          </ul>
        </div>
      </div>
    </CardSection>
  );
}

export function LearningSection({ latestLearning, snapshots }: { latestLearning?: Record<string, unknown> | null; snapshots: Array<Record<string, unknown>> }) {
  return (
    <CardSection title="Learning Snapshots" subtitle="Outcome calibration and model updates">
      {latestLearning && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 mb-3">
          <p className="text-xs text-gray-500 mb-2">Latest Summary</p>
          <div className="space-y-1">
            <ValueRow label="Confidence Delta" value={formatPct(latestLearning.confidenceDeltaPct)} />
            <ValueRow label="Calibration Error" value={formatPct(latestLearning.calibrationErrorPct)} />
            <ValueRow label="Created At" value={formatDate(latestLearning.createdAt)} />
          </div>
        </div>
      )}
      <div className="space-y-2 max-h-64 overflow-auto pr-1">
        {snapshots.length === 0 ? (
          <p className="text-sm text-gray-500">No learning snapshots yet. Log an outcome to start learning.</p>
        ) : (
          snapshots.map((snapshot, idx) => (
            <div key={idx} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Snapshot {snapshots.length - idx}</div>
              <ValueRow label="Confidence Delta" value={formatPct(snapshot.confidenceDeltaPct)} />
              <ValueRow label="Calibration Error" value={formatPct(snapshot.calibrationErrorPct)} />
              <ValueRow label="Recorded" value={formatDate(snapshot.createdAt)} />
            </div>
          ))
        )}
      </div>
    </CardSection>
  );
}
