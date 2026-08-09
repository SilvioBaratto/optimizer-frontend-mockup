/**
 * The page as a whole: the six regions in reading order, the four states, and
 * the one claim the page exists to make — that nothing here can act.
 *
 * The chart components are stubbed for the same reason as in the detail panel's
 * own spec: ECharts wants a canvas and jsdom has none.
 */

import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { ProposedOrder } from '../../../models/order.model';
import { ExecutionService } from '../../../services/execution.service';
import { ExecutionAgent } from './execution-agent';
import { CostVarianceChart } from './order-detail-panel/cost-variance-chart';
import { OrderDetailPanel } from './order-detail-panel/order-detail-panel';
import { TrajectoryChart } from './order-detail-panel/trajectory-chart';

@Component({
  selector: 'app-execution-trajectory-chart',
  template: '<div data-testid="trajectory-chart"></div>',
})
class TrajectoryChartStub {
  readonly order = input.required<ProposedOrder>();
}

@Component({
  selector: 'app-execution-cost-variance-chart',
  template: '<div data-testid="cost-variance-chart"></div>',
})
class CostVarianceChartStub {
  readonly order = input.required<ProposedOrder>();
}

describe('ExecutionAgent page', () => {
  let fixture: ComponentFixture<ExecutionAgent>;
  let host: HTMLElement;
  let service: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExecutionAgent],
      providers: [provideRouter([])],
    })
      .overrideComponent(OrderDetailPanel, {
        remove: { imports: [TrajectoryChart, CostVarianceChart] },
        add: { imports: [TrajectoryChartStub, CostVarianceChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ExecutionAgent);
    host = fixture.nativeElement;
    service = TestBed.inject(ExecutionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('button'));
  }

  function buttonLabelled(text: string): HTMLButtonElement {
    const match = buttons().find((b) => (b.textContent ?? '').includes(text));
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  function rowToggles(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[data-order-toggle]'));
  }

  /** The symbol printed in each visible row, read off the table itself. */
  function rowSymbols(): string[] {
    return rowToggles().map((b) => b.querySelector('.font-medium')?.textContent?.trim() ?? '');
  }

  /** Expands the four-row preview, when there is anything left to expand. */
  function showAllRows(): void {
    buttons()
      .find((b) => b.textContent?.trim() === 'View full table')
      ?.click();
    fixture.detectChanges();
  }

  // --- regions --------------------------------------------------------------

  it('when the page renders, the six regions are present in reading order', () => {
    const markers = [
      '[data-testid="agent-status"]',
      '[data-testid="broker-banner"]',
      '#execution-symbol-search',
      '#proposed-orders',
      '#execution-run-trace',
    ].map((selector) => host.querySelector(selector));

    expect(markers.every((el) => el !== null)).toBe(true);

    const positions = markers.map((el) =>
      Array.prototype.indexOf.call(host.querySelectorAll('*'), el),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('when the page renders, the agent state is announced and paired with a word', () => {
    const status = host.querySelector('[data-testid="agent-status"]');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent).toContain('Idle');
    expect(status?.textContent).toContain('2026-08-01 09:14 UTC');
  });

  it('when the page renders, the toolbar states what the agent writes and what it may call', () => {
    const text = host.textContent ?? '';
    expect(text).toContain('proposed_orders');
    expect(text).toContain('All tools are read-only or pure-compute');
  });

  it('when the page renders, a skip link jumps past the toolbar to the orders', () => {
    const skip = host.querySelector('a.skip-link');
    expect(skip?.getAttribute('href')).toBe('#proposed-orders');
    expect(host.querySelector('#proposed-orders')).not.toBeNull();
  });

  it('when the page renders, the live counts match the proposed orders', () => {
    const text = host.textContent ?? '';
    expect(text).toContain('14 orders');
    expect(text).toContain('3 pending approval · 1 blocked');
  });

  it('when the page renders, headings start at h2 and skip no level on the way down', () => {
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName.slice(1)),
    );

    expect(levels.length).toBeGreaterThan(0);
    // The shell owns the <h1>; the page's own outline starts one level down.
    expect(Math.min(...levels)).toBe(2);
    expect(levels).not.toContain(1);
    // No heading may be more than one level deeper than the one before it.
    const jumps = levels.filter((level, i) => i > 0 && level > levels[i - 1] + 1);
    expect(jumps).toEqual([]);
  });

  // --- the page's whole point ----------------------------------------------

  it('when the page renders, no control approves, rejects or sends an order', () => {
    const acting = buttons().filter((b) =>
      /\b(approve|reject|send|place|execute|submit)\b/i.test(b.textContent ?? ''),
    );
    expect(acting).toEqual([]);
  });

  it('when an order is open, the only exits with real effect are cross-page links', async () => {
    rowToggles()[0].click();
    fixture.detectChanges();
    await fixture.whenStable();

    Array.from(host.querySelectorAll('[role="tab"]'))[2].dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    const acting = buttons().filter((b) =>
      /\b(approve|reject|send|place|execute|submit)\b/i.test(b.textContent ?? ''),
    );
    expect(acting).toEqual([]);

    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/approvals/approval-gate');
  });

  // --- filters --------------------------------------------------------------

  it('when a symbol is typed, the table narrows without touching the agent run', () => {
    const search = host.querySelector('#execution-symbol-search') as HTMLInputElement;
    search.value = 'AAPL';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(rowToggles()).toHaveLength(1);
    expect(host.textContent).toContain('1 of 14 orders');
    expect(host.querySelector('[data-testid="agent-status"]')?.textContent).toContain(
      '2026-08-01 09:14 UTC',
    );
  });

  it('when a stage is chosen, only orders at that stage remain', () => {
    const select = host.querySelector('#execution-stage-filter') as HTMLSelectElement;
    select.value = 'rule-validation';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    showAllRows();

    // EEM, LQD, SPY and GLD are the four the agent left in the rules engine.
    expect(rowSymbols().sort()).toEqual(['EEM', 'GLD', 'LQD', 'SPY']);
    expect(host.textContent).toContain('4 of 14 orders');
  });

  it('when a side is chosen, only orders on that side remain in the table', () => {
    const select = host.querySelector('#execution-side-filter') as HTMLSelectElement;
    select.value = 'sell';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    showAllRows();

    const sides = Array.from(host.querySelectorAll('tbody tr')).map((row) =>
      row.querySelector('td')?.textContent?.trim(),
    );
    expect(sides.length).toBeGreaterThan(0);
    expect(new Set(sides)).toEqual(new Set(['SELL']));
    expect(rowSymbols()).not.toContain('AAPL');
  });

  it('when filters are active, a control clears them and the controls follow', () => {
    const search = host.querySelector('#execution-symbol-search') as HTMLInputElement;
    const stage = host.querySelector('#execution-stage-filter') as HTMLSelectElement;
    search.value = 'TLT';
    search.dispatchEvent(new Event('input'));
    stage.value = 'human-gate';
    stage.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rowToggles()).toHaveLength(1);

    buttonLabelled('Clear filters').click();
    fixture.detectChanges();

    // A cleared filter that leaves "Human approval" showing in the select is
    // worse than no clear control at all.
    expect((host.querySelector('#execution-symbol-search') as HTMLInputElement).value).toBe('');
    expect((host.querySelector('#execution-stage-filter') as HTMLSelectElement).value).toBe('all');
    expect(host.textContent).toContain('14 orders');
    expect(rowToggles()).toHaveLength(4);
  });

  // --- states ---------------------------------------------------------------

  it('while the snapshot is being read, every filter control is disabled', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect((host.querySelector('#execution-symbol-search') as HTMLInputElement).disabled).toBe(true);
    expect((host.querySelector('#execution-stage-filter') as HTMLSelectElement).disabled).toBe(true);
    expect((host.querySelector('#execution-side-filter') as HTMLSelectElement).disabled).toBe(true);

    await pending;
  });

  it('while the snapshot is being read, the table is placeholder rows', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="orders-skeleton"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="run-log-skeleton"]')).not.toBeNull();

    await pending;
  });

  it('while the snapshot is being read, the toolbar stamp is a skeleton and marked busy', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    const status = host.querySelector('[data-testid="agent-status"]')!;
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.querySelector('app-skeleton-block')).not.toBeNull();
    // The stamp itself is gone rather than showing a value that is being replaced.
    expect(status.textContent).not.toContain('fund state read');

    await pending;
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="agent-status"]')?.getAttribute('aria-busy')).toBeNull();
  });

  it('when the snapshot is empty, both the table and the log say so', async () => {
    service.snapshotHasOrders.set(false);
    await service.refresh();
    fixture.detectChanges();

    expect(host.textContent).toContain('No orders proposed');
    expect(host.textContent).toContain('No run recorded');
  });

  it('when the snapshot read fails, the table is replaced and the trace is labelled stale', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('Could not read the fund-state snapshot');
    expect(host.querySelector('[data-testid="stale-trace-warning"]')).not.toBeNull();
  });

  it('when the snapshot is re-read, the last run is left where it was', async () => {
    await service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="agent-status"]')?.textContent).toContain(
      'last run 2026-08-01 09:14 UTC',
    );
  });

  // --- stale target ---------------------------------------------------------

  it('when the orders match the published target, no stale warning is shown', () => {
    expect(host.querySelector('[data-testid="stale-target-warning"]')).toBeNull();
  });

  it('when the fund state carries a newer target, the list is flagged as possibly stale', () => {
    service.latestTarget.set({
      id: 'balanced-growth-v4',
      label: 'Balanced Growth v4',
      publishedAt: '2026-08-01 09:58 UTC',
    });
    fixture.detectChanges();

    const warning = host.querySelector('[data-testid="stale-target-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute('role')).toBe('status');
    expect(warning?.textContent).toContain('Balanced Growth v3');
    expect(warning?.textContent).toContain('Balanced Growth v4');
  });

  it('when the snapshot is re-read, a stale-target warning does not quietly disappear', async () => {
    service.latestTarget.set({
      id: 'balanced-growth-v4',
      label: 'Balanced Growth v4',
      publishedAt: '2026-08-01 09:58 UTC',
    });
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="stale-target-warning"]')).not.toBeNull();

    // Refresh re-reads the snapshot; only a new agent run re-sizes the orders.
    await service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="stale-target-warning"]')).not.toBeNull();
  });

  // --- the shared trace disclosure -----------------------------------------

  it('when the toolbar trace link is used, the log panel expands the same trace', () => {
    const link = buttonLabelled('View full trace');
    expect(link.getAttribute('aria-expanded')).toBe('false');
    expect(link.getAttribute('aria-controls')).toBe('execution-run-trace');

    link.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="full-trace"]')).not.toBeNull();
    for (const control of buttons().filter((b) => b.textContent?.includes('View full trace'))) {
      expect(control.getAttribute('aria-expanded')).toBe('true');
    }
  });

  // --- row → panel → row ----------------------------------------------------

  it('when a row toggle is activated, the detail panel opens with focus on its heading', async () => {
    const toggle = rowToggles()[0];
    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('#execution-order-detail')).not.toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('detail-heading');
  });

  it('when the open panel is closed with Escape, focus returns to the row that opened it', async () => {
    const toggle = rowToggles()[0];
    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('#execution-order-detail')).toBeNull();
    expect(document.activeElement).toBe(rowToggles()[0]);
  });

  it('when the open panel is closed with its Close control, focus returns to the row', async () => {
    const toggle = rowToggles()[1];
    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    buttonLabelled('Close order detail').click();
    fixture.detectChanges();

    expect(host.querySelector('#execution-order-detail')).toBeNull();
    expect(document.activeElement).toBe(rowToggles()[1]);
  });

  it('when the panel is closed again, the rest of the page is left interactive', async () => {
    const toggle = rowToggles()[0];
    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    // A slide-over inerts what is behind it; closing has to undo that, or the
    // page stays unreachable to both pointer and screen reader.
    const inert = Array.from(document.body.children).filter((el) => el.hasAttribute('inert'));
    expect(inert).toEqual([]);
  });
});
