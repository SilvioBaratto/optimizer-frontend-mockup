/**
 * TypeScript mirror of the approval domain type, and the vocabulary doc 16's
 * approval queue reads it with.
 *
 * Mirrors the API contract — never a second source of truth. Authorisation lives
 * in `approvals` inside `FundState`, never in component state: the frontend
 * shows what is being approved and collects the signature.
 *
 * **This file defines no trade, no stage and no broker posture.** The queue is a
 * projection of `proposed_orders`, so `OrderStage`, `OrderSide`, `OrderStatus`
 * and `BrokerPosture` are imported from `order.model.ts`, and the limits behind
 * rule validation from `guardrail.model.ts`. A second copy of any of them would
 * let the approval gate claim a step, a side or a routing behaviour that doc 15
 * and doc 17 contradict.
 *
 * Interfaces and const maps only — which trade may be decided, what a recorded
 * result means and when a result is still unknown are enforced in
 * `services/approval-gate.service.ts`, because a rule that lives in a display
 * map is a convention, not a rule.
 */

import type { LimitScope } from './guardrail.model';
import type { BrokerPosture, OrderSide, OrderStage, OrderStatus } from './order.model';

// --- the legacy fund-state field ---------------------------------------------

export interface PendingApproval {
  id: string;
  /** Human-readable subject, e.g. "Rebalance proposal #A-118". */
  title: string;
  /** What kind of decision is being asked for. */
  kind: string;
}

// --- the queue row -----------------------------------------------------------

/** The agent that puts trades into this queue. It proposes; it never sends. */
export const PROPOSING_AGENT = 'Execution & Orders Agent';

/**
 * One trade in the approval queue.
 *
 * A read-model over `ProposedOrder`: every field is that order's, restated in
 * the words this page prints. `quantity` is the absolute share count because
 * the side is already carried beside it, and `waiting` is the formatted twin of
 * `waitingSeconds` so the grid can print a duration without four components
 * each writing a formatter.
 */
export interface ApprovalQueueRow {
  /** `TRD-2031` — the same id doc 15 and doc 24 deep-link against. */
  readonly tradeId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  /** Absolute share count. The direction is `side`, never the sign. */
  readonly quantity: number;
  /** Value of the trade at the decision price, in account currency. */
  readonly notionalValue: number;
  /** Which of the four mandatory steps the trade is standing at. */
  readonly stage: OrderStage;
  readonly status: OrderStatus;
  /**
   * Why the trade is where it is, in words.
   *
   * Never null for a blocked trade: a rule that refused owes the reader the
   * sentence it refused with, not a red badge.
   */
  readonly statusReason: string | null;
  /** Seconds waited at that step — the sort key, so ordering is a sort not a parse. */
  readonly waitingSeconds: number;
  /** `02:15:33` — `waitingSeconds` as the card prints it. */
  readonly waiting: string;
  /** Which agent proposed the trade. */
  readonly proposedBy: string;
  /** `09:12:03` — when the trade entered the queue. */
  readonly queuedAt: string;
  /**
   * True only at the human gate, and only while nobody has answered.
   *
   * The other three steps are shown for context and are read-only: the page
   * offers no control that could move a trade a machine is still checking.
   */
  readonly decidable: boolean;
}

// --- filters -----------------------------------------------------------------

/** The step filter. Defaults to `human-gate`, the only step that takes an action. */
export type ApprovalStepFilter = OrderStage | 'all';

export const APPROVAL_STEP_FILTERS: readonly ApprovalStepFilter[] = [
  'all',
  'pre-trade',
  'rule-validation',
  'human-gate',
  'broker-adapter',
];

export const APPROVAL_STEP_FILTER_LABEL: Record<ApprovalStepFilter, string> = {
  all: 'All steps',
  'pre-trade': 'Pre-check',
  'rule-validation': 'Rule Validation',
  'human-gate': 'Human Gate',
  'broker-adapter': 'Broker Adapter',
};

/**
 * The status filter, as the spec names its four options.
 *
 * `blocked` is deliberately absent: a rule already answered for that trade, so
 * nobody is waiting on a person and it does not belong under Pending. It is
 * reachable under All, where its own badge says what stopped it.
 */
export type ApprovalStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export const APPROVAL_STATUS_FILTERS: readonly ApprovalStatusFilter[] = [
  'all',
  'pending',
  'approved',
  'rejected',
];

export const APPROVAL_STATUS_FILTER_LABEL: Record<ApprovalStatusFilter, string> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** The one ordering the queue has, stated in the collection bar. */
export const QUEUE_SORT_SUMMARY = 'sorted by waiting time, longest first';

// --- the automated checks ----------------------------------------------------

/**
 * What an automated check returned for one trade.
 *
 * `pending` is the whole point of the union. A check that has not run, or whose
 * verdict has not come back, is reported as unknown — never as a pass because
 * the trade looks fine, and never as a fail because it is stuck. A fabricated
 * verdict on this page authorises money to move.
 */
export type CheckResult = 'pass' | 'fail' | 'pending';

export const CHECK_RESULT_LABEL: Record<CheckResult, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  pending: 'RESULT PENDING',
};

/** Always rendered beside the word, never instead of it. */
export const CHECK_RESULT_ICON: Record<CheckResult, string> = {
  pass: '✓',
  fail: '✕',
  pending: '○',
};

/** How a per-limit row reads it: a limit is `within`, `breached`, or not yet answered. */
export const RULE_RESULT_LABEL: Record<CheckResult, string> = {
  pass: 'within',
  fail: 'breached',
  pending: 'result pending',
};

/**
 * The deterministic pre-check, step one of the mandatory four.
 *
 * The kill-switch is carried with the result rather than left to the reader:
 * "PASS" means nothing without saying whether trading was halted at the time,
 * and an unknown kill-switch makes the whole pre-check unknown.
 */
export interface PreCheckOutcome {
  readonly result: CheckResult;
  /** Whether trading is halted, as the guardrail page holds it. */
  readonly killSwitchEngaged: boolean;
  /** False when the kill-switch state could not be read — the result is then `pending`. */
  readonly killSwitchKnown: boolean;
  /** One sentence explaining the result. Never null: a verdict owes words. */
  readonly detail: string;
}

/** The three limit scopes the rules engine checks. The kill-switch is step one, not here. */
export type RuleScope = Exclude<LimitScope, 'kill-switch'>;

export const RULE_SCOPE_LABEL: Record<RuleScope, string> = {
  position: 'Position limit',
  exposure: 'Exposure limit',
  concentration: 'Concentration limit',
};

/**
 * One configured hard limit's verdict for one trade.
 *
 * The limit is the guardrail page's — `limitId` and `name` are its own — so the
 * rows here cannot name a rule that page does not enforce.
 */
export interface RuleCheck {
  readonly limitId: string;
  /** The limit's configured name, e.g. `Max single-name concentration`. */
  readonly name: string;
  readonly scope: RuleScope;
  /** `Concentration limit` — the row label the wireframe prints. */
  readonly label: string;
  readonly result: CheckResult;
  /** The validator's own words when it refused. Null otherwise. */
  readonly detail: string | null;
}

/** Both automated steps' results for the selected trade. */
export interface AutomatedChecks {
  readonly tradeId: string;
  readonly preCheck: PreCheckOutcome;
  /** One row per enabled limit of a rule-validation scope. */
  readonly rules: readonly RuleCheck[];
  /** True while at least one limit's verdict has not come back. */
  readonly rulesPending: boolean;
}

// --- the step tracker --------------------------------------------------------

/**
 * Where the selected trade stands relative to one of the four steps.
 *
 * `unreachable` is not a synonym for `upcoming`: the broker adapter with no
 * adapter registered is not a step this trade has yet to reach, it is a step
 * that does not run at all under the current posture.
 */
export type StepState = 'passed' | 'current' | 'upcoming' | 'unreachable';

export const STEP_STATE_LABEL: Record<StepState, string> = {
  passed: 'Passed',
  current: 'Current',
  upcoming: 'Not yet reached',
  unreachable: 'Not reached — no broker configured',
};

export const STEP_STATE_ICON: Record<StepState, string> = {
  passed: '✓',
  current: '●',
  upcoming: '○',
  unreachable: '·',
};

/** Appended to the current step's visible label, so the position survives greyscale. */
export const CURRENT_STEP_SUFFIX = '— current';

/** One node of the mandatory four-step path, for the selected trade. */
export interface ApprovalStep {
  readonly stage: OrderStage;
  /** 1-4, the position in the mandatory sequence. */
  readonly step: number;
  readonly label: string;
  readonly state: StepState;
  /** True for exactly one step of a selected trade, and `aria-current="step"`. */
  readonly current: boolean;
}

// --- the decision ------------------------------------------------------------

export type ApprovalOutcome = 'approved' | 'rejected';

export const APPROVAL_OUTCOME_LABEL: Record<ApprovalOutcome, string> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
};

export const APPROVAL_OUTCOME_ICON: Record<ApprovalOutcome, string> = {
  approved: '✓',
  rejected: '⊘',
};

/**
 * The two readings of "approved", which the page must never leave to inference.
 *
 * With an adapter registered and sending, approving hands the order to it and a
 * real order leaves the system. With no adapter — the default posture — the
 * human gate is the last step and approving means "approved so that you can
 * place it", which is a different fact about the world and is recorded as one.
 */
export type ApprovalEffect = 'auto-routed' | 'manual-placement';

export const APPROVAL_EFFECT_LABEL: Record<ApprovalEffect, string> = {
  'auto-routed': 'routed to the broker',
  'manual-placement': 'manual placement',
};

export const APPROVAL_EFFECT_DETAIL: Record<ApprovalEffect, string> = {
  'auto-routed':
    'Approved and routed automatically — the order was handed to the configured broker adapter.',
  'manual-placement':
    'Approved for manual placement — with no broker adapter configured the order does not leave the system.',
};

/**
 * The sentence the decision row prints before anything is pressed.
 *
 * Keyed by posture and by nothing else, so it says exactly what the banner at
 * the top of the page says. `error` reads like `not-configured` on purpose: a
 * registered adapter that is failing has sending halted, so approving still
 * cannot route.
 */
export const DECISION_EFFECT_SENTENCE: Record<BrokerPosture, string> = {
  'not-configured':
    'No broker configured — approving authorizes manual placement, not auto-routing.',
  connected: 'Broker active — approving routes the order to the adapter automatically.',
  error:
    'Adapter error — sending is halted, so approving authorizes manual placement, not auto-routing.',
};

/**
 * What the posture made an approval mean, written down when it was made.
 *
 * Stored rather than recomputed. Re-deriving the reading of a past approval
 * from today's posture would relabel every trade approved before an adapter was
 * registered as "routed to the broker" — orders that in fact never left the
 * system.
 */
export interface DecisionEffectRecord {
  readonly tradeId: string;
  /** Null for a rejection: nothing was routed and nothing was authorised. */
  readonly effect: ApprovalEffect | null;
  /** The posture in force at the moment of the decision. */
  readonly posture: BrokerPosture;
  /**
   * The optional note the decider typed. Null when none was given.
   *
   * Held here because an approval does not keep it: the order's own
   * `statusReason` states which reading of "approved" applied, and overwriting
   * that with free text would lose the distinction this page exists to make.
   */
  readonly note: string | null;
}

/**
 * One recorded decision, as the historical-outcome card reads it.
 *
 * A join, not a copy: the outcome, the signature and the timestamp are the
 * order's own, and only `effect` and `posture` are held by the approval gate,
 * because only those two cannot be recovered afterwards.
 */
export interface ApprovalDecision {
  readonly tradeId: string;
  readonly outcome: ApprovalOutcome;
  /** The note recorded with the decision. Null when none was given. */
  readonly note: string | null;
  readonly decidedBy: string;
  /** `09:44:39` — when the signature was recorded. */
  readonly decidedAt: string;
  /** Null for a rejection, or when no reading was recorded with the approval. */
  readonly effect: ApprovalEffect | null;
  readonly posture: BrokerPosture;
}

/** What `decide()` hands back. `decision` is set only when `ok` is true. */
export interface ApprovalDecisionResult {
  readonly ok: boolean;
  /** Blocking message for the dialog. Null only when `ok` is true. */
  readonly error: string | null;
  readonly decision: ApprovalDecision | null;
}

// --- the audit trail ---------------------------------------------------------

/**
 * One checkpointed transition of one trade along the four steps.
 *
 * Every transition is checkpointed, which is what makes the trail replayable
 * rather than a log of the interesting bits. `date` and `at` are kept apart so
 * a row prints its time without the reader parsing a stamp, and sort as one
 * zero-padded string.
 */
export interface ApprovalCheckpoint {
  readonly id: string;
  readonly tradeId: string;
  /** `2026-08-01`. */
  readonly date: string;
  /** `09:12:03` or `09:12` — whatever precision the source recorded. */
  readonly at: string;
  readonly stage: OrderStage;
  /** `Rule Validation — PASS`. */
  readonly label: string;
  /** The verbatim message behind the checkpoint, when there was one. */
  readonly detail: string | null;
}

// --- copy --------------------------------------------------------------------

/** ErrorState message when the queue itself could not be read. */
export const QUEUE_ERROR_MESSAGE = 'Unable to load the approval queue';

/** ErrorState message when only the selected trade's detail failed. */
export const DETAIL_ERROR_MESSAGE = 'Unable to load this trade’s checks and audit trail';

/** EmptyState title when the filters match nothing. */
export const NO_TRADES_MESSAGE = 'No trades waiting at this step.';

/** EmptyState detail beside it — the way out is widening the filters. */
export const NO_TRADES_DETAIL =
  'Switch the step filter to All steps, choose another status, or clear the search to see the rest of the queue.';

/** Refused decision: the trade is not standing at the human gate. */
export const NOT_AT_GATE =
  'This trade is not at the human gate — only a trade waiting there can be approved or rejected.';

/** Refused decision: a rule or a person already answered for this trade. */
export const ALREADY_DECIDED =
  'This trade has already been decided — its outcome cannot be rewritten.';

/**
 * A second confirmation arrived while the first was still in flight.
 *
 * Not a failure, and deliberately not worded as one: the first write is still
 * running, and answering the duplicate with "nothing was submitted" would tell
 * the decider the opposite of what is about to happen.
 */
export const DECISION_IN_FLIGHT =
  'This decision is already being recorded — wait for it to land rather than submitting it twice.';

/** The write did not land. Nothing was recorded and nothing moved. */
export const DECISION_WRITE_FAILURE =
  'Could not record the decision: nothing was submitted and the trade is still waiting at the gate. ' +
  'Your note has been kept — retry, or check the orchestrator connection.';
