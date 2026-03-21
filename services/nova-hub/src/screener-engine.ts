// ============================================================
// screener-engine.ts — Institutional-Grade Trade Card Engine
// Pure functions: indicators, regime, boards, EV_R, sort modes
// ============================================================

// ======================== TYPES ========================

export interface OHLCVBar {
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
  t: string;  // timestamp ISO
}

export type BoardType =
  | 'BREAKOUT_LONG'
  | 'TREND_PULLBACK'
  | 'MEAN_REVERT_LONG'
  | 'SHORT_BREAKDOWN'
  | 'PARABOLIC_FADE'
  | 'MOMENTUM_CONTINUATION'
  | 'SWING_REVERSAL';

export type Direction = 'LONG' | 'SHORT';
export type DurationBucket = 'SCALP' | 'DAY' | 'SWING' | 'POSITION';

export type SortMode =
  | 'BEST_TRADES_NOW'
  | 'SAFEST_VIABLE'
  | 'HIGHEST_REWARD'
  | 'SHORT_BOARD'
  | 'MOMENTUM_BOARD';

export interface Regime {
  trend: 'TRENDING' | 'RANGING' | 'TRANSITIONAL';
  vol: 'HIGH' | 'NORMAL' | 'LOW';
  maAlignment: 'BULLISH' | 'BEARISH' | 'CHOPPY';
  squeeze: boolean;
}

export interface FullIndicators {
  rsi: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  atr: number | null;
  atrPercent: number | null;
  adx: number | null;
  bollingerB: number | null;       // %B  (0 = lower band, 1 = upper band)
  bollingerWidth: number | null;
  zScore: number | null;
  roc20: number | null;            // 20-day rate of change %
  rvol: number | null;             // relative volume (today / 20d avg)
  obvSlope: number | null;         // on-balance volume trend
  sma20Slope: number | null;       // % change of SMA20 over 5 bars
  sma50Slope: number | null;
  maAlignmentScore: number | null; // +3 full bull align, -3 full bear
}

export interface ScenarioTree {
  ifGoes: string;
  ifStalls: string;
  ifFails: string;
}

export interface TradeCard {
  symbol: string;
  name: string;
  setupType: BoardType;
  direction: Direction;
  durationBucket: DurationBucket;
  entryTrigger: string;
  entry: number;
  stop: number;
  targets: { t1: number; t2: number };
  timeStop: string;
  riskR: number;
  rewardR_t1: number;
  rewardR_t2: number;
  scenarioTree: ScenarioTree;
  riskFlags: string[];
  // Scoring
  pWin: number;
  evR: number;
  tailRiskPenalty: number;
  liquidityScore: number;
  confidence: number;
  // Context
  regime: Regime;
  indicators: FullIndicators;
  board: BoardType;
  reasoning: string;
  // Compat fields for existing frontend during migration
  type: 'bullish' | 'bearish';
  pattern: string;
  target: number;
  stopLoss: number;
  riskReward: number;
  timeframe: string;
  confidenceTag: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ======================== INDICATOR LIBRARY ========================

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number.isFinite(sum) ? sum / period : null;
}

function ema(values: number[], period: number): number[] | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  if (!Number.isFinite(seed)) return null;
  const series = new Array(values.length).fill(NaN);
  let e = seed;
  series[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    if (!Number.isFinite(values[i])) return null;
    e = values[i] * k + e * (1 - k);
    series[i] = e;
  }
  return series;
}

function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const start = closes.length - (period + 1);
  let gains = 0, losses = 0;
  for (let i = start + 1; i < start + 1 + period; i++) {
    const d = closes[i] - closes[i - 1];
    if (!Number.isFinite(d)) return null;
    if (d > 0) gains += d; else losses -= d;
  }
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (gains / period) / avgLoss));
}

function computeMACD(closes: number[]): { value: number; signal: number; histogram: number } | null {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  if (!ema12 || !ema26) return null;
  const ml: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (Number.isFinite(ema12[i]) && Number.isFinite(ema26[i])) ml.push(ema12[i] - ema26[i]);
  }
  if (ml.length < 9) return null;
  const sig = ema(ml, 9);
  if (!sig) return null;
  const v = ml[ml.length - 1], s = sig[sig.length - 1];
  if (!Number.isFinite(v) || !Number.isFinite(s)) return null;
  return { value: r2(v), signal: r2(s), histogram: r2(v - s) };
}

/** Average True Range */
function computeATR(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  // Wilder smoothing
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number.isFinite(atr) ? atr : null;
}

/** ADX from DI+/DI- */
function computeADX(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period * 2 + 1) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].h - bars[i - 1].h;
    const downMove = bars[i - 1].l - bars[i].l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    ));
  }
  // Wilder smooth
  const smooth = (arr: number[]) => {
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = period; i < arr.length; i++) {
      s = s - s / period + arr[i];
      out.push(s);
    }
    return out;
  };
  const smPlusDM = smooth(plusDM);
  const smMinusDM = smooth(minusDM);
  const smTR = smooth(trs);
  const dx: number[] = [];
  for (let i = 0; i < smTR.length; i++) {
    if (smTR[i] === 0) { dx.push(0); continue; }
    const pdi = (smPlusDM[i] / smTR[i]) * 100;
    const mdi = (smMinusDM[i] / smTR[i]) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  if (dx.length < period) return null;
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }
  return Number.isFinite(adx) ? r2(adx) : null;
}

/** Bollinger Bands: returns { percentB, width } */
function computeBollinger(closes: number[], period = 20, mult = 2): { percentB: number; width: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  const upper = mean + mult * sd;
  const lower = mean - mult * sd;
  const last = closes[closes.length - 1];
  const width = (upper - lower) / mean;
  const percentB = (last - lower) / (upper - lower);
  return { percentB: r4(percentB), width: r4(width) };
}

/** Z-score: (price - mean) / stdev */
function computeZScore(closes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  return r2((closes[closes.length - 1] - mean) / sd);
}

/** Rate of Change % */
function computeROC(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const past = closes[closes.length - 1 - period];
  if (!past || past === 0) return null;
  return r2(((closes[closes.length - 1] - past) / past) * 100);
}

/** Relative Volume */
function computeRVOL(bars: OHLCVBar[], period = 20): number | null {
  if (bars.length < period + 1) return null;
  const todayVol = bars[bars.length - 1].v;
  const avg = bars.slice(-period - 1, -1).reduce((a, b) => a + b.v, 0) / period;
  if (avg === 0 || !Number.isFinite(avg)) return null;
  return r2(todayVol / avg);
}

/** OBV slope (linear regression slope of last 20 OBV values, normalized) */
function computeOBVSlope(bars: OHLCVBar[], period = 20): number | null {
  if (bars.length < period + 1) return null;
  let obv = 0;
  const obvSeries: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].c > bars[i - 1].c) obv += bars[i].v;
    else if (bars[i].c < bars[i - 1].c) obv -= bars[i].v;
    obvSeries.push(obv);
  }
  const recent = obvSeries.slice(-period);
  if (recent.length < period) return null;
  // Simple slope: (last - first) / period, normalized by avg absolute OBV
  const slope = (recent[recent.length - 1] - recent[0]) / period;
  const avgAbsOBV = recent.reduce((a, b) => a + Math.abs(b), 0) / period;
  if (avgAbsOBV === 0) return 0;
  return r4(slope / avgAbsOBV);
}

/** SMA slope: percent change of SMA over lookback bars */
function computeSMASlope(closes: number[], smaPeriod: number, lookback = 5): number | null {
  if (closes.length < smaPeriod + lookback) return null;
  const currentSMA = sma(closes, smaPeriod);
  const pastCloses = closes.slice(0, -lookback);
  const pastSMA = sma(pastCloses, smaPeriod);
  if (currentSMA === null || pastSMA === null || pastSMA === 0) return null;
  return r4(((currentSMA - pastSMA) / pastSMA) * 100);
}

/** MA alignment score: +1 for each bullish ordering pair, -1 for bearish */
function computeMAAlignment(price: number, sma20: number | null, sma50: number | null, sma200: number | null): number | null {
  if (sma20 === null || sma50 === null || sma200 === null) return null;
  let score = 0;
  if (price > sma20) score++; else score--;
  if (sma20 > sma50) score++; else score--;
  if (sma50 > sma200) score++; else score--;
  return score;
}

// ======================== FULL INDICATOR COMPUTE ========================

export function computeFullIndicators(bars: OHLCVBar[]): FullIndicators {
  const closes = bars.map(b => b.c);
  const rsi = computeRSI(closes);
  const sma20Val = sma(closes, 20);
  const sma50Val = sma(closes, 50);
  const sma200Val = sma(closes, 200);
  const macd = computeMACD(closes);
  const atrVal = computeATR(bars);
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : 0;
  const atrPct = atrVal && lastClose ? r2((atrVal / lastClose) * 100) : null;
  const adx = computeADX(bars);
  const bb = computeBollinger(closes);
  const zScore = computeZScore(closes);
  const roc20 = computeROC(closes, 20);
  const rvol = computeRVOL(bars);
  const obvSlope = computeOBVSlope(bars);
  const sma20Slope = computeSMASlope(closes, 20);
  const sma50Slope = computeSMASlope(closes, 50);
  const maAlign = computeMAAlignment(lastClose, sma20Val, sma50Val, sma200Val);

  return {
    rsi: rsi !== null ? r1(rsi) : null,
    sma20: sma20Val !== null ? r2(sma20Val) : null,
    sma50: sma50Val !== null ? r2(sma50Val) : null,
    sma200: sma200Val !== null ? r2(sma200Val) : null,
    macd,
    atr: atrVal !== null ? r2(atrVal) : null,
    atrPercent: atrPct,
    adx,
    bollingerB: bb ? bb.percentB : null,
    bollingerWidth: bb ? bb.width : null,
    zScore,
    roc20,
    rvol,
    obvSlope,
    sma20Slope,
    sma50Slope,
    maAlignmentScore: maAlign,
  };
}

// ======================== REGIME DETECTION ========================

export function detectRegime(ind: FullIndicators, bars: OHLCVBar[]): Regime {
  // Trend vs Range
  const adx = ind.adx ?? 20;
  const trend: Regime['trend'] = adx > 25 ? 'TRENDING' : adx < 20 ? 'RANGING' : 'TRANSITIONAL';

  // Vol regime: current ATR% vs 60-day average ATR%
  let vol: Regime['vol'] = 'NORMAL';
  if (bars.length >= 60 && ind.atrPercent !== null) {
    const atrPctSeries: number[] = [];
    for (let i = 14; i < bars.length; i++) {
      const slice = bars.slice(Math.max(0, i - 14), i + 1);
      const a = computeATR(slice, 14);
      if (a !== null && slice[slice.length - 1].c > 0) {
        atrPctSeries.push((a / slice[slice.length - 1].c) * 100);
      }
    }
    if (atrPctSeries.length >= 20) {
      const avg = atrPctSeries.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, atrPctSeries.length);
      if (ind.atrPercent > avg * 1.3) vol = 'HIGH';
      else if (ind.atrPercent < avg * 0.7) vol = 'LOW';
    }
  }

  // MA alignment
  const maScore = ind.maAlignmentScore ?? 0;
  const maAlignment: Regime['maAlignment'] = maScore >= 2 ? 'BULLISH' : maScore <= -2 ? 'BEARISH' : 'CHOPPY';

  // Squeeze: Bollinger width below its own 20-bar average
  let squeeze = false;
  if (ind.bollingerWidth !== null && bars.length >= 40) {
    const closes = bars.map(b => b.c);
    const widths: number[] = [];
    for (let i = 20; i <= closes.length; i++) {
      const bb = computeBollinger(closes.slice(0, i), 20);
      if (bb) widths.push(bb.width);
    }
    if (widths.length >= 20) {
      const avgWidth = widths.slice(-20).reduce((a, b) => a + b, 0) / 20;
      squeeze = ind.bollingerWidth < avgWidth * 0.85;
    }
  }

  return { trend, vol, maAlignment, squeeze };
}

// ======================== BOARD CLASSIFICATION ========================

export function classifyBoard(price: number, ind: FullIndicators, regime: Regime): { board: BoardType; direction: Direction; reasons: string[] } {
  const rsi = ind.rsi ?? 50;
  const adx = ind.adx ?? 20;
  const zScore = ind.zScore ?? 0;
  const bb = ind.bollingerB ?? 0.5;
  const maScore = ind.maAlignmentScore ?? 0;
  const roc = ind.roc20 ?? 0;
  const rvol = ind.rvol ?? 1;
  const sma20 = ind.sma20 ?? price;
  const sma50 = ind.sma50 ?? price;
  const sma200 = ind.sma200 ?? price;
  const sma20Slope = ind.sma20Slope ?? 0;

  // Score each board; pick the highest
  const boards: { board: BoardType; direction: Direction; score: number; reasons: string[] }[] = [];

  // BREAKOUT_LONG: Compression + approaching resistance + bull MA + rising volume
  {
    let score = 0;
    const reasons: string[] = [];
    if (regime.squeeze) { score += 30; reasons.push('Bollinger squeeze active'); }
    if (bb > 0.7 && bb < 1.05) { score += 20; reasons.push(`%B ${r2(bb)} near upper band`); }
    if (maScore >= 1) { score += 15; reasons.push('Bullish MA structure'); }
    if (rvol > 1.2) { score += 15; reasons.push(`RVOL ${r2(rvol)}x above average`); }
    if (rsi > 50 && rsi < 70) { score += 10; reasons.push('RSI in bullish zone'); }
    if (sma20Slope > 0) { score += 10; reasons.push('SMA20 rising'); }
    boards.push({ board: 'BREAKOUT_LONG', direction: 'LONG', score, reasons });
  }

  // TREND_PULLBACK: Trending (ADX>25) + pullback to MA support + RSI 40-55
  {
    let score = 0;
    const reasons: string[] = [];
    if (adx > 25) { score += 25; reasons.push(`ADX ${adx} confirms trend`); }
    if (price >= sma20 * 0.97 && price <= sma20 * 1.01) { score += 25; reasons.push('Price at SMA20 support'); }
    if (rsi >= 40 && rsi <= 55) { score += 20; reasons.push(`RSI ${r1(rsi)} in pullback zone`); }
    if (maScore >= 2) { score += 15; reasons.push('Strong MA alignment'); }
    if (ind.macd && ind.macd.histogram > 0) { score += 10; reasons.push('MACD still positive'); }
    boards.push({ board: 'TREND_PULLBACK', direction: 'LONG', score, reasons });
  }

  // MEAN_REVERT_LONG: Z-score < -2 or RSI < 30 in range regime
  {
    let score = 0;
    const reasons: string[] = [];
    if (zScore < -2) { score += 35; reasons.push(`Z-score ${zScore} extreme oversold`); }
    else if (zScore < -1.5) { score += 20; reasons.push(`Z-score ${zScore} oversold`); }
    if (rsi < 30) { score += 30; reasons.push(`RSI ${r1(rsi)} oversold`); }
    else if (rsi < 35) { score += 15; reasons.push(`RSI ${r1(rsi)} approaching oversold`); }
    if (regime.trend === 'RANGING') { score += 15; reasons.push('Range regime favors mean reversion'); }
    if (bb < 0.05) { score += 10; reasons.push('Price at lower Bollinger band'); }
    boards.push({ board: 'MEAN_REVERT_LONG', direction: 'LONG', score, reasons });
  }

  // SHORT_BREAKDOWN: Below key MAs + weak structure + bearish alignment
  {
    let score = 0;
    const reasons: string[] = [];
    if (price < sma20 && price < sma50) { score += 25; reasons.push('Price below SMA20 and SMA50'); }
    if (maScore <= -2) { score += 20; reasons.push('Bearish MA alignment'); }
    if (rsi < 45 && rsi > 25) { score += 15; reasons.push(`RSI ${r1(rsi)} weak without bounce`); }
    if (ind.macd && ind.macd.histogram < 0) { score += 15; reasons.push('MACD negative'); }
    if (sma20Slope < -0.1) { score += 10; reasons.push('SMA20 declining'); }
    if (rvol > 1.2) { score += 10; reasons.push('Elevated volume on breakdown'); }
    boards.push({ board: 'SHORT_BREAKDOWN', direction: 'SHORT', score, reasons });
  }

  // PARABOLIC_FADE: Extreme extension + overbought
  {
    let score = 0;
    const reasons: string[] = [];
    if (zScore > 2.5) { score += 35; reasons.push(`Z-score ${zScore} extreme extension`); }
    else if (zScore > 2) { score += 20; reasons.push(`Z-score ${zScore} extended`); }
    if (rsi > 75) { score += 25; reasons.push(`RSI ${r1(rsi)} overbought`); }
    if (price > sma20 * 1.06) { score += 15; reasons.push('Price >6% above SMA20'); }
    if (roc > 15) { score += 10; reasons.push(`ROC ${r1(roc)}% parabolic move`); }
    boards.push({ board: 'PARABOLIC_FADE', direction: 'SHORT', score, reasons });
  }

  // MOMENTUM_CONTINUATION: Strong trend + positive ROC + volume confirmation
  {
    let score = 0;
    const reasons: string[] = [];
    if (adx > 25 && regime.maAlignment === 'BULLISH') { score += 25; reasons.push('Strong bullish trend'); }
    if (roc > 5) { score += 20; reasons.push(`ROC ${r1(roc)}% positive momentum`); }
    if (rvol > 1.0) { score += 15; reasons.push('Volume confirms move'); }
    if (rsi > 55 && rsi < 75) { score += 15; reasons.push(`RSI ${r1(rsi)} in momentum zone`); }
    if (ind.macd && ind.macd.histogram > 0) { score += 10; reasons.push('MACD positive'); }
    if (price > sma50) { score += 10; reasons.push('Price above SMA50'); }
    boards.push({ board: 'MOMENTUM_CONTINUATION', direction: 'LONG', score, reasons });
  }

  // SWING_REVERSAL: Trend exhaustion signals + divergence
  {
    let score = 0;
    const reasons: string[] = [];
    if (rsi > 70 && roc < 0) { score += 30; reasons.push('RSI overbought but ROC negative = bearish divergence'); }
    if (rsi < 30 && roc > 0) { score += 30; reasons.push('RSI oversold but ROC positive = bullish divergence'); }
    if (regime.trend === 'TRANSITIONAL') { score += 15; reasons.push('Trend transitioning'); }
    if (Math.abs(zScore) > 1.5) { score += 15; reasons.push(`Z-score ${zScore} extended`); }
    if (rvol > 1.5) { score += 10; reasons.push('Volume spike at extremes'); }
    const dir: Direction = rsi > 60 ? 'SHORT' : 'LONG';
    boards.push({ board: 'SWING_REVERSAL', direction: dir, score, reasons });
  }

  // Pick highest scoring board
  boards.sort((a, b) => b.score - a.score);
  const best = boards[0];
  // Must have minimum conviction (score >= 20) to classify; otherwise default to MOMENTUM_CONTINUATION
  if (best.score < 20) {
    return {
      board: 'MOMENTUM_CONTINUATION',
      direction: price > sma50 ? 'LONG' : 'SHORT',
      reasons: ['Weak signals; defaulting to momentum read'],
    };
  }
  return { board: best.board, direction: best.direction, reasons: best.reasons };
}

// ======================== TRADE CARD BUILDER ========================

/** Base rates: pWin, avgWinR, avgLossR by setup type + regime */
const BASE_RATES: Record<BoardType, { pWin: number; avgWinR: number; avgLossR: number }> = {
  BREAKOUT_LONG:          { pWin: 0.52, avgWinR: 2.2, avgLossR: 1.0 },
  TREND_PULLBACK:         { pWin: 0.58, avgWinR: 1.8, avgLossR: 1.0 },
  MEAN_REVERT_LONG:       { pWin: 0.60, avgWinR: 1.5, avgLossR: 1.0 },
  SHORT_BREAKDOWN:        { pWin: 0.48, avgWinR: 2.0, avgLossR: 1.0 },
  PARABOLIC_FADE:         { pWin: 0.45, avgWinR: 2.5, avgLossR: 1.0 },
  MOMENTUM_CONTINUATION:  { pWin: 0.55, avgWinR: 1.8, avgLossR: 1.0 },
  SWING_REVERSAL:         { pWin: 0.45, avgWinR: 2.3, avgLossR: 1.0 },
};

function computeEntryStopTargets(
  price: number,
  direction: Direction,
  ind: FullIndicators,
  board: BoardType,
): { entry: number; stop: number; t1: number; t2: number; trigger: string; duration: DurationBucket; timeStop: string } {
  const atr = ind.atr ?? price * 0.02;
  const sma20 = ind.sma20 ?? price;
  const sma50 = ind.sma50 ?? price;

  let stop: number;
  let t1: number;
  let t2: number;
  let trigger: string;
  let duration: DurationBucket = 'SWING';
  let timeStop = '5 trading days';

  if (direction === 'LONG') {
    switch (board) {
      case 'BREAKOUT_LONG':
        stop = r2(price - atr * 1.5);
        t1 = r2(price + atr * 2);
        t2 = r2(price + atr * 3.5);
        trigger = `Break above ${r2(price + atr * 0.3)} with volume`;
        duration = 'SWING';
        timeStop = '5 trading days';
        break;
      case 'TREND_PULLBACK':
        stop = r2(Math.min(sma50, price - atr * 1.5));
        t1 = r2(price + atr * 1.5);
        t2 = r2(price + atr * 2.5);
        trigger = `Bounce from SMA20 (${r2(sma20)}) support`;
        duration = 'SWING';
        timeStop = '7 trading days';
        break;
      case 'MEAN_REVERT_LONG':
        stop = r2(price - atr * 1.2);
        t1 = r2(sma20);
        t2 = r2(sma20 + atr * 0.5);
        trigger = `RSI reversal from oversold with volume confirmation`;
        duration = 'DAY';
        timeStop = '3 trading days';
        break;
      case 'MOMENTUM_CONTINUATION':
        stop = r2(price - atr * 1.5);
        t1 = r2(price + atr * 2);
        t2 = r2(price + atr * 3);
        trigger = `Continued momentum above ${r2(sma20)}`;
        duration = 'SWING';
        timeStop = '10 trading days';
        break;
      default:
        stop = r2(price - atr * 1.5);
        t1 = r2(price + atr * 2);
        t2 = r2(price + atr * 3);
        trigger = `Bullish signal confirmation`;
        duration = 'SWING';
        timeStop = '5 trading days';
    }
  } else {
    // SHORT direction
    switch (board) {
      case 'SHORT_BREAKDOWN':
        stop = r2(price + atr * 1.5);
        t1 = r2(price - atr * 2);
        t2 = r2(price - atr * 3.5);
        trigger = `Break below ${r2(price - atr * 0.3)} with volume`;
        duration = 'SWING';
        timeStop = '5 trading days';
        break;
      case 'PARABOLIC_FADE':
        stop = r2(price + atr * 1.2);
        t1 = r2(price - atr * 1.5);
        t2 = r2(sma20);
        trigger = `Exhaustion candle or RSI divergence below 70`;
        duration = 'DAY';
        timeStop = '3 trading days';
        break;
      case 'SWING_REVERSAL':
        stop = r2(price + atr * 1.5);
        t1 = r2(price - atr * 2);
        t2 = r2(price - atr * 3);
        trigger = `Breakdown through ${r2(sma20)} with momentum`;
        duration = 'SWING';
        timeStop = '5 trading days';
        break;
      default:
        stop = r2(price + atr * 1.5);
        t1 = r2(price - atr * 2);
        t2 = r2(price - atr * 3);
        trigger = `Bearish signal confirmation`;
        duration = 'SWING';
        timeStop = '5 trading days';
    }
  }

  return { entry: r2(price), stop, t1, t2, trigger, duration, timeStop };
}

function buildScenarioTree(board: BoardType, direction: Direction, entry: number, stop: number, t1: number): ScenarioTree {
  if (direction === 'LONG') {
    return {
      ifGoes: `Move to ${r2(t1)}: trail stop to entry. Let T2 run.`,
      ifStalls: `Chop between ${r2(entry)} and ${r2(entry + (t1 - entry) * 0.3)}: reduce size by half at time stop.`,
      ifFails: `Break below ${r2(stop)}: exit full position. Reassess after 2 bars.`,
    };
  }
  return {
    ifGoes: `Move to ${r2(t1)}: trail stop to entry. Let T2 run.`,
    ifStalls: `Chop between ${r2(entry)} and ${r2(entry - (entry - t1) * 0.3)}: reduce size by half at time stop.`,
    ifFails: `Break above ${r2(stop)}: exit full position. Reassess after 2 bars.`,
  };
}

function computeRiskFlags(ind: FullIndicators, regime: Regime, board: BoardType): string[] {
  const flags: string[] = [];
  const rsi = ind.rsi ?? 50;
  if (rsi > 80) flags.push('EXTREME_OVERBOUGHT');
  if (rsi < 20) flags.push('EXTREME_OVERSOLD');
  if (regime.vol === 'HIGH') flags.push('HIGH_VOLATILITY');
  if (ind.rvol !== null && ind.rvol > 3) flags.push('VOLUME_SPIKE');
  if (regime.squeeze) flags.push('SQUEEZE_ACTIVE');
  if (ind.atrPercent !== null && ind.atrPercent > 5) flags.push('WIDE_RANGE');
  if (board === 'PARABOLIC_FADE') flags.push('PARABOLIC_RISK');
  if (board === 'SHORT_BREAKDOWN') flags.push('SHORT_SQUEEZE_POSSIBLE');
  return flags;
}

function computeLiquidity(bars: OHLCVBar[]): number {
  if (bars.length < 20) return 50;
  const avgVol = bars.slice(-20).reduce((a, b) => a + b.v, 0) / 20;
  // Score 0-100 based on average daily volume
  if (avgVol > 10_000_000) return 100;
  if (avgVol > 5_000_000) return 90;
  if (avgVol > 1_000_000) return 75;
  if (avgVol > 500_000) return 60;
  if (avgVol > 100_000) return 40;
  return 20;
}

export function buildTradeCard(
  symbol: string,
  price: number,
  bars: OHLCVBar[],
  ind: FullIndicators,
  regime: Regime,
): TradeCard {
  const { board, direction, reasons } = classifyBoard(price, ind, regime);
  const { entry, stop, t1, t2, trigger, duration, timeStop } = computeEntryStopTargets(price, direction, ind, board);

  const risk = Math.abs(entry - stop);
  const riskR = risk > 0 ? r2(risk) : r2(price * 0.02);
  const effectiveRisk = riskR > 0 ? riskR : 1;
  const rewardR_t1 = r2(Math.abs(t1 - entry) / effectiveRisk);
  const rewardR_t2 = r2(Math.abs(t2 - entry) / effectiveRisk);

  // EV_R scoring
  const base = BASE_RATES[board];
  let pWin = base.pWin;

  // Condition boosts
  if (ind.rvol !== null && ind.rvol > 1.3) pWin += 0.05;
  if (ind.adx !== null && ind.adx > 30 && (board === 'TREND_PULLBACK' || board === 'MOMENTUM_CONTINUATION')) pWin += 0.05;
  if (regime.squeeze && board === 'BREAKOUT_LONG') pWin += 0.05;
  if (regime.trend === 'TRENDING' && (board === 'TREND_PULLBACK' || board === 'MOMENTUM_CONTINUATION')) pWin += 0.03;
  if (regime.trend === 'RANGING' && board === 'MEAN_REVERT_LONG') pWin += 0.05;
  // Penalties
  if (regime.vol === 'HIGH') pWin -= 0.03;
  if (ind.rsi !== null && (ind.rsi > 80 || ind.rsi < 20)) pWin -= 0.03;

  pWin = Math.max(0.2, Math.min(0.85, pWin));

  const avgWinR = Math.max(rewardR_t1, base.avgWinR);
  const avgLossR = base.avgLossR;
  const evR = r3(pWin * avgWinR - (1 - pWin) * avgLossR);

  const tailRiskPenalty = computeRiskFlags(ind, regime, board).length * 5;
  const liquidityScore = computeLiquidity(bars);

  const confidence = Math.max(1, Math.min(100, Math.round(pWin * 100 + evR * 10)));
  const confidenceTag: 'HIGH' | 'MEDIUM' | 'LOW' = confidence >= 70 ? 'HIGH' : confidence >= 50 ? 'MEDIUM' : 'LOW';

  const scenarioTree = buildScenarioTree(board, direction, entry, stop, t1);
  const riskFlags = computeRiskFlags(ind, regime, board);

  const reasoning = reasons.join('; ') + `. EV/R: ${evR > 0 ? '+' : ''}${evR}. Regime: ${regime.trend}/${regime.vol}.`;

  // Board name to pattern label
  const patternLabels: Record<BoardType, string> = {
    BREAKOUT_LONG: 'Breakout Long',
    TREND_PULLBACK: 'Trend Pullback',
    MEAN_REVERT_LONG: 'Mean Reversion',
    SHORT_BREAKDOWN: 'Short Breakdown',
    PARABOLIC_FADE: 'Parabolic Fade',
    MOMENTUM_CONTINUATION: 'Momentum Continuation',
    SWING_REVERSAL: 'Swing Reversal',
  };

  return {
    symbol,
    name: symbol,
    setupType: board,
    direction,
    durationBucket: duration,
    entryTrigger: trigger,
    entry,
    stop,
    targets: { t1, t2 },
    timeStop,
    riskR,
    rewardR_t1,
    rewardR_t2,
    scenarioTree,
    riskFlags,
    pWin: r3(pWin),
    evR,
    tailRiskPenalty,
    liquidityScore,
    confidence,
    regime,
    indicators: ind,
    board,
    reasoning,
    // Compat
    type: direction === 'LONG' ? 'bullish' : 'bearish',
    pattern: patternLabels[board],
    target: t1,
    stopLoss: stop,
    riskReward: r2(rewardR_t1),
    timeframe: timeStop,
    confidenceTag,
  };
}

// ======================== SORT MODES ========================

export function sortTradeCards(cards: TradeCard[], mode: SortMode): TradeCard[] {
  const sorted = [...cards];
  switch (mode) {
    case 'BEST_TRADES_NOW':
      sorted.sort((a, b) => {
        if (b.evR !== a.evR) return b.evR - a.evR;
        if (a.tailRiskPenalty !== b.tailRiskPenalty) return a.tailRiskPenalty - b.tailRiskPenalty;
        if (b.liquidityScore !== a.liquidityScore) return b.liquidityScore - a.liquidityScore;
        return b.confidence - a.confidence;
      });
      break;
    case 'SAFEST_VIABLE':
      sorted.sort((a, b) => {
        // Filter: only show positive EV + low tail risk
        const aViable = a.evR > 0 && a.tailRiskPenalty < 20 ? 1 : 0;
        const bViable = b.evR > 0 && b.tailRiskPenalty < 20 ? 1 : 0;
        if (bViable !== aViable) return bViable - aViable;
        if (a.tailRiskPenalty !== b.tailRiskPenalty) return a.tailRiskPenalty - b.tailRiskPenalty;
        if (b.liquidityScore !== a.liquidityScore) return b.liquidityScore - a.liquidityScore;
        return b.evR - a.evR;
      });
      break;
    case 'HIGHEST_REWARD':
      sorted.sort((a, b) => {
        // Highest R:R where pWin > 0.4
        const aEligible = a.pWin > 0.4 ? 1 : 0;
        const bEligible = b.pWin > 0.4 ? 1 : 0;
        if (bEligible !== aEligible) return bEligible - aEligible;
        return b.rewardR_t2 - a.rewardR_t2;
      });
      break;
    case 'SHORT_BOARD':
      return sorted
        .filter(c => c.direction === 'SHORT')
        .sort((a, b) => b.evR - a.evR);
    case 'MOMENTUM_BOARD':
      return sorted
        .filter(c => c.board === 'BREAKOUT_LONG' || c.board === 'MOMENTUM_CONTINUATION')
        .sort((a, b) => b.evR - a.evR);
  }
  return sorted;
}

export function filterByBoard(cards: TradeCard[], board: string): TradeCard[] {
  if (!board || board === 'ALL') return cards;
  return cards.filter(c => c.board === board);
}

// ======================== HELPERS ========================

function r1(n: number): number { return Math.round(n * 10) / 10; }
function r2(n: number): number { return Math.round(n * 100) / 100; }
function r3(n: number): number { return Math.round(n * 1000) / 1000; }
function r4(n: number): number { return Math.round(n * 10000) / 10000; }
