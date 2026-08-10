import { Injectable, computed, signal } from '@angular/core';

import {
  ATTRIBUTION_MEASURE_LABEL,
  ATTRIBUTION_METHOD_LABEL,
  CONFIDENCE_DISABLED_REASON,
  ESTIMATION_APPROACH_DISABLED_REASON,
  ESTIMATION_APPROACH_LABEL,
  HIGH_UNCERTAINTY_NOTE,
  LOSS_CONTRIBUTION_NOTE,
  MEASURE_SUBADDITIVE,
  MEASURE_SUBADDITIVITY_NOTE,
  MEASURE_USES_CONFIDENCE,
  MEASURE_USES_ESTIMATION_APPROACH,
  STALE_SNAPSHOT_NOTE,
  type AttributionConfidence,
  type AttributionEmptyReason,
  type AttributionError,
  type AttributionGrouping,
  type AttributionMeasure,
  type AttributionMethod,
  type AttributionParameter,
  type AttributionSnapshot,
  type AttributionTotals,
  type ComponentContribution,
  type ComponentDetail,
  type DisplayUnit,
  type EstimationApproach,
  type FactorRiskImpact,
  type FactorView,
  type MarginalDiEntry,
} from '../models/risk-attribution.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const RECOMPUTE_MS = 700;

/**
 * The account value the `%` display divides by.
 *
 * A risk figure over NAV is the reading a portfolio manager already has a feel
 * for — 13.9% is a book's volatility. Dividing by EC instead would print
 * "138.9%" against the stand-alone total, which is 1/DI wearing a percent sign.
 */
const NET_ASSET_VALUE = 30_000_000;

/**
 * `ρ(X)` at the base parameters — volatility, latest snapshot — in account
 * currency. Every other combination is this figure times the multipliers below.
 */
const BASE_ECONOMIC_CAPITAL = 4_182_300;

/** `E[X]`. Independent of the measure: only the denominator of RORAC moves. */
const EXPECTED_PNL = 409_865;

/** Tail observations a contribution estimate needs before it is trusted. */
const MIN_TAIL_OBSERVATIONS = 50;

const RESIDUAL_FACTOR_ID = 'residual';

// ---------------------------------------------------------------------------
// Mock book
// ---------------------------------------------------------------------------

/**
 * One line of a book, before the toolbar's parameters are applied.
 *
 * `contribution` is a **shape**, not a figure: the service normalises each
 * book's column to shares of one, so only the ratios within a book matter. The
 * asset book is nevertheless written in account currency at the base
 * parameters, so the worked example in the page spec reads straight off the
 * source rather than having to be reconstructed from percentages.
 *
 * `standAlone` is account currency at the base parameters and is scaled, never
 * normalised — the whole point of `Σ ρ(X_i)` is that it does not equal `ρ(X)`.
 *
 * The one rule the data must obey is `|contribution| ≤ standAlone` within a
 * book: it is Cauchy-Schwarz, and every invariant the page states follows from
 * it. See `buildRows` for the algebra.
 */
interface ComponentSeed {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weight: number;
  readonly contribution: number;
  readonly standAlone: number;
  /** Shape of `μ_i`, normalised to `EXPECTED_PNL` across the book. */
  readonly expectedPnl: number;
}

/**
 * 26 positions — the equity cluster the page's concentration story is about,
 * two hedges (long-duration Treasuries and gold, both with a negative Euler
 * contribution), and a cash leg that consumes no risk capital at all and so has
 * neither a RORAC nor a marginal diversification index.
 *
 * The three columns were solved so that `Σ contribution = 4,182,300`,
 * `Σ standAlone = 5,808,800` and `Σ expectedPnl = 409,865` exactly, which is
 * what makes the page spec's TOTAL row, its DI of 0.72 and its +28.0%
 * diversification benefit come out of the data rather than being asserted
 * beside it.
 */
// prettier-ignore
const ASSET_BOOK: readonly ComponentSeed[] = [
  { id: 'AAPL', name: 'AAPL', description: 'Apple Inc.', weight: 0.082, contribution: 421_300, standAlone: 612_000, expectedPnl: 59_825 },
  { id: 'MSFT', name: 'MSFT', description: 'Microsoft Corp.', weight: 0.075, contribution: 402_100, standAlone: 588_000, expectedPnl: 51_871 },
  { id: 'NVDA', name: 'NVDA', description: 'NVIDIA Corp.', weight: 0.062, contribution: 496_500, standAlone: 542_500, expectedPnl: 49_631 },
  { id: 'AMZN', name: 'AMZN', description: 'Amazon.com Inc.', weight: 0.047, contribution: 328_900, standAlone: 369_500, expectedPnl: 27_216 },
  { id: 'GOOGL', name: 'GOOGL', description: 'Alphabet Inc. Class A', weight: 0.044, contribution: 279_200, standAlone: 318_400, expectedPnl: 24_014 },
  { id: 'META', name: 'META', description: 'Meta Platforms Inc.', weight: 0.033, contribution: 251_800, standAlone: 283_000, expectedPnl: 20_812 },
  { id: 'AVGO', name: 'AVGO', description: 'Broadcom Inc.', weight: 0.027, contribution: 212_800, standAlone: 235_800, expectedPnl: 17_610 },
  { id: 'TSM', name: 'TSM', description: 'Taiwan Semiconductor', weight: 0.025, contribution: 199_300, standAlone: 224_000, expectedPnl: 16_009 },
  { id: 'ASML', name: 'ASML', description: 'ASML Holding NV', weight: 0.022, contribution: 163_000, standAlone: 188_700, expectedPnl: 12_808 },
  { id: 'LLY', name: 'LLY', description: 'Eli Lilly & Co.', weight: 0.029, contribution: 148_300, standAlone: 196_500, expectedPnl: 13_608 },
  { id: 'TLT', name: 'TLT', description: 'iShares 20+ Year Treasury', weight: 0.12, contribution: -31_500, standAlone: 210_000, expectedPnl: 4_200 },
  { id: 'UNH', name: 'UNH', description: 'UnitedHealth Group', weight: 0.025, contribution: 119_400, standAlone: 161_200, expectedPnl: 9_606 },
  { id: 'JPM', name: 'JPM', description: 'JPMorgan Chase & Co.', weight: 0.037, contribution: 186_800, standAlone: 216_200, expectedPnl: 15_209 },
  { id: 'V', name: 'V', description: 'Visa Inc.', weight: 0.031, contribution: 143_800, standAlone: 169_000, expectedPnl: 11_207 },
  { id: 'BRK.B', name: 'BRK.B', description: 'Berkshire Hathaway B', weight: 0.034, contribution: 138_300, standAlone: 165_100, expectedPnl: 10_406 },
  { id: 'XOM', name: 'XOM', description: 'Exxon Mobil Corp.', weight: 0.029, contribution: 117_000, standAlone: 161_200, expectedPnl: 8_805 },
  { id: 'PG', name: 'PG', description: 'Procter & Gamble Co.', weight: 0.025, contribution: 75_000, standAlone: 110_100, expectedPnl: 5_603 },
  { id: 'HD', name: 'HD', description: 'Home Depot Inc.', weight: 0.023, contribution: 105_400, standAlone: 125_800, expectedPnl: 7_204 },
  { id: 'SAP', name: 'SAP', description: 'SAP SE', weight: 0.02, contribution: 87_500, standAlone: 106_100, expectedPnl: 6_404 },
  { id: 'NESN', name: 'NESN', description: 'Nestlé SA', weight: 0.018, contribution: 53_600, standAlone: 82_500, expectedPnl: 4_002 },
  { id: 'TM', name: 'TM', description: 'Toyota Motor Corp.', weight: 0.017, contribution: 61_500, standAlone: 90_400, expectedPnl: 4_803 },
  { id: 'IEF', name: 'IEF', description: 'iShares 7-10 Year Treasury', weight: 0.049, contribution: 61_400, standAlone: 129_700, expectedPnl: 6_404 },
  { id: 'LQD', name: 'LQD', description: 'iShares IG Corporate Bond', weight: 0.039, contribution: 86_600, standAlone: 121_800, expectedPnl: 7_204 },
  { id: 'VNQ', name: 'VNQ', description: 'Vanguard Real Estate', weight: 0.022, contribution: 92_700, standAlone: 116_300, expectedPnl: 6_404 },
  { id: 'GLD', name: 'GLD', description: 'SPDR Gold Shares', weight: 0.035, contribution: -18_400, standAlone: 285_000, expectedPnl: 9_000 },
  { id: 'CASH', name: 'CASH', description: 'USD cash', weight: 0.03, contribution: 0, standAlone: 0, expectedPnl: 0 },
];

/**
 * The same book decomposed onto its systematic factors plus the orthogonal
 * remainder.
 *
 * The contribution shape is 62 / 21 / 9 / 8 — which is exactly the factor
 * risk-impact ranking the page draws, because `RI_ρ(L|S)` *is* the Euler share
 * of `E[L|S]`. The panel therefore reads these rows rather than carrying a
 * second set of percentages that could disagree with the table.
 */
const FACTOR_BOOK: readonly ComponentSeed[] = [
  {
    id: 'equity-beta',
    name: 'Equity beta',
    description: 'Broad equity market exposure',
    weight: 0.55,
    contribution: 62,
    standAlone: 3_300_000,
    expectedPnl: 72,
  },
  {
    id: 'rates',
    name: 'Rates',
    description: 'Level and slope of the nominal curve',
    weight: 0.24,
    contribution: 21,
    standAlone: 1_050_000,
    expectedPnl: 10,
  },
  {
    id: 'credit',
    name: 'Credit spread',
    description: 'Investment-grade spread over Treasuries',
    weight: 0.13,
    contribution: 9,
    standAlone: 460_000,
    expectedPnl: 10,
  },
  {
    id: RESIDUAL_FACTOR_ID,
    name: 'Residual',
    description: 'Orthogonal complement — not explained by the factors above',
    weight: 0.08,
    contribution: 8,
    standAlone: 400_000,
    expectedPnl: 8,
  },
];

/**
 * The book by mandate sleeve.
 *
 * The rates sleeve nets to a negative contribution: it is the book's duration
 * hedge, so the hedge edge case survives a change of grouping.
 */
const SUB_PORTFOLIO_BOOK: readonly ComponentSeed[] = [
  {
    id: 'us-equity',
    name: 'US equity',
    description: 'Large-cap US equity sleeve',
    weight: 0.465,
    contribution: 60.9,
    standAlone: 3_120_000,
    expectedPnl: 60,
  },
  {
    id: 'intl-equity',
    name: 'International equity',
    description: 'Developed ex-US equity sleeve',
    weight: 0.175,
    contribution: 19.5,
    standAlone: 1_180_000,
    expectedPnl: 20,
  },
  {
    id: 'rates',
    name: 'Rates',
    description: 'Government duration sleeve',
    weight: 0.155,
    contribution: -1.2,
    standAlone: 275_000,
    expectedPnl: 5,
  },
  {
    id: 'credit',
    name: 'Credit',
    description: 'Investment-grade credit sleeve',
    weight: 0.09,
    contribution: 8.5,
    standAlone: 480_000,
    expectedPnl: 9,
  },
  {
    id: 'real-assets',
    name: 'Real assets',
    description: 'Listed real estate and gold',
    weight: 0.085,
    contribution: 12.3,
    standAlone: 690_000,
    expectedPnl: 6,
  },
  {
    id: 'cash',
    name: 'Cash',
    description: 'USD cash and equivalents',
    weight: 0.03,
    contribution: 0,
    standAlone: 0,
    expectedPnl: 0,
  },
];

/**
 * A book of one name.
 *
 * Its stand-alone risk *is* the portfolio's, so `DI = 1` and there is nothing
 * to decompose. The page's second empty cause — fewer than two components —
 * would otherwise be unreachable and its copy unread.
 */
const SINGLE_NAME_BOOK: readonly ComponentSeed[] = [
  {
    id: 'AAPL',
    name: 'AAPL',
    description: 'Apple Inc.',
    weight: 1,
    contribution: 1,
    standAlone: BASE_ECONOMIC_CAPITAL,
    expectedPnl: 1,
  },
];

export const CORE_PORTFOLIO_ID = 'core-multi-asset';
export const SINGLE_NAME_PORTFOLIO_ID = 'single-name';

interface PortfolioBooks {
  readonly id: string;
  readonly name: string;
  readonly books: Record<AttributionGrouping, readonly ComponentSeed[]>;
}

const PORTFOLIOS: readonly PortfolioBooks[] = [
  {
    id: CORE_PORTFOLIO_ID,
    name: 'Core multi-asset',
    books: {
      asset: ASSET_BOOK,
      factor: FACTOR_BOOK,
      'sub-portfolio': SUB_PORTFOLIO_BOOK,
    },
  },
  {
    id: SINGLE_NAME_PORTFOLIO_ID,
    name: 'Single name',
    books: {
      asset: SINGLE_NAME_BOOK,
      factor: SINGLE_NAME_BOOK,
      'sub-portfolio': SINGLE_NAME_BOOK,
    },
  },
];

/** How the FactorRiskImpactPanel rolls its factors up, on its own control. */
const FACTOR_GROUPS: readonly { id: string; name: string; members: readonly string[] }[] = [
  { id: 'market', name: 'Market', members: ['equity-beta'] },
  { id: 'fixed-income', name: 'Fixed income', members: ['rates', 'credit'] },
  { id: RESIDUAL_FACTOR_ID, name: 'Residual', members: [RESIDUAL_FACTOR_ID] },
];

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

interface SnapshotSeed extends AttributionSnapshot {
  /** Multiplies EC. */
  readonly ecScale: number;
  /** Multiplies every stand-alone risk. Its ratio to `ecScale` moves DI. */
  readonly standAloneScale: number;
}

const SNAPSHOTS: readonly SnapshotSeed[] = [
  {
    id: '2026-07-31',
    at: '2026-07-31',
    label: 'Latest — 2026-07-31',
    latest: true,
    sampleSize: 1260,
    ecScale: 1,
    standAloneScale: 1,
  },
  {
    id: '2026-06-30',
    at: '2026-06-30',
    label: '2026-06-30',
    latest: false,
    sampleSize: 1260,
    ecScale: 0.94,
    standAloneScale: 0.96,
  },
  {
    id: '2026-03-31',
    at: '2026-03-31',
    label: '2026-03-31',
    latest: false,
    sampleSize: 780,
    ecScale: 1.12,
    standAloneScale: 1.1,
  },
];

// ---------------------------------------------------------------------------
// Measure scaling
// ---------------------------------------------------------------------------

/**
 * `ρ(X)` relative to `σ(X)` for the selected measure and confidence.
 *
 * Under joint normality the tail measures are multiples of the volatility:
 * `VaR_α = z_α σ` and `ES_α = φ(z_α)/(1-α) · σ`. Using the Gaussian constants
 * keeps the ordering the theory requires — `σ < VaR_α < ES_α` at every α, and
 * both rising with α — without pretending the mock has a sample behind it.
 */
const MEASURE_MULTIPLIER: Record<AttributionMeasure, Record<AttributionConfidence, number>> = {
  volatility: { 90: 1, 95: 1, 99: 1 },
  var: { 90: 1.2816, 95: 1.6449, 99: 2.3263 },
  es: { 90: 1.755, 95: 2.0627, 99: 2.6652 },
};

/**
 * How much *less* the stand-alone risks scale than EC does under a tail
 * measure.
 *
 * Dependence strengthens in the tail, so a tail measure sees less
 * diversification than volatility does and DI rises. The factor is deliberately
 * close to one: `DI = DI_σ · (snapshot ec/standAlone) / tailFactor` must stay at
 * or below 1 for every reachable combination, and so must every component's
 * marginal DI.
 */
const TAIL_FACTOR: Record<AttributionMeasure, number> = {
  volatility: 1,
  var: 0.98,
  es: 0.97,
};

/** The kernel estimator sees the empirical tail; Cornish-Fisher smooths it. */
const APPROACH_MULTIPLIER: Record<EstimationApproach, number> = {
  empirical: 1.06,
  parametric: 1,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * The decomposition of `EC = ρ(X)` into per-component contributions, and the
 * three figures every panel on the page — and doc 17's guardrail cards — read
 * instead of computing their own.
 *
 * Everything below `rows` is a `computed()`. That is the property the page's
 * whole claim rests on: `economicCapital` is literally the TOTAL row's Euler
 * figure and `portfolioDi` is literally that figure over the TOTAL row's
 * stand-alone figure, so the KeyMetricsRow, the chart's two reference numbers,
 * the table's totals and the detail panel cannot disagree about the same
 * quantity.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the loading and error states in
 * the page spec actually reachable.
 */
@Injectable({ providedIn: 'root' })
export class RiskAttributionService {
  // --- scope ----------------------------------------------------------------

  readonly portfolios = PORTFOLIOS.map((p) => ({ id: p.id, name: p.name }));

  private readonly _portfolioId = signal<string | null>(CORE_PORTFOLIO_ID);
  readonly portfolioId = this._portfolioId.asReadonly();

  /** The account value the `%` display divides by. */
  readonly netAssetValue = signal(NET_ASSET_VALUE).asReadonly();

  /**
   * Re-points the page at another book, or at none.
   *
   * `null` models an empty ScopeSwitcher. The selection is dropped with it: a
   * component id from the previous book would silently match nothing.
   */
  selectPortfolio(id: string | null): void {
    this._portfolioId.set(id);
    this._selectedComponentId.set(null);
  }

  // --- toolbar parameters ---------------------------------------------------
  //
  // Read-only, with an async setter each, because changing any of them is a
  // recompute the spec requires a loading state for. The two display-only
  // controls below are plain writable signals for the mirror-image reason:
  // there is no path from either of them into `recompute`, so "the $/% switch
  // formats without recalculating" is structural rather than a promise.

  private readonly _measure = signal<AttributionMeasure>('volatility');
  readonly measure = this._measure.asReadonly();

  private readonly _confidence = signal<AttributionConfidence>(95);
  readonly confidence = this._confidence.asReadonly();

  private readonly _method = signal<AttributionMethod>('euler');
  readonly method = this._method.asReadonly();

  private readonly _approach = signal<EstimationApproach>('empirical');
  readonly approach = this._approach.asReadonly();

  private readonly _grouping = signal<AttributionGrouping>('asset');
  readonly grouping = this._grouping.asReadonly();

  readonly snapshots: readonly AttributionSnapshot[] = SNAPSHOTS;

  private readonly _snapshotId = signal<string>(SNAPSHOTS[0].id);
  readonly snapshotId = this._snapshotId.asReadonly();

  private readonly snapshotSeed = computed<SnapshotSeed>(
    () => SNAPSHOTS.find((s) => s.id === this._snapshotId()) ?? SNAPSHOTS[0],
  );

  /** The `as of` reading on screen. The scale factors stay private to the mock. */
  readonly snapshot = computed<AttributionSnapshot>(() => this.snapshotSeed());

  /** Formatting only. Never recomputes — see the note above. */
  readonly displayUnit = signal<DisplayUnit>('currency');

  /** Filters the table only. The chart and the totals stay whole-book. */
  readonly search = signal('');

  /** The FactorRiskImpactPanel's own roll-up, independent of the toolbar. */
  readonly factorView = signal<FactorView>('factor');

  async setMeasure(value: AttributionMeasure): Promise<void> {
    if (value === this._measure()) return;
    this._measure.set(value);
    await this.recompute(false, 'measure');
  }

  async setConfidence(value: AttributionConfidence): Promise<void> {
    if (value === this._confidence()) return;
    this._confidence.set(value);
    await this.recompute(false, 'confidence');
  }

  async setMethod(value: AttributionMethod): Promise<void> {
    if (value === this._method()) return;
    this._method.set(value);
    await this.recompute(false, 'method');
  }

  async setApproach(value: EstimationApproach): Promise<void> {
    if (value === this._approach()) return;
    this._approach.set(value);
    await this.recompute(false, 'approach');
  }

  async setGrouping(value: AttributionGrouping): Promise<void> {
    if (value === this._grouping()) return;
    this._grouping.set(value);
    // A component id is only meaningful within one grouping.
    this._selectedComponentId.set(null);
    await this.recompute(false, 'grouping');
  }

  async setSnapshot(id: string): Promise<void> {
    if (id === this._snapshotId() || !SNAPSHOTS.some((s) => s.id === id)) return;
    this._snapshotId.set(id);
    await this.recompute(false, 'snapshot');
  }

  // --- what the toolbar's parameters mean for each other ---------------------

  readonly confidenceEnabled = computed(() => MEASURE_USES_CONFIDENCE[this._measure()]);

  readonly confidenceDisabledReason = computed<string | null>(() =>
    this.confidenceEnabled() ? null : CONFIDENCE_DISABLED_REASON,
  );

  readonly approachEnabled = computed(() => MEASURE_USES_ESTIMATION_APPROACH[this._measure()]);

  readonly approachDisabledReason = computed<string | null>(() =>
    this.approachEnabled() ? null : ESTIMATION_APPROACH_DISABLED_REASON,
  );

  readonly measureIsSubadditive = computed(() => MEASURE_SUBADDITIVE[this._measure()]);

  /**
   * Why the Euler bound holds — or, under VaR, why it need not.
   *
   * VaR is homogeneous of degree one and co-monotonic additive but not
   * sub-additive, so `Σ stand-alone < EC` under VaR is a concentration finding
   * rather than a corrupt snapshot. The page picks its badge copy from here
   * instead of assuming every measure behaves like volatility.
   */
  readonly measureSubadditivityNote = computed(() => MEASURE_SUBADDITIVITY_NOTE[this._measure()]);

  /** Observations the tail would need at this α before the estimate is stable. */
  readonly requiredSampleSize = computed(() =>
    this.confidenceEnabled()
      ? Math.round(MIN_TAIL_OBSERVATIONS / (1 - this._confidence() / 100))
      : 0,
  );

  /**
   * Derived, not stored: a flag beside a sample size that could contradict it
   * is worse than no flag.
   */
  readonly estimateUncertain = computed(
    () => this.confidenceEnabled() && this.snapshot().sampleSize < this.requiredSampleSize(),
  );

  readonly estimateUncertainNote = computed<string | null>(() =>
    this.estimateUncertain() ? HIGH_UNCERTAINTY_NOTE : null,
  );

  readonly snapshotStale = computed(() => !this.snapshot().latest);

  readonly snapshotStaleNote = computed<string | null>(() =>
    this.snapshotStale() ? STALE_SNAPSHOT_NOTE : null,
  );

  /**
   * `'Volatility · Euler'`, `'ES · 95% · Euler'`, `'VaR · 99% · Empirical · Euler'`.
   *
   * Confidence and estimation approach are omitted where they do not apply:
   * printing "95%" beside a volatility figure would name a quantile that was
   * never taken.
   */
  readonly parameterSummary = computed(() => {
    const parts = [ATTRIBUTION_MEASURE_LABEL[this._measure()]];
    if (this.confidenceEnabled()) parts.push(`${this._confidence()}%`);
    if (this.approachEnabled()) parts.push(ESTIMATION_APPROACH_LABEL[this._approach()]);
    parts.push(ATTRIBUTION_METHOD_LABEL[this._method()]);
    return parts.join(' · ');
  });

  // --- the decomposition ----------------------------------------------------

  /** `ρ(X)` before it is split — the target the shares are scaled onto. */
  private readonly economicCapitalTarget = computed(() => {
    const measure = this._measure();
    const measureMultiplier = MEASURE_MULTIPLIER[measure][this._confidence()];
    return (
      BASE_ECONOMIC_CAPITAL *
      measureMultiplier *
      this.approachMultiplier() *
      this.snapshotSeed().ecScale
    );
  });

  private readonly approachMultiplier = computed(() =>
    this.approachEnabled() ? APPROACH_MULTIPLIER[this._approach()] : 1,
  );

  /** What every seed's stand-alone risk is multiplied by. */
  private readonly standAloneScale = computed(() => {
    const measure = this._measure();
    const measureMultiplier = MEASURE_MULTIPLIER[measure][this._confidence()];
    return (
      measureMultiplier *
      this.approachMultiplier() *
      TAIL_FACTOR[measure] *
      this.snapshotSeed().standAloneScale
    );
  });

  /** The rows for the active grouping. */
  readonly rows = computed<readonly ComponentContribution[]>(() =>
    this.buildRows(this._grouping()),
  );

  /**
   * The factor decomposition, whichever grouping is on screen.
   *
   * When the toolbar is already grouping by factor this *is* `rows()`, so the
   * panel and the table are the same objects rather than two computations that
   * happen to agree today.
   */
  private readonly factorRows = computed<readonly ComponentContribution[]>(() =>
    this._grouping() === 'factor' ? this.rows() : this.buildRows('factor'),
  );

  /** Search filters the table. It does not touch the book or its totals. */
  readonly visibleRows = computed<readonly ComponentContribution[]>(() => {
    const needle = this.search().trim().toLowerCase();
    if (!needle) return this.rows();
    return this.rows().filter(
      (r) =>
        r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle),
    );
  });

  /**
   * The chart's bar order — largest Euler contribution first.
   *
   * Ordered by the Euler figure whichever method the table shows: the page
   * spec's interaction list gives the method control the table column, the
   * KeyMetricsRow badge and the detail panel message, and leaves the chart as
   * the Euler contribution chart.
   */
  readonly rankedRows = computed<readonly ComponentContribution[]>(() =>
    [...this.rows()].sort((a, b) => b.euler - a.euler),
  );

  /**
   * The TOTAL row — and the only place these sums are taken.
   *
   * `euler` is EC and `standAlone` is `Σ ρ(X_i)`; every figure the page prints
   * about the book as a whole is one of these two or a ratio of them.
   */
  readonly totals = computed<AttributionTotals>(() => {
    const rows = this.rows();
    let weight = 0;
    let standAlone = 0;
    let marginal = 0;
    let euler = 0;
    let contribution = 0;
    let expectedPnl = 0;
    for (const row of rows) {
      weight += row.weight;
      standAlone += row.standAlone;
      marginal += row.marginal;
      euler += row.euler;
      contribution += row.contribution;
      expectedPnl += row.expectedPnl;
    }
    return {
      weight,
      standAlone,
      marginal,
      euler,
      contribution,
      contributionShare: euler === 0 ? 0 : contribution / euler,
      rorac: euler > 0 ? expectedPnl / euler : null,
    };
  });

  /** `EC = ρ(X)`. The TOTAL row's Euler figure, not a second sum of the rows. */
  readonly economicCapital = computed(() => this.totals().euler);

  /** `Σ ρ(X_i)`. The denominator of the diversification index. */
  readonly sumStandAlone = computed(() => this.totals().standAlone);

  /** `Σ ρ_marg(X_i|X)`. Strictly below EC for a sub-additive measure. */
  readonly sumMarginal = computed(() => this.totals().marginal);

  /** `Σ` of the active method's column — EC under Euler, less under Marginal. */
  readonly contributionSum = computed(() => this.totals().contribution);

  /**
   * How much of EC the active method's contributions account for.
   *
   * Exactly 1 under Euler. Under Marginal it is below 1 and stays there: the
   * with-without figures are never rescaled, because rescaling them destroys
   * the RORAC compatibility that is the reason to attribute at all.
   */
  readonly contributionCoverage = computed(() => this.totals().contributionShare);

  /** A property of the numbers, read off them rather than asserted. */
  readonly fullAllocation = computed(() => Math.abs(this.contributionCoverage() - 1) < 1e-9);

  /** `DI_ρ(X) = ρ(X) / Σ ρ(X_i)`. */
  readonly portfolioDi = computed(() => {
    const totals = this.totals();
    return totals.standAlone === 0 ? 0 : totals.euler / totals.standAlone;
  });

  /** `1 − DI_ρ(X)`. The chart's second reference number. */
  readonly diversificationBenefit = computed(() => 1 - this.portfolioDi());

  /** `E[X] / ρ(X)`. */
  readonly portfolioRorac = computed(() => this.totals().rorac);

  /**
   * `DI_ρ(X_i|X)` per component, in the shape doc 17's guardrail grid consumes.
   *
   * Doc 17 imports this rather than mocking its own list, so the two pages
   * cannot print two different diversification stories about one book.
   */
  readonly marginalDiByComponent = computed<readonly MarginalDiEntry[]>(() =>
    this.rows().map((r) => ({
      id: r.id,
      name: r.name,
      marginalDi: r.marginalDi,
      hedge: r.hedge,
    })),
  );

  // --- factor risk impact ---------------------------------------------------

  /**
   * `RI_ρ(L|S)` per factor, with the residual last.
   *
   * These are the Euler shares of the factor decomposition — the same numbers
   * the table shows when Group by is Factor, not a parallel set of percentages.
   */
  readonly factorImpacts = computed<readonly FactorRiskImpact[]>(() => {
    const rows = this.factorRows();
    if (this.factorView() === 'factor') {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        impact: r.eulerShare,
        residual: r.id === RESIDUAL_FACTOR_ID,
      }));
    }
    return FACTOR_GROUPS.map((group) => ({
      id: group.id,
      name: group.name,
      impact: rows
        .filter((r) => group.members.includes(r.id))
        .reduce((total, r) => total + r.eulerShare, 0),
      residual: group.members.includes(RESIDUAL_FACTOR_ID),
    }));
  });

  // --- selection ------------------------------------------------------------

  private readonly _selectedComponentId = signal<string | null>(null);
  readonly selectedComponentId = this._selectedComponentId.asReadonly();

  readonly selectedComponent = computed<ComponentContribution | null>(() => {
    const id = this._selectedComponentId();
    if (id === null) return null;
    return this.rows().find((r) => r.id === id) ?? null;
  });

  /** Everything the slide-over compares, all of it read off the selected row. */
  readonly selectedDetail = computed<ComponentDetail | null>(() => {
    const component = this.selectedComponent();
    if (!component) return null;
    const portfolioRorac = this.portfolioRorac();
    return {
      component,
      title: `${component.name} · ${this.parameterSummary()}`,
      portfolioRorac,
      roracVsPortfolio: compareRorac(component.rorac, portfolioRorac),
      betaToPortfolio: component.eulerShare,
      lossNote: LOSS_CONTRIBUTION_NOTE,
    };
  });

  /** Shared by the table row and the chart bar. Unknown ids are refused. */
  selectComponent(id: string | null): void {
    if (id === null) {
      this._selectedComponentId.set(null);
      return;
    }
    if (this.rows().some((r) => r.id === id)) this._selectedComponentId.set(id);
  }

  private readonly _highlightedComponentId = signal<string | null>(null);

  /**
   * The component the pointer — or the keyboard — is currently over.
   *
   * The spec's chart region asks for hover *and* click to be synchronised
   * between the bars and the table, so this is a second, transient selection
   * that both views read. It lives here rather than in either of them for the
   * same reason the real selection does: two copies of "which row is under the
   * cursor" would highlight two different rows. Keyboard focus writes to it as
   * well, so the link is not pointer-only.
   */
  readonly highlightedComponentId = this._highlightedComponentId.asReadonly();

  highlightComponent(id: string | null): void {
    if (id !== null && !this.rows().some((r) => r.id === id)) return;
    this._highlightedComponentId.set(id);
  }

  // --- lifecycle ------------------------------------------------------------

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _pendingParameter = signal<AttributionParameter | null>(null);
  /** Which toolbar control carries the inline spinner while the page recomputes. */
  readonly pendingParameter = this._pendingParameter.asReadonly();

  private readonly _error = signal<AttributionError | null>(null);
  readonly error = this._error.asReadonly();

  /**
   * Why there is nothing to show.
   *
   * Attribution decomposes a sum, so a one-name book is not a small book — it
   * is a different situation, with a different next step, from no portfolio
   * being selected at all.
   */
  readonly emptyReason = computed<AttributionEmptyReason | null>(() => {
    if (this._portfolioId() === null) return 'no-portfolio';
    return this.rows().length < 2 ? 'too-few-components' : null;
  });

  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    if (this._error()) return 'error';
    if (this.emptyReason() !== null) return 'empty';
    return 'ready';
  });

  /**
   * Recomputes the decomposition for the current parameters.
   *
   * `parameter` names the control that triggered it so the toolbar can put the
   * spinner on that control alone and leave the rest usable, which is what the
   * page spec asks for; `fail` reaches the error state — a covariance matrix
   * that is not positive definite, a sample too short for the kernel estimate
   * of the VaR contributions, a snapshot that is not there.
   *
   * With no book there is nothing to compute, and a skeleton over an empty
   * state would be a loading indicator for a result that is never coming.
   */
  async recompute(fail = false, parameter: AttributionParameter | null = null): Promise<void> {
    if (this.emptyReason() !== null) return;

    this._pendingParameter.set(parameter);
    this._loading.set(true);
    this._error.set(null);

    await delay(RECOMPUTE_MS);

    this._loading.set(false);
    this._pendingParameter.set(null);

    if (fail) {
      this._error.set({
        message: 'Risk contributions could not be computed for these parameters.',
        detail:
          'The estimated covariance matrix for this snapshot is not positive definite, so the Euler contributions are undefined. Change the snapshot or the estimation approach and try again.',
        parameter,
      });
    }
  }

  clearError(): void {
    this._error.set(null);
  }

  // --- derivation -----------------------------------------------------------

  /**
   * Turns one book's seeds into rows, in two passes.
   *
   * Pass one scales the shares onto `EC` and the stand-alone risks onto the
   * measure. Pass two needs `EC` itself, because the with-without contribution
   * is
   *
   *     ρ_marg(X_i|X) = ρ(X) − ρ(X − X_i)
   *                   = EC − sqrt(EC² − 2·cov(X_i,X)/… + ρ(X_i)²)
   *                   = EC − sqrt(EC² − 2·e_i·EC + s_i²)
   *
   * using `cov(X_i, X) = e_i · EC`, which is what the Euler contribution
   * `e_i = cov(X_i,X)/σ(X)` means. Computing it rather than storing it is what
   * makes the page's three claims true by construction instead of by luck:
   *
   * - `Σ e_i = EC` — the shares sum to one, and EC is defined as their sum.
   * - `ρ_marg,i ≤ e_i` for every i, with equality only at `|e_i| = s_i` —
   *   square the inequality and it reduces to `e_i² ≤ s_i²`, the Cauchy-Schwarz
   *   bound the seed data already satisfies. So `Σ ρ_marg < EC` strictly.
   * - `e_i ≤ s_i`, the sub-additivity bound, is that same seed constraint.
   */
  private buildRows(grouping: AttributionGrouping): readonly ComponentContribution[] {
    const portfolio = PORTFOLIOS.find((p) => p.id === this._portfolioId());
    if (!portfolio) return [];

    const seeds = portfolio.books[grouping];
    if (seeds.length === 0) return [];

    const shareTotal = seeds.reduce((total, s) => total + s.contribution, 0);
    const weightTotal = seeds.reduce((total, s) => total + s.weight, 0);
    const pnlTotal = seeds.reduce((total, s) => total + s.expectedPnl, 0);
    const target = this.economicCapitalTarget();
    const standAloneScale = this.standAloneScale();
    const method = this._method();

    const scaled = seeds.map((seed) => ({
      seed,
      euler: shareTotal === 0 ? 0 : (seed.contribution / shareTotal) * target,
      standAlone: seed.standAlone * standAloneScale,
      weight: weightTotal === 0 ? 0 : seed.weight / weightTotal,
      expectedPnl: pnlTotal === 0 ? 0 : (seed.expectedPnl / pnlTotal) * EXPECTED_PNL,
    }));

    // EC is the sum of the contributions, so the TOTAL row and this figure are
    // the same number by construction rather than by agreement.
    const economicCapital = scaled.reduce((total, row) => total + row.euler, 0);

    return scaled.map(({ seed, euler, standAlone, weight, expectedPnl }) => {
      const marginal = withWithout(economicCapital, euler, standAlone);
      const contribution = method === 'euler' ? euler : marginal;
      return {
        id: seed.id,
        name: seed.name,
        description: seed.description,
        weight,
        standAlone,
        marginal,
        euler,
        eulerShare: economicCapital === 0 ? 0 : euler / economicCapital,
        contribution,
        contributionShare: economicCapital === 0 ? 0 : contribution / economicCapital,
        // A zero or negative contribution consumes no risk capital, so μ_i over
        // it is not a return on anything. Null, so the cell can read '—'.
        rorac: contribution > 0 ? expectedPnl / contribution : null,
        // The marginal diversification index is defined on the Euler
        // contribution (§7), so it does not move when the table switches to the
        // with-without column — doc 17 prints this list too.
        marginalDi: euler > 0 && standAlone > 0 ? euler / standAlone : null,
        hedge: contribution < 0,
        expectedPnl,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Algebra
// ---------------------------------------------------------------------------

/**
 * `ρ(X) − ρ(X − X_i)` for a degree-one measure driven by second moments.
 *
 * `var(X − X_i) = var(X) − 2cov(X_i, X) + var(X_i)`, and `cov(X_i, X)` is the
 * Euler contribution times `ρ(X)`. The radicand is `(EC − e)² + (s² − e²)`,
 * which is non-negative whenever `|e| ≤ s`, so the seed constraint keeps this
 * defined as well as bounded.
 */
function withWithout(economicCapital: number, euler: number, standAlone: number): number {
  const radicand =
    economicCapital * economicCapital - 2 * euler * economicCapital + standAlone * standAlone;
  return economicCapital - Math.sqrt(Math.max(radicand, 0));
}

function compareRorac(
  componentRorac: number | null,
  portfolioRorac: number | null,
): 'above' | 'below' | 'level' | null {
  if (componentRorac === null || portfolioRorac === null) return null;
  if (componentRorac > portfolioRorac) return 'above';
  if (componentRorac < portfolioRorac) return 'below';
  return 'level';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
