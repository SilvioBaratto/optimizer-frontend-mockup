import { Injectable, computed, signal } from '@angular/core';

import {
  ORDER_STAGES,
  type BrokerAdapterState,
  type BrokerPosture,
  type ExecutionRunStatus,
  type OrderDecision,
  type OrderSide,
  type OrderStage,
  type OrderStatus,
  type ProposedOrder,
  type TargetSnapshot,
  type ToolCall,
} from '../models/order.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 700;

/** Who signs at the gate in this stand-in. Doc 16 replaces it with the session user. */
const APPROVER = 'm.rossi@fund';

const RUN_DATE = '2026-08-01';

/** The target the shown orders were sized against, and the one in the newest state. */
const TARGET_AT_RUN: TargetSnapshot = {
  id: 'balanced-growth-v3',
  label: 'Balanced Growth v3',
  publishedAt: '2026-08-01 09:11 UTC',
};

/**
 * Front-loaded Almgren-Chriss schedule: trade sizes decay geometrically, so the
 * position is closed faster than a constant rate and less of it is left exposed
 * to price volatility. `decay` stands in for exp(-kappa*tau) — closer to 1 for
 * a liquid name that can afford to wait.
 *
 * The last interval absorbs the rounding, which is what makes the intervals sum
 * to the order exactly rather than approximately.
 */
function schedule(total: number, intervals: number, decay: number): readonly number[] {
  if (intervals <= 0) return [];
  const weights = Array.from({ length: intervals }, (_, i) => decay ** i);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const slices = weights.map((w) => Math.round((total * w) / weightSum));
  const drift = total - slices.reduce((sum, s) => sum + s, 0);
  slices[slices.length - 1] += drift;
  return slices;
}

/**
 * `proposed_orders` as the execution agent last wrote them.
 *
 * Fourteen orders across the first three stages and none at the fourth, which
 * is not a coincidence: the default posture has no broker, so the human gate is
 * the last step an order can reach. Three sit pending at that gate and one is
 * blocked by the concentration rule, which is what the chip bar counts.
 *
 * HYG and SLV came back without an intraday volume profile, so no trajectory
 * was solved and no cost or risk was published for them. They stay at the
 * pre-trade check with `—` in both estimate columns rather than a made-up
 * number, and the service pins them there.
 *
 * **`queuedAt` is not the run clock.** It is when the trade entered the
 * *pipeline* — `ApprovalGateService` renders it as the first checkpoint of the
 * trade's audit trail, "Queued at Pre-trade check" — and it spans 07:37:42 to
 * 09:52:57, far wider than the 09:10:41 → 09:14:20 window run #1247's decisions
 * sit in. That is not a contradiction: a run re-solves the standing pipeline,
 * and a re-proposal that leaves a trade's sizing alone does not re-queue it or
 * reset the waiting time a person has been accruing against it. So a trade can
 * carry a `queuedAt` earlier than the order intent that drafted it — five of
 * the fourteen below do — and `GuardrailService` already records TRD-2019
 * passing the pre-trade check at 08:41, over half an hour before the run opened
 * at 09:10:41. The field's own meaning is stated where it is declared, on
 * `ProposedOrder.queuedAt` in `models/order.model.ts`.
 */
const SEED_ORDERS: readonly ProposedOrder[] = [
  // --- human gate ----------------------------------------------------------
  {
    id: 'TRD-2031',
    symbol: 'AAPL',
    side: 'buy',
    targetQuantityDelta: 12_400,
    notionalValue: 2_460_000,
    trajectory: schedule(12_400, 5, 0.72),
    estimatedShortfallBps: 18,
    estimatedRiskBps: 6,
    stage: 'human-gate',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:12:03',
    waitingSeconds: 2472,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 3.1e-7, eta: 2.4e-6, halfLifeMinutes: 12 },
  },
  {
    id: 'TRD-2030',
    symbol: 'MSFT',
    side: 'sell',
    targetQuantityDelta: -4_900,
    notionalValue: 1_980_000,
    trajectory: schedule(4_900, 5, 0.75),
    estimatedShortfallBps: 14,
    estimatedRiskBps: 5,
    stage: 'human-gate',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:41:10',
    waitingSeconds: 725,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 2.8e-7, eta: 2.2e-6, halfLifeMinutes: 11 },
  },
  {
    id: 'TRD-2019',
    symbol: 'QQQ',
    side: 'sell',
    targetQuantityDelta: -5_000,
    notionalValue: 1_900_000,
    trajectory: schedule(5_000, 4, 0.78),
    estimatedShortfallBps: 9,
    estimatedRiskBps: 4,
    stage: 'human-gate',
    status: 'pending',
    statusReason: null,
    // In the pipeline since before run #1247 opened at 09:10:41, and still
    // waiting on a person: doc 16 shows it at 02:15:33, the longest wait on the
    // queue. Run #1247 re-proposed it unchanged, which is why its audit-log
    // intent is stamped 09:14:13 and its entry here is not.
    queuedAt: '07:37:42',
    waitingSeconds: 8133,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 1.6e-7, eta: 1.3e-6, halfLifeMinutes: 8 },
  },
  {
    id: 'TRD-2028',
    symbol: 'TLT',
    side: 'sell',
    targetQuantityDelta: -8_100,
    notionalValue: 726_000,
    trajectory: schedule(8_100, 5, 0.74),
    estimatedShortfallBps: 11,
    estimatedRiskBps: 4,
    stage: 'human-gate',
    status: 'approved',
    statusReason:
      'Approved for manual placement — with no broker adapter configured the order does not leave the system.',
    queuedAt: '09:13:12',
    waitingSeconds: 1887,
    decidedAt: '09:44:39',
    decidedBy: APPROVER,
    impact: { lambda: 2.1e-7, eta: 1.7e-6, halfLifeMinutes: 14 },
  },
  {
    id: 'TRD-2025',
    symbol: 'EFA',
    side: 'buy',
    targetQuantityDelta: 9_200,
    notionalValue: 816_000,
    trajectory: schedule(9_200, 6, 0.79),
    estimatedShortfallBps: 19,
    estimatedRiskBps: 8,
    stage: 'human-gate',
    status: 'approved',
    statusReason:
      'Approved for manual placement — with no broker adapter configured the order does not leave the system.',
    queuedAt: '09:14:05',
    waitingSeconds: 1255,
    decidedAt: '09:35:00',
    decidedBy: APPROVER,
    impact: { lambda: 3.6e-7, eta: 2.9e-6, halfLifeMinutes: 18 },
  },
  {
    id: 'TRD-2022',
    symbol: 'ARKK',
    side: 'sell',
    targetQuantityDelta: -1_500,
    notionalValue: 92_000,
    trajectory: schedule(1_500, 6, 0.82),
    estimatedShortfallBps: 21,
    estimatedRiskBps: 11,
    stage: 'human-gate',
    status: 'rejected',
    statusReason:
      'Rejected at the gate — the sleeve is being wound down through a separate programme trade this week.',
    // Also in the pipeline before the run, and re-proposed unchanged by it.
    queuedAt: '08:52:31',
    waitingSeconds: 1649,
    decidedAt: '09:20:00',
    decidedBy: APPROVER,
    impact: { lambda: 9.4e-7, eta: 7.1e-6, halfLifeMinutes: 26 },
  },

  // --- rule validation -----------------------------------------------------
  {
    id: 'TRD-2033',
    symbol: 'EEM',
    side: 'buy',
    targetQuantityDelta: 5_600,
    notionalValue: 231_000,
    trajectory: schedule(5_600, 6, 0.8),
    estimatedShortfallBps: 24,
    estimatedRiskBps: 9,
    stage: 'rule-validation',
    status: 'blocked',
    statusReason:
      'Single-name concentration limit — EEM would reach 12.4% NAV against the configured 12.0% cap.',
    queuedAt: '09:15:44',
    waitingSeconds: 2251,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 5.2e-7, eta: 4.3e-6, halfLifeMinutes: 22 },
  },
  {
    id: 'TRD-2032',
    symbol: 'LQD',
    side: 'buy',
    targetQuantityDelta: 7_400,
    notionalValue: 794_000,
    trajectory: schedule(7_400, 6, 0.77),
    estimatedShortfallBps: 13,
    estimatedRiskBps: 5,
    stage: 'rule-validation',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:26:10',
    waitingSeconds: 1625,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 2.9e-7, eta: 2.3e-6, halfLifeMinutes: 16 },
  },
  {
    id: 'TRD-2035',
    symbol: 'SPY',
    side: 'sell',
    targetQuantityDelta: -900,
    notionalValue: 484_000,
    trajectory: schedule(900, 4, 0.85),
    estimatedShortfallBps: 5,
    estimatedRiskBps: 2,
    stage: 'rule-validation',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:49:28',
    waitingSeconds: 227,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 1.1e-7, eta: 0.9e-6, halfLifeMinutes: 6 },
  },
  {
    id: 'TRD-2034',
    symbol: 'GLD',
    side: 'buy',
    targetQuantityDelta: 1_800,
    notionalValue: 383_000,
    trajectory: schedule(1_800, 5, 0.81),
    estimatedShortfallBps: 7,
    estimatedRiskBps: 3,
    stage: 'rule-validation',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:52:57',
    waitingSeconds: 18,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 2.4e-7, eta: 1.9e-6, halfLifeMinutes: 13 },
  },

  // --- pre-trade check -----------------------------------------------------
  {
    id: 'TRD-2039',
    symbol: 'XLE',
    side: 'sell',
    targetQuantityDelta: -2_150,
    notionalValue: 187_000,
    trajectory: schedule(2_150, 6, 0.83),
    estimatedShortfallBps: 16,
    estimatedRiskBps: 7,
    stage: 'pre-trade',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:47:55',
    waitingSeconds: 320,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 4.7e-7, eta: 3.8e-6, halfLifeMinutes: 19 },
  },
  {
    id: 'TRD-2038',
    symbol: 'IEF',
    side: 'buy',
    targetQuantityDelta: 6_750,
    notionalValue: 656_000,
    trajectory: schedule(6_750, 5, 0.76),
    estimatedShortfallBps: 8,
    estimatedRiskBps: 3,
    stage: 'pre-trade',
    status: 'pending',
    statusReason: null,
    queuedAt: '09:50:11',
    waitingSeconds: 184,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 2.2e-7, eta: 1.8e-6, halfLifeMinutes: 12 },
  },
  {
    id: 'TRD-2036',
    symbol: 'HYG',
    side: 'sell',
    targetQuantityDelta: -3_200,
    notionalValue: 251_000,
    trajectory: [],
    estimatedShortfallBps: null,
    estimatedRiskBps: null,
    stage: 'pre-trade',
    status: 'pending',
    statusReason:
      'Scheduling incomplete — the intraday volume profile came back short, so no cost or risk estimate is published.',
    queuedAt: '09:51:02',
    waitingSeconds: 133,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 4.4e-7, eta: 3.5e-6, halfLifeMinutes: 21 },
  },
  {
    id: 'TRD-2037',
    symbol: 'SLV',
    side: 'buy',
    targetQuantityDelta: 14_500,
    notionalValue: 412_000,
    trajectory: [],
    estimatedShortfallBps: null,
    estimatedRiskBps: null,
    stage: 'pre-trade',
    status: 'pending',
    statusReason:
      'Scheduling incomplete — the intraday volume profile came back short, so no cost or risk estimate is published.',
    queuedAt: '09:52:40',
    waitingSeconds: 35,
    decidedAt: null,
    decidedBy: null,
    impact: { lambda: 6.1e-7, eta: 4.8e-6, halfLifeMinutes: 24 },
  },
];

/** The last run's tool calls. Read or pure compute, all four of them. */
const TOOL_CALLS: readonly ToolCall[] = [
  { id: 'tc-1', at: '09:14:02', tool: 'get_market_data', kind: 'read' },
  { id: 'tc-2', at: '09:14:05', tool: 'get_risk_metrics', kind: 'compute' },
  { id: 'tc-3', at: '09:14:09', tool: 'run_optimizer', kind: 'compute' },
  { id: 'tc-4', at: '09:14:12', tool: 'propose_orders', kind: 'compute' },
];

const REASONING_EXCERPT =
  'Sized turnover from target vs current weights; AAPL scheduled over 5 intervals given estimated ' +
  'liquidity, front-loaded because the timing risk on the residual position dominates the extra ' +
  'impact of trading early. HYG and SLV left unscheduled — the intraday volume profile came back ' +
  'short, so no shortfall or risk figure is published for either and both stay at the pre-trade check.';

/**
 * Applies the two rules that constrain where an order may sit.
 *
 * Both are invariants of the domain rather than of the screen, so they are
 * enforced on the way out of the service instead of being re-checked by each of
 * the four pages that read this array:
 *
 * - an order with no cost and risk estimate has no priced trajectory, so it
 *   cannot leave the deterministic pre-trade check;
 * - no order can sit past the ceiling the broker posture allows. With no
 *   adapter registered — the default — the human gate is the last step, so
 *   `broker-adapter` is unreachable and approval means "authorised to place".
 */
function applyStageRules(
  orders: readonly ProposedOrder[],
  terminal: OrderStage,
): readonly ProposedOrder[] {
  const ceiling = ORDER_STAGES.indexOf(terminal);
  return orders.map((order) => {
    const unpriced = order.estimatedShortfallBps === null || order.estimatedRiskBps === null;
    const wanted = unpriced ? 0 : ORDER_STAGES.indexOf(order.stage);
    const stage = ORDER_STAGES[Math.min(wanted, ceiling)];
    return stage === order.stage ? order : { ...order, stage };
  });
}

/** Sorting key for the table's sortable headers. */
export type OrderSortKey = 'symbol' | 'side' | 'quantity' | 'shortfall' | 'risk' | 'stage';

/**
 * `HH:MM:SS` from a second count.
 *
 * Lives here rather than in three page components: docs 15, 16 and 24 all print
 * a waiting time, and three formatters would eventually print three formats for
 * the same trade.
 */
export function formatWaiting(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const parts = [Math.floor(clamped / 3600), Math.floor((clamped % 3600) / 60), clamped % 60];
  return parts.map((p) => String(p).padStart(2, '0')).join(':');
}

/**
 * The execution agent's output: `proposed_orders`, and nothing that sends them.
 *
 * This service owns the order list for the whole application. Doc 15 renders it
 * as a table, doc 16 as an approval queue, doc 17 counts it per pipeline step
 * and doc 24 lists the intents. A second mock of the same fourteen trades would
 * drift within a sprint, so there is exactly one, and the stage rules that make
 * the four views agree are enforced here rather than in any of them.
 *
 * Nothing in this file places an order. `advanceStage` records what a human
 * decided at the gate; the only step at which an order would really leave the
 * system is `broker-adapter`, and that step is unreachable until an adapter is
 * registered.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the page's loading and error
 * states reachable.
 */
@Injectable({ providedIn: 'root' })
export class ExecutionService {
  // --- page state -----------------------------------------------------------

  private readonly _state = signal<PageState>('ready');
  readonly state = this._state.asReadonly();

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  /** When the fund-state snapshot below was read. Refresh moves this. */
  private readonly _snapshotAt = signal(`${RUN_DATE} 09:53:15 UTC`);
  readonly snapshotAt = this._snapshotAt.asReadonly();

  // --- the agent's own run --------------------------------------------------

  private readonly _runStatus = signal<ExecutionRunStatus>('idle');
  readonly runStatus = this._runStatus.asReadonly();

  /**
   * The last agent run. Deliberately not touched by `refresh()`: re-reading the
   * snapshot is not a new run, and relabelling it as one would misdate the
   * reasoning and the tool calls shown beside it.
   */
  private readonly _lastRun = signal(`${RUN_DATE} 09:14 UTC`);
  readonly lastRun = this._lastRun.asReadonly();

  readonly toolCalls = signal<readonly ToolCall[]>(TOOL_CALLS);
  readonly reasoningExcerpt = signal(REASONING_EXCERPT);

  // --- broker posture -------------------------------------------------------

  /**
   * No adapter registered is the default posture, not a limitation.
   *
   * Doc 15's banner, doc 16's decision sentence, doc 17's step [4] and doc 24's
   * idempotency card all read this one value, so none of them can claim a
   * routing behaviour the others contradict.
   */
  private readonly _broker = signal<BrokerAdapterState>({
    posture: 'not-configured',
    adapter: null,
    detail: null,
  });
  readonly broker = this._broker.asReadonly();

  readonly brokerPosture = computed<BrokerPosture>(() => this._broker().posture);

  /** True once an adapter is registered, whether or not it is currently healthy. */
  readonly brokerConfigured = computed(() => this.brokerPosture() !== 'not-configured');

  /**
   * The last stage an order can reach right now.
   *
   * Only a connected adapter opens the fourth step: a registered adapter in
   * error has sending halted, so the ceiling drops back to the human gate and
   * the approved list stays intact.
   */
  readonly terminalStage = computed<OrderStage>(() =>
    this.brokerPosture() === 'connected' ? 'broker-adapter' : 'human-gate',
  );

  setBroker(state: BrokerAdapterState): void {
    this._broker.set(state);
  }

  // --- orders ---------------------------------------------------------------

  /** The raw snapshot. Everything public reads it through `orders`. */
  private readonly _orders = signal<readonly ProposedOrder[]>(SEED_ORDERS);

  /**
   * `proposed_orders`, with the stage rules applied.
   *
   * Every reader goes through here, so an order that would violate the posture
   * ceiling or the unpriced-order pin is corrected once rather than caught four
   * times — or, more likely, three times and missed once.
   */
  readonly orders = computed<readonly ProposedOrder[]>(() =>
    applyStageRules(this._orders(), this.terminalStage()),
  );

  readonly totalCount = computed(() => this.orders().length);

  private readonly ordersById = computed(() => new Map(this.orders().map((o) => [o.id, o])));

  /** Lookup for the deep links docs 16 and 24 arrive with. */
  order(id: string): ProposedOrder | null {
    return this.ordersById().get(id) ?? null;
  }

  /**
   * The queue partitioned by stage, in one pass.
   *
   * Grouping once is what makes `ordersAtStage` and `stageCounts` incapable of
   * disagreeing — doc 17's counters are literally the lengths of doc 16's
   * buckets.
   */
  readonly ordersByStage = computed<Record<OrderStage, readonly ProposedOrder[]>>(() => {
    const grouped: Record<OrderStage, ProposedOrder[]> = {
      'pre-trade': [],
      'rule-validation': [],
      'human-gate': [],
      'broker-adapter': [],
    };
    for (const order of this.orders()) grouped[order.stage].push(order);
    return grouped;
  });

  ordersAtStage(stage: OrderStage): readonly ProposedOrder[] {
    return this.ordersByStage()[stage];
  }

  readonly stageCounts = computed<Record<OrderStage, number>>(() => {
    const grouped = this.ordersByStage();
    return {
      'pre-trade': grouped['pre-trade'].length,
      'rule-validation': grouped['rule-validation'].length,
      'human-gate': grouped['human-gate'].length,
      'broker-adapter': grouped['broker-adapter'].length,
    };
  });

  readonly statusCounts = computed<Record<OrderStatus, number>>(() => {
    const counts: Record<OrderStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      blocked: 0,
    };
    for (const order of this.orders()) counts[order.status]++;
    return counts;
  });

  readonly blockedOrders = computed(() => this.orders().filter((o) => o.status === 'blocked'));
  readonly blockedCount = computed(() => this.blockedOrders().length);

  /**
   * Waiting on a person, as opposed to waiting on a check.
   *
   * An order pending at the pre-trade check is also "pending", but nobody is
   * being asked to do anything about it, which is why the chip bar counts only
   * the gate.
   */
  readonly ordersPendingApproval = computed(() =>
    this.ordersAtStage('human-gate').filter((o) => o.status === 'pending'),
  );
  readonly pendingApprovalCount = computed(() => this.ordersPendingApproval().length);

  /** Orders the agent could not price, still at the deterministic check. */
  readonly unscheduledOrders = computed(() =>
    this.orders().filter((o) => o.estimatedShortfallBps === null || o.estimatedRiskBps === null),
  );

  /**
   * Records a human decision and moves the order one step along the pipeline.
   *
   * Returns false and changes nothing when the order may not move — which is
   * the point of the method existing at all rather than each page splicing the
   * array itself:
   *
   * - the id is unknown;
   * - the scheduling is incomplete, so the order is pinned to the pre-trade
   *   check and there is no priced trajectory to approve;
   * - a rule has blocked it, and only clearing that rule releases it;
   * - it has already been decided;
   * - approving would push it past the ceiling the broker posture allows —
   *   with no adapter, an approved order stays at the gate, approved.
   */
  advanceStage(orderId: string, decision: OrderDecision, note?: string): boolean {
    const current = this.order(orderId);
    if (!current) return false;
    if (current.status !== 'pending') return false;
    if (current.estimatedShortfallBps === null || current.estimatedRiskBps === null) return false;

    const at = clockNow();

    if (decision === 'reject') {
      // A rejection always leaves words behind, note or no note.
      this.write(orderId, {
        status: 'rejected',
        statusReason: note?.trim()
          ? note.trim()
          : 'Rejected at the human gate — no reason recorded with the decision.',
        decidedAt: at,
        decidedBy: APPROVER,
      });
      return true;
    }

    const index = ORDER_STAGES.indexOf(current.stage);
    const ceiling = ORDER_STAGES.indexOf(this.terminalStage());
    const next = ORDER_STAGES[Math.min(index + 1, ceiling)];

    // Passing an automated check is not a human decision; only the gate is.
    if (current.stage !== 'human-gate') {
      this.write(orderId, { stage: next, statusReason: null });
      return true;
    }

    this.write(orderId, {
      stage: next,
      status: 'approved',
      statusReason: this.brokerConfigured()
        ? `Approved and routed to ${this._broker().adapter ?? 'the configured adapter'}.`
        : 'Approved for manual placement — with no broker adapter configured the order does not leave the system.',
      decidedAt: at,
      decidedBy: APPROVER,
      waitingSeconds: current.waitingSeconds,
    });
    return true;
  }

  private write(orderId: string, patch: Partial<ProposedOrder>): void {
    this._orders.update((orders) =>
      orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
    );
  }

  // --- stale target ---------------------------------------------------------

  /** The target portfolio the shown orders were sized against. */
  readonly generatedFromTarget = signal<TargetSnapshot>(TARGET_AT_RUN);

  /**
   * The target portfolio in the newest fund state. `refresh()` re-reads it; a
   * publication on Review & Rebalancing is what moves it ahead of the one above.
   */
  readonly latestTarget = signal<TargetSnapshot>(TARGET_AT_RUN);

  /**
   * The order list is against a target the fund state has since replaced.
   *
   * Derived rather than stored: a flag set alongside the two snapshots would
   * eventually say "current" about a list generated from something else.
   */
  readonly staleTarget = computed(() => this.latestTarget().id !== this.generatedFromTarget().id);

  // --- table view state -----------------------------------------------------
  //
  // Page-scoped, not part of the cross-page contract: doc 16 filters the same
  // orders with different defaults, and does so through its own service.

  readonly symbolQuery = signal('');
  readonly stageFilter = signal<OrderStage | 'all'>('all');
  readonly sideFilter = signal<OrderSide | 'all'>('all');
  readonly sortKey = signal<OrderSortKey>('symbol');
  readonly sortAscending = signal(true);
  readonly selectedOrderId = signal<string | null>(null);

  readonly selectedOrder = computed(() => {
    const id = this.selectedOrderId();
    return id === null ? null : this.order(id);
  });

  /** Toggles direction when the same header is activated twice. */
  setSort(key: OrderSortKey): void {
    if (this.sortKey() === key) this.sortAscending.update((asc) => !asc);
    else {
      this.sortKey.set(key);
      this.sortAscending.set(true);
    }
  }

  readonly visibleOrders = computed<readonly ProposedOrder[]>(() => {
    const query = this.symbolQuery().trim().toUpperCase();
    const stage = this.stageFilter();
    const side = this.sideFilter();

    const matched = this.orders().filter(
      (o) =>
        (query === '' || o.symbol.includes(query) || o.id.toUpperCase().includes(query)) &&
        (stage === 'all' || o.stage === stage) &&
        (side === 'all' || o.side === side),
    );

    const direction = this.sortAscending() ? 1 : -1;
    const key = this.sortKey();
    return [...matched].sort((a, b) => {
      // "Not measured" is not a small number: unpriced orders sit at the end in
      // both directions, so flipping the header never presents an order with no
      // estimate as the cheapest trade on the list.
      const unpriced = unpricedRank(a, key) - unpricedRank(b, key);
      return unpriced !== 0 ? unpriced : direction * compareOrders(a, b, key);
    });
  });

  readonly visibleCount = computed(() => this.visibleOrders().length);

  readonly filtersActive = computed(
    () => this.symbolQuery().trim() !== '' || this.stageFilter() !== 'all' || this.sideFilter() !== 'all',
  );

  clearFilters(): void {
    this.symbolQuery.set('');
    this.stageFilter.set('all');
    this.sideFilter.set('all');
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Mock lever, not part of the contract: when false the next snapshot read
   * comes back with no proposed orders, which is how the page's empty state is
   * reached without editing this file.
   */
  readonly snapshotHasOrders = signal(true);

  /**
   * Re-reads the fund-state snapshot. It does not start an agent run.
   *
   * The spec is explicit about the difference, and so is this method: the order
   * list and the target snapshot are re-read, while `lastRun`, the tool calls
   * and the reasoning excerpt keep pointing at the run that actually produced
   * what is on screen.
   *
   * A failed read leaves the previous orders in place. The page labels them as
   * not reflecting the current state, which is a better answer than an empty
   * table.
   *
   * A successful read does not rewind the list either. Decisions recorded at
   * the human gate — doc 16 writes them through `advanceStage` into this same
   * array — are part of the fund state, so re-reading the snapshot has to
   * return them rather than the seed the agent first proposed. Re-seeding on
   * every refresh would silently un-approve every trade a person had signed.
   * The same goes for `latestTarget`: a refresh is a read, not an agent run,
   * so it cannot be what makes the stale-target warning go away.
   */
  async refresh(fail = false): Promise<void> {
    if (this._state() === 'loading') return;
    this._state.set('loading');
    this._errorMessage.set(null);

    await delay(LATENCY_MS);

    if (fail) {
      this._state.set('error');
      this._errorMessage.set(
        'Could not read the fund-state snapshot. The orders below are the last ones read successfully and may not reflect the current state.',
      );
      return;
    }

    if (!this.snapshotHasOrders()) this._orders.set([]);
    else if (this._orders().length === 0) this._orders.set(SEED_ORDERS);

    this._snapshotAt.set(`${RUN_DATE} ${clockNow()} UTC`);
    this._state.set(this._orders().length === 0 ? 'empty' : 'ready');
  }

  clearError(): void {
    this._errorMessage.set(null);
    if (this._state() === 'error') {
      this._state.set(this._orders().length === 0 ? 'empty' : 'ready');
    }
  }
}

/** 1 when this column has no value for the order, so it can be sorted last. */
function unpricedRank(order: ProposedOrder, key: OrderSortKey): number {
  if (key === 'shortfall') return order.estimatedShortfallBps === null ? 1 : 0;
  if (key === 'risk') return order.estimatedRiskBps === null ? 1 : 0;
  return 0;
}

/** Ordering within one sortable column, ascending. */
function compareOrders(a: ProposedOrder, b: ProposedOrder, key: OrderSortKey): number {
  switch (key) {
    case 'symbol':
      return a.symbol.localeCompare(b.symbol);
    case 'side':
      return a.side.localeCompare(b.side) || a.symbol.localeCompare(b.symbol);
    case 'quantity':
      return Math.abs(a.targetQuantityDelta) - Math.abs(b.targetQuantityDelta);
    case 'shortfall':
      return (a.estimatedShortfallBps ?? 0) - (b.estimatedShortfallBps ?? 0);
    case 'risk':
      return (a.estimatedRiskBps ?? 0) - (b.estimatedRiskBps ?? 0);
    case 'stage':
      return ORDER_STAGES.indexOf(a.stage) - ORDER_STAGES.indexOf(b.stage);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `HH:MM:SS` **in UTC**, because every stamp this service produces is printed
 * with a ` UTC` suffix beside `queuedAt` and `lastRun`, which are UTC. Local
 * time under a UTC label would put a decision an hour before the order it
 * decided for any reader east of Greenwich.
 */
function clockNow(): string {
  return new Date().toISOString().slice(11, 19);
}
