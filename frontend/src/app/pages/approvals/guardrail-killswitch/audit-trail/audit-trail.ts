import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  GUARDRAIL_OUTCOME_LABEL,
  NO_EVENTS_MESSAGE,
  PIPELINE_STEP_LABEL,
  type GuardrailEvent,
} from '../../../../models/guardrail.model';
import { ORDER_STAGES } from '../../../../models/order.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SlideOverComponent } from '../../../../shared/ui/slide-over/slide-over';
import { NOT_APPLICABLE } from '../guardrail-format';

const EXPORT_FILENAME = 'guardrail-audit-trail.csv';

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

const NO_ORIGINAL_ERROR =
  'Nothing was raised at this checkpoint — the transition is recorded because every state ' +
  'transition is, not because something went wrong.';

/**
 * Regions 7 and 8 — the checkpointed trail, and the original error behind a row.
 *
 * The chips, the search field and the export all act on one filtered view, and
 * the chip counts are computed from the search alone, so a count never
 * disappears because its own chip is off. Export is refused when that view is
 * empty rather than producing a header-only file.
 *
 * The drawer is the point of the region. Every failure here was raised as a
 * `ValueError` or a `PydanticCustomError`, and the drawer prints that text
 * verbatim in a `<pre>` — the same string the backend log holds. A drawer that
 * summarised it would make the screen and the log two accounts of one event.
 */
@Component({
  selector: 'app-audit-trail',
  imports: [
    ButtonDirective,
    EmptyState,
    EntityCard,
    ErrorState,
    FilterChipBar,
    SectionCardGrid,
    SkeletonBlock,
    SlideOverComponent,
    StatusBadge,
  ],
  templateUrl: './audit-trail.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditTrail {
  private readonly service = inject(GuardrailService);

  protected readonly stages = ORDER_STAGES;
  protected readonly stageLabel = PIPELINE_STEP_LABEL;
  protected readonly outcomeLabel = GUARDRAIL_OUTCOME_LABEL;
  protected readonly noEventsMessage = NO_EVENTS_MESSAGE;
  protected readonly noOriginalError = NO_ORIGINAL_ERROR;
  protected readonly notApplicable = NOT_APPLICABLE;
  protected readonly skeletonRows = SKELETON_ROWS;

  protected readonly search = this.service.search;
  protected readonly stageFilter = this.service.stageFilter;
  protected readonly countByStage = this.service.eventCountByStage;
  protected readonly rows = this.service.pagedEvents;
  protected readonly visibleCount = this.service.visibleEventCount;
  protected readonly totalCount = computed(() => this.service.events().length);
  protected readonly canLoadMore = this.service.canLoadMore;
  protected readonly eventsEmpty = this.service.eventsEmpty;
  protected readonly exportDisabled = this.service.exportDisabled;
  protected readonly filtersActive = this.service.filtersActive;
  protected readonly selected = this.service.selectedEvent;
  protected readonly error = this.service.auditError;

  protected readonly busy = computed(
    () => this.service.loading() || this.service.pendingRegion() === 'audit',
  );

  protected readonly drawerOpen = computed(() => this.selected() !== null);

  protected readonly summary = computed(
    () => `Showing ${this.rows().length} of ${this.visibleCount()} matching events`,
  );

  protected readonly drawerLabel = computed(() => {
    const event = this.selected();
    if (event === null) return 'Guardrail event detail';
    return `Guardrail event detail — ${event.tradeId ?? event.at}`;
  });

  /** Set only by Export, so the live region never announces on load. */
  protected readonly exportNotice = signal('');

  // --- rows -----------------------------------------------------------------

  protected title(event: GuardrailEvent): string {
    return `${event.at} · ${event.tradeId ?? NOT_APPLICABLE}`;
  }

  protected meta(event: GuardrailEvent): string {
    return `${event.date} · ${this.stageLabel[event.stage]} · ${event.actor ?? NOT_APPLICABLE}`;
  }

  /** The descriptive name the doc asks the detail control to carry. */
  protected detailLabel(event: GuardrailEvent): string {
    const what = event.outcome === 'fail' ? 'validation error' : 'checkpoint detail';
    return event.tradeId === null
      ? `View ${what} for the guardrail change at ${event.at}`
      : `View ${what} for ${event.tradeId}`;
  }

  // --- filters --------------------------------------------------------------

  protected stageActive(stage: (typeof ORDER_STAGES)[number]): boolean {
    return this.stageFilter().includes(stage);
  }

  protected toggleStage(stage: (typeof ORDER_STAGES)[number]): void {
    this.service.toggleStage(stage);
  }

  protected onSearch(value: string): void {
    this.service.search.set(value);
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }

  protected loadMore(): void {
    this.service.loadMore();
  }

  /**
   * Exports the filtered view.
   *
   * The download is best-effort — object URLs do not exist in every host — but
   * the announcement is not: the reader is told how many rows left the page,
   * which is the part that matters for an audit export.
   */
  protected exportCsv(): void {
    if (this.exportDisabled()) return;
    const csv = this.service.exportCsv();
    this.exportNotice.set(`Exported ${this.visibleCount()} events to ${EXPORT_FILENAME}`);
    if (typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = EXPORT_FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  }

  // --- the detail drawer ----------------------------------------------------

  protected open(event: GuardrailEvent): void {
    this.service.selectEvent(event.id);
  }

  /** Closing destroys the trap, which hands focus back to the row's button. */
  protected close(): void {
    this.service.selectEvent(null);
  }

  protected retry(): Promise<void> {
    return this.service.retryRegion('audit');
  }
}
