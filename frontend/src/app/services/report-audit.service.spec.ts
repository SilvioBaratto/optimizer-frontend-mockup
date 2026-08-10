/**
 * The audit log's own invariants.
 *
 * Five of them are the reason doc 24 exists at all and none of them is visible
 * from a screenshot, so they are pinned here rather than left to the page:
 *
 * 1. every decision carries a model, its parameters and a non-empty full
 *    output — that is what makes audit-by-inspection possible without replay;
 * 2. a missing prompt hash is data. Most rows have none, and nothing in the
 *    service treats that as an error or as a reason to hide a row;
 * 3. the idempotency records and the position-sync lines are empty *because of
 *    the broker posture*, read from `ExecutionService`, and become non-empty
 *    the moment an adapter is registered;
 * 4. the log and `ExecutionService` agree about *when* each trade was drafted.
 *    That service holds one snapshot — the current run's `proposed_orders` —
 *    while this log retains three runs, so the two can only overlap on the
 *    newest. The current run's trade ids resolve there; a superseded run's do
 *    not, because the next run re-proposed, and a trade id dated twice would be
 *    the audit surface contradicting the record it audits;
 * 5. the overlap is *total*, not partial. Every order the snapshot holds has
 *    exactly one order-intent decision in the current run and no current-run
 *    intent names a trade the snapshot does not hold. A log that covers eight
 *    of fourteen orders answers "what did the agents decide?" with a shorter
 *    list than the one the execution page shows, and says nothing about the
 *    missing six — including, at one point, an order a human had approved.
 *
 * The fourth and fifth are checked in both directions on purpose. A test that
 * only followed the current run's ids into `ExecutionService` would pass just as
 * happily on data where every id resolved, or on data where the log drafted a
 * third of the queue — which is exactly the state this file exists to keep the
 * seed out of.
 */

import { TestBed } from '@angular/core/testing';

import { RETAINED_RUN_IDS } from '../models/fund-state.model';
import type { ProposedOrder } from '../models/order.model';
import { DECISION_TYPE_AGENT } from '../models/report-audit.model';
import { ExecutionService } from './execution.service';
import { ReportAuditService } from './report-audit.service';

function setup(): { service: ReportAuditService; execution: ExecutionService } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return {
    service: TestBed.inject(ReportAuditService),
    execution: TestBed.inject(ExecutionService),
  };
}

/**
 * The date of the newest run in the log — the only one `ExecutionService`'s
 * snapshot can still be holding orders for.
 *
 * Read off the log rather than written down, so these checks keep meaning what
 * they mean the day a fourth run is appended and the third falls out.
 */
function currentRunDate(service: ReportAuditService): string {
  return service.decisions().reduce((latest, d) => (d.date > latest ? d.date : latest), '');
}

/** Every trade id the log names, mapped to the days it is dated under. */
function tradeDates(service: ReportAuditService): Map<string, Set<string>> {
  const dates = new Map<string, Set<string>>();
  for (const decision of service.decisions()) {
    if (decision.tradeId === null) continue;
    const days = dates.get(decision.tradeId) ?? new Set<string>();
    days.add(decision.date);
    dates.set(decision.tradeId, days);
  }
  return dates;
}

// ===========================================================================
// Criterion — the log is an inspectable record
// ===========================================================================

describe('ReportAuditService — the decision log', () => {
  it('when the log is read, every decision carries a model, parameters and a full output', () => {
    const { service } = setup();

    expect(service.decisions().length).toBeGreaterThan(0);
    for (const decision of service.decisions()) {
      expect(decision.model).not.toBe('');
      expect(decision.params.length).toBeGreaterThan(0);
      expect(decision.output.length).toBeGreaterThan(0);
      expect(decision.output.every((line) => line.trim() !== '')).toBe(true);
    }
  });

  it('when a decision has no prompt hash, it is still a decision like any other', () => {
    const { service } = setup();

    const unhashed = service.decisions().filter((d) => d.promptHash === null);

    // The ordinary case for this deployment, not an exceptional one.
    expect(unhashed.length).toBeGreaterThan(0);
    expect(service.filteredDecisions()).toEqual(
      expect.arrayContaining(unhashed.filter((d) => d.date >= '2026-07-30')),
    );
  });

  it('when a decision was produced by a pinned step, its parameters name the seed', () => {
    const { service } = setup();

    const hashed = service.decisions().filter((d) => d.promptHash !== null);
    expect(hashed.length).toBeGreaterThan(0);
    for (const decision of hashed) {
      const names = decision.params.map((p) => p.name);
      expect(names).toContain('seed');
      expect(decision.params.find((p) => p.name === 'temperature')?.value).toBe('0');
    }
  });

  it('when a decision is logged, its type belongs to the agent that made it', () => {
    const { service } = setup();

    for (const decision of service.decisions()) {
      expect(DECISION_TYPE_AGENT[decision.type]).toBe(decision.agent);
    }
  });
});

// ===========================================================================
// Criterion — the Related links resolve
// ===========================================================================

describe('ReportAuditService — cross-page vocabulary', () => {
  it('when a decision names a run, it is one of the runs the fund still holds', () => {
    const { service } = setup();

    // The retained set as the fund pages hold it, not a third copy of the list:
    // `deliberation.spec.ts` pins the same constant against `RiskAgentService`,
    // so a run appended there and not here fails one of the two.
    for (const decision of service.decisions()) {
      expect([...RETAINED_RUN_IDS]).toContain(decision.runId);
    }
  });

  it('when the current run drafted a trade, the execution agent still holds that trade', () => {
    const { service, execution } = setup();

    // Read from the real service, never restated here: a literal list of ids
    // would make this a check on this file rather than a check across the two.
    const known = new Set(execution.orders().map((o: ProposedOrder) => o.id));
    const today = currentRunDate(service);
    const drafted = service
      .decisions()
      .filter((d) => d.tradeId !== null && d.date === today);

    expect(drafted.length).toBeGreaterThan(0);
    for (const decision of drafted) {
      expect([decision.id, known.has(decision.tradeId as string)]).toEqual([decision.id, true]);
    }
  });

  it('when a superseded run drafted a trade, the current snapshot does not hold it', () => {
    const { service, execution } = setup();

    const known = new Set(execution.orders().map((o: ProposedOrder) => o.id));
    const today = currentRunDate(service);
    const superseded = service.decisions().filter((d) => d.tradeId !== null && d.date < today);

    // The point of retaining three runs against one snapshot. #1246 proposed a
    // schedule; #1247 re-solved it the next morning and proposed its own. Those
    // earlier orders were never queued, so an id of theirs that resolved would
    // put one trade under two dates — drafted on 2026-07-31 in the log, queued
    // on 2026-08-01 in the execution agent — and leave the reader to guess.
    expect(superseded.length).toBeGreaterThan(0);
    for (const decision of superseded) {
      expect([decision.id, known.has(decision.tradeId as string)]).toEqual([decision.id, false]);
    }
  });

  /*
    Why a superseded id is allowed not to resolve, stated as data rather than
    as prose: the next run re-proposed the same instrument under a new id. The
    decision panel tells the reader exactly that in place of the gate link, so
    it has to be true of every superseded intent, not just the ones spot-read.
  */
  it('when a superseded run drafted a trade, the snapshot holds that instrument under a new id', () => {
    const { service, execution } = setup();

    const symbols = new Set(execution.orders().map((o: ProposedOrder) => o.symbol));
    const today = currentRunDate(service);
    const superseded = service.decisions().filter((d) => d.tradeId !== null && d.date < today);

    expect(superseded.length).toBeGreaterThan(0);
    for (const decision of superseded) {
      const named = /Order intent \S+: (?:buy|sell) [\d,]+ ([A-Z]+),/.exec(decision.output[0]);
      expect([decision.id, named?.[1] ?? null]).not.toEqual([decision.id, null]);
      expect([decision.id, symbols.has(named?.[1] ?? '')]).toEqual([decision.id, true]);
    }
  });

  it('when a trade is named in the log, it is dated under exactly one day', () => {
    const { service } = setup();

    const dates = tradeDates(service);

    // Written as one string per trade so a drift names the trade and both days
    // it was found under, rather than reporting "expected 2 to be 1".
    expect(dates.size).toBeGreaterThan(0);
    for (const [tradeId, days] of dates) {
      expect(`${tradeId} dated ${[...days].join(' and ')}`).toBe(`${tradeId} dated ${[...days][0]}`);
    }
  });

  /*
    The invariant the log exists to satisfy, in both directions at once.

    An audit log whose subject is "every decision the agents made" is not
    allowed to hold a drafting decision for some of the queue: a reader
    auditing an order that a person has already approved has to find the
    reasoning that produced it. And the converse — an intent for a trade the
    snapshot never held — would be the log inventing a trade the execution
    page cannot show.

    Both sides are read live out of `ExecutionService`. A literal list of ids
    here would turn a check across the two services into a check on this file,
    and would go on passing the day a fifteenth order is queued.
  */
  it('when the current run is read against the snapshot, every order has exactly one order-intent and every intent an order', () => {
    const { service, execution } = setup();

    const today = currentRunDate(service);
    const drafted = service
      .decisions()
      .filter((d) => d.type === 'order-intent' && d.date === today)
      .map((d) => d.tradeId as string);
    const queued = execution.orders().map((o: ProposedOrder) => o.id);

    expect(queued.length).toBeGreaterThan(0);

    // Sorted multisets: a missing intent shortens the left side, a duplicate or
    // an intent for a trade that was never queued lengthens it, and the failure
    // names the trades rather than reporting "expected 6 to be 14".
    expect([...drafted].sort()).toEqual([...queued].sort());
  });

  it('when the current run drafted a trade, the log restates the snapshot’s own figures', () => {
    const { service, execution } = setup();

    const today = currentRunDate(service);
    const orders = new Map(execution.orders().map((o: ProposedOrder) => [o.id, o]));
    const drafted = service.decisions().filter((d) => d.tradeId !== null && d.date === today);

    // Every order in the snapshot, not a hand-picked subset of it.
    expect(drafted.length).toBe(orders.size);
    for (const decision of drafted) {
      const order = orders.get(decision.tradeId as string);
      expect(order).toBeDefined();
      if (!order) continue;

      // Quantity, notional, interval count, shortfall and timing risk, checked
      // against the service that owns them rather than against a copy: this is
      // the sentence a reader carries from the audit log to the order table.
      const quantity = Math.abs(order.targetQuantityDelta).toLocaleString('en-US');
      const notional = order.notionalValue.toLocaleString('en-US');
      const prose = decision.output.join(' ');

      expect(prose).toContain(
        `Order intent ${order.id}: ${order.side} ${quantity} ${order.symbol}, notional EUR ${notional}.`,
      );

      // An order the agent could not price has no figure to restate, so the
      // intent has to say so and must not have invented one to fill the
      // sentence. "n bps" is the only shape a cost or a risk takes in this log.
      if (order.estimatedShortfallBps === null || order.estimatedRiskBps === null) {
        expect([order.id, order.trajectory.length]).toEqual([order.id, 0]);
        expect(prose).toContain('Scheduling incomplete');
        expect([order.id, /\d+ bps/.test(prose)]).toEqual([order.id, false]);
        expect([order.id, /\bnull\b/.test(prose)]).toEqual([order.id, false]);
        continue;
      }

      expect(prose).toContain(
        `Scheduled over ${order.trajectory.length} intervals, front-loaded; estimated implementation ` +
          `shortfall ${order.estimatedShortfallBps} bps against ${order.estimatedRiskBps} bps of timing risk.`,
      );
    }
  });

  it('when a record carries an idempotency key, its date, its trade and its intent all resolve', () => {
    const { service, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    // The run date read off `ExecutionService` — the snapshot a POST would be
    // made from — and cross-checked against the newest run in the log, so the
    // two services have to still be talking about the same day.
    const runDate = execution.lastRun().slice(0, 10);
    expect(runDate).toBe(currentRunDate(service));

    const orders = new Map(execution.orders().map((o: ProposedOrder) => [o.id, o]));
    const records = service.idempotencyRecords();
    expect(records.length).toBeGreaterThan(0);

    for (const record of records) {
      const order = orders.get(record.tradeId);

      // A POST is only ever made for an order the live snapshot still holds.
      expect([record.id, order?.symbol ?? null]).toEqual([record.id, record.symbol]);

      // The third part of the key is the prompt hash of the intent that drafted
      // this trade, looked up in the log rather than restated here: the key
      // names a wording, so a re-drafted intent is a different POST.
      const intent = service
        .decisions()
        .find(
          (d) => d.type === 'order-intent' && d.date === runDate && d.tradeId === record.tradeId,
        );
      expect([record.id, intent?.promptHash ?? null]).not.toEqual([record.id, null]);

      // The key restated from its three parts, none of them decorative.
      expect(record.idempotencyKey).toBe(
        `ik_${runDate}_${record.tradeId}_${intent?.promptHash ?? ''}`,
      );
    }
  });

  /*
    The rule the whole four-stage pipeline exists to enforce, checked from the
    audit surface: the human gate is stage three and the broker adapter is
    stage four, so a record claiming a send is a claim that somebody signed for
    it first. A record naming an order `ExecutionService` still holds as
    pending would have this page reporting a POST for a trade the gate says is
    undecided — and the timestamps would be free to run backwards with it.
  */
  it('when a record says an intent was sent, the snapshot says a human approved it first', () => {
    const { service, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    const orders = new Map(execution.orders().map((o: ProposedOrder) => [o.id, o]));
    const sent = service.idempotencyRecords().filter((r) => r.postedAt !== null);

    expect(sent.length).toBeGreaterThan(0);
    for (const record of sent) {
      const order = orders.get(record.tradeId);
      expect([record.id, order?.status ?? null]).toEqual([record.id, 'approved']);
      expect([record.id, order?.decidedBy ?? null]).not.toEqual([record.id, null]);

      // Queued, then decided, then POSTed — in that order, on the same clock.
      const queuedAt = order?.queuedAt ?? '';
      const decidedAt = order?.decidedAt ?? '';
      expect([record.id, queuedAt < decidedAt]).toEqual([record.id, true]);
      expect([record.id, decidedAt < (record.postedAt as string)]).toEqual([record.id, true]);
    }
  });

  it('when a duplicate is suppressed, it carries the key of the send it duplicated', () => {
    const { service, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    const records = service.idempotencyRecords();
    const suppressed = records.filter((r) => r.dedup === 'duplicate-suppressed');

    expect(suppressed.length).toBeGreaterThan(0);
    for (const duplicate of suppressed) {
      const original = records.find(
        (r) => r.dedup === 'unique' && r.idempotencyKey === duplicate.idempotencyKey,
      );
      expect(original?.tradeId).toBe(duplicate.tradeId);
      expect(original?.symbol).toBe(duplicate.symbol);
    }
  });

  it('when a run is labelled for the panel, it reads as the deliberation run it is', () => {
    const { service } = setup();

    const decision = service.decisions()[0];

    expect(service.runLabel(decision)).toBe(`Fund Deliberation · run #${decision.runId}`);
  });
});

// ===========================================================================
// Criterion — the broker posture, not a hardcoded sentence
// ===========================================================================

describe('ReportAuditService — broker posture', () => {
  it('when no broker is configured, there are no idempotency records at all', () => {
    const { service } = setup();

    expect(service.brokerConfigured()).toBe(false);
    expect(service.idempotencyRecords()).toEqual([]);
    expect(service.idempotencyCount()).toBe(0);
  });

  it('when no broker is configured, the empty tab explains itself with the posture', () => {
    const { service } = setup();

    expect(service.idempotencyEmptyReason()).toContain('No broker configured');
    expect(service.idempotencyEmptyReason()).toContain('idempotency key');
  });

  it('when no broker is configured, there is nothing to reconcile positions against', () => {
    const { service } = setup();

    expect(service.syncRows()).toEqual([]);
    expect(service.syncEmptyReason()).toContain('No broker configured');
    expect(service.positionsSourceLine()).toContain('no broker configured to sync');
  });

  it('when an adapter is registered, the idempotency records appear without editing this page', () => {
    const { service, execution } = setup();

    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    expect(service.idempotencyRecords().length).toBeGreaterThan(0);
    expect(service.syncRows().length).toBeGreaterThan(0);
    expect(service.positionsSourceLine()).toContain('never its source');
  });

  it('when a send has not settled, its record says pending rather than an outcome', () => {
    const { service, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    const pending = service.idempotencyRecords().filter((r) => r.reconciliation === 'pending');

    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].reconciliationNote).toContain('neither confirmed nor lost');
  });

  it('when a replayed intent reuses a key, the record shows the duplicate suppressed', () => {
    const { service, execution } = setup();
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    const suppressed = service
      .idempotencyRecords()
      .filter((r) => r.dedup === 'duplicate-suppressed');

    expect(suppressed.length).toBeGreaterThan(0);
    expect(suppressed[0].postedAt).toBeNull();
  });

  it('when the posture changes, the fourth posture indicator changes with it', () => {
    const { service, execution } = setup();

    const before = service.postureIndicators().find((i) => i.id === 'broker-idempotency');
    expect(before?.state).toBe('Not configured');
    expect(before?.on).toBe(false);

    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });

    const after = service.postureIndicators().find((i) => i.id === 'broker-idempotency');
    expect(after?.state).toBe('Configured');
    expect(after?.on).toBe(true);
    expect(after?.detail).toContain('Trading 212');
  });

  it('when the posture card is read, no indicator relies on its glyph alone', () => {
    const { service } = setup();

    for (const indicator of service.postureIndicators()) {
      expect(indicator.state.trim()).not.toBe('');
      expect(indicator.detail.trim()).not.toBe('');
    }
  });
});

// ===========================================================================
// Criterion — the filters narrow a query, and the tab does not reset them
// ===========================================================================

describe('ReportAuditService — filters', () => {
  it('when an agent is chosen, only that agent’s decisions survive', () => {
    const { service } = setup();

    service.setAgentFilter('risk');

    expect(service.filteredCount()).toBeGreaterThan(0);
    expect(service.filteredDecisions().every((d) => d.agent === 'risk')).toBe(true);
  });

  it('when the range is narrowed to today, older runs drop out', () => {
    const { service } = setup();
    const before = service.filteredCount();

    service.setDateRange('today');

    expect(service.filteredCount()).toBeLessThan(before);
    expect(service.filteredDecisions().every((d) => d.date === '2026-08-01')).toBe(true);
  });

  it('when the tab changes, the agent and date-range filters are kept', () => {
    const { service } = setup();
    service.setAgentFilter('execution');
    service.setDateRange('today');

    service.setTab('positions-provenance');
    service.setTab('decision-log');

    expect(service.agentFilter()).toBe('execution');
    expect(service.dateRange()).toBe('today');
    expect(service.filteredDecisions().every((d) => d.agent === 'execution')).toBe(true);
  });

  it('when the search is applied, it reaches the full output and not only the row', () => {
    const { service } = setup();

    service.applySearch('Euler');

    expect(service.filteredCount()).toBeGreaterThan(0);
    expect(
      service
        .filteredDecisions()
        .every((d) => d.output.join(' ').toLowerCase().includes('euler')),
    ).toBe(true);
  });

  it('when the search matches nothing, the set is empty and the filters are still active', () => {
    const { service } = setup();

    service.applySearch('zzzz-no-such-decision');

    expect(service.filteredCount()).toBe(0);
    expect(service.filtersActive()).toBe(true);
    expect(service.emptyReason()).toBe('no-match');
  });

  it('when the filters are reset, the whole log comes back', () => {
    const { service } = setup();
    service.setAgentFilter('macro');
    service.applySearch('regime');

    service.clearFilters();

    expect(service.filtersActive()).toBe(false);
    expect(service.filteredCount()).toBe(service.totalCount());
  });
});

// ===========================================================================
// Criterion — two empty states, only one of which has a way out
// ===========================================================================

describe('ReportAuditService — empty states', () => {
  it('when nothing has ever been logged, the reason is no-log and no filter is active', async () => {
    const { service } = setup();
    service.logHasDecisions.set(false);

    await service.refresh();

    expect(service.logIsEmpty()).toBe(true);
    expect(service.emptyReason()).toBe('no-log');
    expect(service.filtersActive()).toBe(false);
  });

  it('when filters exclude everything but the log is not empty, the reason is no-match', () => {
    const { service } = setup();

    service.setAgentFilter('macro');
    service.setDecisionTypeFilter('order-intent');

    expect(service.logIsEmpty()).toBe(false);
    expect(service.emptyReason()).toBe('no-match');
  });
});

// ===========================================================================
// Criterion — pagination over the filtered set
// ===========================================================================

describe('ReportAuditService — pagination', () => {
  it('when the page size is smaller than the set, the rows are split across pages', () => {
    const { service } = setup();

    service.setPageSize(10);

    expect(service.pageCount()).toBe(Math.ceil(service.filteredCount() / 10));
    expect(service.visibleDecisions()).toHaveLength(10);
  });

  it('when the reader moves on, the next page holds the next rows and no repeats', () => {
    const { service } = setup();
    service.setPageSize(10);
    const first = service.visibleDecisions().map((d) => d.id);

    service.setPage(2);
    const second = service.visibleDecisions().map((d) => d.id);

    expect(second).not.toEqual(first);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });

  it('when a filter shortens the set, the page index cannot stay past the end', () => {
    const { service } = setup();
    service.setPageSize(10);
    service.setPage(3);

    service.setAgentFilter('allocation');

    expect(service.page()).toBe(1);
    expect(service.visibleDecisions().length).toBe(service.filteredCount());
  });

  it('when the page is set beyond the last one, it clamps instead of emptying the table', () => {
    const { service } = setup();

    service.setPage(99);

    expect(service.page()).toBe(service.pageCount());
    expect(service.visibleDecisions().length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Criterion — sorting
// ===========================================================================

describe('ReportAuditService — sorting', () => {
  it('when the log opens, it is sorted newest decision first', () => {
    const { service } = setup();

    const stamps = service.filteredDecisions().map((d) => `${d.date} ${d.time}`);

    expect(service.sortKey()).toBe('time');
    expect(service.sortAscending()).toBe(false);
    expect([...stamps].sort().reverse()).toEqual(stamps);
  });

  it('when the same column is activated twice, the direction flips', () => {
    const { service } = setup();

    service.setSort('time');

    expect(service.sortAscending()).toBe(true);
    const stamps = service.filteredDecisions().map((d) => `${d.date} ${d.time}`);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('when another column is activated, it takes the sort and starts ascending', () => {
    const { service } = setup();

    service.setSort('agent');

    expect(service.sortKey()).toBe('agent');
    expect(service.sortAscending()).toBe(true);
  });
});

// ===========================================================================
// Criterion — the live summary, the export and the lifecycle
// ===========================================================================

describe('ReportAuditService — summary, export and lifecycle', () => {
  it('when the log opens, the summary names the count, the view and the scope', () => {
    const { service } = setup();

    expect(service.statParts()).toEqual([
      `${service.filteredCount()} decisions`,
      'Decision Log',
      'All agents',
      'Last 30 days',
    ]);
  });

  it('when the tab changes, the summary describes the new collection', () => {
    const { service } = setup();

    service.setTab('orders-idempotency');

    expect(service.statParts()[0]).toBe('0 order intents');
    expect(service.statParts()).toContain('No broker configured');
  });

  it('when the filtered set is exported, the notice names the rows, the view and the format', () => {
    const { service } = setup();
    service.setAgentFilter('risk');

    service.exportActiveSet('csv');

    expect(service.exportNotice()).toContain(`${service.filteredCount()} decisions`);
    expect(service.exportNotice()).toContain('Decision Log');
    expect(service.exportNotice()).toContain('CSV');
    expect(service.exportNotice()).toContain('unchanged');
  });

  it('when the log is being re-read, the summary says so instead of quoting a count', async () => {
    const { service } = setup();

    const pending = service.refresh();

    expect(service.statParts().join(' ')).not.toContain('decisions');
    expect(service.statParts()[0]).toContain('Reading the audit log');

    await pending;
    expect(service.statParts()[0]).toBe(`${service.filteredCount()} decisions`);
  });

  it('when the query moves after an export, the receipt is withdrawn with it', () => {
    const { service } = setup();
    service.exportActiveSet('csv');
    expect(service.exportNotice()).not.toBeNull();

    service.setAgentFilter('macro');

    // "Exported 37 decisions from Decision Log" is a claim about the set on
    // screen; nine rows later it is no longer one.
    expect(service.exportNotice()).toBeNull();
  });

  it('when the tab moves after an export, the receipt does not travel to the new view', () => {
    const { service } = setup();
    service.exportActiveSet('pdf');

    service.setTab('positions-provenance');

    expect(service.exportNotice()).toBeNull();
  });

  it('when a decision has no prompt hash, that is the majority case and it is counted honestly', () => {
    const { service } = setup();

    const total = service.decisions().length;
    const unhashed = service.decisions().filter((d) => d.promptHash === null).length;

    expect(total).toBe(37);
    expect(unhashed).toBe(18);
  });

  it('when the export runs, it changes nothing in the log', () => {
    const { service } = setup();
    const before = service.decisions();

    service.exportActiveSet('pdf');

    expect(service.decisions()).toBe(before);
  });

  it('when a read fails, the message is the one the banner shows and recovery is offered', async () => {
    const { service } = setup();

    await service.refresh(true);

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).toBe('Unable to load the audit log.');

    service.clearError();
    expect(service.state()).toBe('ready');
    expect(service.errorMessage()).toBeNull();
  });

  it('when a read succeeds, the reader’s query survives it', async () => {
    const { service } = setup();
    service.setAgentFilter('macro');
    service.applySearch('regime');
    service.setSort('agent');

    await service.refresh();

    expect(service.agentFilter()).toBe('macro');
    expect(service.search()).toBe('regime');
    expect(service.sortKey()).toBe('agent');
  });

  it('when a decision is selected and the log is re-read, the panel does not stay open', async () => {
    const { service } = setup();
    service.select(service.decisions()[0].id);
    expect(service.selectedDecision()).not.toBeNull();

    await service.refresh();

    expect(service.selectedDecision()).toBeNull();
  });

  it('when an unknown id is selected, nothing opens', () => {
    const { service } = setup();

    service.select('dcn_not_a_decision');

    expect(service.selectedDecision()).toBeNull();
  });
});
