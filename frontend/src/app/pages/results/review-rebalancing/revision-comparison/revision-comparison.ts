import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { ACTION_LABEL, ACTION_NOTE, type RevisionAction } from '../../../../models/review-rebalancing.model';
import { ReviewRebalancingService } from '../../../../services/review-rebalancing.service';

const COLLAPSED_ROWS = 4;

const ACTION_TONE: Record<RevisionAction, StatusTone> = {
  buy: 'ok',
  sell: 'warn',
  hold: 'neutral',
  'buy-short-reduced': 'ok',
  'sell-short-increased': 'warn',
};

/**
 * Current against revised, asset by asset.
 *
 * Under Smith this is the weight comparison and the Δ that follows from it;
 * under Stone-Hill the same decision is posed as an exchange, so the table
 * becomes two rankings and the swap between them. Both are the same question —
 * what to trade — asked by two different models, which is why they share a
 * region rather than sitting side by side.
 */
@Component({
  selector: 'app-revision-comparison',
  imports: [StatusBadge],
  templateUrl: './revision-comparison.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionComparison {
  private readonly service = inject(ReviewRebalancingService);

  protected readonly actionLabel = ACTION_LABEL;
  protected readonly actionNote = ACTION_NOTE;
  protected readonly method = this.service.method;
  protected readonly rows = this.service.rows;
  protected readonly deltaSum = this.service.deltaSum;
  protected readonly deltaSumAnomalous = this.service.deltaSumAnomalous;
  protected readonly buyRanking = this.service.buyRanking;
  protected readonly sellRanking = this.service.sellRanking;
  protected readonly proposedExchange = this.service.proposedExchange;
  protected readonly theta = this.service.theta;

  protected readonly expanded = signal(false);

  protected readonly visibleRows = computed(() =>
    this.expanded() ? this.rows() : this.rows().slice(0, COLLAPSED_ROWS),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.rows().length - COLLAPSED_ROWS),
  );

  /** Top five each side is enough to read the exchange; the rest is noise. */
  protected readonly topBuys = computed(() => this.buyRanking().slice(0, 5));
  protected readonly topSells = computed(() => this.sellRanking().slice(0, 5));

  protected tone(action: RevisionAction): StatusTone {
    return ACTION_TONE[action];
  }
}
