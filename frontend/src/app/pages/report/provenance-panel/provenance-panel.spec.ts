/**
 * The Positions Provenance tab.
 *
 * Two facts that must not be confused with each other: the positions are all
 * there, because the domain owns them and they arrive by manual entry or CSV
 * import; and the synchronisation block below them is empty, because no broker
 * is configured to compare them against. The first is not affected by the
 * second — which is the whole reason rebalancing, monitoring and attribution
 * behave the same with or without an adapter.
 *
 * The third fact, and the one a hardcoded seed quietly got wrong: the
 * positions belong to the *active* portfolio, and the topbar can change which
 * that is while the reader is on this tab.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExecutionService } from '../../../services/execution.service';
import { FundService } from '../../../services/fund.service';
import { ReportAuditService } from '../../../services/report-audit.service';
import { ProvenancePanel } from './provenance-panel';

describe('ProvenancePanel', () => {
  let fixture: ComponentFixture<ProvenancePanel>;
  let host: HTMLElement;
  let service: ReportAuditService;
  let execution: ExecutionService;
  let fund: FundService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProvenancePanel] }).compileComponents();
    fixture = TestBed.createComponent(ProvenancePanel);
    host = fixture.nativeElement;
    service = TestBed.inject(ReportAuditService);
    execution = TestBed.inject(ExecutionService);
    fund = TestBed.inject(FundService);
    // The fund answers with the same stand-in latency as everything else, and
    // the positions are its, so the panel has nothing until it has landed.
    await fund.load();
    fixture.detectChanges();
  });

  function rows(): HTMLTableRowElement[] {
    return Array.from(host.querySelectorAll('tbody tr'));
  }

  it('when the tab renders, every position is listed with where it came from', () => {
    expect(rows()).toHaveLength(service.positions().length);
    const headers = Array.from(host.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual(['Instrument', 'Weight', 'Source', 'Reference', 'Recorded']);
  });

  it('when a position was imported, the source is named in words beside its mark', () => {
    const imported = service.positions().find((p) => p.source === 'csv-import')!;
    const row = rows().find((r) => r.textContent?.includes(imported.instrument));

    expect(row?.textContent).toContain('CSV import');
    expect(row?.textContent).toContain(imported.reference);
  });

  it('when a position was entered by hand, that is stated rather than left blank', () => {
    const manual = service.positions().find((p) => p.source === 'manual')!;
    const row = rows().find((r) => r.textContent?.includes(manual.instrument));

    expect(row?.textContent).toContain('Manual entry');
    expect(row?.textContent).toContain(manual.recordedBy);
  });

  it('when no broker is configured, the sync block is empty and says which posture made it so', () => {
    const empty = host.querySelector('[data-testid="sync-empty"]');

    expect(host.textContent).toContain('Broker synchronisation');
    expect(empty?.textContent).toContain('No broker configured');
    expect(empty?.textContent).toContain('owned by the domain');
    expect(host.querySelector('[data-testid="sync-rows"]')).toBeNull();
  });

  it('when no broker is configured, the positions themselves are still all there', () => {
    expect(rows().length).toBeGreaterThan(0);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('when an adapter is registered, the sync block fills in without touching the positions', () => {
    const before = rows().length;

    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="sync-empty"]')).toBeNull();
    expect(host.querySelectorAll('[data-testid="sync-rows"] li')).toHaveLength(
      service.syncRows().length,
    );
    expect(rows()).toHaveLength(before);
  });

  it('when the log is being read, the tab shows placeholders and no positions', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="provenance-skeleton"]')).not.toBeNull();
    expect(host.querySelector('table')).toBeNull();

    await pending;
  });

  // --- the positions are the active portfolio's -----------------------------

  it('when the tab renders, the positions are the active portfolio’s holdings', () => {
    const active = fund.active()!;

    expect(rows()).toHaveLength(active.holdings.length);
    expect(
      Array.from(host.querySelectorAll('tbody tr th')).map((th) => th.textContent?.trim()),
    ).toEqual(active.holdings.map((h) => h.instrument));
    // The caption names the portfolio, so the table cannot be read against
    // another one.
    expect(host.querySelector('caption')?.textContent).toContain(active.name);
  });

  it('when the portfolio is switched, the provenance follows it instead of naming the old holdings', () => {
    const before = Array.from(host.querySelectorAll('tbody tr th')).map((th) =>
      th.textContent?.trim(),
    );

    const other = fund.portfolios().find((p) => p.id !== fund.active()?.id)!;
    fund.setActive(other.id);
    fixture.detectChanges();

    const after = Array.from(host.querySelectorAll('tbody tr th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(after).not.toEqual(before);
    expect(after).toEqual(other.holdings.map((h) => h.instrument));
    expect(host.querySelector('caption')?.textContent).toContain(other.name);
    // Every weight is the domain's, never a figure this page kept a copy of.
    for (const holding of other.holdings) {
      const row = rows().find((r) => r.textContent?.includes(holding.instrument));
      expect(row?.textContent).toContain(`${holding.weight}%`);
    }
  });

  it('when every portfolio is offered, no holding is left without a recorded origin', () => {
    for (const portfolio of fund.portfolios()) {
      fund.setActive(portfolio.id);
      fixture.detectChanges();

      for (const position of service.positions()) {
        // Words in every cell — "Not recorded" is a fact, a blank is a question.
        expect(position.reference.trim()).not.toBe('');
        expect(position.recordedAt.trim()).not.toBe('');
        expect(position.recordedBy.trim()).not.toBe('');
        expect(position.reference).not.toContain('No import file or entry note');
      }
    }
  });

  it('when no portfolio has arrived yet, the tab says so instead of showing an empty table', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ProvenancePanel] }).compileComponents();
    const bare = TestBed.createComponent(ProvenancePanel);
    const bareHost: HTMLElement = bare.nativeElement;
    bare.detectChanges();

    // FundService is still in flight, so this is placeholders, not an empty
    // table that would read as "the fund holds nothing".
    expect(bareHost.querySelector('[data-testid="provenance-skeleton"]')).not.toBeNull();
    expect(bareHost.querySelector('table')).toBeNull();

    await TestBed.inject(FundService).load();
    bare.detectChanges();
    expect(bareHost.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });
});
