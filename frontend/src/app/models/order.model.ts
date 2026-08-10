/**
 * TypeScript mirror of `proposed_orders` — the field the execution agent writes
 * into `FundState`, and the only thing it writes.
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Four pages read this vocabulary: doc 15 renders the order table, doc 16 the
 * approval queue, doc 17 the per-step pipeline counters and doc 24 the order
 * intents. They share one file so a trade cannot be at a stage in one page that
 * another page's counter does not reflect.
 *
 * Interfaces and const maps only — the rules that constrain these values
 * (the stage ceiling under a given broker posture, the pin to `pre-trade` when
 * scheduling is incomplete) are enforced in `services/execution.service.ts`,
 * because a rule that lives in a display map is a convention, not a rule.
 */

// --- pipeline ---------------------------------------------------------------

/**
 * The four mandatory steps, in the order every proposed trade walks them.
 *
 * 1. `pre-trade` — deterministic context check, no LLM call: kill-switch and
 *    hard limits. Deterministic flags always outrank probabilistic routing.
 * 2. `rule-validation` — position, exposure and concentration limits through a
 *    classic rules engine; not a formal proof.
 * 3. `human-gate` — an `interrupt()` suspends the flow until a person signs.
 * 4. `broker-adapter` — reached only when a broker is configured. This is the
 *    only step at which a real order leaves the system.
 *
 * The order of this union is load-bearing: `ORDER_STAGES` indexes it to decide
 * what "forward" means and where the pipeline stops.
 */
export type OrderStage = 'pre-trade' | 'rule-validation' | 'human-gate' | 'broker-adapter';

/** The mandatory sequence. Index position is the step number. */
export const ORDER_STAGES: readonly OrderStage[] = [
  'pre-trade',
  'rule-validation',
  'human-gate',
  'broker-adapter',
];

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  'pre-trade': 'Pre-trade check',
  'rule-validation': 'Rule validation',
  'human-gate': 'Human approval',
  'broker-adapter': 'Broker adapter',
};

/**
 * Badge-width form, for a chip or a card header that genuinely cannot hold the
 * full name. Doc 15's table uses `ORDER_STAGE_LABEL` instead — it scrolls
 * inside its own box, so it has the room, and an abbreviation there would not
 * match the Stage filter sitting above it.
 */
export const ORDER_STAGE_SHORT_LABEL: Record<OrderStage, string> = {
  'pre-trade': 'Pre-check',
  'rule-validation': 'Rule valid.',
  'human-gate': 'Human gate',
  'broker-adapter': 'Broker',
};

/**
 * Stage glyphs. Always rendered beside the word, never instead of it — a stage
 * must survive greyscale, and `✓` alone does not say which step passed.
 */
export const ORDER_STAGE_ICON: Record<OrderStage, string> = {
  'pre-trade': '●',
  'rule-validation': '◐',
  'human-gate': '○',
  'broker-adapter': '→',
};

/** What each step actually evaluates, for the pipeline cards. */
export const ORDER_STAGE_DETAIL: Record<OrderStage, string> = {
  'pre-trade': 'deterministic, no LLM call — kill-switch condition and hard limits',
  'rule-validation': 'Pydantic field + model validators — position / exposure / concentration',
  'human-gate': 'interrupt() — a person signs the approval',
  'broker-adapter': 'last step — orders exit the system here',
};

// --- status -----------------------------------------------------------------

/**
 * Where an order stands at its current stage.
 *
 * `blocked` is a rule saying no; `rejected` is a person saying no. Both stop the
 * order where it is, and both owe an explanation in words — see `statusReason`.
 */
export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  blocked: 'Blocked',
};

/**
 * Status glyphs. `blocked` and `rejected` differ deliberately: one is the rules
 * engine and one is a human, and a reader in greyscale has to tell them apart.
 */
export const ORDER_STATUS_ICON: Record<OrderStatus, string> = {
  pending: '○',
  approved: '✓',
  rejected: '⊘',
  blocked: '✕',
};

/** buy / sell, printed uppercase in every table the specs draw. */
export type OrderSide = 'buy' | 'sell';

export const ORDER_SIDE_LABEL: Record<OrderSide, string> = { buy: 'BUY', sell: 'SELL' };

/** What a human can record at the gate. Nothing here sends an order. */
export type OrderDecision = 'approve' | 'reject';

// --- the order --------------------------------------------------------------

/**
 * The Almgren-Chriss impact parameters the schedule was solved against.
 *
 * `lambda` is permanent impact (Kyle's illiquidity: 1/lambda is market depth),
 * `eta` is temporary impact, and the half-life is the characteristic time of
 * the optimal hyperbolic trajectory — a property of the name's liquidity and
 * the risk aversion, not of the horizon the trader picks.
 */
export interface ImpactParameters {
  readonly lambda: number;
  readonly eta: number;
  readonly halfLifeMinutes: number;
}

/**
 * One line of `proposed_orders`.
 *
 * `estimatedShortfallBps` and `estimatedRiskBps` are `number | null` together,
 * never one of each: an order whose scheduling has not completed has no
 * trajectory to price, so both are unknown. The service pins such an order to
 * `pre-trade` — it is not a display convention, it is the rule that keeps an
 * unpriced order out of the approval queue.
 */
export interface ProposedOrder {
  /** `TRD-2031` — the id every downstream page deep-links against. */
  readonly id: string;
  readonly symbol: string;
  readonly side: OrderSide;
  /** Signed share delta from current to target: positive buys, negative sells. */
  readonly targetQuantityDelta: number;
  /** Absolute value of the trade at the decision price, in account currency. */
  readonly notionalValue: number;
  /**
   * Quantity to trade in each scheduling interval, front-loaded.
   *
   * Sums to `|targetQuantityDelta|`. Empty when scheduling has not completed —
   * which is the same condition as the two null estimates. Residual holdings
   * (what the detail chart plots) are `|targetQuantityDelta|` minus the running
   * sum, so the sparkline and the chart read one array, not two.
   */
  readonly trajectory: readonly number[];
  /** Expected implementation shortfall E, in basis points. */
  readonly estimatedShortfallBps: number | null;
  /** Timing risk sqrt(V) of that shortfall, in basis points. */
  readonly estimatedRiskBps: number | null;
  readonly stage: OrderStage;
  readonly status: OrderStatus;
  /**
   * Why the order is where it is, in words.
   *
   * Never null for `blocked` — the spec requires a blocked order to state the
   * rule that stopped it, not just show `✕`. Also carried by `rejected` and by
   * `approved` (which reading of "approved" applies under the current posture).
   */
  readonly statusReason: string | null;
  /**
   * When the trade entered the **pipeline**, `HH:MM:SS` against `lastRun`'s date.
   *
   * Not the run clock, and not necessarily later than the order-intent decision
   * that drafted the trade. A deliberation run re-solves a pipeline that was
   * already standing, and a re-proposal which leaves a trade's sizing alone does
   * not re-queue it or reset the waiting time a person has been accruing against
   * it — so a trade can carry an entry stamp older than the run that last
   * proposed it. `ApprovalGateService` renders this as the first checkpoint of
   * the trade's audit trail, "Queued at Pre-trade check", and the order-intent
   * rows in `ReportAuditService` are dated against their run rather than against
   * this. Reading it as "when the run drafted the order" is what makes those two
   * surfaces look like they disagree when they do not.
   */
  readonly queuedAt: string;
  /**
   * Seconds spent waiting at the current stage. Frozen at the decision for an
   * order already approved, rejected or blocked. A number, not a string, so
   * "sorted by waiting time, longest first" is a sort and not a parse.
   */
  readonly waitingSeconds: number;
  /** Set only once a person has signed at the human gate. */
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly impact: ImpactParameters;
}

// --- broker posture ---------------------------------------------------------

/**
 * Whether a real order can leave the system at all.
 *
 * `not-configured` is the product's default posture, not a gap to work around:
 * with no adapter registered the human gate is the last step, approval means
 * "authorised for you to place", and no order can ever sit at
 * `broker-adapter`. `error` configures an adapter but halts sending, so the
 * ceiling is the same — the approved list simply stays intact.
 */
export type BrokerPosture = 'not-configured' | 'connected' | 'error';

export const BROKER_POSTURE_LABEL: Record<BrokerPosture, string> = {
  'not-configured': 'No broker configured',
  connected: 'Broker connected',
  error: 'Adapter error',
};

export const BROKER_POSTURE_ICON: Record<BrokerPosture, string> = {
  'not-configured': '○',
  connected: '●',
  error: '!',
};

export interface BrokerAdapterState {
  readonly posture: BrokerPosture;
  /** The adapter's name once one is registered; null in the default posture. */
  readonly adapter: string | null;
  /** Why the adapter is failing. Null unless the posture is `error`. */
  readonly detail: string | null;
}

// --- the run trace ----------------------------------------------------------

/**
 * Every tool the execution agent can reach either reads or computes.
 *
 * The kind is part of the contract, not decoration: the toolbar's claim that
 * "all tools are read-only or pure-compute" is only honest if a tool with a
 * side effect could not be represented here in the first place.
 */
export type ToolCallKind = 'read' | 'compute';

export const TOOL_CALL_KIND_LABEL: Record<ToolCallKind, string> = {
  read: 'read-only',
  compute: 'pure compute',
};

export interface ToolCall {
  readonly id: string;
  /** `09:14:02` — a stamp against the run, already formatted. */
  readonly at: string;
  readonly tool: string;
  readonly kind: ToolCallKind;
}

/** State of the execution agent's own run, as the toolbar announces it. */
export type ExecutionRunStatus = 'idle' | 'running' | 'error';

export const EXECUTION_RUN_STATUS_LABEL: Record<ExecutionRunStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  error: 'Error',
};

export const EXECUTION_RUN_STATUS_ICON: Record<ExecutionRunStatus, string> = {
  idle: '○',
  running: '●',
  error: '✗',
};

/**
 * The target portfolio a list of orders was sized against.
 *
 * Two of these — the one at generation time and the one in the newest fund
 * state — are what the stale-target warning compares. Comparing labels rather
 * than ids would call a re-published identical target stale.
 */
export interface TargetSnapshot {
  readonly id: string;
  readonly label: string;
  readonly publishedAt: string;
}
