/**
 * TypeScript mirror of the `turbulence` domain type — how unusual today looks
 * and how compact the market's correlation structure has become
 * (`docs/25 Turbulence & Systemic Risk.md`).
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Five facts about the page are encoded in the types rather than left to the
 * code that fills them in:
 *
 * 1. **Two scales, never mixed.** `d_t` is a χ² statistic on `n` degrees of
 *    freedom; `d_t/n` is the multivariate z-score the decomposition is written
 *    in. Every reading carries both, and every threshold carries both, so a
 *    card can never print a normalised value against a raw-scale threshold —
 *    the specific mistake the doc's first blocking review names.
 * 2. **The threshold is a function of the asset count**, not a constant. It is
 *    `χ²_{0.75}(n)`, which is 14.84 at n = 12 (the doc's worked example) and
 *    moves the moment the universe changes size. Nothing here stores it.
 * 3. **Correlation surprise is defined for a pair.** `PairwiseSurprise` names
 *    two assets and cannot be built for one; the panel states the restriction
 *    instead of hiding it. `CS`, and the `min`/`max` it lives between, are all
 *    functions of `(z_x, z_y, ρ)` — the doc's second blocking review exists
 *    because a wireframe printed three numbers that did not satisfy the
 *    formula, so no field here holds a `CS` that was not computed from one.
 * 4. **The compactness family is one spectrum seen five ways.** The absorption
 *    ratio, the PC1 variance share, the effective rank, the Kaiser-Guttman
 *    count and the eigenvalues above `γ₊` are all read off `EigenSpectrum`, so
 *    two panels of this page cannot disagree about the same matrix.
 * 5. **Estimation windows and the display range are different objects.** The
 *    windows are `EstimationWindows`, reported beside the as-of stamp. The
 *    range is `DisplayRange`, which only decides how much of an already
 *    computed series a chart draws.
 *
 * Read-only throughout: this page has no confirm action and nothing
 * destructive.
 */

// --- the universe the indicators are computed on -----------------------------

export type AssetClass = 'equity' | 'rates' | 'credit' | 'fx' | 'real-assets';

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: 'Equity',
  rates: 'Rates',
  credit: 'Credit',
  fx: 'FX',
  'real-assets': 'Real assets',
};

/** One instrument of the universe, as every table and selector names it. */
export interface UniverseAsset {
  /** `'HY_CREDIT'` — the code shown in the tables and the pair selectors. */
  readonly id: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  /** Observations of price history this asset carries, in calendar days. */
  readonly historyDays: number;
}

/** A selectable universe. Its size is what moves the χ² threshold. */
export interface UniverseSummary {
  readonly id: string;
  readonly name: string;
  /** `n` — the degrees of freedom of the χ² threshold. */
  readonly assetCount: number;
}

/** Why the page has nothing to show. Each has a different next step. */
export type TurbulenceEmptyReason = 'no-universe' | 'insufficient-history';

export const TURBULENCE_EMPTY_TITLE: Record<TurbulenceEmptyReason, string> = {
  'no-universe': 'No universe selected',
  'insufficient-history': 'Not enough history to compute the indicators',
};

export const TURBULENCE_EMPTY_DETAIL: Record<TurbulenceEmptyReason, string> = {
  'no-universe': 'Select a universe to see how unusual its current state is.',
  'insufficient-history':
    'The indicators need a complete estimation window: 500 days for the absorption ratio and 100 observations for the correlation structure. This universe is younger than both.',
};

export const TURBULENCE_EMPTY_ACTION = {
  label: 'Open Universe & Data',
  route: '/build/universe-data',
};

// --- the as-of bar -----------------------------------------------------------

/**
 * The estimation windows the readings were computed on.
 *
 * They are reported, never chosen: the toolbar's range control is a display
 * window and has no path to these numbers.
 */
export interface EstimationWindows {
  /** Rolling window of the absorption ratio, in days. */
  readonly absorptionDays: number;
  /** Half-life of the exponential weighting inside that window, in days. */
  readonly absorptionHalfLifeDays: number;
  /** `n` in `AR = Σ_{i≤n} σ²_{E_i} / Σ_j σ²_{A_j}` — about a fifth of `N`. */
  readonly absorptionEigenvectors: number;
  /** `T` — observations of the rolling correlation window. */
  readonly correlationObservations: number;
  /** The same window in days, which is what an asset's history is measured in. */
  readonly correlationDays: number;
}

export interface TurbulenceSnapshot {
  /** `'2026-07-30 16:00 UTC'`. */
  readonly asOf: string;
  /** `n` — the size of the universe the readings describe. */
  readonly assetCount: number;
  readonly windows: EstimationWindows;
  /** Hours since the snapshot was computed. */
  readonly ageHours: number;
  /** How often the snapshot is expected to be refreshed, in hours. */
  readonly cadenceHours: number;
  /** `ageHours > cadenceHours` — the KeyMetricsRow says so beside the stamp. */
  readonly stale: boolean;
  /** `'Snapshot age 18h, within the expected cadence'`. */
  readonly ageNote: string;
}

// --- coverage ----------------------------------------------------------------

/**
 * How much of the universe a panel could actually measure.
 *
 * Reported beside the value, never in place of it: an indicator computed on 21
 * of 24 assets is still a reading, and hiding the panel would lose it.
 */
export interface PanelCoverage {
  /** `N` — assets whose history covers the window this panel needs. */
  readonly covered: number;
  /** `M` — assets in the universe. */
  readonly total: number;
  readonly partial: boolean;
  /** `'Partial coverage — 21/24 assets'`, or null when the cover is complete. */
  readonly label: string | null;
}

export const PARTIAL_COVERAGE_ICON = '◑';

// --- the panels --------------------------------------------------------------

/**
 * The panels that compute independently.
 *
 * One failed computation must not blank its neighbours, so an error is held
 * against the panel that raised it rather than against the page.
 */
export type TurbulencePanelId =
  | 'turbulence'
  | 'pairwise'
  | 'contributors'
  | 'absorption'
  | 'effective-rank'
  | 'pc1-growth'
  | 'spectrum'
  | 'participation'
  | 'pc1-contribution';

export const TURBULENCE_PANELS: readonly TurbulencePanelId[] = [
  'turbulence',
  'pairwise',
  'contributors',
  'absorption',
  'effective-rank',
  'pc1-growth',
  'spectrum',
  'participation',
  'pc1-contribution',
];

export const TURBULENCE_PANEL_LABEL: Record<TurbulencePanelId, string> = {
  turbulence: 'Turbulence & decomposition',
  pairwise: 'Correlation surprise — pairwise inspector',
  contributors: 'Top contributors',
  absorption: 'Absorption ratio',
  'effective-rank': 'Effective rank',
  'pc1-growth': 'PC1 growth',
  spectrum: 'Eigenvalue spectrum',
  participation: 'Participation ratio',
  'pc1-contribution': 'Asset contribution to PC1',
};

export type PanelStatus = 'loading' | 'error' | 'ready';

/** A computation that failed, with the recovery the panel offers. */
export interface PanelError {
  readonly panel: TurbulencePanelId;
  readonly message: string;
  readonly detail: string;
}

/**
 * Why each panel can fail, in its own words.
 *
 * A singular covariance matrix and a missing price series are different
 * faults with different answers, and a shared "something went wrong" would
 * tell a reader neither.
 */
export const PANEL_FAILURE: Record<TurbulencePanelId, { message: string; detail: string }> = {
  turbulence: {
    message: 'The turbulence score could not be computed for this window.',
    detail:
      'Σ is not invertible over the current estimation window, so the Mahalanobis distance is undefined. The other indicators are unaffected.',
  },
  pairwise: {
    message: 'The correlation surprise could not be computed for this pair.',
    detail:
      'One of the two series has no overlapping observations inside the correlation window, so ρ is undefined for the pair.',
  },
  contributors: {
    message: 'The per-asset decomposition of d_t could not be computed.',
    detail:
      'The contributions need the same inverse covariance the score does, and it is unavailable for this window.',
  },
  absorption: {
    message: 'The absorption ratio could not be computed.',
    detail:
      'Fewer than 500 days of aligned returns are available for the eigen-decomposition of the covariance matrix.',
  },
  'effective-rank': {
    message: 'The effective rank could not be computed.',
    detail: 'The eigenvalues of the current window are unavailable, so the entropy is undefined.',
  },
  'pc1-growth': {
    message: 'The PC1 variance share could not be computed for this lookback.',
    detail:
      'The rolling PCA needs a complete window of monthly observations at the selected lookback.',
  },
  spectrum: {
    message: 'The eigenvalue spectrum could not be computed for this window.',
    detail:
      'The correlation matrix for the selected window ending date has missing observations for one or more assets.',
  },
  participation: {
    message: 'The participation ratio could not be computed.',
    detail: 'It is read off the first eigenvector, which is unavailable for this window.',
  },
  'pc1-contribution': {
    message: 'The PC1 weights could not be computed.',
    detail: 'The first eigenvector is unavailable for the current window.',
  },
};

// --- toolbar: the display range ----------------------------------------------

/**
 * How much history the three historical charts draw.
 *
 * A **display** window. It slices series that have already been computed; no
 * estimation window and no current reading moves with it.
 */
export type DisplayRange = '6M' | '1Y' | '3Y' | '5Y' | 'Max';

export const DISPLAY_RANGES: readonly DisplayRange[] = ['6M', '1Y', '3Y', '5Y', 'Max'];

export const DISPLAY_RANGE_LABEL: Record<DisplayRange, string> = {
  '6M': '6M',
  '1Y': '1Y',
  '3Y': '3Y',
  '5Y': '5Y',
  Max: 'Max',
};

/** Weekly observations each range shows. `null` is the whole sample. */
export const DISPLAY_RANGE_WEEKS: Record<DisplayRange, number | null> = {
  '6M': 27,
  '1Y': 53,
  '3Y': 157,
  '5Y': 261,
  Max: null,
};

export const DISPLAY_RANGE_NOTE =
  'The range changes how much history the charts draw. The estimation windows and the current readings do not move with it.';

// --- SectionNav --------------------------------------------------------------

export type TurbulenceSection =
  'turbulence' | 'compactness' | 'pc1-growth' | 'correlation-structure';

export const TURBULENCE_SECTIONS: readonly TurbulenceSection[] = [
  'turbulence',
  'compactness',
  'pc1-growth',
  'correlation-structure',
];

export const TURBULENCE_SECTION_LABEL: Record<TurbulenceSection, string> = {
  turbulence: 'Turbulence',
  compactness: 'Compactness',
  'pc1-growth': 'PC1 Growth',
  'correlation-structure': 'Correlation Structure',
};

/** The `id` the jump link scrolls to. Kept here so link and target agree. */
export const TURBULENCE_SECTION_ANCHOR: Record<TurbulenceSection, string> = {
  turbulence: 'section-turbulence',
  compactness: 'section-compactness',
  'pc1-growth': 'section-pc1-growth',
  'correlation-structure': 'section-correlation-structure',
};

// --- turbulence --------------------------------------------------------------

/**
 * The outer tail that defines an outlier: an observation beyond the outer 25%
 * of the χ² distribution. At `n = 12` this is the doc's 14.84.
 */
export const OUTLIER_TAIL_PROBABILITY = 0.75;

/** Above this, the magnitude surprise reads "elevated" on its card. */
export const MAGNITUDE_ELEVATED = 1.5;

/**
 * One observation of the turbulence series.
 *
 * `turbulence = magnitudeSurprise × correlationSurprise` at every point,
 * because correlation surprise *is* that ratio — §4. The three fields are
 * never filled in independently.
 */
export interface TurbulencePoint {
  /** `'2026-07-30'`. */
  readonly date: string;
  /** `d_t/n` — normalised turbulence, the multivariate z-score scale. */
  readonly turbulence: number;
  /** `d_t` — the raw Mahalanobis distance, on the χ² scale. */
  readonly turbulenceRaw: number;
  /** The correlation-blind score: Σ with its off-diagonal set to zero. */
  readonly magnitudeSurprise: number;
  /** `turbulence / magnitudeSurprise`. Above one means a correlation break. */
  readonly correlationSurprise: number;
  /** `turbulence > threshold/n` — the same verdict on either scale. */
  readonly outlier: boolean;
}

/** A run of consecutive observations classified as outliers. */
export interface OutlierPeriod {
  readonly from: string;
  readonly to: string;
  readonly observations: number;
  /** The highest normalised turbulence inside the run. */
  readonly peak: number;
  /** True while the run has not closed — it includes the current observation. */
  readonly open: boolean;
}

/** The current observation, on both scales, against its own threshold. */
export interface TurbulenceReading {
  readonly date: string;
  /** `n`. */
  readonly assetCount: number;
  /** `d_t/n`. */
  readonly turbulence: number;
  /** `d_t`. */
  readonly turbulenceRaw: number;
  readonly magnitudeSurprise: number;
  readonly correlationSurprise: number;
  /** `χ²_{0.75}(n)` — raw scale. A function of `assetCount`, never a constant. */
  readonly threshold: number;
  /** The same threshold divided by `n`, for the normalised scale. */
  readonly thresholdNormalized: number;
  readonly outlier: boolean;
  /** `'above the chi2 threshold for 24 assets'` — names the count it used. */
  readonly thresholdNote: string;
}

export type TurbulenceSeriesId = 'turbulence' | 'magnitude' | 'correlation';

export const TURBULENCE_SERIES: readonly TurbulenceSeriesId[] = [
  'turbulence',
  'magnitude',
  'correlation',
];

export const TURBULENCE_SERIES_LABEL: Record<TurbulenceSeriesId, string> = {
  turbulence: 'Turbulence',
  magnitude: 'Magnitude surprise',
  correlation: 'Correlation surprise',
};

/** Turbulence and magnitude surprise, per the field spec. */
export const DEFAULT_TURBULENCE_SERIES: readonly TurbulenceSeriesId[] = ['turbulence', 'magnitude'];

export const LAST_SERIES_NOTE = 'At least one series must stay selected.';

// --- per-asset decomposition of d_t ------------------------------------------

/** One row of the Top contributors table. */
export interface AssetContribution {
  readonly asset: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  /** Standardised return over the correlation window. Signed. */
  readonly zScore: number;
  /** Share of the current `d_t`, in [0,1]. The column sums to exactly 1. */
  readonly contribution: number;
  /** False when this asset's history is shorter than the window needs. */
  readonly covered: boolean;
}

export type ContributorSort = 'abs-z' | 'contribution' | 'asset';

export const CONTRIBUTOR_SORTS: readonly ContributorSort[] = ['abs-z', 'contribution', 'asset'];

export const CONTRIBUTOR_SORT_LABEL: Record<ContributorSort, string> = {
  'abs-z': '|z-score|',
  contribution: 'Contribution to d_t',
  asset: 'Asset',
};

/** Rows a table shows before "View full table". */
export const TABLE_PREVIEW_ROWS = 5;

// --- correlation surprise, pairwise ------------------------------------------

/**
 * The pairwise inspector's reading.
 *
 * Every number below `rho` is computed from `zX`, `zY` and `rho` through the
 * closed form of §4, so the panel cannot print a surprise that its own inputs
 * do not produce, nor bounds that do not contain it.
 */
export interface PairwiseSurprise {
  readonly assetX: string;
  readonly assetY: string;
  readonly zX: number;
  readonly zY: number;
  /** Historical ρ over the correlation window. */
  readonly rho: number;
  /** `CS = (1 − ρ z_x z_y / ½(z_x²+z_y²)) / (1 − ρ²)`. */
  readonly correlationSurprise: number;
  /** `(1 − |ρ|)/(1 − ρ²)` — attainable, so `CS` is never below it. */
  readonly min: number;
  /** `(1 + |ρ|)/(1 − ρ²)`. */
  readonly max: number;
  /** Where `CS` sits on `[min, max]`, in [0,1] — the horizontal scale. */
  readonly position: number;
  /** `CS > 1`: correlated assets diverging, or uncorrelated ones converging. */
  readonly breakdown: boolean;
  /** `'a correlation break'` / `'a relatively typical outcome'`. */
  readonly verdict: string;
}

export const PAIR_ONLY_NOTE =
  'Defined for a pair only — a single asset has no correlation surprise: its turbulence is z² and every unit of magnitude cancels.';

export const PAIR_DISTINCT_NOTE = 'Asset X must differ from Asset Y.';

/** At ρ = 0 the bounds coincide at one, so the reading carries no information. */
export const PAIR_ZERO_RHO_NOTE =
  'At ρ = 0 the minimum and the maximum are both one — the pair can show no correlation surprise.';

// --- compactness: the absorption ratio ---------------------------------------

/** ΔAR at or above this many σ is an absorption spike. */
export const AR_SPIKE_SIGMA = 1;

/** One observation of the absorption ratio series. */
export interface AbsorptionPoint {
  readonly date: string;
  /** `AR ∈ (0,1)` — the share of variance the leading eigenvectors absorb. */
  readonly absorptionRatio: number;
  /**
   * `ΔAR = (AR_15d − AR_1y) / σ`, standardised on the one-year window.
   *
   * `null` for the first year of the sample, where the one-year window does
   * not exist yet — a gap in the chart, which is not the same as a zero shift.
   */
  readonly deltaSigma: number | null;
  /** `deltaSigma ≥ 1` — the spikes the chart marks. */
  readonly spike: boolean;
}

export interface AbsorptionReading {
  readonly absorptionRatio: number;
  /** The average pairwise correlation, which AR is deliberately not. */
  readonly averageCorrelation: number;
  /** The standardised 15-day-versus-1-year shift. */
  readonly deltaSigma: number;
  /** The same standardised measure taken over twelve months. */
  readonly deltaSigma12m: number;
  readonly spike: boolean;
  /** How many eigenvectors the numerator sums — about `N/5`. */
  readonly eigenvectors: number;
}

export const AR_VS_CORRELATION_NOTE =
  'The absorption ratio weights each asset by how much of the variance it carries; the average pairwise correlation does not. They move apart, and the reading that matters for fragility is the ratio.';

// --- compactness: effective rank ---------------------------------------------

export interface EffectiveRankPoint {
  readonly date: string;
  /** `exp(H(p))` with `p_k = λ_k / Σλ`. Always inside `[1, rawRank]`. */
  readonly effectiveRank: number;
}

export interface EffectiveRankReading {
  readonly effectiveRank: number;
  /** `N` — the asset count, drawn as the reference line. */
  readonly rawRank: number;
  /** `'eight independent directions out of a raw rank of 24'`. */
  readonly note: string;
}

// --- compactness: the eigenvalue spectrum ------------------------------------

/** One eigenvalue of the current correlation window. */
export interface Eigenvalue {
  /** 1-based: `λ₁` is the largest. */
  readonly index: number;
  readonly value: number;
  /** `λ_k / N` — the share of variance the component explains. */
  readonly varianceShare: number;
  /** Above the Wishart `γ₊`: structure, not noise. */
  readonly aboveBound: boolean;
  /** `λ_k > 1` — the Kaiser-Guttman criterion on a correlation matrix. */
  readonly significant: boolean;
}

/** A date the spectrum can be read at — one complete rolling window. */
export interface SpectrumWindow {
  readonly id: string;
  /** `'2026-07-30'`. */
  readonly endingOn: string;
  readonly label: string;
}

/**
 * The spectrum of one window, against the random-matrix bulk.
 *
 * `gammaPlus` and `gammaMinus` come from `Q = T/N` and the residual variance
 * left once the market mode is taken out, so both move with the universe size
 * rather than sitting on screen as constants.
 */
export interface EigenSpectrum {
  readonly windowId: string;
  readonly endingOn: string;
  readonly eigenvalues: readonly Eigenvalue[];
  /** `T` — observations in the correlation window. */
  readonly observations: number;
  /** `N`. */
  readonly assets: number;
  /** `Q = T/N`. */
  readonly q: number;
  /** `γ₊ = σ²(1 + 1/Q + 2√(1/Q))` — the upper edge of the noise bulk. */
  readonly gammaPlus: number;
  /** `γ₋ = σ²(1 + 1/Q − 2√(1/Q))`. */
  readonly gammaMinus: number;
  /** The residual variance `σ²(Ẑ)` the bulk is scaled by. */
  readonly residualVariance: number;
  /** How many eigenvalues sit above `γ₊`. */
  readonly aboveBound: number;
  /**
   * How many satisfy Kaiser-Guttman, `λ > 1`.
   *
   * Not the same count as `aboveBound` and not an ordering of it: the two
   * criteria cross whenever `γ₊` falls below one, which is exactly what a very
   * compact market does to the bulk. The page prints both and names each.
   */
  readonly significant: number;
}

export const SPECTRUM_BOUND_NOTE =
  'Eigenvalues above γ₊ carry structure that random price changes cannot produce; the rest is indistinguishable from noise.';

// --- compactness: the participation ratio ------------------------------------

export interface ParticipationPoint {
  readonly date: string;
  /** `1/I₁ ∈ [1, N]` — one asset carries the component, or all of them do. */
  readonly participationRatio: number;
}

export type ParticipationState = 'localized' | 'extended';

export const PARTICIPATION_STATE_LABEL: Record<ParticipationState, string> = {
  localized: 'Localized',
  extended: 'Extended',
};

export const PARTICIPATION_STATE_ICON: Record<ParticipationState, string> = {
  localized: '◔',
  extended: '◕',
};

export interface ParticipationReading {
  /** `1/I₁`. */
  readonly participationRatio: number;
  /** `I₁ = Σ ω₁ᵢ⁴`. */
  readonly inverseParticipationRatio: number;
  /** `N` — the top of the scale, where every asset contributes equally. */
  readonly assetCount: number;
  readonly state: ParticipationState;
  /** Components with `λ > 1`, read off the same spectrum. */
  readonly significantComponents: number;
}

export const PARTICIPATION_SCALE_NOTE =
  'Localized → extended: 1/I₁ runs from one asset carrying the whole component to every asset contributing equally to it.';

// --- PC1 growth --------------------------------------------------------------

/** Beyond this lookback the signal saturates and stops moving. */
export const PC1_SATURATION_MONTHS = 20;

export const PC1_LOOKBACK_MIN = 1;
export const PC1_LOOKBACK_MAX = 36;
export const PC1_LOOKBACK_DEFAULT = 12;
export const PC1_HORIZON_MIN = 1;
export const PC1_HORIZON_DEFAULT = 1;

export const PC1_SATURATION_WARNING =
  'Beyond a lookback of about 20 months the signal saturates: longer windows swamp the shock, the peak slides forward and the reading stops moving. This chart is drawn at the saturated window.';

export const PC1_HORIZON_NOTE = 'The horizon m is normally shorter than the lookback n.';

/** One month of the PC1 variance share. */
export interface Pc1Point {
  /** `'2026-07'`. */
  readonly month: string;
  /** The share of variance the first component explains, in [0,1]. */
  readonly share: number;
  /** `ΔPC1(t) = PC1(t) − PC1(t−m)`. `null` before the horizon is available. */
  readonly delta: number | null;
}

/** One bin of the ΔPC1 distribution. */
export interface Pc1DeltaBin {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly count: number;
  /** True for the bin the current reading falls in. */
  readonly current: boolean;
}

export interface Pc1Reading {
  /** The current PC1 variance share. */
  readonly share: number;
  /** `PC1(t) − PC1(t−n)` over the lookback, in share points. */
  readonly changeOverLookback: number;
  /** `ΔPC1(t)` at the selected horizon. */
  readonly delta: number;
  readonly lookbackMonths: number;
  readonly horizonMonths: number;
  /** The month of the largest ΔPC1 in the sample, and its size. */
  readonly peakMonth: string;
  readonly peakDelta: number;
  /** Which decile of the historical ΔPC1 distribution the reading is in, 1–10. */
  readonly decile: number;
  /** True once the lookback is past the point where the signal stops moving. */
  readonly saturated: boolean;
}

/** One row of the Asset contribution to PC1 table. */
export interface Pc1Weight {
  readonly asset: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  /** `ω₁ᵢ` of the unit-norm first eigenvector. Signed. */
  readonly weight: number;
  /** `ω₁ᵢ⁴ / I₁`, in [0,1]. The column sums to exactly 1. */
  readonly contributionToI1: number;
}

export type Pc1Sort = 'weight' | 'contribution' | 'asset';

export const PC1_SORTS: readonly Pc1Sort[] = ['weight', 'contribution', 'asset'];

export const PC1_SORT_LABEL: Record<Pc1Sort, string> = {
  weight: 'PC1 weight',
  contribution: 'Contribution to I₁',
  asset: 'Asset',
};

// --- the CURRENT READING grid ------------------------------------------------

export type IndicatorId =
  | 'turbulence'
  | 'magnitude-surprise'
  | 'correlation-surprise'
  | 'absorption-ratio'
  | 'effective-rank'
  | 'pc1-share';

export const INDICATOR_ORDER: readonly IndicatorId[] = [
  'turbulence',
  'magnitude-surprise',
  'correlation-surprise',
  'absorption-ratio',
  'effective-rank',
  'pc1-share',
];

export const INDICATOR_LABEL: Record<IndicatorId, string> = {
  turbulence: 'Turbulence',
  'magnitude-surprise': 'Magnitude surprise',
  'correlation-surprise': 'Correlation surprise',
  'absorption-ratio': 'Absorption ratio',
  'effective-rank': 'Effective rank',
  'pc1-share': 'PC1 variance share',
};

/**
 * Word and glyph, never colour alone: an alert has to read as an alert in
 * greyscale.
 */
export const INDICATOR_ALERT_ICON = '●';
export const INDICATOR_QUIET_ICON = '○';

/**
 * One card of the CURRENT READING grid.
 *
 * `alert` is only ever raised by the two conditions the page spec names — the
 * turbulence past its χ² threshold and ΔAR past one σ — and `badge` says which
 * quantity raised it, so a filled marker can never sit beside a number that
 * did not trip anything.
 */
export interface IndicatorCard {
  readonly id: IndicatorId;
  readonly label: string;
  /** Pre-formatted, because the card and the panel must print one string. */
  readonly value: string;
  readonly note: string;
  readonly alert: boolean;
  readonly icon: string;
  /** The tripped quantity, named. Null when nothing is raised. */
  readonly badge: string | null;
  /** Which panel of the page the card is about. */
  readonly panel: TurbulencePanelId;
}

// --- placement ---------------------------------------------------------------

export interface RelatedPage {
  readonly label: string;
  readonly route: string;
}

export const TURBULENCE_RELATED_PAGES: readonly RelatedPage[] = [
  { label: 'Open Macro & Regimes Agent', route: '/fund/macro-agent' },
  { label: 'Open Allocation Agent', route: '/fund/allocation-agent' },
  { label: 'Open Risk Monitoring', route: '/risk/risk-monitoring' },
];

export const PLACEMENT_NOTE_TITLE = 'About these indicators';

export const PLACEMENT_NOTES: readonly string[] = [
  'These readings feed the regime state used by Macro & Regimes and the Allocation Agent.',
  'This page does not re-identify the regimes and does not size the losses: stress is an unusual period, not necessarily a losing one, and a high absorption ratio is a statement about fragility rather than an estimate of what can be lost.',
];
