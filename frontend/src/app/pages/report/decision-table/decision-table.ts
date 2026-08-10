import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  AUDIT_AGENT_LABEL,
  DECISION_TYPE_LABEL,
  NOT_LOGGED_GLYPH,
  NOT_LOGGED_LABEL,
  type AuditDecision,
  type DecisionSortKey,
} from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';

/** Placeholder rows while the log is being read. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Region 6 — the decision log itself.
 *
 * Hand-rolled per the build conventions, with the sortable-header idiom doc 15
 * established: `aria-sort` on the `<th>`, a real `<button>` inside it, one
 * direction at a time.
 *
 * The column the page turns on is Hash. A decision logged without a prompt
 * hash prints `—` with `not logged` as its accessible name, in ordinary body
 * type: it is neither an error nor a blank. The models this fund runs do not
 * guarantee reproducibility, so a decision with no hash is the expected case —
 * most of the rows in the log — and styling it as a warning would tell the
 * reader to go and fix something that is working as designed.
 *
 * The count is deliberately not restated here. `ReportAuditService` states it
 * once and `report-audit.service.spec.ts` pins it; a second copy in a comment
 * beside a table that renders the real figure is how it goes stale.
 *
 * Two empty states, and only one of them offers a reset. "No decisions match
 * these filters" has filters to clear; "No decisions logged yet" does not, and
 * a reset button there would be a control that does nothing.
 */
@Component({
  selector: 'app-report-decision-table',
  imports: [ButtonDirective, EmptyState, SkeletonBlock],
  templateUrl: './decision-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTable {
  private readonly service = inject(ReportAuditService);

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly agentLabel = AUDIT_AGENT_LABEL;
  protected readonly typeLabel = DECISION_TYPE_LABEL;
  protected readonly notLoggedGlyph = NOT_LOGGED_GLYPH;
  protected readonly notLoggedLabel = NOT_LOGGED_LABEL;

  protected readonly state = this.service.state;
  protected readonly rows = this.service.visibleDecisions;
  protected readonly filteredCount = this.service.filteredCount;
  protected readonly totalCount = this.service.totalCount;
  protected readonly emptyReason = this.service.emptyReason;
  protected readonly selectedId = this.service.selectedDecisionId;

  // --- sorting --------------------------------------------------------------

  protected ariaSort(key: DecisionSortKey): 'ascending' | 'descending' | 'none' {
    if (this.service.sortKey() !== key) return 'none';
    return this.service.sortAscending() ? 'ascending' : 'descending';
  }

  /** Decorative: `aria-sort` on the header already carries the state. */
  protected sortGlyph(key: DecisionSortKey): string {
    if (this.service.sortKey() !== key) return '↕';
    return this.service.sortAscending() ? '▲' : '▼';
  }

  protected toggleSort(key: DecisionSortKey): void {
    this.service.setSort(key);
  }

  // --- rows -----------------------------------------------------------------

  /** The row's accessible name for the control that opens the panel. */
  protected rowLabel(decision: AuditDecision): string {
    return `${decision.id} — ${this.agentLabel[decision.agent]}, ${this.typeLabel[decision.type]} at ${decision.time} on ${decision.date}. Opens the decision detail.`;
  }

  /** `temperature=0.7, top_p=0.9, max_tokens=512`, exactly as the panel prints it. */
  protected paramLine(decision: AuditDecision): string {
    return decision.params.map((p) => `${p.name}=${p.value}`).join(', ');
  }

  protected open(decision: AuditDecision): void {
    this.service.select(decision.id);
  }

  protected clearFilters(): void {
    this.service.clearFilters();
  }
}
