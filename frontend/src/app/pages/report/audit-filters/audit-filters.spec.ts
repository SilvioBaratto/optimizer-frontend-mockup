/**
 * The filter bar.
 *
 * The distinction the doc draws, and the one this file exists for: a select
 * applies the moment it changes, while the free-text search does nothing until
 * the reader presses Enter or the Search button. Typing must not narrow the
 * table, because the count under it is a live region and would be re-announced
 * once per keystroke.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportAuditService } from '../../../services/report-audit.service';
import { AuditFilters } from './audit-filters';

describe('AuditFilters', () => {
  let fixture: ComponentFixture<AuditFilters>;
  let host: HTMLElement;
  let service: ReportAuditService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AuditFilters] }).compileComponents();
    fixture = TestBed.createComponent(AuditFilters);
    host = fixture.nativeElement;
    // Focus is only real for an element that is in the document.
    document.body.appendChild(host);
    service = TestBed.inject(ReportAuditService);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function select(id: string): HTMLSelectElement {
    return host.querySelector(`#${id}`) as HTMLSelectElement;
  }

  function choose(id: string, value: string): void {
    const control = select(id);
    control.value = value;
    control.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function searchField(): HTMLInputElement {
    return host.querySelector('[data-testid="search-field"]') as HTMLInputElement;
  }

  function type(text: string): void {
    const field = searchField();
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // --- the controls the doc lists -------------------------------------------

  it('when the bar renders, every control carries a visible label', () => {
    for (const id of ['report-agent-filter', 'report-type-filter', 'report-range-filter']) {
      expect(host.querySelector(`label[for="${id}"]`)?.textContent?.trim()).not.toBe('');
    }
    expect(host.querySelector('label[for="report-search"]')?.textContent?.trim()).toBe(
      'Search decisions',
    );
  });

  it('when the bar opens, the defaults are all agents, all decisions and the last 30 days', () => {
    expect(select('report-agent-filter').value).toBe('all');
    expect(select('report-type-filter').value).toBe('all');
    expect(select('report-range-filter').value).toBe('30d');
  });

  // --- selects apply immediately -------------------------------------------

  it('when the agent select changes, the filter applies at once', () => {
    choose('report-agent-filter', 'macro');

    expect(service.agentFilter()).toBe('macro');
    expect(service.filteredDecisions().every((d) => d.agent === 'macro')).toBe(true);
  });

  it('when the decision-type select changes, the filter applies at once', () => {
    choose('report-type-filter', 'order-intent');

    expect(service.decisionTypeFilter()).toBe('order-intent');
    expect(service.filteredDecisions().every((d) => d.type === 'order-intent')).toBe(true);
  });

  it('when the date-range select changes, the filter applies at once', () => {
    choose('report-range-filter', 'today');

    expect(service.dateRange()).toBe('today');
  });

  // --- the search waits -----------------------------------------------------

  it('when the reader is still typing, nothing is applied', () => {
    const before = service.filteredCount();

    type('regime');

    expect(service.search()).toBe('');
    expect(service.filteredCount()).toBe(before);
  });

  it('when the reader is still typing, the bar says how the query is applied', () => {
    type('regime');

    expect(host.textContent).toContain('Press Enter or Search to apply');
  });

  it('when Enter is pressed in the field, the query applies', () => {
    type('regime');

    searchField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(service.search()).toBe('regime');
    expect(service.filteredCount()).toBeGreaterThan(0);
    expect(service.filteredCount()).toBeLessThan(service.totalCount());
  });

  it('when the Search button is used, the query applies the same way', () => {
    type('kill-switch');

    (host.querySelector('[data-testid="search-submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.search()).toBe('kill-switch');
  });

  // --- clearing -------------------------------------------------------------

  it('when no filter is set, there is nothing offering to clear one', () => {
    expect(host.querySelector('[data-testid="filters-clear"]')).toBeNull();
  });

  it('when filters are set, clearing them empties the field as well as the query', () => {
    choose('report-agent-filter', 'macro');
    type('regime');
    (host.querySelector('[data-testid="search-submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    (host.querySelector('[data-testid="filters-clear"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.filtersActive()).toBe(false);
    expect(searchField().value).toBe('');
    expect(select('report-agent-filter').value).toBe('all');
  });

  // --- per-tab applicability ------------------------------------------------

  it('when the tab has no decision types, that select is absent rather than inert', () => {
    service.setTab('positions-provenance');
    fixture.detectChanges();

    expect(host.querySelector('#report-type-filter')).toBeNull();
    // Agent and date range apply everywhere and stay.
    expect(select('report-agent-filter')).not.toBeNull();
    expect(select('report-range-filter')).not.toBeNull();
  });

  it('when the reader comes back to the log, the decision type they left is still set', () => {
    choose('report-type-filter', 'constraint-check');

    service.setTab('orders-idempotency');
    fixture.detectChanges();
    service.setTab('decision-log');
    fixture.detectChanges();

    expect(select('report-type-filter').value).toBe('constraint-check');
  });

  // --- loading --------------------------------------------------------------

  it('when the log is being read, the filter controls are disabled', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(select('report-agent-filter').disabled).toBe(true);
    expect(select('report-range-filter').disabled).toBe(true);
    expect(searchField().disabled).toBe(true);
    expect(
      (host.querySelector('[data-testid="search-submit"]') as HTMLButtonElement).disabled,
    ).toBe(true);

    await pending;
    fixture.detectChanges();
    expect(select('report-agent-filter').disabled).toBe(false);
  });

  it('when the log is being read, Clear filters is disabled with the rest of the bar', async () => {
    choose('report-agent-filter', 'macro');
    const clear = host.querySelector('[data-testid="filters-clear"]') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);

    const pending = service.refresh();
    fixture.detectChanges();

    // Moving the query out from under a blanked table is the thing the
    // Caricamento row disables the whole bar to prevent.
    expect(
      (host.querySelector('[data-testid="filters-clear"]') as HTMLButtonElement).disabled,
    ).toBe(true);

    await pending;
  });

  it('when a read is in flight, the refresh control refuses a second press without losing focus', async () => {
    const refresh = host.querySelector('app-refresh-control button') as HTMLButtonElement;
    refresh.focus();

    const pending = service.refresh();
    fixture.detectChanges();

    expect(refresh.getAttribute('aria-disabled')).toBe('true');
    expect(refresh.hasAttribute('disabled')).toBe(false);
    // Still focusable, so the next Tab carries on from here rather than from
    // the top of the document.
    expect(document.activeElement).toBe(refresh);

    await pending;
  });
});
