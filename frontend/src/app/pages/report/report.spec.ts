/**
 * The Report & Audit trail page.
 *
 * What is pinned here is the page-level behaviour the regions cannot own on
 * their own: the tab strip and the promise that changing it keeps the reader's
 * query, the rule that loading blanks the view instead of showing half an
 * audit record, the live count, and the pagination over the filtered log.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { ICON_PROVIDER } from '../../icons';
import { FundService } from '../../services/fund.service';
import { ReportAuditService } from '../../services/report-audit.service';
import { Report } from './report';

describe('Report page', () => {
  let fixture: ComponentFixture<Report>;
  let host: HTMLElement;
  let service: ReportAuditService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Report],
      providers: [provideRouter([]), ICON_PROVIDER],
    }).compileComponents();
    fixture = TestBed.createComponent(Report);
    host = fixture.nativeElement;
    service = TestBed.inject(ReportAuditService);
    fixture.detectChanges();
  });

  function tabs(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[role="tab"]'));
  }

  function tab(id: string): HTMLButtonElement {
    const match = host.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`);
    expect(match).not.toBeNull();
    return match as HTMLButtonElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-decision-row]'));
  }

  /** Waits out the service's stand-in latency, which no fixture hook knows about. */
  async function settled(): Promise<void> {
    while (service.state() === 'loading') {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  // --- TabBar ---------------------------------------------------------------

  it('when the page opens, the three views are offered and Decision Log is the active one', () => {
    expect(tabs().map((t) => t.textContent?.trim())).toEqual([
      'Decision Log',
      'Orders & Idempotency',
      'Positions Provenance',
    ]);
    expect(tab('decision-log').getAttribute('aria-selected')).toBe('true');
    expect(rows().length).toBeGreaterThan(0);
  });

  it('when a tab is chosen, the panel underneath changes to that view', async () => {
    // The positions are the active portfolio's, so the tab shows placeholders
    // until the fund has answered.
    await TestBed.inject(FundService).load();

    tab('positions-provenance').click();
    fixture.detectChanges();

    expect(tab('positions-provenance').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-testid="sync-empty"]')).not.toBeNull();
    expect(host.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(0);
  });

  it('when the portfolio is switched, the provenance tab follows it', async () => {
    const fund = TestBed.inject(FundService);
    await fund.load();
    tab('positions-provenance').click();
    fixture.detectChanges();

    const other = fund.portfolios().find((p) => p.id !== fund.active()?.id)!;
    fund.setActive(other.id);
    fixture.detectChanges();

    // The summary names the portfolio these positions belong to, so a reader
    // who switched cannot read the table against the one they left.
    const bar = host.querySelector('app-collection-stat-bar')?.textContent ?? '';
    expect(bar).toContain(`${other.holdings.length} positions`);
    expect(bar).toContain(other.name);
  });

  it('when the tab changes, the agent and date-range filters are still applied', () => {
    const agent = host.querySelector<HTMLSelectElement>('#report-agent-filter')!;
    agent.value = 'risk';
    agent.dispatchEvent(new Event('change'));
    const range = host.querySelector<HTMLSelectElement>('#report-range-filter')!;
    range.value = 'today';
    range.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    tab('orders-idempotency').click();
    fixture.detectChanges();
    tab('decision-log').click();
    fixture.detectChanges();

    expect(host.querySelector<HTMLSelectElement>('#report-agent-filter')!.value).toBe('risk');
    expect(host.querySelector<HTMLSelectElement>('#report-range-filter')!.value).toBe('today');
    expect(service.agentFilter()).toBe('risk');
    expect(service.dateRange()).toBe('today');
  });

  it('when the tab strip is used from the keyboard, the arrow keys move between views', () => {
    const strip = tab('decision-log');
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(tab('orders-idempotency').getAttribute('aria-selected')).toBe('true');
    expect(tab('decision-log').getAttribute('tabindex')).toBe('-1');
    expect(tab('orders-idempotency').getAttribute('tabindex')).toBe('0');
  });

  // --- loading --------------------------------------------------------------

  it('when the log is being read, no audit content is shown at all', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="decisions-skeleton"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="posture-skeleton"]')).not.toBeNull();
    // Not one row, not one indicator, not a page control.
    expect(rows()).toHaveLength(0);
    expect(host.querySelector('[data-testid="positions-source"]')).toBeNull();
    expect(host.querySelector('ui-pagination')).toBeNull();

    await pending;
    fixture.detectChanges();
    expect(rows().length).toBeGreaterThan(0);
  });

  it('when the log is being read, the live summary stops quoting the last count', async () => {
    const before = host.querySelector('app-collection-stat-bar')!.textContent ?? '';
    expect(before).toContain('decisions');

    const pending = service.refresh();
    fixture.detectChanges();

    // The bar sits directly above a blanked table: a count announced there is
    // a claim about a record nothing on screen is currently backing.
    const during = host.querySelector('app-collection-stat-bar')!.textContent ?? '';
    expect(during).not.toContain('decisions');
    expect(during).toContain('Reading the audit log');
    // …and the region itself never leaves the DOM, or nothing would be announced.
    expect(host.querySelector('app-collection-stat-bar')?.getAttribute('aria-live')).toBe('polite');

    await pending;
    fixture.detectChanges();
    expect(host.querySelector('app-collection-stat-bar')!.textContent).toContain('29 decisions');
  });

  it('when the log is being read, the placeholder region is marked busy', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(
      host.querySelector('[data-testid="decisions-skeleton"]')?.getAttribute('aria-busy'),
    ).toBe('true');

    await pending;
  });

  it('when the log is being read, the tab strip refuses a change without losing focus', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    const target = tab('positions-provenance');
    expect(target.getAttribute('aria-disabled')).toBe('true');
    // aria-disabled, never disabled: the attribute that would drop focus to
    // <body> and restart the next Tab at the top of the document.
    expect(target.hasAttribute('disabled')).toBe(false);

    target.click();
    fixture.detectChanges();
    expect(service.tab()).toBe('decision-log');

    await pending;
  });

  // --- error ----------------------------------------------------------------

  it('when the read fails, a banner offers a retry and says the log may be incomplete', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const banner = host.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain('Unable to load the audit log.');
    expect(banner?.textContent).toContain('may not be complete');
    expect(banner?.querySelector('button')?.textContent?.trim()).toBe('Retry');
  });

  it('when the retry is used, the log is read again and the banner goes', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    (host.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await settled();
    fixture.detectChanges();

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(rows().length).toBeGreaterThan(0);
  });

  // --- CollectionStatBar ----------------------------------------------------

  it('when the page opens, the summary is a polite live region naming the scope', () => {
    const bar = host.querySelector('app-collection-stat-bar');

    expect(bar?.getAttribute('aria-live')).toBe('polite');
    expect(bar?.getAttribute('role')).toBe('status');
    expect(bar?.textContent).toContain('decisions');
    expect(bar?.textContent).toContain('Decision Log');
    expect(bar?.textContent).toContain('All agents');
    expect(bar?.textContent).toContain('Last 30 days');
  });

  it('when a filter changes, the summary follows it', () => {
    const before = host.querySelector('app-collection-stat-bar')?.textContent ?? '';

    const agent = host.querySelector<HTMLSelectElement>('#report-agent-filter')!;
    agent.value = 'macro';
    agent.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const after = host.querySelector('app-collection-stat-bar')?.textContent ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain('Macro & Regimes');
  });

  it('when the tab changes, the summary describes the new collection', () => {
    tab('orders-idempotency').click();
    fixture.detectChanges();

    const bar = host.querySelector('app-collection-stat-bar');
    expect(bar?.textContent).toContain('0 order intents');
    expect(bar?.textContent).toContain('No broker configured');
  });

  // --- pagination -----------------------------------------------------------

  it('when the log has more rows than one page, the page controls appear', () => {
    const size = host.querySelector<HTMLSelectElement>('#report-page-size')!;
    size.value = '10';
    size.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(rows()).toHaveLength(10);
    expect(host.textContent).toContain(`Page 1 of ${service.pageCount()}`);
  });

  it('when the next page is asked for, the rows change and the indicator follows', () => {
    const size = host.querySelector<HTMLSelectElement>('#report-page-size')!;
    size.value = '10';
    size.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const first = rows().map((r) => r.getAttribute('data-decision-row'));

    (host.querySelector('[aria-label="Next page"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const second = rows().map((r) => r.getAttribute('data-decision-row'));
    expect(second).not.toEqual(first);
    expect(host.textContent).toContain('Page 2 of');
  });

  it('when the first page is shown, the previous control is out of bounds and says so', () => {
    const previous = host.querySelector<HTMLButtonElement>('[aria-label="Previous page"]')!;

    expect(previous.getAttribute('aria-disabled')).toBe('true');
  });

  it('when the active tab is not the decision log, there is nothing to paginate', () => {
    tab('positions-provenance').click();
    fixture.detectChanges();

    expect(host.querySelector('ui-pagination')).toBeNull();
  });

  // --- accessibility scaffolding -------------------------------------------

  it('when the page renders, a skip link reaches the content past the tab strip', () => {
    const skip = host.querySelector<HTMLAnchorElement>('a.skip-link');

    expect(skip?.getAttribute('href')).toBe('#report-content');
    expect(host.querySelector('#report-content')?.getAttribute('role')).toBe('tabpanel');
  });

  it('when the page renders, the heading level under the shell’s h1 is h2', () => {
    expect(host.querySelector('h1')).toBeNull();
    expect(host.querySelector('h2')?.textContent).toContain('Decision Log');
  });
});

describe('Report page, entered from a deep link', () => {
  it('when the URL names an agent and a range, the filters open on them', async () => {
    await TestBed.configureTestingModule({
      imports: [Report],
      providers: [provideRouter([]), ICON_PROVIDER],
    }).compileComponents();

    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as unknown as { queryParams: Record<string, string> }).queryParams = {
      agent: 'execution',
      range: 'today',
    };

    const fixture = TestBed.createComponent(Report);
    const host: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();

    expect(host.querySelector<HTMLSelectElement>('#report-agent-filter')!.value).toBe('execution');
    expect(host.querySelector<HTMLSelectElement>('#report-range-filter')!.value).toBe('today');
    expect(host.querySelector('app-collection-stat-bar')?.textContent).toContain(
      'Execution & Orders',
    );
  });

  it('when the URL names a value the page does not know, it is ignored', async () => {
    await TestBed.configureTestingModule({
      imports: [Report],
      providers: [provideRouter([]), ICON_PROVIDER],
    }).compileComponents();

    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as unknown as { queryParams: Record<string, string> }).queryParams = {
      agent: 'not-an-agent',
    };

    const fixture = TestBed.createComponent(Report);
    const host: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();

    expect(host.querySelector<HTMLSelectElement>('#report-agent-filter')!.value).toBe('all');
  });
});
