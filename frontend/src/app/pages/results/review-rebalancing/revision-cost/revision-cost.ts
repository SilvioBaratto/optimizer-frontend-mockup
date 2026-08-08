import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ReviewRebalancingService } from '../../../../services/review-rebalancing.service';

/**
 * The three costs a revision incurs (Fondamenti §4).
 *
 * Data and processing is fixed — paid in every period, revision or not. The
 * other two are variable, and the tax is the sharpest case of that: it is owed
 * only where a disposal actually realises a gain, which is why the per-asset
 * breakdown shows a dash rather than a zero on the rows that realise nothing.
 * A zero would read as "computed and came out at nothing".
 */
@Component({
  selector: 'app-revision-cost',
  templateUrl: './revision-cost.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionCost {
  private readonly service = inject(ReviewRebalancingService);

  protected readonly cost = this.service.cost;
  protected readonly taxRate = this.service.taxRate;
  protected readonly rows = this.service.rows;

  protected readonly transactionOpen = signal(false);
  protected readonly taxOpen = signal(false);

  /** Only the rows that actually trade can incur a transaction cost. */
  protected readonly tradingRows = this.service.tradingRows;

  /** Every disposal, whether or not it realises a gain — the dashes matter. */
  protected readonly disposalRows = computed(() =>
    this.rows().filter((r) => r.action === 'sell' || r.action === 'sell-short-increased' || r.realisedGain > 0),
  );

  protected onTaxRate(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value) || value < 0 || value >= 100) return;
    this.taxRate.set(value);
  }

  protected onBuyCost(ticker: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value) && value >= 0) this.service.setBuyCost(ticker, value);
  }

  protected onSellCost(ticker: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value) && value >= 0) this.service.setSellCost(ticker, value);
  }

  protected money(value: number): string {
    return value.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  }
}
