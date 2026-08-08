import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { BarChartComponent, decimal } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { MacroRegimeService } from '../../../../services/macro-regime.service';

/**
 * How the correlation structure itself moves between regimes.
 *
 * This is the reason regimes matter for allocation at all: it is not only that
 * expected returns change, it is that diversification stops working in exactly
 * the state where it is needed. The equity–bond pair is the sharpest case — it
 * changes sign, not just magnitude.
 *
 * Chart and comparison are **inferred**: the source names this tab in a note
 * without giving a structure. The figures come from the four-state model of
 * Fondamenti §6.
 */
@Component({
  selector: 'app-correlations-by-regime',
  imports: [BarChartComponent],
  templateUrl: './correlations-by-regime.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CorrelationsByRegime {
  private readonly service = inject(MacroRegimeService);

  protected readonly correlations = this.service.correlations;

  /** The four-state vocabulary, which this tab always uses. */
  protected readonly states = ['Crash', 'Slow Growth', 'Bull', 'Recovery'];

  protected readonly regimeA = signal('Crash');
  protected readonly regimeB = signal('Recovery');

  protected readonly pairs = computed(() => this.correlations.map((c) => c.pair));

  protected readonly series = computed<CategorySeries[]>(() => [
    { name: this.regimeA(), data: this.correlations.map((c) => c.byState[this.regimeA()]) },
    { name: this.regimeB(), data: this.correlations.map((c) => c.byState[this.regimeB()]) },
  ]);

  /** Pairs whose correlation changes sign between the two states. */
  protected readonly signFlips = computed(() =>
    this.correlations.filter((c) => {
      const a = c.byState[this.regimeA()];
      const b = c.byState[this.regimeB()];
      return a * b < 0;
    }),
  );

  protected onRegimeA(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // A and B must differ, or the comparison has nothing to compare.
    if (value === this.regimeB()) {
      this.regimeB.set(this.states.find((s) => s !== value) ?? this.regimeB());
    }
    this.regimeA.set(value);
  }

  protected onRegimeB(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === this.regimeA()) {
      this.regimeA.set(this.states.find((s) => s !== value) ?? this.regimeA());
    }
    this.regimeB.set(value);
  }

  protected delta(pair: string): number {
    const row = this.correlations.find((c) => c.pair === pair);
    if (!row) return 0;
    return row.byState[this.regimeB()] - row.byState[this.regimeA()];
  }

  protected readonly decimalFormatter = decimal;
}
