/**
 * Types behind `docs/22 Market Regimes.md`.
 *
 * The page's governing rule is that **three separate state vocabularies must
 * never blend**:
 *
 * 1. the toolbar's regime-switching model — the 4-state multi-asset VAR
 *    (Crash / Slow Growth / Bull / Recovery) or the 2-state Hamilton growth
 *    model (Recession / Expansion). It drives the HeroStatCard, the Probability
 *    Path, Regime Statistics and the Size Premium panel;
 * 2. the value premium's own 2-state Markov model — high-volatility /
 *    low-volatility — which has its own panel and is independent of the
 *    toolbar's 'Regime model' selector entirely;
 * 3. momentum's UP / DOWN market state — a third taxonomy that shares no label
 *    and no colour with either of the other two.
 *
 * A single shared enum across all three would let the UI align rows that have
 * no business aligning, so every row that belongs to a vocabulary carries a
 * literal `vocabulary` discriminant. `SizePremiumRow` and `ValuePremiumRow` are
 * therefore not assignable to one another: a template that tries to zip them
 * into one table fails to compile, which is the point.
 *
 * The first vocabulary is **not redeclared here**. Its state names, its model
 * ids and its per-state shape come from `macro-regime.model.ts`, which doc 12's
 * Macro & Regimes Agent already owns; this file narrows and extends them.
 *
 * Nothing that the domain substance leaves unspecified is invented. A
 * correlation the four-state VAR does not fix, and the size premium in the
 * Recovery regime, are `null` — rendered as `—` or as a hatched "not measured"
 * bar, never as zero.
 */

import { REGIME_MODELS, type RegimeModelId, type RegimeState } from './macro-regime.model';

// The reused vocabulary travels on, so a page imports one model file rather
// than two — but it is declared exactly once, over in doc 12's model.
export { REGIME_MODELS };
export type { RegimeModelId, RegimeState };

// ---------------------------------------------------------------------------
// The three vocabularies, named
// ---------------------------------------------------------------------------

/**
 * Which state taxonomy a row belongs to.
 *
 * Carried as a literal discriminant on every row type so that rows of
 * different vocabularies are structurally incompatible.
 */
export type StateVocabulary = 'regime-model' | 'value-volatility' | 'momentum-market';

export const STATE_VOCABULARY_LABEL: Record<StateVocabulary, string> = {
  'regime-model': 'Regime model state',
  'value-volatility': 'Volatility state — 2-state Markov, value premium only',
  'momentum-market': 'Market state — momentum only',
};

// ---------------------------------------------------------------------------
// Toolbar — regime model
// ---------------------------------------------------------------------------

/**
 * The two models this page's toolbar offers, narrowed out of the shared union
 * rather than re-spelled: `four-state` is the 4-Regime Multi-Asset VAR and
 * `hamilton` is the Macro Growth 2-state model.
 */
export type MarketRegimeModelId = Extract<RegimeModelId, 'four-state' | 'hamilton'>;

export const MARKET_REGIME_MODELS: readonly MarketRegimeModelId[] = ['four-state', 'hamilton'];

/** Page copy. The state names themselves come from `REGIME_MODELS`. */
export const MARKET_REGIME_MODEL_LABEL: Record<MarketRegimeModelId, string> = {
  'four-state': '4-Regime Multi-Asset (VAR)',
  hamilton: 'Macro Growth 2-state (Hamilton)',
};

export const MARKET_REGIME_MODEL_DEFINITION: Record<MarketRegimeModelId, string> = {
  'four-state':
    'A regime-switching VAR on large cap, small cap and long bonds, fitted by EM: four economically interpretable states.',
  hamilton:
    'Hamilton’s two-state Markov switching model on the growth rate: one contraction state and one expansion state.',
};

// ---------------------------------------------------------------------------
// Toolbar — universe
// ---------------------------------------------------------------------------

export type RegimeUniverseId =
  | 'equities-bonds'
  | 'equities-only'
  | 'global-multi-asset'
  | 'em-equities';

/** A pair of series the Correlation Diagnostic can be run on. */
export type SeriesPairId = 'large-small' | 'equity-bond' | 'commodity-equity';

export interface SeriesPair {
  readonly id: SeriesPairId;
  readonly label: string;
  /**
   * Which side of θ the empirical exceedance correlation sits higher on.
   *
   * For two equity sleeves it is the downside — the stylised fact the page is
   * built around. For equity against bonds it is the upside, because the crash
   * regime is exactly where that correlation turns negative. The direction is
   * declared per pair rather than assumed, so the chart never claims a pattern
   * the pair does not have.
   */
  readonly downsideExceedance: 'higher' | 'lower';
}

export const SERIES_PAIRS: Record<SeriesPairId, SeriesPair> = {
  'large-small': { id: 'large-small', label: 'Large cap – Small cap', downsideExceedance: 'higher' },
  'equity-bond': { id: 'equity-bond', label: 'Equity – Long bonds', downsideExceedance: 'lower' },
  'commodity-equity': {
    id: 'commodity-equity',
    label: 'Commodities – Equity',
    downsideExceedance: 'higher',
  },
};

export interface RegimeUniverse {
  readonly id: RegimeUniverseId;
  readonly label: string;
  /** The series it holds, for the toolbar's secondary line. */
  readonly detail: string;
  /** First month with an observation. A universe added last year has no sample. */
  readonly firstObservation: SampleMonth;
  /** Whether it carries both a large-cap and a small-cap series. */
  readonly hasSizeSeries: boolean;
  /** Whether it carries both an equity and a bond series. */
  readonly hasEquityBondSeries: boolean;
  /** Pairs the Correlation Diagnostic can offer on this universe. */
  readonly pairs: readonly SeriesPairId[];
}

// ---------------------------------------------------------------------------
// Toolbar — probability basis and sample window
// ---------------------------------------------------------------------------

/**
 * Filtered `P[s_t | I_t]` uses information up to `t`; smoothed
 * `P[s_t | I_T]` uses the whole sample and is therefore the calmer series.
 * A display choice over one and the same fitted model.
 */
export type ProbabilityBasis = 'filtered' | 'smoothed';

export const PROBABILITY_BASES: readonly ProbabilityBasis[] = ['filtered', 'smoothed'];

export const PROBABILITY_BASIS_LABEL: Record<ProbabilityBasis, string> = {
  filtered: 'Filtered',
  smoothed: 'Smoothed',
};

export const PROBABILITY_BASIS_DEFINITION: Record<ProbabilityBasis, string> = {
  filtered: 'P[s_t | I_t] — information up to t only, the real-time reading.',
  smoothed: 'P[s_t | I_T] — the full-sample inference, revised with hindsight.',
};

/** A month on the sample axis, `YYYY-MM`. */
export type SampleMonth = string;

export const SAMPLE_MONTH_FIRST: SampleMonth = '1990-01';
export const SAMPLE_MONTH_LAST: SampleMonth = '2026-08';
export const SAMPLE_FROM_DEFAULT: SampleMonth = '1990-01';
export const SAMPLE_TO_DEFAULT: SampleMonth = '2026-07';

/** Below this many months the recursive filter has nothing to estimate on. */
export const MIN_SAMPLE_MONTHS = 24;

export const SAMPLE_WINDOW_ORDER_ERROR =
  'The start of the sample must come before its end. Pick a “from” month earlier than the “to” month.';

// ---------------------------------------------------------------------------
// Vocabulary 1 — the toolbar's regime model
// ---------------------------------------------------------------------------

/**
 * One state of the selected model, with the probability the toolbar's basis
 * asks for.
 *
 * Extends doc 12's `RegimeState` — `name`, `probability`, `expectedRunMonths`
 * and `description` are that type's fields — and adds the unconditional
 * probability, which the hero card shows beside the current one.
 *
 * `probability` is the reading at the **last month of the sample**, and it does
 * not depend on `ProbabilityBasis`: at `t = T` the smoother has no future left
 * to condition on, so `P[s_T | I_T]` is the filtered probability identically.
 * The basis chooses how the path *behind* this month is drawn.
 */
export interface RegimeStateReading extends RegimeState {
  readonly vocabulary: 'regime-model';
  /** π_i, the stationary probability of the chain. Percent. */
  readonly stationaryProbability: number;
}

/** The modal state — the one reading the whole page is anchored to. */
export interface DominantStateReading {
  readonly vocabulary: 'regime-model';
  readonly model: MarketRegimeModelId;
  /** The basis the path behind this month is drawn on — not of `probability`. */
  readonly basis: ProbabilityBasis;
  readonly state: string;
  /** Percent. `P[s_T | I_T]`, which is the filtered reading on either basis. */
  readonly probability: number;
  readonly stationaryProbability: number;
  readonly expectedDurationMonths: number;
  /** The first month of the unbroken run in which this state has been modal. */
  readonly mostLikelySince: SampleMonth;
  readonly description: string;
}

/** One state's probability, for a card on another page. */
export interface StateProbability {
  readonly vocabulary: 'regime-model';
  readonly state: string;
  readonly probability: number;
}

/** One state's band of the stacked probability path. */
export interface ProbabilityPathSeries {
  readonly vocabulary: 'regime-model';
  readonly state: string;
  /** Percent at each month of the path, in order. Bands sum to 100 at every month. */
  readonly probabilities: readonly number[];
}

/**
 * Why a correlation cell carries no number.
 *
 * `not-fixed` and `series-missing` are different claims and are printed
 * differently: the first says the domain substance does not pin the value for
 * that regime, the second says the selected universe has no such pair at all.
 * `positive` and `negative` record a sign the substance does fix without
 * fixing a magnitude.
 */
export type CorrelationNote = 'not-fixed' | 'series-missing' | 'positive' | 'negative';

export const CORRELATION_NOTE_LABEL: Record<CorrelationNote, string> = {
  'not-fixed': '—',
  'series-missing': 'n/d',
  positive: '+ positive',
  negative: '− negative',
};

export const CORRELATION_NOTE_DETAIL: Record<CorrelationNote, string> = {
  'not-fixed': 'not fixed by the domain substance for this regime',
  'series-missing': 'the selected universe has no such pair',
  positive: 'positive, magnitude not fixed by the domain substance',
  negative: 'negative, magnitude not fixed by the domain substance',
};

/**
 * One correlation cell: a number, or a reason there is none — never both and
 * never neither.
 */
export interface CorrelationCell {
  /** ρ, or `null` when the substance fixes no magnitude for this regime. */
  readonly value: number | null;
  /** Set exactly when `value` is null. */
  readonly note: CorrelationNote | null;
}

/** One row of the Regime Statistics table. */
export interface RegimeStatisticsRow {
  readonly vocabulary: 'regime-model';
  readonly state: string;
  /** π_i, percent. */
  readonly stationaryProbability: number;
  readonly averageDurationMonths: number;
  /** Monthly mean return on the selected universe, percent. */
  readonly meanReturn: number;
  /** Monthly return volatility on the selected universe, percent. */
  readonly volatility: number;
  readonly largeSmall: CorrelationCell;
  readonly equityBond: CorrelationCell;
}

// ---------------------------------------------------------------------------
// Correlation diagnostic — exceedance correlations
// ---------------------------------------------------------------------------

export const THETA_MIN = -2;
export const THETA_MAX = 2;
export const THETA_STEP = 0.25;
export const THETA_DEFAULT = 0;

/**
 * How close a model's asymmetry must sit to the empirical one to count as
 * reproducing it. Wide enough that a near miss is not called a failure, narrow
 * enough that a symmetric model can never pass.
 */
export const ASYMMETRY_TOLERANCE = 0.04;

export type ExceedanceModelId = 'empirical' | 'regime-switching' | 'normal' | 'asymmetric-garch';

export const EXCEEDANCE_MODELS: readonly ExceedanceModelId[] = [
  'empirical',
  'regime-switching',
  'normal',
  'asymmetric-garch',
];

export const EXCEEDANCE_MODEL_LABEL: Record<ExceedanceModelId, string> = {
  empirical: 'Empirical',
  'regime-switching': 'Regime-switching model',
  normal: 'Normal',
  'asymmetric-garch': 'Asym. GARCH',
};

/** ECharts symbol names, so the four series differ by shape and not by colour. */
export const EXCEEDANCE_MODEL_SYMBOL: Record<ExceedanceModelId, string> = {
  empirical: 'circle',
  'regime-switching': 'emptyCircle',
  normal: 'diamond',
  'asymmetric-garch': 'triangle',
};

export interface ExceedancePoint {
  /** θ in standard deviations, symmetric about zero. */
  readonly theta: number;
  readonly correlation: number;
}

export interface ExceedanceSeries {
  readonly model: ExceedanceModelId;
  /** True for the empirical series — the thing the models are judged against. */
  readonly isReference: boolean;
  readonly points: readonly ExceedancePoint[];
  /**
   * Mean of `ρ(−θ) − ρ(+θ)` over θ > 0. Positive means the downside exceedance
   * correlations sit above the upside ones.
   */
  readonly asymmetryGap: number;
  /** `null` on the empirical series; it is the benchmark, not a candidate. */
  readonly reproducesAsymmetry: boolean | null;
}

/** The four series read off at the θ the slider is on. */
export interface ExceedanceReading {
  readonly model: ExceedanceModelId;
  readonly theta: number;
  readonly correlation: number;
}

// ---------------------------------------------------------------------------
// Macro nowcast — dynamic factor model
// ---------------------------------------------------------------------------

export type FactorCount = 6 | 12;

export const FACTOR_COUNTS: readonly FactorCount[] = [6, 12];

/** Share of the variance of 215 monthly US series the factors explain, percent. */
export const FACTOR_EXPLAINED_VARIANCE: Record<FactorCount, number> = { 6: 39, 12: 53 };

export const FACTOR_COUNT_LABEL: Record<FactorCount, string> = {
  6: '6 — 39% var.',
  12: '12 — 53% var.',
};

/** Which variable blocks a band of factors loads on. */
export interface FactorLoadingBlock {
  /** e.g. `1–3`. */
  readonly range: string;
  readonly blocks: readonly string[];
  /** Set when the substance identifies no blocks for that band. */
  readonly note: string | null;
}

export type UncertaintyLevel = 'high' | 'low';

export const UNCERTAINTY_LEVEL_LABEL: Record<UncertaintyLevel, string> = {
  high: 'high',
  low: 'low',
};

/** Above this share of projection uncertainty, a component reads as `high`. */
export const UNCERTAINTY_HIGH_THRESHOLD = 0.5;

/** One data publication and the revision it caused. */
export interface NowcastRelease {
  readonly id: string;
  readonly series: string;
  readonly at: string;
  /** NEWS[i, v_j] — the revision to the nowcast, percentage points. */
  readonly newsPp: number;
}

export interface MacroNowcast {
  /** Projection of GDP on the information set, % q/q. */
  readonly gdpGrowthQoq: number;
  readonly vintage: string;
  readonly priorVintage: string;
  /** Change against the prior vintage, percentage points. */
  readonly deltaVsPriorVintagePp: number;
  readonly factorCount: FactorCount;
  readonly explainedVariance: number;
  readonly loadings: readonly FactorLoadingBlock[];
  /** Share of projection uncertainty carried by the common factors, 0–1. */
  readonly commonUncertainty: number;
  readonly commonUncertaintyLevel: UncertaintyLevel;
  readonly idiosyncraticUncertainty: number;
  readonly idiosyncraticUncertaintyLevel: UncertaintyLevel;
  readonly releases: readonly NowcastRelease[];
  /**
   * The vintage is older than the reference month of the returns filter.
   * Shown as a text badge, never as a colour alone.
   */
  readonly staleVintage: boolean;
  /** The month the returns filter is anchored to, for the badge's tooltip. */
  readonly filterReferenceMonth: SampleMonth;
}

export const STALE_VINTAGE_BADGE = 'Stale vintage';

// ---------------------------------------------------------------------------
// Vocabulary 3 — momentum's market state
// ---------------------------------------------------------------------------

/** J, the horizon the market state is defined over. */
export type MomentumLookback = 12 | 24 | 36;

export const MOMENTUM_LOOKBACKS: readonly MomentumLookback[] = [12, 24, 36];

export const MOMENTUM_LOOKBACK_LABEL: Record<MomentumLookback, string> = {
  12: '12 months',
  24: '24 months',
  36: '36 months',
};

/**
 * The third taxonomy. Two members, sharing no label with the regime model's
 * states or with the value premium's volatility states.
 */
export type MomentumMarketState = 'UP' | 'DOWN';

export const MOMENTUM_MARKET_STATES: readonly MomentumMarketState[] = ['UP', 'DOWN'];

export const MOMENTUM_MARKET_STATE_LABEL: Record<MomentumMarketState, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
};

export const MOMENTUM_MARKET_STATE_ICON: Record<MomentumMarketState, string> = {
  UP: '▲',
  DOWN: '▼',
};

export type MomentumHorizon = 'months-1-6' | 'months-13-60';

export const MOMENTUM_HORIZON_LABEL: Record<MomentumHorizon, string> = {
  'months-1-6': 'Months 1–6',
  'months-13-60': 'Months 13–60',
};

/** Winner-minus-loser profit conditioned on the state that preceded it. */
export interface ConditionalProfit {
  readonly vocabulary: 'momentum-market';
  readonly afterState: MomentumMarketState;
  readonly horizon: MomentumHorizon;
  /** Raw profit, percent per month. */
  readonly rawPerMonth: number;
  /** CAPM-adjusted profit, or `null` where the substance fixes none. */
  readonly capmAdjustedPerMonth: number | null;
  /** The long-horizon reversal — a sign flip against the first six months. */
  readonly reversal: boolean;
}

/**
 * The momentum-crash indicator.
 *
 * A **composite boolean**, never a continuous score: it is armed only when a
 * bear market state and high realised volatility hold at the same time, which
 * is what makes the crashes partly foreseeable at all.
 */
export interface MomentumCrashRisk {
  /** The market state over the chosen lookback is DOWN. */
  readonly bearState: boolean;
  /** Realised volatility of the selected universe over 126 days, annualised %. */
  readonly realisedVolatility: number;
  readonly volatilityThreshold: number;
  readonly highVolatility: boolean;
  /** `bearState && highVolatility`. Nothing else can arm it. */
  readonly armed: boolean;
  /** Which condition is missing, in words. */
  readonly reason: string;
}

/** Realised volatility above this, annualised percent, counts as high. */
export const CRASH_RISK_VOLATILITY_THRESHOLD = 30;

export const CRASH_RISK_ARMED_LABEL = 'armed';
export const CRASH_RISK_NOT_ARMED_LABEL = 'not armed';
export const CRASH_RISK_ARMED_ICON = '⚑';
export const CRASH_RISK_NOT_ARMED_ICON = '○';

/** How the winner-minus-loser leg is weighted through time. */
export type WmlWeighting = 'static' | 'vol-scaled' | 'dynamic';

export const WML_WEIGHTINGS: readonly WmlWeighting[] = ['static', 'vol-scaled', 'dynamic'];

export const WML_WEIGHTING_LABEL: Record<WmlWeighting, string> = {
  static: 'static',
  'vol-scaled': 'vol-scaled',
  dynamic: 'dynamic',
};

export interface WmlSharpeRow {
  readonly weighting: WmlWeighting;
  readonly sharpe: number;
}

export interface MomentumState {
  readonly vocabulary: 'momentum-market';
  readonly lookbackMonths: MomentumLookback;
  readonly state: MomentumMarketState;
  /** Cumulative market return over the lookback, percent. Its sign is the state. */
  readonly cumulativeMarketReturn: number;
  readonly profits: readonly ConditionalProfit[];
  readonly crashRisk: MomentumCrashRisk;
  readonly wmlSharpe: readonly WmlSharpeRow[];
}

// ---------------------------------------------------------------------------
// Size premium — vocabulary 1, pinned to the four VAR regimes
// ---------------------------------------------------------------------------

/**
 * The size premium by regime.
 *
 * Always the four-state VAR taxonomy, whatever the toolbar's regime model says:
 * the estimate exists for those four states and nowhere else. `premiumBp` is
 * `null` for Recovery because the substance does not specify it — the bar is
 * hatched, and hatching means "not measured", which is not zero.
 */
export interface SizePremiumRow {
  readonly vocabulary: 'regime-model';
  readonly model: 'four-state';
  readonly state: string;
  /** Small minus Large, basis points per month. */
  readonly premiumBp: number | null;
  /** Set exactly when `premiumBp` is null. */
  readonly note: string | null;
}

export const SIZE_PREMIUM_NOT_SPECIFIED = 'not specified in the domain substance';

// ---------------------------------------------------------------------------
// Vocabulary 2 — the value premium's own 2-state Markov model
// ---------------------------------------------------------------------------

/**
 * The value premium's states. A separate Markov chain on book-to-market
 * portfolios, with its own two states and no row aligned with the size premium
 * above it — and entirely independent of the toolbar's 'Regime model'.
 */
export type ValueVolatilityState = 'high-volatility' | 'low-volatility';

export const VALUE_VOLATILITY_STATES: readonly ValueVolatilityState[] = [
  'high-volatility',
  'low-volatility',
];

export const VALUE_VOLATILITY_STATE_LABEL: Record<ValueVolatilityState, string> = {
  'high-volatility': 'High-volatility state, recession-linked',
  'low-volatility': 'Low-volatility state, expansion-linked',
};

export interface ValuePremiumRow {
  readonly vocabulary: 'value-volatility';
  readonly state: ValueVolatilityState;
  /** Value minus growth, annualised percent. */
  readonly premiumPercent: number;
}

export const VALUE_PREMIUM_MODEL_NOTE =
  'Separate model — its own state vocabulary, no row aligned with Size Premium.';

// ---------------------------------------------------------------------------
// The bridge to Views Builder
// ---------------------------------------------------------------------------

export type ViewDirection = 'defensive' | 'neutral' | 'risk-on';

export const VIEW_DIRECTION_LABEL: Record<ViewDirection, string> = {
  defensive: 'Defensive',
  neutral: 'Neutral',
  'risk-on': 'Risk-on',
};

export const VIEW_DIRECTION_ICON: Record<ViewDirection, string> = {
  defensive: '▼',
  neutral: '▬',
  'risk-on': '▲',
};

export interface ViewDirectionCopy {
  readonly expectedReturns: string;
  readonly correlations: string;
  readonly covariance: string;
}

export const VIEW_DIRECTION_COPY: Record<ViewDirection, ViewDirectionCopy> = {
  defensive: {
    expectedReturns: 'lower expected returns',
    correlations: 'higher correlations',
    covariance: 'widened covariance',
  },
  neutral: {
    expectedReturns: 'expected returns at equilibrium',
    correlations: 'correlations at equilibrium',
    covariance: 'covariance at equilibrium',
  },
  'risk-on': {
    expectedReturns: 'higher expected returns',
    correlations: 'lower correlations',
    covariance: 'tightened covariance',
  },
};

/**
 * The draft view the regime implies.
 *
 * Always recomputed from the dominant state in the HeroStatCard, never set
 * independently — so the two cards cannot contradict one another. There is no
 * setter for it anywhere in the service.
 */
export interface RegimeImpliedView {
  readonly derivedFromState: string;
  readonly derivedFromProbability: number;
  readonly direction: ViewDirection;
  readonly expectedReturns: string;
  readonly correlations: string;
  readonly covariance: string;
  /** The three clauses joined, for the card's one-line summary. */
  readonly summary: string;
  readonly targetRoute: string;
}

export const VIEWS_BUILDER_ROUTE = '/build/views-builder';

/** What was actually handed over, once the primary action has run. */
export interface SentView {
  readonly at: string;
  readonly state: string;
  readonly direction: ViewDirection;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Diagnostics footer
// ---------------------------------------------------------------------------

/**
 * How near the top state probability has to be to 0.5 before the filter is
 * called low-confidence. Percentage points either side.
 */
export const LOW_CONFIDENCE_BAND_PCT = 8;

export const LOW_CONFIDENCE_NOTE =
  'Filter confidence low this week — possible missed turning point.';

export interface RegimeDiagnostics {
  /** Sample log-likelihood of the fitted model. `null` when nothing was fitted. */
  readonly logLikelihood: number | null;
  readonly lastCalibration: string;
  /** Highest state probability under the current basis, percent. */
  readonly topProbability: number | null;
  /** Text, never colour alone. */
  readonly lowFilterConfidence: boolean;
  readonly note: string | null;
}

// ---------------------------------------------------------------------------
// Page-level states
// ---------------------------------------------------------------------------

export type EmptyReason = 'invalid-window' | 'insufficient-history';

export const EMPTY_TITLE = 'No data for this combination';

export const EMPTY_DETAIL: Record<EmptyReason, string> = {
  'invalid-window': SAMPLE_WINDOW_ORDER_ERROR,
  'insufficient-history': `The selected universe has fewer than ${MIN_SAMPLE_MONTHS} months inside this sample window, which is not enough to estimate the filter. Widen the sample window or choose another universe.`,
};

export const LOAD_FAILURE_MESSAGE =
  'The Macro & Regimes agent did not return an estimate — the likelihood maximisation did not converge.';
export const LOAD_FAILURE_DETAIL =
  'The readings below are the last ones that did converge, and are stale. Retry, or narrow the sample window.';

export const SEND_VIEW_FAILURE_MESSAGE = 'The draft view could not be handed to Views Builder.';
export const SEND_VIEW_FAILURE_DETAIL =
  'Nothing was written. Retry, or open Views Builder and enter the view by hand.';

/** Pages this one links out to. */
export const MARKET_REGIMES_RELATED_PAGES: readonly { label: string; route: string }[] = [
  { label: 'Macro & Regimes Agent', route: '/fund/macro-agent' },
  { label: 'Views Builder', route: VIEWS_BUILDER_ROUTE },
  { label: 'Factor Timing & Rotation', route: '/advanced-signals/factor-timing-rotation' },
];
