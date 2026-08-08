/**
 * TypeScript mirror of the factor-model and alpha-signal domain types.
 *
 * Exposures, R², variance shares, information coefficients and the resulting
 * portfolio beta are all produced by estimators behind the API. The page
 * displays and groups them; it derives none of them.
 */

/** The three routes to specifying factors. */
export type FactorSource = 'macroeconomic' | 'style' | 'statistical';

export const FACTOR_SOURCE_LABEL: Record<FactorSource, string> = {
  macroeconomic: 'Macroeconomic',
  style: 'Style',
  statistical: 'Statistical',
};

export type ModelStatus = 'draft' | 'estimating' | 'estimated';

/** Whether factor returns are centred or expressed as traded portfolios. */
export type Centering = 'centered' | 'traded';

/** Variance share of one retained principal component. */
export interface VarianceComponent {
  name: string;
  /** Share of total variance explained, in percent. */
  share: number;
}

/** One asset's exposures across the model's factors, plus fit. */
export interface FactorExposure {
  ticker: string;
  /** One loading per factor, aligned with `FactorModel.factorNames`. */
  betas: readonly number[];
  rSquared: number;
}

export interface FactorModel {
  id: string;
  name: string;
  source: FactorSource;
  /** Number of factors K. */
  k: number;
  centering: Centering;
  status: ModelStatus;
  /** `YYYY-MM-DD HH:MM` of the last completed estimation, if any. */
  lastRun: string | null;
  /**
   * The upstream universe changed after the last estimation, so the exposures
   * on screen no longer correspond to the current asset set.
   */
  stale: boolean;
  factorNames: readonly string[];
  /** Populated for statistical models; named factors list instead. */
  variance: readonly VarianceComponent[];
  exposures: readonly FactorExposure[];
  /** Assets dropped for insufficient history in the requested window. */
  excludedAssets: number;
}

/** Category an alpha signal belongs to. */
export type SignalCategory = 'size' | 'value' | 'momentum' | 'ddm-irr' | 'ddm-npv' | 'comparative' | 'returns-based';

export const SIGNAL_CATEGORY_LABEL: Record<SignalCategory, string> = {
  size: 'Size',
  value: 'Value',
  momentum: 'Momentum',
  'ddm-irr': 'DDM-IRR',
  'ddm-npv': 'DDM-NPV',
  comparative: 'Comparative',
  'returns-based': 'Returns-based',
};

export interface AlphaSignal {
  id: string;
  name: string;
  category: SignalCategory;
  /** Estimated information coefficient, between -1 and 1. */
  ic: number;
  /** The signal has an IC but is not yet part of any combination. */
  combined: boolean;
}

/** A row of the fundamentals screener's filtered universe. */
export interface ScreenedName {
  ticker: string;
  name: string;
  priceToBook: number;
  priceToEarnings: number;
  evToEbitda: number;
}

/**
 * Outcomes of the fundamental law of active management.
 *
 * IR ≈ IC · √breadth, adjusted for signal correlation; supplied by the API
 * rather than recomputed here.
 */
export interface FundamentalLawOutcome {
  informationRatio: number;
  /** Expected value added, in percent. */
  expectedValueAdded: number;
  /** Signal decay, in months. */
  decayMonths: number;
  /** Implied annual turnover, in percent. */
  turnover: number;
}
