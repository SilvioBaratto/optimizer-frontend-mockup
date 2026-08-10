import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  AGENT_FILTERS,
  AGENT_FILTER_LABEL,
  DATE_RANGES,
  DATE_RANGE_LABEL,
  DECISION_TYPE_FILTERS,
  DECISION_TYPE_FILTER_LABEL,
  type AgentFilter,
  type DateRangeId,
  type DecisionTypeFilter,
} from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { FilterChipBar } from '../../../shared/filter-chip-bar/filter-chip-bar';
import { RefreshControl } from '../../../shared/refresh-control/refresh-control';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';

/**
 * Region 3 — Agent, Decision type, Date range and the free-text search.
 *
 * The two kinds of control behave differently on purpose, and the doc is
 * explicit about it: a select applies the moment it changes, while the search
 * waits for Enter or the Search button. Typing narrows a table on every
 * keystroke only if you are willing to re-announce the live count once per
 * letter, which is the opposite of what a polite region is for.
 *
 * The Decision type select is absent on the other two tabs rather than
 * disabled: an order idempotency record and a position have no decision type,
 * so the control has nothing to apply to. Its value survives the trip — coming
 * back to the log restores the query the reader left it with — and the Agent
 * and Date range selects stay put throughout, which is the rule the Regioni
 * table states.
 *
 * Refresh is not in the wireframe's control list. It is here because the spec
 * mandates a loading state and an error state with a retry, and neither is
 * reachable on a page whose every other control filters an in-memory set. It
 * sits with the filters rather than in the ActionButtonRow, which the doc
 * reserves for Export alone.
 */
@Component({
  selector: 'app-report-audit-filters',
  imports: [ButtonDirective, FilterChipBar, RefreshControl, SelectDirective],
  templateUrl: './audit-filters.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditFilters {
  private readonly service = inject(ReportAuditService);

  protected readonly agents = AGENT_FILTERS;
  protected readonly agentLabel = AGENT_FILTER_LABEL;
  protected readonly decisionTypes = DECISION_TYPE_FILTERS;
  protected readonly decisionTypeLabel = DECISION_TYPE_FILTER_LABEL;
  protected readonly ranges = DATE_RANGES;
  protected readonly rangeLabel = DATE_RANGE_LABEL;

  protected readonly agentFilter = this.service.agentFilter;
  protected readonly decisionTypeFilter = this.service.decisionTypeFilter;
  protected readonly dateRange = this.service.dateRange;
  protected readonly filtersActive = this.service.filtersActive;
  protected readonly loading = this.service.loading;

  protected readonly showDecisionType = computed(() => this.service.tab() === 'decision-log');

  /**
   * What is in the field, which is not yet what is being searched for.
   *
   * The service holds it so the table's "Reset filters" — two regions away —
   * empties the field as well as the query.
   */
  protected readonly draft = this.service.searchDraft;

  /** The reader typed something and has not submitted it yet. */
  protected readonly unsubmitted = computed(() => this.draft().trim() !== this.service.search());

  protected onAgent(event: Event): void {
    this.service.setAgentFilter((event.target as HTMLSelectElement).value as AgentFilter);
  }

  protected onDecisionType(event: Event): void {
    this.service.setDecisionTypeFilter(
      (event.target as HTMLSelectElement).value as DecisionTypeFilter,
    );
  }

  protected onRange(event: Event): void {
    this.service.setDateRange((event.target as HTMLSelectElement).value as DateRangeId);
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  /** Enter in the field and the Search button are the same act. */
  protected submitSearch(): void {
    this.service.applySearch();
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }

  protected refresh(): Promise<void> {
    return this.service.refresh();
  }
}
