import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import {
  ORDER_STAGE_ICON,
  ORDER_STAGE_LABEL,
  ORDER_SIDE_LABEL,
  ORDER_STATUS_ICON,
  ORDER_STATUS_LABEL,
  type ProposedOrder,
} from '../../../../models/order.model';
import { ExecutionService, type OrderSortKey } from '../../../../services/execution.service';
import {
  formatRisk,
  formatShortfall,
  formatSignedQuantity,
  groupDigits,
  NOT_AVAILABLE,
  UNPRICED_NOTE,
} from '../order-format';

/** Rows shown before "View full table" is used, as the wireframe draws it. */
const COLLAPSED_ROWS = 4;

/** Skeleton rows drawn while the fund-state snapshot is being read. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

/**
 * `proposed_orders` as a table — the region the whole page exists to show.
 *
 * Hand-rolled per the build conventions, and the first table in the app with
 * sortable headers: the `<th>` carries `aria-sort` and the clickable element
 * inside it is a real `<button>`, so the sort state is announced rather than
 * left to a glyph. Docs 19 and 24 copy this shape.
 *
 * Two rules the table is not free to soften:
 *
 * - an order the agent could not schedule prints `—` in both estimate columns
 *   with the reason spelled out for assistive tech, never a plausible-looking
 *   figure;
 * - an order stopped by a rule prints the rule in words next to the glyph,
 *   because `✕` alone does not say which limit was hit.
 *
 * Nothing in here approves, rejects or sends anything. The row's only action is
 * to open the detail panel; the actions with real effect live behind the
 * cross-page links inside it.
 */
@Component({
  selector: 'app-execution-orders-table',
  imports: [ButtonDirective, CrossPageLink, EmptyState, ErrorState, SkeletonBlock],
  templateUrl: './orders-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersTable {
  private readonly service = inject(ExecutionService);

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly sideLabel = ORDER_SIDE_LABEL;
  protected readonly notAvailable = NOT_AVAILABLE;
  protected readonly unpricedNote = UNPRICED_NOTE;

  /** One spelling of `+18 bps` / `±6 bps` for the table and the detail panel. */
  protected readonly shortfall = formatShortfall;
  protected readonly risk = formatRisk;

  protected readonly state = this.service.state;
  protected readonly errorMessage = this.service.errorMessage;
  protected readonly orders = this.service.visibleOrders;
  protected readonly totalCount = this.service.totalCount;
  protected readonly filtersActive = this.service.filtersActive;
  protected readonly sortKey = this.service.sortKey;
  protected readonly sortAscending = this.service.sortAscending;
  protected readonly selectedOrderId = this.service.selectedOrderId;

  /** Collapsed to the wireframe's four rows until the reader asks for more. */
  protected readonly expanded = signal(false);

  protected readonly visibleRows = computed(() =>
    this.expanded() ? this.orders() : this.orders().slice(0, COLLAPSED_ROWS),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.orders().length - COLLAPSED_ROWS),
  );

  /** Filters matched nothing, as opposed to there being no orders at all. */
  protected readonly noMatches = computed(
    () => this.state() === 'ready' && this.orders().length === 0,
  );

  // --- sorting --------------------------------------------------------------

  /**
   * The value `aria-sort` takes on each header.
   *
   * Only the active column gets a direction; every other column is `none`,
   * which is what tells a screen reader the table is sortable at all.
   */
  protected ariaSort(key: OrderSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortAscending() ? 'ascending' : 'descending';
  }

  /** Decorative: `aria-sort` on the header already carries the state. */
  protected sortGlyph(key: OrderSortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortAscending() ? '▲' : '▼';
  }

  protected toggleSort(key: OrderSortKey): void {
    this.service.setSort(key);
  }

  // --- rows -----------------------------------------------------------------

  protected readonly signedQuantity = formatSignedQuantity;

  /**
   * Stage cell glyph and word.
   *
   * A decided or blocked order shows its *status* — a person's refusal and a
   * rule's refusal are different facts and the wireframe prints both. An order
   * still moving shows its *stage*, except at the human gate, where "pending"
   * is the thing the reader is being told.
   */
  protected stageIcon(order: ProposedOrder): string {
    return this.showsStatus(order) ? ORDER_STATUS_ICON[order.status] : ORDER_STAGE_ICON[order.stage];
  }

  /**
   * The full stage name, not the badge-width abbreviation.
   *
   * The wireframe prints "Pre-trade check" and the Stage filter above the table
   * offers "Rule validation"; a cell reading "Rule valid." would be a third
   * spelling of a value the reader is expected to match against the filter they
   * just chose. The table scrolls inside its own box, so there is no width to
   * save here.
   */
  protected stageText(order: ProposedOrder): string {
    return this.showsStatus(order)
      ? ORDER_STATUS_LABEL[order.status]
      : ORDER_STAGE_LABEL[order.stage];
  }

  private showsStatus(order: ProposedOrder): boolean {
    return order.status !== 'pending' || order.stage === 'human-gate';
  }

  /** Blocked and rejected always carry words; so does an approval. */
  protected reasonFor(order: ProposedOrder): string | null {
    return order.status === 'pending' ? null : order.statusReason;
  }

  protected unpriced(order: ProposedOrder): boolean {
    return order.estimatedShortfallBps === null || order.estimatedRiskBps === null;
  }

  // --- schedule sparkline ---------------------------------------------------

  /** Bars share one scale per row; the front-loaded first slice is the tallest. */
  protected barHeight(order: ProposedOrder, slice: number): number {
    const peak = Math.max(...order.trajectory);
    if (peak <= 0) return 0;
    // Floored so a small tail slice is still a visible mark rather than a line.
    return Math.max(10, Math.round((slice / peak) * 100));
  }

  /**
   * The sparkline's textual equivalent, and the accessible name of the control
   * that reaches the full tabular one inside the detail panel.
   */
  protected scheduleText(order: ProposedOrder): string {
    const slices = order.trajectory.map((s) => groupDigits(s)).join(', ');
    return (
      `Schedule for ${order.symbol} over ${order.trajectory.length} intervals: ` +
      `${slices} shares, front-loaded. Opens the trajectory chart.`
    );
  }

  // --- selection ------------------------------------------------------------

  protected toggleRow(order: ProposedOrder): void {
    this.selectedOrderId.update((id) => (id === order.id ? null : order.id));
  }

  /** The schedule control always opens; it never closes a panel it did not open. */
  protected openRow(order: ProposedOrder): void {
    this.selectedOrderId.set(order.id);
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }

  protected retry(): void {
    this.service.clearError();
    void this.service.refresh();
  }
}
