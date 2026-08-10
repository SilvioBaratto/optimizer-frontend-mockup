/**
 * The probability path.
 *
 * The chart is stubbed: ECharts wants a canvas and jsdom has none. The stub
 * renders what it was handed — the accessible label, the band names, the ends
 * of each band through the chart's own formatter, and whether it was told to
 * stack — so the cases below still read what a user gets rather than a signal
 * the component owns.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { ProbabilityPath } from './probability-path';

@Component({
  selector: 'app-line-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-title]="title()"
      [attr.data-chart-subtitle]="subtitle()"
      [attr.data-stacked]="stack()"
      [attr.data-zoomable]="zoomable()"
    >
      <span data-testid="chart-bands">{{ bands() }}</span>
      <span data-testid="chart-extent">{{ extent() }}</span>
      <ng-content />
    </div>
  `,
})
class LineChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly x = input.required<readonly (string | number)[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly stack = input(false);
  readonly area = input(false);
  readonly zoomable = input(false);
  readonly zoomStart = input(0);
  readonly optionPatch = input<Record<string, unknown>>({});
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);

  /** Each band and its last reading, spelled with the panel's own formatter. */
  protected readonly bands = computed(() => {
    const format = this.valueFormatter();
    return this.series()
      .map((band) => `${band.name}=${format(band.data[band.data.length - 1] ?? 0)}`)
      .join(' | ');
  });

  protected readonly extent = computed(() => {
    const x = this.x();
    return `${x[0]}…${x[x.length - 1]} (${x.length})`;
  });
}

describe('ProbabilityPath', () => {
  let fixture: ComponentFixture<ProbabilityPath>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProbabilityPath] })
      .overrideComponent(ProbabilityPath, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProbabilityPath);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  }

  function attr(name: string): string {
    return host.querySelector(`[${name}]`)?.getAttribute(name) ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the figure -----------------------------------------------------------

  it('when the path renders, it is a stacked band per state of the selected model', () => {
    expect(attr('data-stacked')).toBe('true');
    expect(text('chart-bands')).toBe('Crash=58% | Slow Growth=20% | Bull=12% | Recovery=10%');
  });

  it('when the path renders, it spans the whole estimation sample', () => {
    expect(text('chart-extent')).toBe('1990-01…2026-07 (439)');
    // Four hundred monthly points is more than a phone has pixels; the window
    // opens on the recent stretch and the slider reaches the rest.
    expect(attr('data-zoomable')).toBe('true');
  });

  it('when the path renders, its title names the basis it was read on', async () => {
    expect(attr('data-chart-title')).toBe('Probability path — filtered');
    expect(attr('data-chart-subtitle')).toContain('1990-01 → 2026-07');

    service.setProbabilityBasis('smoothed');
    await settle();
    expect(attr('data-chart-title')).toBe('Probability path — smoothed');
  });

  it('when the path renders, its label states the model, the extent and the last reading', () => {
    const label = attr('data-aria-label');
    expect(label).toContain('Filtered probability of each of the 4 states');
    expect(label).toContain('stacked to 100% at every month');
    expect(label).toContain('from 1990-01 to 2026-07 over 439 months');
    expect(label).toContain('At 2026-07 the reading is Crash 58%, Slow Growth 20%, Bull 12%, Recovery 10%');
  });

  it('when the path renders, the underlying data table is offered rather than duplicated', () => {
    // The panel supplies its own "View as table"; the note points at it, and
    // there is no second table hand-rolled beside the figure.
    expect(host.textContent).toContain('“View as table” above opens the underlying data table');
    expect(host.querySelector('table')).toBeNull();
  });

  // --- the model decides how many bands there are ---------------------------

  it('when the regime model drops to two states, the path drops to two bands', async () => {
    service.setModel('hamilton');
    await settle();

    expect(text('chart-bands')).toBe('Recession=61% | Expansion=39%');
    expect(attr('data-aria-label')).toContain('each of the 2 states');
  });

  // --- the empty combination ------------------------------------------------

  it('when no combination can be estimated, the figure is replaced by the same explanation', async () => {
    service.setUniverse('em-equities');
    await settle();

    expect(text('mr-path-empty')).toContain('No data for this combination');
    expect(host.querySelector('[data-testid="chart-bands"]')).toBeNull();
  });
});
