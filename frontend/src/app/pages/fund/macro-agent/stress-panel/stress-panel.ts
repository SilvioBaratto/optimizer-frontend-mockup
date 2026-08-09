import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { BarChartComponent, percent } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { MacroRegimeService } from '../../../../services/macro-regime.service';
import { MathVar } from '../../../../shared/math/math-var';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/**
 * The stress workbench, and its read-only summary.
 *
 * Plausibility is a Mahalanobis radius rather than a probability mass, because
 * mass depends on how many factors were modelled: two teams modelling the same
 * portfolio with different factor counts would report different worst cases
 * from the same tail probability. The radius does not have that problem, and it
 * is what k governs here.
 *
 * The workbench mode is inferred: the specification names the reverse test and
 * the fixed factors without drawing them.
 */
@Component({
  selector: 'app-stress-panel',
  imports: [BarChartComponent, CrossPageLink, StatusBadge,
    ButtonDirective,
    MathVar,
    SelectDirective,
  ],
  templateUrl: './stress-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StressPanel {
  private readonly service = inject(MacroRegimeService);

  /** `snapshot` is the read-only overview card; `workbench` is the full tab. */
  readonly mode = input<'snapshot' | 'workbench'>('snapshot');

  protected readonly stress = this.service.stress;
  protected readonly topContribution = this.service.topContribution;
  protected readonly radius = this.service.radius;
  protected readonly reverseMode = this.service.reverseMode;
  protected readonly reverseTarget = this.service.reverseTarget;
  protected readonly factors = this.service.stressFactors;
  protected readonly percentFormatter = percent;

  protected readonly pendingFactor = signal(this.service.stressFactors[0]);
  protected readonly pendingValue = signal('');

  protected readonly categories = computed(() => this.stress().contributions.map((c) => c.factor));

  protected readonly series = computed<CategorySeries[]>(() => [
    { name: 'Maximum Loss Contribution', data: this.stress().contributions.map((c) => c.share) },
  ]);

  /** Under 100% means the factors interact; the shortfall is the interaction. */
  protected readonly interacts = computed(() => this.stress().contributionSum < 99.5);

  protected onRadius(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value) && value >= 0) this.radius.set(value);
  }

  protected onRadiusField(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value) && value >= 0) this.radius.set(value);
  }

  protected onReverseTarget(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.reverseTarget.set(raw === '' ? null : Number(raw));
  }

  protected addFixedFactor(): void {
    const value = Number(this.pendingValue());
    if (Number.isNaN(value) || this.pendingValue().trim() === '') return;
    this.service.fixFactor(this.pendingFactor(), value);
    this.pendingValue.set('');
  }

  protected removeFixedFactor(factor: string): void {
    this.service.unfixFactor(factor);
  }

  protected onPendingFactor(event: Event): void {
    this.pendingFactor.set((event.target as HTMLSelectElement).value);
  }

  protected onPendingValue(event: Event): void {
    this.pendingValue.set((event.target as HTMLInputElement).value);
  }
}
