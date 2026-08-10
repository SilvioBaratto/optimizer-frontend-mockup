import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  BOUNDARY_NOTE,
  EMPTY_FORWARD_DETAIL,
  OUTSIDE_ELLIPSOID_NOTE,
  STALE_RESULT_BADGE,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { InfoCard } from '../../../../shared/info-card/info-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { kLabel, lossPoints, mahaLabel, measureValue, normaliseMinus } from '../stress-format';

/** What each card says before it has anything to report. */
export const MANUAL_PLACEHOLDER = 'No manual scenario evaluated yet.';
export const WORST_CASE_PLACEHOLDER = 'No worst-case search run yet.';

/**
 * Region 4 — the three scenarios side by side, each in its own units.
 *
 * The comparison is the point of the page: a hand-picked scenario and the
 * systematic worst case, read at one and the same plausibility, are two very
 * different losses, and the hand-picked one is usually the milder — often at a
 * *higher* Mahalanobis distance, which is the false sense of security the
 * exercise exists to remove.
 *
 * Three details the cards are careful about:
 *
 * - **Every figure is printed in the unit it was computed in**, taken from the
 *   result object rather than from the toolbar. A card computed against
 *   risk-weighted assets keeps saying `% RWA` after the selector has moved to
 *   asset values, because the two are not a change of units and no arithmetic
 *   here could convert one into the other.
 * - **The worst case is on the boundary and says so.** `Maha(r_WC) = k` is not
 *   a coincidence to be noticed from two matching numbers: a point strictly
 *   inside `Ell_k` would mean the search left plausibility budget unspent, so
 *   `(boundary)` is written on the card.
 * - **A hand-picked scenario may sit outside `Ell_k`,** and the wireframe's own
 *   example does — 5.42 against a radius of 5.00. That is not an error; it is
 *   the reading, and the card states it rather than hiding the scenario.
 *
 * Stale is a word, never a shade: `Result not up to date` is a text badge on
 * every card whose parameters have moved under it, and the figures beside it
 * are left exactly as they were computed.
 */
@Component({
  selector: 'app-stress-scenario-summary',
  imports: [InfoCard, SectionCardGrid, SkeletonBlock, StatusBadge],
  templateUrl: './scenario-summary.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioSummary {
  private readonly service = inject(StressTestingService);

  protected readonly staleBadge = STALE_RESULT_BADGE;
  protected readonly boundaryNote = BOUNDARY_NOTE;
  protected readonly outsideNote = OUTSIDE_ELLIPSOID_NOTE;
  protected readonly manualPlaceholder = MANUAL_PLACEHOLDER;
  protected readonly worstCasePlaceholder = WORST_CASE_PLACEHOLDER;
  protected readonly emptyDetail = EMPTY_FORWARD_DETAIL;

  protected readonly expected = this.service.expectedResult;
  protected readonly manual = this.service.manualResult;
  protected readonly worstCase = this.service.worstCaseResult;

  protected readonly evaluating = computed(() => this.service.pendingAction() === 'manual');
  protected readonly searching = computed(() => this.service.pendingAction() === 'worst-case');

  protected readonly manualTitle = computed(() => {
    const result = this.manual();
    return result === null ? 'Manual scenario' : normaliseMinus(result.label);
  });

  protected readonly worstCaseTitle = computed(() => {
    const result = this.worstCase();
    return result === null
      ? `Worst-case scenario — Ell_k, k = ${kLabel(this.service.k())}`
      : normaliseMinus(result.label);
  });

  protected cep(value: number, unit: string): string {
    return measureValue(value, unit);
  }

  protected loss(value: number): string {
    return lossPoints(value);
  }

  protected maha(value: number): string {
    return mahaLabel(value);
  }

  protected radius(value: number): string {
    return kLabel(value);
  }
}
