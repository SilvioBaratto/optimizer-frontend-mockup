import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FACTOR_VIEWS,
  FACTOR_VIEW_LABEL,
  type FactorRiskImpact as FactorRiskImpactRow,
  type FactorView,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { share } from '../attribution-format';

/** Why the last row exists, in the words the panel prints beside it. */
const RESIDUAL_NOTE =
  'Orthogonal complement — the part of the loss no listed factor explains. It is a row, not a rounding gap: the impacts are Euler shares of the factor decomposition and sum to 100%.';

const IMPACT_NOTE =
  'RI_ρ(L|S) = ρ(E[L|S] | L) / ρ(L) — the Euler contribution of the loss conditional on the factor, over total risk. Under the standard-deviation measure it is var(E[L|S]) / var(L), a generalisation of R².';

/**
 * Region 5 — the systematic factors ranked by risk impact, with the residual.
 *
 * It reads `factorImpacts()`, which is the factor book's Euler shares, so when
 * the toolbar's Group by is already `Factor` this panel and the table are the
 * same numbers rather than two computations that happen to agree today. With
 * any other grouping active it stays on screen as an independent systematic
 * decomposition, which is what the spec asks for.
 *
 * Its own Group by and its own Export are deliberately *not* wired to the
 * toolbar: the spec says both operate independently of it, and the panel's view
 * is a plain writable signal with no path into `recompute`, so switching it
 * cannot move a single figure elsewhere on the page.
 *
 * The bars are elements, not a drawing, for the same reason as the contribution
 * chart: the spec requires the percentage in text beside every bar.
 */
@Component({
  selector: 'app-factor-risk-impact',
  imports: [ButtonDirective, SelectDirective, SkeletonBlock],
  templateUrl: './factor-risk-impact.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactorRiskImpact {
  private readonly service = inject(RiskAttributionService);

  protected readonly factorViews = FACTOR_VIEWS;
  protected readonly factorViewLabel = FACTOR_VIEW_LABEL;
  protected readonly residualNote = RESIDUAL_NOTE;
  protected readonly impactNote = IMPACT_NOTE;

  protected readonly loading = this.service.loading;
  protected readonly factorView = this.service.factorView;

  /**
   * Ranked by impact, with the residual pinned last.
   *
   * The remainder is not the smallest factor — it is what is left over — so it
   * keeps the bottom of the ranking whatever its size.
   */
  protected readonly impacts = computed<readonly FactorRiskImpactRow[]>(() =>
    [...this.service.factorImpacts()].sort((a, b) => {
      if (a.residual !== b.residual) return a.residual ? 1 : -1;
      return b.impact - a.impact;
    }),
  );

  protected readonly explained = computed(() =>
    this.impacts()
      .filter((row) => !row.residual)
      .reduce((total, row) => total + row.impact, 0),
  );

  protected percent(value: number): string {
    return share(value);
  }

  /** Bar length in percent of the track. Impacts are shares in [0, 1]. */
  protected barWidth(row: FactorRiskImpactRow): number {
    return Math.max(0.6, row.impact * 100);
  }

  protected onFactorView(event: Event): void {
    this.factorView.set((event.target as HTMLSelectElement).value as FactorView);
  }

  // --- its own export -------------------------------------------------------

  private readonly _exportNotice = signal('');
  protected readonly exportNotice = this._exportNotice.asReadonly();

  protected exportImpacts(): void {
    this._exportNotice.set(
      `Exported ${this.impacts().length} rows — factor risk impact by ` +
        `${FACTOR_VIEW_LABEL[this.factorView()].toLowerCase()}, ` +
        `as of ${this.service.snapshot().label}.`,
    );
  }
}
