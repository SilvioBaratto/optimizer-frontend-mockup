import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { POSITION_SOURCE_GLYPH, POSITION_SOURCE_LABEL } from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';

const SKELETON_ROWS = [0, 1, 2, 3, 4];

/**
 * Tab 3 — where each position came from, and what a broker would do about it.
 *
 * Positions are not read from a broker. `domain/portfolio/` owns them and they
 * arrive by manual entry or CSV import, which is precisely why rebalancing,
 * risk monitoring and attribution behave identically with or without an
 * adapter configured. A configured broker *synchronises* that state; it is
 * never its source.
 *
 * So the table is populated and the sync block below it is empty in the
 * default posture. The two facts are separate on purpose: nothing is missing
 * from the positions, and the emptiness underneath is the consequence of there
 * being no broker to compare them against.
 *
 * The positions themselves are the *active portfolio's*, read from
 * `FundService` through the page service. The topbar switcher is on this page
 * like every other, so a tab holding its own five rows would keep naming an
 * import file and a person for holdings the fund no longer has the moment the
 * reader switched — a false provenance claim on the one tab whose entire
 * subject is provenance. The caption and the summary line name the portfolio
 * for the same reason.
 */
@Component({
  selector: 'app-report-provenance-panel',
  imports: [EmptyState, SkeletonBlock],
  templateUrl: './provenance-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvenancePanel {
  private readonly service = inject(ReportAuditService);

  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly sourceLabel = POSITION_SOURCE_LABEL;
  protected readonly sourceGlyph = POSITION_SOURCE_GLYPH;

  protected readonly state = this.service.state;
  protected readonly positions = this.service.positions;
  protected readonly positionsPending = this.service.positionsPending;
  protected readonly syncRows = this.service.syncRows;
  protected readonly syncEmptyReason = this.service.syncEmptyReason;

  /** Names the portfolio in the caption, so the table cannot be read against another. */
  protected readonly portfolioName = computed(
    () => this.service.activePortfolioName() ?? 'the active portfolio',
  );
}
