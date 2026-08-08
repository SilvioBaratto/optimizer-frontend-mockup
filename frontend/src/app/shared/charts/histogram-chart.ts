import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartBase } from './chart-base';
import { ChartPanelComponent } from './chart-panel';
import {
  HIDE_OVERLAPPING_LABELS,
  baseGrid,
  baseTooltip,
  categoryAxis,
  percent,
  valueAxis,
} from './chart-options';
import { chartTokens, seriesColor } from './chart-tokens';
import type { ChartTable, HistogramBin, ValueFormatter } from './chart-types';

/**
 * Binned distribution with an optional highlighted region.
 *
 * Doc 09 plots the CSCV logit distribution and calls out the bins left of zero
 * as the PBO; doc 25 plots the ΔPC1 distribution and highlights the bin holding
 * the current reading. Both are the same figure: bars over ordered bins, some
 * of them emphasised, with a text annotation naming what the region means.
 *
 * The annotation is a real requirement rather than decoration — the specs say
 * the meaning of the highlighted region must be stated in text, not left to be
 * inferred from shading.
 */
@Component({
  selector: 'app-histogram-chart',
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
      @if (annotation()) {
        <p class="border-t border-border px-4 py-2 text-xs text-text-secondary">
          {{ annotation() }}
        </p>
      }
    </app-chart-panel>
  `,
})
export class HistogramChartComponent extends ChartBase {
  readonly bins = input.required<readonly HistogramBin[]>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly valueFormatter = input<ValueFormatter>(percent);
  readonly valueAxisName = input('');
  readonly binAxisName = input('');
  /** Names what the highlighted bins mean, e.g. "left of 0 → PBO 0.031". */
  readonly annotation = input('');

  protected readonly table = computed<ChartTable>(() => {
    const fmt = this.valueFormatter();
    return {
      columns: [this.binAxisName() || 'Bin', this.valueAxisName() || 'Value'],
      rows: this.bins().map((b) => [b.label, fmt(b.value)]),
    };
  });

  protected readonly option = computed<EChartsCoreOption>(() => {
    const t = chartTokens();
    const horizontal = this.orientation() === 'horizontal';
    const fmt = this.valueFormatter();
    const bins = this.bins();

    const value = valueAxis({ name: this.valueAxisName(), formatter: fmt });
    const category = categoryAxis(
      bins.map((b) => b.label),
      { name: this.binAxisName() },
    );

    return this.patch({
      grid: baseGrid(),
      tooltip: baseTooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? category : value,
      series: [
        {
          type: 'bar',
          name: this.title() || 'Distribution',
          // Histogram bars touch: the gap between bins is the bin edge itself.
          barCategoryGap: '8%',
          data: bins.map((b) => ({
            value: b.value,
            itemStyle: {
              color: b.highlight ? seriesColor(0) : t.track,
              borderColor: b.highlight ? seriesColor(0) : t.grid,
              borderWidth: 1,
            },
          })),
          label: {
            show: true,
            position: horizontal ? 'right' : 'top',
            color: t.text,
            fontSize: 11,
            formatter: (p: { value: number }) => fmt(p.value),
          },
          labelLayout: HIDE_OVERLAPPING_LABELS,
        },
      ],
    });
  });
}
