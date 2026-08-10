import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { FrontierChartComponent } from '../../../../shared/charts';
import type { FrontierMarker, ValueFormatter } from '../../../../shared/charts';
import type { ProposedOrder } from '../../../../models/order.model';
import { costVarianceFrontier } from './order-charts';

/**
 * The execution frontier: expected implementation shortfall against its own
 * timing risk, with the chosen schedule marked on it.
 *
 * Same plane as the portfolio frontier and the same component, which is the
 * point — `E` stands where the expected return stands and `√V` where the risk
 * does. Trading faster moves up and to the left (more impact, less exposure);
 * trading slower moves down and to the right, with a horizontal tangent at the
 * constant-rate strategy.
 */
@Component({
  selector: 'app-execution-cost-variance-chart',
  imports: [FrontierChartComponent],
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-frontier-chart
      title="Cost–variance frontier"
      subtitle="basis points"
      [ariaLabel]="ariaLabel()"
      [curve]="curve()"
      [markers]="markers()"
      xAxisName="Timing risk √V"
      yAxisName="Expected shortfall E"
      [valueFormatter]="basisPoints"
      [showLegend]="false"
      [height]="260"
    />
  `,
})
export class CostVarianceChart {
  readonly order = input.required<ProposedOrder>();

  /** Stable reference — a new arrow each render would rebuild the ECharts option. */
  protected readonly basisPoints: ValueFormatter = (value) => `${value.toFixed(1)} bps`;

  protected readonly curve = computed(() => costVarianceFrontier(this.order()));

  /**
   * One emphasised marker: the schedule the agent actually chose, at the exact
   * `E` and `√V` the table prints for it.
   */
  protected readonly markers = computed<FrontierMarker[]>(() => {
    const order = this.order();
    if (order.estimatedShortfallBps === null || order.estimatedRiskBps === null) return [];
    return [
      {
        name: 'Chosen schedule',
        x: order.estimatedRiskBps,
        y: order.estimatedShortfallBps,
        emphasis: true,
      },
    ];
  });

  protected readonly ariaLabel = computed(() => {
    const order = this.order();
    if (order.estimatedShortfallBps === null || order.estimatedRiskBps === null) {
      return `No cost–variance frontier for ${order.symbol}: scheduling incomplete.`;
    }
    return (
      `Cost–variance frontier for ${order.symbol}. The chosen schedule sits at ` +
      `${order.estimatedRiskBps} basis points of timing risk for an expected shortfall of ` +
      `${order.estimatedShortfallBps} basis points; trading faster costs more and risks less, ` +
      `trading slower costs less and risks more.`
    );
  });
}
