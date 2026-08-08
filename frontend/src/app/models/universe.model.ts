/**
 * TypeScript mirror of the universe and data-estimation domain types.
 *
 * Every estimate here — mean, SD, standard error, confidence interval,
 * eigenvalues, condition number, shrinkage intensity — is produced by an
 * estimator behind the API. The page formats them; it never derives one.
 *
 * Two quantities are the exception, and both are parameter calculators the
 * spec assigns to their control rather than estimates of anything:
 * the EWMA effective window `K = ln(Υ_L)/ln(λ)`, and the required sample size
 * `T = (2σ/h)²` behind the target-CI field.
 */

export type DataFrequency = 'daily' | 'monthly';

/** Why a ticker cannot be used as-is. `ok` means no issue. */
export type AssetDataStatus = 'ok' | 'short' | 'gaps' | 'unavailable';

export const ASSET_STATUS_LABEL: Record<AssetDataStatus, string> = {
  ok: 'OK',
  short: 'short',
  gaps: 'gaps',
  unavailable: 'no data',
};

export interface UniverseAsset {
  ticker: string;
  name: string;
  assetClass: string;
  sector: string;
  /** First month of available history, `YYYY-MM`. */
  historyFrom: string;
  /** Observations available inside the selected window. */
  observations: number;
  status: AssetDataStatus;
  /** Whether the asset counts toward the universe size p. */
  included: boolean;
}

/** One winsorised tail observation, before and after replacement. */
export interface WinsorizedObservation {
  ticker: string;
  /** `YYYY-MM` of the raw extreme. */
  at: string;
  rawReturn: number;
  /** Which order statistic the value was set to, e.g. `x_(i+1)`. */
  replacement: string;
  deltaMean: number;
  deltaSd: number;
}

/** Per-asset expected-return estimate with its estimation error. */
export interface ReturnEstimate {
  ticker: string;
  /** Arithmetic mean of realised returns, % p.a. Null when there is no data. */
  mean: number | null;
  /** Standard deviation, % p.a. */
  sd: number | null;
  observations: number | null;
  /** SE = SD / √n, supplied by the API. */
  standardError: number | null;
  /** 95% interval, `[low, high]`, i.e. mean ± 2·SE. */
  confidenceInterval: readonly [number, number] | null;
  /** The interval is wide enough to be flagged in the warnings panel. */
  wide: boolean;
}

export type CovarianceEstimator = 'sample' | 'linear' | 'nonlinear' | 'ewma' | 'dcc';

export const ESTIMATOR_LABEL: Record<CovarianceEstimator, string> = {
  sample: 'Sample',
  linear: 'Linear shrinkage',
  nonlinear: 'Nonlinear shrinkage',
  ewma: 'EWMA',
  dcc: 'DCC',
};

/** One eigenvalue of the covariance matrix, raw and after shrinkage. */
export interface EigenvaluePair {
  index: number;
  sample: number;
  shrunk: number;
}

export interface CovarianceDiagnostics {
  /** p / n. Small is good; near 1 the matrix is ill-conditioned. */
  pOverN: number;
  /** Inverting an ill-conditioned matrix amplifies estimation error. */
  conditionNumber: number;
  /** Sample covariance is invertible only when p < n. */
  invertible: boolean;
  spectrum: readonly EigenvaluePair[];
  /** Linear shrinkage only — intensity ρ (PRIAL). */
  shrinkageIntensity: number | null;
  /** Nonlinear shrinkage only — per-eigenvalue intensity. */
  perEigenvalue: { average: number; min: number; max: number } | null;
  /** DCC only, read-only. Mean-reverting when α + β < 1. */
  dcc: { alpha: number; beta: number } | null;
}

export type WarningSeverity = 'blocking' | 'warning' | 'ok';

/** One line of the validation panel. */
export interface ValidationNotice {
  id: string;
  severity: WarningSeverity;
  message: string;
  /** Ticker whose fetch failed, enabling a per-row retry. */
  retryTicker?: string;
}
