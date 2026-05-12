'use client';

import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';
import {
  ConfidenceSection,
  DecisionSummarySection,
  FinancialSection,
  LearningSection,
  MarketIntelSection,
  OpportunitySection,
} from '@/components/dashboard/NexusDecisionCardSections';

type NexusAction = 'BUY' | 'SELL' | 'SKIP' | 'WAIT' | 'OFFER';
type OutcomeStatus = 'PROFIT' | 'LOSS' | 'BREAKEVEN' | 'ABANDONED';

type NexusCardResource = {
  id: string;
  status: string;
  action: string;
  confidencePct: number;
  volatilityLevel: string;
  latestVersion: number;
  card?: {
    opportunity?: Record<string, unknown>;
    marketIntel?: Record<string, unknown>;
    financialModel?: Record<string, unknown>;
    decision?: Record<string, unknown>;
    confidence?: Record<string, unknown>;
  };
  latestLearning?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type ObserveFormState = {
  title: string;
  category: string;
  condition: string;
  askingPrice: string;
  estimatedFees: string;
  estimatedShipping: string;
  estimatedRefurbishment: string;
  estimatedStorage: string;
  expectedHoldDays: string;
  soldComps: string;
  location: string;
  sourceType: string;
  sourceUrl: string;
  notes: string;
};

type OutcomeFormState = {
  executionId: string;
  realizedSalePrice: string;
  realizedTotalCost: string;
  realizedNetProfit: string;
  realizedHoldDays: string;
  outcomeStatus: OutcomeStatus;
  notes: string;
};

const initialObserveForm: ObserveFormState = {
  title: '',
  category: '',
  condition: '',
  askingPrice: '',
  estimatedFees: '',
  estimatedShipping: '',
  estimatedRefurbishment: '',
  estimatedStorage: '',
  expectedHoldDays: '',
  soldComps: '',
  location: '',
  sourceType: 'MARKETPLACE',
  sourceUrl: '',
  notes: '',
};

const initialOutcomeForm: OutcomeFormState = {
  executionId: '',
  realizedSalePrice: '',
  realizedTotalCost: '',
  realizedNetProfit: '',
  realizedHoldDays: '',
  outcomeStatus: 'PROFIT',
  notes: '',
};

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function DecisionCardsPage() {
  const [observeForm, setObserveForm] = useState<ObserveFormState>(initialObserveForm);
  const [outcomeForm, setOutcomeForm] = useState<OutcomeFormState>(initialOutcomeForm);
  const [executeAction, setExecuteAction] = useState<NexusAction>('BUY');
  const [offerPrice, setOfferPrice] = useState('');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [card, setCard] = useState<NexusCardResource | null>(null);
  const [learningSnapshots, setLearningSnapshots] = useState<Array<Record<string, unknown>>>([]);
  const [lastExecutionId, setLastExecutionId] = useState<string | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [submittingObserve, setSubmittingObserve] = useState(false);
  const [executingCard, setExecutingCard] = useState(false);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cardTimeline = useMemo(() => {
    if (!card) return [];
    return [
      { label: 'Created', value: formatDate(card.createdAt) },
      { label: 'Updated', value: formatDate(card.updatedAt) },
      { label: 'Version', value: String(card.latestVersion) },
      { label: 'Card ID', value: card.id },
    ];
  }, [card]);

  const loadCardDetails = useCallback(async (cardId: string) => {
    setLoadingCard(true);
    setError(null);
    try {
      const [cardResult, learningResult] = await Promise.all([
        api.getNexusDecisionCard(cardId),
        api.getNexusLearning(cardId),
      ]);

      if (!cardResult.success || !cardResult.data) {
        setError(cardResult.error?.message || 'Failed to load decision card');
        return;
      }

      setActiveCardId(cardId);
      setCard(cardResult.data as unknown as NexusCardResource);
      setLearningSnapshots(learningResult.success && learningResult.data?.snapshots ? learningResult.data.snapshots : []);
    } finally {
      setLoadingCard(false);
    }
  }, []);

  const onObserve = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingObserve(true);
    setError(null);
    setSuccess(null);

    try {
      const askingPrice = toNumber(observeForm.askingPrice);
      if (askingPrice === undefined) {
        setError('Asking price is required.');
        return;
      }

      const soldComps = observeForm.soldComps
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isFinite(entry));

      const result = await api.observeOpportunity({
        title: observeForm.title,
        category: observeForm.category || undefined,
        condition: observeForm.condition || undefined,
        askingPrice,
        estimatedFees: toNumber(observeForm.estimatedFees),
        estimatedShipping: toNumber(observeForm.estimatedShipping),
        estimatedRefurbishment: toNumber(observeForm.estimatedRefurbishment),
        estimatedStorage: toNumber(observeForm.estimatedStorage),
        expectedHoldDays: toNumber(observeForm.expectedHoldDays),
        soldComps: soldComps.length ? soldComps : undefined,
        location: observeForm.location || undefined,
        sourceType: observeForm.sourceType || undefined,
        sourceUrl: observeForm.sourceUrl || undefined,
        notes: observeForm.notes || undefined,
      });

      if (!result.success || !result.data?.cardId) {
        setError(result.error?.message || 'Unable to observe opportunity.');
        return;
      }

      await loadCardDetails(result.data.cardId);
      setSuccess(`Decision card created: ${result.data.cardId}`);
      setObserveForm((previous) => ({ ...previous, soldComps: '', notes: '' }));
    } finally {
      setSubmittingObserve(false);
    }
  };

  const onExecute = async () => {
    if (!activeCardId) return;
    setExecutingCard(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.executeNexusDecisionCard(activeCardId, {
        action: executeAction,
        offerPrice: executeAction === 'OFFER' ? toNumber(offerPrice) : undefined,
      });

      if (!result.success || !result.data) {
        setError(result.error?.message || 'Execution failed.');
        return;
      }

      setLastExecutionId(result.data.executionId);
      setOutcomeForm((previous) => ({ ...previous, executionId: result.data?.executionId || previous.executionId }));
      await loadCardDetails(activeCardId);
      setSuccess(`Execution recorded (${result.data.status}).`);
    } finally {
      setExecutingCard(false);
    }
  };

  const onLogOutcome = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeCardId) return;
    setLoggingOutcome(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.logNexusOutcome(activeCardId, {
        executionId: outcomeForm.executionId || lastExecutionId || undefined,
        realizedSalePrice: toNumber(outcomeForm.realizedSalePrice),
        realizedTotalCost: toNumber(outcomeForm.realizedTotalCost),
        realizedNetProfit: toNumber(outcomeForm.realizedNetProfit),
        realizedHoldDays: toNumber(outcomeForm.realizedHoldDays),
        outcomeStatus: outcomeForm.outcomeStatus,
        notes: outcomeForm.notes || undefined,
      });

      if (!result.success) {
        setError(result.error?.message || 'Outcome logging failed.');
        return;
      }

      await loadCardDetails(activeCardId);
      setSuccess('Outcome logged and learning snapshot updated.');
      setOutcomeForm((previous) => ({ ...initialOutcomeForm, executionId: previous.executionId || lastExecutionId || '' }));
    } finally {
      setLoggingOutcome(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Decision Cards</h1>
            <p className="text-gray-400 mt-1">Observe opportunities, execute decisions, and learn from outcomes.</p>
          </div>
          {activeCardId && (
            <button
              onClick={() => loadCardDetails(activeCardId)}
              disabled={loadingCard}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition disabled:opacity-60"
            >
              {loadingCard ? 'Refreshing…' : 'Refresh Card'}
            </button>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={onObserve} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">1) Observe Opportunity</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              required
              value={observeForm.title}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, title: event.target.value }))}
              placeholder="Title"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.category}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, category: event.target.value }))}
              placeholder="Category"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.condition}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, condition: event.target.value }))}
              placeholder="Condition"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              required
              value={observeForm.askingPrice}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, askingPrice: event.target.value }))}
              placeholder="Asking Price"
              type="number"
              step="0.01"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.estimatedFees}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, estimatedFees: event.target.value }))}
              placeholder="Est. Fees"
              type="number"
              step="0.01"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.estimatedShipping}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, estimatedShipping: event.target.value }))}
              placeholder="Est. Shipping"
              type="number"
              step="0.01"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.estimatedRefurbishment}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, estimatedRefurbishment: event.target.value }))}
              placeholder="Est. Refurbishment"
              type="number"
              step="0.01"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.estimatedStorage}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, estimatedStorage: event.target.value }))}
              placeholder="Est. Storage"
              type="number"
              step="0.01"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.expectedHoldDays}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, expectedHoldDays: event.target.value }))}
              placeholder="Expected Hold Days"
              type="number"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={observeForm.location}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, location: event.target.value }))}
              placeholder="Location"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
            <select
              value={observeForm.sourceType}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, sourceType: event.target.value }))}
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            >
              <option value="MARKETPLACE">MARKETPLACE</option>
              <option value="PRIVATE">PRIVATE</option>
              <option value="WHOLESALE">WHOLESALE</option>
              <option value="OTHER">OTHER</option>
            </select>
            <input
              value={observeForm.sourceUrl}
              onChange={(event) => setObserveForm((previous) => ({ ...previous, sourceUrl: event.target.value }))}
              placeholder="Source URL"
              className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <input
            value={observeForm.soldComps}
            onChange={(event) => setObserveForm((previous) => ({ ...previous, soldComps: event.target.value }))}
            placeholder="Sold comps (comma-separated prices)"
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
          />
          <textarea
            value={observeForm.notes}
            onChange={(event) => setObserveForm((previous) => ({ ...previous, notes: event.target.value }))}
            placeholder="Notes"
            rows={2}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
          />
          <button
            type="submit"
            disabled={submittingObserve}
            className="px-5 py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition disabled:opacity-60"
          >
            {submittingObserve ? 'Observing…' : 'Create Decision Card'}
          </button>
        </form>

        {card && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <OpportunitySection card={card} />
              <MarketIntelSection card={card} />
              <FinancialSection card={card} />
              <DecisionSummarySection card={card} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ConfidenceSection card={card} />
              <LearningSection latestLearning={card.latestLearning} snapshots={learningSnapshots} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5">
                <h3 className="text-lg font-semibold text-white mb-3">2) Execute Decision</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={executeAction}
                    onChange={(event) => setExecuteAction(event.target.value as NexusAction)}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                    <option value="SKIP">SKIP</option>
                    <option value="WAIT">WAIT</option>
                    <option value="OFFER">OFFER</option>
                  </select>
                  <input
                    value={offerPrice}
                    onChange={(event) => setOfferPrice(event.target.value)}
                    placeholder="Offer Price (if OFFER)"
                    type="number"
                    step="0.01"
                    disabled={executeAction !== 'OFFER'}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={onExecute}
                    disabled={executingCard}
                    className="rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-60"
                  >
                    {executingCard ? 'Executing…' : 'Execute'}
                  </button>
                </div>
                {lastExecutionId && (
                  <p className="text-xs text-gray-400 mt-3">Latest execution: {lastExecutionId}</p>
                )}
              </section>

              <form onSubmit={onLogOutcome} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-lg font-semibold text-white">3) Log Outcome</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={outcomeForm.executionId}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, executionId: event.target.value }))}
                    placeholder="Execution ID (optional)"
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  />
                  <select
                    value={outcomeForm.outcomeStatus}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, outcomeStatus: event.target.value as OutcomeStatus }))}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="PROFIT">PROFIT</option>
                    <option value="LOSS">LOSS</option>
                    <option value="BREAKEVEN">BREAKEVEN</option>
                    <option value="ABANDONED">ABANDONED</option>
                  </select>
                  <input
                    value={outcomeForm.realizedSalePrice}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, realizedSalePrice: event.target.value }))}
                    placeholder="Realized Sale Price"
                    type="number"
                    step="0.01"
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  />
                  <input
                    value={outcomeForm.realizedTotalCost}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, realizedTotalCost: event.target.value }))}
                    placeholder="Realized Total Cost"
                    type="number"
                    step="0.01"
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  />
                  <input
                    value={outcomeForm.realizedNetProfit}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, realizedNetProfit: event.target.value }))}
                    placeholder="Realized Net Profit"
                    type="number"
                    step="0.01"
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  />
                  <input
                    value={outcomeForm.realizedHoldDays}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, realizedHoldDays: event.target.value }))}
                    placeholder="Realized Hold Days"
                    type="number"
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <textarea
                  value={outcomeForm.notes}
                  onChange={(event) => setOutcomeForm((previous) => ({ ...previous, notes: event.target.value }))}
                  placeholder="Outcome notes"
                  rows={2}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                />
                <button
                  type="submit"
                  disabled={loggingOutcome}
                  className="px-5 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-500 transition disabled:opacity-60"
                >
                  {loggingOutcome ? 'Logging…' : 'Log Outcome'}
                </button>
              </form>
            </div>

            <section className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-lg font-semibold text-white mb-3">Card Metadata</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {cardTimeline.map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                    <span className="text-gray-500">{entry.label}</span>
                    <span className="text-white font-medium">{entry.value}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
