import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartBase } from './chart-base';
import { ChartPanelComponent } from './chart-panel';
import { baseGrid, baseTooltip, categoryAxis, decimal, valueAxis } from './chart-options';
import { chartTokens, seriesColor } from './chart-tokens';
import type { BulletRow, ChartTable, ValueFormatter } from './chart-types';

/**
 * A value positioned on a bounded track, with optional min/max bound ticks.
 *
 * This is what doc 23's value-spread band and doc 25's correlation-surprise
 * inspector actually are. ECharts has no linear gauge — every built-in gauge is
 * a radial dial — so the track is a `bar` with `showBackground`, the bounds are
 * narrow tick marks, and no extra module is pulled in.
 *
 * `mode` picks between the two readings the specs use:
 * - `fill` — bar grows from the domain floor. Reads as a magnitude.
 * - `marker` — track stays empty and a diamond sits at the value. Reads as a
 *   position on a band, which is what a z-score against a historical range is.
 */
@Component({
  selector: 'app-bullet-chart',
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
export class BulletChartComponent extends ChartBase {
  readonly rows = input.required<readonly BulletRow[]>();
  readonly mode = input<'fill' | 'marker'>('fill');
  readonly domainMin = input<number | undefined>(undefined);
  readonly domainMax = input<number | undefined>(undefined);
  readonly valueFormatter = input<ValueFormatter>(decimal);
  readonly valueAxisName = input('');

  protected readonly table = computed<ChartTable>(() => {
    const fmt = this.valueFormatter();
    const rows = this.rows();
    const hasBounds = rows.some((r) => r.min !== undefined || r.max !== undefined);
    const hasStatus = rows.some((r) => Boolean(r.status));
    return {
      columns: [
        'Item',
        this.valueAxisName() || 'Value',
        ...(hasBounds ? ['Min', 'Max'] : []),
        ...(hasStatus ? ['Status'] : []),
      ],
      rows: rows.map((r) => [
        r.label,
        fmt(r.value),
        ...(hasBounds ? [r.min === undefined ? '—' : fmt(r.min), r.max === undefined ? '—' : fmt(r.max)] : []),
        ...(hasStatus ? [r.status ?? '—'] : []),
      ]),
    };
  });

  protected readonly option = computed<EChartsCoreOption>(() => {
    const t = chartTokens();
    const fmt = this.valueFormatter();
    const rows = this.rows();
    const marker = this.mode() === 'marker';
    const labels = rows.map((r) => r.label);

    // The value label carries the status text, so status is never colour-only.
    const labelFor = (r: BulletRow): string => (r.status ? `${fmt(r.value)}  ${r.status}` : fmt(r.value));

    const tick = (pick: (r: BulletRow) => number | undefined, name: string) => ({
      type: 'scatter',
      name,
      // A tall thin rect reads as a bound tick rather than a data point.
      symbol: 'rect',
      symbolSize: [2, 18],
      silent: true,
      itemStyle: { color: t.neutral },
      data: rows
        .map((r, i) => ({ v: pick(r), i }))
        .filter((d): d is { v: number; i: number } => d.v !== undefined)
        .map((d) => [d.v, labels[d.i]]),
      z: 4,
    });

    const series: Record<string, unknown>[] = [
      {
        type: 'bar',
        name: this.title() || 'Value',
        data: rows.map((r) => ({
          value: marker ? 0 : r.value,
          itemStyle: {
            color: marker ? 'transparent' : (r.color ?? seriesColor(0)),
            borderRadius: 2,
          },
        })),
        showBackground: true,
        backgroundStyle: { color: t.track, borderRadius: 2 },
        barMaxWidth: 18,
        // In marker mode the bar is a zero-length stub at the axis origin, so
        // its label would sit at the far left, detached from the marker.
        // The scatter series carries the label there instead.
        label: {
          show: !marker,
          position: 'right',
          color: t.text,
          fontSize: 11,
          formatter: (p: { dataIndex: number }) => labelFor(rows[p.dataIndex]),
        },
        z: 2,
      },
      tick((r) => r.min, 'Lower bound'),
      tick((r) => r.max, 'Upper bound'),
    ];

    if (marker) {
      series.push({
        type: 'scatter',
        name: 'Current',
        symbol: 'diamond',
        symbolSize: 13,
        data: rows.map((r, i) => ({
          value: [r.value, labels[i]],
          itemStyle: { color: r.color ?? seriesColor(0) },
        })),
        label: {
          show: true,
          position: 'right',
          distance: 8,
          color: t.text,
          fontSize: 11,
          formatter: (p: { dataIndex: number }) => labelFor(rows[p.dataIndex]),
        },
        z: 5,
      });
    }

    return this.patch({
      grid: baseGrid({ right: 96 }),
      tooltip: baseTooltip({
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const r = rows[p.dataIndex];
          const bounds =
            r.min !== undefined && r.max !== undefined
              ? `<br/>range ${fmt(r.min)} – ${fmt(r.max)}`
              : '';
          return `${r.label}<br/>${labelFor(r)}${bounds}`;
        },
      }),
      xAxis: valueAxis({
        name: this.valueAxisName(),
        formatter: fmt,
        min: this.domainMin(),
        max: this.domainMax(),
      }),
      yAxis: categoryAxis(labels),
      series,
    });
  });
}
