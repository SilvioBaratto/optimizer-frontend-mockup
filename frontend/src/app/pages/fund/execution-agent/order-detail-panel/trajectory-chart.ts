import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import type { ProposedOrder } from '../../../../models/order.model';
import { groupDigits } from '../order-format';
import { intervalLabels, naiveHoldings, residualHoldings } from './order-charts';

/**
 * Holdings still open over the scheduling horizon: the chosen schedule against
 * the constant-rate reference.
 *
 * A wrapper this thin exists for one reason — `LineChartComponent` builds its
 * own `ChartTable` and hands it to the panel, so binding it here is what makes
 * "View as table" the keyboard-reachable equivalent of the drawing that the
 * spec's accessibility section requires. Nothing about that belongs in the
 * tabbed panel's template.
 */
@Component({
  selector: 'app-execution-trajectory-chart',
  imports: [LineChartComponent],
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-line-chart
      title="Holdings over the scheduling horizon"
      subtitle="shares still to trade"
      [ariaLabel]="ariaLabel()"
      [x]="labels()"
      [series]="series()"
      xAxisName="Interval"
      yAxisName="Holdings"
      [valueFormatter]="quantity"
      [showSymbol]="true"
      [height]="260"
    />
  `,
})
export class TrajectoryChart {
  readonly order = input.required<ProposedOrder>();

  /** Stable reference — a new arrow each render would rebuild the ECharts option. */
  protected readonly quantity: ValueFormatter = (value) => groupDigits(value);

  protected readonly labels = computed(() => intervalLabels(this.order().trajectory.length));

  protected readonly series = computed<CategorySeries[]>(() => {
    const order = this.order();
    const total = Math.abs(order.targetQuantityDelta);
    return [
      { name: 'Chosen schedule', data: residualHoldings(order.trajectory, total) },
      { name: 'Constant rate', data: naiveHoldings(order.trajectory.length, total) },
    ];
  });

  protected readonly ariaLabel = computed(() => {
    const order = this.order();
    const intervals = order.trajectory.length;
    return (
      `Holdings path for ${order.symbol}: ${groupDigits(order.targetQuantityDelta)} shares traded ` +
      `over ${intervals} intervals, front-loaded, against a constant-rate reference that closes ` +
      `the same block in equal slices.`
    );
  });
}
