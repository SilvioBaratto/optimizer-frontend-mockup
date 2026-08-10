/**
 * The aggregate against its best single component: the weighting selector moves
 * the Sharpe ratios and leaves the out-of-sample R² alone, because the two
 * answer different questions.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { BarChartComponent, ChartPanelComponent } from '../../../../shared/charts';
import type { ChartTable } from '../../../../shared/charts';
import { AltDataMlAggregationPanel } from './ml-aggregation-panel';

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

describe('AltDataMlAggregationPanel', () => {
  let fixture: ComponentFixture<AltDataMlAggregationPanel>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AltDataMlAggregationPanel] })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AltDataMlAggregationPanel);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return (
      host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  function rows(): string[][] {
    return Array.from(host.querySelectorAll('[data-testid="chart-table"] tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''),
    );
  }

  function segment(label: string): HTMLButtonElement {
    const control = host.querySelector('[data-testid="ads-score-weighting"]');
    const match = Array.from(control?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim().startsWith(label),
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  it('when the panel renders, the aggregate is read against its best single component', () => {
    expect(rows()).toEqual([
      ['NN3 aggregate', '1.35'],
      ['Best component — 3-characteristic linear', '0.61'],
    ]);
  });

  it('when the weighting changes, the Sharpe ratios move and the R² does not', () => {
    expect(text('chart-subtitle')).toContain('0.40%');

    segment('Equal-weighted').click();
    fixture.detectChanges();

    expect(rows()[0][1]).toBe('2.45');
    expect(rows()[1][1]).toBe('0.83');
    expect(text('chart-subtitle')).toContain('0.40%');
    expect(text('chart-subtitle')).toContain('0.13%');
  });

  it('when the figure is described, the two measures are named and not mixed on one axis', () => {
    const label = host.querySelector('[data-testid="chart-figure"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Sharpe 1.35');
    expect(label).toContain('R² out of sample 0.40%');
  });

  it('when a model row is picked, the panel reads it against the aggregate', () => {
    // The live region is mounted and empty before anything is picked — created
    // together with its text, it would never be announced.
    const note = host.querySelector('[data-testid="ads-selected-model-note"]');
    expect(note).not.toBeNull();
    expect(note?.getAttribute('role')).toBe('status');
    expect(note?.textContent?.trim()).toBe('');

    (host.querySelector('[data-model-row="elastic-net"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.selectedModelId()).toBe('elastic-net');
    expect(text('ads-selected-model-note')).toContain('Elastic net');
    expect(text('ads-selected-model-note')).toContain('weight 8%');
  });

  it('when the candidate table is on screen, it is the same table the tab is about', () => {
    expect(host.querySelectorAll('[data-model]')).toHaveLength(7);
  });
});
