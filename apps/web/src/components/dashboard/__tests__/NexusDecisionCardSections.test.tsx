import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ConfidenceSection,
  DecisionSummarySection,
  FinancialSection,
  LearningSection,
  MarketIntelSection,
  OpportunitySection,
} from '@/components/dashboard/NexusDecisionCardSections';

const cardFixture = {
  id: 'card-123',
  status: 'OPEN',
  action: 'BUY',
  confidencePct: 82,
  volatilityLevel: 'MEDIUM',
  latestVersion: 1,
  createdAt: '2026-05-12T01:00:00.000Z',
  updatedAt: '2026-05-12T01:30:00.000Z',
  card: {
    opportunity: {
      title: 'MacBook Pro 14 listing',
      category: 'Laptops',
      condition: 'Used - Good',
      askingPrice: 850,
      sourceType: 'MARKETPLACE',
      location: 'Austin',
      soldComps: [980, 1025],
    },
    marketIntel: {
      localDemandBand: 'HIGH',
      averageComparablePrice: 1000,
      comparableSpreadPct: 8.2,
      estimatedDaysToSell: 9,
      priceTrend: 'STABLE',
    },
    financialModel: {
      expectedSalePrice: 1000,
      expectedTotalCost: 910,
      expectedNetProfit: 90,
      expectedRoiPct: 9.9,
      maxDownside: 120,
      opportunityCost: 20,
      riskAdjustedValue: 62,
    },
    decision: {
      action: 'BUY',
      confidencePct: 82,
      volatility: 'MEDIUM',
      rationale: 'Comparable sales support positive margin.',
    },
    confidence: {
      assumptions: ['Battery health > 85%'],
      missingInformation: ['Exact battery cycle count'],
      uncertaintyDrivers: ['Potential hidden cosmetic wear'],
    },
  },
};

describe('NexusDecisionCardSections', () => {
  it('renders opportunity and market intelligence details', () => {
    const markup = renderToStaticMarkup(
      <>
        <OpportunitySection card={cardFixture} />
        <MarketIntelSection card={cardFixture} />
      </>
    );

    expect(markup).toContain('MacBook Pro 14 listing');
    expect(markup).toContain('Sold comps: $980.00, $1025.00');
    expect(markup).toContain('HIGH');
    expect(markup).toContain('9');
  });

  it('renders financial and decision summary details', () => {
    const markup = renderToStaticMarkup(
      <>
        <FinancialSection card={cardFixture} />
        <DecisionSummarySection card={cardFixture} />
      </>
    );

    expect(markup).toContain('$90.00');
    expect(markup).toContain('$120.00');
    expect(markup).toContain('BUY');
    expect(markup).toContain('Comparable sales support positive margin.');
  });

  it('renders confidence lists and learning snapshot fallback', () => {
    const markup = renderToStaticMarkup(
      <>
        <ConfidenceSection card={cardFixture} />
        <LearningSection latestLearning={null} snapshots={[]} />
      </>
    );

    expect(markup).toContain('Battery health &gt; 85%');
    expect(markup).toContain('Exact battery cycle count');
    expect(markup).toContain('Potential hidden cosmetic wear');
    expect(markup).toContain('No learning snapshots yet. Log an outcome to start learning.');
  });

  it('renders learning snapshot metrics when data exists', () => {
    const markup = renderToStaticMarkup(
      <LearningSection
        latestLearning={{
          confidenceDeltaPct: -5.4,
          calibrationErrorPct: 12.1,
          createdAt: '2026-05-12T02:00:00.000Z',
        }}
        snapshots={[
          {
            confidenceDeltaPct: -5.4,
            calibrationErrorPct: 12.1,
            createdAt: '2026-05-12T02:00:00.000Z',
          },
        ]}
      />
    );

    expect(markup).toContain('-5.4%');
    expect(markup).toContain('12.1%');
    expect(markup).toContain('Snapshot 1');
  });
});
