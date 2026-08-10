import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  EXCESS_RETURN_WINDOW_YEARS,
  FACTOR_IDS,
  SINGLE_LINE_HINT,
  type FactorId,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { LineChartComponent, seriesColor } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { signedPercent1 } from '../factor-timing-format';

const CHART_HEIGHT = 300;

/**
 * Region 4 — the rolling excess return of each factor against the market.
 *
 * The measure of factor cyclicality, and the reason there is a page here at
 * all: the premia move in long, unsynchronised cycles, so a fixed sleeve is
 * already timing them, only without knowing it.
 *
 * The legend is a row of real buttons rather than the chart's own, and the
 * reason is that the chart's legend lives inside a canvas: it cannot take
 * focus, cannot be reached by Tab and announces nothing. These carry
 * `aria-pressed`, so the state of each line is announced and the whole thing
 * works from the keyboard.
 *
 * Hiding the last visible line is refused rather than allowed and recovered
 * from — an empty chart is not a reading. When only one line is left the panel
 * says so and suggests adding another, which is the spec's edge case: a single
 * line is not an error, it is just not a comparison.
 */
@Component({
  selector: 'app-factor-timing-excess-return',
  imports: [LineChartComponent],
  templateUrl: './excess-return-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExcessReturnChart {
  private readonly service = inject(FactorTimingService);

  protected readonly height = CHART_HEIGHT;
  protected readonly windowYears = EXCESS_RETURN_WINDOW_YEARS;
  protected readonly singleLineHint = SINGLE_LINE_HINT;

  /** Lines the reader has hidden. Never allowed to cover everything in view. */
  private readonly hidden = signal<readonly FactorId[]>([]);

  protected readonly years = computed(() => this.service.excessReturnYears().map(String));

  private readonly allSeries = this.service.excessReturnSeries;

  protected readonly visibleFactors = computed(() => {
    const hidden = this.hidden();
    return this.allSeries()
      .map((entry) => entry.factor)
      .filter((factor) => !hidden.includes(factor));
  });

  /**
   * A factor's colour, fixed to the factor and not to its position in the plot.
   *
   * The chart colours its series by index, and the series handed to it are the
   * *visible* ones — so hiding Value used to hand Momentum Value's colour, and
   * every line below it shifted one slot. A reader who pressed one chip watched
   * four unrelated lines change colour. Keying the palette to the factor's
   * place in the fixed universe makes a line's colour a property of the line.
   */
  private readonly colours = computed(() => {
    const map = new Map<FactorId, string>();
    FACTOR_IDS.forEach((factor, index) => map.set(factor, seriesColor(index)));
    return map;
  });

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const visible = this.visibleFactors();
    const colours = this.colours();
    return this.allSeries()
      .filter((entry) => visible.includes(entry.factor))
      .map((entry) => ({
        name: entry.label,
        data: entry.values,
        color: colours.get(entry.factor),
      }));
  });

  protected readonly chips = computed(() => {
    const visible = this.visibleFactors();
    const colours = this.colours();
    const onlyOne = visible.length === 1;
    return this.allSeries().map((entry) => {
      const shown = visible.includes(entry.factor);
      return {
        factor: entry.factor,
        label: entry.label,
        shown,
        // The swatch is the only thing tying a chip to a line: the chart's own
        // legend is off, because a legend inside a canvas takes no focus and
        // announces nothing. The filled/hollow glyph carries shown-versus-
        // hidden without it, so the colour is a key and never the state.
        colour: colours.get(entry.factor) ?? '',
        // The last visible line cannot be hidden: the chart would have nothing
        // left to draw, and an empty figure is not a reading.
        locked: shown && onlyOne,
      };
    });
  });

  protected readonly onlyOneLine = computed(() => this.visibleFactors().length === 1);

  protected readonly formatter: ValueFormatter = signedPercent1;

  protected readonly subtitle = computed(
    () =>
      `${EXCESS_RETURN_WINDOW_YEARS}-year rolling excess return against the market, one point per year. The cycles are long and out of phase with one another.`,
  );

  protected readonly ariaLabel = computed(() => {
    const names = this.series().map((entry) => entry.name);
    const last = this.years()[this.years().length - 1];
    const readings = this.series()
      .map((entry) => {
        const value = entry.data[entry.data.length - 1];
        return `${entry.name} ${value === null || value === undefined ? 'no reading' : signedPercent1(value)}`;
      })
      .join(', ');
    return `Three-year rolling excess return against the market for ${names.length} factor lines, 1990 to ${last}. Latest readings: ${readings}.`;
  });

  protected toggle(factor: FactorId): void {
    const chip = this.chips().find((entry) => entry.factor === factor);
    if (chip === undefined || chip.locked) return;
    this.hidden.update((hidden) =>
      hidden.includes(factor) ? hidden.filter((entry) => entry !== factor) : [...hidden, factor],
    );
  }

  /** Isolates one line: everything else in view is hidden in a single press. */
  protected isolate(factor: FactorId): void {
    const others = this.allSeries()
      .map((entry) => entry.factor)
      .filter((entry) => entry !== factor);
    this.hidden.set(others);
  }

  protected showAll(): void {
    this.hidden.set([]);
  }
}
