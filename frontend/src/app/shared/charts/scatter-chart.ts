import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartBase } from './chart-base';
import { ChartPanelComponent } from './chart-panel';
import {
  HIDE_OVERLAPPING_LABELS,
  baseGrid,
  baseLegend,
  baseTooltip,
  decimal,
  markLines,
  valueAxis,
} from './chart-options';
import { chartTokens, seriesColor } from './chart-tokens';
import type { ChartTable, RefLine, ValueFormatter, XySeries } from './chart-types';

/**
 * Free `(x, y)` scatter, optionally with a line through each series.
 *
 * Built for doc 22's correlation diagnostic, where one empirical series is
 * compared against three model series and the distinction has to survive
 * without colour — hence a distinct symbol per series.
 */
@Component({
  selector: 'app-scatter-chart',
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
export class ScatterChartComponent extends ChartBase {
  readonly series = input.required<readonly XySeries[]>();
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly valueFormatter = input<ValueFormatter>(decimal);
  readonly refLines = input<readonly RefLine[]>([]);
  readonly showLegend = input(true);

  /** Cycled when a series does not name its own, so shape carries meaning too. */
  private static readonly SYMBOLS = ['circle', 'emptyCircle', 'triangle', 'diamond', 'rect'];

  protected readonly table = computed<ChartTable>(() => {
    const fmt = this.valueFormatter();
    return {
      columns: ['Series', this.xAxisName() || 'x', this.yAxisName() || 'y'],
      rows: this.series().flatMap((s) =>
        s.points.map((pt) => [s.name, fmt(pt[0]), fmt(pt[1])]),
      ),
    };
  });

  protected readonly option = computed<EChartsCoreOption>(() => {
    const t = chartTokens();
    const fmt = this.valueFormatter();

    const series = this.series().map((s, i) => {
      const color = s.color ?? seriesColor(i);
      return {
        type: s.line ? 'line' : 'scatter',
        name: s.name,
        data: s.points.map((p) => [p[0], p[1]]),
        symbol: s.symbol ?? ScatterChartComponent.SYMBOLS[i % ScatterChartComponent.SYMBOLS.length],
        symbolSize: s.symbolSize ?? 9,
        showSymbol: true,
        itemStyle: { color },
        lineStyle: s.line
          ? { color, width: 2, type: s.dashed ? 'dashed' : 'solid' }
          : undefined,
        label: s.labels?.length
          ? {
              show: true,
              position: 'right',
              distance: 6,
              color: t.textMuted,
              fontSize: 11,
              formatter: (p: { dataIndex: number }) => s.labels?.[p.dataIndex] ?? '',
            }
          : undefined,
        labelLayout: HIDE_OVERLAPPING_LABELS,
        markLine: i === 0 ? markLines(this.refLines()) : undefined,
      };
    });

    return this.patch({
      grid: baseGrid({ bottom: this.showLegend() ? 40 : 12 }),
      tooltip: baseTooltip({
        trigger: 'item',
        formatter: (p: { seriesName: string; value: [number, number] }) =>
          `${p.seriesName}<br/>${this.xAxisName() || 'x'} ${fmt(p.value[0])} · ${
            this.yAxisName() || 'y'
          } ${fmt(p.value[1])}`,
      }),
      legend: baseLegend(this.showLegend()),
      xAxis: valueAxis({ name: this.xAxisName(), formatter: fmt, scale: true }),
      yAxis: valueAxis({ name: this.yAxisName(), formatter: fmt, scale: true }),
      series,
    });
  });
}
