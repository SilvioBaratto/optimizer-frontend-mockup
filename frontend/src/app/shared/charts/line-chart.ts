import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartBase } from './chart-base';
import { ChartPanelComponent } from './chart-panel';
import {
  baseGrid,
  baseLegend,
  baseTooltip,
  categoryAxis,
  dashFor,
  decimal,
  markAreas,
  markLines,
  markPoints,
  valueAxis,
} from './chart-options';
import { chartTokens, seriesColor } from './chart-tokens';
import type {
  CategorySeries,
  ChartTable,
  RefBand,
  RefLine,
  RefPoint,
  ValueFormatter,
} from './chart-types';

/**
 * Time-series / progression line chart, with optional area fill and stacking.
 *
 * Covers NAV curves, VaR and CVaR trends, drawdown, absorption ratio, effective
 * rank, factor excess return, solver convergence (via `logY`) and the stacked
 * regime-probability bands (via `stack` + `area`).
 *
 * Series are given distinct dash patterns by default, so a reader can tell them
 * apart without relying on colour — doc 23 requires this explicitly and the
 * cross-cutting a11y rule requires it everywhere.
 */
@Component({
  selector: 'app-line-chart',
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
export class LineChartComponent extends ChartBase {
  /** Category labels, or numeric x values when `xType` is `value`. */
  readonly x = input.required<readonly (string | number)[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly xType = input<'category' | 'value'>('category');
  readonly area = input(false);
  readonly stack = input(false);
  /** Log value axis — the solver-convergence panel toggles this at runtime. */
  readonly logY = input(false);
  readonly smooth = input(false);
  /** Lets the value axis skip zero so small variation stays visible. */
  readonly scaleY = input(true);
  readonly showSymbol = input(false);
  readonly distinguishByDash = input(true);
  readonly valueFormatter = input<ValueFormatter>(decimal);
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly refLines = input<readonly RefLine[]>([]);
  readonly refBands = input<readonly RefBand[]>([]);
  readonly refPoints = input<readonly RefPoint[]>([]);
  readonly showLegend = input<boolean | undefined>(undefined);
  /**
   * Pinch/drag to zoom along x, plus a slider handle.
   *
   * Off by default. Turn it on for the long histories — doc 22's probability
   * path runs 1990→2026 monthly, which is several hundred points and
   * unreadable on a phone without a way to narrow the window.
   */
  readonly zoomable = input(false);
  /** Initial window as a percentage of the series, when `zoomable`. */
  readonly zoomStart = input(0);
  readonly zoomEnd = input(100);

  protected readonly table = computed<ChartTable>(() => {
    const fmt = this.valueFormatter();
    const all = this.series();
    return {
      columns: [this.xAxisName() || 'x', ...all.map((s) => s.name)],
      rows: this.x().map((xv, i) => [
        String(xv),
        ...all.map((s) => {
          const v = s.data[i];
          return v === null || v === undefined ? '—' : fmt(v);
        }),
      ]),
    };
  });

  protected readonly option = computed<EChartsCoreOption>(() => {
    const t = chartTokens();
    const fmt = this.valueFormatter();
    const all = this.series();
    const multi = all.length > 1;
    const legend = this.showLegend() ?? multi;
    const stacked = this.stack();

    const series = all.map((s, i) => {
      const color = s.color ?? seriesColor(i);
      return {
        type: 'line',
        name: s.name,
        // A null stays a gap rather than being bridged — the specs use it for
        // non-converged solver points and for "not measured".
        data: s.data as (number | null)[],
        connectNulls: false,
        smooth: this.smooth(),
        showSymbol: this.showSymbol(),
        symbolSize: 6,
        stack: stacked ? 'total' : undefined,
        lineStyle: {
          color,
          width: 2,
          type: this.distinguishByDash() && multi && !stacked ? dashFor(i) : 'solid',
        },
        itemStyle: { color },
        areaStyle: this.area() ? { color, opacity: stacked ? 0.85 : 0.15 } : undefined,
        // Marks belong to the first series only, otherwise they draw N times.
        markLine: i === 0 ? markLines(this.refLines()) : undefined,
        markArea: i === 0 ? markAreas(this.refBands()) : undefined,
        markPoint: i === 0 ? markPoints(this.refPoints(), fmt) : undefined,
      };
    });

    const zoom = this.zoomable();
    // The slider needs its own strip below the plot, on top of any legend row.
    const bottom = (legend ? 40 : 12) + (zoom ? 40 : 0);

    return this.patch({
      grid: baseGrid({ bottom }),
      tooltip: baseTooltip({ trigger: 'axis' }),
      legend: baseLegend(legend, zoom ? 44 : 0),
      dataZoom: zoom
        ? [
            // `inside` carries the touch gestures; the slider gives a visible
            // affordance, since a pinch target is not discoverable on its own.
            { type: 'inside', start: this.zoomStart(), end: this.zoomEnd() },
            {
              type: 'slider',
              start: this.zoomStart(),
              end: this.zoomEnd(),
              bottom: legend ? 24 : 0,
              height: 20,
              borderColor: t.grid,
              fillerColor: 'transparent',
              handleStyle: { color: t.textMuted },
              textStyle: { color: t.textMuted, fontSize: 10 },
            },
          ]
        : undefined,
      xAxis:
        this.xType() === 'category'
          ? categoryAxis(this.x(), { name: this.xAxisName(), boundaryGap: false })
          : valueAxis({ name: this.xAxisName(), scale: true }),
      yAxis: valueAxis({
        name: this.yAxisName(),
        formatter: fmt,
        log: this.logY(),
        // A stacked band chart must keep its zero baseline to read as a share.
        scale: stacked ? false : this.scaleY(),
      }),
      series,
    });
  });
}
