import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  CONDITIONAL_VALUE_LABEL,
  FACTOR_UNIT_NAME,
  NOT_EDITABLE_NOTE,
  UNFIXED_FACTOR_DETAIL,
  UNFIXED_FACTOR_NOTE,
  type RiskFactorRow,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { kLabel, mahaLabel, observationLabel, shockLabel } from '../stress-format';

/** Why `Evaluate manual scenario` is inert with nothing pinned. */
export const NOTHING_FIXED_REASON =
  'Fix at least one factor and give it a value — a scenario with nothing pinned is the expected scenario, which is already on the card below.';

/** The step of a shock field, per unit: fine enough to type, coarse enough to nudge. */
const SHOCK_STEP: Record<string, number> = { '%': 0.1, bp: 1, pp: 0.05 };

/**
 * Region 3 — the systematic risk factors, and the partial scenario they define.
 *
 * The column that carries the region's argument is the last one. A pinned
 * factor takes the value the reader types; an unfixed factor is **not** blank
 * and **not** zero — it is held at its conditional expected value given the
 * pinned ones, and the field is not editable because that treatment is a
 * consequence of the method rather than an option. Among all completions of a
 * partial scenario it is the one of highest plausibility, `Maha(r_C) =
 * Maha(r_D)`, so any other value would only make the same scenario less
 * plausible. The cell says so in words, and the note under the table says why.
 *
 * `Maha` of the pinned set is printed beside the radius on purpose: it is the
 * number the worst-case search has to fit inside `k`, so a reader can see an
 * infeasible search coming before they press the button, and read the inline
 * error afterwards as a confirmation rather than a surprise.
 *
 * Ticking `Fix` is announced politely, because the change it makes — a field
 * two columns to the right becoming editable — is easy to miss and must not be
 * carried by the field's colour alone.
 */
@Component({
  selector: 'app-stress-factor-table',
  imports: [ActionButtonRow, ButtonDirective],
  templateUrl: './factor-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactorTable {
  private readonly service = inject(StressTestingService);

  protected readonly conditionalLabel = CONDITIONAL_VALUE_LABEL;
  protected readonly notEditableNote = NOT_EDITABLE_NOTE;
  protected readonly unfixedNote = UNFIXED_FACTOR_NOTE;
  protected readonly unfixedDetail = UNFIXED_FACTOR_DETAIL;
  protected readonly nothingFixedReason = NOTHING_FIXED_REASON;
  protected readonly unitName = FACTOR_UNIT_NAME;

  protected readonly factors = this.service.factors;
  protected readonly fixedMaha = this.service.fixedMaha;
  protected readonly feasible = this.service.partialScenarioFeasible;
  protected readonly canEvaluate = this.service.canEvaluateManual;
  protected readonly k = this.service.k;

  protected readonly busy = computed(() => this.service.loading());
  protected readonly evaluating = computed(() => this.service.pendingAction() === 'manual');

  /** Empty until a checkbox moves; read by a polite live region, never shown. */
  protected readonly announcement = signal('');

  protected readonly kText = computed(() => kLabel(this.k()));

  /** `Maha(r_C) = 5.42` for the pinned set, or nothing when nothing is pinned. */
  protected readonly fixedMahaText = computed(() => mahaLabel(this.fixedMaha()));

  protected readonly anyFixed = computed(() => this.service.fixedFactors().length > 0);

  protected observation(row: RiskFactorRow): string {
    return observationLabel(row);
  }

  protected shock(value: number, unit: RiskFactorRow['unit']): string {
    return shockLabel(value, unit);
  }

  protected stepFor(row: RiskFactorRow): number {
    return SHOCK_STEP[row.unit] ?? 0.1;
  }

  protected valueOf(row: RiskFactorRow): string {
    return row.scenarioValue === null ? '' : String(row.scenarioValue);
  }

  protected placeholderFor(row: RiskFactorRow): string {
    return shockLabel(row.suggestedShock, row.unit);
  }

  protected fieldLabel(row: RiskFactorRow): string {
    return `Scenario value for ${row.name}, in ${this.unitName[row.unit]}`;
  }

  protected onFix(row: RiskFactorRow, event: Event): void {
    const fixed = (event.target as HTMLInputElement).checked;
    this.service.setFactorFixed(row.id, fixed);
    this.announcement.set(
      fixed
        ? `${row.name} fixed. Its scenario value field is now editable.`
        : `${row.name} released. It is held at its conditional expected value and its field is not editable.`,
    );
  }

  /**
   * Writes a shock, or clears it.
   *
   * An empty field is `null` rather than `0`: a factor pinned at zero is a
   * claim that it does not move, which is a scenario; a factor pinned at
   * nothing is an unfinished one, and the evaluate button stays inert for it.
   */
  protected onValue(row: RiskFactorRow, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '') {
      this.service.setFactorValue(row.id, null);
      return;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) this.service.setFactorValue(row.id, value);
  }

  /** Focusable while it runs, so the handler is what refuses a second press. */
  protected onEvaluate(): void {
    if (this.busy()) return;
    void this.service.evaluateManual();
  }
}
