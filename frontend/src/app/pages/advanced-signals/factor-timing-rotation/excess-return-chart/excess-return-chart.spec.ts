/**
 * The rolling excess-return panel.
 *
 * The legend is the interesting part: the spec asks for a chip that isolates or
 * hides a line, and the accessibility section asks for the whole page to work
 * from the keyboard. A canvas legend can do neither, so the chips are buttons
 * and the tests press them rather than poking a signal.
 *
 * The other case is the spec's edge condition — one line left is not an error,
 * and hiding the last one is refused.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FactorTimingService } from '../../../../services/factor-timing.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { ExcessReturnChart } from './excess-return-chart';

@Component({
  selector: 'app-line-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()">
      <span data-testid="chart-series">{{ names() }}</span>
      <span data-testid="chart-colours">{{ colours() }}</span>
      <span data-testid="chart-first">{{ first() }}</span>
      <span data-testid="chart-x">{{ x().length }}</span>
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
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly showLegend = input<boolean | undefined>(undefined);
  readonly height = input(320);

  protected readonly names = computed(() => this.series().map((entry) => entry.name).join(','));

  protected readonly colours = computed(() =>
    this.series().map((entry) => `${entry.name}=${entry.color ?? 'palette'}`).join(','),
  );

  /** The first plotted point of the first line — `—` when it is a gap. */
  protected readonly first = computed(() => {
    const value = this.series()[0]?.data[0];
    return value === null || value === undefined ? '—' : String(value);
  });
}

describe('ExcessReturnChart', () => {
  let fixture: ComponentFixture<ExcessReturnChart>;
  let host: HTMLElement;
  let service: FactorTimingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExcessReturnChart] })
      .overrideComponent(ExcessReturnChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ExcessReturnChart);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function chip(factor: string): HTMLButtonElement {
    return host.querySelector(`[data-legend-chip="${factor}"]`) as HTMLButtonElement;
  }

  function press(element: HTMLElement): void {
    element.click();
    fixture.detectChanges();
  }

  // --- the figure -----------------------------------------------------------

  it('when the panel renders, one line per factor in view spans the whole axis', () => {
    expect(text('chart-x')).toBe('37');
    expect(text('chart-series')).toBe('Value,Momentum,Size,Quality,Low Vol,Profitability');
  });

  it('when a factor has no history that far back, the first point is a gap and not a zero', async () => {
    service.setFactorsInView(['profitability', 'value']);
    await service.settled();
    fixture.detectChanges();

    // Profitability leads the view and its 1990 point is a gap.
    expect(text('chart-series')).toBe('Value,Profitability');
    const profitability = service
      .excessReturnSeries()
      .find((entry) => entry.factor === 'profitability');
    expect(profitability?.values[0]).toBeNull();
  });

  // --- the legend -----------------------------------------------------------

  it('when the panel renders, every legend chip is a pressed button', () => {
    expect(chip('value').getAttribute('aria-pressed')).toBe('true');
    expect(chip('low-vol').getAttribute('aria-pressed')).toBe('true');
  });

  it('when a chip is pressed, its line leaves the chart and the button says so', () => {
    press(chip('momentum'));

    expect(chip('momentum').getAttribute('aria-pressed')).toBe('false');
    expect(text('chart-series')).not.toContain('Momentum');
    expect(text('chart-series')).toContain('Value');
  });

  it('when a line is hidden, the lines that stay keep the colours they had', () => {
    const colourOf = (factor: string): string => {
      const entry = text('chart-colours')
        .split(',')
        .find((part) => part.startsWith(`${factor}=`));
      return entry?.split('=')[1] ?? '';
    };

    const before = ['Momentum', 'Size', 'Low Vol'].map(colourOf);
    expect(before.every((colour) => colour !== '' && colour !== 'palette')).toBe(true);

    // The chart colours by series index, so filtering the hidden line out used
    // to shift every line below it onto its neighbour's colour.
    press(chip('value'));

    expect(['Momentum', 'Size', 'Low Vol'].map(colourOf)).toEqual(before);
  });

  it('when a chip renders, it carries the colour of the line it controls', () => {
    const swatch = host.querySelector<HTMLElement>('[data-legend-swatch="size"]');
    const colour = text('chart-colours')
      .split(',')
      .find((part) => part.startsWith('Size='))
      ?.split('=')[1];

    expect(colour).toBeTruthy();
    expect(swatch?.style.backgroundColor).toBeTruthy();
    // Hidden lines drop the fill, so the swatch never reports a line as drawn
    // when it is not — the glyph beside it carries the state without colour.
    press(chip('size'));
    expect(host.querySelector<HTMLElement>('[data-legend-swatch="size"]')?.style.backgroundColor).toBe(
      'transparent',
    );
  });

  it('when a chip is isolated, only that line is left', () => {
    press(host.querySelector('[data-legend-isolate="low-vol"]') as HTMLElement);

    expect(text('chart-series')).toBe('Low Vol');
    expect(chip('value').getAttribute('aria-pressed')).toBe('false');
  });

  it('when only one line is left, the panel says so rather than reporting an error', () => {
    press(host.querySelector('[data-legend-isolate="value"]') as HTMLElement);

    expect(text('ft-single-line-hint')).toContain('Add another factor to compare');
    expect(host.querySelector('[data-testid="ft-single-line-hint"]')?.getAttribute('role')).toBe(
      'status',
    );
  });

  it('when the last visible line would be hidden, the press is refused', () => {
    press(host.querySelector('[data-legend-isolate="value"]') as HTMLElement);
    expect(chip('value').getAttribute('aria-disabled')).toBe('true');

    press(chip('value'));

    expect(text('chart-series')).toBe('Value');
    expect(chip('value').getAttribute('aria-pressed')).toBe('true');
  });

  it('when Show all is pressed, every line comes back', () => {
    press(host.querySelector('[data-legend-isolate="value"]') as HTMLElement);
    press(host.querySelector('[data-testid="ft-legend-show-all"]') as HTMLElement);

    expect(text('chart-series')).toBe('Value,Momentum,Size,Quality,Low Vol,Profitability');
    expect(host.querySelector('[data-testid="ft-single-line-hint"]')).toBeNull();
  });

  // --- the description ------------------------------------------------------

  it('when the figure is described, the description names the lines actually drawn', () => {
    press(host.querySelector('[data-legend-isolate="size"]') as HTMLElement);

    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('1 factor lines');
    expect(label).toContain('Size');
    expect(label).not.toContain('Quality');
  });
});
