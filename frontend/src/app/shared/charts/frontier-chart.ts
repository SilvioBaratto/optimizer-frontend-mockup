import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartBase } from './chart-base';
import { ChartPanelComponent } from './chart-panel';
import {
  HIDE_OVERLAPPING_LABELS,
  baseGrid,
  baseLegend,
  baseTooltip,
  percent,
  valueAxis,
} from './chart-options';
import { chartTokens, seriesColor } from './chart-tokens';
import type {
  ChartPointClick,
  ChartTable,
  FrontierMarker,
  Point,
  ValueFormatter,
} from './chart-types';

/**
 * Risk-return plane: efficient frontier, its dashed inefficient branch, the
 * capital allocation line, individual assets, and the named portfolio markers
 * (GMVP, tangency, MDP, selected).
 *
 * Docs 02, 08, 10, 13 and 15 all draw this same figure at different levels of
 * detail, so every layer below the frontier curve itself is optional — pass
 * only what a given page shows.
 *
 * Non-converged frontier points are plain `null` entries in `curve`: they leave
 * a genuine break in the line rather than being bridged. That is the spec's
 * "break in the curve", and it is unrelated to ECharts 6's axis-break feature.
 */
@Component({
  selector: 'app-frontier-chart',
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
      (pointClicked)="pointClicked.emit($event)"
    >
      <!-- Forwards the panel's footer slot, for per-chart controls. -->
      <ng-content />
    </app-chart-panel>
  `,
})
export class FrontierChartComponent extends ChartBase {
  /** The efficient branch. A `null` entry renders as a break in the curve. */
  readonly curve = input.required<readonly (Point | null)[]>();
  /** The branch below the GMVP, drawn dashed and labelled as inefficient. */
  readonly inefficientBranch = input<readonly Point[]>([]);
  /**
   * Risk-free rate. Given this, the capital allocation line is derived — drawn
   * from `(0, r_f)` through the tangency marker and extended past it, which is
   * how doc 08 defines it. Deriving beats passing endpoints: a hand-picked
   * second point silently stops being tangent the moment the frontier moves.
   *
   * Ignored when `cal` is set explicitly.
   */
  readonly riskFreeRate = input<number | undefined>(undefined);
  /** Explicit CAL endpoints, overriding `riskFreeRate`. */
  readonly cal = input<readonly Point[]>([]);
  /** Named portfolios. `emphasis` fills the marker instead of leaving it hollow. */
  readonly markers = input<readonly FrontierMarker[]>([]);
  /**
   * Individual instruments as labelled points. `highlight` picks one out — for
   * a page that syncs a table row with its point on the plane.
   */
  readonly assets = input<
    readonly { name: string; x: number; y: number; highlight?: boolean }[]
  >([]);
  /**
   * Spline tension, 0–1. Defaults to 0 — straight segments between points.
   *
   * Smoothing invents curvature the solver never produced, and on a frontier it
   * rings: the interpolated line oscillates across the true path between
   * points, which is plainly visible where the curve runs near the CAL. A
   * frontier plotted with enough points reads as smooth without any of that.
   * Raise it only for a deliberately coarse curve.
   */
  readonly smooth = input(0);
  readonly xAxisName = input('Risk');
  readonly yAxisName = input('Return');
  readonly valueFormatter = input<ValueFormatter>(percent);
  readonly showLegend = input(true);

  /**
   * A click on a frontier point, a marker or an asset. `seriesName` says which
   * layer was hit — `Frontier` indexes into `curve`, `Notable portfolios` into
   * `markers`, `Assets` into `assets`.
   */
  readonly pointClicked = output<ChartPointClick>();

  /** The marker the CAL is tangent to — explicit emphasis first, then by name. */
  private tangencyMarker(): FrontierMarker | undefined {
    const markers = this.markers();
    return markers.find((m) => m.emphasis) ?? markers.find((m) => /tangen/i.test(m.name));
  }

  /**
   * CAL endpoints. Explicit input wins; otherwise the line runs from `(0, r_f)`
   * through the tangency marker and is extended past it to the far edge of the
   * plotted data, so it reads as a ray rather than a segment that stops dead.
   */
  private readonly calPoints = computed<readonly Point[]>(() => {
    const explicit = this.cal();
    if (explicit.length) return explicit;

    const rf = this.riskFreeRate();
    const tangency = this.tangencyMarker();
    if (rf === undefined || !tangency || tangency.x <= 0) return [];

    // Extend to just past the frontier, not past the assets: a far-out asset
    // would stretch the ray and drag the whole value axis up with it.
    const frontierXs = [
      ...this.curve().filter((p): p is Point => p !== null).map((p) => p[0]),
      tangency.x,
    ];
    const slope = (tangency.y - rf) / tangency.x;
    const endX = Math.max(...frontierXs) * 1.05;
    return [
      [0, rf],
      [endX, rf + slope * endX],
    ];
  });

  /**
   * Doc 08 names the notable-portfolio cards and the holdings table as the
   * frontier's accessible equivalent, so the table lists the named points
   * rather than every interpolation point along the curve.
   */
  protected readonly table = computed<ChartTable>(() => {
    const fmt = this.valueFormatter();
    return {
      columns: ['Point', this.xAxisName(), this.yAxisName()],
      rows: [
        ...this.markers().map((m) => [m.name, fmt(m.x), fmt(m.y)]),
        ...this.assets().map((a) => [a.name, fmt(a.x), fmt(a.y)]),
      ],
    };
  });

  protected readonly option = computed<EChartsCoreOption>(() => {
    const t = chartTokens();
    const fmt = this.valueFormatter();
    const markers = this.markers();
    const assets = this.assets();
    const inefficient = this.inefficientBranch();
    const cal = this.calPoints();

    const series: Record<string, unknown>[] = [
      {
        type: 'line',
        name: 'Frontier',
        data: this.curve().map((p) => (p === null ? null : [p[0], p[1]])),
        connectNulls: false,
        smooth: this.smooth(),
        showSymbol: false,
        lineStyle: { color: seriesColor(0), width: 2.5 },
        itemStyle: { color: seriesColor(0) },
        z: 3,
      },
    ];

    if (inefficient.length) {
      series.push({
        type: 'line',
        name: 'Inefficient branch',
        data: inefficient.map((p) => [p[0], p[1]]),
        smooth: this.smooth(),
        showSymbol: false,
        lineStyle: { color: t.neutral, width: 1.5, type: 'dashed' },
        itemStyle: { color: t.neutral },
        z: 2,
      });
    }

    if (cal.length) {
      series.push({
        type: 'line',
        name: 'CAL',
        data: cal.map((p) => [p[0], p[1]]),
        showSymbol: false,
        lineStyle: { color: seriesColor(2), width: 1.5 },
        itemStyle: { color: seriesColor(2) },
        z: 2,
      });
    }

    if (assets.length) {
      series.push({
        type: 'scatter',
        name: 'Assets',
        data: assets.map((a) => ({
          value: [a.x, a.y],
          name: a.name,
          // A highlighted asset gets size and a ring, not only a colour swap:
          // the sync has to survive a monochrome print or a colour-blind reader.
          symbolSize: a.highlight ? 14 : 6,
          itemStyle: a.highlight
            ? { color: seriesColor(1), opacity: 1, borderColor: t.text, borderWidth: 2 }
            : { color: t.neutral, opacity: 0.8 },
          label: a.highlight
            ? { show: true, color: t.text, fontWeight: 600, fontSize: 11 }
            : undefined,
        })),
        symbolSize: 6,
        // Series-level colour as well as per-point, so the legend swatch matches
        // what is actually drawn.
        color: t.neutral,
        itemStyle: { color: t.neutral, opacity: 0.8 },
        label: {
          show: true,
          position: 'right',
          distance: 5,
          color: t.textMuted,
          fontSize: 10,
          formatter: (p: { name: string }) => p.name,
        },
        labelLayout: HIDE_OVERLAPPING_LABELS,
        z: 4,
      });
    }

    if (markers.length) {
      series.push({
        type: 'scatter',
        name: 'Notable portfolios',
        data: markers.map((m) => ({
          value: [m.x, m.y],
          name: m.name,
          symbol: m.emphasis ? 'circle' : 'emptyCircle',
          itemStyle: { color: m.emphasis ? t.text : seriesColor(0), borderWidth: 2 },
        })),
        symbolSize: 12,
        color: seriesColor(0),
        label: {
          show: true,
          position: 'top',
          distance: 8,
          color: t.text,
          fontSize: 11,
          fontWeight: 500,
          formatter: (p: { name: string }) => p.name,
        },
        labelLayout: HIDE_OVERLAPPING_LABELS,
        z: 5,
      });
    }

    return this.patch({
      grid: baseGrid({ bottom: this.showLegend() ? 40 : 12, right: 40 }),
      tooltip: baseTooltip({
        trigger: 'item',
        formatter: (p: { seriesName: string; name?: string; value: [number, number] }) =>
          `${p.name || p.seriesName}<br/>${this.xAxisName()} ${fmt(
            p.value[0],
          )} · ${this.yAxisName()} ${fmt(p.value[1])}`,
      }),
      legend: baseLegend(this.showLegend()),
      xAxis: valueAxis({ name: this.xAxisName(), formatter: fmt, scale: true }),
      yAxis: valueAxis({ name: this.yAxisName(), formatter: fmt, scale: true }),
      series,
    });
  });
}
