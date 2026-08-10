import { Injectable, computed, signal } from '@angular/core';

import {
  AR_SPIKE_SIGMA,
  DISPLAY_RANGE_WEEKS,
  DEFAULT_TURBULENCE_SERIES,
  INDICATOR_ALERT_ICON,
  INDICATOR_LABEL,
  INDICATOR_QUIET_ICON,
  LAST_SERIES_NOTE,
  MAGNITUDE_ELEVATED,
  OUTLIER_TAIL_PROBABILITY,
  PAIR_DISTINCT_NOTE,
  PANEL_FAILURE,
  PC1_HORIZON_DEFAULT,
  PC1_HORIZON_MIN,
  PC1_LOOKBACK_DEFAULT,
  PC1_LOOKBACK_MAX,
  PC1_LOOKBACK_MIN,
  PC1_SATURATION_MONTHS,
  PC1_SATURATION_WARNING,
  TABLE_PREVIEW_ROWS,
  TURBULENCE_PANELS,
  type AbsorptionPoint,
  type AbsorptionReading,
  type AssetClass,
  type AssetContribution,
  type ContributorSort,
  type DisplayRange,
  type EffectiveRankPoint,
  type EffectiveRankReading,
  type EigenSpectrum,
  type Eigenvalue,
  type EstimationWindows,
  type IndicatorCard,
  type IndicatorId,
  type PairwiseSurprise,
  type PanelCoverage,
  type PanelError,
  type PanelStatus,
  type ParticipationPoint,
  type ParticipationReading,
  type Pc1DeltaBin,
  type Pc1Point,
  type Pc1Reading,
  type Pc1Sort,
  type Pc1Weight,
  type SpectrumWindow,
  type TurbulenceEmptyReason,
  type TurbulencePanelId,
  type TurbulencePoint,
  type TurbulenceReading,
  type TurbulenceSeriesId,
  type TurbulenceSnapshot,
  type UniverseAsset,
  type UniverseSummary,
} from '../models/turbulence.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 600;

// ===========================================================================
// The χ² threshold — a function of the asset count, never a constant
// ===========================================================================

/** ln Γ(x) — Lanczos, g = 7. Accurate to ~1e-15 over the range used here. */
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * `P(a, x)` — the regularised lower incomplete gamma function.
 *
 * Series below the transition point, continued fraction above it: the pair is
 * what keeps the result accurate on both sides, which matters because the
 * threshold is inverted from it.
 */
function regularisedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lead = -x + a * Math.log(x) - lnGamma(a);

  if (x < a + 1) {
    let term = 1 / a;
    let total = term;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      total += term;
      if (Math.abs(term) < Math.abs(total) * 1e-16) break;
    }
    return total * Math.exp(lead);
  }

  // Lentz's algorithm on the continued fraction for Q(a, x).
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return 1 - Math.exp(lead) * h;
}

const THRESHOLD_CACHE = new Map<number, number>();

/**
 * `χ²_{0.75}(n)` — the tolerance an observation has to clear to be an outlier.
 *
 * An outlier is an observation beyond the outer 25% of the distribution, and
 * `d_t` is χ² on as many degrees of freedom as there are assets. So the line
 * the turbulence chart draws is a function of the size of the universe: it is
 * the source's 14.84 at twelve series and moves the moment an asset is added.
 * Nothing on this page stores it.
 */
export function chiSquaredThreshold(assetCount: number): number {
  const df = Math.max(1, Math.round(assetCount));
  const cached = THRESHOLD_CACHE.get(df);
  if (cached !== undefined) return cached;

  const a = df / 2;
  let lo = 0;
  let hi = df + 10 * Math.sqrt(2 * df) + 20;
  while (regularisedGammaP(a, hi / 2) < OUTLIER_TAIL_PROBABILITY) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (regularisedGammaP(a, mid / 2) < OUTLIER_TAIL_PROBABILITY) lo = mid;
    else hi = mid;
  }

  const value = (lo + hi) / 2;
  THRESHOLD_CACHE.set(df, value);
  return value;
}

// ===========================================================================
// Correlation surprise for a pair — the closed form, never a stored number
// ===========================================================================

export interface PairwiseSurpriseValue {
  readonly correlationSurprise: number;
  readonly min: number;
  readonly max: number;
  readonly position: number;
  readonly breakdown: boolean;
}

/**
 * `CS = (1 − ρ z_x z_y / ½(z_x² + z_y²)) / (1 − ρ²)`, with the bounds it lives
 * between: `min = (1−|ρ|)/(1−ρ²)` and `max = (1+|ρ|)/(1−ρ²)`.
 *
 * Every unit of magnitude cancels in that ratio, which is why the measure is
 * about the direction of the co-movement and nothing else — and why a single
 * asset has none: with one series the turbulence is `z²` and the ratio is one
 * by construction.
 */
export function pairwiseSurpriseOf(zX: number, zY: number, rho: number): PairwiseSurpriseValue {
  const clamped = Math.max(-0.999, Math.min(0.999, rho));
  const denominator = 1 - clamped * clamped;
  const scale = (zX * zX + zY * zY) / 2;

  const min = (1 - Math.abs(clamped)) / denominator;
  const max = (1 + Math.abs(clamped)) / denominator;
  // Both z at zero is the origin of the ellipse: nothing surprising happened,
  // and the ratio has no content there.
  const surprise = scale === 0 ? 1 : (1 - (clamped * zX * zY) / scale) / denominator;
  const bounded = Math.max(min, Math.min(max, surprise));

  return {
    correlationSurprise: bounded,
    min,
    max,
    position: max === min ? 0.5 : (bounded - min) / (max - min),
    breakdown: bounded > 1,
  };
}

// ===========================================================================
// Calendars
// ===========================================================================

const AS_OF_DATE = '2026-07-30';
const DAY_MS = 86_400_000;

/** `count` weekly observations ending on `end`, oldest first. */
function weeklyDatesEndingAt(end: string, count: number): readonly string[] {
  const dates: string[] = [];
  let cursor = Date.parse(`${end}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor -= 7 * DAY_MS;
  }
  return dates.reverse();
}

/** `count` months ending on the month of `end`, oldest first, as `YYYY-MM`. */
function monthsEndingAt(end: string, count: number): readonly string[] {
  const year = Number(end.slice(0, 4));
  const month = Number(end.slice(5, 7));
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = year * 12 + (month - 1) - i;
    months.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

/** Six years of weekly observations — the `Max` range. */
const SERIES_WEEKS = 313;
const SERIES_DATES = weeklyDatesEndingAt(AS_OF_DATE, SERIES_WEEKS);

const PC1_MONTHS = 120;
const PC1_DATES = monthsEndingAt(AS_OF_DATE, PC1_MONTHS);

function total(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : total(values) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(total(values.map((v) => (v - m) ** 2)) / (values.length - 1));
}

// ===========================================================================
// The universe
// ===========================================================================

/**
 * `ρ` is built as a Gram matrix of unit vectors, shrunk towards the identity.
 *
 * Two properties come free and both matter: the matrix is symmetric with a
 * unit diagonal, and it is positive semi-definite, so no pair of assets can be
 * given a correlation the other pairs make impossible. The shrinkage keeps the
 * extremes off ±1, where the correlation surprise is not defined.
 */
const RHO_SHRINK = 0.58;

/** The doc's worked pair. The angle of HY_CREDIT is solved from it. */
const RHO_EQ_US_HY = 0.42;
const HY_ANGLE_DEG = (Math.acos(RHO_EQ_US_HY / RHO_SHRINK) * 180) / Math.PI;

/**
 * One instrument of the mock universe.
 *
 * `z` is the standardised return over the correlation window — the column the
 * contributors table prints and the pairwise inspector reads. It is *not* a
 * decomposition of the magnitude surprise: that is measured against the longer
 * turbulence covariance, and standardising by a shorter, currently more
 * volatile window gives systematically smaller scores. Two windows, two
 * standardisations; the page never adds one up to get the other.
 *
 * `contribution` is a shape, normalised across whichever universe is active,
 * so the column always sums to exactly one. `pc1` is likewise a shape: it is
 * normalised to a unit-norm eigenvector, without which `1/I₁` would not be
 * bounded by the asset count.
 */
interface AssetSeed {
  readonly id: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  readonly z: number;
  readonly contribution: number;
  readonly pc1: number;
  readonly angleDeg: number;
}

// prettier-ignore
const ASSET_SEEDS: readonly AssetSeed[] = [
  { id: 'HY_CREDIT',   name: 'High yield credit',      assetClass: 'credit',      z:  2.20, contribution: 32,   pc1:  0.31,  angleDeg: HY_ANGLE_DEG },
  { id: 'EQ_EM',       name: 'Emerging market equity', assetClass: 'equity',      z:  1.94, contribution: 24,   pc1:  0.27,  angleDeg: 28 },
  { id: 'EQ_US_LARGE', name: 'US large cap equity',    assetClass: 'equity',      z:  1.90, contribution: 19,   pc1:  0.29,  angleDeg: 0 },
  { id: 'IG_CREDIT',   name: 'Investment grade credit',assetClass: 'credit',      z:  1.41, contribution: 11,   pc1:  0.24,  angleDeg: 34 },
  { id: 'GOV_10Y',     name: '10-year government',     assetClass: 'rates',       z: -0.86, contribution:  8,   pc1: -0.11,  angleDeg: 118 },
  { id: 'EQ_EUROPE',   name: 'Europe equity',          assetClass: 'equity',      z:  0.84, contribution:  0.60, pc1:  0.105, angleDeg: 10 },
  { id: 'EQ_US_SMALL', name: 'US small cap equity',    assetClass: 'equity',      z:  0.79, contribution:  0.55, pc1:  0.10,  angleDeg: 6 },
  { id: 'SOV_EM',      name: 'EM sovereign debt',      assetClass: 'credit',      z:  0.76, contribution:  0.50, pc1:  0.098, angleDeg: 44 },
  { id: 'EQ_UK',       name: 'UK equity',              assetClass: 'equity',      z:  0.71, contribution:  0.45, pc1:  0.095, angleDeg: 14 },
  { id: 'EQ_JAPAN',    name: 'Japan equity',           assetClass: 'equity',      z:  0.66, contribution:  0.40, pc1:  0.09,  angleDeg: 20 },
  { id: 'EQ_ASIA_PAC', name: 'Asia-Pacific equity',    assetClass: 'equity',      z:  0.35, contribution:  0.38, pc1:  0.088, angleDeg: 24 },
  { id: 'REIT_GLOBAL', name: 'Global real estate',     assetClass: 'real-assets', z:  0.58, contribution:  0.35, pc1:  0.085, angleDeg: 38 },
  { id: 'FX_EM',       name: 'EM currency basket',     assetClass: 'fx',          z: -0.54, contribution:  0.32, pc1:  0.08,  angleDeg: 48 },
  { id: 'OIL_BRENT',   name: 'Brent crude',            assetClass: 'real-assets', z:  0.49, contribution:  0.30, pc1:  0.075, angleDeg: 52 },
  { id: 'METALS_IND',  name: 'Industrial metals',      assetClass: 'real-assets', z:  0.45, contribution:  0.28, pc1:  0.07,  angleDeg: 56 },
  { id: 'MBS_US',      name: 'US agency MBS',          assetClass: 'credit',      z:  0.41, contribution:  0.26, pc1:  0.068, angleDeg: 76 },
  { id: 'GOV_30Y',     name: '30-year government',     assetClass: 'rates',       z: -0.38, contribution:  0.24, pc1: -0.065, angleDeg: 114 },
  { id: 'TIPS_10Y',    name: '10-year inflation link', assetClass: 'rates',       z: -0.34, contribution:  0.22, pc1: -0.06,  angleDeg: 100 },
  { id: 'GOV_EURO',    name: 'Euro government',        assetClass: 'rates',       z: -0.31, contribution:  0.20, pc1: -0.055, angleDeg: 116 },
  { id: 'FX_EUR',      name: 'EUR/USD',                assetClass: 'fx',          z:  0.27, contribution:  0.18, pc1:  0.05,  angleDeg: 66 },
  { id: 'GOV_2Y',      name: '2-year government',      assetClass: 'rates',       z: -0.24, contribution:  0.16, pc1: -0.045, angleDeg: 110 },
  { id: 'GOLD',        name: 'Gold',                   assetClass: 'real-assets', z: -0.19, contribution:  0.14, pc1: -0.04,  angleDeg: 92 },
  { id: 'FX_JPY',      name: 'USD/JPY',                assetClass: 'fx',          z: -0.15, contribution:  0.12, pc1: -0.035, angleDeg: 104 },
  { id: 'GOV_JGB',     name: 'Japan government',       assetClass: 'rates',       z: -0.09, contribution:  0.10, pc1: -0.03,  angleDeg: 122 },
];

const SEED_BY_ID = new Map(ASSET_SEEDS.map((seed) => [seed.id, seed]));

/** `ρ_ij` over the correlation window. Symmetric, unit diagonal, PSD. */
function rhoBetween(a: AssetSeed, b: AssetSeed): number {
  if (a.id === b.id) return 1;
  const delta = ((a.angleDeg - b.angleDeg) * Math.PI) / 180;
  return RHO_SHRINK * Math.cos(delta);
}

export const CORE_UNIVERSE_ID = 'multi-asset-24';
export const RECENT_UNIVERSE_ID = 'multi-asset-24-rebuilt';
export const SLEEVE_UNIVERSE_ID = 'core-sleeve-12';
export const YOUNG_UNIVERSE_ID = 'new-universe';

interface UniverseSeed {
  readonly id: string;
  readonly name: string;
  /** Asset ids, in seed order. */
  readonly assets: readonly string[];
  /** History common to the universe, in calendar days. */
  readonly historyDays: number;
  /** Assets added recently, with a shorter history than the rest. */
  readonly recent: readonly string[];
  readonly recentHistoryDays: number;
  /**
   * What the magnitude surprise is scaled by.
   *
   * A smaller, calmer sleeve is not simply a slice of the same reading, and
   * the page needs a universe whose turbulence sits *below* its own threshold
   * — otherwise the quiet half of every badge is unreachable.
   */
  readonly magnitudeScale: number;
}

const ALL_ASSET_IDS = ASSET_SEEDS.map((seed) => seed.id);

const SLEEVE_ASSET_IDS = [
  'EQ_US_LARGE',
  'EQ_EM',
  'EQ_EUROPE',
  'EQ_JAPAN',
  'GOV_10Y',
  'GOV_2Y',
  'GOV_EURO',
  'IG_CREDIT',
  'HY_CREDIT',
  'GOLD',
  'OIL_BRENT',
  'FX_EUR',
];

const RECENTLY_ADDED = ['EQ_ASIA_PAC', 'FX_EM', 'METALS_IND'];

const UNIVERSE_SEEDS: readonly UniverseSeed[] = [
  {
    id: CORE_UNIVERSE_ID,
    name: 'Multi-asset — 24 series',
    assets: ALL_ASSET_IDS,
    historyDays: 2600,
    recent: [],
    recentHistoryDays: 0,
    magnitudeScale: 1,
  },
  {
    id: RECENT_UNIVERSE_ID,
    name: 'Multi-asset — 24 series, three rebuilt',
    assets: ALL_ASSET_IDS,
    historyDays: 2600,
    // Long enough for the 500-day absorption window, short of the 100
    // observations the correlation window needs: one panel covers the whole
    // universe while its neighbour does not.
    recent: RECENTLY_ADDED,
    recentHistoryDays: 620,
    magnitudeScale: 1,
  },
  {
    id: SLEEVE_UNIVERSE_ID,
    name: 'Core sleeve — 12 series',
    assets: SLEEVE_ASSET_IDS,
    historyDays: 2600,
    recent: [],
    recentHistoryDays: 0,
    magnitudeScale: 0.5,
  },
  {
    id: YOUNG_UNIVERSE_ID,
    name: 'New universe — 24 series',
    assets: ALL_ASSET_IDS,
    historyDays: 60,
    recent: [],
    recentHistoryDays: 0,
    magnitudeScale: 1,
  },
];

// ===========================================================================
// The estimation windows
// ===========================================================================

const ABSORPTION_WINDOW_DAYS = 500;
const ABSORPTION_HALF_LIFE_DAYS = 250;
const CORRELATION_OBSERVATIONS = 100;
/** The same window in days: 100 weekly observations. */
const CORRELATION_WINDOW_DAYS = CORRELATION_OBSERVATIONS * 7;

/** Assets a panel needs before it will report anything at all. */
const MIN_COVERED_ASSETS = 2;

function windowsFor(assetCount: number): EstimationWindows {
  return {
    absorptionDays: ABSORPTION_WINDOW_DAYS,
    absorptionHalfLifeDays: ABSORPTION_HALF_LIFE_DAYS,
    // "about a fifth of the number of assets" — five at 24, and it moves.
    absorptionEigenvectors: Math.max(1, Math.round(assetCount / 5)),
    correlationObservations: CORRELATION_OBSERVATIONS,
    correlationDays: CORRELATION_WINDOW_DAYS,
  };
}

// ===========================================================================
// The eigenvalue spectrum — the one estimate the compactness family reads
// ===========================================================================

/**
 * The shape of the current correlation spectrum, largest first.
 *
 * Chosen so that the readings the page prints come *out* of it rather than
 * beside it: `λ₁/N` is the PC1 variance share, the first five over `N` are the
 * absorption ratio, `#{λ > 1}` is the Kaiser-Guttman count and `#{λ > γ₊}` is
 * how much of the structure random price changes could not have produced. The
 * tail is a bulk, so the effective rank it implies is the honest one for a
 * universe this size.
 */
const EIGEN_LEAD = [12.4, 1.525, 1.09, 1.02, 1.005];
const EIGEN_TAIL_COUNT = 19;

const EIGEN_PROFILE: readonly number[] = (() => {
  const tail = Array.from(
    { length: EIGEN_TAIL_COUNT },
    (_, k) => 0.6 - (0.47 * k) / (EIGEN_TAIL_COUNT - 1),
  );
  const target = ASSET_SEEDS.length - total(EIGEN_LEAD);
  const scale = target / total(tail);
  return [...EIGEN_LEAD, ...tail.map((value) => value * scale)];
})();

/**
 * The windows the spectrum can be read at.
 *
 * `tilt` compresses or stretches the profile: the structure has grown more
 * compact over the last year, so an older window has a smaller leading
 * eigenvalue and a fatter bulk.
 */
const SPECTRUM_SEEDS: readonly (SpectrumWindow & { tilt: number })[] = [
  { id: '2026-07-30', endingOn: '2026-07-30', label: '2026-07-30 — latest', tilt: 1 },
  { id: '2026-06-30', endingOn: '2026-06-30', label: '2026-06-30', tilt: 0.96 },
  { id: '2026-03-31', endingOn: '2026-03-31', label: '2026-03-31', tilt: 0.92 },
  { id: '2025-12-31', endingOn: '2025-12-31', label: '2025-12-31', tilt: 0.88 },
];

const LATEST_SPECTRUM_ID = SPECTRUM_SEEDS[0].id;

/** `n` eigenvalues of a correlation matrix: descending, summing to exactly `n`. */
function eigenvaluesOf(assetCount: number, tilt: number): readonly number[] {
  const raw = EIGEN_PROFILE.slice(0, assetCount).map((value) => Math.pow(value, tilt));
  const scale = assetCount / total(raw);
  return raw.map((value) => value * scale);
}

function spectrumOf(window: SpectrumWindow & { tilt: number }, assetCount: number): EigenSpectrum {
  const values = eigenvaluesOf(assetCount, window.tilt);
  const q = CORRELATION_OBSERVATIONS / assetCount;
  // The random-matrix bulk describes what is left once the market mode is
  // taken out, so the bound is scaled by that residual variance rather than
  // by one — otherwise every eigenvalue of a compact market looks like noise.
  const residualVariance = 1 - values[0] / assetCount;
  const spread = 2 * Math.sqrt(1 / q);
  const gammaPlus = residualVariance * (1 + 1 / q + spread);
  const gammaMinus = residualVariance * (1 + 1 / q - spread);

  const eigenvalues: readonly Eigenvalue[] = values.map((value, index) => ({
    index: index + 1,
    value,
    varianceShare: value / assetCount,
    aboveBound: value > gammaPlus,
    significant: value > 1,
  }));

  return {
    windowId: window.id,
    endingOn: window.endingOn,
    eigenvalues,
    observations: CORRELATION_OBSERVATIONS,
    assets: assetCount,
    q,
    gammaPlus,
    gammaMinus,
    residualVariance,
    aboveBound: eigenvalues.filter((e) => e.aboveBound).length,
    significant: eigenvalues.filter((e) => e.significant).length,
  };
}

/** `erank = exp(H(p))` with `p_k = λ_k / Σλ`, and `0 log 0 = 0`. */
function effectiveRankOf(values: readonly number[]): number {
  const scale = total(values);
  const entropy = -total(
    values.map((value) => {
      const p = value / scale;
      return p > 0 ? p * Math.log(p) : 0;
    }),
  );
  return Math.exp(entropy);
}

// ===========================================================================
// The turbulence series
// ===========================================================================

/** `d_t/n` and its magnitude component at the as-of instant. */
const TURBULENCE_NOW = 2.31;
const MAGNITUDE_NOW = 1.84;
/** Not stored: correlation surprise *is* the ratio of the two above. */
const CORRELATION_NOW = TURBULENCE_NOW / MAGNITUDE_NOW;

interface Episode {
  readonly at: number;
  readonly width: number;
  readonly amplitude: number;
}

/** Stress episodes: volatility spikes, which the page calls magnitude. */
const MAGNITUDE_EPISODES: readonly Episode[] = [
  { at: 0.12, width: 0.012, amplitude: 1.6 },
  { at: 0.34, width: 0.014, amplitude: 2.2 },
  { at: 0.58, width: 0.01, amplitude: 1.1 },
  { at: 0.77, width: 0.016, amplitude: 2.8 },
];

/** Correlation breaks with no volatility behind them — outliers all the same. */
const CORRELATION_EPISODES: readonly Episode[] = [
  { at: 0.22, width: 0.01, amplitude: 0.55 },
  { at: 0.66, width: 0.012, amplitude: 0.7 },
];

function episodeSum(u: number, episodes: readonly Episode[]): number {
  return total(episodes.map((e) => e.amplitude * Math.exp(-(((u - e.at) / e.width) ** 2))));
}

/** The current episode: a bump that peaks exactly on the as-of observation. */
function currentEpisode(u: number): number {
  return Math.exp(-(((u - 1) / 0.012) ** 2));
}

function magnitudeBase(u: number): number {
  return (
    0.88 +
    0.06 * Math.sin(2 * Math.PI * 3 * u) +
    0.05 * Math.sin(2 * Math.PI * 7 * u + 1.1) +
    episodeSum(u, MAGNITUDE_EPISODES)
  );
}

/**
 * Correlation surprise dips when magnitude spikes — the two are negatively
 * related on the day, which is what makes today's reading, high on both,
 * the combination the source says precedes a worse tomorrow.
 */
function correlationBase(u: number): number {
  return (
    0.98 +
    0.05 * Math.sin(2 * Math.PI * 5 * u + 0.4) -
    0.13 * episodeSum(u, MAGNITUDE_EPISODES) +
    episodeSum(u, CORRELATION_EPISODES)
  );
}

const MAGNITUDE_LIFT = MAGNITUDE_NOW - magnitudeBase(1);
const CORRELATION_LIFT = CORRELATION_NOW - correlationBase(1);

/** Magnitude surprise per observation, with the last point pinned to 1.84. */
const MAGNITUDE_SERIES: readonly number[] = SERIES_DATES.map((_, i) => {
  const u = i / (SERIES_WEEKS - 1);
  return Math.max(0.15, magnitudeBase(u) + MAGNITUDE_LIFT * currentEpisode(u));
});

/** Correlation surprise per observation, with the last point pinned to 2.31/1.84. */
const CORRELATION_SERIES: readonly number[] = SERIES_DATES.map((_, i) => {
  const u = i / (SERIES_WEEKS - 1);
  return Math.max(0.45, correlationBase(u) + CORRELATION_LIFT * currentEpisode(u));
});

// ===========================================================================
// The absorption ratio series
// ===========================================================================

/** Observations of the short leg of ΔAR — fifteen days of weekly data. */
const AR_SHORT_OBS = 3;
/** Observations of the long leg, and of the σ it is standardised by. */
const AR_LONG_OBS = 52;
/** The standardised shift the page reports at the as-of instant. */
const AR_DELTA_SIGMA_NOW = 1.2;

function absorptionBase(u: number): number {
  return (
    0.58 +
    0.06 * u +
    0.035 * Math.sin(2 * Math.PI * 2.5 * u) +
    0.02 * Math.sin(2 * Math.PI * 6 * u + 0.7) +
    0.03 * episodeSum(u, MAGNITUDE_EPISODES) +
    // A plateau a year back, so the twelve-month shift is modest while the
    // recent one is not: the two ΔAR readings the absorption card carries are
    // different measurements and the page should not be able to imply they
    // are one.
    0.013 * Math.exp(-(((u - 0.833) / 0.02) ** 2))
  );
}

/** The recent climb whose height ΔAR is solved for. Zero before the last quarter. */
function absorptionRamp(u: number): number {
  return u <= 0.96 ? 0 : ((u - 0.96) / 0.04) ** 1.5;
}

function absorptionShape(height: number): readonly number[] {
  return SERIES_DATES.map((_, i) => {
    const u = i / (SERIES_WEEKS - 1);
    return absorptionBase(u) + height * absorptionRamp(u);
  });
}

/**
 * `ΔAR = (AR_15d − AR_1y)/σ`, standardised on the one-year window.
 *
 * `null` for the first year: the long leg does not exist there, and a zero
 * would claim a shift was measured and found to be nothing.
 */
function deltaSigmaSeries(values: readonly number[]): readonly (number | null)[] {
  return values.map((_, i) => {
    if (i < AR_LONG_OBS - 1) return null;
    const long = values.slice(i - AR_LONG_OBS + 1, i + 1);
    const short = values.slice(i - AR_SHORT_OBS + 1, i + 1);
    const sigma = standardDeviation(long);
    return sigma === 0 ? null : (mean(short) - mean(long)) / sigma;
  });
}

/**
 * The height of the recent climb that makes today's ΔAR exactly 1.2σ.
 *
 * Solved rather than guessed, and the level is applied afterwards as a
 * constant shift — which leaves every difference of means and every standard
 * deviation untouched, so the solved ΔAR survives being pinned to 0.71.
 */
const ABSORPTION_HEIGHT = (() => {
  const at = (height: number): number => {
    const series = deltaSigmaSeries(absorptionShape(height));
    return series[series.length - 1] ?? 0;
  };
  let lo = 0;
  let hi = 1;
  while (at(hi) < AR_DELTA_SIGMA_NOW && hi < 64) hi *= 2;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < AR_DELTA_SIGMA_NOW) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();

const ABSORPTION_SHAPE = absorptionShape(ABSORPTION_HEIGHT);
const ABSORPTION_DELTA_SIGMA = deltaSigmaSeries(ABSORPTION_SHAPE);

/** ΔAR over twelve months, on the same σ. The card's second reading. */
const ABSORPTION_DELTA_12M = (() => {
  const last = ABSORPTION_SHAPE.length - 1;
  const window = ABSORPTION_SHAPE.slice(last - AR_LONG_OBS + 1);
  const sigma = standardDeviation(window);
  return sigma === 0 ? 0 : (ABSORPTION_SHAPE[last] - ABSORPTION_SHAPE[last - AR_LONG_OBS]) / sigma;
})();

// ===========================================================================
// Effective rank and participation ratio series
// ===========================================================================

function effectiveRankShape(u: number): number {
  return (
    9.6 -
    1.2 * u +
    0.35 * Math.sin(2 * Math.PI * 3 * u + 0.5) -
    0.55 * episodeSum(u, MAGNITUDE_EPISODES)
  );
}

const EFFECTIVE_RANK_SHAPE: readonly number[] = SERIES_DATES.map((_, i) =>
  effectiveRankShape(i / (SERIES_WEEKS - 1)),
);

function participationShape(u: number): number {
  return (
    8.4 -
    1.1 * u +
    0.55 * Math.sin(2 * Math.PI * 2 * u + 1.3) +
    0.3 * Math.sin(2 * Math.PI * 5 * u) -
    0.7 * episodeSum(u, MAGNITUDE_EPISODES)
  );
}

const PARTICIPATION_SHAPE: readonly number[] = SERIES_DATES.map((_, i) =>
  participationShape(i / (SERIES_WEEKS - 1)),
);

// ===========================================================================
// The PC1 variance share
// ===========================================================================

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * The raw monthly PC1 share, before the rolling window smooths it.
 *
 * The late step is what gives the sample a peak ΔPC1 one month before the
 * as-of instant, with the current reading just behind it in the right tail —
 * the shape the source describes around a systemic event.
 */
function pc1Raw(i: number): number {
  return (
    0.3 +
    0.14 * logistic((i - 60) / 22) +
    0.033 * Math.sin((2 * Math.PI * i) / 37) +
    0.02 * Math.sin((2 * Math.PI * i) / 13 + 1) +
    // The step is over before the as-of month, which is what puts the largest
    // ΔPC1 a month behind the current reading and leaves the current reading
    // just inside the right tail rather than sitting on top of it.
    0.075 * logistic((i - 112) / 1.2) -
    // …and it flattens off in the as-of month itself, which is what leaves the
    // largest ΔPC1 one month behind the current reading rather than on it.
    0.004 * logistic((i - 118.5) / 0.4)
  );
}

const PC1_RAW: readonly number[] = PC1_DATES.map((_, i) => pc1Raw(i));

/**
 * The share at a given lookback, before it is levelled onto the spectrum.
 *
 * The rolling window is capped at the saturation point: past twenty months a
 * longer window swamps the shock and the reading stops responding. Modelling
 * the cap rather than letting the number quietly flatten is what lets the
 * panel *say* the signal has saturated.
 */
function pc1SharesAt(lookbackMonths: number): readonly number[] {
  const width = Math.min(lookbackMonths, PC1_SATURATION_MONTHS);
  return PC1_RAW.map((_, i) => mean(PC1_RAW.slice(Math.max(0, i - width + 1), i + 1)));
}

const PC1_DEFAULT_SHARES = pc1SharesAt(PC1_LOOKBACK_DEFAULT);
const PC1_DEFAULT_LAST = PC1_DEFAULT_SHARES[PC1_DEFAULT_SHARES.length - 1];

const PC1_DISTRIBUTION_BINS = 12;

// ===========================================================================
// Service
// ===========================================================================

/**
 * How unusual the current market state is, and how compact its correlation
 * structure has become.
 *
 * Read-only: there is no action on this page, so every setter below is either
 * a display choice or a selection, and `refresh` is the only thing that moves
 * a number. Two structural decisions carry most of the page's honesty:
 *
 * - **The χ² threshold, the outlier bands and every compactness reading are
 *   `computed()` off the active universe.** Adding an asset moves the line and
 *   re-cuts the shaded periods underneath it, because nothing here stores a
 *   threshold or a band.
 * - **Each panel owns its own error.** A singular covariance matrix is a fact
 *   about one computation, and the neighbouring panels keep their data and
 *   their status through it.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the loading and error states in
 * the page spec actually reachable.
 */
@Injectable({ providedIn: 'root' })
export class TurbulenceService {
  // --- the universe ---------------------------------------------------------

  readonly universes: readonly UniverseSummary[] = UNIVERSE_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    assetCount: seed.assets.length,
  }));

  private readonly _universeId = signal<string | null>(CORE_UNIVERSE_ID);
  readonly universeId = this._universeId.asReadonly();

  private readonly universe = computed<UniverseSeed | null>(
    () => UNIVERSE_SEEDS.find((seed) => seed.id === this._universeId()) ?? null,
  );

  readonly assets = computed<readonly UniverseAsset[]>(() => {
    const universe = this.universe();
    if (!universe) return [];
    return universe.assets.map((id) => {
      const seed = SEED_BY_ID.get(id)!;
      return {
        id: seed.id,
        name: seed.name,
        assetClass: seed.assetClass,
        historyDays: universe.recent.includes(id)
          ? universe.recentHistoryDays
          : universe.historyDays,
      };
    });
  });

  /** Alphabetical — the order the pair selectors offer and default from. */
  readonly assetIds = computed<readonly string[]>(() =>
    this.assets()
      .map((asset) => asset.id)
      .sort(),
  );

  /** `n`. The degrees of freedom of the threshold, and the raw rank. */
  readonly assetCount = computed(() => this.assets().length);

  private readonly seeds = computed<readonly AssetSeed[]>(() =>
    this.assets().map((asset) => SEED_BY_ID.get(asset.id)!),
  );

  /**
   * Re-points the page at another universe, or at none.
   *
   * The pair selection is repaired rather than dropped: an inspector with no
   * pair has nothing to say, and the two defaults are always available.
   */
  selectUniverse(id: string | null): void {
    if (id !== null && !UNIVERSE_SEEDS.some((seed) => seed.id === id)) return;
    this._universeId.set(id);
    this._panelErrors.set([]);
    this._pairNote.set(null);
    this._seriesNote.set(null);
    this.repairPair();
  }

  // --- the as-of bar --------------------------------------------------------

  private readonly _asOfMinutes = signal(16 * 60);
  private readonly _ageHours = signal(18);

  readonly windows = computed<EstimationWindows>(() => windowsFor(this.assetCount()));

  readonly snapshot = computed<TurbulenceSnapshot>(() => {
    const minutes = this._asOfMinutes();
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const age = this._ageHours();
    const cadence = 24;
    const stale = age > cadence;
    return {
      asOf: `${AS_OF_DATE} ${hh}:${mm} UTC`,
      assetCount: this.assetCount(),
      windows: this.windows(),
      ageHours: age,
      cadenceHours: cadence,
      stale,
      ageNote: stale
        ? `Snapshot age ${age}h, older than the expected ${cadence}h cadence`
        : `Snapshot age ${age}h, within the expected cadence`,
    };
  });

  /** Moves the snapshot's age, so the dated-snapshot edge case is reachable. */
  ageSnapshot(hours: number): void {
    this._ageHours.set(Math.max(0, Math.round(hours)));
  }

  // --- coverage -------------------------------------------------------------

  private coverageOver(windowDays: number): PanelCoverage {
    const assets = this.assets();
    const covered = assets.filter((asset) => asset.historyDays >= windowDays).length;
    const partial = covered < assets.length && covered > 0;
    return {
      covered,
      total: assets.length,
      partial,
      label: partial ? `Partial coverage — ${covered}/${assets.length} assets` : null,
    };
  }

  /** The 500-day window. */
  readonly absorptionCoverage = computed(() => this.coverageOver(ABSORPTION_WINDOW_DAYS));

  /** The 100-observation window the correlation panels share. */
  readonly correlationCoverage = computed(() => this.coverageOver(CORRELATION_WINDOW_DAYS));

  // --- toolbar --------------------------------------------------------------

  private readonly _displayRange = signal<DisplayRange>('1Y');
  readonly displayRange = this._displayRange.asReadonly();

  /**
   * A display window. It slices series that already exist and starts nothing:
   * there is no path from here into `refresh`, which is what makes "the range
   * never moves an estimation window" structural rather than a promise.
   */
  setDisplayRange(range: DisplayRange): void {
    this._displayRange.set(range);
  }

  private readonly _showThresholdAndBands = signal(true);
  readonly showThresholdAndBands = this._showThresholdAndBands.asReadonly();

  setShowThresholdAndBands(value: boolean): void {
    this._showThresholdAndBands.set(value);
  }

  private readonly _visibleSeries = signal<readonly TurbulenceSeriesId[]>([
    ...DEFAULT_TURBULENCE_SERIES,
  ]);
  readonly visibleSeries = this._visibleSeries.asReadonly();

  private readonly _seriesNote = signal<string | null>(null);
  /** Why a checkbox refused to clear. Null when nothing was refused. */
  readonly seriesNote = this._seriesNote.asReadonly();

  toggleSeries(id: TurbulenceSeriesId): void {
    const current = this._visibleSeries();
    if (current.includes(id)) {
      if (current.length === 1) {
        this._seriesNote.set(LAST_SERIES_NOTE);
        return;
      }
      this._seriesNote.set(null);
      this._visibleSeries.set(current.filter((series) => series !== id));
      return;
    }
    this._seriesNote.set(null);
    this._visibleSeries.set([...current, id]);
  }

  private slice<T>(series: readonly T[]): readonly T[] {
    const weeks = DISPLAY_RANGE_WEEKS[this._displayRange()];
    if (weeks === null || weeks >= series.length) return series;
    return series.slice(series.length - weeks);
  }

  // --- turbulence -----------------------------------------------------------

  /** `χ²_{0.75}(n)` on the raw scale. */
  readonly threshold = computed(() => chiSquaredThreshold(this.assetCount()));

  /** The same line on the `d_t/n` scale the decomposition is written in. */
  readonly thresholdNormalized = computed(() => this.threshold() / this.assetCount());

  private readonly fullTurbulenceSeries = computed<readonly TurbulencePoint[]>(() => {
    const universe = this.universe();
    if (!universe) return [];
    const scale = universe.magnitudeScale;
    const n = this.assetCount();
    const line = this.thresholdNormalized();

    return SERIES_DATES.map((date, i) => {
      const magnitudeSurprise = MAGNITUDE_SERIES[i] * scale;
      const correlationSurprise = CORRELATION_SERIES[i];
      const turbulence = magnitudeSurprise * correlationSurprise;
      return {
        date,
        turbulence,
        turbulenceRaw: turbulence * n,
        magnitudeSurprise,
        correlationSurprise,
        outlier: turbulence > line,
      };
    });
  });

  /** What the chart draws, at the selected range. */
  readonly turbulenceSeries = computed(() => this.slice(this.fullTurbulenceSeries()));

  readonly reading = computed<TurbulenceReading>(() => {
    const series = this.fullTurbulenceSeries();
    const n = this.assetCount();
    const threshold = this.threshold();
    const last = series[series.length - 1];
    const empty = { turbulence: 0, turbulenceRaw: 0, magnitudeSurprise: 0, correlationSurprise: 1 };
    const point = last ?? { date: AS_OF_DATE, outlier: false, ...empty };

    return {
      date: point.date,
      assetCount: n,
      turbulence: point.turbulence,
      turbulenceRaw: point.turbulenceRaw,
      magnitudeSurprise: point.magnitudeSurprise,
      correlationSurprise: point.correlationSurprise,
      threshold,
      thresholdNormalized: n === 0 ? 0 : threshold / n,
      outlier: point.outlier,
      thresholdNote: `${point.outlier ? 'above' : 'inside'} the chi2 threshold for ${n} assets`,
    };
  });

  /**
   * The shaded periods, cut from the series against the current line.
   *
   * Derived, so a band cannot survive a change of universe that moved the
   * threshold out from under it.
   */
  readonly outlierPeriods = computed(() => {
    const series = this.turbulenceSeries();
    const periods: {
      from: string;
      to: string;
      observations: number;
      peak: number;
      open: boolean;
    }[] = [];

    let start = -1;
    for (let i = 0; i <= series.length; i++) {
      const outlier = i < series.length && series[i].outlier;
      if (outlier && start < 0) start = i;
      if (!outlier && start >= 0) {
        const run = series.slice(start, i);
        periods.push({
          from: run[0].date,
          to: run[run.length - 1].date,
          observations: run.length,
          peak: Math.max(...run.map((point) => point.turbulence)),
          open: i === series.length,
        });
        start = -1;
      }
    }
    return periods;
  });

  // --- the per-asset decomposition -----------------------------------------

  private readonly _contributorSort = signal<ContributorSort>('abs-z');
  readonly contributorSort = this._contributorSort.asReadonly();

  setContributorSort(sort: ContributorSort): void {
    this._contributorSort.set(sort);
  }

  /**
   * Every asset's share of the current `d_t`.
   *
   * The column is normalised over whichever universe is active, so it sums to
   * one by construction rather than by the seeds happening to add up.
   */
  readonly contributors = computed<readonly AssetContribution[]>(() => {
    const seeds = this.seeds();
    if (seeds.length === 0) return [];
    const assets = new Map(this.assets().map((asset) => [asset.id, asset]));
    const scale = total(seeds.map((seed) => seed.contribution));
    const covers = CORRELATION_WINDOW_DAYS;

    const rows = seeds.map<AssetContribution>((seed) => ({
      asset: seed.id,
      name: seed.name,
      assetClass: seed.assetClass,
      zScore: seed.z,
      contribution: scale === 0 ? 0 : seed.contribution / scale,
      covered: (assets.get(seed.id)?.historyDays ?? 0) >= covers,
    }));

    const sort = this._contributorSort();
    return [...rows].sort((a, b) => {
      if (sort === 'asset') return a.asset.localeCompare(b.asset);
      if (sort === 'contribution') return b.contribution - a.contribution;
      return Math.abs(b.zScore) - Math.abs(a.zScore);
    });
  });

  /** What the table shows before "View full table". */
  readonly topContributors = computed(() => this.contributors().slice(0, TABLE_PREVIEW_ROWS));

  // --- the pairwise inspector ----------------------------------------------

  private readonly _assetX = signal<string>('');
  private readonly _assetY = signal<string>('');

  readonly assetX = computed(() => this._assetX() || (this.assetIds()[0] ?? ''));
  readonly assetY = computed(() => this._assetY() || (this.assetIds()[1] ?? ''));

  private readonly _pairNote = signal<string | null>(null);
  /** Why a selection was refused. Null when the pair is valid. */
  readonly pairNote = this._pairNote.asReadonly();

  /**
   * Sets one side of the pair, refusing the other side's asset.
   *
   * Refused rather than silently swapped: correlation surprise is defined for
   * a pair, so "X against itself" is not a reading the page can round down to
   * something else, and the panel says so.
   */
  selectAssetX(id: string): boolean {
    return this.selectSide(id, this.assetY(), this._assetX);
  }

  selectAssetY(id: string): boolean {
    return this.selectSide(id, this.assetX(), this._assetY);
  }

  private selectSide(id: string, other: string, target: { set(value: string): void }): boolean {
    if (!this.assetIds().includes(id)) return false;
    if (id === other) {
      this._pairNote.set(PAIR_DISTINCT_NOTE);
      return false;
    }
    this._pairNote.set(null);
    target.set(id);
    return true;
  }

  /** Keeps the pair inside the universe when the universe changes under it. */
  private repairPair(): void {
    const ids = this.assetIds();
    if (!ids.includes(this._assetX())) this._assetX.set(ids[0] ?? '');
    if (!ids.includes(this._assetY()) || this._assetY() === this._assetX()) {
      this._assetY.set(ids.find((id) => id !== this.assetX()) ?? '');
    }
  }

  readonly pairwise = computed<PairwiseSurprise>(() => {
    const x = SEED_BY_ID.get(this.assetX());
    const y = SEED_BY_ID.get(this.assetY());
    if (!x || !y) {
      return {
        assetX: '',
        assetY: '',
        zX: 0,
        zY: 0,
        rho: 0,
        correlationSurprise: 1,
        min: 1,
        max: 1,
        position: 0.5,
        breakdown: false,
        verdict: 'a relatively typical outcome',
      };
    }

    const rho = rhoBetween(x, y);
    const value = pairwiseSurpriseOf(x.z, y.z, rho);
    return {
      assetX: x.id,
      assetY: y.id,
      zX: x.z,
      zY: y.z,
      rho,
      ...value,
      verdict: value.breakdown
        ? 'a correlation break — the pair moved against its usual co-movement'
        : 'a relatively typical outcome',
    };
  });

  // --- the absorption ratio -------------------------------------------------

  /** The spectrum every compactness reading is taken from — always the latest. */
  private readonly currentSpectrum = computed<EigenSpectrum>(() =>
    spectrumOf(SPECTRUM_SEEDS[0], Math.max(1, this.assetCount())),
  );

  private readonly absorptionNow = computed(() => {
    const spectrum = this.currentSpectrum();
    const n = this.windows().absorptionEigenvectors;
    return total(spectrum.eigenvalues.slice(0, n).map((e) => e.value)) / this.assetCount();
  });

  /** The mean of the off-diagonal ρ the pairwise inspector reads. */
  private readonly averageCorrelation = computed(() => {
    const seeds = this.seeds();
    const values: number[] = [];
    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) values.push(rhoBetween(seeds[i], seeds[j]));
    }
    return mean(values);
  });

  private readonly fullAbsorptionSeries = computed<readonly AbsorptionPoint[]>(() => {
    if (this.assetCount() === 0) return [];
    const shift = this.absorptionNow() - ABSORPTION_SHAPE[ABSORPTION_SHAPE.length - 1];
    return SERIES_DATES.map((date, i) => {
      const deltaSigma = ABSORPTION_DELTA_SIGMA[i];
      return {
        date,
        absorptionRatio: Math.min(0.99, Math.max(0.01, ABSORPTION_SHAPE[i] + shift)),
        deltaSigma,
        spike: deltaSigma !== null && deltaSigma >= AR_SPIKE_SIGMA,
      };
    });
  });

  readonly absorptionSeries = computed(() => this.slice(this.fullAbsorptionSeries()));

  readonly absorption = computed<AbsorptionReading>(() => {
    const series = this.fullAbsorptionSeries();
    const last = series[series.length - 1];
    const deltaSigma = last?.deltaSigma ?? 0;
    return {
      absorptionRatio: last?.absorptionRatio ?? 0,
      averageCorrelation: this.averageCorrelation(),
      deltaSigma,
      deltaSigma12m: ABSORPTION_DELTA_12M,
      spike: deltaSigma >= AR_SPIKE_SIGMA,
      eigenvectors: this.windows().absorptionEigenvectors,
    };
  });

  // --- the effective rank ---------------------------------------------------

  private readonly effectiveRankNow = computed(() =>
    effectiveRankOf(this.currentSpectrum().eigenvalues.map((e) => e.value)),
  );

  private readonly fullEffectiveRankSeries = computed<readonly EffectiveRankPoint[]>(() => {
    const n = this.assetCount();
    if (n === 0) return [];
    const shift = this.effectiveRankNow() - EFFECTIVE_RANK_SHAPE[EFFECTIVE_RANK_SHAPE.length - 1];
    return SERIES_DATES.map((date, i) => ({
      date,
      effectiveRank: Math.min(n, Math.max(1, EFFECTIVE_RANK_SHAPE[i] + shift)),
    }));
  });

  readonly effectiveRankSeries = computed(() => this.slice(this.fullEffectiveRankSeries()));

  readonly effectiveRank = computed<EffectiveRankReading>(() => {
    const value = this.effectiveRankNow();
    const n = this.assetCount();
    return {
      effectiveRank: value,
      rawRank: n,
      note: `${Math.round(value)} independent directions out of a raw rank of ${n}`,
    };
  });

  // --- the eigenvalue spectrum ---------------------------------------------

  readonly spectrumWindows: readonly SpectrumWindow[] = SPECTRUM_SEEDS.map(
    ({ id, endingOn, label }) => ({ id, endingOn, label }),
  );

  private readonly _spectrumWindowId = signal(LATEST_SPECTRUM_ID);
  readonly spectrumWindowId = this._spectrumWindowId.asReadonly();

  setSpectrumWindow(id: string): void {
    if (!SPECTRUM_SEEDS.some((seed) => seed.id === id)) return;
    this._spectrumWindowId.set(id);
  }

  readonly spectrum = computed<EigenSpectrum>(() => {
    const seed = SPECTRUM_SEEDS.find((s) => s.id === this._spectrumWindowId()) ?? SPECTRUM_SEEDS[0];
    return spectrumOf(seed, Math.max(1, this.assetCount()));
  });

  // --- the participation ratio ---------------------------------------------

  /**
   * The first eigenvector, normalised to unit length.
   *
   * Without the normalisation `1/I₁` is not bounded by the asset count and the
   * localized-to-extended scale it is read on has no top. The `I₁` share each
   * asset carries is `ω⁴/Σω⁴`, which the normalisation leaves alone.
   */
  readonly pc1WeightsAll = computed<readonly Pc1Weight[]>(() => {
    const seeds = this.seeds();
    if (seeds.length === 0) return [];
    const norm = Math.sqrt(total(seeds.map((seed) => seed.pc1 ** 2)));
    const weights = seeds.map((seed) => seed.pc1 / norm);
    const i1 = total(weights.map((w) => w ** 4));
    return seeds.map((seed, i) => ({
      asset: seed.id,
      name: seed.name,
      assetClass: seed.assetClass,
      weight: weights[i],
      contributionToI1: i1 === 0 ? 0 : weights[i] ** 4 / i1,
    }));
  });

  private readonly _pc1Sort = signal<Pc1Sort>('weight');
  readonly pc1Sort = this._pc1Sort.asReadonly();

  setPc1Sort(sort: Pc1Sort): void {
    this._pc1Sort.set(sort);
  }

  /** Filters the PC1 table only. Nothing derived from the weights moves. */
  readonly pc1Filter = signal('');

  /**
   * Sorted, unfiltered — the eigenvector as a whole.
   *
   * Ranked by `|ω|`, because the sign is a direction and not a size: sorting
   * signed would bury a large negative loading at the bottom of the table,
   * which is exactly the row a reader is looking for.
   */
  readonly pc1Weights = computed<readonly Pc1Weight[]>(() => {
    const sort = this._pc1Sort();
    return [...this.pc1WeightsAll()].sort((a, b) => {
      if (sort === 'asset') return a.asset.localeCompare(b.asset);
      if (sort === 'contribution') return b.contributionToI1 - a.contributionToI1;
      return Math.abs(b.weight) - Math.abs(a.weight);
    });
  });

  readonly visiblePc1Weights = computed<readonly Pc1Weight[]>(() => {
    const needle = this.pc1Filter().trim().toLowerCase();
    if (!needle) return this.pc1Weights();
    return this.pc1Weights().filter(
      (row) => row.asset.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
    );
  });

  private readonly participationNow = computed(() => {
    const weights = this.pc1WeightsAll();
    const i1 = total(weights.map((w) => w.weight ** 4));
    return { i1, ratio: i1 === 0 ? 0 : 1 / i1 };
  });

  readonly participationSeries = computed<readonly ParticipationPoint[]>(() => {
    const n = this.assetCount();
    if (n === 0) return [];
    const shift =
      this.participationNow().ratio - PARTICIPATION_SHAPE[PARTICIPATION_SHAPE.length - 1];
    return SERIES_DATES.map((date, i) => ({
      date,
      participationRatio: Math.min(n, Math.max(1, PARTICIPATION_SHAPE[i] + shift)),
    }));
  });

  readonly participation = computed<ParticipationReading>(() => {
    const { i1, ratio } = this.participationNow();
    const n = this.assetCount();
    return {
      participationRatio: ratio,
      inverseParticipationRatio: i1,
      assetCount: n,
      state: ratio < n / 2 ? 'localized' : 'extended',
      significantComponents: this.currentSpectrum().significant,
    };
  });

  // --- PC1 growth -----------------------------------------------------------

  private readonly _pc1Lookback = signal(PC1_LOOKBACK_DEFAULT);
  readonly pc1Lookback = this._pc1Lookback.asReadonly();

  private readonly _pc1Horizon = signal(PC1_HORIZON_DEFAULT);
  readonly pc1Horizon = this._pc1Horizon.asReadonly();

  setPc1Lookback(months: number): void {
    const value = Math.round(months);
    this._pc1Lookback.set(Math.min(PC1_LOOKBACK_MAX, Math.max(PC1_LOOKBACK_MIN, value)));
  }

  setPc1Horizon(months: number): void {
    const value = Math.round(months);
    this._pc1Horizon.set(Math.min(PC1_LOOKBACK_MAX, Math.max(PC1_HORIZON_MIN, value)));
  }

  /** Past the saturation point the reading stops moving — and says so. */
  readonly pc1SaturationWarning = computed<string | null>(() =>
    this._pc1Lookback() > PC1_SATURATION_MONTHS ? PC1_SATURATION_WARNING : null,
  );

  readonly pc1Series = computed<readonly Pc1Point[]>(() => {
    if (this.assetCount() === 0) return [];
    // Levelled onto the spectrum, so the last point of the chart *is* the PC1
    // variance share the card and the eigenvalue panel print.
    const shift = this.currentSpectrum().eigenvalues[0].varianceShare - PC1_DEFAULT_LAST;
    const shares = pc1SharesAt(this._pc1Lookback()).map((share) => share + shift);
    const m = this._pc1Horizon();
    return PC1_DATES.map((month, i) => ({
      month,
      share: shares[i],
      delta: i < m ? null : shares[i] - shares[i - m],
    }));
  });

  private readonly pc1Deltas = computed<readonly number[]>(() =>
    this.pc1Series()
      .map((point) => point.delta)
      .filter((delta): delta is number => delta !== null),
  );

  readonly pc1Distribution = computed<readonly Pc1DeltaBin[]>(() => {
    const deltas = this.pc1Deltas();
    if (deltas.length === 0) return [];
    const low = Math.min(...deltas);
    const high = Math.max(...deltas);
    const width = (high - low) / PC1_DISTRIBUTION_BINS || 1;
    const current = deltas[deltas.length - 1];
    const currentBin = Math.min(PC1_DISTRIBUTION_BINS - 1, Math.floor((current - low) / width));

    return Array.from({ length: PC1_DISTRIBUTION_BINS }, (_, k) => {
      const from = low + k * width;
      const to = k === PC1_DISTRIBUTION_BINS - 1 ? high : from + width;
      const count = deltas.filter((delta) => {
        const bin = Math.min(PC1_DISTRIBUTION_BINS - 1, Math.floor((delta - low) / width));
        return bin === k;
      }).length;
      return {
        label: `${(from * 100).toFixed(1)} to ${(to * 100).toFixed(1)}pp`,
        from,
        to,
        count,
        current: k === currentBin,
      };
    });
  });

  readonly pc1 = computed<Pc1Reading>(() => {
    const series = this.pc1Series();
    const deltas = this.pc1Deltas();
    const lookback = this._pc1Lookback();
    const horizon = this._pc1Horizon();

    if (series.length === 0 || deltas.length === 0) {
      return {
        share: 0,
        changeOverLookback: 0,
        delta: 0,
        lookbackMonths: lookback,
        horizonMonths: horizon,
        peakMonth: '',
        peakDelta: 0,
        decile: 1,
        saturated: lookback > PC1_SATURATION_MONTHS,
      };
    }

    const last = series[series.length - 1];
    const peakDelta = Math.max(...deltas);
    const peak = series.find((point) => point.delta === peakDelta)!;
    const current = deltas[deltas.length - 1];
    const atOrBelow = deltas.filter((delta) => delta <= current).length;

    return {
      share: last.share,
      changeOverLookback:
        series.length > lookback ? last.share - series[series.length - 1 - lookback].share : 0,
      delta: current,
      lookbackMonths: lookback,
      horizonMonths: horizon,
      peakMonth: peak.month,
      peakDelta,
      decile: Math.max(1, Math.ceil((atOrBelow / deltas.length) * 10)),
      saturated: lookback > PC1_SATURATION_MONTHS,
    };
  });

  // --- the CURRENT READING grid --------------------------------------------

  /**
   * The six cards, each of which names what raised it.
   *
   * Only the two conditions the page spec lists raise an alert — the
   * turbulence past its χ² threshold and ΔAR past one σ — and the badge states
   * the quantity that tripped, so a filled marker can never end up beside a
   * figure that did not trip anything. That pairing is the whole reason the
   * doc carries a blocking review.
   */
  readonly indicators = computed<readonly IndicatorCard[]>(() => {
    const reading = this.reading();
    const absorption = this.absorption();
    const pc1 = this.pc1();
    const rank = this.effectiveRank();
    const line = reading.thresholdNormalized;

    const card = (
      id: IndicatorId,
      panel: TurbulencePanelId,
      value: string,
      note: string,
      alert: boolean,
      badge: string | null,
    ): IndicatorCard => ({
      id,
      label: INDICATOR_LABEL[id],
      value,
      note,
      alert,
      icon: alert ? INDICATOR_ALERT_ICON : INDICATOR_QUIET_ICON,
      badge: alert ? badge : null,
      panel,
    });

    return [
      card(
        'turbulence',
        'turbulence',
        reading.turbulence.toFixed(2),
        `normalised d_t/n · threshold ${line.toFixed(2)} at ${reading.assetCount} assets`,
        reading.outlier,
        `above the chi2 threshold of ${line.toFixed(2)} for ${reading.assetCount} assets`,
      ),
      card(
        'magnitude-surprise',
        'turbulence',
        reading.magnitudeSurprise.toFixed(2),
        reading.magnitudeSurprise >= MAGNITUDE_ELEVATED ? 'elevated' : 'typical',
        false,
        null,
      ),
      card(
        'correlation-surprise',
        'turbulence',
        reading.correlationSurprise.toFixed(2),
        reading.correlationSurprise > 1
          ? 'above one — atypical co-movement'
          : 'below one — typical co-movement',
        false,
        null,
      ),
      card(
        'absorption-ratio',
        'absorption',
        absorption.absorptionRatio.toFixed(2),
        `ΔAR 12m ${signed(absorption.deltaSigma12m, 1)}σ`,
        absorption.spike,
        `ΔAR 15d vs 1y ${signed(absorption.deltaSigma, 1)}σ`,
      ),
      card(
        'effective-rank',
        'effective-rank',
        rank.effectiveRank.toFixed(1),
        `of a raw rank of ${rank.rawRank}`,
        false,
        null,
      ),
      card(
        'pc1-share',
        'pc1-growth',
        `${Math.round(pc1.share * 100)}%`,
        `${signed(pc1.changeOverLookback * 100, 0)}pp over ${pc1.lookbackMonths}m`,
        false,
        null,
      ),
    ];
  });

  // --- lifecycle ------------------------------------------------------------

  private readonly _loadingPanels = signal<readonly TurbulencePanelId[]>([]);
  private readonly _panelErrors = signal<readonly PanelError[]>([]);

  readonly panelErrors = this._panelErrors.asReadonly();

  readonly panelStatus = computed<Record<TurbulencePanelId, PanelStatus>>(() => {
    const loading = this._loadingPanels();
    const errors = this._panelErrors();
    const status = {} as Record<TurbulencePanelId, PanelStatus>;
    for (const panel of TURBULENCE_PANELS) {
      status[panel] = loading.includes(panel)
        ? 'loading'
        : errors.some((error) => error.panel === panel)
          ? 'error'
          : 'ready';
    }
    return status;
  });

  errorFor(panel: TurbulencePanelId): PanelError | null {
    return this._panelErrors().find((error) => error.panel === panel) ?? null;
  }

  readonly emptyReason = computed<TurbulenceEmptyReason | null>(() => {
    if (this._universeId() === null) return 'no-universe';
    return this.correlationCoverage().covered < MIN_COVERED_ASSETS &&
      this.absorptionCoverage().covered < MIN_COVERED_ASSETS
      ? 'insufficient-history'
      : null;
  });

  /**
   * The page as a whole.
   *
   * One panel in error is not an error page — that is the point of holding the
   * failure against the panel — so `error` needs every panel to have failed.
   */
  readonly state = computed<PageState>(() => {
    if (this.emptyReason() !== null) return 'empty';
    if (this._loadingPanels().length === TURBULENCE_PANELS.length) return 'loading';
    if (this._panelErrors().length === TURBULENCE_PANELS.length) return 'error';
    return 'ready';
  });

  /** Re-runs one panel's computation, leaving its neighbours alone. */
  async refreshPanel(panel: TurbulencePanelId, fail = false): Promise<void> {
    if (this.emptyReason() !== null) return;

    this._loadingPanels.update((list) => (list.includes(panel) ? list : [...list, panel]));
    this._panelErrors.update((list) => list.filter((error) => error.panel !== panel));

    await delay(LATENCY_MS);

    this._loadingPanels.update((list) => list.filter((id) => id !== panel));
    if (fail) {
      this._panelErrors.update((list) => [...list, { panel, ...PANEL_FAILURE[panel] }]);
    }
  }

  /** Re-runs every indicator on the page. */
  async refresh(fail = false): Promise<void> {
    if (this.emptyReason() !== null) return;

    this._loadingPanels.set([...TURBULENCE_PANELS]);
    this._panelErrors.set([]);

    await delay(LATENCY_MS);

    this._loadingPanels.set([]);
    if (fail) {
      this._panelErrors.set(TURBULENCE_PANELS.map((panel) => ({ panel, ...PANEL_FAILURE[panel] })));
      return;
    }

    this._asOfMinutes.update((minutes) => minutes + 60);
    this._ageHours.set(0);
  }

  clearPanelError(panel: TurbulencePanelId): void {
    this._panelErrors.update((list) => list.filter((error) => error.panel !== panel));
  }

  clearError(): void {
    this._panelErrors.set([]);
  }
}

// ---------------------------------------------------------------------------

/** `+1.2` / `−0.4` — the sign is part of the reading, never dropped. */
function signed(value: number, digits: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
