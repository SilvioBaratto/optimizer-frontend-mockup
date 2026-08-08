import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { LineChartComponent, decimal } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { IC_VIEW_LABEL, type IcView } from '../../../../models/review-rebalancing.model';
import { ReviewRebalancingService } from '../../../../services/review-rebalancing.service';

/** ρ_target grid the trade-off is plotted over. */
const RHO_GRID = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.89, 0.92, 0.95, 0.98];

/**
 * Why the signal produces the turnover it does (Fondamenti §7–§9).
 *
 * A diagnostic, not a control: nothing here changes the revision above. It
 * explains the cost side of it — a signal that decays fast has to be chased,
 * and chasing it is what the transaction costs are paying for.
 *
 * The three charts in this panel are **inferred**, not specified: the source
 * document names them in prose inside a collapsed panel and gives no axes or
 * series. Their shapes follow the formulas in §7 and §9, and a later spec pass
 * should be expected to correct them.
 */
@Component({
  selector: 'app-signal-persistence',
  imports: [LineChartComponent],
  templateUrl: './signal-persistence.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalPersistence {
  private readonly service = inject(ReviewRebalancingService);

  protected readonly icViewLabel = IC_VIEW_LABEL;
  protected readonly icViews: readonly IcView[] = ['conventional', 'lagged', 'horizon'];
  protected readonly factors = this.service.factors;
  protected readonly factorId = this.service.factorId;
  protected readonly factor = this.service.factor;
  protected readonly icView = this.service.icView;
  protected readonly targetAutocorrelation = this.service.targetAutocorrelation;
  protected readonly turnover = this.service.turnover;
  protected readonly informationRatio = this.service.informationRatio;
  protected readonly optimalRho = this.service.optimalAutocorrelation;
  protected readonly decimalFormatter = decimal;

  protected readonly open = signal(false);

  protected readonly lagLabels = computed(() =>
    this.factor().laggedIc.map((_, i) => String(i)),
  );

  /**
   * The three coefficients over lag. Conventional is the lag-0 value held flat
   * for reference; lagged is the measured decay; horizon accumulates it as
   * IC·√(h+1), which is what makes a persistent signal worth more (§7).
   */
  protected readonly icSeries = computed<CategorySeries[]>(() => {
    const ic = this.factor().laggedIc;
    const view = this.icView();

    if (view === 'conventional') {
      // The conventional IC is a single number, IC_{t,t}. Drawn alone it is a
      // flat line saying nothing, so it is drawn as the reference level the
      // lagged values decay away from — which is the comparison being asked for.
      return [
        { name: 'Conventional IC (lag 0)', data: ic.map(() => ic[0]) },
        { name: 'Lagged IC', data: [...ic] },
      ];
    }
    if (view === 'lagged') {
      return [{ name: 'Lagged IC', data: [...ic] }];
    }
    const cumulative: number[] = [];
    let running = 0;
    ic.forEach((value, h) => {
      running += value;
      cumulative.push(running / Math.sqrt(h + 1));
    });
    return [{ name: 'Horizon IC', data: cumulative }];
  });

  protected readonly rhoLabels = RHO_GRID.map((r) => r.toFixed(2));

  protected readonly turnoverSeries = computed<CategorySeries[]>(() => [
    { name: 'Turnover T', data: RHO_GRID.map((r) => this.service.turnoverAt(r)) },
  ]);

  protected readonly irSeries = computed<CategorySeries[]>(() => [
    { name: 'Information ratio', data: RHO_GRID.map((r) => this.service.informationRatioAt(r)) },
  ]);

  protected onFactor(event: Event): void {
    this.factorId.set((event.target as HTMLSelectElement).value);
  }

  protected onRho(event: Event): void {
    this.targetAutocorrelation.set(Number((event.target as HTMLInputElement).value) / 100);
  }
}
