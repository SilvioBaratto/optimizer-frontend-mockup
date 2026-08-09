/**
 * TypeScript mirror of the `risk_attribution` domain type — the decomposition
 * of a book's economic capital `EC = ρ(X)` into per-component contributions.
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Two pages read this vocabulary: doc 19 renders the attribution table, the
 * contribution chart and the factor risk-impact panel; doc 17 (Guardrail &
 * Kill-Switch) prints the portfolio diversification index and the per-component
 * marginal DI grid. They share this file — and `services/risk-attribution.service.ts`
 * — because two mock sources for one DI would give two numbers and both specs
 * print the same figure.
 *
 * Interfaces and const maps only. The identities that make the attribution
 * coherent (Euler contributions summing to EC, with-without contributions
 * summing to strictly less, `|contribution| ≤ stand-alone`) are enforced in the
 * service, because a rule that lives in a display map is a convention, not a
 * rule.
 */

// --- the risk measure -------------------------------------------------------

/**
 * The measure `ρ` the capital is measured with.
 *
 * All three are homogeneous of degree one, which is the single property Euler
 * allocation needs: full allocation and RORAC compatibility hold together if
 * and only if `ρ(hX) = hρ(X)`.
 */
export type AttributionMeasure = 'volatility' | 'var' | 'es';

export const ATTRIBUTION_MEASURES: readonly AttributionMeasure[] = ['volatility', 'var', 'es'];

export const ATTRIBUTION_MEASURE_LABEL: Record<AttributionMeasure, string> = {
  volatility: 'Volatility',
  var: 'VaR',
  es: 'ES',
};

/** Printed beside the total in the KeyMetricsRow — `$4,182,300 σ(X)`. */
export const ATTRIBUTION_MEASURE_SYMBOL: Record<AttributionMeasure, string> = {
  volatility: 'σ(X)',
  var: 'VaR_α(X)',
  es: 'ES_α(X)',
};

/**
 * Whether the measure is sub-additive.
 *
 * Volatility and ES are; **VaR is not in general** — it is homogeneous of
 * degree one and co-monotonic additive, but a book can legitimately show
 * `Σ stand-alone < EC` under VaR. That is the classic non-sub-additivity of
 * VaR and a real signal of concentration, not a corrupt snapshot, so a page
 * that labels it "data anomaly" hides a risk finding. Consult this map before
 * choosing the badge copy for `DI > 1`.
 */
export const MEASURE_SUBADDITIVE: Record<AttributionMeasure, boolean> = {
  volatility: true,
  var: false,
  es: true,
};

/** Why the Euler contribution is bounded — or, for VaR, why it need not be. */
export const MEASURE_SUBADDITIVITY_NOTE: Record<AttributionMeasure, string> = {
  volatility:
    'Sub-additive and homogeneous of degree one — Euler contributions never exceed a component’s stand-alone risk, so DI ≤ 1 by construction.',
  var: 'VaR is homogeneous of degree one and co-monotonic additive but not sub-additive in general: Σ stand-alone below EC (DI above 1) is a concentration signal, not a data error.',
  es: 'Sub-additive and homogeneous of degree one — Euler contributions never exceed a component’s stand-alone risk, so DI ≤ 1 by construction.',
};

/** Confidence α, in whole percent. Ignored when the measure is volatility. */
export type AttributionConfidence = 90 | 95 | 99;

export const ATTRIBUTION_CONFIDENCES: readonly AttributionConfidence[] = [90, 95, 99];

/** Volatility has no confidence level at all; the tail measures do. */
export const MEASURE_USES_CONFIDENCE: Record<AttributionMeasure, boolean> = {
  volatility: false,
  var: true,
  es: true,
};

/**
 * Only VaR offers a choice of estimation approach.
 *
 * The naïve empirical estimator fails for VaR because the conditioning event
 * has probability zero, so the contributions come from a Nadaraya-Watson kernel
 * smoother; the parametric alternative is the Cornish-Fisher expansion, which
 * makes VaR an explicit function of the weights. Volatility and ES contributions
 * are consistent empirical estimators either way, so the control is inert there.
 */
export const MEASURE_USES_ESTIMATION_APPROACH: Record<AttributionMeasure, boolean> = {
  volatility: false,
  var: true,
  es: false,
};

export const CONFIDENCE_DISABLED_REASON =
  'Volatility has no confidence level — σ(X) is a moment of the distribution, not a quantile of it.';

export const ESTIMATION_APPROACH_DISABLED_REASON =
  'Estimation approach applies to VaR only — volatility and ES contributions are consistent empirical estimators either way.';

// --- the allocation principle ----------------------------------------------

/**
 * Which allocation principle produces the contribution column.
 *
 * `euler` — `ρ(X_i|X) = ∂f_ρ/∂u_i(1,…,1)`, the unique coherent linear
 * principle (Aumann-Shapley / the gradient principle). Its contributions
 * satisfy the full allocation property exactly.
 *
 * `marginal` — the with-without difference `ρ(X) − ρ(X − X_i)`. For a
 * sub-additive, differentiable, degree-one measure it is always **below** the
 * Euler contribution, so the column sums to strictly less than EC. Rescaling it
 * back to 100% destroys RORAC compatibility, so it is never rescaled here.
 */
export type AttributionMethod = 'euler' | 'marginal';

export const ATTRIBUTION_METHODS: readonly AttributionMethod[] = ['euler', 'marginal'];

export const ATTRIBUTION_METHOD_LABEL: Record<AttributionMethod, string> = {
  euler: 'Euler',
  marginal: 'Marginal',
};

/** The KeyMetricsRow's allocation-rule badge. */
export const ATTRIBUTION_METHOD_BADGE: Record<AttributionMethod, string> = {
  euler: 'Euler (coherent)',
  marginal: 'Marginal (with-without)',
};

export const ATTRIBUTION_METHOD_ICON: Record<AttributionMethod, string> = {
  euler: '=',
  marginal: '<',
};

export const ATTRIBUTION_METHOD_NOTE: Record<AttributionMethod, string> = {
  euler:
    'Full allocation — the contributions sum to EC exactly, by Euler’s theorem for a homogeneous degree-one measure, and are RORAC compatible.',
  marginal:
    'With-without contributions do not satisfy the full allocation property: they sum to less than EC and are shown unrescaled, because forcing them to 100% would make them RORAC incompatible.',
};

/**
 * The header over each contribution column.
 *
 * Both columns are on the table at once — `ρ_marg ≤ ρ_Euler` is a comparison,
 * and a comparison needs both numbers in view — so these are two headers rather
 * than one header that changes with the method. What the method changes is
 * which of the two is *principal*.
 */
export const ATTRIBUTION_METHOD_COLUMN: Record<AttributionMethod, string> = {
  euler: 'Euler contrib.',
  marginal: 'Marginal (w/o)',
};

export type EstimationApproach = 'empirical' | 'parametric';

export const ESTIMATION_APPROACHES: readonly EstimationApproach[] = ['empirical', 'parametric'];

export const ESTIMATION_APPROACH_LABEL: Record<EstimationApproach, string> = {
  empirical: 'Empirical',
  parametric: 'Parametric',
};

export const ESTIMATION_APPROACH_NOTE: Record<EstimationApproach, string> = {
  empirical: 'Nadaraya-Watson kernel estimator, Silverman bandwidth — high variance in the tail.',
  parametric: 'Cornish-Fisher expansion in skewness and excess kurtosis — analytic contributions.',
};

// --- how the book is sliced -------------------------------------------------

export type AttributionGrouping = 'asset' | 'factor' | 'sub-portfolio';

export const ATTRIBUTION_GROUPINGS: readonly AttributionGrouping[] = [
  'asset',
  'factor',
  'sub-portfolio',
];

export const ATTRIBUTION_GROUPING_LABEL: Record<AttributionGrouping, string> = {
  asset: 'Asset',
  factor: 'Factor',
  'sub-portfolio': 'Sub-portfolio',
};

/** The first column's header, which is the thing being attributed to. */
export const ATTRIBUTION_GROUPING_COLUMN: Record<AttributionGrouping, string> = {
  asset: 'Component',
  factor: 'Factor',
  'sub-portfolio': 'Sub-portfolio',
};

/**
 * The second column's header.
 *
 * A factor has no capital weight — what the row carries is the book's exposure
 * to it, and calling that "Weight" would invite adding it to the asset weights.
 */
export const ATTRIBUTION_GROUPING_WEIGHT_COLUMN: Record<AttributionGrouping, string> = {
  asset: 'Weight',
  factor: 'Exposure',
  'sub-portfolio': 'Weight',
};

/** Plural noun for the live count in the filter bar. */
export const ATTRIBUTION_GROUPING_NOUN: Record<AttributionGrouping, string> = {
  asset: 'components',
  factor: 'factors',
  'sub-portfolio': 'sub-portfolios',
};

// --- display ----------------------------------------------------------------

/**
 * `$` or `%` in the toolbar.
 *
 * Formatting only: percentages are the same risk figures over net asset value,
 * so switching must never recompute anything.
 */
export type DisplayUnit = 'currency' | 'percent';

export const DISPLAY_UNITS: readonly DisplayUnit[] = ['currency', 'percent'];

export const DISPLAY_UNIT_LABEL: Record<DisplayUnit, string> = {
  currency: '$',
  percent: '%',
};

/** A negative contribution is a hedge. Icon **and** word — never colour alone. */
export const HEDGE_ICON = '▼';
export const HEDGE_LABEL = 'hedge';
export const HEDGE_NOTE =
  'Negative risk contribution — the position reduces total risk; removing it would raise EC.';

/** Not-applicable cell content. Never an empty cell. */
export const UNDEFINED_CELL = '—';

export const RORAC_UNDEFINED_NOTE =
  'RORAC is undefined for a zero or negative risk contribution — μ_i / ρ(X_i|X) has no meaning when no capital is consumed.';

export const MARGINAL_DI_UNDEFINED_NOTE =
  'The marginal diversification index ρ_Euler(X_i|X) / ρ(X_i) is reported for positive contributions on a risk-bearing component only.';

export const LOSS_CONTRIBUTION_NOTE =
  'For a loss far larger than the sub-optimality terms D_i, the expected contribution to the loss converges on the risk contribution — risk budgeting is loss budgeting.';

// --- snapshots --------------------------------------------------------------

/** One `as of` point the attribution can be computed on. */
export interface AttributionSnapshot {
  readonly id: string;
  /** ISO date of the close the estimate was made on. */
  readonly at: string;
  /** `'Latest — 2026-07-31'`, as the toolbar prints it. */
  readonly label: string;
  readonly latest: boolean;
  /** Observations behind the estimate — what makes a tail estimate credible. */
  readonly sampleSize: number;
}

export const STALE_SNAPSHOT_NOTE =
  'Not the latest snapshot — the book may have been rebalanced since this estimate.';

export const HIGH_UNCERTAINTY_NOTE =
  'High estimation uncertainty — too few observations fall in the tail at this confidence level for a stable contribution estimate.';

// --- rows -------------------------------------------------------------------

/**
 * One row of the attribution table.
 *
 * `euler` and `marginal` are both always present: the toolbar's method picks
 * which one the principal column shows, but the detail panel compares them and
 * the marginal diversification index is defined on the Euler figure whichever
 * method is on screen.
 *
 * Every currency figure is in account currency, not a fraction — the `%` display
 * divides by net asset value at render time.
 */
export interface ComponentContribution {
  readonly id: string;
  /** Short label the table cell and the chart axis carry — `AAPL`, `Rates`. */
  readonly name: string;
  /** Long form for the detail panel and the search index — `Apple Inc.`. */
  readonly description: string;
  /** Fraction of net asset value, or of gross exposure under `factor`. */
  readonly weight: number;
  /** `ρ(X_i)`, the component measured on its own. Never negative. */
  readonly standAlone: number;
  /** `ρ(X) − ρ(X − X_i)`, the with-without contribution. Never above `euler`. */
  readonly marginal: number;
  /** `ρ_Euler(X_i|X)`. Negative for a hedge; never above `standAlone`. */
  readonly euler: number;
  /** `euler / EC`. Also the component's beta to the portfolio. */
  readonly eulerShare: number;
  /** The figure the active method puts in the principal column. */
  readonly contribution: number;
  /** `contribution / EC`. Under `marginal` these do not sum to 1. */
  readonly contributionShare: number;
  /** `μ_i / ρ(X_i|X)`. Null when the contribution is zero or negative. */
  readonly rorac: number | null;
  /** `DI_ρ(X_i|X) = ρ_Euler(X_i|X) / ρ(X_i)`. Null for a hedge or a riskless leg. */
  readonly marginalDi: number | null;
  /** `contribution < 0` — rendered with `HEDGE_ICON` and `HEDGE_LABEL`. */
  readonly hedge: boolean;
  /** `μ_i`, the component's expected P&L. Drives RORAC. */
  readonly expectedPnl: number;
}

/**
 * The TOTAL row.
 *
 * `euler` is EC. Every other panel's total reads this object rather than
 * re-summing the rows, so the chart's reference numbers and the KeyMetricsRow
 * cannot diverge from the table.
 */
export interface AttributionTotals {
  /** Σ weights — 1 for a fully-invested book. */
  readonly weight: number;
  /** Σ ρ(X_i), the denominator of the portfolio diversification index. */
  readonly standAlone: number;
  /** Σ with-without contributions. Strictly below `euler` for a sub-additive ρ. */
  readonly marginal: number;
  /** Σ Euler contributions = EC = ρ(X). */
  readonly euler: number;
  /** Σ of the active method's contributions. */
  readonly contribution: number;
  /** `contribution / euler` — 1 under Euler, below 1 under Marginal. */
  readonly contributionShare: number;
  /** `E[X] / ρ(X)`, the portfolio RORAC. */
  readonly rorac: number | null;
}

/**
 * Everything the slide-over compares for one component.
 *
 * It carries no figure of its own: every number is the row's, so the panel
 * cannot disagree with the line the reader clicked.
 */
export interface ComponentDetail {
  readonly component: ComponentContribution;
  /** `'AAPL · Volatility · Euler'` — the panel heading. */
  readonly title: string;
  /** `E[X] / ρ(X)`, for the "vs portfolio" comparison. */
  readonly portfolioRorac: number | null;
  /** Where the component's RORAC sits. Null when its RORAC is undefined. */
  readonly roracVsPortfolio: 'above' | 'below' | 'level' | null;
  /** `cov(X_i, X) / var(X)` — numerically the Euler share. */
  readonly betaToPortfolio: number;
  /** Why the risk contribution doubles as an expected-loss contribution. */
  readonly lossNote: string;
}

/**
 * A component's marginal diversification index, in the shape doc 17's grid
 * consumes. Doc 17 imports this from `risk-attribution.service` rather than
 * mocking its own list.
 */
export interface MarginalDiEntry {
  readonly id: string;
  readonly name: string;
  readonly marginalDi: number | null;
  readonly hedge: boolean;
}

// --- factor risk impact -----------------------------------------------------

/**
 * `RI_ρ(L|S) = ρ(E[L|S] | L) / ρ(L)` for one systematic factor, plus the
 * residual row for the orthogonal complement.
 *
 * Under the standard-deviation measure this is `var(E[L|S]) / var(L)`, a
 * generalisation of R². The impacts are the Euler shares of the factor
 * decomposition, which is why this panel and the table agree when Group by is
 * set to Factor — they are the same numbers, not two computations of them.
 */
export interface FactorRiskImpact {
  readonly id: string;
  readonly name: string;
  /** Share of total risk, in `[0, 1]`. The rows sum to 1. */
  readonly impact: number;
  /** True for the unexplained remainder. Exactly one row carries it. */
  readonly residual: boolean;
}

/** The FactorRiskImpactPanel's own grouping, independent of the toolbar. */
export type FactorView = 'factor' | 'factor-group';

export const FACTOR_VIEWS: readonly FactorView[] = ['factor', 'factor-group'];

export const FACTOR_VIEW_LABEL: Record<FactorView, string> = {
  factor: 'Factor',
  'factor-group': 'Factor group',
};

// --- selection & lifecycle --------------------------------------------------

/** Which toolbar control triggered the running recompute. */
export type AttributionParameter =
  'measure' | 'confidence' | 'method' | 'approach' | 'grouping' | 'snapshot';

/**
 * Why the content area is empty.
 *
 * Attribution is a decomposition of a sum: it is not defined for a book of one
 * component, and that is a different situation — with a different next step —
 * from no portfolio being selected at all.
 */
export type AttributionEmptyReason = 'no-portfolio' | 'too-few-components';

export const ATTRIBUTION_EMPTY_TITLE: Record<AttributionEmptyReason, string> = {
  'no-portfolio': 'No portfolio selected',
  'too-few-components': 'Attribution needs at least two components',
};

export const ATTRIBUTION_EMPTY_DETAIL: Record<AttributionEmptyReason, string> = {
  'no-portfolio': 'Pick a portfolio in the scope switcher to decompose its economic capital.',
  'too-few-components':
    'A single-name book has nothing to decompose — its whole risk is its own stand-alone risk.',
};

export interface AttributionError {
  readonly message: string;
  readonly detail: string;
  /** The parameter change that failed, when one was in flight. */
  readonly parameter: AttributionParameter | null;
}
