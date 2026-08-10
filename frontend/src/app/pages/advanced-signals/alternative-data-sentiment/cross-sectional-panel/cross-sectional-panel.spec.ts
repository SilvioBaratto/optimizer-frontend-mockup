/**
 * The conditional cross-section: both regimes are always drawn, the toggle
 * chooses which spread is read, and the index basis is a real change to the
 * numbers rather than a label on them.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { BarChartComponent, ChartPanelComponent } from '../../../../shared/charts';
import type { ChartTable } from '../../../../shared/charts';
import { AltDataCrossSectionalPanel } from './cross-sectional-panel';

@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3 data-testid="chart-title">{{ title() }}</h3>
        <p data-testid="chart-subtitle">{{ subtitle() }}</p>
      </figcaption>
      <div data-testid="chart-figure" role="img" [attr.aria-label]="ariaLabel() || title()"></div>
      @if (table(); as data) {
        <table data-testid="chart-table">
          <thead>
            <tr>
              @for (column of data.columns; track column) {
                <th>{{ column }}</th>
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

  protected readonly unused = signal(false);
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

describe('AltDataCrossSectionalPanel', () => {
  let fixture: ComponentFixture<AltDataCrossSectionalPanel>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AltDataCrossSectionalPanel] })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AltDataCrossSectionalPanel);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return (
      host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  function columns(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="chart-table"] thead th')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
  }

  function rows(): string[][] {
    return Array.from(host.querySelectorAll('[data-testid="chart-table"] tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''),
    );
  }

  function segment(testId: string, label: string): HTMLButtonElement {
    const control = host.querySelector(`[data-testid="${testId}"]`);
    const match = Array.from(control?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim().startsWith(label),
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  // --- the figure ------------------------------------------------------------

  it('when the panel renders, both regimes are drawn against the ten deciles', () => {
    expect(columns()).toEqual(['Decile', 'High sentiment', 'Low sentiment']);
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toEqual(['D1', '−0.31%', '+0.42%']);
    expect(rows()[9]).toEqual(['D10', '−0.44%', '+0.18%']);
  });

  it('when the regime toggle moves, the reading changes and both series stay', () => {
    expect(text('ads-spread-summary')).toContain('under high sentiment');

    segment('ads-regime-toggle', 'Low').click();
    fixture.detectChanges();

    expect(text('ads-spread-summary')).toContain('under low sentiment');
    expect(columns()).toEqual(['Decile', 'Low sentiment', 'High sentiment']);
    expect(rows()).toHaveLength(10);
  });

  it('when the low-sentiment spread is read, it is the wider of the two', () => {
    segment('ads-regime-toggle', 'Low').click();
    fixture.detectChanges();

    expect(text('ads-spread-summary')).toContain('−0.24%');
    expect(text('ads-spread-summary')).toContain('−0.13%');
  });

  // --- the index basis -------------------------------------------------------

  it('when the raw index is chosen, the conditional returns are attenuated', () => {
    segment('ads-basis-toggle', 'SENT —').click();
    fixture.detectChanges();

    expect(rows()[0][1]).toBe('−0.27%');
    expect(text('ads-basis-definition')).toContain('macroeconomic component included');
  });

  it('when either index is offered, the share of proxy variance it explains is on the control', () => {
    const options = host.querySelector('[data-testid="ads-basis-toggle"]')?.textContent ?? '';
    expect(options).toContain('49%');
    expect(options).toContain('53%');
  });

  // --- the firm characteristic -----------------------------------------------

  it('when a U-shaped characteristic is chosen, the panel says so in words', () => {
    const select = host.querySelector('[data-testid="ads-characteristic"]') as HTMLSelectElement;
    select.value = 'distress';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(service.characteristic()).toBe('distress');
    expect(text('ads-shape-note')).toContain('only the extreme deciles react');
    expect(rows()).toHaveLength(10);
  });

  it('when the figure is described, the reading is available as words as well as bars', () => {
    const label = host.querySelector('[data-testid="chart-figure"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('D1 high −0.31%, low +0.42%');
  });
});
