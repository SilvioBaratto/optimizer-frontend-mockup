import { Injectable, computed, inject, signal } from '@angular/core';

import {
  GUARDRAIL_REGIONS,
  GUARDRAIL_REGION_ERROR,
  HIGH_CONCENTRATION_DI,
  KILL_SWITCH_REASON_REQUIRED,
  KILL_SWITCH_WRITE_FAILURE,
  LIMIT_REASON_REQUIRED,
  NO_ORDERS_ROUTED,
  PIPELINE_STEP_DETAIL,
  PIPELINE_STEP_LABEL,
  PIPELINE_STEP_SUBTITLE,
  type ConcentrationComponent,
  type GuardrailEvent,
  type GuardrailRegion,
  type HardLimit,
  type KillSwitchState,
  type KillSwitchStatus,
  type KillSwitchWriteResult,
  type LimitDraft,
  type LimitSaveResult,
  type LimitValidationError,
  type PipelineStepCounts,
} from '../models/guardrail.model';
import {
  BROKER_POSTURE_LABEL,
  ORDER_STAGES,
  type OrderStage,
  type ProposedOrder,
} from '../models/order.model';
import { ExecutionService } from './execution.service';
import { RiskAttributionService } from './risk-attribution.service';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 600;

/** A write is a shorter round trip than a full read, and has its own busy state. */
const WRITE_MS = 400;

/** Who is operating the page in this stand-in. The session user replaces it. */
const OPERATOR = 'risk.admin';

/** How many audit rows one page of the trail holds. */
const EVENT_PAGE_SIZE = 6;

/** How many concentration components the grid shows before "Show all". */
const CONCENTRATION_PREVIEW = 4;

// ---------------------------------------------------------------------------
// Seed state
// ---------------------------------------------------------------------------

/**
 * Trading enabled is the default posture, and it is a posture rather than an
 * absence: the last change carries an actor and a rationale exactly as an
 * engagement would, because "why is trading allowed right now" is as much of an
 * audit question as its opposite.
 */
const SEED_KILL_SWITCH: KillSwitchState = {
  engaged: false,
  changedAt: '2026-07-29 14:02 UTC',
  changedBy: OPERATOR,
  reason:
    'Released after the vendor price-feed outage was confirmed resolved and the deterministic ' +
    'pre-check re-ran clean on the held book.',
};

/**
 * The configured hard limits.
 *
 * Five, matching the wireframe, and deliberately not five healthy ones. The
 * single-name cap sits in BREACH — it is the rule that stopped TRD-2033 in doc
 * 15's queue, quoted with the same figures — and the sector cap is switched off.
 * Both stay in the grid: a breach outlives the trade that raised it, and a
 * disabled limit is a decision somebody made, not a row that should vanish.
 */
const SEED_LIMITS: readonly HardLimit[] = [
  {
    id: 'lim-max-position',
    name: 'Max position size',
    scope: 'position',
    validator: 'field_validator',
    validatorName: 'max_position_size',
    threshold: 8,
    unit: 'pct-nav',
    enabled: true,
    status: 'ok',
    breachDetail: null,
  },
  {
    id: 'lim-gross-exposure',
    name: 'Max gross exposure',
    scope: 'exposure',
    validator: 'model_validator_after',
    validatorName: 'max_gross_exposure',
    threshold: 150,
    unit: 'pct-nav',
    enabled: true,
    status: 'ok',
    breachDetail: null,
  },
  {
    id: 'lim-single-name',
    name: 'Max single-name concentration',
    scope: 'concentration',
    validator: 'model_validator_after',
    validatorName: 'concentration_limit',
    threshold: 12,
    unit: 'pct-nav',
    enabled: true,
    status: 'breach',
    breachDetail:
      'Single-name concentration limit — EEM would reach 12.4% NAV against the configured 12.0% cap.',
  },
  {
    id: 'lim-kill-condition',
    name: 'Portfolio kill condition',
    scope: 'kill-switch',
    validator: 'model_validator_after',
    validatorName: 'kill_switch_condition',
    threshold: null,
    unit: 'none',
    enabled: true,
    status: 'ok',
    breachDetail: null,
  },
  {
    id: 'lim-sector-cap',
    name: 'Sector concentration cap',
    scope: 'concentration',
    validator: 'model_validator_after',
    validatorName: 'sector_concentration_cap',
    threshold: 25,
    unit: 'pct-nav',
    enabled: false,
    status: 'ok',
    breachDetail: null,
  },
];

/** The `ValidationError` a Pydantic v2 model prints, as the drawer shows it. */
function validationError(body: string): string {
  return `1 validation error for ProposedOrder\n  ${body}`;
}

/**
 * The checkpointed transitions, newest first.
 *
 * Twenty-one rows across three days, so "Load more" moves through four pages
 * rather than being a button that does nothing. The trade ids are doc 15's,
 * not a parallel set: an audit row a reader cannot find in the order queue is
 * an audit row they cannot verify.
 */
const SEED_EVENTS: readonly GuardrailEvent[] = [
  {
    id: 'gev-2101',
    date: '2026-08-01',
    at: '09:52',
    tradeId: 'TRD-2037',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2100',
    date: '2026-08-01',
    at: '09:51',
    tradeId: 'TRD-2036',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2099',
    date: '2026-08-01',
    at: '09:50',
    tradeId: 'TRD-2038',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2098',
    date: '2026-08-01',
    at: '09:47',
    tradeId: 'TRD-2039',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2097',
    date: '2026-08-01',
    at: '09:44',
    tradeId: 'TRD-2028',
    stage: 'human-gate',
    outcome: 'pass',
    actor: 'm.rossi@fund',
    errorType: null,
    detail:
      'Approved for manual placement — with no broker adapter configured the order does not leave the system.',
  },
  {
    id: 'gev-2096',
    date: '2026-08-01',
    at: '09:35',
    tradeId: 'TRD-2025',
    stage: 'human-gate',
    outcome: 'pass',
    actor: 'm.rossi@fund',
    errorType: null,
    detail:
      'Approved for manual placement — with no broker adapter configured the order does not leave the system.',
  },
  {
    id: 'gev-2095',
    date: '2026-08-01',
    at: '09:26',
    tradeId: 'TRD-2032',
    stage: 'rule-validation',
    outcome: 'pass',
    actor: 'max_position_size',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2094',
    date: '2026-08-01',
    at: '09:20',
    tradeId: 'TRD-2022',
    stage: 'human-gate',
    outcome: 'fail',
    actor: 'm.rossi@fund',
    errorType: null,
    detail:
      'Rejected at the gate — the sleeve is being wound down through a separate programme trade this week.',
  },
  {
    id: 'gev-2093',
    date: '2026-08-01',
    at: '09:16',
    tradeId: 'TRD-2033',
    stage: 'rule-validation',
    outcome: 'fail',
    actor: 'concentration_limit',
    errorType: 'PydanticCustomError',
    detail: validationError(
      'Value error, single-name concentration limit exceeded: EEM would reach 12.4% NAV against ' +
        'the configured 12.0% cap [type=concentration_limit, input_value=0.124, input_type=float]',
    ),
  },
  {
    id: 'gev-2092',
    date: '2026-08-01',
    at: '09:15',
    tradeId: 'TRD-2033',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2091',
    date: '2026-08-01',
    at: '09:14',
    tradeId: 'TRD-2035',
    stage: 'rule-validation',
    outcome: 'pass',
    actor: 'max_gross_exposure',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2090',
    date: '2026-08-01',
    at: '09:13',
    tradeId: 'TRD-2034',
    stage: 'rule-validation',
    outcome: 'pass',
    actor: 'max_position_size',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2089',
    date: '2026-08-01',
    at: '09:12',
    tradeId: 'TRD-2031',
    stage: 'rule-validation',
    outcome: 'pass',
    actor: 'max_position_size',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2088',
    date: '2026-08-01',
    at: '08:58',
    tradeId: 'TRD-2030',
    stage: 'rule-validation',
    outcome: 'pass',
    actor: 'max_gross_exposure',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2087',
    date: '2026-08-01',
    at: '08:41',
    tradeId: 'TRD-2019',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2074',
    date: '2026-07-31',
    at: '16:41',
    tradeId: 'TRD-2008',
    stage: 'rule-validation',
    outcome: 'fail',
    actor: 'max_gross_exposure',
    errorType: 'ValueError',
    detail: validationError(
      'Value error, gross exposure would reach 154.2% NAV against the configured 150.0% cap ' +
        '[type=value_error, input_value=1.542, input_type=float]',
    ),
  },
  {
    id: 'gev-2073',
    date: '2026-07-31',
    at: '16:12',
    tradeId: 'TRD-2007',
    stage: 'human-gate',
    outcome: 'pass',
    actor: 'm.rossi@fund',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2072',
    date: '2026-07-31',
    at: '15:58',
    tradeId: 'TRD-2006',
    stage: 'pre-trade',
    outcome: 'pass',
    actor: null,
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2071',
    date: '2026-07-31',
    at: '15:20',
    tradeId: 'TRD-2005',
    stage: 'rule-validation',
    outcome: 'pass',
    actor: 'max_position_size',
    errorType: null,
    detail: null,
  },
  {
    id: 'gev-2060',
    date: '2026-07-29',
    at: '14:02',
    tradeId: null,
    stage: 'pre-trade',
    outcome: 'pass',
    actor: OPERATOR,
    errorType: null,
    detail:
      'Kill-switch released — the vendor price-feed outage was confirmed resolved and the ' +
      'deterministic pre-check re-ran clean on the held book.',
  },
  {
    id: 'gev-2059',
    date: '2026-07-29',
    at: '09:31',
    tradeId: 'TRD-1994',
    stage: 'pre-trade',
    outcome: 'fail',
    actor: 'kill_switch_condition',
    errorType: 'ValueError',
    detail: validationError(
      'Value error, kill-switch engaged — the deterministic pre-check refuses every proposed ' +
        "order while trading is halted [type=value_error, input_value='TRD-1994', input_type=str]",
    ),
  },
];

const NO_REGION_ERRORS: Readonly<Record<GuardrailRegion, string | null>> = {
  'kill-switch': null,
  limits: null,
  concentration: null,
  audit: null,
};

// ---------------------------------------------------------------------------
// The pass/fail boundary
// ---------------------------------------------------------------------------

/** `8` prints as `8.0`, so a threshold reads the same in a message and a badge. */
function formatThreshold(value: number): string {
  return value.toFixed(1);
}

/**
 * The validators, in the order Pydantic runs them: every `@field_validator`
 * first, then the `@model_validator(mode='after')` that can see the whole draft.
 *
 * This is the same boundary the pre-check applies to a trade, which is why the
 * Add/Edit form cannot save a limit the boundary would refuse. Every message is
 * the one a `ValueError` or a `PydanticCustomError` would carry, and the form
 * prints it verbatim — a paraphrase on screen and the original in the backend
 * log is precisely the divergence an audit trail cannot survive.
 *
 * `ValueError`, never `AssertionError`: the latter is stripped under `python -O`,
 * which would disable the guardrail silently.
 */
export function validateLimitDraft(
  draft: LimitDraft,
  existing: readonly HardLimit[],
): readonly LimitValidationError[] {
  const errors: LimitValidationError[] = [];
  const name = draft.name.trim();

  // --- @field_validator('name') ---
  if (name === '') {
    errors.push({
      type: 'ValueError',
      field: 'name',
      message: 'Value error, name must not be empty',
    });
  } else if (
    existing.some((l) => l.id !== draft.id && l.name.trim().toLowerCase() === name.toLowerCase())
  ) {
    errors.push({
      type: 'PydanticCustomError',
      field: 'name',
      message:
        `limit_name_not_unique: a limit named '${name}' already exists — the name identifies ` +
        'the validator in the audit trail and must be unique',
    });
  }

  // --- @field_validator('threshold') ---
  if (draft.threshold !== null && !Number.isFinite(draft.threshold)) {
    errors.push({
      type: 'ValueError',
      field: 'threshold',
      message: 'Value error, threshold must be a number',
    });
  } else if (draft.threshold !== null && draft.threshold < 0) {
    errors.push({
      type: 'ValueError',
      field: 'threshold',
      message: `Value error, threshold must be a non-negative number, got ${formatThreshold(draft.threshold)}`,
    });
  }

  // --- @model_validator(mode='after') ---
  if (draft.scope === 'kill-switch') {
    if (draft.threshold !== null) {
      errors.push({
        type: 'ValueError',
        field: null,
        message: 'Value error, the kill-switch condition is a predicate and takes no threshold',
      });
    }
    if (draft.unit !== 'none') {
      errors.push({
        type: 'ValueError',
        field: null,
        message: 'Value error, the kill-switch condition has no unit — expected none',
      });
    }
  } else if (draft.threshold === null) {
    errors.push({
      type: 'ValueError',
      field: null,
      message: 'Value error, a position, exposure or concentration limit requires a threshold',
    });
  } else if (draft.threshold === 0) {
    /*
      Zero is a legal number and an illegal budget. RC_i = 0 is solved by x_i = 0
      but also by x_i > 0 under negative correlation, so a zero bound does not
      say what the person setting it means; the universe has to exclude the
      component instead. This is why the non-negativity check is a field
      validator and this one is not — only the model validator can see the scope
      the threshold belongs to.
    */
    errors.push({
      type: 'PydanticCustomError',
      field: null,
      message:
        'limit_zero_budget: a zero bound is not a limit — a component with a zero risk budget ' +
        'must be excluded from the universe rather than constrained inside it',
    });
  } else if (draft.unit === 'pct-nav' && draft.scope !== 'exposure' && draft.threshold > 100) {
    errors.push({
      type: 'ValueError',
      field: null,
      message:
        'Value error, a % NAV bound on a single position or name cannot exceed 100.0, got ' +
        formatThreshold(draft.threshold),
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * The deterministic pass/fail boundary that runs before any model call.
 *
 * Two things live here: the kill-switch, and the hard limits implemented as
 * Pydantic validators. Everything else on the page is read from somewhere that
 * already owns it — the pipeline counters from `ExecutionService`'s one order
 * list, the diversification indices from `RiskAttributionService` — so doc 17
 * cannot tell a different story about a trade or a book than the page it came
 * from.
 *
 * The one behaviour worth stating outright, because it is the reason the page
 * exists: **a kill-switch write that fails changes nothing and says so.** The
 * state is not updated optimistically, the failure is returned to the caller
 * and parked in `killSwitchActionError`, and the dialog stays open with the
 * operator's rationale intact. An operator who believes trading is halted when
 * it is not is the hazard this page is here to prevent.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the page's loading and error
 * states reachable.
 */
@Injectable({ providedIn: 'root' })
export class GuardrailService {
  private readonly execution = inject(ExecutionService);
  private readonly attribution = inject(RiskAttributionService);

  // --- page state -----------------------------------------------------------

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _regionErrors =
    signal<Readonly<Record<GuardrailRegion, string | null>>>(NO_REGION_ERRORS);
  readonly regionErrors = this._regionErrors.asReadonly();

  /** The region being retried on its own, so only it shows a skeleton. */
  private readonly _pendingRegion = signal<GuardrailRegion | null>(null);
  readonly pendingRegion = this._pendingRegion.asReadonly();

  private readonly _readAt = signal('2026-08-01 09:53 UTC');
  readonly readAt = this._readAt.asReadonly();

  readonly killSwitchError = computed(() => this._regionErrors()['kill-switch']);
  readonly limitsError = computed(() => this._regionErrors().limits);
  readonly concentrationError = computed(() => this._regionErrors().concentration);
  readonly auditError = computed(() => this._regionErrors().audit);

  /**
   * The page is only "in error" when nothing came back at all.
   *
   * A single region failing is a localised ErrorState beside three regions that
   * still work, which is what the spec asks for — so the page-level state stays
   * `ready` and does not blank out the rest of the screen.
   */
  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    const errors = this._regionErrors();
    if (GUARDRAIL_REGIONS.every((region) => errors[region] !== null)) return 'error';
    if (this._limits().length === 0 && this._events().length === 0) return 'empty';
    return 'ready';
  });

  // --- kill-switch ----------------------------------------------------------

  private readonly _killSwitch = signal<KillSwitchState>(SEED_KILL_SWITCH);

  /** The contract doc 16 reads for its own pre-check result. */
  readonly killSwitch = this._killSwitch.asReadonly();

  readonly killSwitchStatus = computed<KillSwitchStatus>(() =>
    this._killSwitch().engaged ? 'engaged' : 'trading-enabled',
  );

  readonly killSwitchEngaged = computed(() => this._killSwitch().engaged);

  /**
   * True once the real state has come back.
   *
   * The toggle is held disabled until then. Acting on a value that is not yet
   * known is the same failure mode as acting on a value that silently failed to
   * write, and the spec refuses both.
   */
  readonly killSwitchKnown = computed(
    () => !this._loading() && this._regionErrors()['kill-switch'] === null,
  );

  private readonly _killSwitchWriting = signal(false);
  readonly killSwitchWriting = this._killSwitchWriting.asReadonly();

  /**
   * The blocking message for the confirmation dialog after a failed write.
   *
   * Separate from `killSwitchError`, which is a failed *read*: one disables the
   * control, the other keeps the dialog open with a retry.
   */
  private readonly _killSwitchActionError = signal<string | null>(null);
  readonly killSwitchActionError = this._killSwitchActionError.asReadonly();

  readonly killSwitchToggleDisabled = computed(
    () => !this.killSwitchKnown() || this._killSwitchWriting(),
  );

  /**
   * Engages or releases the kill-switch, and reports whether it landed.
   *
   * This is the fix for the blocking review finding on the spec. Three
   * properties, all of them load-bearing:
   *
   * - a blank rationale never reaches the write at all;
   * - **a failed write leaves `killSwitch` exactly as it was** — no optimistic
   *   update, no audit event, nothing for the HeroStatCard to re-render;
   * - the failure is both returned and published on `killSwitchActionError`, so
   *   the dialog can stay open, keep the typed rationale and offer a retry.
   *
   * Setting the switch to the state it already holds is a no-op: it records no
   * second event and rewrites no timestamp, because nothing changed.
   */
  async setKillSwitch(engaged: boolean, reason: string, fail = false): Promise<KillSwitchWriteResult> {
    const trimmed = reason.trim();

    if (trimmed === '') {
      this._killSwitchActionError.set(KILL_SWITCH_REASON_REQUIRED);
      return { ok: false, error: KILL_SWITCH_REASON_REQUIRED, state: this._killSwitch() };
    }

    if (engaged === this._killSwitch().engaged) {
      this._killSwitchActionError.set(null);
      return { ok: true, error: null, state: this._killSwitch() };
    }

    this._killSwitchWriting.set(true);
    this._killSwitchActionError.set(null);

    await delay(WRITE_MS);

    if (fail) {
      this._killSwitchWriting.set(false);
      this._killSwitchActionError.set(KILL_SWITCH_WRITE_FAILURE);
      // The state is deliberately untouched: the backend did not confirm.
      return { ok: false, error: KILL_SWITCH_WRITE_FAILURE, state: this._killSwitch() };
    }

    const written: KillSwitchState = {
      engaged,
      changedAt: stampNow(),
      changedBy: OPERATOR,
      reason: trimmed,
    };
    this._killSwitch.set(written);
    this._killSwitchWriting.set(false);

    this.record({
      stage: 'pre-trade',
      outcome: engaged ? 'fail' : 'pass',
      actor: OPERATOR,
      detail: engaged
        ? `Kill-switch engaged, all trading halted — ${trimmed}`
        : `Kill-switch released, trading enabled — ${trimmed}`,
    });

    return { ok: true, error: null, state: written };
  }

  clearKillSwitchActionError(): void {
    this._killSwitchActionError.set(null);
  }

  // --- the approval pipeline ------------------------------------------------

  /**
   * Doc 15's posture signal, not a copy of it.
   *
   * Step [4] says "not configured" because the one broker posture in the
   * application says so — there is no second posture here to drift from it.
   */
  readonly brokerPosture = this.execution.brokerPosture;

  readonly brokerConfigured = this.execution.brokerConfigured;

  /**
   * Today's counters for the four mandatory steps.
   *
   * Derived from `ExecutionService.orders()` and nothing else. `passed` counts
   * orders now beyond a step; the rest count orders standing at it. With no
   * adapter registered the fourth step is unreachable, so its count is zero by
   * construction rather than by a number typed into a mock.
   */
  readonly pipeline = computed<readonly PipelineStepCounts[]>(() => {
    const orders = this.execution.orders();
    const posture = this.execution.brokerPosture();
    /*
      Doc 15's ceiling, reused rather than restated. A registered adapter that
      is erroring has sending halted, so the fourth step is closed even though
      an adapter is configured — `brokerConfigured` is the wrong question here.
    */
    const routable = this.execution.terminalStage() === 'broker-adapter';

    return ORDER_STAGES.map((stage, index) => {
      const atStage = orders.filter((o) => o.stage === stage);
      const passed = orders.filter((o) => ORDER_STAGES.indexOf(o.stage) > index).length;
      const blocked = count(atStage, 'blocked');
      const pending = count(atStage, 'pending');
      const approved = count(atStage, 'approved');
      const reachable = stage !== 'broker-adapter' || routable;

      return {
        stage,
        step: index + 1,
        label: PIPELINE_STEP_LABEL[stage],
        detail: PIPELINE_STEP_DETAIL[stage],
        subtitle:
          stage === 'broker-adapter' ? BROKER_POSTURE_LABEL[posture] : PIPELINE_STEP_SUBTITLE[stage],
        passed,
        blocked,
        pending,
        approved,
        rejected: count(atStage, 'rejected'),
        atStage: atStage.length,
        reachable,
        summary: summarise(stage, {
          passed,
          blocked,
          pending,
          approved,
          atStage: atStage.length,
          reachable,
        }),
      };
    });
  });

  readonly pipelineByStage = computed<Record<OrderStage, PipelineStepCounts>>(() => {
    const byStage = {} as Record<OrderStage, PipelineStepCounts>;
    for (const step of this.pipeline()) byStage[step.stage] = step;
    return byStage;
  });

  // --- hard limits ----------------------------------------------------------

  private readonly _limits = signal<readonly HardLimit[]>(SEED_LIMITS);
  readonly limits = this._limits.asReadonly();

  readonly limitCount = computed(() => this._limits().length);
  readonly enabledLimits = computed(() => this._limits().filter((l) => l.enabled));
  readonly breachedLimits = computed(() => this._limits().filter((l) => l.status === 'breach'));
  readonly hasBreach = computed(() => this.breachedLimits().length > 0);
  readonly limitsEmpty = computed(() => this._limits().length === 0);

  limit(id: string): HardLimit | null {
    return this._limits().find((l) => l.id === id) ?? null;
  }

  /** Validation errors from the last save, for the Add/Edit form to print verbatim. */
  private readonly _limitErrors = signal<readonly LimitValidationError[]>([]);
  readonly limitErrors = this._limitErrors.asReadonly();

  /** Why an enable/disable was refused. Null when the last toggle went through. */
  private readonly _limitActionError = signal<string | null>(null);
  readonly limitActionError = this._limitActionError.asReadonly();

  private readonly _savingLimit = signal(false);
  readonly savingLimit = this._savingLimit.asReadonly();

  /** The same boundary the pre-check applies, exposed so the form can pre-check too. */
  validateLimit(draft: LimitDraft): readonly LimitValidationError[] {
    return validateLimitDraft(draft, this._limits());
  }

  /**
   * Saves a new or edited limit through the pass/fail boundary.
   *
   * A rejection changes nothing and returns the validators' own messages, which
   * the form prints in full. An accepted edit keeps the limit's evaluated
   * `status` and `breachDetail`: those are what the last run of the boundary
   * found about the book, and re-typing a threshold does not re-run it.
   */
  async saveLimit(draft: LimitDraft): Promise<LimitSaveResult> {
    this._savingLimit.set(true);
    this._limitErrors.set([]);

    await delay(WRITE_MS);

    const errors = this.validateLimit(draft);
    if (errors.length > 0) {
      this._savingLimit.set(false);
      this._limitErrors.set(errors);
      return { ok: false, errors, limit: null };
    }

    const name = draft.name.trim();
    const existing = draft.id === null ? null : this.limit(draft.id);

    const saved: HardLimit = existing
      ? {
          ...existing,
          name,
          scope: draft.scope,
          validator: draft.validator,
          threshold: draft.threshold,
          unit: draft.unit,
          enabled: draft.enabled,
        }
      : {
          id: `lim-${slug(name)}`,
          name,
          scope: draft.scope,
          validator: draft.validator,
          validatorName: slug(name).replace(/-/g, '_'),
          threshold: draft.threshold,
          unit: draft.unit,
          enabled: draft.enabled,
          status: 'ok',
          breachDetail: null,
        };

    this._limits.update((limits) =>
      existing ? limits.map((l) => (l.id === saved.id ? saved : l)) : [...limits, saved],
    );
    this._savingLimit.set(false);

    this.record({
      stage: 'rule-validation',
      outcome: 'pass',
      actor: saved.validatorName,
      detail: existing
        ? `Limit '${saved.name}' updated by ${OPERATOR}.`
        : `Limit '${saved.name}' added by ${OPERATOR}.`,
    });

    return { ok: true, errors: [], limit: saved };
  }

  /**
   * Switches a limit on or off. The row stays in the grid either way.
   *
   * Returns false and changes nothing when the id is unknown, or when a
   * kill-switch-scope limit is being switched off without a rationale — turning
   * that one off moves the pass/fail boundary exactly as the global switch
   * does, so it is held behind the same confirmation.
   */
  setLimitEnabled(id: string, enabled: boolean, reason = ''): boolean {
    const target = this.limit(id);
    if (!target) {
      this._limitActionError.set(`No limit with id '${id}'.`);
      return false;
    }

    if (!enabled && target.scope === 'kill-switch' && reason.trim() === '') {
      this._limitActionError.set(LIMIT_REASON_REQUIRED);
      return false;
    }

    if (target.enabled === enabled) {
      this._limitActionError.set(null);
      return true;
    }

    this._limitActionError.set(null);
    this._limits.update((limits) => limits.map((l) => (l.id === id ? { ...l, enabled } : l)));

    const rationale = reason.trim();
    this.record({
      stage: 'rule-validation',
      outcome: 'pass',
      actor: target.validatorName,
      detail:
        `Limit '${target.name}' ${enabled ? 'enabled' : 'disabled'} by ${OPERATOR}` +
        (rationale === '' ? '.' : ` — ${rationale}`),
    });

    return true;
  }

  clearLimitErrors(): void {
    this._limitErrors.set([]);
    this._limitActionError.set(null);
  }

  // --- risk concentration ---------------------------------------------------

  /**
   * `DI_ρ(X)`, read from Risk Attribution rather than recomputed.
   *
   * The page shows the indices as an input to the guardrail process; it does
   * not redefine the measures. Two computations of one book's diversification
   * would eventually print two numbers for it.
   */
  readonly portfolioDi = this.attribution.portfolioDi;

  /** `DI_ρ(X_i|X)` per component, heaviest weight first. */
  readonly concentrationComponents = computed<readonly ConcentrationComponent[]>(() => {
    const weights = new Map(this.attribution.rows().map((r) => [r.id, r.weight]));
    return this.attribution
      .marginalDiByComponent()
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        weight: weights.get(entry.id) ?? 0,
        marginalDi: entry.marginalDi,
        hedge: entry.hedge,
        highConcentration: entry.marginalDi !== null && entry.marginalDi >= HIGH_CONCENTRATION_DI,
      }))
      .sort((a, b) => b.weight - a.weight);
  });

  /** "Show all components" expands the grid from the preview to the whole book. */
  readonly showAllComponents = signal(false);

  readonly visibleConcentrationComponents = computed<readonly ConcentrationComponent[]>(() => {
    const all = this.concentrationComponents();
    return this.showAllComponents() ? all : all.slice(0, CONCENTRATION_PREVIEW);
  });

  readonly concentrationHidden = computed(
    () => this.concentrationComponents().length - this.visibleConcentrationComponents().length,
  );

  readonly highConcentrationCount = computed(
    () => this.concentrationComponents().filter((c) => c.highConcentration).length,
  );

  // --- the audit trail ------------------------------------------------------

  private readonly _events = signal<readonly GuardrailEvent[]>(SEED_EVENTS);
  readonly events = this._events.asReadonly();

  /** Multi-select stage chips. Every stage is on by default. */
  readonly stageFilter = signal<readonly OrderStage[]>(ORDER_STAGES);

  /** Free text over trade id, actor and validator name. */
  readonly search = signal('');

  private readonly _pages = signal(1);

  /** Adding a stage back restores it to its position in the mandatory sequence. */
  toggleStage(stage: OrderStage): void {
    this.stageFilter.update((stages) =>
      stages.includes(stage)
        ? stages.filter((s) => s !== stage)
        : ORDER_STAGES.filter((s) => stages.includes(s) || s === stage),
    );
  }

  clearFilters(): void {
    this.stageFilter.set(ORDER_STAGES);
    this.search.set('');
    this._pages.set(1);
  }

  readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.stageFilter().length !== ORDER_STAGES.length,
  );

  /** Events matching the search alone — what the stage chips count. */
  private readonly searchedEvents = computed<readonly GuardrailEvent[]>(() => {
    const query = this.search().trim().toLowerCase();
    if (query === '') return this._events();
    return this._events().filter(
      (e) =>
        (e.tradeId ?? '').toLowerCase().includes(query) ||
        (e.actor ?? '').toLowerCase().includes(query),
    );
  });

  /** Live per-stage counts for the chip bar, independent of the chips themselves. */
  readonly eventCountByStage = computed<Record<OrderStage, number>>(() => {
    const counts: Record<OrderStage, number> = {
      'pre-trade': 0,
      'rule-validation': 0,
      'human-gate': 0,
      'broker-adapter': 0,
    };
    for (const event of this.searchedEvents()) counts[event.stage]++;
    return counts;
  });

  readonly visibleEvents = computed<readonly GuardrailEvent[]>(() => {
    const stages = this.stageFilter();
    return this.searchedEvents().filter((e) => stages.includes(e.stage));
  });

  readonly visibleEventCount = computed(() => this.visibleEvents().length);

  /**
   * The rows on screen — one page at a time.
   *
   * The slice is clamped rather than reset when a filter narrows the list, so
   * changing the chips can never leave "Load more" enabled with nothing behind
   * it, and never needs an effect copying one signal into another.
   */
  readonly pagedEvents = computed<readonly GuardrailEvent[]>(() =>
    this.visibleEvents().slice(0, this._pages() * EVENT_PAGE_SIZE),
  );

  readonly canLoadMore = computed(() => this.pagedEvents().length < this.visibleEvents().length);

  loadMore(): void {
    if (this.canLoadMore()) this._pages.update((p) => p + 1);
  }

  readonly eventsEmpty = computed(() => this.visibleEvents().length === 0);

  /** Export acts on the filtered view, and is refused when that view is empty. */
  readonly exportDisabled = computed(() => this.visibleEvents().length === 0);

  exportCsv(): string {
    const header = 'date,time,trade,stage,outcome,actor,detail';
    const rows = this.visibleEvents().map((e) =>
      [e.date, e.at, e.tradeId ?? '', e.stage, e.outcome, e.actor ?? '', e.detail ?? '']
        .map(csvCell)
        .join(','),
    );
    return [header, ...rows].join('\n');
  }

  /**
   * "View log" on a limit card: narrow the trail to that validator's rows.
   *
   * The stage chips are reopened as part of the same act. A validator raises
   * its rows at one stage, so a chip the reader had switched off earlier would
   * hide every row this filter just asked for — the trail would announce
   * "filtered to concentration_limit", take focus, and show its empty state.
   * Setting the trail to *that validator* means setting all of it.
   */
  filterByValidator(validatorName: string): void {
    this.stageFilter.set(ORDER_STAGES);
    this.search.set(validatorName);
    this._pages.set(1);
  }

  private readonly _selectedEventId = signal<string | null>(null);
  readonly selectedEventId = this._selectedEventId.asReadonly();

  readonly selectedEvent = computed<GuardrailEvent | null>(() => {
    const id = this._selectedEventId();
    return id === null ? null : (this._events().find((e) => e.id === id) ?? null);
  });

  /** Opens the detail drawer. An unknown id leaves the selection alone. */
  selectEvent(id: string | null): void {
    if (id === null || this._events().some((e) => e.id === id)) this._selectedEventId.set(id);
  }

  // --- lifecycle ------------------------------------------------------------

  /** Mock levers, not part of the contract: they make the empty states reachable. */
  readonly snapshotHasLimits = signal(true);
  readonly snapshotHasEvents = signal(true);

  /**
   * Re-reads the guardrail state.
   *
   * `fail` takes a list of regions as well as a boolean, because the spec is
   * explicit that the limits, the concentration grid and the audit trail must
   * be able to fail one at a time without taking the others down — including
   * the kill-switch, whose failure disables the primary action and nothing else.
   *
   * A failed read never rewrites the kill-switch: an unknown state is shown as
   * unknown, not as "trading enabled".
   */
  async refresh(fail: boolean | readonly GuardrailRegion[] = false): Promise<void> {
    if (this._loading()) return;
    this._loading.set(true);
    this._regionErrors.set(NO_REGION_ERRORS);

    await delay(LATENCY_MS);

    const failed = fail === true ? GUARDRAIL_REGIONS : fail === false ? [] : fail;

    const errors: Record<GuardrailRegion, string | null> = { ...NO_REGION_ERRORS };
    for (const region of failed) errors[region] = GUARDRAIL_REGION_ERROR[region];
    this._regionErrors.set(errors);

    if (!failed.includes('limits')) this.readLimits();
    if (!failed.includes('audit')) this.readEvents();

    this._readAt.set(stampNow());
    this._loading.set(false);
  }

  /** Retries one region's read, leaving the other three exactly as they are. */
  async retryRegion(region: GuardrailRegion, fail = false): Promise<void> {
    if (this._pendingRegion() !== null) return;
    this._pendingRegion.set(region);
    this.clearError(region);

    await delay(LATENCY_MS);

    if (fail) {
      this.setRegionError(region);
    } else {
      if (region === 'limits') this.readLimits();
      if (region === 'audit') this.readEvents();
    }

    this._pendingRegion.set(null);
  }

  /** Clears one region's error, or every region's when none is named. */
  clearError(region?: GuardrailRegion): void {
    if (region === undefined) {
      this._regionErrors.set(NO_REGION_ERRORS);
      return;
    }
    this._regionErrors.update((errors) => ({ ...errors, [region]: null }));
  }

  private setRegionError(region: GuardrailRegion): void {
    this._regionErrors.update((errors) => ({ ...errors, [region]: GUARDRAIL_REGION_ERROR[region] }));
  }

  /**
   * A read returns what the backend holds now, which includes the edits made
   * through this service. Re-seeding on every refresh would silently undo a
   * limit somebody had just switched off.
   */
  private readLimits(): void {
    if (!this.snapshotHasLimits()) this._limits.set([]);
    else if (this._limits().length === 0) this._limits.set(SEED_LIMITS);
  }

  private readEvents(): void {
    if (!this.snapshotHasEvents()) this._events.set([]);
    else if (this._events().length === 0) this._events.set(SEED_EVENTS);
  }

  // --- audit ----------------------------------------------------------------

  private nextEventId = 0;

  /**
   * Appends one checkpointed transition, newest first.
   *
   * On a configuration change the outcome is what the boundary now returns for
   * a proposed trade: engaging the kill-switch makes every trade fail, so that
   * row is FAIL; every other configuration write leaves trades free to pass.
   */
  private record(event: {
    stage: OrderStage;
    outcome: GuardrailEvent['outcome'];
    actor: string | null;
    detail: string | null;
    tradeId?: string | null;
  }): void {
    const now = new Date();
    this.nextEventId += 1;
    const entry: GuardrailEvent = {
      id: `gev-local-${this.nextEventId}`,
      date: now.toISOString().slice(0, 10),
      at: now.toISOString().slice(11, 16),
      tradeId: event.tradeId ?? null,
      stage: event.stage,
      outcome: event.outcome,
      actor: event.actor,
      errorType: null,
      detail: event.detail,
    };
    this._events.update((events) => [entry, ...events]);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function count(orders: readonly ProposedOrder[], status: ProposedOrder['status']): number {
  return orders.filter((o) => o.status === status).length;
}

/** The counter line each card prints, in the wireframe's own wording. */
function summarise(
  stage: OrderStage,
  counts: {
    passed: number;
    blocked: number;
    pending: number;
    approved: number;
    atStage: number;
    reachable: boolean;
  },
): string {
  if (stage === 'human-gate') return `${counts.approved} approved · ${counts.pending} pending`;
  if (stage === 'broker-adapter') {
    return counts.reachable ? `${counts.atStage} routed` : NO_ORDERS_ROUTED;
  }
  return `${counts.passed} passed · ${counts.blocked} blocked`;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'limit'
  );
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `YYYY-MM-DD HH:MM UTC`, because every stamp this service writes is printed
 * beside seeded stamps that are UTC. Local time under a UTC label would date a
 * kill-switch engagement an hour off for any reader east of Greenwich.
 */
function stampNow(): string {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
