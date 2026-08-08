/**
 * TypeScript mirror of the optimization-run domain types.
 *
 * Every figure here is produced by a solver or an estimator and arrives from
 * the API. The frontend formats and groups them; it never derives one.
 */

/**
 * Risk measures the dashboard can display.
 *
 * MAD is squared because that is the only form directly comparable with a
 * variance — the spec is explicit that no other measure or threshold is
 * introduced beyond the three defined here.
 */
export type RiskMeasure = 'variance' | 'semi-variance' | 'mad-squared';

export const RISK_MEASURE_LABEL: Record<RiskMeasure, string> = {
  variance: 'Variance',
  'semi-variance': 'Semi-variance',
  'mad-squared': 'MAD²',
};

/** What the value under each hero figure declares itself to be. */
export const RISK_MEASURE_CAPTION: Record<RiskMeasure, string> = {
  variance: 'variance of return',
  'semi-variance': 'semi-variance of return',
  'mad-squared': 'squared mean absolute deviation of return',
};

/** A point on the mean-risk plane: risk on x, expected return on y. */
export interface FrontierPoint {
  risk: number;
  expectedReturn: number;
}

export interface KeyMetrics {
  /** Mean of return, % p.a. */
  expectedReturn: number;
  /** Risk under each measure, % p.a. — the API supplies all three. */
  risk: Record<RiskMeasure, number>;
}

export interface OptimizationRun {
  /** ISO timestamp of the run. */
  completedAt: string;
  /** True when the run no longer reflects the latest inputs. */
  stale: boolean;
  metrics: KeyMetrics;
  frontier: readonly FrontierPoint[];
  current: FrontierPoint;
  /**
   * How many frontier points dominate the current portfolio. Zero means the
   * portfolio is itself efficient. Supplied by the API, not computed here.
   */
  dominatedBy: number;
}

export type PhaseStatus = 'completed' | 'current' | 'pending';

/** One of the seven steps of the asset-allocation process. */
export interface AllocationPhase {
  step: number;
  name: string;
  status: PhaseStatus;
}

export type ConditionStatus = 'ok' | 'watch' | 'alert';

/** One of the six conditions for a real operational advantage. */
export interface OperationalCondition {
  id: string;
  name: string;
  status: ConditionStatus;
  /** Why the condition sits in this state — shown when the card is opened. */
  detail: string;
}

// ---------------------------------------------------------------------------
// Solver run diagnostics
// ---------------------------------------------------------------------------

/**
 * Outcomes are deliberately distinct. `stopped` is a user decision, not a
 * failure, and never shares treatment with `failed`; `infeasible` and
 * `unbounded` are mathematical results, not errors.
 */
export type RunStatus =
  | 'idle'
  | 'running'
  | 'converged'
  | 'infeasible'
  | 'unbounded'
  | 'failed'
  | 'stopped';

/** Convex classes in order of increasing generality; each contains the last. */
export type ConvexClass = 'LP' | 'QP' | 'QCQP' | 'SOCP';

export const CONVEX_CHAIN: readonly ConvexClass[] = ['LP', 'QP', 'QCQP', 'SOCP'];

/**
 * Feasibility of a mixed-integer run stays `pending` until the penalty
 * residual reaches exactly zero — it cannot be a clean yes or no before that.
 */
export type FeasibilityBadge = 'pending' | 'feasible' | 'infeasible';

export interface ProblemClassification {
  /** Continuous relaxation class detected for this problem. */
  detectedClass: ConvexClass;
  /** Lots, cardinality or quota constraints put the run on the MI path. */
  hasIntegerConstraints: boolean;
  variables: number;
  inequalities: number;
  equalities: number;
  feasibility: FeasibilityBadge;
}

/** One KKT condition: a binary outcome plus the residual behind it. */
export interface KktCondition {
  name: string;
  satisfied: boolean;
  /** Shown as measured — never rounded into a false binary. */
  residual: number;
}

/** Convex path only. Absent whenever integer constraints are present. */
export interface OptimalityCertificate {
  primalValue: number;
  dualValue: number;
  dualityGap: number;
  slaterHolds: boolean;
  strongDuality: boolean;
  conditions: readonly KktCondition[];
  /** Set when the run was stopped before the certificate was complete. */
  partial: boolean;
}

/** Three distinct textual outcomes; none of them is an optimality claim. */
export type SwarmOutcome = 'in-progress' | 'converged-in-probability' | 'partial';

/** Mixed-integer path only. Absent for purely convex runs. */
export interface PenaltyDiagnostics {
  particles: number;
  topology: string;
  inertiaFrom: number;
  inertiaTo: number;
  penaltyFactor: number;
  maxHoldings: number;
  iteration: number;
  maxIterations: number;
  /** Fitness decomposes into portfolio variance plus the penalty share. */
  portfolioVariance: number;
  penaltyShare: number;
  outcome: SwarmOutcome;
}

export interface RunLogEvent {
  id: number;
  at: string;
  /** `event` rows are iteration data; `notice` rows are stream discontinuities. */
  kind: 'event' | 'notice';
  message: string;
}

export type StreamState = 'idle' | 'connected' | 'reconnecting' | 'closed';

/**
 * Quantity plotted on the convergence chart.
 *
 * `objective` is the portfolio variance VP, `fitness` is VP plus the constraint
 * penalty, and `gap` is the difference between them — so on a mixed-integer run
 * the gap reaching zero is what makes the solution feasible.
 */
export type RunMetric = 'objective' | 'fitness' | 'gap';
