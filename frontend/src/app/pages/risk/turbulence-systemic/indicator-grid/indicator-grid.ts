import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { type IndicatorCard } from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';

/** One card as the template needs it: the reading, and what raised it. */
interface CardView {
  readonly card: IndicatorCard;
  /** The supporting line under the title. Empty when the status line says it. */
  readonly meta: string;
}

/** Placeholders while the six readings recompute — one per card. */
const SKELETONS = [0, 1, 2, 3, 4, 5];

/**
 * Regions 2 and 3 — the SectionLabel and the six current readings.
 *
 * The cards are the page's primary action: an orienting read of the current
 * market state, with the panels below as the detail. Nothing here is
 * interactive, so each `app-entity-card` is a plain surface rather than a link
 * or a button — the spec is explicit that no reading on this page navigates.
 *
 * Two things about the badges are load-bearing, and both come from the service
 * rather than from this component:
 *
 * - **An alert is raised by exactly two conditions** — the turbulence past its
 *   χ² threshold, and ΔAR at or past one σ — and the badge names the quantity
 *   that tripped. A filled marker therefore cannot end up beside a figure that
 *   tripped nothing, which is precisely what the doc's first blocking review
 *   found in the wireframe.
 * - **The threshold in the badge is a function of the asset count.** It is
 *   `χ²₀.₇₅(n)/n`, recomputed the moment the universe changes size; no number
 *   on this card is a literal.
 *
 * The status is a word, a glyph and a colour together — the quiet cards keep
 * `○` beside their note, the raised ones take a `StatusBadge` whose label is a
 * sentence — so nothing here is carried by hue alone.
 */
@Component({
  selector: 'app-turbulence-indicator-grid',
  imports: [EntityCard, SectionCardGrid, SkeletonBlock, StatusBadge],
  templateUrl: './indicator-grid.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorGrid {
  private readonly service = inject(TurbulenceService);

  protected readonly skeletons = SKELETONS;

  protected readonly loading = computed(() => this.service.state() === 'loading');

  /**
   * The six cards.
   *
   * `meta` carries the note only when the badge has taken the card's status
   * line: on a quiet card the note *is* the status line and repeating it under
   * the title would say the same thing twice.
   */
  protected readonly cards = computed<readonly CardView[]>(() =>
    this.service.indicators().map((card) => ({ card, meta: card.alert ? card.note : '' })),
  );
}
