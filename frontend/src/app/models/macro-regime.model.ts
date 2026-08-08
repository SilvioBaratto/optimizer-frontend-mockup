/**
 * Types behind `docs/12 Macro & Regimes Agent.md`.
 *
 * The macro agent's whole job is to write four things into the shared state:
 * which regime the market is in and with what probability, the views on
 * expected returns and covariances that follow from it, the stress scenarios,
 * and the signals that survived validation. Everything modelled here exists to
 * assemble that payload — and the payload is written once, deliberately, never
 * as a side effect of looking at the page.
 */

/** Which regime-switching model the filter was run under. */
export type RegimeModelId = 'four-state' | 'two-state-bear-bull' | 'hamilton';

export interface RegimeModelDefinition {
  id: RegimeModelId;
  label: string;
  /** The states this model distinguishes, in reading order. */
  states: readonly string[];
}

export const REGIME_MODELS: readonly RegimeModelDefinition[] = [
  {
    id: 'four-state',
    label: '4-State multi-asset',
    states: ['Crash', 'Slow Growth', 'Bull', 'Recovery'],
  },
  { id: 'two-state-bear-bull', label: '2-State Bear/Bull', states: ['Bear', 'Bull'] },
  { id: 'hamilton', label: '2-State Growth/Recession (Hamilton)', states: ['Recession', 'Expansion'] },
];

export type LookbackWindow = '1Y' | '3Y' | '5Y' | 'full';

export const LOOKBACK_LABEL: Record<LookbackWindow, string> = {
  '1Y': '1 year',
  '3Y': '3 years',
  '5Y': '5 years',
  full: 'Full sample',
};

/** One state of the fitted model, with its filtered probability. */
export interface RegimeState {
  name: string;
  /** Filtered probability P(s_t | I_t), percent. */
  probability: number;
  /**
   * Expected run 1/(1 − p_ii), in months. A regime's persistence is what makes
   * it worth conditioning on: a state that lasts two months is a different
   * object from one that lasts eight.
   */
  expectedRunMonths: number;
  /** Plain-language reading of what the state is. */
  description: string;
}

export interface RegimeEstimate {
  model: RegimeModelId;
  lookback: LookbackWindow;
  states: readonly RegimeState[];
  /** The modal state — the one the views are formed from. */
  driver: string;
  /** Filtered probability of the driver, percent. */
  driverProbability: number;
  /**
   * Two states within a few points of each other. The badge says so in words:
   * a 51/49 split and a 90/10 split are not the same claim, and colour alone
   * cannot carry that.
   */
  elevatedUncertainty: boolean;
  /** When the recursive filter last ran. */
  lastRun: string;
  /** Vintage of the macro data the run used. */
  vintage: string;
  /** 24 months of filtered probability for the driver state. */
  history: readonly { month: string; probability: number }[];
  /** The secondary two-state reading, always shown alongside. */
  secondaryReading: string;
}

export type AssetClass =
  | 'US Equity'
  | 'Intl Equity'
  | 'Govt Bonds'
  | 'Credit'
  | 'Commodities'
  | 'Currencies';

export type AssetClassFilter = 'all' | 'equities' | 'bonds' | 'credit' | 'commodities' | 'currencies';

export const ASSET_CLASS_FILTER_LABEL: Record<AssetClassFilter, string> = {
  all: 'All',
  equities: 'Equities',
  bonds: 'Bonds',
  credit: 'Credit',
  commodities: 'Commodities',
  currencies: 'Currencies',
};

/**
 * One view the regime implies, as a departure from equilibrium.
 *
 * Black-Litterman ingests departures, not levels: the regime supplies the
 * economic content — a bearish state justifies lower expected returns and
 * higher correlations — and the magnitude is what the estimator was given.
 */
export interface RegimeView {
  assetClass: AssetClass;
  /** Departure on the expected return, percentage points. */
  expectedReturnDelta: number;
  /** Departure on the correlation with the rest of the book. */
  correlationDelta: number;
  /** Whether the class gains or loses when growth is strong. */
  growthSensitive: boolean;
}

export type ViewConfidence = 'Low' | 'Moderate' | 'High';

export type SignalStatus = 'validated' | 'excluded' | 'stale';

/**
 * One predictive signal the agent offers to the shared state.
 *
 * `excluded` always carries its reason. A signal dropped without one is
 * indistinguishable from a signal nobody got round to testing.
 */
export interface PredictiveSignal {
  id: string;
  name: string;
  reading: string;
  status: SignalStatus;
  /** Present when the signal was excluded, or flagged stale. */
  reason: string | null;
  /** Out-of-sample R², percent. Negative means the historical mean won. */
  outOfSampleR2: number | null;
  /** Where the full treatment of this signal lives. */
  route: string;
}

/** One systematic factor's share of the worst-case loss. */
export interface LossContribution {
  factor: string;
  /** MLC(i), percent of the total loss in the worst-case scenario. */
  share: number;
}

export interface StressSnapshot {
  /** k — the Mahalanobis radius bounding the domain of admissibility. */
  radius: number;
  /** Worst expected loss over that domain, percent. */
  maximumLoss: number;
  contributions: readonly LossContribution[];
  /**
   * Σ MLC. Below 100% means the factors interact negatively — moving together
   * does damage that no single factor accounts for, which is exactly the case
   * a hedge built factor by factor would miss.
   */
  contributionSum: number;
  /** Factors pinned to a chosen value; the rest sit at their conditional mean. */
  fixedFactors: readonly { factor: string; value: number }[];
  /** Reverse mode starts from a loss and searches for the scenario producing it. */
  reverseMode: boolean;
  reverseTarget: number | null;
}

/** One line of the payload the agent would write to the shared state. */
export interface PayloadLine {
  id: string;
  label: string;
  currentValue: string;
  previousValue: string;
  changed: boolean;
}

export interface HandoffEntry {
  id: string;
  at: string;
  author: string;
  summary: string;
  driver: string;
}

/** The six sections of the page. */
export type MacroTab =
  | 'overview'
  | 'regime-filter'
  | 'signals'
  | 'correlations'
  | 'stress'
  | 'handoff';

export interface MacroTabDefinition {
  id: MacroTab;
  /** Full name, used as the panel's heading. */
  title: string;
  /** Abbreviated label for the tab strip. */
  label: string;
}

export const MACRO_TABS: readonly MacroTabDefinition[] = [
  { id: 'overview', title: 'Overview', label: 'Overview' },
  { id: 'regime-filter', title: 'Regime Filter & Nowcast', label: 'Regime Filter' },
  { id: 'signals', title: 'Predictive Signals', label: 'Predictive Signals' },
  { id: 'correlations', title: 'Correlations by Regime', label: 'Correlations' },
  { id: 'stress', title: 'Stress Scenarios', label: 'Stress' },
  { id: 'handoff', title: 'Handoff Log', label: 'Handoff' },
];

/** Correlation between one pair of asset classes, under one regime. */
export interface RegimeCorrelation {
  pair: string;
  /** Correlation by state name. */
  byState: Record<string, number>;
}
