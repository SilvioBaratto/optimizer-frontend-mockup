/**
 * TypeScript mirror of the optimization-problem domain types: the objective
 * being maximised or minimised, and the constraints the solver must respect.
 *
 * Feasibility is decided by the solver, not here. The page counts active
 * constraints and checks field-level validity — it never concludes that a
 * configuration is solvable.
 */

export type ObjectiveId =
  | 'mean-variance'
  | 'min-drawdown'
  | 'min-cvar'
  | 'max-return-drawdown'
  | 'equal-risk-contribution'
  | 'min-mad'
  | 'most-diversified'
  | 'mean-variance-skewness'
  | 'robust-mean-variance';

export interface ObjectiveDefinition {
  id: ObjectiveId;
  label: string;
  /**
   * Objectives that need an expected-return vector cannot be configured until
   * Views Builder has produced one — they stay visible but disabled.
   */
  requiresExpectedReturns: boolean;
  /** Read-only formula shown in the summary. */
  formula: string;
  /** Secondary name the domain also uses, shown alongside the label. */
  alsoKnownAs?: string;
}

export const OBJECTIVES: readonly ObjectiveDefinition[] = [
  { id: 'mean-variance', label: 'Mean-Variance', requiresExpectedReturns: true, formula: 'U = E(r) − ½·A·σ²' },
  { id: 'min-drawdown', label: 'Minimize Drawdown', requiresExpectedReturns: false, formula: 'min MaxDD(w)' },
  { id: 'min-cvar', label: 'Minimize CVaR', requiresExpectedReturns: false, formula: 'min CVaR_α(w)' },
  { id: 'max-return-drawdown', label: 'Max Return/Drawdown ratio', requiresExpectedReturns: true, formula: 'max E(r) / MaxDD(w)' },
  {
    id: 'equal-risk-contribution',
    label: 'Equal Risk Contribution',
    requiresExpectedReturns: false,
    formula: 'RCᵢ(w) = RCⱼ(w) ∀ i, j',
    alsoKnownAs: 'Risk Budgeting',
  },
  { id: 'min-mad', label: 'Minimize MAD', requiresExpectedReturns: false, formula: 'min E|r − E(r)|' },
  { id: 'most-diversified', label: 'Most Diversified Portfolio', requiresExpectedReturns: false, formula: 'max D(w) = w′σ / σ(w)' },
  { id: 'mean-variance-skewness', label: 'Mean-Variance-Skewness', requiresExpectedReturns: true, formula: 'U = E(r) − ½·A·σ² + λ·s³' },
  { id: 'robust-mean-variance', label: 'Robust Mean-Variance', requiresExpectedReturns: true, formula: 'max min_{μ ∈ U(θ)} U(w, μ)' },
];

/** Whether a bound must hold exactly or may be relaxed by the solver. */
export type BoundStrength = 'hard' | 'soft';

export interface WeightBound {
  id: string;
  /** Asset or asset class the bound applies to. */
  name: string;
  minPercent: number;
  /** Null means no cap. */
  maxPercent: number | null;
  lotSize: number;
  strength: BoundStrength;
}

export type SolverKind = 'exact' | 'pso';

/** Parameters that belong to one objective, preserved when switching away. */
export interface ObjectiveParameters {
  /** Mean-Variance and Mean-Variance-Skewness: risk aversion A. */
  riskAversion: number;
  /** Target-return constraint mode. */
  targetMode: 'none' | 'at-least' | 'exactly';
  targetReturn: number;
  /** CVaR and CDaR confidence level. */
  confidence: number;
  /** Skewness preference λ. */
  lambda: number;
  /** Robust MV uncertainty-set size θ. */
  theta: number;
  /** Robust MV volatility ceiling. */
  sigmaMax: number;
}

export const DEFAULT_PARAMETERS: ObjectiveParameters = {
  riskAversion: 2.5,
  targetMode: 'at-least',
  targetReturn: 6,
  confidence: 0.95,
  lambda: 0.3,
  theta: 1.0,
  sigmaMax: 12,
};
