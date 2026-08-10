import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';

import { ORDER_SIDE_LABEL } from '../../../../models/order.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { formatExactNotional, formatShares } from '../approval-format';
import { AuditTrail } from '../audit-trail/audit-trail';
import { AutomatedChecks } from '../automated-checks/automated-checks';
import { DecisionOutcome } from '../decision-outcome/decision-outcome';
import { DecisionRow } from '../decision-row/decision-row';
import { StepTracker } from '../step-tracker/step-tracker';

/**
 * Region 5 — the selected trade, and the frame around regions 6 to 10.
 *
 * Inline rather than a slide-over: the wireframe puts the panel under the queue
 * as part of the page, and the decision the page exists for is taken with the
 * queue still on screen. Selecting a card moves focus here, so the reader hears
 * which trade opened before hearing a control inside it — but only when the
 * selection *changes*, never on the first render, so arriving with a trade
 * already chosen from a deep link does not steal focus from the top of the page.
 *
 * The decision region and the historical-outcome card are mutually exclusive by
 * construction: a trade nobody has answered for gets the buttons, and a trade
 * that has been decided gets the record of what the decision meant. The doc
 * calls this a replacement, and rendering both would let a page offer to
 * re-decide something already decided.
 *
 * A detail that fails to load fails alone. The queue above stays interactive,
 * the filters keep working, and the retry is confined to this panel — the
 * checks and the trail are one trade's, and losing them is not losing the page.
 */
@Component({
  selector: 'app-approval-trade-detail',
  imports: [
    AuditTrail,
    AutomatedChecks,
    DecisionOutcome,
    DecisionRow,
    ErrorState,
    SkeletonBlock,
    StepTracker,
  ],
  templateUrl: './trade-detail.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeDetail {
  private readonly service = inject(ApprovalGateService);

  protected readonly trade = this.service.selectedTrade;
  protected readonly decision = this.service.selectedDecision;
  protected readonly detailLoading = this.service.detailLoading;
  protected readonly detailError = this.service.detailError;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('panelHeading');

  /** The last selection this panel reacted to, so focus moves on a change only. */
  private previous: string | null = null;
  private initialised = false;

  constructor() {
    effect(() => {
      const id = this.service.selectedTradeId();
      if (!this.initialised) {
        // First run. A trade preselected from a deep link is rendered, not
        // pounced on: the reader has not asked for anything yet.
        this.initialised = true;
        this.previous = id;
        return;
      }
      if (id === this.previous) return;
      this.previous = id;
      if (id === null) return;
      this.focusHeading();
    });
  }

  /** `TRD-2031 · AAPL · BUY · 12,400 sh / $2,460,000`. */
  protected readonly headingText = computed(() => {
    const trade = this.trade();
    if (trade === null) return 'Trade detail';
    return (
      `${trade.tradeId} · ${trade.symbol} · ${ORDER_SIDE_LABEL[trade.side]} · ` +
      `${formatShares(trade.quantity)} / ${formatExactNotional(trade.notionalValue)}`
    );
  });

  /**
   * Focuses the panel's heading a microtask after the render that produced it.
   *
   * Also the landing point after a decision: the region the reader was standing
   * in is replaced by the outcome card, and focus would otherwise fall to the
   * document body.
   */
  protected focusHeading(): void {
    queueMicrotask(() => this.heading()?.nativeElement.focus());
  }

  protected reload(): Promise<void> {
    return this.service.loadDetail();
  }
}
