import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  ATTRIBUTION_GROUPING_COLUMN,
  ATTRIBUTION_GROUPING_NOUN,
  HEDGE_ICON,
  HEDGE_LABEL,
  type ComponentContribution,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { riskAmount, share, signedShare } from '../attribution-format';

/** Bars drawn before the reader asks for the rest of the book. */
const TOP_BARS = 12;

/** Narrow enough to stay a bar, wide enough to still be a mark at 320px. */
const MIN_BAR_PERCENT = 0.6;

/**
 * Region 4 — the Euler contribution of every component, largest first.
 *
 * The bars are real elements rather than a canvas figure, and that is the
 * design decision worth stating. The spec asks for three things at once: the
 * numeric value beside every bar **as text**, a click on a bar opening the
 * detail panel with the selection shared with the table, and Escape returning
 * focus to the bar that opened it. A canvas has no focusable children — the
 * app already records that in `risk-contribution-table.html` — so each bar here
 * is a `<button>` carrying its own figure in text, and the tabular alternative
 * a chart panel would supply is the table immediately above, which is the same
 * decomposition with more columns.
 *
 * The bar order is the Euler ranking whichever method the table is showing.
 * The spec's interaction list gives the method control the table column, the
 * KeyMetricsRow badge and the detail-panel message — and names this the Euler
 * contribution chart.
 *
 * The two reference numbers under the bars are `totals().standAlone` and
 * `1 − DI`, read off the same object the TOTAL row prints. Recomputing them
 * here from the visible bars would give a second, quietly different Σ.
 */
@Component({
  selector: 'app-contribution-chart',
  imports: [ButtonDirective, SkeletonBlock],
  templateUrl: './contribution-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributionChart {
  private readonly service = inject(RiskAttributionService);

  protected readonly hedgeIcon = HEDGE_ICON;
  protected readonly hedgeLabel = HEDGE_LABEL;

  protected readonly loading = this.service.loading;
  protected readonly selectedComponentId = this.service.selectedComponentId;
  protected readonly highlightedComponentId = this.service.highlightedComponentId;
  protected readonly rankedRows = this.service.rankedRows;

  protected readonly expanded = signal(false);

  protected readonly groupingNoun = computed(
    () => ATTRIBUTION_GROUPING_NOUN[this.service.grouping()],
  );

  /** Singular — the wireframe's "Euler risk contribution by component". */
  protected readonly componentNoun = computed(() =>
    ATTRIBUTION_GROUPING_COLUMN[this.service.grouping()].toLowerCase(),
  );

  /**
   * The bars on screen.
   *
   * Capped at the top twelve, plus whatever is selected: a selection made in
   * the table must be visible here, or "synchronised both ways" would mean
   * "synchronised when the row happens to be large".
   */
  protected readonly bars = computed<readonly ComponentContribution[]>(() => {
    const ranked = this.rankedRows();
    if (this.expanded() || ranked.length <= TOP_BARS) return ranked;
    const selected = this.selectedComponentId();
    return ranked.filter((row, index) => index < TOP_BARS || row.id === selected);
  });

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.rankedRows().length - this.bars().length),
  );

  // --- geometry -------------------------------------------------------------

  /**
   * The scale spans the whole ranking, not the visible slice, so expanding the
   * list does not silently redraw every bar at a new length.
   */
  private readonly scale = computed(() => {
    const values = this.rankedRows().map((row) => row.euler);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const span = max - min;
    return { min, span: span === 0 ? 1 : span };
  });

  /** Where zero sits, so a hedge grows leftwards from the same baseline. */
  protected readonly zeroOffset = computed(() => (-this.scale().min / this.scale().span) * 100);

  protected barWidth(row: ComponentContribution): number {
    return Math.max(MIN_BAR_PERCENT, (Math.abs(row.euler) / this.scale().span) * 100);
  }

  protected barLeft(row: ComponentContribution): number {
    return row.euler < 0 ? this.zeroOffset() - this.barWidth(row) : this.zeroOffset();
  }

  // --- figures --------------------------------------------------------------

  protected amount(value: number): string {
    return riskAmount(value, this.service.displayUnit(), this.service.netAssetValue());
  }

  protected shareOf(value: number): string {
    return share(value);
  }

  /** A hedge is read off the Euler figure here — this is the Euler chart. */
  protected isHedge(row: ComponentContribution): boolean {
    return row.euler < 0;
  }

  protected readonly sumStandAlone = computed(() =>
    riskAmount(this.service.sumStandAlone(), this.service.displayUnit(), this.service.netAssetValue()),
  );

  protected readonly diversificationBenefit = computed(() =>
    signedShare(this.service.diversificationBenefit()),
  );

  /**
   * The reading in one sentence, for a reader who never sees the bars.
   *
   * Every figure in it goes through the same `$ / %` switch as the bars: a
   * summary quoting `$4,182,300` while the column beside it reads `13.9%` would
   * be describing a chart nobody is looking at.
   */
  protected readonly summary = computed(() => {
    const ranked = this.rankedRows();
    if (ranked.length === 0) return '';
    const top = ranked[0];
    return (
      `${ranked.length} ${this.groupingNoun()} ranked by Euler contribution. ` +
      `Largest: ${top.name} at ${share(top.eulerShare)} of ${this.amount(this.service.economicCapital())}. ` +
      `Sum of stand-alone risk ${this.sumStandAlone()}, diversification benefit ${this.diversificationBenefit()}.`
    );
  });

  protected toggleBar(row: ComponentContribution): void {
    this.service.selectComponent(this.selectedComponentId() === row.id ? null : row.id);
  }

  /** The other half of the spec's "hover/click sincronizzati" — see the table. */
  protected highlight(id: string | null): void {
    this.service.highlightComponent(id);
  }
}
