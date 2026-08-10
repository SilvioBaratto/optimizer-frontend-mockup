import { TestBed } from '@angular/core/testing';

import {
  ALREADY_DECIDED,
  DECISION_EFFECT_SENTENCE,
  NOT_AT_GATE,
  QUEUE_ERROR_MESSAGE,
  type ApprovalQueueRow,
  type CheckResult,
} from '../models/approval.model';
import { ORDER_STAGES, type ProposedOrder } from '../models/order.model';
import { ApprovalGateService } from './approval-gate.service';
import { ExecutionService } from './execution.service';
import { GuardrailService } from './guardrail.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Harness {
  readonly gate: ApprovalGateService;
  readonly execution: ExecutionService;
  readonly guardrail: GuardrailService;
}

function setup(): Harness {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return {
    gate: TestBed.inject(ApprovalGateService),
    execution: TestBed.inject(ExecutionService),
    guardrail: TestBed.inject(GuardrailService),
  };
}

function row(gate: ApprovalGateService, tradeId: string): ApprovalQueueRow {
  const found = gate.queue().find((r) => r.tradeId === tradeId);
  if (!found) throw new Error(`no queue row for ${tradeId}`);
  return found;
}

function order(execution: ExecutionService, id: string): ProposedOrder {
  const found = execution.order(id);
  if (!found) throw new Error(`no order ${id} in the seed data`);
  return found;
}

function ruleResults(gate: ApprovalGateService, tradeId: string): readonly CheckResult[] {
  const checks = gate.checksFor(tradeId);
  if (!checks) throw new Error(`no checks for ${tradeId}`);
  return checks.rules.map((r) => r.result);
}

/** A trade standing at the human gate with nobody's answer recorded yet. */
const AT_GATE = 'TRD-2031';
/** The longest-waiting trade at the gate — the top row of the default queue. */
const LONGEST_WAIT = 'TRD-2019';
/** Standing at rule validation, pending: the rules engine has not answered. */
const AT_RULES = 'TRD-2032';
/** Standing at the deterministic pre-check. */
const AT_PRE_CHECK = 'TRD-2039';
/** Blocked by the single-name concentration rule. */
const BLOCKED = 'TRD-2033';
/** Approved earlier, under the default posture. */
const ALREADY_APPROVED = 'TRD-2028';

// ===========================================================================
// Criterion — the queue is a projection of the execution agent's orders
// ===========================================================================

describe('ApprovalGateService — the queue projects proposed_orders', () => {
  it('when the queue is read, it holds one row per proposed order', () => {
    const { gate, execution } = setup();

    expect(gate.queue().length).toBe(execution.orders().length);
    expect(gate.totalCount()).toBe(execution.totalCount());
    expect(new Set(gate.queue().map((r) => r.tradeId))).toEqual(
      new Set(execution.orders().map((o) => o.id)),
    );
  });

  it('when a row is read, every field is the order the execution agent proposed', () => {
    const { gate, execution } = setup();
    const source = order(execution, AT_GATE);

    const projected = row(gate, AT_GATE);

    expect(projected.symbol).toBe(source.symbol);
    expect(projected.side).toBe(source.side);
    expect(projected.quantity).toBe(Math.abs(source.targetQuantityDelta));
    expect(projected.notionalValue).toBe(source.notionalValue);
    expect(projected.stage).toBe(source.stage);
    expect(projected.status).toBe(source.status);
    expect(projected.queuedAt).toBe(source.queuedAt);
    expect(projected.waitingSeconds).toBe(source.waitingSeconds);
    expect(projected.waiting).toBe('00:41:12');
  });

  it('when the queue is read, it is sorted by waiting time, longest first', () => {
    const { gate } = setup();

    const waits = gate.queue().map((r) => r.waitingSeconds);

    expect(waits).toEqual([...waits].sort((a, b) => b - a));
    expect(gate.queue()[0].tradeId).toBe(LONGEST_WAIT);
  });

  it('when a decision is recorded here, the order moves in the execution service', async () => {
    const { gate, execution } = setup();
    const approvedBefore = execution.statusCounts().approved;
    expect(order(execution, AT_GATE).status).toBe('pending');

    await gate.decide(AT_GATE, true);

    expect(order(execution, AT_GATE).status).toBe('approved');
    expect(order(execution, AT_GATE).decidedAt).not.toBeNull();
    // Doc 15's table and doc 17's counters read the same array, so both move.
    expect(execution.statusCounts().approved).toBe(approvedBefore + 1);
    expect(execution.pendingApprovalCount()).toBe(2);
  });

  it('when a trade is rejected here, the execution service records the rejection and the note', async () => {
    const { gate, execution } = setup();

    await gate.decide('TRD-2030', false, 'Covered by a separate programme trade.');

    expect(order(execution, 'TRD-2030').status).toBe('rejected');
    expect(order(execution, 'TRD-2030').statusReason).toBe(
      'Covered by a separate programme trade.',
    );
  });
});

// ===========================================================================
// Criterion — the broker posture caps the queue
//
// The page's central invariant: with no adapter registered the human gate is
// the last step, so the fourth step is not merely empty — it is unreachable.
// ===========================================================================

describe('ApprovalGateService — broker posture', () => {
  it('when the posture is not-configured, no trade in the queue is at the broker-adapter step', () => {
    const { gate } = setup();

    expect(gate.brokerPosture()).toBe('not-configured');
    expect(gate.queue().length).toBeGreaterThan(0);
    expect(gate.queue().every((r) => r.stage !== 'broker-adapter')).toBe(true);
    expect(gate.queue().filter((r) => r.stage === 'broker-adapter')).toEqual([]);
  });

  it('when the step filter is set to Broker Adapter with no broker, the queue is empty', () => {
    const { gate } = setup();

    gate.stepFilter.set('broker-adapter');
    gate.statusFilter.set('all');

    expect(gate.visibleQueue()).toEqual([]);
    expect(gate.queueEmpty()).toBe(true);
  });

  it('when a trade is selected with no broker, the fourth step reads unreachable rather than upcoming', () => {
    const { gate } = setup();
    gate.select(AT_GATE);

    const broker = gate.selectedSteps().find((s) => s.stage === 'broker-adapter');

    expect(broker?.state).toBe('unreachable');
    expect(broker?.current).toBe(false);
  });

  it('when an adapter is registered but erroring, no trade reaches the broker-adapter step', () => {
    const { gate, execution } = setup();

    execution.setBroker({ posture: 'error', adapter: 'Trading 212', detail: 'HTTP 503' });

    expect(gate.queue().every((r) => r.stage !== 'broker-adapter')).toBe(true);
  });

  it('when a broker is connected, an approved trade reaches the broker-adapter step', async () => {
    const { gate, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    await gate.decide(AT_GATE, true);

    expect(row(gate, AT_GATE).stage).toBe('broker-adapter');
  });

  it('when the posture changes, the decision sentence is the posture’s and nothing else', () => {
    const { gate, execution } = setup();

    expect(gate.decisionSentence()).toBe(DECISION_EFFECT_SENTENCE['not-configured']);

    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });
    expect(gate.decisionSentence()).toBe(DECISION_EFFECT_SENTENCE.connected);

    execution.setBroker({ posture: 'error', adapter: 'Trading 212', detail: 'HTTP 503' });
    expect(gate.decisionSentence()).toBe(DECISION_EFFECT_SENTENCE.error);
  });
});

// ===========================================================================
// Criterion — a result that has not arrived is reported pending
// ===========================================================================

describe('ApprovalGateService — automated checks', () => {
  it('when a trade is still at rule validation, every limit reads pending — not pass and not fail', () => {
    const { gate } = setup();
    expect(row(gate, AT_RULES).stage).toBe('rule-validation');
    expect(row(gate, AT_RULES).status).toBe('pending');

    const results = ruleResults(gate, AT_RULES);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r === 'pending')).toBe(true);
    expect(results).not.toContain('pass');
    expect(results).not.toContain('fail');
    expect(gate.checksFor(AT_RULES)?.rulesPending).toBe(true);
  });

  it('when a trade has not reached rule validation, its limits read pending as well', () => {
    const { gate } = setup();

    expect(ruleResults(gate, AT_PRE_CHECK).every((r) => r === 'pending')).toBe(true);
  });

  it('when a trade is still at the pre-check, the pre-check itself reads pending', () => {
    const { gate } = setup();

    expect(gate.checksFor(AT_PRE_CHECK)?.preCheck.result).toBe('pending');
  });

  it('when a trade has cleared both automated steps, the pre-check passes and every limit is within', () => {
    const { gate } = setup();

    const checks = gate.checksFor(AT_GATE);

    expect(checks?.preCheck.result).toBe('pass');
    expect(checks?.preCheck.killSwitchEngaged).toBe(false);
    expect(checks?.rules.every((r) => r.result === 'pass')).toBe(true);
    expect(checks?.rulesPending).toBe(false);
  });

  it('when a rule blocked a trade, only that rule reads fail and it carries the validator’s words', () => {
    const { gate } = setup();

    const checks = gate.checksFor(BLOCKED);
    const failed = checks?.rules.filter((r) => r.result === 'fail') ?? [];

    expect(failed.length).toBe(1);
    expect(failed[0].scope).toBe('concentration');
    expect(failed[0].detail).toContain('concentration');
    expect(checks?.rules.filter((r) => r.result === 'pending')).toEqual([]);
  });

  it('when the kill-switch is engaged, the pre-check fails for every trade in the queue', async () => {
    const { gate, guardrail } = setup();

    await guardrail.setKillSwitch(true, 'Vendor price feed down.');

    for (const queued of gate.queue()) {
      const checks = gate.checksFor(queued.tradeId);
      expect(checks?.preCheck.result).toBe('fail');
      expect(checks?.preCheck.killSwitchEngaged).toBe(true);
    }
  });

  it('when the kill-switch state could not be read, the pre-check reads pending rather than pass', async () => {
    const { gate, guardrail } = setup();

    await guardrail.refresh(['kill-switch']);

    const checks = gate.checksFor(AT_GATE);
    expect(checks?.preCheck.killSwitchKnown).toBe(false);
    expect(checks?.preCheck.result).toBe('pending');
  });

  it('when the limits are read, the rows are the guardrail page’s enabled limits and no others', () => {
    const { gate, guardrail } = setup();
    const enabled = guardrail.limits().filter((l) => l.enabled && l.scope !== 'kill-switch');

    const rules = gate.checksFor(AT_GATE)?.rules ?? [];

    expect(rules.map((r) => r.limitId)).toEqual(enabled.map((l) => l.id));
    expect(rules.map((r) => r.name)).toEqual(enabled.map((l) => l.name));
  });
});

// ===========================================================================
// Criterion — an approval records which reading of "approved" it was
// ===========================================================================

describe('ApprovalGateService — the recorded meaning of an approval', () => {
  it('when a trade is approved with no broker configured, the decision records manual placement', async () => {
    const { gate } = setup();

    const result = await gate.decide(AT_GATE, true);

    expect(result.ok).toBe(true);
    expect(result.decision?.outcome).toBe('approved');
    expect(result.decision?.effect).toBe('manual-placement');
    expect(result.decision?.posture).toBe('not-configured');
    expect(gate.decisionFor(AT_GATE)?.effect).toBe('manual-placement');
  });

  it('when a trade is approved with a broker connected, the decision records automatic routing', async () => {
    const { gate, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    const result = await gate.decide(AT_GATE, true);

    expect(result.decision?.effect).toBe('auto-routed');
    expect(result.decision?.posture).toBe('connected');
  });

  it('when a trade is rejected, no routing or authorisation is recorded', async () => {
    const { gate } = setup();

    const result = await gate.decide(AT_GATE, false, 'Sleeve is being wound down.');

    expect(result.decision?.outcome).toBe('rejected');
    expect(result.decision?.effect).toBeNull();
  });

  it('when an adapter is registered after an approval, the earlier decision still reads manual placement', async () => {
    const { gate, execution } = setup();
    await gate.decide(AT_GATE, true);

    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    // Re-deriving the reading from today's posture would relabel an order that
    // never left the system as one that was routed to a broker.
    expect(gate.decisionFor(AT_GATE)?.effect).toBe('manual-placement');
    expect(gate.decisionFor(AT_GATE)?.posture).toBe('not-configured');
  });

  it('when a trade was decided before this session, its recorded reading is available too', () => {
    const { gate } = setup();

    const decision = gate.decisionFor(ALREADY_APPROVED);

    expect(decision?.outcome).toBe('approved');
    expect(decision?.effect).toBe('manual-placement');
    expect(decision?.decidedBy).toBeTruthy();
    expect(decision?.decidedAt).toBeTruthy();
  });

  it('when a trade is still waiting, there is no decision to read', () => {
    const { gate } = setup();

    expect(gate.decisionFor(AT_GATE)).toBeNull();
  });

  it('when every approved trade in the queue is read, each one carries a recorded reading', () => {
    const { gate } = setup();

    const approved = gate.queue().filter((r) => r.status === 'approved');

    expect(approved.length).toBeGreaterThan(0);
    for (const trade of approved) {
      expect(gate.decisionFor(trade.tradeId)?.effect).not.toBeNull();
    }
  });
});

// ===========================================================================
// Criterion — decide() refuses to record what it must not
// ===========================================================================

describe('ApprovalGateService — decide refuses', () => {
  it('when the trade is not at the human gate, decide refuses and nothing moves', async () => {
    const { gate, execution } = setup();
    const before = order(execution, AT_RULES);

    const result = await gate.decide(AT_RULES, true);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(NOT_AT_GATE);
    expect(order(execution, AT_RULES).stage).toBe(before.stage);
    expect(order(execution, AT_RULES).status).toBe('pending');
  });

  it('when the trade has already been decided, decide refuses to rewrite the outcome', async () => {
    const { gate, execution } = setup();

    const result = await gate.decide(ALREADY_APPROVED, false, 'changed my mind');

    expect(result.ok).toBe(false);
    expect(result.error).toBe(ALREADY_DECIDED);
    expect(order(execution, ALREADY_APPROVED).status).toBe('approved');
  });

  it('when the trade id is unknown, decide refuses', async () => {
    const { gate } = setup();

    expect((await gate.decide('TRD-0000', true)).ok).toBe(false);
  });

  it('when the write fails, nothing is recorded and the trade is still waiting at the gate', async () => {
    const { gate, execution } = setup();

    const result = await gate.decide(AT_GATE, true, 'Looks fine.', true);

    expect(result.ok).toBe(false);
    expect(result.decision).toBeNull();
    expect(gate.decisionError()).not.toBeNull();
    expect(order(execution, AT_GATE).status).toBe('pending');
    expect(order(execution, AT_GATE).decidedAt).toBeNull();
    expect(gate.decisionFor(AT_GATE)).toBeNull();
  });

  it('when a failed write is followed by another trade, the failure does not follow it', async () => {
    const { gate } = setup();
    gate.select(AT_GATE);

    await gate.decide(AT_GATE, true, 'Looks fine.', true);
    expect(gate.decisionError()).not.toBeNull();

    // The message says *this* trade was not submitted. Carrying it onto the
    // next trade would attach a failed write to a trade nobody tried to decide.
    gate.select(LONGEST_WAIT);

    expect(gate.decisionError()).toBeNull();
  });

  it('when a decision is being written, a second confirmation cannot double-submit it', async () => {
    const { gate, execution } = setup();

    const first = gate.decide(AT_GATE, true, 'Signed once.');
    const second = gate.decide(AT_GATE, true, 'Signed once.');
    const [a, b] = await Promise.all([first, second]);

    // Exactly one write landed, and the second attempt did not report a
    // failure for a decision that was in fact recorded.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(gate.decisionError()).toBeNull();
    expect(order(execution, AT_GATE).status).toBe('approved');
  });

  it('when a decision is being written, the busy state is reachable', async () => {
    const { gate } = setup();

    const pending = gate.decide(AT_GATE, true);
    expect(gate.deciding()).toBe(true);

    await pending;
    expect(gate.deciding()).toBe(false);
  });

  it('when a trade is at the gate and waiting, it is the only kind that can be decided', () => {
    const { gate } = setup();

    for (const queued of gate.queue()) {
      expect(queued.decidable).toBe(queued.stage === 'human-gate' && queued.status === 'pending');
    }

    gate.select(AT_RULES);
    expect(gate.canDecide()).toBe(false);
    gate.select(AT_GATE);
    expect(gate.canDecide()).toBe(true);
  });
});

// ===========================================================================
// Criterion — the filters
// ===========================================================================

describe('ApprovalGateService — filters', () => {
  it('when the page opens, the queue is filtered to the step that takes an action', () => {
    const { gate } = setup();

    expect(gate.stepFilter()).toBe('human-gate');
    expect(gate.statusFilter()).toBe('pending');
    expect(gate.visibleQueue().map((r) => r.tradeId)).toEqual([
      LONGEST_WAIT,
      AT_GATE,
      'TRD-2030',
    ]);
  });

  it('when the step filter is widened, the other three steps come into view read-only', () => {
    const { gate } = setup();

    gate.stepFilter.set('all');
    gate.statusFilter.set('all');

    expect(gate.visibleCount()).toBe(gate.totalCount());
    expect(gate.visibleQueue().some((r) => r.stage === 'pre-trade')).toBe(true);
    const offGate = gate.visibleQueue().filter((r) => r.stage !== 'human-gate');
    expect(offGate.every((r) => !r.decidable)).toBe(true);
  });

  it('when the search names a symbol, only that trade is shown', () => {
    const { gate } = setup();
    gate.stepFilter.set('all');
    gate.statusFilter.set('all');

    gate.search.set('eem');

    expect(gate.visibleQueue().map((r) => r.tradeId)).toEqual([BLOCKED]);
  });

  it('when the search names a trade id, that trade is shown whatever its case', () => {
    const { gate } = setup();
    gate.stepFilter.set('all');
    gate.statusFilter.set('all');

    gate.search.set('trd-2019');

    expect(gate.visibleQueue().map((r) => r.tradeId)).toEqual([LONGEST_WAIT]);
  });

  it('when the filters match nothing, the queue is empty while the page itself is not', () => {
    const { gate } = setup();

    gate.search.set('NOSUCHTHING');

    expect(gate.visibleQueue()).toEqual([]);
    expect(gate.queueEmpty()).toBe(true);
    expect(gate.state()).toBe('ready');
  });

  it('when the filters are cleared, the page returns to its opening view', () => {
    const { gate } = setup();
    gate.stepFilter.set('all');
    gate.statusFilter.set('approved');
    gate.search.set('gld');
    expect(gate.filtersActive()).toBe(true);

    gate.clearFilters();

    expect(gate.stepFilter()).toBe('human-gate');
    expect(gate.statusFilter()).toBe('pending');
    expect(gate.search()).toBe('');
    expect(gate.filtersActive()).toBe(false);
  });

  it('when the collection bar is read, it counts the filtered queue against the whole one', () => {
    const { gate } = setup();

    expect(gate.queueSummary()).toBe(
      '3 of 14 trades in queue · step Human Gate · sorted by waiting time, longest first',
    );
  });

  it('when a decision is recorded, the trade leaves the Pending filter', async () => {
    const { gate } = setup();
    expect(gate.visibleQueue().map((r) => r.tradeId)).toContain(AT_GATE);

    await gate.decide(AT_GATE, true);

    expect(gate.visibleQueue().map((r) => r.tradeId)).not.toContain(AT_GATE);
    gate.statusFilter.set('approved');
    expect(gate.visibleQueue().map((r) => r.tradeId)).toContain(AT_GATE);
  });
});

// ===========================================================================
// Criterion — refresh keeps the filters and the selection
// ===========================================================================

describe('ApprovalGateService — refresh', () => {
  it('when refresh runs, the loading state is reachable and the queue comes back ready', async () => {
    const { gate } = setup();

    const pending = gate.refresh();
    expect(gate.state()).toBe('loading');

    await pending;
    expect(gate.state()).toBe('ready');
  });

  it('when refresh succeeds, the filters and the selection are exactly as they were', async () => {
    const { gate } = setup();
    gate.stepFilter.set('all');
    gate.statusFilter.set('approved');
    gate.search.set('trd-20');
    gate.select(ALREADY_APPROVED);

    await gate.refresh();

    expect(gate.stepFilter()).toBe('all');
    expect(gate.statusFilter()).toBe('approved');
    expect(gate.search()).toBe('trd-20');
    expect(gate.selectedTradeId()).toBe(ALREADY_APPROVED);
    expect(gate.selectedTrade()?.tradeId).toBe(ALREADY_APPROVED);
  });

  it('when refresh fails, the queue error is shown and the filters and selection survive', async () => {
    const { gate } = setup();
    gate.stepFilter.set('all');
    gate.select(AT_GATE);

    await gate.refresh(true);

    expect(gate.state()).toBe('error');
    expect(gate.errorMessage()).toBe(QUEUE_ERROR_MESSAGE);
    expect(gate.stepFilter()).toBe('all');
    expect(gate.selectedTradeId()).toBe(AT_GATE);
    expect(gate.queue().length).toBe(14);
  });

  it('when the error is cleared, the page returns to the populated state', async () => {
    const { gate } = setup();
    await gate.refresh(true);

    gate.clearError();

    expect(gate.state()).toBe('ready');
    expect(gate.errorMessage()).toBeNull();
  });

  it('when the selected trade is gone after a reload, the selection is dropped rather than dangling', async () => {
    const { gate, execution } = setup();
    gate.select(AT_GATE);
    execution.snapshotHasOrders.set(false);

    await gate.refresh();

    expect(gate.selectedTradeId()).toBeNull();
    expect(gate.selectedTrade()).toBeNull();
    expect(gate.state()).toBe('empty');
  });

  it('when a decision has been recorded, refreshing the queue does not undo it', async () => {
    const { gate } = setup();
    await gate.decide(AT_GATE, true);

    await gate.refresh();

    expect(row(gate, AT_GATE).status).toBe('approved');
    expect(gate.decisionFor(AT_GATE)?.effect).toBe('manual-placement');
  });

  it('when only the trade detail fails, the queue stays operative and the panel reports it', async () => {
    const { gate } = setup();
    gate.select(AT_GATE);

    await gate.loadDetail(true);

    expect(gate.detailError()).not.toBeNull();
    expect(gate.state()).toBe('ready');
    expect(gate.visibleCount()).toBe(3);

    await gate.loadDetail();
    expect(gate.detailError()).toBeNull();
  });
});

// ===========================================================================
// Criterion — the four-step tracker and the audit trail
// ===========================================================================

describe('ApprovalGateService — step tracker and audit trail', () => {
  it('when a trade is selected, exactly one of the four steps is current and it is its own', () => {
    const { gate } = setup();
    gate.select(AT_GATE);

    const steps = gate.selectedSteps();

    expect(steps.map((s) => s.stage)).toEqual([...ORDER_STAGES]);
    expect(steps.filter((s) => s.current).length).toBe(1);
    expect(steps.find((s) => s.current)?.stage).toBe('human-gate');
    expect(steps.slice(0, 2).every((s) => s.state === 'passed')).toBe(true);
  });

  it('when no trade is selected, there is no detail to show', () => {
    const { gate } = setup();

    expect(gate.selectedTrade()).toBeNull();
    expect(gate.selectedChecks()).toBeNull();
    expect(gate.selectedSteps()).toEqual([]);
    expect(gate.selectedCheckpoints()).toEqual([]);
  });

  it('when an unknown id is selected, the selection is left alone', () => {
    const { gate } = setup();
    gate.select(AT_GATE);

    gate.select('TRD-0000');

    expect(gate.selectedTradeId()).toBe(AT_GATE);
  });

  it('when a trade’s audit trail is read, every checkpoint carries a timestamp and is that trade’s', () => {
    const { gate } = setup();

    const trail = gate.checkpointsFor(AT_GATE);

    expect(trail.length).toBeGreaterThan(0);
    expect(trail.every((c) => c.tradeId === AT_GATE)).toBe(true);
    expect(trail.every((c) => c.at.trim().length > 0 && c.date.trim().length > 0)).toBe(true);
    // The mandatory sequence orders the trail; the clock only breaks ties
    // inside one step, and to the minute at that — the trail stamps minutes
    // and the order stamps seconds.
    const steps = trail.map((c) => ORDER_STAGES.indexOf(c.stage));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    const stamps = trail.map((c) => `${c.date} ${c.at.slice(0, 5)}`);
    expect(stamps).toEqual([...stamps].sort());
  });

  it('when a trade is queued, its first checkpoint is the moment it entered the pipeline', () => {
    const { gate, execution } = setup();

    const trail = gate.checkpointsFor(AT_GATE);

    expect(trail[0].stage).toBe('pre-trade');
    expect(trail[0].at).toBe(order(execution, AT_GATE).queuedAt);
  });

  it('when a decision is recorded, a checkpoint is appended for it', async () => {
    const { gate } = setup();
    const before = gate.checkpointsFor(AT_GATE).length;

    await gate.decide(AT_GATE, true, 'Sized against the published target.');

    const trail = gate.checkpointsFor(AT_GATE);
    expect(trail.length).toBe(before + 1);
    expect(trail[trail.length - 1].stage).toBe('human-gate');
    expect(trail[trail.length - 1].detail).toContain('manual placement');
  });

  it('when a decision is signed earlier in the day than the queue, it is still the last checkpoint', async () => {
    const { gate } = setup();
    // The seeded checkpoints are stamped against the snapshot's own run —
    // 09:xx — while a decision taken now is stamped from the wall clock. Before
    // 09:12 UTC the signature therefore carries the *smaller* stamp, and an
    // ordering that trusted the clock hoisted it above the moment the trade was
    // queued: an audit trail claiming a person approved a trade before it
    // entered the pipeline. Only `Date` is faked, so the service's own
    // `setTimeout` round trip still resolves.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-01T02:31:07Z'));
    try {
      await gate.decide(AT_GATE, true);
    } finally {
      vi.useRealTimers();
    }

    const trail = gate.checkpointsFor(AT_GATE);
    expect(trail[0].stage).toBe('pre-trade');
    expect(trail[0].at).toBe('09:12:03');
    expect(trail[trail.length - 1].stage).toBe('human-gate');
    expect(trail[trail.length - 1].at).toBe('02:31:07');
  });

  it('when a trade has no checkpoint of its own, its trail is empty rather than another trade’s', () => {
    const { gate } = setup();

    const trail = gate.checkpointsFor('TRD-0000');

    expect(trail).toEqual([]);
  });
});
