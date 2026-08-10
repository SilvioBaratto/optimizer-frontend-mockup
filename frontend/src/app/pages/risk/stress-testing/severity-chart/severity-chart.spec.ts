/**
 * The severity comparison: three scenarios, one radius, and a tabular
 * alternative that says exactly what the bars do.
 *
 * Only the chart *panel* is stubbed — ECharts wants a canvas and jsdom has
 * none. `BarChartComponent` itself is the real one, so the categories, the
 * series, the value formatter and the `[table]` the panel renders as "View as
 * table" are all built by production code.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import { STALE_RESULT_BADGE } from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { BarChartComponent, ChartPanelComponent } from '../../../../shared/charts';
import type { ChartTable } from '../../../../shared/charts';
import { SeverityChart } from './severity-chart';

@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3>{{ title() }}</h3>
        <p data-testid="panel-subtitle">{{ subtitle() }}</p>
        @if (table()) {
          <button type="button" [attr.aria-pressed]="showTable()" (click)="toggle()">
            {{ showTable() ? 'View as chart' : 'View as table' }}
          </button>
        }
      </figcaption>
      <div data-testid="chart-figure" role="img" [attr.aria-label]="ariaLabel() || title()">
        @if (showTable() && table(); as data) {
          <table data-testid="chart-table">
            <thead>
              <tr>
                @for (col of data.columns; track col) {
                  <th scope="col">{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of data.rows; track $index) {
                <tr>
                  @for (cell of row; track $index) {
                    <td>{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
      <ng-content />
    </figure>
  `,
})
class ChartPanelStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly options = input.required<EChartsCoreOption>();
  readonly loading = input(false);
  readonly height = input(320);
  readonly table = input<ChartTable | null>(null);

  protected readonly showTable = signal(false);

  protected toggle(): void {
    this.showTable.set(!this.showTable());
  }
}

function installResizeObserver(): void {
  if ('ResizeObserver' in globalThis) return;
  (globalThis as unknown as Record<string, unknown>)['ResizeObserver'] = class {
    observe(): void {
      /* no layout to observe */
    }
    unobserve(): void {
      /* no layout to observe */
    }
    disconnect(): void {
      /* no layout to observe */
    }
  };
}

describe('SeverityChart', () => {
  let fixture: ComponentFixture<SeverityChart>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SeverityChart] })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SeverityChart);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function ariaLabel(): string {
    return byTestId('chart-figure')?.getAttribute('aria-label') ?? '';
  }

  function showTable(): void {
    const toggle = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('View as table'),
    );
    expect(toggle).toBeTruthy();
    toggle!.click();
    fixture.detectChanges();
  }

  function tableText(): string {
    return byTestId('chart-table')?.textContent ?? '';
  }

  async function populate(): Promise<void> {
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    await service.evaluateManual();
    service.setFactorFixed('equity', false);
    await service.runWorstCase();
    fixture.detectChanges();
  }

  // --- the empty state -------------------------------------------------------

  it('when only the expected scenario exists, there is no comparison to draw', () => {
    expect(host.textContent).toContain('No scenario evaluated yet.');
    expect(host.textContent).toContain('Fix at least one factor');
    expect(byTestId('chart-figure')).toBeNull();
  });

  // --- populated -------------------------------------------------------------

  it('when both searches have run, the three scenarios are drawn at one and the same radius', async () => {
    await populate();

    expect(byTestId('panel-subtitle')?.textContent).toContain('Maha ≤ k = 5.00');
    expect(byTestId('severity-annotation')?.textContent).toContain('Maximum Loss');
  });

  it('when the figure is read as a table, it shows the same three readings the bars do', async () => {
    await populate();
    showTable();

    expect(tableText()).toContain('Expected (μ)');
    expect(tableText()).toContain('+4.2% RWA');
    expect(tableText()).toContain('Manual');
    expect(tableText()).toContain('+1.1% RWA');
    expect(tableText()).toContain('Worst case');
    expect(tableText()).toContain('−2.4% RWA');
  });

  it('when the figure is read by a screen reader, the label summarises the current reading', async () => {
    await populate();

    expect(ariaLabel()).toContain('k = 5.00');
    expect(ariaLabel()).toContain('Expected (μ) +4.2% RWA');
    expect(ariaLabel()).toContain('Worst case −2.4% RWA');
    expect(ariaLabel()).toContain('maximum loss');
  });

  // --- the central rule ------------------------------------------------------

  it('when a parameter moves, the figure is badged stale in words and no bar changes', async () => {
    await populate();
    showTable();
    const before = tableText();

    service.setK(7);
    fixture.detectChanges();

    expect(tableText()).toBe(before);
    expect(byTestId('severity-stale')?.textContent).toContain(STALE_RESULT_BADGE);
    expect(byTestId('severity-stale')?.textContent).toContain('Worst case');
    expect(ariaLabel()).toContain('not up to date');
  });

  it('when the radius moves, the figure keeps naming the radius its bars were computed at', async () => {
    await populate();
    expect(byTestId('panel-subtitle')?.textContent).toContain('Maha ≤ k = 5.00');

    service.setK(9);
    fixture.detectChanges();

    // The bars did not move, so the caption must not claim they are at 9.00 —
    // the same rule that stops the unit being relabelled applies to the radius.
    expect(byTestId('panel-subtitle')?.textContent).toContain('Maha ≤ k = 5.00');
    expect(byTestId('panel-subtitle')?.textContent).not.toContain('9.00');
    expect(ariaLabel()).toContain('k = 5.00');
    expect(ariaLabel()).not.toContain('9.00');
  });

  it('when only one result has been re-run at a new radius, each bar carries its own k', async () => {
    await populate();
    service.setK(9);
    await service.runWorstCase();
    fixture.detectChanges();
    showTable();

    // The manual bar is still the one computed at 5.00; the worst case is now
    // at 9.00. No single radius describes the figure, so none is claimed.
    expect(tableText()).toContain('Manual (k = 5.00)');
    expect(tableText()).toContain('Worst case (k = 9.00)');
    expect(byTestId('panel-subtitle')?.textContent).toContain(
      'the radius each scenario was searched at',
    );
    expect(ariaLabel()).toContain('at the radius it was searched at');
  });

  it('while a manual evaluation runs, the figure keeps its bars rather than blanking', async () => {
    await populate();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -12);
    const pending = service.evaluateManual();
    fixture.detectChanges();

    // `### Stati` puts the skeleton on the Manual card for this action, not on
    // the figure: two of the three bars are not being recomputed at all.
    expect(byTestId('severity-skeleton')).toBeNull();
    expect(byTestId('chart-figure')).not.toBeNull();

    await pending;
    fixture.detectChanges();
  });

  it('when only one result has been re-run under a new measure, each bar keeps its own unit', async () => {
    await service.runWorstCase();
    service.setImpactMeasure('asset-values');
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    await service.evaluateManual();
    fixture.detectChanges();
    showTable();

    // The units have split, so each bar carries its own rather than borrowing
    // the one the toolbar happens to show.
    expect(tableText()).toContain('Worst case (% RWA)');
    expect(tableText()).toContain('Manual (% NAV)');
  });

  // --- loading ---------------------------------------------------------------

  it('while a search runs, the figure is a placeholder at its own height', async () => {
    await populate();
    const pending = service.runWorstCase();
    fixture.detectChanges();

    expect(byTestId('severity-skeleton')?.getAttribute('aria-busy')).toBe('true');
    expect(byTestId('chart-figure')).toBeNull();

    await pending;
    fixture.detectChanges();
    expect(byTestId('chart-figure')).not.toBeNull();
  });
});
