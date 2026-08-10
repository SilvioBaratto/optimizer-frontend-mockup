import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ORDER_STAGES, type ProposedOrder } from '../models/order.model';
import { ExecutionService, formatWaiting } from './execution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): ExecutionService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(ExecutionService);
}

function find(service: ExecutionService, id: string): ProposedOrder {
  const order = service.orders().find((o) => o.id === id);
  if (!order) throw new Error(`no order ${id} in the seed data`);
  return order;
}

/**
 * `HH:MM:SS` as seconds since midnight — this file's own reading of a stamp, so
 * a wait can be checked against the two stamps it is supposed to span.
 */
function clockSeconds(stamp: string): number {
  const [hours, minutes, seconds] = stamp.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

/** The time of day the snapshot stamp is carrying right now. */
function snapshotClock(service: ExecutionService): number {
  return clockSeconds(service.snapshotAt().slice(11, 19));
}

/**
 * Runs `act` with the UTC wall clock held at `instant`.
 *
 * The snapshot stamp is written from `new Date()`, so a test about the snapshot
 * moving forward has to say where it moves to. Only `Date` is faked — the
 * service's own `setTimeout` latency stays real, so `refresh()` still resolves
 * on its own.
 */
async function atUtc(instant: string, act: () => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
  try {
    await act();
  } finally {
    vi.useRealTimers();
  }
}

/** The one order the seed data leaves without a completed schedule. */
function unscheduled(service: ExecutionService): ProposedOrder {
  const order = service
    .orders()
    .find((o) => o.estimatedShortfallBps === null || o.estimatedRiskBps === null);
  if (!order) throw new Error('the seed data must contain an order with incomplete scheduling');
  return order;
}

// ===========================================================================
// Criterion — the broker posture caps the pipeline
// ===========================================================================

describe('ExecutionService — broker posture', () => {
  it('when nothing is configured, the posture is not-configured', () => {
    const service = setup();

    expect(service.brokerPosture()).toBe('not-configured');
    expect(service.broker().adapter).toBeNull();
  });

  it('when the posture is not-configured, no order sits at the broker-adapter stage', () => {
    const service = setup();

    const routed = service.orders().filter((o) => o.stage === 'broker-adapter');

    expect(routed).toEqual([]);
    expect(service.ordersAtStage('broker-adapter')).toEqual([]);
    expect(service.stageCounts()['broker-adapter']).toBe(0);
  });

  it('when the posture is not-configured, the human gate is the terminal stage', () => {
    const service = setup();

    expect(service.terminalStage()).toBe('human-gate');
  });

  it('when an adapter errors, orders still cannot reach the broker-adapter stage', () => {
    const service = setup();

    service.setBroker({ posture: 'error', adapter: 'Trading 212', detail: 'HTTP 503 from /orders' });

    expect(service.terminalStage()).toBe('human-gate');
    expect(service.orders().every((o) => o.stage !== 'broker-adapter')).toBe(true);
  });

  it('when an order at the human gate is approved without a broker, it is approved in place', () => {
    const service = setup();
    const before = find(service, 'TRD-2031');
    expect(before.stage).toBe('human-gate');

    const moved = service.advanceStage('TRD-2031', 'approve');
    const after = find(service, 'TRD-2031');

    expect(moved).toBe(true);
    expect(after.status).toBe('approved');
    expect(after.stage).toBe('human-gate');
    expect(after.decidedAt).not.toBeNull();
  });

  it('when a broker is connected, an approved order at the human gate is routed to the adapter', () => {
    const service = setup();
    service.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    service.advanceStage('TRD-2031', 'approve');

    expect(find(service, 'TRD-2031').stage).toBe('broker-adapter');
  });

  it('when a connected adapter is removed, a routed order falls back to the human gate', () => {
    const service = setup();
    service.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });
    service.advanceStage('TRD-2031', 'approve');
    expect(find(service, 'TRD-2031').stage).toBe('broker-adapter');

    service.setBroker({ posture: 'not-configured', adapter: null, detail: null });

    expect(find(service, 'TRD-2031').stage).toBe('human-gate');
    expect(service.orders().every((o) => o.stage !== 'broker-adapter')).toBe(true);
  });
});

// ===========================================================================
// Criterion — incomplete scheduling pins an order to the pre-trade check
// ===========================================================================

describe('ExecutionService — incomplete scheduling', () => {
  it('when an order has no cost and risk estimate, it sits at the pre-trade stage', () => {
    const service = setup();

    const pinned = service
      .orders()
      .filter((o) => o.estimatedShortfallBps === null || o.estimatedRiskBps === null);

    expect(pinned.length).toBeGreaterThan(0);
    expect(pinned.every((o) => o.stage === 'pre-trade')).toBe(true);
  });

  it('when an estimate is missing, both estimates are missing', () => {
    const service = setup();

    const half = service
      .orders()
      .filter((o) => (o.estimatedShortfallBps === null) !== (o.estimatedRiskBps === null));

    expect(half).toEqual([]);
  });

  it('when an order has no estimates, its trajectory is empty', () => {
    const service = setup();

    expect(unscheduled(service).trajectory).toEqual([]);
  });

  it('when advanceStage is called on an unscheduled order, it refuses to move it', () => {
    const service = setup();
    const target = unscheduled(service);

    const moved = service.advanceStage(target.id, 'approve');

    expect(moved).toBe(false);
    expect(find(service, target.id).stage).toBe('pre-trade');
    expect(find(service, target.id).status).toBe('pending');
  });

  it('when an order is scheduled, its intervals sum to the target quantity', () => {
    const service = setup();

    const scheduled = service.orders().filter((o) => o.trajectory.length > 0);

    expect(scheduled.length).toBeGreaterThan(0);
    for (const order of scheduled) {
      const traded = order.trajectory.reduce((sum, q) => sum + q, 0);
      expect(traded).toBe(Math.abs(order.targetQuantityDelta));
    }
  });
});

// ===========================================================================
// Criterion — a blocked order says why, in words
// ===========================================================================

describe('ExecutionService — blocked orders', () => {
  it('when an order is blocked, it carries a non-empty reason', () => {
    const service = setup();

    const blocked = service.orders().filter((o) => o.status === 'blocked');

    expect(blocked.length).toBeGreaterThan(0);
    for (const order of blocked) {
      expect(typeof order.statusReason).toBe('string');
      expect((order.statusReason ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('when an order is rejected, it carries a non-empty reason', () => {
    const service = setup();

    const rejected = service.orders().filter((o) => o.status === 'rejected');

    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((o) => (o.statusReason ?? '').trim().length > 0)).toBe(true);
  });

  it('when advanceStage is called on a blocked order, it refuses to move it', () => {
    const service = setup();
    const blocked = service.blockedOrders()[0];

    const moved = service.advanceStage(blocked.id, 'approve');

    expect(moved).toBe(false);
    expect(find(service, blocked.id).stage).toBe(blocked.stage);
    expect(find(service, blocked.id).status).toBe('blocked');
  });

  it('when an order is rejected at the gate, the note becomes the stated reason', () => {
    const service = setup();

    const moved = service.advanceStage('TRD-2030', 'reject', 'Position limit breached intraday.');

    expect(moved).toBe(true);
    expect(find(service, 'TRD-2030').status).toBe('rejected');
    expect(find(service, 'TRD-2030').statusReason).toBe('Position limit breached intraday.');
  });

  it('when an order has already been decided, advanceStage refuses to move it again', () => {
    const service = setup();
    service.advanceStage('TRD-2031', 'approve');

    const again = service.advanceStage('TRD-2031', 'reject', 'changed my mind');

    expect(again).toBe(false);
    expect(find(service, 'TRD-2031').status).toBe('approved');
  });

  it('when the order id is unknown, advanceStage refuses', () => {
    const service = setup();

    expect(service.advanceStage('TRD-0000', 'approve')).toBe(false);
  });
});

// ===========================================================================
// Criterion — per-stage counts partition the order list
// ===========================================================================

describe('ExecutionService — stage counts', () => {
  it('when the per-stage counts are summed, they equal the total order count', () => {
    const service = setup();

    const counts = service.stageCounts();
    const summed = ORDER_STAGES.reduce((sum, stage) => sum + counts[stage], 0);

    expect(summed).toBe(service.orders().length);
    expect(summed).toBe(service.totalCount());
  });

  it('when an order moves stage, both buckets follow it', () => {
    const service = setup();
    const before = service.stageCounts();

    service.advanceStage('TRD-2035', 'approve');

    const after = service.stageCounts();
    expect(after['rule-validation']).toBe(before['rule-validation'] - 1);
    expect(after['human-gate']).toBe(before['human-gate'] + 1);
    expect(ORDER_STAGES.reduce((sum, s) => sum + after[s], 0)).toBe(service.orders().length);
  });

  it('when the queue is read, every order sits at exactly one stage', () => {
    const service = setup();

    const grouped = service.ordersByStage();
    const ids = ORDER_STAGES.flatMap((stage) => grouped[stage].map((o) => o.id));

    expect(new Set(ids).size).toBe(service.orders().length);
  });

  it('when the chip bar counts are read, they match the queue', () => {
    const service = setup();

    expect(service.totalCount()).toBe(14);
    expect(service.pendingApprovalCount()).toBe(3);
    expect(service.blockedCount()).toBe(1);
  });
});

// ===========================================================================
// Criterion — refresh reads the snapshot without running the agent
// ===========================================================================

describe('ExecutionService — refresh', () => {
  it('when refresh runs, the loading state is reachable', async () => {
    const service = setup();

    const pending = service.refresh();
    expect(service.state()).toBe('loading');

    await pending;
    expect(service.state()).toBe('ready');
  });

  it('when refresh fails, the error state is set and the previous orders stay readable', async () => {
    const service = setup();
    const before = service.orders().map((o) => o.id);

    await service.refresh(true);

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).not.toBeNull();
    expect(service.orders().map((o) => o.id)).toEqual(before);
    expect(service.orders().length).toBe(14);
  });

  it('when the error is cleared, the page returns to the populated state', async () => {
    const service = setup();
    await service.refresh(true);

    service.clearError();

    expect(service.state()).toBe('ready');
    expect(service.errorMessage()).toBeNull();
  });

  it('when refresh runs, it does not start a new agent run', async () => {
    const service = setup();
    const lastRun = service.lastRun();

    await service.refresh();

    expect(service.lastRun()).toBe(lastRun);
    expect(service.runStatus()).toBe('idle');
  });

  it('when the snapshot carries no orders, the state is empty rather than ready', async () => {
    const service = setup();
    service.snapshotHasOrders.set(false);

    await service.refresh();

    expect(service.state()).toBe('empty');
    expect(service.orders()).toEqual([]);
  });

  it('when orders come back, an empty snapshot is repopulated rather than left empty', async () => {
    const service = setup();
    service.snapshotHasOrders.set(false);
    await service.refresh();

    service.snapshotHasOrders.set(true);
    await service.refresh();

    expect(service.state()).toBe('ready');
    expect(service.totalCount()).toBe(14);
  });

  it('when the snapshot is re-read, a decision already recorded at the gate survives it', async () => {
    const service = setup();
    service.advanceStage('TRD-2031', 'approve');
    expect(find(service, 'TRD-2031').status).toBe('approved');

    // Re-reading the fund state is not a new agent run: it cannot un-approve a
    // trade a person signed, which is what re-seeding the array would do.
    await service.refresh();

    expect(find(service, 'TRD-2031').status).toBe('approved');
    expect(find(service, 'TRD-2031').decidedAt).not.toBeNull();
  });

  it('when the snapshot is re-read, a stale target stays stale', async () => {
    const service = setup();
    service.latestTarget.set({
      id: 'balanced-growth-v4',
      label: 'Balanced Growth v4',
      publishedAt: '2026-08-01 10:02 UTC',
    });

    await service.refresh();

    expect(service.staleTarget()).toBe(true);
  });

  it('when the snapshot stamp is written, it moves on from the last one rather than reading the wall clock', async () => {
    // The stamp used to be `new Date()`. Every waiting time is derived from
    // `snapshotAt − queuedAt`, so against a dataset pinned to 2026-08-01 that
    // made the figures depend on the machine's clock: running the app before
    // 09:53:15 UTC moved the snapshot *backwards* on refresh. Measured in the
    // browser at 09:40 UTC — TRD-2019 fell from 02:15:33 to 02:02:48, and
    // TRD-2030, queued 09:41:10, clamped to 00:00:00.
    const service = setup();
    const before = service.snapshotAt();

    await service.refresh();

    const stamp = service.snapshotAt();
    expect(stamp.endsWith(' UTC')).toBe(true);
    expect(stamp).toBe('2026-08-01 10:53:15 UTC');
    expect(stamp > before).toBe(true);
  });

  it('when the snapshot is refreshed twice, the clock keeps moving forward', async () => {
    const service = setup();

    await service.refresh();
    await service.refresh();

    expect(service.snapshotAt()).toBe('2026-08-01 11:53:15 UTC');
  });
});

// ===========================================================================
// Criterion — the stale-target warning
// ===========================================================================

describe('ExecutionService — stale target', () => {
  it('when the fund state holds the target the orders were sized against, nothing is stale', () => {
    const service = setup();

    expect(service.staleTarget()).toBe(false);
  });

  it('when the fund state holds a newer target, the order list is flagged stale', () => {
    const service = setup();

    service.latestTarget.set({
      id: 'balanced-growth-v4',
      label: 'Balanced Growth v4',
      publishedAt: '2026-08-01 10:02 UTC',
    });

    expect(service.staleTarget()).toBe(true);
  });
});

// ===========================================================================
// Criterion — the run log
// ===========================================================================

describe('ExecutionService — run log', () => {
  it('when the tool log is read, every call is read-only or pure compute', () => {
    const service = setup();

    expect(service.toolCalls().length).toBeGreaterThan(0);
    expect(service.toolCalls().every((c) => c.kind === 'read' || c.kind === 'compute')).toBe(true);
  });

  it('when the reasoning excerpt is read, it is a non-empty string', () => {
    const service = setup();

    expect(service.reasoningExcerpt().trim().length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Criterion — waiting-time formatting is shared, not re-derived per page
// ===========================================================================

describe('formatWaiting', () => {
  it('when the wait is under a minute, it still prints all three fields', () => {
    expect(formatWaiting(18)).toBe('00:00:18');
  });

  it('when the wait crosses an hour, it prints hours', () => {
    expect(formatWaiting(8133)).toBe('02:15:33');
  });
});

// ===========================================================================
// Criterion — the waiting time is derived from the snapshot, never stored
// ===========================================================================

describe('ExecutionService — waiting time', () => {
  it('when an order is undecided, its wait is the gap between its queue time and the current snapshot', () => {
    const service = setup();
    const order = find(service, 'TRD-2031');
    expect(order.decidedAt).toBeNull();

    const waited = service.waitingSecondsFor(order);

    expect(waited).toBe(snapshotClock(service) - clockSeconds(order.queuedAt));
  });

  it('when an order has been decided, its wait stops at the decision rather than at the snapshot', () => {
    const service = setup();
    const order = find(service, 'TRD-2028');
    const decidedAt = order.decidedAt;
    if (decidedAt === null) throw new Error('TRD-2028 must arrive already decided');

    const waited = service.waitingSecondsFor(order);

    expect(waited).toBe(clockSeconds(decidedAt) - clockSeconds(order.queuedAt));
    // The snapshot is later than the decision, so measuring to it would have
    // given a longer wait — which is exactly what a stored field could not
    // avoid once the snapshot moved past it.
    expect(waited).toBeLessThan(snapshotClock(service) - clockSeconds(order.queuedAt));
  });

  it('when a refresh advances the snapshot, undecided orders have waited longer and decided ones have not', async () => {
    const service = setup();
    const undecidedBefore = service.waitingSecondsFor(find(service, 'TRD-2031'));
    const decidedBefore = service.waitingSecondsFor(find(service, 'TRD-2028'));

    // The snapshot stamp is the wall clock, so the wall clock is what has to
    // move for the read to land an hour later than the seeded 09:53:15.
    await atUtc('2026-08-01T10:53:15Z', () => service.refresh());

    expect(service.snapshotAt()).toBe('2026-08-01 10:53:15 UTC');
    expect(service.waitingSecondsFor(find(service, 'TRD-2031'))).toBe(undecidedBefore + 3600);
    expect(service.waitingSecondsFor(find(service, 'TRD-2028'))).toBe(decidedBefore);
  });

  it('when the seed is first read, TRD-2019 waits the 02:15:33 doc 16’s wireframe fixes it at', () => {
    const service = setup();

    expect(formatWaiting(service.waitingSecondsFor(find(service, 'TRD-2019')))).toBe('02:15:33');
  });

  it('when every order is read, none of them carries a waiting time of its own', () => {
    const service = setup();

    // The defect this replaces was fourteen literals that had to be re-edited
    // whenever a stamp moved. A field that is absent cannot disagree with the
    // stamps beside it.
    expect(service.orders().every((o) => !('waitingSeconds' in o))).toBe(true);
  });

  it('when every order is read, each wait is the span between its own two stamps', () => {
    const service = setup();
    const orders = service.orders();

    // The whole list, not the three named above: fourteen literals were what
    // broke, so the replacement is checked against all fourteen of the stamp
    // pairs it claims to be arithmetic on.
    const derived = orders.map((o) => [o.id, service.waitingSecondsFor(o)]);
    const spans = orders.map((o) => [
      o.id,
      clockSeconds(o.decidedAt ?? service.snapshotAt().slice(11, 19)) - clockSeconds(o.queuedAt),
    ]);

    expect(orders.length).toBeGreaterThan(0);
    expect(derived).toEqual(spans);
    // Every span is positive on the seed, so the clamp at zero is not quietly
    // standing in for a stamp pair that runs backwards.
    expect(derived.every(([, seconds]) => (seconds as number) > 0)).toBe(true);
  });
});
