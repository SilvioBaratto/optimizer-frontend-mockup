/**
 * TypeScript mirror of the `risk_monitoring` domain type — the fund's risk
 * posture on the weights it actually holds (`docs/18 Risk Monitoring.md`).
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Three facts about the page are encoded in the types rather than left to the
 * code that fills them in:
 *
 * 1. VaR and CVaR are the threshold and the value of one and the same
 *    minimisation, so `α_β(w) ≤ φ_β(w)` always. They therefore travel as one
 *    aligned point — `VarCvarPoint` — and never as two independent series that
 *    could drift out of step or out of order.
 * 2. `D(x,t)` is a *derived* quantity: the fall from the running maximum of the
 *    cumulative return. `UnderwaterPoint` carries the return and the running
 *    maximum beside the drawdown, so "the series returns to exactly zero at
 *    every new high" is a readable property of the data and not a promise.
 * 3. MaxDD and AvDD are the two endpoints of the CDaR family — `Δ₁(x) = M(x)`
 *    and `Δ₀(x) = A(x)`. There is no separate field for either inside the
 *    curve: the curve's ends *are* those numbers.
 *
 * Every drawdown quantity here is a **non-negative magnitude**, as `D(x,t)` is
 * defined. A fall is rendered with the minus sign where it is shown; storing it
 * signed would make "the drawdown returns to zero" a statement about −0.
 */

import type { LogEntry } from '../shared/event-log-panel/event-log-panel';

export type { LogEntry };

// --- toolbar parameters ------------------------------------------------------

/** β, the confidence level of the VaR and CVaR readings. */
export type ConfidenceLevel = 90 | 95 | 99;

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = [90, 95, 99];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  90: '90%',
  95: '95%',
  99: '99%',
};

export type VarMethod = 'parametric' | 'historical';

export const VAR_METHODS: readonly VarMethod[] = ['parametric', 'historical'];

export const VAR_METHOD_LABEL: Record<VarMethod, string> = {
  parametric: 'Parametric',
  historical: 'Historical',
};

/** Short form for the metric card, e.g. `VaR (95%, hist., 1D)`. */
export const VAR_METHOD_SHORT_LABEL: Record<VarMethod, string> = {
  parametric: 'param.',
  historical: 'hist.',
};

export const VAR_METHOD_DEFINITION: Record<VarMethod, string> = {
  parametric:
    'Multivariate normal returns: VaR = z_β·σ over the holding period, and CVaR = σ·φ(z_β)/(1−β). No sample-size floor, at the cost of the normality assumption.',
  historical:
    'Read straight off the realised returns, with no distributional assumption — and therefore only as good as the number of observations that fall in the tail.',
};

/** Holding period in days. The measures scale with its square root. */
export type HoldingPeriod = 1 | 5 | 10;

export const HOLDING_PERIODS: readonly HoldingPeriod[] = [1, 5, 10];

export const HOLDING_PERIOD_LABEL: Record<HoldingPeriod, string> = {
  1: '1 day',
  5: '5 days',
  10: '10 days',
};

/** Short form for the metric card, e.g. `1D`. */
export const HOLDING_PERIOD_SHORT_LABEL: Record<HoldingPeriod, string> = {
  1: '1D',
  5: '5D',
  10: '10D',
};

/** Extent of the VaR/CVaR trend chart. It changes nothing else on the page. */
export type LookbackWindow = '3M' | '6M' | '9M' | '1Y';

export const LOOKBACK_WINDOWS: readonly LookbackWindow[] = ['3M', '6M', '9M', '1Y'];

export const LOOKBACK_LABEL: Record<LookbackWindow, string> = {
  '3M': '3M',
  '6M': '6M',
  '9M': '9M',
  '1Y': '1Y',
};

/**
 * How a drawdown is stated: as a share of the capital at risk, or as the money
 * it stands for. Presentation only — the two are the same number times `C`.
 */
export type DrawdownUnits = 'abs' | 'rel';

export const DRAWDOWN_UNITS: readonly DrawdownUnits[] = ['abs', 'rel'];

export const DRAWDOWN_UNITS_LABEL: Record<DrawdownUnits, string> = {
  abs: 'Abs',
  rel: 'Rel%',
};

/** α of the CDaR family. The whole range is meaningful, ends included. */
export const CDAR_ALPHA_MIN = 0;
export const CDAR_ALPHA_MAX = 1;
export const CDAR_ALPHA_STEP = 0.01;
export const CDAR_ALPHA_DEFAULT = 0.95;

// --- the capital the limits are fractions of ---------------------------------

/**
 * `C` — the capital at risk the drawdown limits are written against
 * (`M(x) ≤ ν₁C`, `A(x) ≤ ν₂C`, `Δ_α(x) ≤ ν₃C`), in € millions.
 *
 * The absolute reading of every drawdown on this page is `percent/100 × C`, not
 * `percent × the running peak`. The limits are fractions of this one constant,
 * so stating the current value against a moving peak would compare two numbers
 * measured on different bases.
 */
export const CAPITAL_BASE_EUR_M = 250;

export const CAPITAL_BASE_LABEL = '€250.0m';

// --- the current readings ----------------------------------------------------

/** The four KeyMetricsRow figures, for one (β, method, holding period). */
export interface RiskReadings {
  readonly confidence: ConfidenceLevel;
  readonly method: VarMethod;
  readonly holdingPeriodDays: HoldingPeriod;
  /** β-VaR as a positive percentage of NAV over the holding period. */
  readonly var: number;
  /** β-CVaR / ES. Never below `var`. */
  readonly cvar: number;
  /** `D(x,t)` at the as-of instant, percent. Non-negative. */
  readonly currentDrawdown: number;
  /** The same fall in € millions at the capital base. */
  readonly currentDrawdownAbs: number;
  /** Observations since the last new running maximum. */
  readonly daysUnderwater: number;
  /** `'2026-07-31 16:45 UTC'` — the stamp the toolbar shows. */
  readonly asOf: string;
}

/** One instant of the VaR/CVaR trend. The two travel together, in order. */
export interface VarCvarPoint {
  /** `'2026-07-31'`. */
  readonly date: string;
  readonly var: number;
  /** Never below `var` — the ordering is a property of the pair, not luck. */
  readonly cvar: number;
}

// --- the drawdown path -------------------------------------------------------

/** One observation of the underwater curve. */
export interface UnderwaterPoint {
  /** `'2026-07-31'`. */
  readonly date: string;
  /** `w(x,t)` — uncompounded cumulative return of the held weights, percent. */
  readonly cumulativeReturn: number;
  /** `max_{τ≤t} w(x,τ)` — the running maximum, percent. Never falls. */
  readonly runningMax: number;
  /** `D(x,t) = runningMax − cumulativeReturn`, percent. Zero at a new high. */
  readonly drawdown: number;
  /** The same fall in € millions at the capital base. */
  readonly drawdownAbs: number;
  /** True exactly where `drawdown` is zero — the fund is at a new high. */
  readonly newHigh: boolean;
}

/** One sample of the CDaR curve `Δ_α(x)`. */
export interface CdarPoint {
  readonly alpha: number;
  /** `Δ_α(x)`, percent. Non-decreasing in α. */
  readonly value: number;
  readonly valueAbs: number;
}

/**
 * What the drawdown path adds up to over the period shown.
 *
 * `maxDrawdown` and `averageDrawdown` are the endpoints of `CdarPoint[]`; they
 * are repeated here because the threshold table and the chart footnote both
 * name them, not because they are computed twice.
 */
export interface DrawdownSummary {
  /** `M(x) = max_t D(x,t)`, percent. */
  readonly maxDrawdown: number;
  readonly maxDrawdownAbs: number;
  /** The date the trough was reached. */
  readonly maxDrawdownAt: string;
  /** `A(x) = (1/T)∫ D(x,t) dt`, percent. */
  readonly averageDrawdown: number;
  readonly averageDrawdownAbs: number;
  /** Observations in the open episode — zero when the fund is at a new high. */
  readonly daysUnderwater: number;
  /** The date of the last new running maximum. */
  readonly lastHighAt: string;
  readonly observations: number;
  readonly from: string;
  readonly to: string;
}

// --- the alert thresholds ----------------------------------------------------

export type DrawdownMeasureId = 'maxdd' | 'avdd' | 'cdar';

/** Wireframe order: the two elementary measures, then the family they bound. */
export const DRAWDOWN_MEASURE_ORDER: readonly DrawdownMeasureId[] = ['maxdd', 'avdd', 'cdar'];

export const DRAWDOWN_MEASURE_LABEL: Record<DrawdownMeasureId, string> = {
  maxdd: 'MaxDD',
  avdd: 'AvDD',
  cdar: 'CDaR',
};

export const DRAWDOWN_MEASURE_DEFINITION: Record<DrawdownMeasureId, string> = {
  maxdd: 'The peak of the drawdown function over the period — one episode, the worst fall from a previous high.',
  avdd: 'The time average of the drawdown function over the whole path — every shallow spell counts, not just the worst one.',
  cdar: 'The average of the worst (1−α) of the drawdowns experienced. It interpolates the other two: Δ₀(x) = AvDD and Δ₁(x) = MaxDD.',
};

export type ThresholdStatus = 'ok' | 'warning' | 'breach';

export const THRESHOLD_STATUS_LABEL: Record<ThresholdStatus, string> = {
  ok: 'OK',
  warning: 'Warning',
  breach: 'Breach',
};

/** Word and glyph together — a breach must read as a breach in greyscale. */
export const THRESHOLD_STATUS_ICON: Record<ThresholdStatus, string> = {
  ok: '✓',
  warning: '!',
  breach: '✗',
};

/** Structurally a `StatusTone`; a literal union so the model imports nothing. */
export const THRESHOLD_STATUS_TONE: Record<ThresholdStatus, 'ok' | 'warn' | 'alert'> = {
  ok: 'ok',
  warning: 'warn',
  breach: 'alert',
};

/**
 * A configured drawdown limit, as `ν·C`.
 *
 * `warnAt` is a fraction of the limit, not of `C`: the band at which a measure
 * starts to be watched is set per measure, because MaxDD is one event and AvDD
 * is a whole profile, and a house does not want to hear about them at the same
 * point. Both numbers are configured on the guardrail page; this page reads.
 */
export interface DrawdownLimit {
  readonly measure: DrawdownMeasureId;
  /** ν ∈ [0,1] — the share of `C` the house is willing to lose. */
  readonly nu: number;
  /** Share of the limit at which the row turns Warning. */
  readonly warnAt: number;
}

export const DRAWDOWN_LIMITS: Record<DrawdownMeasureId, DrawdownLimit> = {
  maxdd: { measure: 'maxdd', nu: 0.3, warnAt: 0.6 },
  avdd: { measure: 'avdd', nu: 0.1, warnAt: 0.7 },
  cdar: { measure: 'cdar', nu: 0.14, warnAt: 0.75 },
};

/** One row of the drawdown threshold table. */
export interface DrawdownThresholdRow {
  readonly measure: DrawdownMeasureId;
  /** `'MaxDD'`. */
  readonly label: string;
  /** `'M(x)'`, `'A(x)'`, `'Δ_0.95(x)'` — the CDaR row names its own α. */
  readonly symbol: string;
  /** The α this row was read at; null for the two elementary measures. */
  readonly alpha: number | null;
  /** The current reading, percent. */
  readonly current: number;
  readonly currentAbs: number;
  /** `ν·C` as a percentage of `C`. */
  readonly limit: number;
  readonly limitAbs: number;
  readonly nu: number;
  /** `current / limit`, percent. Unit-free: the same in Abs and in Rel%. */
  readonly utilisation: number;
  /** The configured warning band, as a share of the limit. */
  readonly warnAt: number;
  readonly status: ThresholdStatus;
}

export const LIMITS_READ_ONLY_NOTE =
  'Limits are configured in Guardrail & Kill-Switch · read-only here';

// --- notes -------------------------------------------------------------------

/** What the info icon on the CVaR card opens. It restates, never redefines. */
export const VAR_CVAR_ORDER_NOTE =
  'α_β(w) ≤ φ_β(w) — CVaR averages the losses beyond the VaR threshold, so it can never be the smaller of the two.';

export const CDAR_ENDPOINTS_NOTE = 'Δ₀(x) = AvDD · Δ₁(x) = MaxDD';

/**
 * Daily return observations the historical estimate has to work with.
 *
 * The parametric estimate has no such floor, which is the whole content of the
 * "insufficient history" note: the answer is to change method, not to quietly
 * compute a 99% quantile from two observations.
 */
export const HISTORY_OBSERVATIONS = 252;

/** Fewer tail observations than this and a historical quantile is noise. */
export const MIN_TAIL_OBSERVATIONS = 5;

/**
 * Gap below which VaR and CVaR are called "nearly coincident", as a share of
 * VaR. Nothing is redefined when it trips — the trend chart is annotated.
 */
export const TAIL_COINCIDENCE_THRESHOLD = 0.15;

export const STALE_READINGS_NOTE = 'stale data';

export const LOAD_FAILURE_MESSAGE =
  'Could not compute the risk measures for the selected portfolio.';

export const LOAD_FAILURE_DETAIL =
  'The readings below are the last ones computed successfully and may no longer reflect the held weights.';

export const EMPTY_MESSAGE = 'Select a portfolio to see its risk dashboard.';

// --- exits -------------------------------------------------------------------

export interface RelatedPage {
  readonly label: string;
  readonly route: string;
}

/** The sister pages of the Risk section, on the same held portfolio. */
export const RISK_MONITORING_RELATED_PAGES: readonly RelatedPage[] = [
  { label: 'Open Risk Attribution', route: '/risk/risk-attribution' },
  { label: 'Open Stress Testing', route: '/risk/stress-testing' },
  { label: 'Open Turbulence', route: '/risk/turbulence-systemic' },
];
