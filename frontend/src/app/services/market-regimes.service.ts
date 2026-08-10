import { Injectable, computed, signal } from '@angular/core';

import {
  ASYMMETRY_TOLERANCE,
  CRASH_RISK_VOLATILITY_THRESHOLD,
  EMPTY_DETAIL,
  FACTOR_EXPLAINED_VARIANCE,
  LOAD_FAILURE_DETAIL,
  LOAD_FAILURE_MESSAGE,
  LOW_CONFIDENCE_BAND_PCT,
  LOW_CONFIDENCE_NOTE,
  MIN_SAMPLE_MONTHS,
  REGIME_MODELS,
  SAMPLE_FROM_DEFAULT,
  SAMPLE_MONTH_FIRST,
  SAMPLE_MONTH_LAST,
  SAMPLE_TO_DEFAULT,
  SAMPLE_WINDOW_ORDER_ERROR,
  SEND_VIEW_FAILURE_DETAIL,
  SEND_VIEW_FAILURE_MESSAGE,
  SERIES_PAIRS,
  SIZE_PREMIUM_NOT_SPECIFIED,
  THETA_DEFAULT,
  THETA_MAX,
  THETA_MIN,
  THETA_STEP,
  UNCERTAINTY_HIGH_THRESHOLD,
  VIEWS_BUILDER_ROUTE,
  VIEW_DIRECTION_COPY,
  type ConditionalProfit,
  type CorrelationCell,
  type DominantStateReading,
  type EmptyReason,
  type ExceedanceModelId,
  type ExceedanceReading,
  type ExceedanceSeries,
  type FactorCount,
  type FactorLoadingBlock,
  type MacroNowcast,
  type MarketRegimeModelId,
  type MomentumCrashRisk,
  type MomentumLookback,
  type MomentumMarketState,
  type MomentumState,
  type NowcastRelease,
  type ProbabilityBasis,
  type ProbabilityPathSeries,
  type RegimeDiagnostics,
  type RegimeImpliedView,
  type RegimeStateReading,
  type RegimeStatisticsRow,
  type RegimeUniverse,
  type RegimeUniverseId,
  type SampleMonth,
  type SentView,
  type SeriesPair,
  type SeriesPairId,
  type SizePremiumRow,
  type StateProbability,
  type UncertaintyLevel,
  type ValuePremiumRow,
  type ViewDirection,
  type WmlSharpeRow,
} from '../models/market-regimes.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 700;

// ---------------------------------------------------------------------------
// Vocabulary 1 — the toolbar's regime model
//
// The state names are read out of the shared `REGIME_MODELS`, not written
// again here. Doc 12's Macro & Regimes Agent owns that vocabulary; a second
// copy would be free to drift away from it.
// ---------------------------------------------------------------------------

function statesOf(model: MarketRegimeModelId): readonly string[] {
  const found = REGIME_MODELS.find((definition) => definition.id === model);
  if (!found) throw new Error(`no shared definition for regime model ${model}`);
  return found.states;
}

const MODEL_STATES: Record<MarketRegimeModelId, readonly string[]> = {
  'four-state': statesOf('four-state'),
  hamilton: statesOf('hamilton'),
};

/** The four-state VAR taxonomy, pinned — the Size Premium panel never leaves it. */
const VAR_STATES = MODEL_STATES['four-state'];

/** π_i, the stationary probability of each state. Percent. */
const STATIONARY_PROBABILITY: Record<string, number> = {
  Crash: 9,
  'Slow Growth': 40,
  Bull: 28,
  Recovery: 23,
  // π = (1−q)/((1−p)+(1−q)) with p̂ = 0.9049 and q̂ = 0.7550.
  Recession: 28,
  Expansion: 72,
};

/** 1/(1 − p_ii), in months. */
const AVERAGE_DURATION_MONTHS: Record<string, number> = {
  Crash: 2,
  'Slow Growth': 7,
  Bull: 8,
  Recovery: 3,
  // 4.1 and 10.5 quarters.
  Recession: 12,
  Expansion: 32,
};

const STATE_DESCRIPTION: Record<string, string> = {
  Crash: 'large negative mean returns, high volatility',
  'Slow Growth': 'low volatility, small positive returns',
  Bull: 'persistent expansion, strongest in small caps',
  Recovery: 'sharp rebounds, high small-cap and bond volatility',
  Recession: 'contraction, about 4.1 quarters expected',
  Expansion: 'expansion, about 10.5 quarters expected',
};

/** Monthly mean return of the universe conditional on the state, percent. */
const STATE_MEAN_RETURN: Record<string, number> = {
  Crash: -4.8,
  'Slow Growth': 0.4,
  Bull: 1.3,
  Recovery: 2.6,
  Recession: -1.1,
  Expansion: 0.9,
};

/** Monthly return volatility conditional on the state, percent. */
const STATE_VOLATILITY: Record<string, number> = {
  Crash: 7.4,
  'Slow Growth': 2.1,
  Bull: 3.2,
  Recovery: 6.1,
  Recession: 5.2,
  Expansion: 3.0,
};

const MISSING_SERIES: CorrelationCell = { value: null, note: 'series-missing' };

/**
 * ρ(Large, Small) by state.
 *
 * Only Crash and Recovery are fixed — 0.82 and 0.50. Slow Growth and Bull sit
 * between them, but no value is invented for either, and the Hamilton states
 * are not a taxonomy this correlation was ever estimated over.
 */
const LARGE_SMALL_BY_STATE: Record<string, CorrelationCell> = {
  Crash: { value: 0.82, note: null },
  'Slow Growth': { value: null, note: 'not-fixed' },
  Bull: { value: null, note: 'not-fixed' },
  Recovery: { value: 0.5, note: null },
  Recession: { value: null, note: 'not-fixed' },
  Expansion: { value: null, note: 'not-fixed' },
};

/**
 * ρ(Equity, Long bonds) by state.
 *
 * The substance fixes the sign change and one magnitude: −0.40 in the crash,
 * positive everywhere else. "Positive" is printed as a sign, not as a number.
 */
const EQUITY_BOND_BY_STATE: Record<string, CorrelationCell> = {
  Crash: { value: -0.4, note: null },
  'Slow Growth': { value: null, note: 'positive' },
  Bull: { value: null, note: 'positive' },
  Recovery: { value: null, note: 'positive' },
  Recession: { value: null, note: 'not-fixed' },
  Expansion: { value: null, note: 'not-fixed' },
};

// ---------------------------------------------------------------------------
// Universes
// ---------------------------------------------------------------------------

const UNIVERSES: readonly RegimeUniverse[] = [
  {
    id: 'equities-bonds',
    label: 'Equities + Bonds',
    detail: 'Large cap · Small cap · LT Bonds',
    firstObservation: '1990-01',
    hasSizeSeries: true,
    hasEquityBondSeries: true,
    pairs: ['large-small', 'equity-bond'],
  },
  {
    id: 'equities-only',
    label: 'Equities only',
    detail: 'Large cap · Small cap',
    firstObservation: '1990-01',
    hasSizeSeries: true,
    hasEquityBondSeries: false,
    pairs: ['large-small'],
  },
  {
    id: 'global-multi-asset',
    label: 'Global multi-asset',
    detail: 'Equities · LT Bonds · Commodities · FX',
    firstObservation: '1995-01',
    hasSizeSeries: false,
    hasEquityBondSeries: true,
    pairs: ['equity-bond', 'commodity-equity'],
  },
  {
    id: 'em-equities',
    label: 'EM equities (added 2025-06)',
    detail: 'Single sleeve · no size or bond series',
    firstObservation: '2025-06',
    hasSizeSeries: false,
    hasEquityBondSeries: false,
    pairs: [],
  },
];

/** How much wider this universe's return distribution is than the reference one. */
const UNIVERSE_RISK_SCALE: Record<RegimeUniverseId, number> = {
  'equities-bonds': 1,
  'equities-only': 1.28,
  'global-multi-asset': 0.82,
  'em-equities': 1.45,
};

/** 126-day realised volatility of the universe, annualised percent. */
const UNIVERSE_REALISED_VOLATILITY: Record<RegimeUniverseId, number> = {
  'equities-bonds': 22.0,
  'equities-only': 34.5,
  'global-multi-asset': 18.4,
  'em-equities': 41.2,
};

// ---------------------------------------------------------------------------
// The filtered reading
// ---------------------------------------------------------------------------

/**
 * Filtered probabilities at the end of the default sample, by model and
 * universe, in the model's own state order.
 *
 * The universe is what moves the reading: the same filter run on equities
 * alone and on equities against bonds does not see the same market.
 */
const BASE_PROBABILITIES: Record<MarketRegimeModelId, Record<RegimeUniverseId, readonly number[]>> =
  {
    'four-state': {
      'equities-bonds': [58, 20, 12, 10],
      'equities-only': [12, 18, 56, 14],
      'global-multi-asset': [16, 46, 24, 14],
      'em-equities': [25, 25, 25, 25],
    },
    hamilton: {
      'equities-bonds': [61, 39],
      'equities-only': [24, 76],
      'global-multi-asset': [35, 65],
      'em-equities': [50, 50],
    },
  };

/**
 * Where the reading goes as the estimation sample shrinks to nothing.
 *
 * A short sample is dominated by the recent turbulent stretch, so the fitted
 * transition matrix puts more weight on the fragile states. The tilt is capped:
 * the window changes the estimate, it does not replace it.
 */
const SHORT_SAMPLE_PROBABILITIES: Record<MarketRegimeModelId, readonly number[]> = {
  'four-state': [70, 14, 6, 10],
  hamilton: [74, 26],
};

const MAX_WINDOW_TILT = 0.4;

/**
 * How much sharper the smoothed inference is than the real-time filter.
 *
 * `P[s_t | I_T]` conditions on the whole sample, including everything that
 * happened *after* t, so it resolves the months the filter was undecided about
 * rather than blurring them. Exponent > 1 pushes each month's vector toward its
 * modal state before it is renormalised.
 */
const SMOOTHER_SHARPNESS = 1.35;

// ---------------------------------------------------------------------------
// The probability path
// ---------------------------------------------------------------------------

const PATH_PERIODS = [83, 101, 119, 137];
const PATH_PHASES = [0, 1.7, 3.4, 5.1];

/** How many months the current state has been in front. */
const TAKEOVER_MONTHS = 2;
const TAKEOVER_BLEND = 0.85;

/**
 * How many months at the end of the sample the smoother leaves alone.
 *
 * Its revision power decays as `t → T`: the last month has no future to
 * condition on at all, and the two before it have one and two months of it. It
 * covers the current run and the month it began, so `most likely since` reads
 * the same on both bases — a smoothed run stretching back a year under a state
 * whose expected duration is two months would be the page contradicting itself
 * on one line.
 */
const SMOOTHER_FROZEN_TAIL = TAKEOVER_MONTHS + 1;

// ---------------------------------------------------------------------------
// Exceedance correlations
// ---------------------------------------------------------------------------

interface PairShape {
  readonly base: number;
  readonly downsideLift: number;
  readonly upsideFade: number;
}

/**
 * The shape of each pair's empirical exceedance correlation.
 *
 * Two equity sleeves move together hardest on the way down, so the downside
 * lift is positive. Equity against long bonds does the opposite: the crash
 * regime is where that correlation turns negative, so its lift is negative and
 * the pair declares `downsideExceedance: 'lower'`.
 */
const PAIR_SHAPE: Record<SeriesPairId, PairShape> = {
  'large-small': { base: 0.62, downsideLift: 0.1, upsideFade: 0.13 },
  'equity-bond': { base: -0.05, downsideLift: -0.14, upsideFade: -0.05 },
  'commodity-equity': { base: 0.31, downsideLift: 0.08, upsideFade: 0.09 },
};

const THETA_GRID: readonly number[] = buildThetaGrid();

function buildThetaGrid(): number[] {
  // Stepped off an integer index rather than accumulated, so the grid lands on
  // an exact zero at the centre and the slider's default finds itself on it.
  const steps = Math.round((THETA_MAX - THETA_MIN) / THETA_STEP);
  const grid: number[] = [];
  for (let i = 0; i <= steps; i++) grid.push(round2(THETA_MIN + i * THETA_STEP));
  return grid;
}

/** Selection intensity: how far past the threshold the conditioning reaches. */
function ramp(u: number): number {
  return u <= 0 ? 0 : u * (1 + 0.15 * u);
}

function empiricalCorrelation(shape: PairShape, theta: number): number {
  return shape.base + shape.downsideLift * ramp(-theta) - shape.upsideFade * ramp(theta);
}

/** A regime-switching fit tracks the empirical curve on both sides of θ. */
function regimeSwitchingCorrelation(shape: PairShape, theta: number): number {
  return empiricalCorrelation(shape, theta) + 0.015 * Math.cos((Math.PI * theta) / 2);
}

/** Under joint normality the exceedance correlation decays symmetrically. */
function normalCorrelation(shape: PairShape, theta: number): number {
  return shape.base * Math.exp(-0.5 * Math.abs(theta));
}

/** An asymmetric GARCH bends the curve, but nowhere near far enough. */
function asymmetricGarchCorrelation(shape: PairShape, theta: number): number {
  return shape.base * Math.exp(-0.45 * Math.abs(theta)) + 0.25 * shape.downsideLift * ramp(-theta);
}

const EXCEEDANCE_CURVES: Record<ExceedanceModelId, (shape: PairShape, theta: number) => number> = {
  empirical: empiricalCorrelation,
  'regime-switching': regimeSwitchingCorrelation,
  normal: normalCorrelation,
  'asymmetric-garch': asymmetricGarchCorrelation,
};

/** The three candidates the empirical curve is the benchmark for. */
const CANDIDATE_EXCEEDANCE_MODELS: readonly ExceedanceModelId[] = [
  'regime-switching',
  'normal',
  'asymmetric-garch',
];

// ---------------------------------------------------------------------------
// Macro nowcast
// ---------------------------------------------------------------------------

const NOWCAST_GDP_QOQ = 1.4;
const NOWCAST_VINTAGE = '2026-07-28';
const NOWCAST_PRIOR_VINTAGE = '2026-07-21';
const NOWCAST_DELTA_PP = 0.2;

const FACTOR_LOADINGS: Record<FactorCount, readonly FactorLoadingBlock[]> = {
  6: [
    {
      range: '1–3',
      blocks: ['production / employment', 'rate spreads', 'interest rates'],
      note: null,
    },
    { range: '4–6', blocks: ['equity returns', 'inflation', 'construction'], note: null },
  ],
  12: [
    {
      range: '1–3',
      blocks: ['production / employment', 'rate spreads', 'interest rates'],
      note: null,
    },
    { range: '4–6', blocks: ['equity returns', 'inflation', 'construction'], note: null },
    { range: '7–12', blocks: [], note: 'blocks not identified in the domain substance' },
  ],
};

/**
 * Projection uncertainty split between the common factors and the
 * idiosyncratic components. Extracting more factors takes a little of the
 * uncertainty out of the common part and leaves more of it in the residual.
 */
const NOWCAST_UNCERTAINTY: Record<FactorCount, { common: number; idiosyncratic: number }> = {
  6: { common: 0.78, idiosyncratic: 0.26 },
  12: { common: 0.71, idiosyncratic: 0.31 },
};

const NOWCAST_RELEASES: readonly NowcastRelease[] = [
  { id: 'employment', series: 'Employment', at: '2026-07-27', newsPp: 0.15 },
  { id: 'ism', series: 'ISM survey', at: '2026-07-24', newsPp: 0.08 },
  { id: 'retail-sales', series: 'Retail sales', at: '2026-07-22', newsPp: -0.03 },
];

// ---------------------------------------------------------------------------
// Momentum
// ---------------------------------------------------------------------------

/** Cumulative market return over each definition horizon, percent. */
const MOMENTUM_CUMULATIVE_RETURN: Record<MomentumLookback, number> = {
  12: -4.8,
  24: 3.1,
  36: 18.6,
};

/**
 * Winner-minus-loser profit conditioned on the preceding market state.
 *
 * The finding is robust across the 12-, 24- and 36-month definitions, so these
 * do not move with the lookback selector; only which state holds does.
 */
const CONDITIONAL_PROFITS: readonly ConditionalProfit[] = [
  {
    vocabulary: 'momentum-market',
    afterState: 'UP',
    horizon: 'months-1-6',
    rawPerMonth: 0.93,
    capmAdjustedPerMonth: 1.12,
    reversal: false,
  },
  {
    vocabulary: 'momentum-market',
    afterState: 'DOWN',
    horizon: 'months-1-6',
    rawPerMonth: -0.37,
    capmAdjustedPerMonth: 0.01,
    reversal: false,
  },
  {
    vocabulary: 'momentum-market',
    afterState: 'UP',
    horizon: 'months-13-60',
    rawPerMonth: -0.36,
    capmAdjustedPerMonth: null,
    reversal: true,
  },
];

const WML_SHARPE: readonly WmlSharpeRow[] = [
  { weighting: 'static', sharpe: 0.6 },
  { weighting: 'vol-scaled', sharpe: 1.0 },
  { weighting: 'dynamic', sharpe: 1.2 },
];

// ---------------------------------------------------------------------------
// Size and value premia
// ---------------------------------------------------------------------------

/**
 * Small minus Large by VAR regime, basis points per month.
 *
 * Recovery is absent, not zero: the substance specifies the premium in the
 * crash, slow-growth and bull states and says nothing about the fourth.
 */
const SIZE_PREMIUM_BP: Record<string, number | null> = {
  Crash: 100,
  'Slow Growth': -61,
  Bull: 71,
  Recovery: null,
};

const VALUE_PREMIUM: readonly ValuePremiumRow[] = [
  { vocabulary: 'value-volatility', state: 'high-volatility', premiumPercent: 12.4 },
  { vocabulary: 'value-volatility', state: 'low-volatility', premiumPercent: 0.6 },
];

// ---------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------

/**
 * Which way the draft view leans, given the dominant state.
 *
 * A bearish state justifies lower expected returns and higher correlations;
 * an expansionary one the reverse. This is the whole content of the bridge
 * card, and it is a function — the direction has no setter anywhere.
 */
const DIRECTION_BY_STATE: Record<string, ViewDirection> = {
  Crash: 'defensive',
  Recession: 'defensive',
  'Slow Growth': 'neutral',
  Bull: 'risk-on',
  Recovery: 'risk-on',
  Expansion: 'risk-on',
};

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Sample log-likelihood at the default window on the reference universe. */
const LOG_LIKELIHOOD_REFERENCE: Record<MarketRegimeModelId, number> = {
  'four-state': -1284.6,
  hamilton: -1497.2,
};

const LAST_CALIBRATION = '2026-06-30';

const UPDATED_DATE = '2026-07-31';
const UPDATED_BASE_MINUTES = 8 * 60 + 12;

// ---------------------------------------------------------------------------
// Month arithmetic
// ---------------------------------------------------------------------------

function monthIndex(month: SampleMonth): number {
  const [year, index] = month.split('-').map(Number);
  return year * 12 + (index - 1);
}

function monthAt(index: number): SampleMonth {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthsInclusive(from: SampleMonth, to: SampleMonth): number {
  return monthIndex(to) - monthIndex(from) + 1;
}

const SAMPLE_MONTH_OPTIONS: readonly SampleMonth[] = buildMonthOptions();

function buildMonthOptions(): SampleMonth[] {
  const months: SampleMonth[] = [];
  const last = monthIndex(SAMPLE_MONTH_LAST);
  for (let index = monthIndex(SAMPLE_MONTH_FIRST); index <= last; index++) {
    months.push(monthAt(index));
  }
  return months;
}

/** Months of the estimation sample, in order. */
function monthRange(from: SampleMonth, to: SampleMonth): SampleMonth[] {
  const months: SampleMonth[] = [];
  const last = monthIndex(to);
  for (let index = monthIndex(from); index <= last; index++) {
    months.push(monthAt(index));
  }
  return months;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Scales a vector of weights to sum to exactly 100.
 *
 * The residue left by rounding goes to the largest entry, so the bands of the
 * stacked path close at 100 at every month rather than at 99.99 — which the
 * chart would draw as a hairline gap along the top of the plot.
 */
function normaliseTo100(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  const scaled = values.map((value) => round2((value / total) * 100));
  const residue = round2(100 - scaled.reduce((sum, value) => sum + value, 0));
  if (residue !== 0) {
    const largest = argMax(scaled);
    scaled[largest] = round2(scaled[largest] + residue);
  }
  return scaled;
}

function argMax(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

function argMaxExcept(values: readonly number[], skip: number): number {
  let best = skip === 0 ? 1 : 0;
  for (let i = 0; i < values.length; i++) {
    if (i === skip) continue;
    if (values[i] > values[best]) best = i;
  }
  return best;
}

function blendVectors(a: readonly number[], b: readonly number[], weightB: number): number[] {
  return a.map((value, i) => value * (1 - weightB) + b[i] * weightB);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The stacked probability path over the sample.
 *
 * The states are persistent by construction — long, out-of-phase cycles rather
 * than noise — so the modal state holds for stretches, which is the property
 * the panel exists to show. The last month is the current reading exactly, and
 * the month before the run starts is forced to be led by some other state:
 * otherwise "most likely since" would reach back to the start of the sample
 * and stop meaning anything.
 */
function buildPath(current: readonly number[], months: number): number[][] {
  const stateCount = current.length;
  const points: number[][] = [];

  for (let t = 0; t < months; t++) {
    const raw: number[] = [];
    for (let i = 0; i < stateCount; i++) {
      const period = PATH_PERIODS[i % PATH_PERIODS.length];
      const phase = PATH_PHASES[i % PATH_PHASES.length];
      raw.push(Math.exp(1.9 * Math.sin((2 * Math.PI * t) / period + phase)));
    }
    points.push(normaliseTo100(raw));
  }

  const dominant = argMax(current);

  const breakIndex = months - 1 - TAKEOVER_MONTHS;
  if (breakIndex >= 0) {
    const row = points[breakIndex];
    if (argMax(row) === dominant) {
      const other = argMaxExcept(row, dominant);
      const swapped = row[other];
      row[other] = row[dominant];
      row[dominant] = swapped;
    }
  }

  for (let back = TAKEOVER_MONTHS - 1; back >= 1; back--) {
    const index = months - 1 - back;
    if (index < 0) continue;
    const blended = normaliseTo100(blendVectors(points[index], current, TAKEOVER_BLEND));
    // The blend usually puts the current state in front on its own; when the
    // month it is blending from was a landslide for someone else, it is pinned
    // to the current reading instead so the run is unbroken by construction.
    points[index] = argMax(blended) === dominant ? blended : [...current];
  }

  if (months > 0) points[months - 1] = [...current];
  return points;
}

/**
 * The smoothed inference `P[s_t | I_T]`, from the filtered path.
 *
 * Two properties, and the second is the one that is easy to get wrong.
 *
 * It conditions on the whole sample, so at any interior month it sees what
 * happened *after* t: a month whose neighbours both belong to one state is
 * pulled toward that state, and the reading comes out **sharper** than the
 * real-time filter's, not flatter. A full-sample inference has more
 * information, not less.
 *
 * And **the end of the sample is returned untouched**. At `t = T` the smoother's
 * information set is exactly the filter's — there is no future left to condition
 * on — so `P[s_T | I_T]` *is* the filtered probability, identically. Anything
 * else would have the Filtered/Smoothed toggle change today's reading, which is
 * a claim the model cannot make. The two months before it are frozen for the
 * weaker version of the same reason, and so that the current run begins on the
 * month the hero card names whichever basis is showing.
 */
function smoothPath(points: readonly (readonly number[])[]): number[][] {
  const last = points.length - 1;
  return points.map((row, t) => {
    if (t > last - SMOOTHER_FROZEN_TAIL) return [...row];
    const before = points[Math.max(0, t - 1)];
    const after = points[Math.min(last, t + 1)];
    const blended = row.map((value, i) => 0.5 * value + 0.25 * before[i] + 0.25 * after[i]);
    return normaliseTo100(blended.map((value) => value ** SMOOTHER_SHARPNESS));
  });
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * The regime engine behind doc 22, and behind doc 23's "Regime & Market State"
 * card — the two pages read one estimate, never two.
 *
 * Three separate state vocabularies live here and never blend: the toolbar's
 * regime model (four-state VAR or two-state Hamilton), the value premium's own
 * two-state Markov chain, and momentum's UP/DOWN market state. Each row carries
 * its vocabulary as a literal discriminant, so a template cannot zip rows of
 * two of them into one table without failing to compile.
 *
 * The direction of the regime-implied view is a `computed()` off the dominant
 * state. There is deliberately no setter for it: the bridge card and the hero
 * card cannot be allowed to contradict one another.
 */
@Injectable({ providedIn: 'root' })
export class MarketRegimesService {
  // --- toolbar --------------------------------------------------------------

  private readonly _model = signal<MarketRegimeModelId>('four-state');
  readonly model = this._model.asReadonly();

  private readonly _universeId = signal<RegimeUniverseId>('equities-bonds');
  readonly universeId = this._universeId.asReadonly();

  private readonly _probabilityBasis = signal<ProbabilityBasis>('filtered');
  readonly probabilityBasis = this._probabilityBasis.asReadonly();

  private readonly _sampleFrom = signal<SampleMonth>(SAMPLE_FROM_DEFAULT);
  readonly sampleFrom = this._sampleFrom.asReadonly();

  private readonly _sampleTo = signal<SampleMonth>(SAMPLE_TO_DEFAULT);
  readonly sampleTo = this._sampleTo.asReadonly();

  readonly universes = UNIVERSES;
  readonly sampleMonthOptions = SAMPLE_MONTH_OPTIONS;
  readonly thetaGrid = THETA_GRID;

  readonly universe = computed<RegimeUniverse>(() => {
    const id = this._universeId();
    const found = UNIVERSES.find((entry) => entry.id === id);
    if (!found) throw new Error(`no universe ${id}`);
    return found;
  });

  /** The states of the model the toolbar currently selects, in reading order. */
  readonly modelStates = computed<readonly string[]>(() => MODEL_STATES[this._model()]);

  /** `da` must precede `a`. */
  readonly sampleWindowValid = computed(
    () => monthIndex(this._sampleFrom()) < monthIndex(this._sampleTo()),
  );

  readonly sampleWindowError = computed<string | null>(() =>
    this.sampleWindowValid() ? null : SAMPLE_WINDOW_ORDER_ERROR,
  );

  /** Where the sample actually starts: the universe may be younger than it. */
  readonly effectiveSampleFrom = computed<SampleMonth>(() => {
    const requested = monthIndex(this._sampleFrom());
    const available = monthIndex(this.universe().firstObservation);
    return monthAt(Math.max(requested, available));
  });

  readonly effectiveSampleMonths = computed(() => {
    if (!this.sampleWindowValid()) return 0;
    return Math.max(0, monthsInclusive(this.effectiveSampleFrom(), this._sampleTo()));
  });

  /** The month the returns filter is anchored to. */
  readonly filterReferenceMonth = computed<SampleMonth>(() => this._sampleTo());

  private readonly _refreshCount = signal(0);

  readonly lastUpdated = computed(() => {
    const total = UPDATED_BASE_MINUTES + this._refreshCount();
    const hours = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    return `${UPDATED_DATE} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });

  setModel(model: MarketRegimeModelId): void {
    if (this._model() === model) return;
    this._model.set(model);
    this.queueRecompute();
  }

  /**
   * Changing the universe can strip the diagnostic of the pair it was showing:
   * the pair falls back to one the new universe actually has rather than
   * leaving the chart labelled with a series that is not there.
   */
  setUniverse(id: RegimeUniverseId): void {
    if (this._universeId() === id) return;
    this._universeId.set(id);
    const available = this.universe().pairs;
    if (available.length > 0 && !available.includes(this._pairId())) {
      this._pairId.set(available[0]);
    }
    this.queueRecompute();
  }

  setProbabilityBasis(basis: ProbabilityBasis): void {
    if (this._probabilityBasis() === basis) return;
    this._probabilityBasis.set(basis);
    this.queueRecompute();
  }

  setSampleFrom(month: SampleMonth): void {
    if (this._sampleFrom() === month) return;
    this._sampleFrom.set(month);
    if (this.sampleWindowValid()) this.queueRecompute();
  }

  setSampleTo(month: SampleMonth): void {
    if (this._sampleTo() === month) return;
    this._sampleTo.set(month);
    if (this.sampleWindowValid()) this.queueRecompute();
  }

  // --- emptiness ------------------------------------------------------------

  readonly emptyReason = computed<EmptyReason | null>(() => {
    if (!this.sampleWindowValid()) return 'invalid-window';
    if (this.effectiveSampleMonths() < MIN_SAMPLE_MONTHS) return 'insufficient-history';
    return null;
  });

  readonly emptyDetail = computed<string | null>(() => {
    const reason = this.emptyReason();
    return reason === null ? null : EMPTY_DETAIL[reason];
  });

  // --- vocabulary 1: the estimate ------------------------------------------

  /**
   * The probability vector at the last month of the sample.
   *
   * Two things move it, and the probability basis is deliberately not one of
   * them. The universe chooses which market the filter watched; the window
   * tilts the fitted transition matrix, because the shorter the sample the more
   * the recent turbulent stretch dominates it.
   *
   * The Filtered/Smoothed toggle does **not** move this reading. This is the
   * month `t = T`, where the smoother has no future data left to condition on,
   * so `P[s_T | I_T]` is the filtered probability identically — the toggle
   * revises the *path* behind it, not today's state. The hero card is anchored
   * here, which is why the spec calls what it shows the filtered probability.
   */
  private readonly probabilities = computed<readonly number[]>(() => {
    if (this.emptyReason() !== null) return [];

    const model = this._model();
    const base = BASE_PROBABILITIES[model][this._universeId()];
    const short = SHORT_SAMPLE_PROBABILITIES[model];

    const defaultMonths = monthsInclusive(SAMPLE_FROM_DEFAULT, SAMPLE_TO_DEFAULT);
    const months = this.effectiveSampleMonths();
    const shortfall = Math.min(1, Math.max(0, (defaultMonths - months) / defaultMonths));
    return normaliseTo100(blendVectors(base, short, shortfall * MAX_WINDOW_TILT));
  });

  /**
   * One row per state of the selected model.
   *
   * Empty under the Hamilton model means two rows, not four: the hero card, the
   * probability path and the statistics table all read this one list, so they
   * cannot disagree about how many states there are.
   */
  readonly stateReadings = computed<readonly RegimeStateReading[]>(() => {
    const probabilities = this.probabilities();
    if (probabilities.length === 0) return [];
    return MODEL_STATES[this._model()].map((state, i) => ({
      vocabulary: 'regime-model' as const,
      name: state,
      probability: probabilities[i],
      expectedRunMonths: AVERAGE_DURATION_MONTHS[state],
      description: STATE_DESCRIPTION[state],
      stationaryProbability: STATIONARY_PROBABILITY[state],
    }));
  });

  /** The per-state probabilities, for a card on another page. */
  readonly stateProbabilities = computed<readonly StateProbability[]>(() =>
    this.stateReadings().map((reading) => ({
      vocabulary: 'regime-model' as const,
      state: reading.name,
      probability: reading.probability,
    })),
  );

  readonly probabilityPathMonths = computed<readonly SampleMonth[]>(() => {
    if (this.emptyReason() !== null) return [];
    return monthRange(this.effectiveSampleFrom(), this._sampleTo());
  });

  /**
   * The path the toolbar's basis asks for.
   *
   * This is where Filtered and Smoothed actually differ: the smoother revises
   * every month behind the last one with what came after it, and leaves the
   * last one exactly where the filter put it.
   */
  private readonly pathPoints = computed<readonly (readonly number[])[]>(() => {
    const current = this.probabilities();
    const months = this.probabilityPathMonths().length;
    if (current.length === 0 || months === 0) return [];
    const filtered = buildPath(current, months);
    return this._probabilityBasis() === 'smoothed' ? smoothPath(filtered) : filtered;
  });

  /** One band per state of the selected model. The bands sum to 100 everywhere. */
  readonly probabilityPath = computed<readonly ProbabilityPathSeries[]>(() => {
    const points = this.pathPoints();
    if (points.length === 0) return [];
    return MODEL_STATES[this._model()].map((state, i) => ({
      vocabulary: 'regime-model' as const,
      state,
      probabilities: points.map((row) => row[i]),
    }));
  });

  /**
   * The modal state, and the month its run began.
   *
   * `mostLikelySince` is read back off the path rather than declared beside it,
   * so the date and the drawing cannot disagree.
   */
  readonly dominantState = computed<DominantStateReading | null>(() => {
    const readings = this.stateReadings();
    if (readings.length === 0) return null;

    const probabilities = readings.map((reading) => reading.probability);
    const index = argMax(probabilities);
    const reading = readings[index];

    const points = this.pathPoints();
    const months = this.probabilityPathMonths();
    let start = points.length - 1;
    while (start > 0 && argMax(points[start - 1]) === index) start--;

    return {
      vocabulary: 'regime-model',
      model: this._model(),
      basis: this._probabilityBasis(),
      state: reading.name,
      probability: reading.probability,
      stationaryProbability: reading.stationaryProbability,
      expectedDurationMonths: reading.expectedRunMonths,
      mostLikelySince: months[start],
      description: reading.description,
    };
  });

  /**
   * Regime Statistics, on the selected universe.
   *
   * The correlation columns print only what the substance actually fixes. A
   * regime it does not fix carries `—`, a universe without the pair carries
   * `n/d`, and neither is ever a zero — a zero correlation is a claim, and no
   * claim was made.
   */
  readonly regimeStatistics = computed<readonly RegimeStatisticsRow[]>(() => {
    const readings = this.stateReadings();
    if (readings.length === 0) return [];
    const universe = this.universe();
    const scale = UNIVERSE_RISK_SCALE[universe.id];

    return readings.map((reading) => ({
      vocabulary: 'regime-model' as const,
      state: reading.name,
      stationaryProbability: reading.stationaryProbability,
      averageDurationMonths: reading.expectedRunMonths,
      meanReturn: round2(STATE_MEAN_RETURN[reading.name] * scale),
      volatility: round2(STATE_VOLATILITY[reading.name] * scale),
      largeSmall: universe.hasSizeSeries ? LARGE_SMALL_BY_STATE[reading.name] : MISSING_SERIES,
      equityBond: universe.hasEquityBondSeries
        ? EQUITY_BOND_BY_STATE[reading.name]
        : MISSING_SERIES,
    }));
  });

  // --- correlation diagnostic ----------------------------------------------

  private readonly _pairId = signal<SeriesPairId>('large-small');
  readonly pairId = this._pairId.asReadonly();

  private readonly _theta = signal(THETA_DEFAULT);
  readonly theta = this._theta.asReadonly();

  readonly availablePairs = computed<readonly SeriesPair[]>(() =>
    this.universe().pairs.map((id) => SERIES_PAIRS[id]),
  );

  /** `null` when the universe carries no pair at all. */
  readonly pair = computed<SeriesPair | null>(() => {
    const available = this.universe().pairs;
    if (available.length === 0) return null;
    const id = available.includes(this._pairId()) ? this._pairId() : available[0];
    return SERIES_PAIRS[id];
  });

  setPair(id: SeriesPairId): void {
    if (this._pairId() === id) return;
    this._pairId.set(id);
  }

  setTheta(theta: number): void {
    const clamped = Math.min(THETA_MAX, Math.max(THETA_MIN, theta));
    this._theta.set(round2(clamped));
  }

  /**
   * The empirical exceedance correlations and the three candidate models.
   *
   * `reproducesAsymmetry` is derived by comparing each model's asymmetry gap
   * with the empirical one, never asserted: the normal curve is symmetric by
   * construction and the asymmetric GARCH bends only a quarter of the way, so
   * both fail the comparison rather than being labelled failures.
   */
  readonly exceedanceSeries = computed<readonly ExceedanceSeries[]>(() => {
    const pair = this.pair();
    if (pair === null) return [];
    const shape = PAIR_SHAPE[pair.id];

    const build = (model: ExceedanceModelId): ExceedanceSeries => {
      const curve = EXCEEDANCE_CURVES[model];
      const points = THETA_GRID.map((theta) => ({
        theta,
        correlation: round2(curve(shape, theta)),
      }));
      const positive = THETA_GRID.filter((theta) => theta > 0);
      const gap = mean(
        positive.map((theta) => round2(curve(shape, -theta)) - round2(curve(shape, theta))),
      );
      return {
        model,
        isReference: model === 'empirical',
        points,
        asymmetryGap: round2(gap),
        reproducesAsymmetry: null,
      };
    };

    const empirical = build('empirical');
    const candidates = CANDIDATE_EXCEEDANCE_MODELS.map((model) => {
      const series = build(model);
      return {
        ...series,
        reproducesAsymmetry:
          Math.abs(series.asymmetryGap - empirical.asymmetryGap) <= ASYMMETRY_TOLERANCE,
      };
    });
    return [empirical, ...candidates];
  });

  /** The four series read off at the θ the slider is on. */
  readonly exceedanceAtTheta = computed<readonly ExceedanceReading[]>(() => {
    const theta = this._theta();
    return this.exceedanceSeries().map((series) => {
      const point =
        series.points.find((candidate) => Math.abs(candidate.theta - theta) < 1e-9) ??
        series.points[Math.floor(series.points.length / 2)];
      return { model: series.model, theta: point.theta, correlation: point.correlation };
    });
  });

  // --- macro nowcast --------------------------------------------------------

  private readonly _factorCount = signal<FactorCount>(6);
  readonly factorCount = this._factorCount.asReadonly();

  setFactorCount(count: FactorCount): void {
    if (this._factorCount() === count) return;
    this._factorCount.set(count);
  }

  /**
   * The real-time reading of the macro state.
   *
   * It runs beside the returns filter and never replaces it: nothing here moves
   * when the regime model or the universe changes. What it does watch is the
   * filter's reference month, because a nowcast built on an older vintage than
   * the returns the filter saw is a stale input and says so in words.
   */
  readonly nowcast = computed<MacroNowcast>(() => {
    const factors = this._factorCount();
    const uncertainty = NOWCAST_UNCERTAINTY[factors];
    const reference = this.filterReferenceMonth();
    const vintageMonth = NOWCAST_VINTAGE.slice(0, 7);

    return {
      gdpGrowthQoq: NOWCAST_GDP_QOQ,
      vintage: NOWCAST_VINTAGE,
      priorVintage: NOWCAST_PRIOR_VINTAGE,
      deltaVsPriorVintagePp: NOWCAST_DELTA_PP,
      factorCount: factors,
      explainedVariance: FACTOR_EXPLAINED_VARIANCE[factors],
      loadings: FACTOR_LOADINGS[factors],
      commonUncertainty: uncertainty.common,
      commonUncertaintyLevel: levelOf(uncertainty.common),
      idiosyncraticUncertainty: uncertainty.idiosyncratic,
      idiosyncraticUncertaintyLevel: levelOf(uncertainty.idiosyncratic),
      releases: NOWCAST_RELEASES,
      staleVintage: monthIndex(vintageMonth) < monthIndex(reference),
      filterReferenceMonth: reference,
    };
  });

  // --- vocabulary 3: momentum ----------------------------------------------

  private readonly _momentumLookback = signal<MomentumLookback>(36);
  readonly momentumLookback = this._momentumLookback.asReadonly();

  setMomentumLookback(months: MomentumLookback): void {
    if (this._momentumLookback() === months) return;
    this._momentumLookback.set(months);
  }

  /**
   * Momentum's own market state — a third taxonomy, sharing no label with the
   * regime model's states or with the value premium's volatility states.
   *
   * The crash indicator is a composite boolean and nothing else: it is armed
   * only when a bear state and high realised volatility hold together. Either
   * one alone leaves it off, and no continuous score is offered in its place,
   * because a score would invite reading a half-armed condition as half a
   * warning.
   */
  readonly momentum = computed<MomentumState>(() => {
    const lookback = this._momentumLookback();
    const cumulative = MOMENTUM_CUMULATIVE_RETURN[lookback];
    const state: MomentumMarketState = cumulative >= 0 ? 'UP' : 'DOWN';

    const realised = UNIVERSE_REALISED_VOLATILITY[this._universeId()];
    const bearState = state === 'DOWN';
    const highVolatility = realised > CRASH_RISK_VOLATILITY_THRESHOLD;

    const crashRisk: MomentumCrashRisk = {
      bearState,
      realisedVolatility: realised,
      volatilityThreshold: CRASH_RISK_VOLATILITY_THRESHOLD,
      highVolatility,
      armed: bearState && highVolatility,
      reason: crashRiskReason(bearState, highVolatility),
    };

    return {
      vocabulary: 'momentum-market',
      lookbackMonths: lookback,
      state,
      cumulativeMarketReturn: cumulative,
      profits: CONDITIONAL_PROFITS,
      crashRisk,
      wmlSharpe: WML_SHARPE,
    };
  });

  // --- size premium ---------------------------------------------------------

  /**
   * Small minus Large by regime.
   *
   * Always the four VAR states, whatever the toolbar's regime model says: this
   * estimate exists over that taxonomy and over no other. Recovery carries
   * `null` rather than zero and is drawn as a hatched bar.
   */
  readonly sizePremium = computed<readonly SizePremiumRow[]>(() =>
    VAR_STATES.map((state) => ({
      vocabulary: 'regime-model' as const,
      model: 'four-state' as const,
      state,
      premiumBp: SIZE_PREMIUM_BP[state],
      note: SIZE_PREMIUM_BP[state] === null ? SIZE_PREMIUM_NOT_SPECIFIED : null,
    })),
  );

  /** Max minus min across the regimes that have an estimate at all. */
  readonly sizePremiumSpreadBp = computed(() => {
    const measured = this.sizePremium()
      .map((row) => row.premiumBp)
      .filter((value): value is number => value !== null);
    if (measured.length === 0) return 0;
    return Math.max(...measured) - Math.min(...measured);
  });

  // --- vocabulary 2: value premium -----------------------------------------

  /**
   * The value premium by volatility state.
   *
   * A separate two-state Markov chain on book-to-market portfolios, with its
   * own state names. It does not move with the toolbar's regime model, and no
   * row of it lines up with a row of the size premium above.
   */
  readonly valuePremium = computed<readonly ValuePremiumRow[]>(() => VALUE_PREMIUM);

  // --- the bridge -----------------------------------------------------------

  /**
   * The draft view the regime implies.
   *
   * Derived from the dominant state and nothing else. There is no setter: the
   * direction is recomputed whenever the hero card's reading changes, so the
   * two cards cannot end up making opposite claims.
   */
  readonly regimeImpliedView = computed<RegimeImpliedView | null>(() => {
    const dominant = this.dominantState();
    if (dominant === null) return null;

    const direction = DIRECTION_BY_STATE[dominant.state] ?? 'neutral';
    const copy = VIEW_DIRECTION_COPY[direction];

    return {
      derivedFromState: dominant.state,
      derivedFromProbability: dominant.probability,
      direction,
      expectedReturns: copy.expectedReturns,
      correlations: copy.correlations,
      covariance: copy.covariance,
      summary: `${copy.expectedReturns} · ${copy.correlations} · ${copy.covariance}`,
      targetRoute: VIEWS_BUILDER_ROUTE,
    };
  });

  private readonly _sentView = signal<SentView | null>(null);
  readonly sentView = this._sentView.asReadonly();

  private readonly _sendingView = signal(false);
  readonly sendingView = this._sendingView.asReadonly();

  /**
   * The failure of the hand-over, held apart from the failure of the estimate.
   *
   * They are two different events with two different recoveries, and one signal
   * for both made the page lie: a hand-over that failed put `state()` into
   * `error`, which greyed the bridge card's *Preview* button — there was
   * nothing wrong with the estimate — and described it as "no valid estimate to
   * build a view from". The estimate's error still gates sending, because a
   * stale reading must not be handed on; the reverse does not hold.
   */
  private readonly _sendErrorMessage = signal<string | null>(null);
  readonly sendErrorMessage = this._sendErrorMessage.asReadonly();

  private readonly _sendErrorDetail = signal<string | null>(null);
  readonly sendErrorDetail = this._sendErrorDetail.asReadonly();

  /** Off while the estimate is missing or stale — there is no view to send. */
  readonly canSendView = computed(
    () => this.regimeImpliedView() !== null && this._errorMessage() === null,
  );

  /**
   * Hands the draft view to Views Builder.
   *
   * What is sent is `regimeImpliedView()` as it stands, so the payload is the
   * direction the hero card is showing at that moment and cannot be something
   * else.
   */
  async sendView(fail = false): Promise<boolean> {
    const view = this.regimeImpliedView();
    if (this._sendingView() || view === null || !this.canSendView()) return false;

    this._sendingView.set(true);
    this._sendErrorMessage.set(null);
    this._sendErrorDetail.set(null);
    await delay(LATENCY_MS);
    this._sendingView.set(false);

    if (fail) {
      this._sendErrorMessage.set(SEND_VIEW_FAILURE_MESSAGE);
      this._sendErrorDetail.set(SEND_VIEW_FAILURE_DETAIL);
      return false;
    }

    this._sentView.set({
      at: this.lastUpdated(),
      state: view.derivedFromState,
      direction: view.direction,
      summary: view.summary,
    });
    return true;
  }

  // --- diagnostics ----------------------------------------------------------

  /**
   * The footer.
   *
   * The low-confidence warning is a function of the reading above it: when the
   * highest state probability sits near a half, the filter is as likely to have
   * missed a turning point as to have caught one, and the page says so in words
   * rather than by tinting something.
   */
  readonly diagnostics = computed<RegimeDiagnostics>(() => {
    const readings = this.stateReadings();
    if (readings.length === 0) {
      return {
        logLikelihood: null,
        lastCalibration: LAST_CALIBRATION,
        topProbability: null,
        lowFilterConfidence: false,
        note: null,
      };
    }

    const top = Math.max(...readings.map((reading) => reading.probability));
    const defaultMonths = monthsInclusive(SAMPLE_FROM_DEFAULT, SAMPLE_TO_DEFAULT);
    const scale =
      (this.effectiveSampleMonths() / defaultMonths) * UNIVERSE_RISK_SCALE[this._universeId()];
    const low = Math.abs(top - 50) <= LOW_CONFIDENCE_BAND_PCT;

    return {
      logLikelihood: round1(LOG_LIKELIHOOD_REFERENCE[this._model()] * scale),
      lastCalibration: LAST_CALIBRATION,
      topProbability: top,
      lowFilterConfidence: low,
      note: low ? LOW_CONFIDENCE_NOTE : null,
    };
  });

  // --- lifecycle ------------------------------------------------------------

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  /** The failure of the *estimate*. The hand-over's own failure is separate. */
  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  private readonly _errorDetail = signal<string | null>(null);
  readonly errorDetail = this._errorDetail.asReadonly();

  /** The panels are showing the last estimate that converged, not this one. */
  readonly stale = computed(() => this._errorMessage() !== null);

  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    if (this.emptyReason() !== null) return 'empty';
    if (this._errorMessage() !== null) return 'error';
    return 'ready';
  });

  private recomputing: Promise<void> = Promise.resolve();

  /** Resolves once any run a toolbar setter started has finished. */
  settled(): Promise<void> {
    return this.recomputing;
  }

  private queueRecompute(): void {
    // A run already in flight will land on the parameters as they now are, so
    // starting a second one would only make the page recompute twice for one
    // change.
    if (this._loading()) return;
    this.recomputing = this.refresh();
  }

  /**
   * Re-runs the recursive filter on the toolbar's current parameters.
   *
   * The estimate is a function of those parameters, so it never disappears: a
   * failed run leaves the last good panels on screen and raises the error
   * beside them, which is what lets the page call them stale rather than blank
   * the whole thing.
   */
  async refresh(fail = false): Promise<void> {
    if (this._loading()) return;

    this._loading.set(true);
    this._errorMessage.set(null);
    this._errorDetail.set(null);

    await delay(LATENCY_MS);

    if (fail) {
      this._errorMessage.set(LOAD_FAILURE_MESSAGE);
      this._errorDetail.set(LOAD_FAILURE_DETAIL);
      this._loading.set(false);
      return;
    }

    this._refreshCount.update((count) => count + 1);
    this._loading.set(false);
  }

  clearError(): void {
    this._errorMessage.set(null);
    this._errorDetail.set(null);
    this._sendErrorMessage.set(null);
    this._sendErrorDetail.set(null);
  }
}

function levelOf(share: number): UncertaintyLevel {
  return share > UNCERTAINTY_HIGH_THRESHOLD ? 'high' : 'low';
}

/**
 * Which half of the composite condition is missing.
 *
 * Both conditions are named whichever way it comes out, so "not armed" is never
 * read as "nothing to see": one of the two may well be holding.
 */
function crashRiskReason(bearState: boolean, highVolatility: boolean): string {
  if (bearState && highVolatility) {
    return 'armed — bear market state and high realised volatility (126d) hold together';
  }
  if (bearState) {
    return 'not armed — bear market state holds, realised volatility (126d) is not high';
  }
  if (highVolatility) {
    return 'not armed — realised volatility (126d) is high, the market state is not bear';
  }
  return 'not armed — needs bear state AND high realised vol (126d) together';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
