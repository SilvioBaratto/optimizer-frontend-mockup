/**
 * Types behind `docs/13 Allocation Agent.md`.
 *
 * The agent turns a macro state vector into portfolio weights, and the page
 * exists to make the route it took inspectable: which estimation approach, with
 * which remedies, producing which weights and which risk contributions. The
 * output is written to the shared state and nowhere else — no other agent is
 * ever called from here.
 */

/**
 * The two families of method (Fondamenti §7).
 *
 * Plug-in estimates the conditional moments and then optimises over them;
 * direct modelling skips that first stage entirely. The choice is governed by
 * estimation error, which is why it is a top-level control rather than a
 * setting buried in the objective.
 */
export type EstimationApproach = 'plug-in' | 'direct';

export const APPROACH_LABEL: Record<EstimationApproach, string> = {
  'plug-in': 'Plug-in, two-stage',
  direct: 'Direct weight modeling',
};

/** Remedies applied inside the first stage (Fondamenti §9). */
export type Remedy = 'mean-shrinkage' | 'covariance-shrinkage' | 'factor-structure';

export const REMEDY_LABEL: Record<Remedy, string> = {
  'mean-shrinkage': 'Mean shrinkage',
  'covariance-shrinkage': 'Covariance shrinkage',
  'factor-structure': 'Factor structure',
};

export type ObjectiveId = 'mv-target' | 'gmvp' | 'tangency' | 'erc' | 'risk-parity';

export interface ObjectiveDefinition {
  id: ObjectiveId;
  label: string;
  /** Only the target-return objective needs π. */
  needsTargetReturn: boolean;
  note: string;
}

export const OBJECTIVES: readonly ObjectiveDefinition[] = [
  {
    id: 'mv-target',
    label: 'Mean-Variance, target return',
    needsTargetReturn: true,
    note: 'minimises variance subject to a target expected return',
  },
  {
    id: 'gmvp',
    label: 'GMVP',
    needsTargetReturn: false,
    note: 'the vertex of the frontier; its weights do not depend on expected returns',
  },
  {
    id: 'tangency',
    label: 'Tangency (max Sharpe)',
    needsTargetReturn: false,
    note: 'the risky portfolio generating the steepest capital allocation line',
  },
  {
    id: 'erc',
    label: 'ERC',
    needsTargetReturn: false,
    note: 'every asset contributes the same total risk; no closed form, solved numerically',
  },
  {
    id: 'risk-parity',
    label: 'Risk Parity (asset classes)',
    needsTargetReturn: false,
    note: 'equalises risk across classes rather than capital',
  },
];

export type DirectMethod = 'parametric' | 'state-index' | 'nonparametric';

export const DIRECT_METHOD_LABEL: Record<DirectMethod, string> = {
  parametric: 'Parametric policy (characteristics)',
  'state-index': 'State-index selection',
  nonparametric: 'Nonparametric regression',
};

export type BenchmarkWeights = 'equal' | 'cap' | 'current';

export const BENCHMARK_LABEL: Record<BenchmarkWeights, string> = {
  equal: '1/N equal',
  cap: 'Capitalisation',
  current: 'Current holdings',
};

export type Characteristic = 'value' | 'momentum' | 'size' | 'quality' | 'low-vol';

export const CHARACTERISTIC_LABEL: Record<Characteristic, string> = {
  value: 'Value',
  momentum: 'Momentum',
  size: 'Size',
  quality: 'Quality',
  'low-vol': 'Low volatility',
};

export type AssetClass = 'Equities' | 'Bonds' | 'Commodities' | 'Cash';

/** Why a row carries no weight, or carries a constrained one. */
export type AllocationFlag = 'none' | 'at-limit' | 'insufficient-data';

export const FLAG_LABEL: Record<AllocationFlag, string> = {
  none: '—',
  'at-limit': 'at limit',
  'insufficient-data': 'insufficient data — excluded',
};

export interface AllocationRow {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Weight in capital, percent. Null when the asset was excluded. */
  weight: number | null;
  /** Total risk contribution σ_i(x) as a percentage of portfolio risk. */
  riskContribution: number | null;
  flag: AllocationFlag;
  /** ∂σ/∂x_i — the marginal risk contribution, for the row detail. */
  marginalRisk: number | null;
  /** Asset volatility, percent. */
  volatility: number | null;
  /** Correlation with the portfolio. */
  correlation: number | null;
}

export interface PortfolioSummary {
  /** E[R_P], percent. */
  expectedReturn: number;
  /** σ_P, percent. */
  volatility: number;
  riskFreeRate: number;
  /** Always (E[R_P] − r_f)/σ_P — derived, never set. */
  sharpe: number;
}

/** A named point in the σ–E(r) plane. */
export interface FrontierPoint {
  label: string;
  volatility: number;
  expectedReturn: number;
  description: string;
}

/** The macro state the agent read out of the shared state (Fondamenti §7). */
export interface MacroInput {
  regime: string;
  termSpread: number;
  termSpreadNote: string;
  creditSpread: string;
  logDividendYield: number;
  /** Null until the risk agent has published one. */
  riskBudget: string | null;
  universeSize: number;
  assetClasses: readonly AssetClass[];
  /** When the macro agent last wrote this. */
  receivedAt: string;
}

export type UncertaintyLevel = 'Low' | 'Moderate' | 'High';

export interface EstimationDiagnostics {
  approach: EstimationApproach;
  uncertainty: UncertaintyLevel;
  /**
   * CE − E[ĈE] ≈ (γ/2)·tr[cov[x̂*]Σ], percent. The economic price of not
   * knowing the true parameters (Fondamenti §8).
   */
  certaintyEquivalentLoss: number;
  universeSize: number;
  excludedCount: number;
  remedies: readonly string[];
  covariancePositiveDefinite: boolean;
}

export type AgentStatus = 'idle' | 'running' | 'done' | 'error';

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  done: 'Done',
  error: 'Error',
};

export type PublicationState = 'never' | 'published' | 'stale' | 'failed';

export interface Publication {
  state: PublicationState;
  at: string | null;
  /** Present only when the publish itself failed. */
  failureDetail: string | null;
}

export interface RunLogEntry {
  at: string;
  message: string;
}
