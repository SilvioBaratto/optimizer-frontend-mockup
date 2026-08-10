/**
 * The deliberation's account of `proposed_orders`, against the agent that owns them.
 *
 * Two properties are in tension here and both have to hold. The summary a
 * checkpoint carries has to agree with `ExecutionService` — the same run
 * described two ways on two pages is the defect these tests exist for. And a
 * checkpoint has to keep saying what it said, because the whole point of
 * checkpointing the state is that it can be read back exactly as it was; a
 * summary that recomputed itself at render time would quietly rewrite history
 * the moment the orders moved.
 *
 * So every figure below is read out of `ExecutionService` inside the test
 * rather than written down here. A test that restated "14" would keep passing
 * against a service that had since gone to fifteen, which is the bug.
 */

import { TestBed } from '@angular/core/testing';

import type { FundStateFieldRow } from '../models/fund-state.model';
import { DeliberationService } from './deliberation.service';
import { ExecutionService } from './execution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Agents {
  readonly deliberation: DeliberationService;
  readonly execution: ExecutionService;
}

function setup(): Agents {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return {
    deliberation: TestBed.inject(DeliberationService),
    execution: TestBed.inject(ExecutionService),
  };
}

/**
 * Drives the scripted stream from `start()` to the last checkpoint.
 *
 * The run is a timer, so the clock is advanced past its whole length rather
 * than for a counted number of ticks — the tick budget is the service's
 * business, and the assertion afterwards is that the run really did finish.
 */
function runToCompletion(deliberation: DeliberationService): void {
  deliberation.start();
  vi.advanceTimersByTime(60_000);
  if (deliberation.status() !== 'complete') {
    throw new Error(`the run did not reach its last checkpoint: status ${deliberation.status()}`);
  }
}

/** The `proposed_orders` row of the checkpoint cut when it was written. */
function ordersRowAsWritten(deliberation: DeliberationService): FundStateFieldRow {
  const checkpoint = deliberation.checkpoints().find((c) => c.fieldWritten === 'proposed_orders');
  if (!checkpoint) throw new Error('the run must cut a checkpoint for proposed_orders');
  const row = checkpoint.fields.find((f) => f.field === 'proposed_orders');
  if (!row) throw new Error('proposed_orders is one of the five fund-state fields');
  return row;
}

/** What the execution agent currently holds, as three plain figures. */
function executionFigures(execution: ExecutionService) {
  const orders = execution.orders();
  const intervals = orders.map((o) => o.trajectory.length).filter((n) => n > 0);
  return {
    count: orders.length,
    notional: orders.reduce((sum, o) => sum + o.notionalValue, 0),
    lowestIntervals: Math.min(...intervals),
    highestIntervals: Math.max(...intervals),
    unscheduled: orders.length - intervals.length,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ===========================================================================
// Criterion — the deliberation describes the orders the execution agent holds
// ===========================================================================

describe('DeliberationService — the orders it reports', () => {
  it('when the run completes, the deliberation summary reports the same order count the execution agent holds', () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const row = ordersRowAsWritten(deliberation);
    const held = execution.totalCount();

    // The premise, stated rather than assumed: an execution agent holding
    // nothing would make every assertion below vacuous.
    expect(held).toBeGreaterThan(0);
    expect(row.count).toBe(held);
    expect(row.summary).toContain(`${held} orders`);
    expect(deliberation.proposedOrderCount()).toBe(held);
  });

  it('when the run completes, the traded notional is what the execution agent’s orders add up to', () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const { notional } = executionFigures(execution);

    expect(notional).toBeGreaterThan(0);
    expect(ordersRowAsWritten(deliberation).detail).toContain(
      `EUR ${(notional / 1_000_000).toFixed(2)}m`,
    );
  });

  it('when the trajectories disagree on their length, the interval claim spans them instead of naming one', () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const { lowestIntervals, highestIntervals } = executionFigures(execution);

    // The premise: the orders really are scheduled over different numbers of
    // intervals. If they ever agreed, a single figure would be the honest claim
    // and this test would be checking the wrong sentence.
    expect(lowestIntervals).toBeLessThan(highestIntervals);
    expect(ordersRowAsWritten(deliberation).detail).toContain(
      `over ${lowestIntervals} to ${highestIntervals} intervals`,
    );
  });

  it('when some orders were never scheduled, the summary counts them rather than pricing them in', () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const { unscheduled } = executionFigures(execution);

    expect(unscheduled).toBeGreaterThan(0);
    expect(ordersRowAsWritten(deliberation).detail).toContain(`${unscheduled} left unscheduled`);
  });
});

// ===========================================================================
// Criterion — a checkpoint is frozen, so history is not rewritten
// ===========================================================================

describe('DeliberationService — checkpoints do not follow the live orders', () => {
  it('when the execution agent’s orders change, an already-saved checkpoint keeps the count it was saved with', async () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const saved = ordersRowAsWritten(deliberation);
    const countAtWrite = execution.totalCount();
    expect(saved.count).toBe(countAtWrite);

    // The execution agent re-reads a fund-state snapshot that has no orders in
    // it — a real, public way for the order list to move under the checkpoint.
    execution.snapshotHasOrders.set(false);
    const reread = execution.refresh();
    await vi.advanceTimersByTimeAsync(5_000);
    await reread;
    expect(execution.totalCount()).not.toBe(countAtWrite);

    const now = ordersRowAsWritten(deliberation);
    expect(now.count).toBe(countAtWrite);
    expect(now.summary).toBe(saved.summary);
    expect(now.detail).toBe(saved.detail);
  });

  it('when an earlier step is inspected after the orders change, it shows the state as it stood then', async () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const written = deliberation.checkpoints().find((c) => c.fieldWritten === 'proposed_orders');
    const before = deliberation.checkpoints().find((c) => c.fieldWritten === 'risk_verdict');
    if (!written || !before) throw new Error('the run must cut a checkpoint for each agent write');
    const countAtWrite = execution.totalCount();

    execution.snapshotHasOrders.set(false);
    const reread = execution.refresh();
    await vi.advanceTimersByTimeAsync(5_000);
    await reread;

    deliberation.selectStep(written.step);
    expect(deliberation.proposedOrderCount()).toBe(countAtWrite);

    // And the step before the execution agent wrote still has nothing there —
    // the field was empty then and stays empty, whatever the orders do now.
    deliberation.selectStep(before.step);
    expect(deliberation.proposedOrderCount()).toBe(0);
  });

  it('when the orders change mid-run, the write reports the list as it stood at the write', async () => {
    const { deliberation, execution } = setup();

    // Far enough in that an agent has written and the execution agent has not,
    // which is the only window in which "read at the write" and "read at the
    // start of the run" can be told apart.
    const held = execution.totalCount();
    deliberation.start();
    vi.advanceTimersByTime(10_000);
    expect(deliberation.checkpoints().length).toBeGreaterThan(1);
    expect(deliberation.checkpoints().some((c) => c.fieldWritten === 'proposed_orders')).toBe(false);

    execution.snapshotHasOrders.set(false);
    const reread = execution.refresh();
    await vi.advanceTimersByTimeAsync(5_000);
    await reread;

    vi.advanceTimersByTime(60_000);
    expect(deliberation.status()).toBe('complete');

    expect(execution.totalCount()).not.toBe(held);
    expect(ordersRowAsWritten(deliberation).count).toBe(execution.totalCount());
  });

  it('when a new run is started after the orders change, its checkpoint reports the new count', async () => {
    const { deliberation, execution } = setup();

    runToCompletion(deliberation);
    const first = ordersRowAsWritten(deliberation).count;

    execution.snapshotHasOrders.set(false);
    const reread = execution.refresh();
    await vi.advanceTimersByTimeAsync(5_000);
    await reread;

    runToCompletion(deliberation);

    // Frozen is not stale: a fresh checkpoint reads the agent again.
    expect(execution.totalCount()).not.toBe(first);
    expect(ordersRowAsWritten(deliberation).count).toBe(execution.totalCount());
  });
});
