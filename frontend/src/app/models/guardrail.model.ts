/**
 * TypeScript mirror of the `guardrail` domain type — the deterministic pass/fail
 * boundary that runs *before* any model call.
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Two things live here and nowhere else: the kill-switch, and the hard limits
 * implemented as Pydantic validators. Doc 16 reads the kill-switch to decide
 * whether its own pre-check can pass, so this is a cross-page contract rather
 * than one page's state.
 *
 * The pipeline vocabulary is *not* redefined here. `OrderStage` and the broker
 * posture come from `order.model.ts`, because doc 15 owns the order list and a
 * second copy of "which step is last" would let two pages disagree about
 * whether a trade can leave the system.
 *
 * Interfaces and const maps only. The rules — which drafts a validator accepts,
 * how a failed write must behave — live in `services/guardrail.service.ts`,
 * because a rule that lives in a display map is a convention, not a rule.
 */

import type { OrderStage } from './order.model';

// --- the kill-switch ---------------------------------------------------------

/**
 * The two readings of the highest-priority control in the product.
 *
 * A boolean carries the state; this names it. The words are what the HeroStatCard
 * prints and what the assertive live region announces, so the two can never
 * describe the same reading differently.
 */
export type KillSwitchStatus = 'trading-enabled' | 'engaged';

export const KILL_SWITCH_STATUS_LABEL: Record<KillSwitchStatus, string> = {
  'trading-enabled': 'TRADING ENABLED',
  engaged: 'KILL-SWITCH ENGAGED',
};

/** Always rendered beside the word, never instead of it. */
export const KILL_SWITCH_STATUS_ICON: Record<KillSwitchStatus, string> = {
  'trading-enabled': '●',
  engaged: '✕',
};

/** What the `aria-live="assertive"` region says when the state changes. */
export const KILL_SWITCH_ANNOUNCEMENT: Record<KillSwitchStatus, string> = {
  'trading-enabled': 'Kill-switch released, trading enabled',
  engaged: 'Kill-switch engaged, all trading halted',
};

/** Label on the primary action, which reads as the change it would make. */
export const KILL_SWITCH_ACTION_LABEL: Record<KillSwitchStatus, string> = {
  'trading-enabled': 'Engage kill-switch',
  engaged: 'Release kill-switch',
};

/**
 * The kill-switch as the backend holds it.
 *
 * `changedBy` and `reason` are not decoration: the change is irreversible
 * without a second explicit act, so the record of who asked for it and why is
 * the only thing that makes the next operator's decision informed.
 */
export interface KillSwitchState {
  /** True halts trading. Trading enabled is the default. */
  readonly engaged: boolean;
  /** `2026-07-29 14:02 UTC` — when the state above was last written. */
  readonly changedAt: string;
  /** The actor who wrote it. */
  readonly changedBy: string;
  /** The mandatory rationale recorded with that write. Never empty. */
  readonly reason: string;
}

/**
 * The outcome of a kill-switch write.
 *
 * The whole point of returning a result rather than a `void` promise: a write
 * that fails must be *visible*. An operator who believes trading is halted when
 * it is not is the exact hazard this page exists to prevent, so the caller is
 * handed the failure and the state it did not change, and keeps its dialog open.
 */
export interface KillSwitchWriteResult {
  readonly ok: boolean;
  /** Blocking message for the dialog. Null only when `ok` is true. */
  readonly error: string | null;
  /** The state as the service holds it now — identical to the previous one when `ok` is false. */
  readonly state: KillSwitchState;
}

/** Shown in the confirmation dialog when the write did not land. */
export const KILL_SWITCH_WRITE_FAILURE =
  'Could not confirm: the kill-switch was NOT changed and the current state is unchanged. ' +
  'The reason you entered has been kept — retry, or check the orchestrator connection.';

/** Shown in the dialog when confirm is pressed with no rationale. */
export const KILL_SWITCH_REASON_REQUIRED =
  'A reason is required: the change is recorded in the audit trail with your name and the time.';

/** The HeroStatCard's ErrorState when the state could not be read at all. */
export const KILL_SWITCH_UNKNOWN = 'Kill-switch status unknown — treat as unsafe';

/** Standing reminder under the status line. */
export const PRE_CHECK_NOTE = 'Deterministic pre-check runs before any LLM routing.';

// --- hard limits -------------------------------------------------------------

/** What a hard limit constrains. */
export type LimitScope = 'position' | 'exposure' | 'concentration' | 'kill-switch';

export const LIMIT_SCOPES: readonly LimitScope[] = [
  'position',
  'exposure',
  'concentration',
  'kill-switch',
];

export const LIMIT_SCOPE_LABEL: Record<LimitScope, string> = {
  position: 'position',
  exposure: 'exposure',
  concentration: 'concentration',
  'kill-switch': 'kill-switch',
};

/**
 * Which Pydantic decorator implements the limit.
 *
 * Informative only. It names the decorator already frozen in the architecture —
 * `@field_validator` for a single field, `@model_validator(mode='after')` for a
 * cross-field check — and introduces no second rules engine. Nothing in the
 * application branches on it.
 */
export type ValidatorKind = 'field_validator' | 'model_validator_after';

export const VALIDATOR_KIND_LABEL: Record<ValidatorKind, string> = {
  field_validator: '@field_validator',
  model_validator_after: '@model_validator(after)',
};

/** What the last evaluation of a limit found. */
export type LimitStatus = 'ok' | 'breach';

export const LIMIT_STATUS_LABEL: Record<LimitStatus, string> = { ok: 'OK', breach: 'BREACH' };

/** Icon plus word, always. A badge must survive greyscale. */
export const LIMIT_STATUS_ICON: Record<LimitStatus, string> = { ok: '✓', breach: '✕' };

/** Whether the limit is being enforced. A disabled limit still occupies its row. */
export const LIMIT_ENABLED_LABEL: Record<'enabled' | 'disabled', string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
};

/**
 * The unit the threshold is quoted in.
 *
 * `none` is for a limit that has no numeric threshold at all — the portfolio
 * kill condition is a predicate, not a bound — and renders as `—`, never as 0.
 */
export type LimitUnit = 'pct-nav' | 'absolute' | 'none';

export const LIMIT_UNIT_LABEL: Record<LimitUnit, string> = {
  'pct-nav': '% NAV',
  absolute: 'EUR',
  none: '—',
};

/**
 * One configured hard limit.
 *
 * `status` is what the last evaluation found, not what the current queue looks
 * like: a limit in BREACH stays in BREACH — visible and highlighted — after the
 * trade that breached it has been approved, rejected or cleared, because the
 * breach is a fact about the book and not about that one order.
 */
export interface HardLimit {
  readonly id: string;
  readonly name: string;
  readonly scope: LimitScope;
  readonly validator: ValidatorKind;
  /**
   * The validator function's own name, e.g. `concentration_limit`.
   *
   * This is the string the audit trail records as the actor that raised a
   * failure, which is what makes "View log" a filter rather than a guess.
   */
  readonly validatorName: string;
  /** The bound. Null when the scope has no numeric threshold. */
  readonly threshold: number | null;
  readonly unit: LimitUnit;
  readonly enabled: boolean;
  readonly status: LimitStatus;
  /** The validator's own words about the breach. Null when the status is OK. */
  readonly breachDetail: string | null;
}

/** What the Add/Edit form submits. `id` is null for a limit that does not exist yet. */
export interface LimitDraft {
  readonly id: string | null;
  readonly name: string;
  readonly scope: LimitScope;
  readonly validator: ValidatorKind;
  readonly threshold: number | null;
  readonly unit: LimitUnit;
  readonly enabled: boolean;
}

/** The two exception types the pass/fail boundary is allowed to raise. */
export type GuardrailErrorType = 'ValueError' | 'PydanticCustomError';

/**
 * One rejection from the pass/fail boundary.
 *
 * `message` is the validator's original text and the form prints it verbatim.
 * Paraphrasing it would put the screen and the backend log at odds about why a
 * limit was refused, which is the one thing an audit trail cannot tolerate.
 */
export interface LimitValidationError {
  readonly type: GuardrailErrorType;
  /** The field the validator is attached to. Null for a model validator. */
  readonly field: string | null;
  readonly message: string;
}

/** The outcome of a save. `limit` is set only when `ok` is true. */
export interface LimitSaveResult {
  readonly ok: boolean;
  readonly errors: readonly LimitValidationError[];
  readonly limit: HardLimit | null;
}

/**
 * EmptyState copy for a grid with no limits configured — the spec's sentence,
 * verbatim, in one place.
 *
 * An `EmptyState` prints a title *and* a detail, so the sentence is also
 * published split at its em dash. Handing the whole of it to the detail under a
 * title that repeats its opening clause printed "No limits configured yet"
 * twice, one line apart.
 */
export const NO_LIMITS_TITLE = 'No limits configured yet';

export const NO_LIMITS_DETAIL =
  'Trades will still pass through the deterministic pre-check for the kill-switch condition; ' +
  'add a limit to enforce position, exposure or concentration bounds.';

export const NO_LIMITS_MESSAGE =
  'No limits configured yet — trades will still pass through the deterministic pre-check for the ' +
  'kill-switch condition; add a limit to enforce position, exposure or concentration bounds.';

/**
 * Disabling a kill-switch-scope limit moves the pass/fail boundary just as the
 * global switch does, so it is held behind the same rationale.
 */
export const LIMIT_REASON_REQUIRED =
  'Disabling a kill-switch limit changes the pass/fail boundary — a reason is required.';

// --- the approval pipeline ---------------------------------------------------

/**
 * The four mandatory steps as this page titles them.
 *
 * Deliberately a separate map from `ORDER_STAGE_LABEL`: doc 15's table calls
 * step one "Pre-trade check" beside a Stage filter that has to match, and doc
 * 17's card calls it "Pre-check" in a numbered sequence. Same stages, two
 * captions, one union.
 */
export const PIPELINE_STEP_LABEL: Record<OrderStage, string> = {
  'pre-trade': 'Pre-check',
  'rule-validation': 'Rule Validation',
  'human-gate': 'Human Approval',
  'broker-adapter': 'Broker Adapter',
};

/** What the step is, in the card's top line. */
export const PIPELINE_STEP_DETAIL: Record<OrderStage, string> = {
  'pre-trade': 'deterministic, no LLM call',
  'rule-validation': 'Pydantic field + model validators',
  'human-gate': 'interrupt() → Human Approval Gate',
  'broker-adapter': 'last step — orders exit here',
};

/**
 * What the step evaluates, in the card's second line.
 *
 * Null where something else stands in that slot: the human gate carries a
 * CrossPageLink, and the broker adapter carries its posture, which is doc 15's
 * to publish.
 */
export const PIPELINE_STEP_SUBTITLE: Record<OrderStage, string | null> = {
  'pre-trade': 'kill-switch condition + hard limits',
  'rule-validation': 'position / exposure / concentration',
  'human-gate': null,
  'broker-adapter': null,
};

/** Printed by step [4] whenever no adapter is registered. */
export const NO_ORDERS_ROUTED = '— no orders routed';

/**
 * Today's counters for one step of the pipeline.
 *
 * Every field is derived from the one order list — doc 15's — so a step cannot
 * claim a trade another page has somewhere else. `passed` counts orders now
 * beyond this step; `pending`, `blocked`, `approved` and `rejected` count
 * orders standing at it.
 */
export interface PipelineStepCounts {
  readonly stage: OrderStage;
  /** 1-4, the position in the mandatory sequence. */
  readonly step: number;
  readonly label: string;
  readonly detail: string;
  /** Second line of the card, or null where a link or a posture stands instead. */
  readonly subtitle: string | null;
  /** Orders that cleared this step and are now further along. */
  readonly passed: number;
  /** Orders a rule stopped here. */
  readonly blocked: number;
  /** Orders still waiting here. */
  readonly pending: number;
  /** Orders a person signed off here. */
  readonly approved: number;
  /** Orders a person turned down here. */
  readonly rejected: number;
  /** Orders standing at this step, whatever their status. */
  readonly atStage: number;
  /** False for the broker adapter while no adapter is registered. */
  readonly reachable: boolean;
  /** `10 passed · 0 blocked` — the counters as the card prints them. */
  readonly summary: string;
}

// --- risk concentration ------------------------------------------------------

/**
 * `DI_ρ(X_i|X)` at or above this reads as "almost co-monotonic with the book",
 * i.e. a component whose risk the portfolio is not diversifying away.
 */
export const HIGH_CONCENTRATION_DI = 0.9;

export const HIGH_CONCENTRATION_LABEL = 'High concentration';
export const HIGH_CONCENTRATION_ICON = '!';

/**
 * One row of the marginal-diversification grid.
 *
 * Read-only input to the guardrail process: this page does not recompute the
 * indices, it shows the ones Risk Attribution published.
 */
export interface ConcentrationComponent {
  readonly id: string;
  readonly name: string;
  /** Fraction of net asset value. */
  readonly weight: number;
  /** `DI_ρ(X_i|X)`. Null for a hedge or a riskless leg — undefined, not zero. */
  readonly marginalDi: number | null;
  /** The component's Euler contribution is negative. */
  readonly hedge: boolean;
  /** `marginalDi` at or above `HIGH_CONCENTRATION_DI`. */
  readonly highConcentration: boolean;
}

// --- the audit trail ---------------------------------------------------------

export type GuardrailOutcome = 'pass' | 'fail';

export const GUARDRAIL_OUTCOME_LABEL: Record<GuardrailOutcome, string> = {
  pass: 'PASS',
  fail: 'FAIL',
};

export const GUARDRAIL_OUTCOME_ICON: Record<GuardrailOutcome, string> = { pass: '✓', fail: '✕' };

/**
 * One checkpointed state transition.
 *
 * Every transition of the approval flow is checkpointed, which is what makes
 * the trail complete and replayable rather than a log of the interesting bits.
 * Configuration changes — the kill-switch itself, a limit switched off — are
 * transitions too, and carry `tradeId: null`.
 */
export interface GuardrailEvent {
  readonly id: string;
  /** `2026-08-01` — the day the row is grouped under. */
  readonly date: string;
  /** `09:14` — the time the row prints. */
  readonly at: string;
  /** `TRD-2033`, or null for a guardrail configuration change. */
  readonly tradeId: string | null;
  /** The step the event happened at. */
  readonly stage: OrderStage;
  readonly outcome: GuardrailOutcome;
  /** The validator that raised it, or the person who signed. Null renders as `—`. */
  readonly actor: string | null;
  /** Set only when there is an original exception behind the outcome. */
  readonly errorType: GuardrailErrorType | null;
  /**
   * The original `ValueError` / `PydanticCustomError` text, verbatim, for the
   * detail drawer. Null when nothing was raised.
   */
  readonly detail: string | null;
}

/** EmptyState copy when the filters match nothing. */
export const NO_EVENTS_MESSAGE = 'No guardrail events match these filters';

// --- regions -----------------------------------------------------------------

/**
 * The four regions that load — and therefore fail — independently.
 *
 * The spec is explicit that a failure in the limits, the concentration grid or
 * the audit trail must not take the other regions down with it, and that the
 * kill-switch has an error of its own that disables the primary action.
 */
export type GuardrailRegion = 'kill-switch' | 'limits' | 'concentration' | 'audit';

export const GUARDRAIL_REGIONS: readonly GuardrailRegion[] = [
  'kill-switch',
  'limits',
  'concentration',
  'audit',
];

export const GUARDRAIL_REGION_LABEL: Record<GuardrailRegion, string> = {
  'kill-switch': 'Kill-switch',
  limits: 'Hard limits & validators',
  concentration: 'Risk concentration',
  audit: 'Guardrail audit trail',
};

/** The ErrorState message each region shows when its own read fails. */
export const GUARDRAIL_REGION_ERROR: Record<GuardrailRegion, string> = {
  'kill-switch': KILL_SWITCH_UNKNOWN,
  limits: 'Could not read the configured hard limits.',
  concentration: 'Could not read the diversification indices.',
  audit: 'Could not read the guardrail audit trail.',
};

// --- exits -------------------------------------------------------------------

export interface GuardrailExit {
  readonly label: string;
  readonly route: string;
}

export const HUMAN_APPROVAL_EXIT: GuardrailExit = {
  label: 'Open Human Approval Gate',
  route: '/approvals/approval-gate',
};

export const RISK_ATTRIBUTION_EXIT: GuardrailExit = {
  label: 'Open Risk Attribution',
  route: '/risk/risk-attribution',
};
