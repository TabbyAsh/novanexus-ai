import {
  calculateFixedBid,
  calculateScope,
  targetsScopePricingCommand,
  validatePricingInput,
  type PricingInput,
  type TradeScopeView,
} from '../economic-trade-scope-pricing';
import type {
  ConditionEvidenceSubmission,
  GeometryEvidenceSubmission,
} from '../economic-trade-evidence';

const geometry: GeometryEvidenceSubmission = {
  measuredAt: '2026-08-08T01:00:00.000Z',
  measuredBy: 'Wyatt Kirby',
  measurementMethod: 'Laser distance meter and tape cross-check',
  allInScopeStructuresCaptured: true,
  attestedAccurate: true,
  structures: [
    {
      label: 'Building A',
      lengthFt: 120,
      widthFt: 40,
      wallHeightFt: 12,
      gableHeightFt: 5,
      parcelMembership: 'CONFIRMED',
      photoRefs: ['photo://building-a-north', 'photo://building-a-scale'],
    },
  ],
};

const condition: ConditionEvidenceSubmission = {
  observedAt: '2026-08-08T01:00:00.000Z',
  observedBy: 'Wyatt Kirby',
  allInScopeFacesCaptured: true,
  attestedAccurate: true,
  waterAccess: 'CONFIRMED',
  surfaces: [
    {
      structureLabel: 'Building A',
      face: 'All exterior faces',
      material: 'Painted ribbed metal',
      condition: 'Light organic growth and surface dirt',
      contamination: ['organic growth', 'surface dirt'],
      accessConstraints: 'Clear vehicle access',
      photoRefs: ['photo://building-a-all-faces'],
    },
  ],
};

const pricingInput = (): PricingInput => ({
  benchmarkRatePerSqFt: 0.16,
  benchmarkSourceRef: 'https://example.com/commercial-soft-wash-rate',
  benchmarkObservedAt: '2026-08-08T01:00:00.000Z',
  laborHours: 10,
  internalLaborCostPerHour: 25,
  chemicalCost: 100,
  travelCost: 50,
  equipmentCost: 0,
  contingencyPercent: 0.1,
  targetGrossMargin: 0.5,
  roundingIncrement: 50,
});

describe('measured scope composition', () => {
  it('calculates exterior wall and combined gable area from accepted geometry', () => {
    const result = calculateScope(geometry, condition);
    expect(result.structures).toHaveLength(1);
    expect(result.structures[0].rectangularWallSqFt).toBe(3840);
    expect(result.structures[0].gableSqFt).toBe(200);
    expect(result.structures[0].totalVerticalSqFt).toBe(4040);
    expect(result.totalWashableSqFt).toBe(4040);
    expect(result.surfaces).toEqual(condition.surfaces);
    expect(result.inclusions.length).toBeGreaterThan(0);
    expect(result.exclusions).toContain('Roofs and roof coatings.');
  });
});

describe('fixed bid validation and calculation', () => {
  const scope = (): TradeScopeView => {
    const calculated = calculateScope(geometry, condition);
    return {
      id: 'scope-1',
      version: 1,
      ...calculated,
      evidenceIds: ['evidence-geometry', 'evidence-condition'],
      contentHash: 'hash',
      createdAt: '2026-08-08T01:00:00.000Z',
    };
  };

  it('rejects pricing without a resolvable benchmark source', () => {
    const input = pricingInput();
    input.benchmarkSourceRef = 'someone said sixteen cents';
    expect(validatePricingInput(input)).toContain(
      'Benchmark source must be a supported attachment/file/evidence/photo/URL reference.',
    );
  });

  it('uses the higher of market-rate value and margin floor, adds contingency, and rounds up', () => {
    const result = calculateFixedBid(scope(), pricingInput());
    expect(result.totalWashableSqFt).toBe(4040);
    expect(result.marketBasePrice).toBe(646.4);
    expect(result.laborCost).toBe(250);
    expect(result.directCost).toBe(400);
    expect(result.minimumPriceForMargin).toBe(800);
    expect(result.preRoundedPrice).toBe(880);
    expect(result.fixedPrice).toBe(900);
    expect(result.expectedGrossProfit).toBe(500);
    expect(result.expectedGrossMargin).toBe(0.56);
  });
});

describe('scope/pricing command markers', () => {
  test.each([
    'Trade #0001\nSCOPE_STATE',
    'Trade #0001\nCOMPOSE_SCOPE',
    'Trade #0001\nPRICING_EVIDENCE:{}',
  ])('recognizes %s', message => {
    expect(targetsScopePricingCommand(message)).toBe(true);
  });

  it('does not intercept ordinary Trade inspection', () => {
    expect(targetsScopePricingCommand('What is blocking Trade #0001?')).toBe(false);
  });
});
