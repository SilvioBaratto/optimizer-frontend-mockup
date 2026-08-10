import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  DEDUPLICATION_GLYPH,
  DEDUPLICATION_LABEL,
  NOT_LOGGED_GLYPH,
  RECONCILIATION_GLYPH,
  RECONCILIATION_LABEL,
} from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';

const SKELETON_ROWS = [0, 1, 2];

/**
 * Tab 2 — the idempotency key, the pre-POST deduplication result and the
 * reconciliation poll, per order intent.
 *
 * Empty by posture, and that is the whole content of the tab today. The
 * Trading 212 orders API is in beta and not idempotent — a repeated POST can
 * place a second real order — so the broker adapter owes a client-side key per
 * intent, a deduplication check before the POST and a poll afterwards to
 * reconcile. None of that has run, because no adapter is registered, which is
 * the product's default posture rather than a failure of this page.
 *
 * The reason is read from `ExecutionService.brokerPosture()` via the page
 * service, not written here, so it stops saying "no broker configured" the day
 * one is. Registering an adapter is a user action — implement `ports/broker.py`
 * and register it — and the idempotency itself sits above that port, in the
 * core, so it is solved once instead of re-argued by every adapter.
 */
@Component({
  selector: 'app-report-idempotency-panel',
  imports: [CrossPageLink, EmptyState, SkeletonBlock],
  templateUrl: './idempotency-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdempotencyPanel {
  private readonly service = inject(ReportAuditService);

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly dedupLabel = DEDUPLICATION_LABEL;
  protected readonly dedupGlyph = DEDUPLICATION_GLYPH;
  protected readonly reconciliationLabel = RECONCILIATION_LABEL;
  protected readonly reconciliationGlyph = RECONCILIATION_GLYPH;
  protected readonly notApplicable = NOT_LOGGED_GLYPH;

  protected readonly state = this.service.state;
  protected readonly records = this.service.idempotencyRecords;
  protected readonly emptyReason = this.service.idempotencyEmptyReason;
}
