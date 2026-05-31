export type DecisionAction = 'BUY' | 'SELL' | 'SKIP' | 'WAIT' | 'OFFER';
export type VolatilityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FlipOpportunityInput {
  title: string;
  category?: string;
  condition?: string;
  askingPrice: number;
  estimatedFees?: number;
  estimatedShipping?: number;
  estimatedRefurbishment?: number;
  estimatedStorage?: number;
  expectedHoldDays?: number;
  liquidityHint?: number;
  confidenceHint?: number;
  soldComps?: number[];
  alternativeAnnualReturnRate?: number;
  location?: string;
  sourceType?: string;
  sourceUrl?: string;
  notes?: string;
}
export interface DecisionEngineCalibrationProfile {
  sampleSize: number;
  meanPredictionBiasPct: number;
  meanCalibrationErrorPct: number;
  meanConfidenceDeltaPct: number;
}

export interface DecisionCardComputation {
  opportunity: {
    title: string;
    category: string;
    condition: string;
    identificationConfidence: number;
    sourceType: string;
    sourceUrl?: string;
    location?: string;
  };
  marketIntelligence: {
    soldRange: { low: number; mid: number; high: number };
    liquidityScore: number;
    expectedDaysToSale: { low: number; mid: number; high: number };
    demandMomentum: 'RISING' | 'STABLE' | 'SOFTENING';
    listingSaturation: 'LOW' | 'MEDIUM' | 'HIGH';
    activeListingSaturationScore: number;
    competitionDensityScore: number;
    regionalDemandVariancePct: number;
    sellThroughVelocity: 'FAST' | 'MODERATE' | 'SLOW';
  };
  financials: {
    askingPrice: number;
    grossResale: { low: number; mid: number; high: number };
    costs: {
      fees: number;
      shipping: number;
      taxes: number;
      refurbishment: number;
      storage: number;
      holdCost: number;
    };
    netCash: { low: number; mid: number; high: number };
    expectedRoiPct: number;
    downsideRisk: number;
    downsideRiskPct: number;
    opportunityCost: number;
    riskAdjustedValue: number;
    expectedTotalCost: number;
    expectedNetProfit: number;
    expectedSalePrice: number;
  };
  decision: {
    action: DecisionAction;
    offerPrice: number | null;
    rationale: string[];
  };
  confidence: {
    confidencePct: number;
    volatility: VolatilityLevel;
    uncertaintyExplanation: string[];
    uncertaintyDrivers: string[];
    missingInformation: string[];
    assumptions: string[];
    confidenceBounds: { low: number; mid: number; high: number };
  };
  execution: {
    suggestedOffer: number | null;
    negotiationScript: string;
    listingTitle: string;
    listingDescription: string;
    bestPlatform: string;
    repricingRule: string;
    stopLossRule: string;
  };
  marketIntel: {
    localDemandBand: 'HIGH' | 'MEDIUM' | 'LOW';
    averageComparablePrice: number;
    comparableSpreadPct: number;
    estimatedDaysToSell: number;
    priceTrend: 'RISING' | 'STABLE' | 'SOFTENING';
  };
  financialModel: {
    expectedSalePrice: number;
    expectedTotalCost: number;
    expectedNetProfit: number;
    expectedRoiPct: number;
    maxDownside: number;
    opportunityCost: number;
    riskAdjustedValue: number;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function classifyVolatility(spreadPct: number): VolatilityLevel {
  if (spreadPct < 0.22) return 'LOW';
  if (spreadPct < 0.5) return 'MEDIUM';
  return 'HIGH';
}

function inferDemandMomentum(liquidityScore: number): 'RISING' | 'STABLE' | 'SOFTENING' {
  if (liquidityScore >= 75) return 'RISING';
  if (liquidityScore >= 45) return 'STABLE';
  return 'SOFTENING';
}

function inferListingSaturation(liquidityScore: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (liquidityScore >= 75) return 'LOW';
  if (liquidityScore >= 45) return 'MEDIUM';
  return 'HIGH';
}

export function buildFlipDecisionCard(
  input: FlipOpportunityInput,
  options?: { calibration?: DecisionEngineCalibrationProfile | null }
): DecisionCardComputation {
  const title = String(input.title || '').trim();
  const category = (input.category || 'General Resale').trim();
  const condition = (input.condition || 'Unknown').trim();
  const sourceType = (input.sourceType || 'marketplace_listing').trim();
  const askingPrice = Number(input.askingPrice || 0);

  const soldComps = Array.isArray(input.soldComps)
    ? input.soldComps.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    : [];

  const assumptions: string[] = [];
  const uncertainty: string[] = [];
  const missing: string[] = [];

  if (!input.condition) missing.push('Item condition is unspecified.');
  if (!input.location) missing.push('Location is missing; regional demand variance may be material.');
  if (!input.sourceUrl) missing.push('Source URL is missing; listing quality cannot be audited directly.');
  if (soldComps.length < 3) missing.push('Sold comparable coverage is sparse.');

  let soldLow = 0;
  let soldMid = 0;
  let soldHigh = 0;
  if (soldComps.length >= 3) {
    soldLow = round2(percentile(soldComps, 0.25));
    soldMid = round2(median(soldComps));
    soldHigh = round2(percentile(soldComps, 0.75));
    assumptions.push(`Sold range computed from ${soldComps.length} comparable sales.`);
  } else {
    soldMid = round2(askingPrice * 1.45);
    soldLow = round2(askingPrice * 1.1);
    soldHigh = round2(askingPrice * 1.9);
    assumptions.push('Sold comps are insufficient; resale range uses conservative price multipliers from asking price.');
  }

  const fees = round2(Number(input.estimatedFees ?? soldMid * 0.12));
  const shipping = round2(Number(input.estimatedShipping ?? Math.max(6, soldMid * 0.04)));
  const taxes = round2(soldMid * 0.02);
  const refurbishment = round2(Number(input.estimatedRefurbishment ?? 0));
  const storage = round2(Number(input.estimatedStorage ?? 0));
  const holdMid = Math.max(2, Math.round(Number(input.expectedHoldDays ?? (input.liquidityHint ? 30 - input.liquidityHint / 4 : 14))));
  const holdCost = round2(Math.max(0, askingPrice * 0.0008 * holdMid));

  assumptions.push(`Fees assumed at ${round2((fees / Math.max(soldMid, 1)) * 100)}% of midpoint resale.`);
  assumptions.push(`Shipping estimate ${shipping.toFixed(2)} reflects blended carrier baseline for the category.`);

  let netLow = round2(soldLow - askingPrice - (soldLow * 0.12) - shipping - refurbishment - storage - holdCost);
  let netMid = round2(soldMid - askingPrice - fees - shipping - taxes - refurbishment - storage - holdCost);
  let netHigh = round2(soldHigh - askingPrice - (soldHigh * 0.12) - shipping - taxes - refurbishment - storage - holdCost);
  let expectedRoiPct = askingPrice > 0 ? round2((netMid / askingPrice) * 100) : 0;

  const holdRange = {
    low: Math.max(1, Math.round(holdMid * 0.5)),
    mid: holdMid,
    high: Math.max(2, Math.round(holdMid * 1.8)),
  };

  const annualAlt = Number(input.alternativeAnnualReturnRate ?? 0.1);
  const opportunityCost = round2(askingPrice * annualAlt * (holdRange.mid / 365));
  let downsideRisk = round2(Math.min(0, netLow));
  let downsideRiskPct = askingPrice > 0 ? round2((Math.abs(downsideRisk) / askingPrice) * 100) : 0;
  let riskAdjustedValue = round2(netMid + downsideRisk - opportunityCost);
  const expectedTotalCost = round2(askingPrice + fees + shipping + taxes + refurbishment + storage + holdCost);

  const spreadPct = soldMid > 0 ? (soldHigh - soldLow) / soldMid : 1;
  const volatility = classifyVolatility(spreadPct);
  const liquidityScore = clamp(
    Math.round(
      Number(input.liquidityHint ?? (soldComps.length >= 8 ? 78 : soldComps.length >= 4 ? 58 : 35))
      - (volatility === 'HIGH' ? 12 : volatility === 'MEDIUM' ? 5 : 0)
    ),
    5,
    95
  );
  const activeListingSaturationScore = clamp(100 - liquidityScore + (volatility === 'HIGH' ? 8 : 0), 5, 95);
  const competitionDensityScore = clamp(Math.round(activeListingSaturationScore * 0.7 + (soldComps.length < 5 ? 18 : 8)), 5, 95);
  const regionalDemandVariancePct = round2(clamp((100 - liquidityScore) * 0.35, 2, 35));
  const sellThroughVelocity: 'FAST' | 'MODERATE' | 'SLOW' =
    holdRange.mid <= 7 ? 'FAST' : holdRange.mid <= 18 ? 'MODERATE' : 'SLOW';

  const calibration = options?.calibration || null;
  if (calibration && calibration.sampleSize >= 3) {
    const netFactor = 1 + clamp(calibration.meanPredictionBiasPct / 100, -0.35, 0.35);
    netLow = round2(netLow * netFactor);
    netMid = round2(netMid * netFactor);
    netHigh = round2(netHigh * netFactor);
    expectedRoiPct = askingPrice > 0 ? round2((netMid / askingPrice) * 100) : 0;
    downsideRisk = round2(Math.min(0, netLow));
    downsideRiskPct = askingPrice > 0 ? round2((Math.abs(downsideRisk) / askingPrice) * 100) : 0;
    riskAdjustedValue = round2(netMid + downsideRisk - opportunityCost);
    assumptions.push(
      `Outcome feedback applied from ${calibration.sampleSize} prior outcomes (bias ${round2(calibration.meanPredictionBiasPct)}%, calibration error ${round2(calibration.meanCalibrationErrorPct)}%).`
    );
  }

  let confidencePct = Number(input.confidenceHint ?? 0);
  if (!confidencePct) {
    const baseFromComps = soldComps.length >= 10 ? 78 : soldComps.length >= 5 ? 64 : soldComps.length >= 3 ? 52 : 36;
    const completenessPenalty = missing.length * 6;
    confidencePct = clamp(baseFromComps - completenessPenalty, 12, 92);
  }
  if (calibration && calibration.sampleSize >= 3) {
    const confidenceShift = clamp(
      calibration.meanConfidenceDeltaPct * 0.12 - calibration.meanCalibrationErrorPct * 0.05,
      -18,
      10
    );
    confidencePct = clamp(confidencePct + confidenceShift, 8, 95);
    if (confidenceShift < 0) {
      uncertainty.push('Recent outcome drift lowered confidence while model recalibrates.');
    }
  }
  if (volatility === 'HIGH') uncertainty.push('Price dispersion is high; realized sale price may deviate materially from midpoint.');
  if (soldComps.length < 3) uncertainty.push('Comparable sale evidence is thin; forecast range carries elevated uncertainty.');
  if (holdRange.high >= 25) uncertainty.push('Longer expected holding period increases market and inventory risk.');
  if (competitionDensityScore >= 70) uncertainty.push('Competitive listing density is elevated; margin compression risk is higher.');
  if (regionalDemandVariancePct >= 20) uncertainty.push('Regional demand variance is high; local outcomes can diverge from aggregate comps.');

  const confidenceBounds = {
    low: clamp(round2(confidencePct - (volatility === 'HIGH' ? 22 : volatility === 'MEDIUM' ? 14 : 9)), 5, 95),
    mid: round2(confidencePct),
    high: clamp(round2(confidencePct + (soldComps.length >= 8 ? 8 : 4)), 5, 98),
  };

  const shouldBuy = riskAdjustedValue > 0 && expectedRoiPct >= 18 && confidenceBounds.mid >= 55;
  const shouldOffer = !shouldBuy && netMid > 0 && confidenceBounds.mid >= 35;
  const shouldWait = confidenceBounds.mid < 35 || missing.length >= 3;

  let action: DecisionAction = 'SKIP';
  let offerPrice: number | null = null;
  if (shouldBuy) {
    action = 'BUY';
  } else if (shouldOffer) {
    action = 'OFFER';
    offerPrice = round2(Math.max(0, askingPrice - Math.max(5, askingPrice * 0.12)));
  } else if (shouldWait) {
    action = 'WAIT';
  }

  const rationale: string[] = [
    `Expected net midpoint is ${netMid.toFixed(2)} with ROI ${expectedRoiPct.toFixed(2)}%.`,
    `Downside case is ${netLow.toFixed(2)} (${downsideRiskPct.toFixed(2)}% risk) and opportunity cost is ${opportunityCost.toFixed(2)}.`,
    `Risk-adjusted value is ${riskAdjustedValue.toFixed(2)} with confidence bounds ${confidenceBounds.low.toFixed(0)}-${confidenceBounds.high.toFixed(0)}%.`,
  ];

  const listingTitle = `${title} | ${condition} | ${category}`.slice(0, 120);
  const listingDescription = [
    `${title} in ${condition} condition.`,
    `Category: ${category}.`,
    `Inspected and priced from recent sold comparables.`,
  ].join(' ');
  const suggestedOffer = action === 'OFFER' ? offerPrice : action === 'BUY' ? askingPrice : null;
  const bestPlatform = shipping > 0 ? 'eBay' : 'Facebook Marketplace Local';
  const negotiationScript = suggestedOffer !== null
    ? `Would you accept ${suggestedOffer.toFixed(2)} today? I can complete pickup/payment immediately.`
    : 'Request additional condition proof and sold-comp evidence before making an offer.';

  return {
    opportunity: {
      title,
      category,
      condition,
      identificationConfidence: clamp(Math.round(confidenceBounds.mid + (soldComps.length >= 5 ? 5 : 0)), 5, 95),
      sourceType,
      sourceUrl: input.sourceUrl,
      location: input.location,
    },
    marketIntelligence: {
      soldRange: { low: soldLow, mid: soldMid, high: soldHigh },
      liquidityScore,
      expectedDaysToSale: holdRange,
      demandMomentum: inferDemandMomentum(liquidityScore),
      listingSaturation: inferListingSaturation(liquidityScore),
      activeListingSaturationScore,
      competitionDensityScore,
      regionalDemandVariancePct,
      sellThroughVelocity,
    },
    financials: {
      askingPrice,
      grossResale: { low: soldLow, mid: soldMid, high: soldHigh },
      costs: { fees, shipping, taxes, refurbishment, storage, holdCost },
      netCash: { low: netLow, mid: netMid, high: netHigh },
      expectedRoiPct,
      downsideRisk,
      downsideRiskPct,
      opportunityCost,
      riskAdjustedValue,
      expectedTotalCost,
      expectedNetProfit: netMid,
      expectedSalePrice: soldMid,
    },
    decision: {
      action,
      offerPrice,
      rationale,
    },
    confidence: {
      confidencePct: confidenceBounds.mid,
      volatility,
      uncertaintyExplanation: uncertainty,
      uncertaintyDrivers: uncertainty,
      missingInformation: missing,
      assumptions,
      confidenceBounds,
    },
    execution: {
      suggestedOffer,
      negotiationScript,
      listingTitle,
      listingDescription,
      bestPlatform,
      repricingRule: 'If unsold after midpoint hold window, reprice down by 4-6%.',
      stopLossRule: 'Exit at or before downside threshold if market evidence weakens.',
    },
    marketIntel: {
      localDemandBand: liquidityScore >= 70 ? 'HIGH' : liquidityScore >= 45 ? 'MEDIUM' : 'LOW',
      averageComparablePrice: soldMid,
      comparableSpreadPct: round2(spreadPct * 100),
      estimatedDaysToSell: holdRange.mid,
      priceTrend: inferDemandMomentum(liquidityScore),
    },
    financialModel: {
      expectedSalePrice: soldMid,
      expectedTotalCost,
      expectedNetProfit: netMid,
      expectedRoiPct,
      maxDownside: Math.abs(downsideRisk),
      opportunityCost,
      riskAdjustedValue,
    },
  };
}

export function computeOutcomeLearning(
  card: DecisionCardComputation,
  actual: { realizedNetProfit: number; holdDays?: number }
): {
  predictionError: number;
  absoluteError: number;
  calibrationErrorPct: number;
  confidenceDeltaPct: number;
  summary: string[];
} {
  const predicted = card.financials.netCash.mid;
  const predictionError = round2(actual.realizedNetProfit - predicted);
  const absoluteError = Math.abs(predictionError);
  const denom = Math.max(1, Math.abs(predicted));
  const calibrationErrorPct = round2((absoluteError / denom) * 100);
  const holdDays = Number(actual.holdDays ?? card.marketIntelligence.expectedDaysToSale.mid);
  const realizedDirection = actual.realizedNetProfit >= 0 ? 1 : -1;
  const predictedDirection = predicted >= 0 ? 1 : -1;
  const confidenceDeltaPct = round2((realizedDirection === predictedDirection ? 1 : -1) * Math.min(100, calibrationErrorPct));

  const summary = [
    `Predicted net ${predicted.toFixed(2)} vs realized ${actual.realizedNetProfit.toFixed(2)}.`,
    `Absolute prediction error ${absoluteError.toFixed(2)} (${calibrationErrorPct.toFixed(2)}%).`,
    `Observed hold duration ${holdDays} days.`,
  ];

  return {
    predictionError,
    absoluteError,
    calibrationErrorPct,
    confidenceDeltaPct,
    summary,
  };
}