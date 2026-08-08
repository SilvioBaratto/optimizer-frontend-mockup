import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { BarChartComponent, LineChartComponent, percent } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { MacroRegimeService } from '../../../../services/macro-regime.service';

/**
 * Filtered probability per state, with how long each state tends to last.
 *
 * The duration travels with the probability everywhere: a state at 24% that
 * persists seven months and one at 24% that burns out in two are different
 * facts about the market, and only one of them is worth repositioning for.
 *
 * The bars and the sparkline behave differently while a run is in flight, and
 * deliberately so — see the template.
 */
@Component({
  selector: 'app-regime-probabilities',
  imports: [BarChartComponent, LineChartComponent, SkeletonBlock],
  templateUrl: './regime-probabilities.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimeProbabilities {
  private readonly service = inject(MacroRegimeService);

  protected readonly estimate = this.service.estimate;
  protected readonly recomputing = this.service.recomputing;
  protected readonly percentFormatter = percent;

  /** Ordered by probability by default — the reading most people want first. */
  protected readonly sortByProbability = signal(true);

  protected readonly orderedStates = computed(() => {
    const states = [...this.estimate().states];
    return this.sortByProbability() ? states.sort((a, b) => b.probability - a.probability) : states;
  });

  protected readonly categories = computed(() => this.orderedStates().map((s) => s.name));

  protected readonly series = computed<CategorySeries[]>(() => [
    { name: 'Filtered probability', data: this.orderedStates().map((s) => s.probability) },
  ]);

  protected readonly historyLabels = computed(() => this.estimate().history.map((h) => h.month));

  protected readonly historySeries = computed<CategorySeries[]>(() => [
    {
      name: `P(${this.estimate().driver})`,
      data: this.estimate().history.map((h) => h.probability),
    },
  ]);
}
