import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';

import {
  NO_TRADES_DETAIL,
  NO_TRADES_MESSAGE,
  type ApprovalQueueRow,
} from '../../../../models/approval.model';
import {
  ORDER_SIDE_LABEL,
  ORDER_STAGE_SHORT_LABEL,
  ORDER_STATUS_LABEL,
} from '../../../../models/order.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { formatNotional, formatShares } from '../approval-format';

/**
 * Nothing is proposed at all — a different situation from a filter that matches
 * nothing, and it must not be explained by telling the reader to widen filters
 * that would still match nothing.
 */
const QUEUE_EMPTY_DETAIL =
  'The execution agent has proposed no trades in this snapshot, so nothing is waiting on a ' +
  'decision at any of the four steps.';

/**
 * Region 4 — the queue, as selectable cards on a real grid.
 *
 * Two things here are the doc's and not the component library's.
 *
 * **The grid roles.** The spec asks for grid / row / gridcell with ArrowUp and
 * ArrowDown moving between cards and Enter opening one, *alongside* ordinary
 * Tab. That last clause is why there is no roving tabindex: every card stays in
 * the tab order, and the arrows are an extra way to move, not a replacement.
 * Enter is handled explicitly rather than left to the button's native
 * activation, so the grid's keyboard contract is one code path instead of two
 * that could diverge.
 *
 * **Every card carries its step in words.** A trade sits on exactly one of the
 * four mandatory steps and the badge names it; a decided or blocked trade
 * carries a second badge for its status, because "at the human gate" and
 * "already rejected" are different facts and one badge cannot hold both. Cards
 * away from the human gate stay selectable — they open a read-only panel — so
 * that the page can answer "where did my trade get to" without the reader
 * having to guess from a filter that hides it.
 */
@Component({
  selector: 'app-approval-queue',
  imports: [ButtonDirective, EmptyState, EntityCard, SectionCardGrid, StatusBadge],
  templateUrl: './approval-queue.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalQueue {
  private readonly service = inject(ApprovalGateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly emptyTitle = NO_TRADES_MESSAGE;

  protected readonly rows = this.service.visibleQueue;
  protected readonly queueEmpty = this.service.queueEmpty;
  protected readonly totalCount = this.service.totalCount;
  protected readonly visibleCount = this.service.visibleCount;
  protected readonly selectedId = this.service.selectedTradeId;

  protected readonly statusLabel = ORDER_STATUS_LABEL;

  /** How many trades the current filters are keeping out of view. */
  protected readonly hiddenCount = computed(() => this.totalCount() - this.visibleCount());

  protected readonly emptyDetail = computed(() =>
    this.totalCount() === 0 ? QUEUE_EMPTY_DETAIL : NO_TRADES_DETAIL,
  );

  /** Names the grid *and* states its order, which is otherwise invisible. */
  protected readonly gridLabel = computed(
    () => `Approval queue — ${this.visibleCount()} trades, longest waiting first`,
  );

  protected title(row: ApprovalQueueRow): string {
    return `${row.tradeId} · ${row.symbol} · ${ORDER_SIDE_LABEL[row.side]}`;
  }

  protected meta(row: ApprovalQueueRow): string {
    return `${formatShares(row.quantity)} · ${formatNotional(row.notionalValue)} · queued ${row.queuedAt}`;
  }

  /** `HUMAN GATE`, `RULE VALID.` — the wireframe's badge, at the wireframe's width. */
  protected stageBadge(row: ApprovalQueueRow): string {
    return ORDER_STAGE_SHORT_LABEL[row.stage].toUpperCase();
  }

  /**
   * Only a trade actually waiting on a person is `active`.
   *
   * A trade at the human gate that has already been decided is not asking for
   * anything, and giving it the same tone as the three that are would put the
   * page's one call to action on six cards instead of three.
   *
   * Everything else is `neutral` rather than `pending`. The `pending` tone is
   * `text-text-tertiary` on `bg-surface-inset`, which measures 3.34:1 — under
   * the 4.5:1 this badge's own text needs, and the doc puts StatusBadge
   * contrast in both themes in its acceptance criteria. Nothing is lost by the
   * swap: a trade still waiting on a machine carries no second badge, and one
   * that has been answered carries its outcome in words beside this one.
   */
  protected stageTone(row: ApprovalQueueRow): StatusTone {
    return row.decidable ? 'active' : 'neutral';
  }

  protected statusTone(row: ApprovalQueueRow): StatusTone {
    switch (row.status) {
      case 'approved':
        return 'ok';
      case 'rejected':
      case 'blocked':
        return 'alert';
      default:
        return 'pending';
    }
  }

  protected open(tradeId: string): void {
    this.service.select(tradeId);
  }

  /**
   * Drops every filter, rather than restoring the page's opening pair.
   *
   * "View full queue" is offered next to the count of what is hidden, so it has
   * to show all of it — `clearFilters()` would put the reader back on Human
   * Gate / Pending, which is where they already were.
   */
  protected viewFullQueue(): void {
    this.service.stepFilter.set('all');
    this.service.statusFilter.set('all');
    this.service.search.set('');
  }

  /**
   * Arrow keys move, Enter opens; Tab is untouched.
   *
   * Focus is read from the document rather than tracked in a signal: the cards
   * are ordinary tab stops, so the reader can arrive at any of them without
   * this component hearing about it, and a remembered index would be wrong the
   * first time they did.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const cards = this.cards();
    const active = document.activeElement;
    const index = cards.findIndex((card) => card === active || card.contains(active));
    if (index === -1) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(Math.max(index + step, 0), cards.length - 1);
      // The grid does not wrap: Down on the last card stays on the last card,
      // so a reader holding the key does not silently re-enter at the top.
      event.preventDefault();
      cards[next].focus();
      return;
    }

    if (event.key === 'Enter') {
      // Suppresses the button's own activation so the selection happens once.
      event.preventDefault();
      cards[index].click();
    }
  }

  private cards(): HTMLButtonElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="gridcell"] button'),
    );
  }
}
