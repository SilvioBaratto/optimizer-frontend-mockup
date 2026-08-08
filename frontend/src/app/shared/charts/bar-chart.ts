import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartBase } from './chart-base';
import { ChartPanelComponent } from './chart-panel';
import {
  HIDE_OVERLAPPING_LABELS,
  baseGrid,
  baseLegend,
  baseTooltip,
  categoryAxis,
  decimal,
  hatchFill,
  markLines,
  valueAxis,
} from './chart-options';
import { chartTokens, seriesColor } from './chart-tokens';
import type { CategorySeries, ChartTable, RefLine, ValueFormatter } from './chart-types';

/**
 * Category bar chart — the workhorse, covering roughly half the charts in the
 * specs: risk contribution, factor impact, regime probabilities, scenario
 * severity, weight-vs-contribution, eigenvalue spectra.
 *
 * Handles the three variants the docs ask for out of one input set:
 * grouped (several series), stacked (`stack`), and diverging (any negative
 * value, which picks up the negative token and can carry its own label prefix).
 *
 * Value labels are on by default because the specs repeatedly require the
 * number to be readable as text, never encoded in bar length alone.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartPanelComponent],
  template: `
    <app-chart-panel
      [title]="title()"
      [subtitle]="subtitle()"
      [ariaLabel]="ariaLabel()"
      [options]="option()"
      [loading]="loading()"
      [height]="effectiveHeight()"
      [table]="table()"
    >
      <!-- Forwards the panel's footer slot, for per-chart controls. -->
      <ng-content />
    </app-chart-panel>
  `,
})
export class BarChartComponent extends ChartBase {
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  /** Horizontal reads better for named things (tickers, factors, regimes). */
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly stack = input(false);
  /** Draws a full-domain track behind each bar — the bounded-scale look. */
  readonly showBackground = input(false);
  readonly showValueLabels = input(true);
  readonly valueFormatter = input<ValueFormatter>(decimal);
  readonly valueAxisName = input('');
  readonly categoryAxisName = input('');
  readonly refLines = input<readonly RefLine[]>([]);
  readonly valueMax = input<number | undefined>(undefined);
  /** Show the legend; defaults to on whenever there is more than one series. */
  readonly showLegend = input<boolean | undefined>(undefined);
  /**
   * Text drawn in place of a bar whose value is `null`.
   *
   * Docs 22 and 23 both need "not measured" to read differently from zero —
   * doc 22's Recovery regime, doc 23's Market timing row. A `null` therefore
   * draws no bar at all (no magnitude is implied) and prints this instead.
   */
  readonly unavailableLabel = input('not available');

  protected readonly table = computed<ChartTable>(() => {
    const fmt = this.valueFormatter();
    const all = this.series();
    return {
      columns: [this.categoryAxisName() || 'Category', ...all.map((s) => s.name)],
      rows: this.categories().map((c, i) => [
        c,
        ...all.map((s) => {
          const v = s.data[i];
          return v === null || v === undefined ? this.unavailableLabel() : fmt(v);
        }),
      ]),
    };
  });

  protected readonly option = computed<EChartsCoreOption>(() => {
    const t = chartTokens();
    const horizontal = this.orientation() === 'horizontal';
    const fmt = this.valueFormatter();
    const all = this.series();
    const multi = all.length > 1;
    const hasNegative = all.some((s) => s.data.some((v) => v !== null && v < 0));

    const value = valueAxis({
      name: this.valueAxisName(),
      formatter: fmt,
      max: this.valueMax(),
    });
    const category = categoryAxis(this.categories(), { name: this.categoryAxisName() });

    const series = all.map((s, i) => {
      const base = s.color ?? seriesColor(i);
      return {
        type: 'bar',
        name: s.name,
        // Series-level colour as well as per-datum, so the legend swatch
        // matches the bars. Per-datum alone leaves the legend on the palette
        // default, which is a different colour entirely.
        color: base,
        data: s.data.map((v) =>
          v === null
            ? {
                // Zero-length and transparent: no magnitude is implied, and the
                // meaning is carried entirely by the text.
                value: 0,
                itemStyle: { color: 'transparent' },
                label: {
                  show: true,
                  position: horizontal ? 'right' : 'top',
                  color: t.textMuted,
                  fontSize: 11,
                  formatter: this.unavailableLabel(),
                },
              }
            : {
                value: v,
                // A diverging chart flips colour at zero. The sign still has to
                // be readable from the label, which `valueFormatter` controls.
                itemStyle: s.pattern
                  ? hatchFill(t.neutral)
                  : { color: hasNegative && v < 0 ? t.negative : base, borderRadius: 2 },
              },
        ),
        stack: this.stack() ? 'total' : undefined,
        showBackground: this.showBackground(),
        backgroundStyle: { color: t.track, borderRadius: 2 },
        barMaxWidth: 28,
        label: {
          show: this.showValueLabels(),
          position: horizontal ? 'right' : 'top',
          color: t.text,
          fontSize: 11,
          formatter: (p: { value: number | null }) => (p.value === null ? '—' : fmt(p.value)),
        },
        labelLayout: HIDE_OVERLAPPING_LABELS,
        markLine: markLines(this.refLines()),
      };
    });

    return this.patch({
      grid: baseGrid({ bottom: (this.showLegend() ?? multi) ? 40 : 12 }),
      tooltip: baseTooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
      legend: baseLegend(this.showLegend() ?? multi),
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? category : value,
      series,
    });
  });
}
