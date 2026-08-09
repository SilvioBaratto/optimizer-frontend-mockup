/**
 * The four-tab detail panel.
 *
 * The two chart components are swapped for stubs: ECharts initialises a canvas,
 * jsdom has none, and a chart that cannot paint tells us nothing about the
 * tablist, the focus move or the read-only contract, which is what this file is
 * actually about.
 */

import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { ProposedOrder } from '../../../../models/order.model';
import { ExecutionService } from '../../../../services/execution.service';
import { CostVarianceChart } from './cost-variance-chart';
import { OrderDetailPanel } from './order-detail-panel';
import { TrajectoryChart } from './trajectory-chart';

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

/** AAPL BUY +12,400 — priced, scheduled, pending at the human gate. */
const SCHEDULED = 'TRD-2031';
/** HYG SELL −3,200 — no volume profile, so no schedule and no estimates. */
const UNSCHEDULED = 'TRD-2036';

describe('OrderDetailPanel', () => {
  let fixture: ComponentFixture<OrderDetailPanel>;
  let host: HTMLElement;
  let service: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderDetailPanel],
      providers: [provideRouter([])],
    })
      .overrideComponent(OrderDetailPanel, {
        remove: { imports: [TrajectoryChart, CostVarianceChart] },
        add: { imports: [TrajectoryChartStub, CostVarianceChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(OrderDetailPanel);
    host = fixture.nativeElement;
    service = TestBed.inject(ExecutionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  async function open(id = SCHEDULED): Promise<void> {
    service.selectedOrderId.set(id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function tabs(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[role="tab"]'));
  }

  function selectedTab(): HTMLButtonElement | undefined {
    return tabs().find((t) => t.getAttribute('aria-selected') === 'true');
  }

  function press(target: HTMLElement, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  // --- opening --------------------------------------------------------------

  it('when no order is selected, the panel is absent from the document', () => {
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('when a row is selected, the panel opens naming the order it belongs to', async () => {
    await open();
    expect(host.querySelector('[data-testid="detail-heading"]')?.textContent?.trim()).toBe(
      'AAPL BUY +12,400',
    );
  });

  it('when the panel opens, focus moves to its heading rather than its first control', async () => {
    await open();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('detail-heading');
  });

  it('when the panel opens, the row toggle can point at it by id', async () => {
    await open();
    expect(host.querySelector('#execution-order-detail')).not.toBeNull();
  });

  it('when the panel opens, the dialog itself names the order it belongs to', async () => {
    await open();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Proposed order detail — AAPL BUY +12,400',
    );
  });

  it('when Close is activated, the selection is cleared and the panel goes away', async () => {
    await open();
    const close = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close order detail'),
    )!;
    close.click();
    fixture.detectChanges();

    expect(service.selectedOrderId()).toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  // --- the tablist ----------------------------------------------------------

  it('when the panel opens, the four sections are a tablist', async () => {
    await open();
    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs().map((t) => t.textContent?.trim())).toEqual([
      'Trajectory',
      'Cost–Variance Frontier',
      'Pipeline & Approval',
      'Impact Parameters',
    ]);
  });

  it('when the panel opens, only the selected tab is in the page tab order', async () => {
    await open();
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
  });

  it('when a tab is selected, exactly one tabpanel exists and it is the matching one', async () => {
    await open();
    const panels = host.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe('execution-detail-panel-trajectory');
    expect(panels[0].getAttribute('aria-labelledby')).toBe('execution-detail-tab-trajectory');
  });

  it('when another tab is chosen, the previous tabpanel is removed rather than hidden', async () => {
    await open();
    tabs()[2].click();
    fixture.detectChanges();

    const panels = host.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe('execution-detail-panel-pipeline');
    expect(host.querySelector('[data-testid="trajectory-chart"]')).toBeNull();
  });

  it('when ArrowRight is pressed on a tab, the next tab is selected and focused', async () => {
    await open();
    tabs()[0].focus();
    press(tabs()[0], 'ArrowRight');

    expect(selectedTab()?.textContent?.trim()).toBe('Cost–Variance Frontier');
    expect(document.activeElement).toBe(tabs()[1]);
  });

  it('when ArrowLeft is pressed on the first tab, selection wraps to the last', async () => {
    await open();
    tabs()[0].focus();
    press(tabs()[0], 'ArrowLeft');

    expect(selectedTab()?.textContent?.trim()).toBe('Impact Parameters');
    expect(document.activeElement).toBe(tabs()[3]);
  });

  it('when End is pressed on a tab, the last tab is selected and focused', async () => {
    await open();
    tabs()[0].focus();
    press(tabs()[0], 'End');

    expect(selectedTab()?.textContent?.trim()).toBe('Impact Parameters');
    expect(document.activeElement).toBe(tabs()[3]);
  });

  it('when Home is pressed on a tab, the first tab is selected and focused', async () => {
    await open();
    tabs()[3].focus();
    press(tabs()[3], 'Home');

    expect(selectedTab()?.textContent?.trim()).toBe('Trajectory');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('when the tablist moves, tabbability moves with the selection', async () => {
    await open();
    tabs()[0].focus();
    press(tabs()[0], 'ArrowRight');

    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
  });

  it('when a different order is opened, the panel returns to the first tab', async () => {
    await open();
    tabs()[3].click();
    fixture.detectChanges();

    service.selectedOrderId.set(null);
    fixture.detectChanges();
    await open('TRD-2028');

    expect(selectedTab()?.textContent?.trim()).toBe('Trajectory');
  });

  // --- tab content ----------------------------------------------------------

  it('when the Trajectory tab is shown, the chart is rendered for the selected order', async () => {
    await open();
    expect(host.querySelector('[data-testid="trajectory-chart"]')).not.toBeNull();
  });

  it('when the order has no schedule, the Trajectory tab explains it instead of drawing', async () => {
    await open(UNSCHEDULED);
    expect(host.querySelector('[data-testid="trajectory-chart"]')).toBeNull();
    expect(host.querySelector('[role="tabpanel"]')?.textContent).toContain(
      'No trajectory was solved for this order',
    );
  });

  it('when the order has no estimates, the frontier tab refuses to place it on a curve', async () => {
    await open(UNSCHEDULED);
    tabs()[1].click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="cost-variance-chart"]')).toBeNull();
    expect(host.querySelector('[role="tabpanel"]')?.textContent).toContain(
      'no point on the frontier',
    );
  });

  it('when the Pipeline tab is shown, all four steps are listed with a state in words', async () => {
    await open();
    tabs()[2].click();
    fixture.detectChanges();

    const steps = Array.from(host.querySelectorAll('[data-pipeline-step]'));
    expect(steps).toHaveLength(4);
    expect(steps[0].textContent).toContain('Passed');
    expect(steps[2].textContent).toContain('Pending approval');
  });

  it('when the order is still at an automated step, that step is not called "Pending approval"', async () => {
    // XLE sits at the deterministic pre-trade check with nobody asked for anything.
    await open('TRD-2039');
    tabs()[2].click();
    fixture.detectChanges();

    const first = host.querySelector('[data-pipeline-step="pre-trade"]');
    expect(first?.textContent).toContain('In progress');
    expect(first?.textContent).not.toContain('Pending approval');
    // …and the step that really is waiting on a person has not been reached.
    expect(host.querySelector('[data-pipeline-step="human-gate"]')?.textContent).toContain(
      'Not reached',
    );
  });

  it('when no broker is configured, the fourth step says the order stops at the gate', async () => {
    await open();
    tabs()[2].click();
    fixture.detectChanges();

    const broker = host.querySelector('[data-pipeline-step="broker-adapter"]');
    expect(broker?.textContent).toContain('Not configured');
    expect(broker?.textContent).toContain('stops after the human gate');
  });

  it('when a broker is connected, the fourth step stops claiming the order is stuck', async () => {
    service.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });
    await open();
    tabs()[2].click();
    fixture.detectChanges();

    expect(host.querySelector('[data-pipeline-step="broker-adapter"]')?.textContent).not.toContain(
      'Not configured',
    );
  });

  it('when the Pipeline tab is shown, both cross-page exits are offered as links', async () => {
    await open();
    tabs()[2].click();
    fixture.detectChanges();

    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/approvals/approval-gate');
    expect(hrefs).toContain('/approvals/guardrail-killswitch');
  });

  it('when the Impact tab is shown, the three impact parameters are printed', async () => {
    await open();
    tabs()[3].click();
    fixture.detectChanges();

    const text = host.querySelector('[role="tabpanel"]')?.textContent ?? '';
    expect(text).toContain('3.1e-7');
    expect(text).toContain('2.4e-6');
    expect(text).toContain('12 min');
  });

  // --- the read-only contract ----------------------------------------------

  it('on every tab, no control approves, rejects or sends the order', async () => {
    await open();
    for (let i = 0; i < 4; i++) {
      tabs()[i].click();
      fixture.detectChanges();

      const acting = Array.from(host.querySelectorAll('button')).filter((b) =>
        /\b(approve|reject|send|place|execute|submit)\b/i.test(b.textContent ?? ''),
      );
      expect(acting).toEqual([]);
    }
  });
});
