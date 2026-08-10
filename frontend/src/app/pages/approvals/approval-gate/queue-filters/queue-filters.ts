import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  APPROVAL_STATUS_FILTERS,
  APPROVAL_STATUS_FILTER_LABEL,
  APPROVAL_STEP_FILTERS,
  APPROVAL_STEP_FILTER_LABEL,
  type ApprovalStatusFilter,
  type ApprovalStepFilter,
} from '../../../../models/approval.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import { RefreshControl } from '../../../../shared/refresh-control/refresh-control';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/**
 * Region 2 — the step filter, the status filter, the search and Refresh.
 *
 * The step filter opens on Human Gate and the status filter on Pending because
 * that pair is the page's subject: it is the only step at which a person is
 * being asked for something. The other three steps stay reachable through the
 * same control, read-only, so a reader can see where a trade got to without
 * leaving the page.
 *
 * Every control stays interactive while the queue is loading and while it has
 * failed. The spec asks for the second explicitly — "il FilterChipBar resta
 * interagibile per un nuovo tentativo" — and the first follows from the same
 * reasoning: none of these controls calls the backend, they narrow a list that
 * is already in memory.
 *
 * This is also the skip link's target. The `<section>` carries `tabindex="-1"`
 * so the link lands on the region rather than on whichever control happens to
 * be first inside it.
 */
@Component({
  selector: 'app-approval-queue-filters',
  imports: [ButtonDirective, FilterChipBar, RefreshControl, SelectDirective],
  templateUrl: './queue-filters.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueFilters {
  private readonly service = inject(ApprovalGateService);

  protected readonly steps = APPROVAL_STEP_FILTERS;
  protected readonly stepLabel = APPROVAL_STEP_FILTER_LABEL;
  protected readonly statuses = APPROVAL_STATUS_FILTERS;
  protected readonly statusLabel = APPROVAL_STATUS_FILTER_LABEL;

  protected readonly stepFilter = this.service.stepFilter;
  protected readonly statusFilter = this.service.statusFilter;
  protected readonly search = this.service.search;
  protected readonly filtersActive = this.service.filtersActive;

  protected readonly loading = this.service.loading;

  /**
   * The second live line: how many trades are actually waiting on a person.
   *
   * Counted over the whole queue rather than the filtered view, because it
   * answers "is there anything for me to do", and narrowing the chips does not
   * change that answer.
   */
  protected readonly summary = computed(() => {
    const waiting = this.service.pendingAtGateCount();
    return `${waiting} waiting on a human decision`;
  });

  protected onStep(event: Event): void {
    this.stepFilter.set((event.target as HTMLSelectElement).value as ApprovalStepFilter);
  }

  protected onStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as ApprovalStatusFilter);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }

  /** Re-reads the queue. Filters and selection are the service's to keep. */
  protected refresh(): Promise<void> {
    return this.service.refresh();
  }
}
