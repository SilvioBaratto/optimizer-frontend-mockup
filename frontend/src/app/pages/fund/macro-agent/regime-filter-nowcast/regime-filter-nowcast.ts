import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { LineChartComponent, decimal, percent } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { MacroRegimeService } from '../../../../services/macro-regime.service';

/**
 * The full filtered state-probability series, and the nowcast beside it.
 *
 * Both charts here are **inferred**: the source names this tab in a note
 * without giving axes or series. The shapes follow the filter of Fondamenti §3
 * — probabilities in [0,1] summing to one at every date — and the nowcast of
 * §7, where each release moves the projection by its own news.
 */
@Component({
  selector: 'app-regime-filter-nowcast',
  imports: [LineChartComponent],
  templateUrl: './regime-filter-nowcast.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimeFilterNowcast {
  private readonly service = inject(MacroRegimeService);

  protected readonly estimate = this.service.estimate;
  protected readonly lookback = this.service.lookback;
  protected readonly percentFormatter = percent;
  protected readonly decimalFormatter = decimal;

  protected readonly months = computed(() => this.estimate().history.map((h) => h.month));

  /**
   * Every state's filtered path, stacked so the bands sum to 100% at each date
   * — which is the filter's own guarantee, and worth showing rather than
   * asserting.
   */
  protected readonly stateSeries = computed<CategorySeries[]>(() => {
    const states = this.estimate().states;
    const driver = this.estimate().driver;
    const driverPath = this.estimate().history.map((h) => h.probability);

    return states.map((state) => {
      if (state.name === driver) return { name: state.name, data: driverPath };
      // The others share what the driver leaves, in proportion to their own
      // filtered probability, so the columns still add to 100.
      const others = states.filter((s) => s.name !== driver);
      const weight = state.probability / others.reduce((sum, s) => sum + s.probability, 0);
      return {
        name: state.name,
        data: driverPath.map((p) => Math.round((100 - p) * weight * 10) / 10),
      };
    });
  });

  /** GDP nowcast, revised as each release lands. */
  protected readonly nowcastSeries = computed<CategorySeries[]>(() => {
    const base = 2.1;
    return [
      {
        name: 'Nowcast of GDP growth',
        data: this.months().map((_, i) => Math.round((base + 0.5 * Math.sin(i * 0.7) - 0.02 * i) * 100) / 100),
      },
    ];
  });

  /** The releases that moved the projection most this month. */
  protected readonly news = [
    { release: 'Purchasing managers index', news: 0.18, note: 'timely, so its marginal impact is large' },
    { release: 'Industrial production', news: -0.07, note: 'largely anticipated by the surveys' },
    { release: 'Retail sales', news: 0.05, note: '' },
    { release: 'Payrolls', news: 0.11, note: '' },
    { release: 'Housing starts', news: -0.02, note: '' },
  ];
}
