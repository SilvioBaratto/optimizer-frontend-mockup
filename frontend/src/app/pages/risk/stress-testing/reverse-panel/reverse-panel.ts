import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';

import {
  EMPTY_REVERSE_DETAIL,
  EMPTY_REVERSE_MESSAGE,
  IMPACT_MEASURE_LABEL,
  REVERSE_OUTCOMES,
  REVERSE_OUTCOME_DEFINITION,
  REVERSE_OUTCOME_LABEL,
  STALE_RESULT_BADGE,
  STALE_RESULT_NOTE,
  type ImpliedFactorMove,
  type ReverseOutcomeId,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { kLabel, mahaLabel, measureLevel, shockLabel } from '../stress-format';

/**
 * What a factor is doing in the implied scenario.
 *
 * Not "conditional expected value": a reverse search pins nothing, so the
 * scenario it reports is the least implausible **complete** move and every one
 * of the four factors is at its own worst-case value. Calling the two small
 * ones conditional expectations would say they were left alone, which is the
 * opposite of what the figures beside the label show — a +60bp move in the
 * credit spread is a stress, not an expectation.
 */
export const MINOR_MOVE_LABEL = 'minor move';
export const DRIVER_MOVE_LABEL = 'key driver';

/** Why no row here is held at a conditional expected value. */
export const IMPLIED_SCENARIO_NOTE =
  'Nothing is pinned in a reverse search, so every factor moves: this is the least implausible complete scenario that reaches the target, and the roles rank the factors by how much of the loss each one carries.';

/** Why the search is inert without a level. */
export const NO_TARGET_REASON =
  'Enter a target level in the current impact measure — a reverse test starts from an outcome, and an outcome is a number.';

/**
 * Region 8 — the exercise run backwards.
 *
 * The forward test fixes the plausibility radius and asks what the worst loss
 * inside it is. This one fixes the outcome — a capital ratio breach, the
 * funding position closing, the capital base gone — and asks what the least
 * implausible scenario that produces it looks like. The answer is a single
 * number, `minimal Maha`, and it is read as a verdict on the outcome rather
 * than on the portfolio: an outcome reachable at 4.10 is a stress scenario, and
 * one that needs a move beyond any radius worth arguing from is not a scenario
 * at all.
 *
 * Both exercises run on one and the same loss surface, so the implied scenario
 * reported here is the scenario a forward search at that radius would find. The
 * factors that carry the loss are named as drivers; the rest sit at their
 * conditional expected value, which the wireframe labels and which is what they
 * are.
 *
 * The panel replaces the factor table, the summary grid and both figures when
 * the reverse tab is active; the toolbar and the library above and below it do
 * not move, because the impact measure and the radius mean the same thing in
 * both exercises.
 */
@Component({
  selector: 'app-stress-reverse-panel',
  imports: [
    ActionButtonRow,
    ButtonDirective,
    EmptyState,
    ErrorState,
    SelectDirective,
    SkeletonBlock,
    StatusBadge,
  ],
  templateUrl: './reverse-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReversePanel {
  private readonly service = inject(StressTestingService);

  /** Where focus goes when Retry destroys the alert it lives in. */
  private readonly resultHeading = viewChild<ElementRef<HTMLElement>>('resultHeading');

  protected readonly outcomes = REVERSE_OUTCOMES;
  protected readonly outcomeLabel = REVERSE_OUTCOME_LABEL;
  protected readonly measureLabel = IMPACT_MEASURE_LABEL;
  protected readonly emptyMessage = EMPTY_REVERSE_MESSAGE;
  protected readonly emptyDetail = EMPTY_REVERSE_DETAIL;
  protected readonly staleBadge = STALE_RESULT_BADGE;
  protected readonly staleNote = STALE_RESULT_NOTE;
  protected readonly minorMoveLabel = MINOR_MOVE_LABEL;
  protected readonly driverMoveLabel = DRIVER_MOVE_LABEL;
  protected readonly impliedScenarioNote = IMPLIED_SCENARIO_NOTE;
  protected readonly noTargetReason = NO_TARGET_REASON;

  protected readonly outcome = this.service.reverseOutcome;
  protected readonly targetLevel = this.service.reverseTargetLevel;
  protected readonly result = this.service.reverseResult;
  protected readonly impactMeasure = this.service.impactMeasure;
  protected readonly measureUnit = this.service.measureUnit;
  protected readonly canSearch = this.service.canSearchReverse;

  protected readonly busy = computed(() => this.service.loading());
  protected readonly searching = computed(() => this.service.pendingAction() === 'reverse');

  /** Only the failure this section owns; a forward error belongs to another one. */
  protected readonly failure = computed(() => {
    const error = this.service.error();
    return error !== null && error.section === 'reverse' ? error : null;
  });

  protected readonly outcomeDefinition = computed(
    () => REVERSE_OUTCOME_DEFINITION[this.outcome()],
  );

  protected readonly currentLevel = computed(() =>
    measureLevel(this.service.reverseCurrentLevel(), this.measureUnit()),
  );

  protected readonly targetPlaceholder = computed(() =>
    this.service.reverseSuggestedTarget().toFixed(1),
  );

  protected readonly targetValue = computed(() => {
    const level = this.targetLevel();
    return level === null ? '' : String(level);
  });

  protected readonly canSave = computed(() => this.result() !== null);

  /** `k ≥ 4.10` — what the admissible domain would have to be widened to. */
  protected readonly requiredRadius = computed(() => {
    const result = this.result();
    return result === null ? '' : `k >= ${mahaLabel(result.minimalMaha)}`;
  });

  protected readonly radiusVerdict = computed(() => {
    const result = this.result();
    if (result === null) return '';
    return result.withinCurrentRadius
      ? `The outcome is already inside the current Ell_k — a forward search at k = ${kLabel(result.k)} would find it.`
      : `The current radius k = ${kLabel(result.k)} is too tight to contain it: no forward search at this radius would ever produce this outcome.`;
  });

  protected maha(value: number): string {
    return mahaLabel(value);
  }

  protected level(value: number): string {
    const result = this.result();
    return measureLevel(value, result?.unit ?? this.measureUnit());
  }

  protected points(value: number): string {
    return `${value.toFixed(1)} pts`;
  }

  protected move(factor: ImpliedFactorMove): string {
    return shockLabel(factor.value, factor.unit);
  }

  protected roleOf(factor: ImpliedFactorMove): string {
    return factor.driver ? this.driverMoveLabel : this.minorMoveLabel;
  }

  protected onOutcome(event: Event): void {
    this.service.setReverseOutcome((event.target as HTMLSelectElement).value as ReverseOutcomeId);
  }

  protected onTarget(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '') {
      this.service.setReverseTargetLevel(null);
      return;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) this.service.setReverseTargetLevel(value);
  }

  /** Focusable while it runs, so the handler is what refuses a second press. */
  protected onSearch(): void {
    if (this.busy()) return;
    void this.service.searchReverse();
  }

  protected onSave(): void {
    this.service.saveScenario('reverse');
  }

  /**
   * Retrying destroys the alert the Retry button lives in, so focus is moved
   * out of it first — onto the Result heading, which is where the answer will
   * appear. Left alone it falls to `<body>` and the next Tab restarts at the
   * top of the page.
   */
  protected async onRetry(): Promise<void> {
    this.resultHeading()?.nativeElement.focus();
    this.service.clearError();
    await this.service.searchReverse();
  }
}
