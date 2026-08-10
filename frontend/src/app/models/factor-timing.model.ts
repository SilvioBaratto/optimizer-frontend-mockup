/**
 * Types behind `docs/23 Factor Timing & Rotation.md`.
 *
 * Three rules shape this file, and each one exists because the doc's own
 * review flagged a way the page could contradict itself.
 *
 * **1. There is no second regime engine.** The market trend state, the value
 * chain's two volatility states and the multi-asset regime probabilities all
 * come from `MarketRegimesService` — the shared filter doc 22 owns and the
 * Macro & Regimes Agent reads. Nothing regime-shaped is declared here: the
 * vocabularies (`MomentumMarketState`, `ValueVolatilityState`,
 * `MomentumLookback`, `WmlWeighting`) are imported from
 * `market-regimes.model.ts` and **re-exported**, so a page importing this file
 * gets one taxonomy rather than a second copy free to drift.
 *
 * **2. One number, one source.** The Valuation column of the signal table and
 * the callout in the Value Spread card described opposite readings of the same
 * factor in the doc's wireframe — the blocking `fedelta-accademica` finding.
 * Here the valuation *score* is a pure function of the value-spread z-score
 * (`ValueSpreadReading.zScore`), so the arrow in the table, the marker on the
 * band and the sentence in the callout are three renderings of one field and
 * cannot diverge. The callout's text is generated from the row, never written
 * beside it.
 *
 * **3. Absent is not zero.** Market timing has no out-of-sample information
 * ratio in the domain substance, and a factor without enough history has no
 * score. Both are `null` and both are rendered as a hatched marker or the words
 * "insufficient history" — never as a bar of length zero and never as an
 * invented number. The expected-utility gain is a *different measure* and
 * carries its own type so it cannot be handed to the information-ratio axis.
 */

import {
  MOMENTUM_LOOKBACKS,
  MOMENTUM_LOOKBACK_LABEL,
  MOMENTUM_MARKET_STATES,
  MOMENTUM_MARKET_STATE_ICON,
  MOMENTUM_MARKET_STATE_LABEL,
  VALUE_VOLATILITY_STATES,
  VALUE_VOLATILITY_STATE_LABEL,
  VIEWS_BUILDER_ROUTE,
  WML_WEIGHTINGS,
  type MomentumLookback,
  type MomentumMarketState,
  type ValueVolatilityState,
  type WmlWeighting,
} from './market-regimes.model';

// The shared vocabularies travel on, so a consumer imports one model file
// rather than two — but each is declared exactly once, over in doc 22's model
// (and, for the regime states themselves, in doc 12's before that).
export {
  MOMENTUM_LOOKBACKS,
  MOMENTUM_LOOKBACK_LABEL,
  MOMENTUM_MARKET_STATES,
  MOMENTUM_MARKET_STATE_ICON,
  MOMENTUM_MARKET_STATE_LABEL,
  VALUE_VOLATILITY_STATES,
  VALUE_VOLATILITY_STATE_LABEL,
  VIEWS_BUILDER_ROUTE,
  WML_WEIGHTINGS,
};
export type { MomentumLookback, MomentumMarketState, ValueVolatilityState, WmlWeighting };

// ---------------------------------------------------------------------------
// The factor universe
// ---------------------------------------------------------------------------

export type FactorId = 'value' | 'momentum' | 'size' | 'quality' | 'low-vol' | 'profitability';

export const FACTOR_IDS: readonly FactorId[] = [
  'value',
  'momentum',
  'size',
  'quality',
  'low-vol',
  'profitability',
];

export interface FactorDefinition {
  readonly id: FactorId;
  readonly label: string;
  /** The long-short portfolio the value spread is measured on — HML, UMD, BAB… */
  readonly portfolio: string;
  /** What the factor sorts on, for the chip's title and the row's caption. */
  readonly detail: string;
}

export const FACTORS: Record<FactorId, FactorDefinition> = {
  value: {
    id: 'value',
    label: 'Value',
    portfolio: 'HML',
    detail: 'High minus low book-to-market',
  },
  momentum: {
    id: 'momentum',
    label: 'Momentum',
    portfolio: 'UMD',
    detail: 'Winner minus loser, 12−1 month',
  },
  size: { id: 'size', label: 'Size', portfolio: 'SMB', detail: 'Small minus big' },
  quality: { id: 'quality', label: 'Quality', portfolio: 'QMJ', detail: 'Quality minus junk' },
  'low-vol': {
    id: 'low-vol',
    label: 'Low Vol',
    portfolio: 'BAB',
    detail: 'Betting against beta',
  },
  profitability: {
    id: 'profitability',
    label: 'Profitability',
    portfolio: 'RMW',
    detail: 'Robust minus weak operating profitability',
  },
};

/** At least one factor has to stay in view; an empty selection has nothing to time. */
export const MIN_FACTORS_IN_VIEW = 1;

export const NO_FACTOR_SELECTED_ERROR =
  'Keep at least one factor in view — with none selected there is no cross-section to time.';

// ---------------------------------------------------------------------------
// Toolbar — rebalancing frequency
// ---------------------------------------------------------------------------

export type RebalancingFrequency = 'monthly' | 'quarterly' | 'annual';

export const REBALANCING_FREQUENCIES: readonly RebalancingFrequency[] = [
  'monthly',
  'quarterly',
  'annual',
];

export const REBALANCING_FREQUENCY_LABEL: Record<RebalancingFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

/** How long a signal set stays inside one rebalancing interval. */
export const REBALANCING_INTERVAL_DAYS: Record<RebalancingFrequency, number> = {
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

/**
 * The cadence the signals on screen were computed for.
 *
 * Quarterly, matching the default. Selecting a *shorter* interval than the one
 * the signals were estimated over is what makes them stale: the reading is
 * older than the decision it would be used for. Re-running the signals adopts
 * the selected cadence and clears the badge.
 */
export const SIGNAL_CADENCE_DEFAULT: RebalancingFrequency = 'quarterly';

export const STALE_SIGNALS_BADGE = 'Stale';

// ---------------------------------------------------------------------------
// Toolbar — weighting mode
// ---------------------------------------------------------------------------

/**
 * How hard the tilt is applied through time.
 *
 * The type is doc 22's `WmlWeighting` — the same static / vol-scaled / dynamic
 * ladder that governs the momentum leg — because it is the same decision.
 * The wireframe spells the first one "Constant"; the display casing is this
 * page's business, the union is not.
 */
export const WEIGHTING_MODE_LABEL: Record<WmlWeighting, string> = {
  static: 'Constant',
  'vol-scaled': 'Vol-scaled',
  dynamic: 'Dynamic',
};

export const WEIGHTING_MODE_DEFINITION: Record<WmlWeighting, string> = {
  static: 'One fixed intensity through time — the tilt does not react to the state.',
  'vol-scaled': 'Intensity scaled by σ_target / σ_t, so the position shrinks in panics.',
  dynamic: 'Volatility scaling plus a conditional mean, so an adverse state cuts or reverses it.',
};

/**
 * Tilt intensity by weighting mode.
 *
 * Ordered as the realised Sharpe ratios of the three weightings are ordered
 * (0.6 / 1.0 / 1.2): the mode that earns more of the signal is allowed to act
 * on more of it. Never above `TILT_INTENSITY_CAP`, which is where breadth
 * moderation binds.
 */
export const TILT_INTENSITY: Record<WmlWeighting, number> = {
  static: 0.8,
  'vol-scaled': 1.0,
  dynamic: 1.2,
};

export const TILT_INTENSITY_CAP = 1.2;

// ---------------------------------------------------------------------------
// Toolbar — timing model
// ---------------------------------------------------------------------------

export type TimingModelId = 'parsimonious' | 'multi-signal';

export const TIMING_MODELS: readonly TimingModelId[] = ['parsimonious', 'multi-signal'];

export const TIMING_MODEL_LABEL: Record<TimingModelId, string> = {
  parsimonious: 'Parsimonious, valuation + trend',
  'multi-signal': 'Multi-signal panel',
};

export const TIMING_MODEL_DEFINITION: Record<TimingModelId, string> = {
  parsimonious:
    'Two vetted signals with a prior reason to work — valuation and trend. 11.28% a year against 9.14% static and 7.57% for the index.',
  'multi-signal':
    'A panel regression over all five predictor categories and their interactions. Information ratio 0.88 → 1.17, at the cost of far more parameters to mine.',
};

// ---------------------------------------------------------------------------
// Predictor categories — the five buckets a timing signal can come from
// ---------------------------------------------------------------------------

export type PredictorCategory = 'financial' | 'macro' | 'sentiment' | 'valuation' | 'trend';

export const PREDICTOR_CATEGORIES: readonly PredictorCategory[] = [
  'financial',
  'macro',
  'sentiment',
  'valuation',
  'trend',
];

export const PREDICTOR_CATEGORY_LABEL: Record<PredictorCategory, string> = {
  financial: 'Financial conditions',
  macro: 'Macro cycle',
  sentiment: 'Sentiment',
  valuation: 'Valuation',
  trend: 'Trend',
};

/** The short form the wireframe prints inside an expanded row. */
export const PREDICTOR_CATEGORY_SHORT: Record<PredictorCategory, string> = {
  financial: 'Fin. cond.',
  macro: 'Macro',
  sentiment: 'Sentiment',
  valuation: 'Valuation',
  trend: 'Trend',
};

export const PREDICTOR_CATEGORY_EXAMPLES: Record<PredictorCategory, string> = {
  financial: 'Corporate credit spreads · TED spread · money supply growth',
  macro: 'GDP growth · capacity ratio · consumer confidence',
  sentiment: 'VIX · ISM PMI',
  valuation: 'CAPE · dividend yield · earnings yield · book-to-price',
  trend: 'Trailing performance, 1 month to 5 years',
};

/**
 * The horizon at which each category actually predicts anything.
 *
 * Different predictors bite at different horizons, and in factor timing the
 * horizon is the whole game: almost nothing is strong at one month.
 */
export const PREDICTOR_CATEGORY_HORIZON: Record<PredictorCategory, string> = {
  financial: '6m+',
  macro: '12m',
  sentiment: '12m+',
  valuation: '3–5y',
  trend: '12m',
};

/** One predictor category's reading for one factor. */
export interface PredictorReading {
  readonly category: PredictorCategory;
  /** −1 … +1. Positive favours the factor. */
  readonly score: number;
  readonly direction: SignalDirection;
  /** The horizon this category is informative over. */
  readonly horizon: string;
  /** Whether the timing model in force gives this category any weight at all. */
  readonly used: boolean;
  readonly weight: number;
}

// ---------------------------------------------------------------------------
// Signal directions
// ---------------------------------------------------------------------------

export type SignalDirection = 'up' | 'flat' | 'down';

export const SIGNAL_DIRECTION_ICON: Record<SignalDirection, string> = {
  up: '▲',
  flat: '▬',
  down: '▼',
};

export const SIGNAL_DIRECTION_LABEL: Record<SignalDirection, string> = {
  up: 'favourable',
  flat: 'neutral',
  down: 'unfavourable',
};

/** Below this a score reads as neutral rather than as a weak direction. */
export const DIRECTION_TOLERANCE = 0.05;

export type TiltDirection = 'overweight' | 'neutral' | 'underweight';

export const TILT_DIRECTION_LABEL: Record<TiltDirection, string> = {
  overweight: 'Tilt +',
  neutral: 'Tilt 0',
  underweight: 'Tilt −',
};

export const TILT_DIRECTION_ICON: Record<TiltDirection, string> = {
  overweight: '▲',
  neutral: '▬',
  underweight: '▼',
};

/**
 * The mark on a row whose two signals point opposite ways *and neither wins*.
 *
 * Rows where one signal dominates have a determinate tilt and are not
 * conflicted; the marker is for the case the composite cancels to neutral,
 * which is the one that feeds the anti-extrapolation callout.
 */
export const CONFLICT_ICON = '!';
export const CONFLICT_LABEL = 'trend vs valuation conflict';

export const INSUFFICIENT_HISTORY_LABEL = 'insufficient history';
export const INSUFFICIENT_HISTORY_DETAIL =
  'Fewer periods than the selected lookback needs. No score is estimated and the factor is excluded from the composite.';

// ---------------------------------------------------------------------------
// Value spread
// ---------------------------------------------------------------------------

export type ValueSpreadMetric = 'percentile' | 'z-score' | 'price-book' | 'price-earnings';

export const VALUE_SPREAD_METRICS: readonly ValueSpreadMetric[] = [
  'percentile',
  'z-score',
  'price-book',
  'price-earnings',
];

export const VALUE_SPREAD_METRIC_LABEL: Record<ValueSpreadMetric, string> = {
  percentile: 'Percentile',
  'z-score': 'Z-score',
  'price-book': 'P/B',
  'price-earnings': 'P/E',
};

/**
 * The measure is not unique, and switching it moves the readings.
 *
 * A factor that looks expensive on one specification can read as ordinary on
 * another; the page says so rather than presenting one number as the answer.
 */
export const VALUE_SPREAD_METRIC_DEFINITION: Record<ValueSpreadMetric, string> = {
  percentile: 'Rank of the current spread inside its own history since 1968.',
  'z-score': 'Standard deviations of the current spread from its 1968 mean.',
  'price-book': 'Spread of price-to-book between the long and the short leg.',
  'price-earnings': 'Spread of price-to-earnings between the long and the short leg.',
};

export const VALUE_SPREAD_METRIC_NOTE =
  'The measure is not unique: a factor that reads elevated on one specification can read ordinary on another.';

/** The band the marker sits on: the 1968 mean, ±2 standard deviations. */
export const VALUE_SPREAD_BAND_SD = 2;
export const VALUE_SPREAD_BASE_YEAR = 1968;

/** Beyond ±1 SD the reading is called cheap or elevated rather than ordinary. */
export const VALUE_SPREAD_BAND_THRESHOLD = 1;

export type ValueSpreadBand = 'cheap' | 'ordinary' | 'elevated';

export const VALUE_SPREAD_BAND_LABEL: Record<ValueSpreadBand, string> = {
  cheap: 'cheap',
  ordinary: 'ordinary',
  elevated: 'elevated',
};

export const VALUE_SPREAD_BAND_ICON: Record<ValueSpreadBand, string> = {
  cheap: '▼',
  ordinary: '▬',
  elevated: '▲',
};

/** No factor is at a historical extreme unless its reading passes this. */
export const VALUE_SPREAD_EXTREME_SD = 2;

export const NO_EXTREME_NOTE = 'No factor sits at a historical extreme';

/** One factor's position on its own historical valuation band. */
export interface ValueSpreadReading {
  readonly factor: FactorId;
  readonly label: string;
  readonly portfolio: string;
  /**
   * Standard deviations from the historical mean, the canonical scale. Every
   * metric is rendered from this one number, so switching the metric restates
   * the reading rather than replacing it.
   */
  readonly zScore: number;
  /** The number the selected metric actually prints. */
  readonly display: number;
  readonly metric: ValueSpreadMetric;
  readonly band: ValueSpreadBand;
  /** Above `VALUE_SPREAD_EXTREME_SD`. False for every factor in this sample. */
  readonly extreme: boolean;
}

/** A factor whose history is too short to be positioned on a band at all. */
export interface ValueSpreadOmission {
  readonly factor: FactorId;
  readonly label: string;
  readonly reason: string;
}

/**
 * The anti-extrapolation callout.
 *
 * Generated from the conflicted row, never written beside it: `trendClause`
 * and `valuationClause` are rendered from the same `FactorSignalRow` fields the
 * table's two arrows are rendered from, so the callout and the table cannot
 * report opposite readings of one factor. It points at the guardrail banner by
 * reference and does not repeat its text.
 */
export interface ExtrapolationCheck {
  readonly factor: FactorId;
  readonly label: string;
  readonly trendClause: string;
  readonly valuationClause: string;
  /** The finding, in one line, from the two clauses above. */
  readonly summary: string;
}

export const EXTRAPOLATION_CHECK_TITLE = 'Extrapolation check';

export const EXTRAPOLATION_CHECK_RULE =
  'Recent performance is negatively correlated with the next five years. Valuation is the predictor that survives out of sample.';

// ---------------------------------------------------------------------------
// The factor signal table
// ---------------------------------------------------------------------------

/** One row of the signal table. */
export interface FactorSignalRow {
  readonly factor: FactorId;
  readonly label: string;
  readonly portfolio: string;
  /** No score at all: the history is shorter than the lookback needs. */
  readonly insufficientHistory: boolean;
  /** Excluded from the composite, and therefore from the tilt. */
  readonly excluded: boolean;
  readonly drivers: readonly PredictorReading[];
  /** Derived from the value spread — the same field the band marker uses. */
  readonly valuation: SignalDirection;
  readonly valuationScore: number | null;
  readonly trend: SignalDirection;
  readonly trendScore: number | null;
  /** Blend of the drivers the timing model weights, before centring. */
  readonly rawComposite: number | null;
  /** The cross-sectional score: `raw` less the weight-weighted mean. */
  readonly composite: number | null;
  readonly tilt: TiltDirection | null;
  /** Trend and valuation oppose one another and the composite cancels. */
  readonly conflict: boolean;
  /** Current weight, percent of the portfolio. */
  readonly currentWeightPct: number;
  /** Weight the timing model implies, percent. `null` when excluded. */
  readonly timingWeightPct: number | null;
  /** `timing − current`, percentage points. `null` when excluded. */
  readonly deltaPp: number | null;
  /** The horizon of the strongest driver the model is using. */
  readonly bindingHorizon: string | null;
}

export type SignalSortKey = 'factor' | 'valuation' | 'trend' | 'composite' | 'current' | 'timing' | 'delta';

export const SIGNAL_SORT_LABEL: Record<SignalSortKey, string> = {
  factor: 'Factor',
  valuation: 'Valuation',
  trend: 'Trend',
  composite: 'Composite',
  current: 'Curr %',
  timing: 'Timing %',
  delta: 'Delta',
};

/**
 * Rows with no score sort to the bottom whichever column is active.
 *
 * "Insufficient history" is not a small number; ranking it among the numbers
 * would make it one.
 */
export const UNSCORED_SORT_NOTE = 'Rows with no score stay at the bottom whichever column sorts.';

// ---------------------------------------------------------------------------
// Timing comparison — information ratios, and the measure that is not one
// ---------------------------------------------------------------------------

export type TimingVariantId =
  | 'factor-investing'
  | 'market-timing'
  | 'factor-timing'
  | 'anomaly-timing'
  | 'pure-anomaly-timing';

export const TIMING_VARIANTS: readonly TimingVariantId[] = [
  'factor-investing',
  'market-timing',
  'factor-timing',
  'anomaly-timing',
  'pure-anomaly-timing',
];

export const TIMING_VARIANT_LABEL: Record<TimingVariantId, string> = {
  'factor-investing': 'Factor investing',
  'market-timing': 'Market timing',
  'factor-timing': 'Factor timing',
  'anomaly-timing': 'Anomaly timing',
  'pure-anomaly-timing': 'Pure anomaly timing',
};

export const TIMING_VARIANT_DEFINITION: Record<TimingVariantId, string> = {
  'factor-investing': 'Conditional means replaced by unconditional ones — no timing at all.',
  'market-timing': 'Times the market portfolio only.',
  'factor-timing': 'Times the market and the dominant principal components together.',
  'anomaly-timing': 'Times the anomaly components, market exposure left alone.',
  'pure-anomaly-timing': 'Zero weight on the market and zero average exposure to every factor.',
};

/**
 * Why a variant carries no information ratio.
 *
 * The two reasons are different claims and print differently. `baseline` is
 * "the ratio is measured against this, so it has none of its own";
 * `not-reported` is "the domain substance reports none". Neither is a zero.
 */
export type MissingIrReason = 'baseline' | 'not-reported';

export const MISSING_IR_LABEL: Record<MissingIrReason, string> = {
  baseline: 'baseline',
  'not-reported': 'not measured',
};

export const MISSING_IR_DETAIL: Record<MissingIrReason, string> = {
  baseline:
    'The information ratio is measured against factor investing, so the baseline has no bar of its own.',
  'not-reported':
    'No out-of-sample information ratio is reported for market timing. The hatched marker means not measured — it is not a ratio of zero.',
};

export interface TimingVariantRow {
  readonly variant: TimingVariantId;
  readonly label: string;
  /** Out-of-sample information ratio, or `null`. Exactly one of these two is set. */
  readonly informationRatio: number | null;
  readonly missingReason: MissingIrReason | null;
  readonly definition: string;
}

/**
 * Expected-utility gain — a **different measure**.
 *
 * Kept in its own type with its own units so it can never be handed to the
 * information-ratio series. The panel renders it in a separate box with its own
 * heading, and nothing shares an axis with the ratios.
 */
export interface UtilityGainRow {
  readonly variant: TimingVariantId;
  readonly label: string;
  /** Gain in expected utility against factor investing. Not a ratio. */
  readonly gain: number;
}

export interface UtilityGainRange {
  readonly from: number;
  readonly to: number;
}

export const UTILITY_GAIN_TITLE = 'Expected-utility gain vs factor investing';

export const UTILITY_GAIN_NOTE =
  'A different measure from the information ratio above — not comparable on that axis, and drawn on its own scale.';

/** Nothing is marked recommended until the reader asks for a reading. */
export const NO_RECOMMENDATION_NOTE =
  'No variant is marked recommended. The evidence is contested and which one to run is the reader’s call.';

export const RECOMMENDATION_PROMPT = 'What does the evidence favour?';

export const RECOMMENDATION_ANSWER =
  'Anomaly timing carries the highest reported out-of-sample information ratio, 0.60, with pure anomaly timing at 0.59 while taking no static bets at all. Both are gross of transaction costs, which fall hardest on momentum and low volatility, and the estimation error on a return forecast is usually larger than the forecast.';

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export interface GuardrailNotice {
  readonly id: string;
  readonly headline: string;
  readonly detail: string;
}

export const GUARDRAIL_NOTICES: readonly GuardrailNotice[] = [
  {
    id: 'near-arbitrage',
    headline: 'Guardrails active — near-arbitrage bound enforced, tilts moderated for breadth',
    detail:
      'The average conditional squared Sharpe ratio is bounded above, which is what stops the small principal components contributing implausible predictability. The tilt intensity is capped at ' +
      `${TILT_INTENSITY_CAP} for the same reason.`,
  },
  {
    id: 'concentration',
    headline: 'No single-factor concentration · performance chasing disabled by design',
    detail:
      'A signal applied with breadth is worth less than it looks, and an aggressive bet on the single cheapest factor erodes the Sharpe ratio through lost diversification. Past performance is never an input to the composite: over five years it is negatively correlated with what follows.',
  },
];

/** The banner hides for the session; a different conflict brings it back. */
export const GUARDRAIL_DISMISS_LABEL = 'Dismiss';
export const GUARDRAIL_DETAIL_LABEL = 'View detail';
export const GUARDRAIL_BANNER_ID = 'ft-guardrail-banner';
export const GUARDRAIL_REFERENCE_LABEL = 'See the guardrail notice';

/** The key of "no rows are in conflict", so a dismissal can be scoped to it. */
export const NO_CONFLICT_KEY = 'none';

// ---------------------------------------------------------------------------
// Regime & market state — read from the shared engine, never re-derived
// ---------------------------------------------------------------------------

/**
 * The multi-asset regime is called uncertain below this probability.
 *
 * A display rule over the shared filter's reading, not a second estimate: the
 * probabilities themselves come from `MarketRegimesService.stateProbabilities()`.
 */
export const REGIME_UNCERTAIN_THRESHOLD_PCT = 60;

export const REGIME_UNCERTAIN_LABEL = 'Regime uncertain';

export const REGIME_UNCERTAIN_DETAIL = `Highest state probability below ${REGIME_UNCERTAIN_THRESHOLD_PCT}% — the filter is close to a tie and the state it reports may be a missed turning point.`;

/** One state of the value chain, with the probability mass sitting on it. */
export interface ValueRegimeReading {
  readonly state: ValueVolatilityState;
  readonly label: string;
  /** Percent. Grouped out of the shared filter by volatility state. */
  readonly probability: number;
  /** Value minus growth in that state, annualised percent, from the shared service. */
  readonly premiumPercent: number;
}

/**
 * How each state of the shared regime filter maps onto the value chain's two
 * volatility states.
 *
 * This is a **grouping of one reading**, not a second filter: crash and
 * recovery are the high-volatility states of the four-state VAR, slow growth
 * and bull the low-volatility ones, and Hamilton's recession and expansion
 * carry the same split. Stating the mapping is what keeps the two cards from
 * making independent claims about the same market.
 */
export const VALUE_VOLATILITY_STATE_OF_REGIME: Record<string, ValueVolatilityState> = {
  Crash: 'high-volatility',
  Recovery: 'high-volatility',
  Recession: 'high-volatility',
  'Slow Growth': 'low-volatility',
  Bull: 'low-volatility',
  Expansion: 'low-volatility',
};

export const VALUE_REGIME_SOURCE_NOTE =
  'The two states of the value premium’s own chain, read off the shared regime filter by volatility state — this page runs no second filter.';

export const REGIME_SHARED_NOTE = 'Regime state shared with Macro & Regimes Agent';

export const MARKET_REGIMES_ROUTE = '/advanced-signals/market-regimes';
export const MACRO_AGENT_ROUTE = '/fund/macro-agent';
export const UNIVERSE_DATA_ROUTE = '/build/universe-data';

export const REGIME_ERROR_MESSAGE = 'Regime model failed to converge';
export const REGIME_ERROR_DETAIL =
  'The rest of the page is the last signal set that did compute, and is marked stale. Retry, or open Market Regimes and narrow the sample.';

export const REGIME_EMPTY_NOTE =
  'The shared regime filter has no estimate for its current settings, so no state is shown here.';

// ---------------------------------------------------------------------------
// The rolling excess-return chart
// ---------------------------------------------------------------------------

export const EXCESS_RETURN_WINDOW_YEARS = 3;

export const EXCESS_RETURN_FIRST_YEAR = 1990;
export const EXCESS_RETURN_LAST_YEAR = 2026;

export const SINGLE_LINE_HINT =
  'Only one line is plotted. Add another factor to compare the cycles against each other.';

/** One factor's rolling excess return against the market. */
export interface ExcessReturnSeries {
  readonly factor: FactorId;
  readonly label: string;
  /** Percent per year, one point per year. */
  readonly values: readonly (number | null)[];
}

// ---------------------------------------------------------------------------
// The hand-off to Views Builder
// ---------------------------------------------------------------------------

export interface AppliedTilt {
  readonly factor: FactorId;
  readonly label: string;
  readonly currentWeightPct: number;
  readonly timingWeightPct: number;
  readonly deltaPp: number;
}

/** What was actually handed over, once the primary action has run. */
export interface AppliedTiltSet {
  readonly at: string;
  readonly timingModel: TimingModelId;
  readonly weighting: WmlWeighting;
  readonly rebalancing: RebalancingFrequency;
  readonly lookbackMonths: MomentumLookback;
  readonly horizon: string;
  readonly tilts: readonly AppliedTilt[];
  readonly targetRoute: string;
}

export const APPLY_TILTS_LABEL = 'Apply tilts to Views Builder';
export const EXPORT_SNAPSHOT_LABEL = 'Export signal snapshot';
export const EXPORT_FILENAME = 'factor-timing-snapshot.csv';

export const APPLY_BLOCKED_LOADING = 'Available once the signals have finished computing.';
export const APPLY_BLOCKED_ERROR = 'Available once the signals compute without error.';
export const APPLY_BLOCKED_EMPTY = 'Available once at least one factor has enough history to score.';

export const APPLY_SUCCESS_MESSAGE = 'Tilts handed to Views Builder as a tactical view';

// ---------------------------------------------------------------------------
// Page-level states
// ---------------------------------------------------------------------------

export type FactorTimingEmptyReason = 'no-history' | 'no-factors';

export const EMPTY_TITLE = 'No signals available';

export const EMPTY_DETAIL: Record<FactorTimingEmptyReason, string> = {
  'no-history':
    'None of the factors in view has enough price history for the selected lookback, so no signal can be estimated. Widen the factor universe or the data window.',
  'no-factors': NO_FACTOR_SELECTED_ERROR,
};

export const EMPTY_ACTION_LABEL = 'Configure universe and data window';

/**
 * What the two panels that keep their place say when there is nothing to show.
 *
 * The empty state replaces the chart and the table — the regions that would
 * have to invent a reading. The InfoCard and the TimingComparisonPanel stay
 * where they are with a sentence in place of their values, because a region
 * that disappears takes its heading and its place in the reading order with it.
 */
export const EMPTY_SPREAD_PLACEHOLDER =
  'No factor in view has a valuation band to sit on, so no reading is shown here. The band returns as soon as a factor with enough history is selected.';

export const EMPTY_COMPARISON_PLACEHOLDER =
  'The out-of-sample information ratios are a property of the evidence, not of this portfolio, but they are held back until there is a cross-section to state them against.';

export const LOAD_FAILURE_MESSAGE = 'The factor signals could not be computed.';
export const LOAD_FAILURE_DETAIL =
  'Nothing below this line is a current reading. Retry, or narrow the factor universe and try again.';

export const APPLY_FAILURE_MESSAGE = 'The tilts could not be handed to Views Builder.';
export const APPLY_FAILURE_DETAIL =
  'Nothing was written. Retry, or open Views Builder and enter the tactical view by hand.';

/** Pages this one links out to. */
export const FACTOR_TIMING_RELATED_PAGES: readonly { label: string; route: string }[] = [
  { label: 'Market Regimes', route: MARKET_REGIMES_ROUTE },
  { label: 'Macro & Regimes Agent', route: MACRO_AGENT_ROUTE },
];
