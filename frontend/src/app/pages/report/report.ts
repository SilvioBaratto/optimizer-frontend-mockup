import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import {
  AGENT_FILTERS,
  AUDIT_TABS,
  DATE_RANGES,
  type AgentFilter,
  type AuditTabId,
  type DateRangeId,
} from '../../models/report-audit.model';
import { ReportAuditService } from '../../services/report-audit.service';
import { CollectionStatBar } from '../../shared/collection-stat-bar/collection-stat-bar';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { PaginationComponent } from '../../shared/ui/pagination/pagination';
import { SelectDirective } from '../../shared/ui/select/select.directive';
import { AuditFilters } from './audit-filters/audit-filters';
import { DecisionDetail } from './decision-detail/decision-detail';
import { DecisionTable } from './decision-table/decision-table';
import { ExportMenu } from './export-menu/export-menu';
import { IdempotencyPanel } from './idempotency-panel/idempotency-panel';
import { PostureCard } from './posture-card/posture-card';
import { ProvenancePanel } from './provenance-panel/provenance-panel';

/**
 * `docs/24 Report & Audit trail.md` — the record of what the other eleven
 * pages did.
 *
 * Three claims the page is built around, and each of them is a claim about
 * what is *not* promised:
 *
 * - the log holds model, parameters and the full output of every agent
 *   decision, which makes an audit possible by reading it. It does not make
 *   the decision reproducible: whether `temperature=0` and a fixed seed are
 *   even honoured depends on the Ollama model, so most rows carry no prompt
 *   hash and that is the expected state of the system rather than a gap in it;
 * - order idempotency is a documented requirement, not a running mechanism.
 *   The orders API it exists for is not idempotent, so a client-side key, a
 *   pre-POST deduplication check and a reconciliation poll are owed by the
 *   broker adapter — and with no adapter registered, the default posture,
 *   there is nothing to key, deduplicate or reconcile. The tab is empty
 *   because of that posture, which the page reads from `ExecutionService`
 *   rather than asserting on its own;
 * - positions are the domain's. They arrive by manual entry or CSV import and
 *   a configured broker would synchronise them, never source them.
 *
 * Changing tab keeps the Agent and Date range filters, because they describe
 * what the reader is looking for and not which table they happen to be
 * looking at. The shell renders the `<h1>` and the breadcrumb, so headings
 * here start at `<h2>`.
 */
@Component({
  selector: 'app-report',
  imports: [
    AuditFilters,
    CollectionStatBar,
    DecisionDetail,
    DecisionTable,
    ExportMenu,
    IdempotencyPanel,
    PaginationComponent,
    PostureCard,
    ProvenancePanel,
    SelectDirective,
    StatusBanner,
  ],
  templateUrl: './report.html',
  styleUrl: './report.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Report {
  private readonly service = inject(ReportAuditService);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabs = AUDIT_TABS;
  protected readonly pageSizes = this.service.pageSizes;

  protected readonly activeTab = this.service.tab;
  protected readonly activeTabTitle = computed(() => this.service.activeTab().title);
  protected readonly state = this.service.state;
  protected readonly loading = this.service.loading;
  protected readonly errorMessage = this.service.errorMessage;
  protected readonly statParts = this.service.statParts;

  protected readonly page = this.service.page;
  protected readonly pageCount = this.service.pageCount;
  protected readonly pageSize = this.service.pageSize;
  protected readonly filteredCount = this.service.filteredCount;

  /**
   * Pagination is the decision log's, and only the decision log's.
   *
   * It stays up on a single page — "Page 1 of 1" with both arrows out of
   * bounds — because the spec's control table asks for the indicator to be
   * present and *disabled* past the limits, not to disappear: a control that
   * vanishes when a filter narrows the set takes the reader's place in the
   * list away with it. It is withdrawn only where there is genuinely nothing
   * to page: the other two tabs, a blank view mid-read, and an empty result.
   */
  protected readonly showPagination = computed(
    () =>
      this.activeTab() === 'decision-log' && this.state() !== 'loading' && this.filteredCount() > 0,
  );

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  constructor() {
    /*
      Doc 16 and doc 09 deep-link into this page with «View audit log», which
      arrives with the agent and the date range already chosen. Read once from
      the entry snapshot: it is an entry condition, not state to keep in step
      with the URL, and an unrecognised value is ignored rather than applied.
    */
    const params = this.route.snapshot.queryParamMap;

    const agent = params.get('agent');
    if (agent && AGENT_FILTERS.includes(agent as AgentFilter)) {
      this.service.setAgentFilter(agent as AgentFilter);
    }

    const range = params.get('range');
    if (range && DATE_RANGES.includes(range as DateRangeId)) {
      this.service.setDateRange(range as DateRangeId);
    }

    const tab = params.get('tab');
    if (tab && AUDIT_TABS.some((t) => t.id === tab)) this.service.setTab(tab as AuditTabId);
  }

  // --- tabs -----------------------------------------------------------------

  /**
   * Selecting a tab.
   *
   * Refused while the log is being re-read — the strip is marked
   * `aria-disabled` rather than `disabled`, so the reader keeps their focus
   * where it is instead of being dropped at the top of the document, and the
   * refusal has to live here because an `aria-disabled` button is still
   * clickable.
   */
  protected selectTab(tab: AuditTabId): void {
    if (this.loading()) return;
    this.service.setTab(tab);
  }

  /** Roving tabindex: arrows move between tabs, Home and End jump to the ends. */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const count = this.tabs.length;
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;

    event.preventDefault();
    this.selectTab(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  // --- pagination -----------------------------------------------------------

  protected onPage(page: number): void {
    this.service.setPage(page);
  }

  protected onPageSize(event: Event): void {
    this.service.setPageSize(Number((event.target as HTMLSelectElement).value));
  }

  // --- error ----------------------------------------------------------------

  protected retry(): Promise<void> {
    this.service.clearError();
    return this.service.refresh();
  }
}
