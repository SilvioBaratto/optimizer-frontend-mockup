import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  HIGH_CONCENTRATION_DI,
  HIGH_CONCENTRATION_LABEL,
  RISK_ATTRIBUTION_EXIT,
  type ConcentrationComponent,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { InfoCard } from '../../../../shared/info-card/info-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { NOT_APPLICABLE, percent, ratio } from '../guardrail-format';

const HEDGE_NOTE = 'hedge — the Euler contribution is negative, so the index is undefined';

const SKELETON_ROWS = [0, 1, 2, 3];

/**
 * Region 6 — the diversification indices, read rather than recomputed.
 *
 * Every number in this region comes out of `RiskAttributionService` through
 * `GuardrailService`, which holds the *same signal objects* rather than copies:
 * `portfolioDi` is doc 19's `ρ(X) / Σ ρ(X_i)` and the per-row figures are its
 * `DI_ρ(X_i|X)`. That is the whole point of the arrangement — this page shows
 * the indices as an input to the guardrail process, and two computations of one
 * book's diversification would eventually print two numbers for it.
 *
 * A marginal index at or above 0.9 reads as "almost co-monotonic with the book",
 * i.e. risk the portfolio is not diversifying away, and gets a badge with a word
 * on it. A hedge has no index at all — a negative Euler contribution makes the
 * ratio meaningless — so it prints a dash and says why, never a zero.
 */
@Component({
  selector: 'app-guardrail-concentration',
  imports: [
    ButtonDirective,
    CrossPageLink,
    EntityCard,
    ErrorState,
    InfoCard,
    SectionCardGrid,
    SkeletonBlock,
    StatusBadge,
  ],
  templateUrl: './concentration-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConcentrationPanel {
  private readonly service = inject(GuardrailService);

  protected readonly riskAttributionExit = RISK_ATTRIBUTION_EXIT;
  protected readonly highConcentrationLabel = HIGH_CONCENTRATION_LABEL;
  protected readonly hedgeNote = HEDGE_NOTE;
  protected readonly notApplicable = NOT_APPLICABLE;
  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly highConcentrationThreshold = ratio(HIGH_CONCENTRATION_DI);

  protected readonly components = this.service.visibleConcentrationComponents;
  protected readonly total = computed(() => this.service.concentrationComponents().length);
  protected readonly hidden = this.service.concentrationHidden;
  protected readonly highCount = this.service.highConcentrationCount;
  protected readonly showAll = this.service.showAllComponents;
  protected readonly error = this.service.concentrationError;

  protected readonly busy = computed(
    () => this.service.loading() || this.service.pendingRegion() === 'concentration',
  );

  /** `DI_ρ(X)` — doc 19's signal, not a second reading of the same book. */
  protected readonly portfolioDi = computed(() => ratio(this.service.portfolioDi()));

  protected readonly showAllLabel = computed(() =>
    this.showAll() ? 'Show fewer components' : `Show all components (${this.hidden()} more)`,
  );

  protected weight(component: ConcentrationComponent): string {
    return percent(component.weight);
  }

  protected marginalDi(component: ConcentrationComponent): string {
    return ratio(component.marginalDi);
  }

  protected meta(component: ConcentrationComponent): string {
    return `${this.weight(component)} of NAV · DI ${this.marginalDi(component)}`;
  }

  protected toggleAll(): void {
    this.showAll.update((v) => !v);
  }

  protected retry(): Promise<void> {
    return this.service.retryRegion('concentration');
  }
}
