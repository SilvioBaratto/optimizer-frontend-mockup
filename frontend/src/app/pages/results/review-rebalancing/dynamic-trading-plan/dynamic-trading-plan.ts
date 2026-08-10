import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { BarChartComponent, LineChartComponent, decimal } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { ReviewRebalancingService } from '../../../../services/review-rebalancing.service';
import { MathVar } from '../../../../shared/math/math-var';

/**
 * How fast to move toward the target, and why not all the way (Fondamenti
 * §10–§12).
 *
 * With trading costs the optimum is never today's Markowitz portfolio; it is a
 * partial step toward an aim that already discounts each signal by how fast it
 * decays. That is the whole reason a dynamic policy beats a static one net of
 * cost even when it loses gross.
 *
 * The three charts here are **inferred**: the source names them in prose inside
 * a collapsed panel with no axes or series. Their shapes follow the
 * propositions cited above and should be expected to change under a later spec
 * pass.
 */
@Component({
  selector: 'app-dynamic-trading-plan',
  imports: [BarChartComponent, CrossPageLink, LineChartComponent, MathVar],
  templateUrl: './dynamic-trading-plan.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicTradingPlan {
  private readonly service = inject(ReviewRebalancingService);

  protected readonly tradeRate = this.service.tradeRate;
  protected readonly aimWeight = this.service.aimWeight;
  protected readonly beyondTolerance = this.service.beyondTolerance;
  protected readonly riskAversion = this.service.riskAversion;
  protected readonly costParameter = this.service.costParameter;
  protected readonly discount = this.service.discount;
  protected readonly policies = this.service.policyComparison;
  protected readonly decimalFormatter = decimal;

  protected readonly open = signal(false);

  protected readonly assetCount = computed(() => this.service.aimComparison().length);

  protected readonly aimCategories = computed(() =>
    this.service.aimComparison().map((a) => a.ticker),
  );

  protected readonly aimSeries = computed<CategorySeries[]>(() => {
    const rows = this.service.aimComparison();
    return [
      { name: 'Current position', data: rows.map((a) => a.current) },
      { name: 'Aim portfolio', data: rows.map((a) => a.aim) },
    ];
  });

  protected readonly homingLabels = computed(() =>
    this.service.homingPath().map((p) => String(p.period)),
  );

  protected readonly homingSeries = computed<CategorySeries[]>(() => {
    const path = this.service.homingPath();
    return [
      { name: 'Position', data: path.map((p) => p.position) },
      { name: 'Aim', data: path.map((p) => p.aim) },
    ];
  });

  protected readonly policyCategories = this.policies.map((p) => p.policy);

  protected readonly policySeries: CategorySeries[] = [
    { name: 'Sharpe, gross of cost', data: this.policies.map((p) => p.gross) },
    { name: 'Sharpe, net of cost', data: this.policies.map((p) => p.net) },
  ];
}
