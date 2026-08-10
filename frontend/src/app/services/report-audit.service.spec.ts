/**
 * The audit log's own invariants.
 *
 * Four of them are the reason doc 24 exists at all and none of them is visible
 * from a screenshot, so they are pinned here rather than left to the page:
 *
 * 1. every decision carries a model, its parameters and a non-empty full
 *    output — that is what makes audit-by-inspection possible without replay;
 * 2. a missing prompt hash is data. Most rows have none, and nothing in the
 *    service treats that as an error or as a reason to hide a row;
 * 3. the idempotency records and the position-sync lines are empty *because of
 *    the broker posture*, read from `ExecutionService`, and become non-empty
 *    the moment an adapter is registered;
 * 4. every row names a run and, where it drafted one, a trade that the fund
 *    services actually hold — so the panel's Related links are not dead ends.
 */

import { TestBed } from '@angular/core/testing';

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

    // The three runs `RiskAgentService` retains, newest first.
    const retained = ['1247', '1246', '1245'];
    for (const decision of service.decisions()) {
      expect(retained).toContain(decision.runId);
    }
  });

  it('when a decision drafted a trade, the execution agent holds that trade', () => {
    const { service, execution } = setup();

    const known = new Set(execution.orders().map((o: ProposedOrder) => o.id));
    const drafted = service.decisions().filter((d) => d.tradeId !== null);

    expect(drafted.length).toBeGreaterThan(0);
    for (const decision of drafted) {
      expect(known.has(decision.tradeId as string)).toBe(true);
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

    // "Exported 29 decisions from Decision Log" is a claim about the set on
    // screen; six rows later it is no longer one.
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

    expect(total).toBe(29);
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
