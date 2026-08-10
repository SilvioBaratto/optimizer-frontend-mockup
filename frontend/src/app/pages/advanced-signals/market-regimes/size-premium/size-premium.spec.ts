/**
 * The size premium by regime.
 *
 * One case matters more than any other here: Recovery has no estimate, and
 * "no estimate" has to be visibly and textually different from "zero". The bar
 * chart is stubbed so the test can read what the panel actually handed it — a
 * `null` in the measured series, and a hatched marker series carrying the
 * absence — rather than a rendering of it.
 *
 * The other line held here is that this panel never leaves the four-state VAR
 * taxonomy, whatever the toolbar's Regime model is set to.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BarChartComponent, chartTokens, seriesColor } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { SizePremium } from './size-premium';

@Component({
  selector: 'app-bar-chart',
  template: `
    <div
      [attr.data-chart-title]="title()"
      [attr.data-chart-subtitle]="subtitle()"
      [attr.data-aria-label]="ariaLabel()"
    >
      <span data-testid="chart-cells">{{ cells() }}</span>
      <span data-testid="chart-patterned">{{ patterned() }}</span>
      <span data-testid="chart-patterned-colour">{{ patternedColour() }}</span>
      <ng-content />
    </div>
  `,
})
class BarChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly unavailableLabel = input('not available');
  readonly valueMax = input<number | undefined>(undefined);
  readonly categoryAxisName = input('');
  readonly valueAxisName = input('');
  readonly height = input(320);

  /** Exactly what each bar would print, nulls included. */
  protected readonly cells = computed(() => {
    const format = this.valueFormatter();
    return this.categories()
      .map((category, index) => {
        const drawn = this.series()
          .map((series) => {
            const value = series.data[index];
            const label =
              value === null || value === undefined ? this.unavailableLabel() : format(value);
            return `${series.name}=${label}${value !== null && value !== undefined && series.pattern ? '(hatched)' : ''}`;
          })
          .join(', ');
        return `${category} [${drawn}]`;
      })
      .join(' | ');
  });

  /** Which categories carry a hatched bar at all. */
  protected readonly patterned = computed(() =>
    this.categories()
      .filter((_, index) =>
        this.series().some((series) => series.pattern === true && series.data[index] !== null),
      )
      .join(','),
  );

  /** What the hatched series' legend swatch would be drawn in. */
  protected readonly patternedColour = computed(
    () => this.series().find((series) => series.pattern === true)?.color ?? '',
  );
}

describe('SizePremium', () => {
  let fixture: ComponentFixture<SizePremium>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SizePremium] })
      .overrideComponent(SizePremium, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SizePremium);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the measured regimes -------------------------------------------------

  it('when the panel renders, each measured regime carries its premium in basis points', () => {
    expect(text('chart-cells')).toContain('Crash [Small − Large, bp/month=+100 bp');
    expect(text('chart-cells')).toContain('Slow Growth [Small − Large, bp/month=−61 bp');
    expect(text('chart-cells')).toContain('Bull [Small − Large, bp/month=+71 bp');
  });

  it('when the panel renders, the spread is taken over the regimes that have an estimate', () => {
    expect(text('mr-size-spread')).toContain('161 bp');
  });

  // --- the regime that has none ---------------------------------------------

  it('when a regime has no estimate, its bar is a gap and never a zero', () => {
    expect(text('chart-cells')).toContain('Recovery [Small − Large, bp/month=—');
    expect(text('chart-cells')).not.toContain('Small − Large, bp/month=+0 bp');
  });

  it('when a regime has no estimate, the hatched marker sits on it and on no other', () => {
    expect(text('chart-patterned')).toBe('Recovery');
    expect(text('chart-cells')).toContain('Not specified=—(hatched)');
  });

  it('when a regime has no estimate, its legend swatch is the hatch and not a state colour', () => {
    // Left to the palette the marker series took `seriesColor(1)` — a solid
    // green that appears on no bar, and the very colour the hero card gives the
    // Slow Growth state. The swatch has to be the colour the hatch is drawn in.
    expect(text('chart-patterned-colour')).toBe(chartTokens().neutral);
    expect([0, 1, 2, 3].map((index) => seriesColor(index))).not.toContain(
      text('chart-patterned-colour'),
    );
  });

  it('when a regime has no estimate, it is stated in text as well as hatched', () => {
    const stated = host.querySelector('[data-unmeasured="Recovery"]')?.textContent ?? '';
    expect(stated).toContain('not specified in the domain substance');
    expect(stated).toContain('it is not a premium of zero');
  });

  it('when the figure is described, the absent regime is described as absent', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('Crash +100 bp, Slow Growth −61 bp, Bull +71 bp');
    expect(label).toContain(
      'Recovery is not specified in the domain substance and is drawn as a hatched bar, not as a zero',
    );
    expect(label).toContain('spread between the highest and the lowest measured regime is 161 bp');
  });

  // --- the taxonomy never moves ---------------------------------------------

  it('when the regime model drops to two states, this panel keeps its four regimes', async () => {
    service.setModel('hamilton');
    await settle();

    expect(text('chart-cells')).toContain('Crash [');
    expect(text('chart-cells')).toContain('Slow Growth [');
    expect(text('chart-cells')).toContain('Bull [');
    expect(text('chart-cells')).toContain('Recovery [');
    expect(text('chart-cells')).not.toContain('Recession');
    expect(text('chart-cells')).not.toContain('Expansion');
    expect(
      host.querySelector('[data-chart-subtitle]')?.getAttribute('data-chart-subtitle'),
    ).toContain("the toolbar's Regime model does not change this panel");
  });
});
