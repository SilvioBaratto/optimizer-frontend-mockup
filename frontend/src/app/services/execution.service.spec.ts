import { TestBed } from '@angular/core/testing';

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

  it('when the snapshot stamp is written, its clock is the UTC one it is labelled with', async () => {
    const service = setup();

    await service.refresh();

    const stamp = service.snapshotAt();
    expect(stamp.endsWith(' UTC')).toBe(true);
    expect(stamp.slice(11, 13)).toBe(new Date().toISOString().slice(11, 13));
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
