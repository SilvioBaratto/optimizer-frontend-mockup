import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { FilterChipBar } from '../../../shared/filter-chip-bar/filter-chip-bar';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { RefreshControl } from '../../../shared/refresh-control/refresh-control';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';
import {
  EXECUTION_RUN_STATUS_ICON,
  EXECUTION_RUN_STATUS_LABEL,
  ORDER_STAGES,
  ORDER_STAGE_LABEL,
  ORDER_SIDE_LABEL,
  type OrderSide,
  type OrderStage,
} from '../../../models/order.model';
import { ExecutionService } from '../../../services/execution.service';
import { BrokerBanner } from './broker-banner/broker-banner';
import { OrderDetailPanel } from './order-detail-panel/order-detail-panel';
import { OrdersTable } from './orders-table/orders-table';
import { RunLog } from './run-log/run-log';

const SIDES: readonly OrderSide[] = ['buy', 'sell'];

/**
 * `docs/15 Execution & Orders Agent.md` — the fourth agent of the fund, and the
 * page where the trust boundary is drawn.
 *
 * The agent turns the target portfolio into a list of orders: it sizes the
 * turnover, schedules each order over the trading horizon and estimates what
 * that schedule costs — the implementation shortfall the market impact
 * generates — against how much timing risk it carries. Then it stops. Every
 * tool it can reach reads state or computes on it; the only field it writes is
 * `proposed_orders`.
 *
 * So this page has no approve control, no reject control and no send control,
 * and that absence is the page's argument rather than an omission. The orders
 * pass a deterministic pre-trade check, a rules engine and a human gate before
 * anything leaves the system, and each of those lives on its own page behind
 * its own confirmation. What is here is everything needed to *read* the
 * proposal: the list, the schedule behind each line, where each order stands,
 * and the trace of the run that produced it.
 *
 * Regions follow the spec in order. The shell renders the `<h1>`, so headings
 * here start at `<h2>`.
 */
@Component({
  selector: 'app-execution-agent',
  imports: [
    BrokerBanner,
    ButtonDirective,
    FilterChipBar,
    OrderDetailPanel,
    OrdersTable,
    PageContextBar,
    RefreshControl,
    RunLog,
    SelectDirective,
    SkeletonBlock,
  ],
  templateUrl: './execution-agent.html',
  styleUrl: './execution-agent.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionAgent {
  private readonly service = inject(ExecutionService);

  protected readonly stages = ORDER_STAGES;
  protected readonly stageLabel = ORDER_STAGE_LABEL;
  protected readonly sides = SIDES;
  protected readonly sideLabel = ORDER_SIDE_LABEL;

  protected readonly state = this.service.state;
  protected readonly runStatus = this.service.runStatus;
  protected readonly lastRun = this.service.lastRun;
  protected readonly snapshotAt = this.service.snapshotAt;
  protected readonly staleTarget = this.service.staleTarget;
  protected readonly generatedFromTarget = this.service.generatedFromTarget;
  protected readonly latestTarget = this.service.latestTarget;

  protected readonly totalCount = this.service.totalCount;
  protected readonly visibleCount = this.service.visibleCount;
  protected readonly pendingApprovalCount = this.service.pendingApprovalCount;
  protected readonly blockedCount = this.service.blockedCount;
  protected readonly filtersActive = this.service.filtersActive;

  protected readonly symbolQuery = this.service.symbolQuery;
  protected readonly stageFilter = this.service.stageFilter;
  protected readonly sideFilter = this.service.sideFilter;

  /** Shared by the toolbar's link and the log panel's button — one disclosure. */
  protected readonly fullTrace = signal(false);

  protected readonly loading = computed(() => this.state() === 'loading');

  protected readonly runIcon = computed(() => EXECUTION_RUN_STATUS_ICON[this.runStatus()]);
  protected readonly runLabel = computed(() => EXECUTION_RUN_STATUS_LABEL[this.runStatus()]);

  /**
   * "N of M orders" only while a filter is narrowing the list; the wireframe's
   * unfiltered reading is a plain "14 orders".
   */
  protected readonly filteredTotal = computed(() =>
    this.filtersActive() ? this.totalCount() : null,
  );

  protected readonly summary = computed(
    () => `${this.pendingApprovalCount()} pending approval · ${this.blockedCount()} blocked`,
  );

  // --- filters --------------------------------------------------------------

  protected onSymbolQuery(event: Event): void {
    this.symbolQuery.set((event.target as HTMLInputElement).value);
  }

  protected onStage(event: Event): void {
    this.stageFilter.set((event.target as HTMLSelectElement).value as OrderStage | 'all');
  }

  protected onSide(event: Event): void {
    this.sideFilter.set((event.target as HTMLSelectElement).value as OrderSide | 'all');
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }

  // --- toolbar --------------------------------------------------------------

  /** Re-reads the fund-state snapshot. It never starts an agent run. */
  protected refresh(): Promise<void> {
    return this.service.refresh();
  }

  protected toggleFullTrace(): void {
    this.fullTrace.set(!this.fullTrace());
  }
}
