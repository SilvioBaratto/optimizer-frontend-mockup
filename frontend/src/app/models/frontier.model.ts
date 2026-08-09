/**
 * Types behind `docs/08 Results & Frontier.md` — the optimisation result read
 * in the risk-return plane.
 *
 * Every quantity here arrives computed. The page plots and formats; it does not
 * work any of it out. That matters more on this page than most: the frontier,
 * the tangency portfolio, the diversification ratio and the risk contributions
 * are all results of a solve, and a client-side approximation of any of them
 * would be a different number wearing the same label.
 */

/** Which constraint set a frontier was computed under (Fondamenti §5). */
export type ConstraintView = 'short-allowed' | 'long-only';

export const CONSTRAINT_VIEW_LABEL: Record<ConstraintView, string> = {
  'short-allowed': 'Short-selling allowed',
  'long-only': 'Long-only',
};

/** An optimisation run that finished its frontier computation. */
export interface FrontierRun {
  id: string;
  /** Human label for the selector, e.g. `#128 · Aug 1 2026 14:32`. */
  label: string;
  /** Constraint sets this run actually computed a frontier for. */
  computed: readonly ConstraintView[];
  /** Universe or input data changed after the run finished. */
  stale: boolean;
}

/**
 * The scalar summary of one portfolio.
 *
 * `weightedAvgCorrelation` is ρ(w), the volatility-weighted mean correlation,
 * and `concentrationRatio` is CR(w); together with D(w) they satisfy
 * 1/D² = (1−ρ)·CR + ρ (Fondamenti §7). The API sends all three rather than two
 * and a derivation, so a rounding choice here can never contradict the solver.
 */
export interface PortfolioMetrics {
  /** E(r), percent. */
  expectedReturn: number;
  /** SD(R_P), percent. */
  sd: number;
  sharpe: number;
  /** D(w) = ⟨w|σ⟩ / σ(w). */
  diversificationRatio: number;
  /** ρ(w). */
  weightedAvgCorrelation: number;
  /** CR(w). */
  concentrationRatio: number;
  /** ρ_{P,M} — correlation with the most-diversified portfolio. */
  correlationWithMdp: number;
}

/**
 * One asset's line in the volatility decomposition
 * SD(R_P) = Σ x_i · SD(R_i) · Corr(R_i, R_P)  (Fondamenti §6).
 */
export interface RiskContribution {
  ticker: string;
  name: string;
  /** x_i, percent. Negative is a short position. */
  weight: number;
  /** SD(R_i), percent. */
  sdAsset: number;
  /** Corr(R_i, R_P). */
  corrWithPortfolio: number;
  /** x_i · SD_i · Corr(i,P), percent — this row's share of the portfolio SD. */
  contribution: number;
  /** The same contribution as a percentage of SD_P. */
  shareOfSd: number;
  /** β_i^P = SD_i · Corr(i,P) / SD_P. */
  betaToPortfolio: number;
}

/**
 * One point the solver returned along the frontier.
 *
 * A point the solver failed to converge on still occupies its place in the
 * sequence, carrying no portfolio — that is what draws the break in the curve
 * rather than quietly closing the gap.
 */
export interface FrontierPoint {
  /** Target return π, percent. */
  targetReturn: number;
  /** SD of the minimum-variance portfolio at π; null when not converged. */
  sd: number | null;
  converged: boolean;
  metrics: PortfolioMetrics | null;
  holdings: readonly RiskContribution[];
}

export type NotableId = 'gmvp' | 'tangency' | 'mdp' | 'selected';

export interface NotablePortfolio {
  id: NotableId;
  name: string;
  metrics: PortfolioMetrics;
  /**
   * Where the portfolio sits on the frontier, when it sits on it at all. The
   * MDP maximises D(w) and is generally not a mean-variance frontier point
   * (Fondamenti §10), so this is null for it unless the universe happens to
   * make the two coincide.
   */
  pointIndex: number | null;
}

/** An individual instrument plotted on the risk-return plane. */
export interface AssetPoint {
  ticker: string;
  /** SD_i, percent. */
  sd: number;
  /** E(r_i), percent. */
  expectedReturn: number;
}

export interface FrontierResult {
  runId: string;
  constraintView: ConstraintView;
  universeSize: number;
  /** r_f, percent. Null when no risk-free rate is configured — no CAL, no Sharpe. */
  riskFreeRate: number | null;
  /**
   * Whether the correlation matrix could be inverted. The MDP's closed form is
   * M ∝ σ⁻¹C⁻¹1 (Fondamenti §8), so a singular C leaves the MDP undefined.
   */
  correlationInvertible: boolean;
  points: readonly FrontierPoint[];
  /** The branch below the GMVP — minimum variance, but dominated. */
  inefficientBranch: readonly (readonly [number, number])[];
  assets: readonly AssetPoint[];
  notable: readonly NotablePortfolio[];
  /** The run's own target return, as an index into `points`. */
  runTargetIndex: number;
}

/** Sort orders offered over the risk-contribution table. */
export type ContributionSort = 'weight' | 'contribution' | 'share' | 'ticker';

export const CONTRIBUTION_SORT_LABEL: Record<ContributionSort, string> = {
  weight: 'Weight',
  contribution: 'Contribution',
  share: '% of portfolio σ',
  ticker: 'Ticker (A–Z)',
};
