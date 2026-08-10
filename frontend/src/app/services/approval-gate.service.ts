import { Injectable, computed, inject, signal } from '@angular/core';

import {
  ALREADY_DECIDED,
  APPROVAL_EFFECT_DETAIL,
  APPROVAL_OUTCOME_LABEL,
  APPROVAL_STEP_FILTER_LABEL,
  DECISION_EFFECT_SENTENCE,
  DECISION_IN_FLIGHT,
  DECISION_WRITE_FAILURE,
  DETAIL_ERROR_MESSAGE,
  NOT_AT_GATE,
  PROPOSING_AGENT,
  QUEUE_ERROR_MESSAGE,
  QUEUE_SORT_SUMMARY,
  RULE_SCOPE_LABEL,
  type ApprovalCheckpoint,
  type ApprovalDecision,
  type ApprovalDecisionResult,
  type ApprovalEffect,
  type ApprovalOutcome,
  type ApprovalQueueRow,
  type ApprovalStatusFilter,
  type ApprovalStep,
  type ApprovalStepFilter,
  type AutomatedChecks,
  type CheckResult,
  type DecisionEffectRecord,
  type PreCheckOutcome,
  type RuleCheck,
  type RuleScope,
  type StepState,
} from '../models/approval.model';
import {
  GUARDRAIL_OUTCOME_LABEL,
  PIPELINE_STEP_LABEL,
  type GuardrailEvent,
  type HardLimit,
} from '../models/guardrail.model';
import { ORDER_STAGES, type OrderStage, type ProposedOrder } from '../models/order.model';
import { ExecutionService, formatWaiting } from './execution.service';
import { GuardrailService } from './guardrail.service';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** A write is a shorter round trip than a full read, and has its own busy state. */
const WRITE_MS = 400;

/** A detail re-read is shorter still — it is one trade, not the whole queue. */
const DETAIL_MS = 350;

/** The page's opening filters: the only step at which a person is being asked something. */
const DEFAULT_STEP: ApprovalStepFilter = 'human-gate';
const DEFAULT_STATUS: ApprovalStatusFilter = 'pending';

/**
 * What the queue must be told about a decision that its trade does not keep.
 *
 * Two fields and no more. The outcome, the signature and the timestamp are all
 * written onto the order by `ExecutionService.advanceStage`, so copying them
 * here would create a second answer to "who approved this and when". The
 * reading of the approval and the note are the two things the order cannot
 * carry, so they are the two things recorded.
 *
 * The seeds are the decisions already on the seeded orders: both approvals were
 * signed under the default posture, with no adapter registered, and therefore
 * authorised a placement that the system never performed.
 */
const SEED_DECISION_RECORDS: readonly DecisionEffectRecord[] = [
  { tradeId: 'TRD-2028', effect: 'manual-placement', posture: 'not-configured', note: null },
  { tradeId: 'TRD-2025', effect: 'manual-placement', posture: 'not-configured', note: null },
  { tradeId: 'TRD-2022', effect: null, posture: 'not-configured', note: null },
];

/**
 * The approval queue — a projection, and deliberately nothing more.
 *
 * Every trade on this page is one of `ExecutionService`'s `proposed_orders`,
 * every step name and broker posture comes from that same service, and the
 * kill-switch and the hard limits behind rule validation come from
 * `GuardrailService`. This file owns exactly two things nobody else can hold:
 *
 * - **which reading an approval had.** With no adapter registered the human gate
 *   is the last step, so approving means "authorised for you to place" rather
 *   than "sent". That distinction is decided by the posture at the moment of the
 *   decision and written down there and then, because re-deriving it later from
 *   today's posture would relabel orders that never left the system.
 * - **what is not yet known.** A check whose verdict has not come back reads
 *   `pending`. Never a pass because the trade looks healthy, never a fail
 *   because it is stuck. A fabricated verdict on this page authorises money to
 *   move.
 *
 * Recording a decision goes through `ExecutionService.advanceStage`, so doc 15's
 * table and doc 17's counters move with it rather than needing to be told.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the page's loading, error and busy
 * states reachable.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalGateService {
  private readonly execution = inject(ExecutionService);
  private readonly guardrail = inject(GuardrailService);

  // --- page state -----------------------------------------------------------

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  /**
   * The page-level state.
   *
   * `empty` is about the queue itself, not about the filters: a filter that
   * matches nothing is an EmptyState inside a working page, which is why
   * `queueEmpty` is a separate reading.
   */
  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    if (this._errorMessage() !== null) return 'error';
    return this.queue().length === 0 ? 'empty' : 'ready';
  });

  /** When the snapshot behind the queue was read. Doc 15's stamp, not a second one. */
  readonly snapshotAt = this.execution.snapshotAt;

  /**
   * The run date every order stamp is quoted against, read from the snapshot
   * rather than restated, so the audit trail cannot date a checkpoint on a day
   * the queue does not think it is.
   */
  private readonly runDate = computed(() => this.snapshotAt().slice(0, 10));

  // --- broker posture -------------------------------------------------------

  /**
   * Doc 15's posture signals, re-exported rather than copied.
   *
   * The banner at the top of this page, the sentence above the decision buttons
   * and the reading recorded with an approval all read this one value, so none
   * of them can claim a routing behaviour the others contradict.
   */
  readonly broker = this.execution.broker;
  readonly brokerPosture = this.execution.brokerPosture;
  readonly brokerConfigured = this.execution.brokerConfigured;

  /**
   * What approving would mean right now.
   *
   * Derived from the stage ceiling rather than from `brokerConfigured`: a
   * registered adapter that is erroring has sending halted, so approving still
   * only authorises a manual placement.
   */
  readonly approvalEffect = computed<ApprovalEffect>(() =>
    this.execution.terminalStage() === 'broker-adapter' ? 'auto-routed' : 'manual-placement',
  );

  /** The sentence printed above the decision buttons, keyed by the posture alone. */
  readonly decisionSentence = computed(() => DECISION_EFFECT_SENTENCE[this.brokerPosture()]);

  // --- the queue ------------------------------------------------------------

  /**
   * The whole queue, longest wait first.
   *
   * One row per proposed order, no filtering: the collection bar counts the
   * filtered view against this, and the invariant that no trade sits at the
   * broker adapter under the default posture is a property of the whole
   * collection rather than of whatever the chips happen to show.
   *
   * The wait is `ExecutionService`'s, asked for here rather than read off the
   * order, because it is the gap between the trade's stamps and a snapshot only
   * that service holds. The ordering follows from it: this computed re-runs
   * when the snapshot moves, so a refresh that lengthens every undecided wait
   * re-sorts the queue instead of leaving it ranked on the waits of a snapshot
   * that has been replaced.
   */
  readonly queue = computed<readonly ApprovalQueueRow[]>(() =>
    this.execution
      .orders()
      .map((order) => toRow(order, this.execution.waitingSecondsFor(order)))
      .sort((a, b) => b.waitingSeconds - a.waitingSeconds),
  );

  readonly totalCount = computed(() => this.queue().length);

  private readonly rowsById = computed(() => new Map(this.queue().map((r) => [r.tradeId, r])));

  // --- filters --------------------------------------------------------------

  /** Defaults to the human gate: it is the only step this page can act on. */
  readonly stepFilter = signal<ApprovalStepFilter>(DEFAULT_STEP);
  readonly statusFilter = signal<ApprovalStatusFilter>(DEFAULT_STATUS);
  /** Free text over trade id and symbol. */
  readonly search = signal('');

  readonly filtersActive = computed(
    () =>
      this.stepFilter() !== DEFAULT_STEP ||
      this.statusFilter() !== DEFAULT_STATUS ||
      this.search().trim() !== '',
  );

  /** Back to the opening view, which is what the EmptyState's action offers. */
  clearFilters(): void {
    this.stepFilter.set(DEFAULT_STEP);
    this.statusFilter.set(DEFAULT_STATUS);
    this.search.set('');
  }

  readonly visibleQueue = computed<readonly ApprovalQueueRow[]>(() => {
    const step = this.stepFilter();
    const status = this.statusFilter();
    const query = this.search().trim().toUpperCase();

    return this.queue().filter(
      (r) =>
        (step === 'all' || r.stage === step) &&
        (status === 'all' || r.status === status) &&
        (query === '' ||
          r.tradeId.toUpperCase().includes(query) ||
          r.symbol.toUpperCase().includes(query)),
    );
  });

  readonly visibleCount = computed(() => this.visibleQueue().length);

  /** The filters match nothing, while the page and the queue behind it are fine. */
  readonly queueEmpty = computed(() => this.visibleQueue().length === 0);

  /** The collection bar's line, so the count and the sort are stated once. */
  readonly queueSummary = computed(
    () =>
      `${this.visibleCount()} of ${this.totalCount()} trades in queue · ` +
      `step ${APPROVAL_STEP_FILTER_LABEL[this.stepFilter()]} · ${QUEUE_SORT_SUMMARY}`,
  );

  /** Trades actually waiting on a person, whatever the chips currently show. */
  readonly pendingAtGateCount = computed(() => this.queue().filter((r) => r.decidable).length);

  // --- selection ------------------------------------------------------------

  private readonly _selectedTradeId = signal<string | null>(null);
  readonly selectedTradeId = this._selectedTradeId.asReadonly();

  /**
   * Opens the detail panel. An unknown id leaves the current selection alone.
   *
   * Both per-trade failures are dropped with the trade they belong to. A
   * `role="alert"` saying a decision could not be recorded is a claim about one
   * trade, and leaving it up while a different trade is on screen would attach
   * that claim to a trade nobody tried to decide.
   */
  select(tradeId: string | null): void {
    if (tradeId !== null && !this.rowsById().has(tradeId)) return;
    this._selectedTradeId.set(tradeId);
    this._detailError.set(null);
    this._decisionError.set(null);
  }

  readonly selectedTrade = computed<ApprovalQueueRow | null>(() => {
    const id = this._selectedTradeId();
    return id === null ? null : (this.rowsById().get(id) ?? null);
  });

  /** The decision controls exist for one kind of trade and are absent for the rest. */
  readonly canDecide = computed(() => this.selectedTrade()?.decidable === true);

  readonly selectedSteps = computed<readonly ApprovalStep[]>(() => {
    const trade = this.selectedTrade();
    return trade === null ? [] : this.stepsFor(trade.stage);
  });

  readonly selectedChecks = computed<AutomatedChecks | null>(() => {
    const id = this._selectedTradeId();
    return id === null ? null : this.checksFor(id);
  });

  readonly selectedCheckpoints = computed<readonly ApprovalCheckpoint[]>(() => {
    const id = this._selectedTradeId();
    return id === null ? [] : this.checkpointsFor(id);
  });

  readonly selectedDecision = computed<ApprovalDecision | null>(() => {
    const id = this._selectedTradeId();
    return id === null ? null : this.decisionFor(id);
  });

  // --- the four-step tracker ------------------------------------------------

  /**
   * The mandatory path as it stands for one trade.
   *
   * `unreachable` is not a politer `upcoming`: with no adapter registered the
   * fourth step does not run at all, and a tracker that showed it as merely
   * "not yet reached" would promise a routing that cannot happen.
   */
  private stepsFor(stage: OrderStage): readonly ApprovalStep[] {
    const at = ORDER_STAGES.indexOf(stage);
    const ceiling = ORDER_STAGES.indexOf(this.execution.terminalStage());

    return ORDER_STAGES.map((step, index) => {
      const state: StepState =
        index < at
          ? 'passed'
          : index === at
            ? 'current'
            : index > ceiling
              ? 'unreachable'
              : 'upcoming';
      return {
        stage: step,
        step: index + 1,
        label: PIPELINE_STEP_LABEL[step],
        state,
        current: state === 'current',
      };
    });
  }

  // --- the automated checks -------------------------------------------------

  /**
   * The pre-check and the rule-validation results for one trade.
   *
   * Both are read from what has actually been recorded — the trade's own
   * position in the mandatory sequence, the live kill-switch, and the guardrail
   * trail for the validator that refused. Where nothing has been recorded the
   * answer is `pending`, and the caller is told so explicitly.
   */
  checksFor(tradeId: string): AutomatedChecks | null {
    const order = this.execution.order(tradeId);
    if (!order) return null;

    const rules = this.ruleChecks(order);
    return {
      tradeId,
      preCheck: this.preCheck(order),
      rules,
      rulesPending: rules.some((r) => r.result === 'pending'),
    };
  }

  /**
   * Step one, deterministic and evaluated now.
   *
   * The kill-switch outranks everything, including a trade that has already
   * walked past this step: while trading is halted the deterministic pre-check
   * refuses every proposed order, and this page says so rather than showing the
   * pass the trade earned an hour ago.
   *
   * An unknown kill-switch makes the whole pre-check unknown. "Probably fine"
   * is not a state the pass/fail boundary is allowed to report.
   */
  private preCheck(order: ProposedOrder): PreCheckOutcome {
    const engaged = this.guardrail.killSwitchEngaged();
    const known = this.guardrail.killSwitchKnown();

    if (!known) {
      return {
        result: 'pending',
        killSwitchEngaged: engaged,
        killSwitchKnown: false,
        detail:
          'Kill-switch state could not be read — the deterministic pre-check has no result for ' +
          'this trade, and an unknown boundary is treated as unknown.',
      };
    }

    if (engaged) {
      return {
        result: 'fail',
        killSwitchEngaged: true,
        killSwitchKnown: true,
        detail:
          'Kill-switch engaged — the deterministic pre-check refuses every proposed order while ' +
          'trading is halted.',
      };
    }

    if (order.status === 'blocked' && order.stage === 'pre-trade') {
      return {
        result: 'fail',
        killSwitchEngaged: false,
        killSwitchKnown: true,
        detail: order.statusReason ?? 'The deterministic pre-check refused this trade.',
      };
    }

    if (ORDER_STAGES.indexOf(order.stage) > 0) {
      return {
        result: 'pass',
        killSwitchEngaged: false,
        killSwitchKnown: true,
        detail: 'Kill-switch not triggered and the hard limits were clear when this trade passed.',
      };
    }

    return {
      result: 'pending',
      killSwitchEngaged: false,
      killSwitchKnown: true,
      detail:
        'Still at the deterministic pre-check — no result has been recorded for this trade yet.',
    };
  }

  /**
   * Step two, one row per enabled limit the rules engine enforces.
   *
   * The rows are `GuardrailService`'s limits, so this page cannot name a rule
   * that page does not enforce, and switching a limit off there removes its row
   * here rather than leaving a rule nobody applies.
   *
   * The verdict is the trade's, not the limit's: a limit standing in BREACH
   * because of some other trade does not make this one fail. Three readings and
   * no fourth:
   *
   * - the trade has moved past rule validation, so the engine cleared it — every
   *   row is `pass`;
   * - a rule stopped it, and the trail names the validator that raised — that
   *   one row is `fail` with the validator's own words, and the rules that did
   *   not raise are `pass`;
   * - anything else — the trade is still at or before this step, or a refusal
   *   was recorded without naming its validator — and every row is `pending`.
   */
  private ruleChecks(order: ProposedOrder): readonly RuleCheck[] {
    const limits = this.guardrail
      .limits()
      .filter((l): l is HardLimit & { scope: RuleScope } => l.enabled && l.scope !== 'kill-switch');

    const failure = this.ruleFailure(order);
    const cleared = ORDER_STAGES.indexOf(order.stage) > ORDER_STAGES.indexOf('rule-validation');

    return limits.map((limit) => {
      let result: CheckResult = 'pending';
      let detail: string | null = null;

      if (failure !== null && failure.limitId !== null) {
        result = limit.id === failure.limitId ? 'fail' : 'pass';
        detail = limit.id === failure.limitId ? failure.detail : null;
      } else if (failure === null && cleared) {
        result = 'pass';
      }

      return {
        limitId: limit.id,
        name: limit.name,
        scope: limit.scope,
        label: RULE_SCOPE_LABEL[limit.scope],
        result,
        detail,
      };
    });
  }

  /** The refusal recorded against this trade at rule validation, if there was one. */
  private ruleFailure(order: ProposedOrder): { limitId: string | null; detail: string } | null {
    if (order.status !== 'blocked' || order.stage !== 'rule-validation') return null;

    const raised = this.guardrail
      .events()
      .find(
        (e) => e.tradeId === order.id && e.stage === 'rule-validation' && e.outcome === 'fail',
      );
    const limit = this.guardrail.limits().find((l) => l.validatorName === raised?.actor);

    return {
      limitId: limit?.id ?? null,
      detail:
        raised?.detail ?? order.statusReason ?? 'A rule refused this trade at rule validation.',
    };
  }

  // --- the audit trail ------------------------------------------------------

  /**
   * Every checkpointed transition of one trade, oldest first.
   *
   * Three sources, none of them a second log: the order's own arrival stamp, the
   * guardrail trail's rows for that trade, and — only when the trail has not
   * recorded it yet — the signature the order carries from a decision made in
   * this session. The dedupe is what stops a trade decided before the page
   * opened from showing its approval twice.
   *
   * The sources record at different precisions — the order stamps seconds, the
   * trail stamps minutes — so within one minute the sequence cannot be settled
   * on the clock. It is settled on the pipeline instead: the four steps are
   * mandatory and ordered, and a trade is queued before anything checks it.
   */
  checkpointsFor(tradeId: string): readonly ApprovalCheckpoint[] {
    const order = this.execution.order(tradeId);
    if (!order) return [];

    const date = this.runDate();
    const events = this.guardrail.events().filter((e) => e.tradeId === tradeId);

    const entries: TrailEntry[] = [
      {
        source: 0,
        checkpoint: {
          id: `${tradeId}-queued`,
          tradeId,
          date,
          at: order.queuedAt,
          stage: 'pre-trade',
          label: `Queued at ${PIPELINE_STEP_LABEL['pre-trade']}`,
          detail: null,
        },
      },
      ...events.map<TrailEntry>((event) => ({
        source: 1,
        checkpoint: toCheckpoint(tradeId, event),
      })),
    ];

    const signed = events.some((e) => e.stage === 'human-gate');
    if (order.decidedAt !== null && !signed) {
      const outcome: ApprovalOutcome = order.status === 'approved' ? 'approved' : 'rejected';
      entries.push({
        source: 2,
        checkpoint: {
          id: `${tradeId}-decision`,
          tradeId,
          date,
          at: order.decidedAt,
          stage: 'human-gate',
          label: `${PIPELINE_STEP_LABEL['human-gate']} — ${APPROVAL_OUTCOME_LABEL[outcome]}`,
          detail: order.statusReason,
        },
      });
    }

    return entries.sort(byCheckpointOrder).map((entry) => entry.checkpoint);
  }

  // --- decisions ------------------------------------------------------------

  private readonly _decisionRecords = signal<readonly DecisionEffectRecord[]>(
    SEED_DECISION_RECORDS,
  );

  private readonly recordsById = computed(
    () => new Map(this._decisionRecords().map((r) => [r.tradeId, r])),
  );

  /**
   * The decision recorded for one trade, or null while it is still waiting.
   *
   * A join: the outcome, the signature and the timestamp are the order's, and
   * only the reading of the approval and the note come from this service —
   * which is exactly the pair the order cannot carry.
   */
  decisionFor(tradeId: string): ApprovalDecision | null {
    const order = this.execution.order(tradeId);
    if (!order || order.decidedAt === null) return null;

    const outcome: ApprovalOutcome = order.status === 'approved' ? 'approved' : 'rejected';
    const record = this.recordsById().get(tradeId) ?? null;

    return {
      tradeId,
      outcome,
      note: record?.note ?? null,
      decidedBy: order.decidedBy ?? 'unknown',
      decidedAt: order.decidedAt,
      effect: outcome === 'approved' ? (record?.effect ?? null) : null,
      posture: record?.posture ?? this.brokerPosture(),
    };
  }

  /** Every decision recorded so far, newest signature last. */
  readonly decisions = computed<readonly ApprovalDecision[]>(() =>
    this.queue()
      .map((r) => this.decisionFor(r.tradeId))
      .filter((d): d is ApprovalDecision => d !== null),
  );

  private readonly _deciding = signal(false);
  readonly deciding = this._deciding.asReadonly();

  private readonly _decisionError = signal<string | null>(null);
  readonly decisionError = this._decisionError.asReadonly();

  /**
   * Records a human decision at the gate.
   *
   * The write itself is `ExecutionService.advanceStage` — this service does not
   * splice the order array, so doc 15's table and doc 17's counters move with
   * the decision instead of being told about it afterwards.
   *
   * Two properties are load-bearing:
   *
   * - **a failed write records nothing.** `advanceStage` is not called, no
   *   effect is stored, the trade is still waiting at the gate and the caller
   *   is handed the failure so the dialog can stay open with the typed note.
   * - **the reading of the approval is captured before the write and stored
   *   with it.** Whether approving routed the order or authorised a placement
   *   is a fact about the posture at that moment, and reconstructing it later
   *   from a posture that has since changed would rewrite history.
   * - **one confirmation is one decision.** A second call arriving while the
   *   first is still in flight is refused here rather than allowed to race it:
   *   both would pass the guards below, the second `advanceStage` would find
   *   the trade already decided and return false, and the decider would be told
   *   "nothing was submitted" about a decision that had just been recorded.
   */
  async decide(
    tradeId: string,
    approve: boolean,
    note = '',
    fail = false,
  ): Promise<ApprovalDecisionResult> {
    if (this._deciding()) {
      return { ok: false, error: DECISION_IN_FLIGHT, decision: null };
    }

    const order = this.execution.order(tradeId);

    if (!order || order.stage !== 'human-gate') {
      this._decisionError.set(NOT_AT_GATE);
      return { ok: false, error: NOT_AT_GATE, decision: null };
    }
    if (order.status !== 'pending') {
      this._decisionError.set(ALREADY_DECIDED);
      return { ok: false, error: ALREADY_DECIDED, decision: null };
    }

    const trimmed = note.trim();
    const effect: ApprovalEffect | null = approve ? this.approvalEffect() : null;
    const posture = this.brokerPosture();

    this._deciding.set(true);
    this._decisionError.set(null);

    await delay(WRITE_MS);

    // Nothing above this line has changed any state the page reads.
    if (fail) {
      this._deciding.set(false);
      this._decisionError.set(DECISION_WRITE_FAILURE);
      return { ok: false, error: DECISION_WRITE_FAILURE, decision: null };
    }

    const written = this.execution.advanceStage(tradeId, approve ? 'approve' : 'reject', trimmed);
    if (!written) {
      this._deciding.set(false);
      this._decisionError.set(DECISION_WRITE_FAILURE);
      return { ok: false, error: DECISION_WRITE_FAILURE, decision: null };
    }

    this._decisionRecords.update((records) => [
      ...records.filter((r) => r.tradeId !== tradeId),
      { tradeId, effect, posture, note: trimmed === '' ? null : trimmed },
    ]);
    this._deciding.set(false);

    return { ok: true, error: null, decision: this.decisionFor(tradeId) };
  }

  clearDecisionError(): void {
    this._decisionError.set(null);
  }

  /** What an approval of this trade would mean, in the words the dialog repeats. */
  approvalSummary(): string {
    return APPROVAL_EFFECT_DETAIL[this.approvalEffect()];
  }

  // --- the detail region ----------------------------------------------------

  private readonly _detailLoading = signal(false);
  readonly detailLoading = this._detailLoading.asReadonly();

  private readonly _detailError = signal<string | null>(null);
  readonly detailError = this._detailError.asReadonly();

  /**
   * Re-reads the selected trade's checks and trail on its own.
   *
   * The queue is untouched: the spec is explicit that a detail that fails to
   * load leaves the rest of the page operative, with a local ErrorState and a
   * retry confined to the panel.
   */
  async loadDetail(fail = false): Promise<void> {
    if (this._detailLoading()) return;
    this._detailLoading.set(true);
    this._detailError.set(null);

    await delay(DETAIL_MS);

    if (fail) this._detailError.set(DETAIL_ERROR_MESSAGE);
    this._detailLoading.set(false);
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Re-reads the queue, keeping the filters and the selection.
   *
   * The read is `ExecutionService.refresh` — the queue is that snapshot, so
   * re-reading it here and re-reading it on doc 15 are the same act. Neither
   * the chips nor the selected trade are touched: a refresh is not a reset, and
   * a person who narrowed the queue to one symbol expects it still narrowed
   * afterwards.
   *
   * The one thing a successful reload may change is a selection that no longer
   * exists — that is dropped rather than left pointing at a trade the snapshot
   * no longer holds.
   */
  async refresh(fail = false): Promise<void> {
    if (this._loading()) return;
    this._loading.set(true);
    this._errorMessage.set(null);

    await this.execution.refresh(fail);

    if (fail) {
      this._errorMessage.set(QUEUE_ERROR_MESSAGE);
    } else {
      const selected = this._selectedTradeId();
      if (selected !== null && this.execution.order(selected) === null) {
        this._selectedTradeId.set(null);
      }
    }

    this._loading.set(false);
  }

  clearError(): void {
    this._errorMessage.set(null);
    this._detailError.set(null);
    this._decisionError.set(null);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * One proposed order as the queue reads it.
 *
 * `decidable` is the single place the page's action rule lives: the human gate
 * is the only step at which a person is being asked anything, and only while
 * nobody has answered. Every card, the detail panel and the two buttons read
 * this one flag rather than each re-testing a stage and a status.
 *
 * `waitingSeconds` is passed in rather than taken from the order: the order does
 * not carry one, because a wait is only meaningful against the snapshot it is
 * measured to. The row is rebuilt whenever that snapshot moves.
 */
function toRow(order: ProposedOrder, waitingSeconds: number): ApprovalQueueRow {
  return {
    tradeId: order.id,
    symbol: order.symbol,
    side: order.side,
    quantity: Math.abs(order.targetQuantityDelta),
    notionalValue: order.notionalValue,
    stage: order.stage,
    status: order.status,
    statusReason: order.statusReason,
    waitingSeconds,
    waiting: formatWaiting(waitingSeconds),
    proposedBy: PROPOSING_AGENT,
    queuedAt: order.queuedAt,
    decidable: order.stage === 'human-gate' && order.status === 'pending',
  };
}

/** A checkpoint with the rank of the source that produced it: queued, trail, signature. */
interface TrailEntry {
  readonly source: 0 | 1 | 2;
  readonly checkpoint: ApprovalCheckpoint;
}

/**
 * By the mandatory sequence first — then chronological, to the minute.
 *
 * The four steps are walked in one order and no other, so the step a checkpoint
 * belongs to settles the sequence before any stamp does. That ordering is also
 * the only one the clock cannot break: the seeded checkpoints are stamped
 * against the snapshot's own run, while a decision taken in this session is
 * stamped from the wall clock, and sorting on the stamp first put a signature
 * recorded at 02:31 above the 09:12 at which its trade was queued — an audit
 * trail claiming a person approved a trade before it existed.
 *
 * Within one step the clock decides, and it is only authoritative down to the
 * coarsest stamp involved: the trail records minutes and the order records
 * seconds. Ties inside a minute fall to the source — a trade is queued before a
 * check reports on it, and a check reports before a person signs.
 */
function byCheckpointOrder(a: TrailEntry, b: TrailEntry): number {
  const stage =
    ORDER_STAGES.indexOf(a.checkpoint.stage) - ORDER_STAGES.indexOf(b.checkpoint.stage);
  if (stage !== 0) return stage;

  const minute = `${a.checkpoint.date} ${a.checkpoint.at.slice(0, 5)}`.localeCompare(
    `${b.checkpoint.date} ${b.checkpoint.at.slice(0, 5)}`,
  );
  return minute !== 0 ? minute : a.source - b.source;
}

function toCheckpoint(tradeId: string, event: GuardrailEvent): ApprovalCheckpoint {
  return {
    id: event.id,
    tradeId,
    date: event.date,
    at: event.at,
    stage: event.stage,
    label: `${PIPELINE_STEP_LABEL[event.stage]} — ${GUARDRAIL_OUTCOME_LABEL[event.outcome]}`,
    detail: event.detail,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
