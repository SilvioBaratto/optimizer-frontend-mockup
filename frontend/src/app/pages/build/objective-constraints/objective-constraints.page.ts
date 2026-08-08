import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { OBJECTIVES, type ObjectiveId, type SolverKind } from '../../../models/allocation.model';
import { ObjectiveService, type FeasibilityOutcome } from '../../../services/objective.service';
import { StepTracker } from '../step-tracker/step-tracker';

const FEASIBILITY_TONE: Record<FeasibilityOutcome, StatusTone> = {
  unknown: 'pending',
  checking: 'active',
  passed: 'ok',
  failed: 'alert',
  error: 'alert',
};

const FEASIBILITY_LABEL: Record<FeasibilityOutcome, string> = {
  unknown: 'not checked',
  checking: 'checking…',
  passed: 'passed',
  failed: 'failed',
  error: 'check failed',
};

/**
 * `docs/06 Objective & Constraints.md` — step 4 of the Build flow.
 *
 * Chooses what the solver optimises and what it must respect. Nothing here is
 * solved: the page validates fields, counts active constraints and asks the
 * API for a feasibility verdict. It never concludes that a configuration is
 * solvable on its own.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-objective-constraints',
  imports: [
    ActionButtonRow,
    ConfirmDialog,
    ErrorState,
    InfoCard,
    NgTemplateOutlet,
    StatusBadge,
    StepTracker,
  ],
  templateUrl: './objective-constraints.page.html',
  styleUrl: './objective-constraints.page.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectiveConstraintsPage {
  private readonly service = inject(ObjectiveService);

  protected readonly objectives = OBJECTIVES;

  protected readonly selected = this.service.objective;
  protected readonly definition = this.service.definition;
  protected readonly parameters = this.service.parameters;
  protected readonly bounds = this.service.bounds;
  protected readonly boundErrors = this.service.boundErrors;
  protected readonly minSum = this.service.minSum;
  protected readonly blockingErrors = this.service.blockingErrors;
  protected readonly canContinue = this.service.canContinue;
  protected readonly npHard = this.service.npHard;
  protected readonly hardCount = this.service.hardCount;
  protected readonly softCount = this.service.softCount;
  protected readonly activeConstraintCount = this.service.activeConstraintCount;
  protected readonly disabledObjectives = this.service.disabledObjectives;
  protected readonly expectedReturnsAvailable = this.service.expectedReturnsAvailable;
  protected readonly feasibility = this.service.feasibility;
  protected readonly lastChecked = this.service.lastChecked;

  // Constraint toggles are read and written straight through.
  protected readonly longOnly = this.service.longOnly;
  protected readonly limitHoldings = this.service.limitHoldings;
  protected readonly holdingsLimit = this.service.holdingsLimit;
  protected readonly requireMinLots = this.service.requireMinLots;
  protected readonly minLots = this.service.minLots;
  protected readonly capMaxDrawdown = this.service.capMaxDrawdown;
  protected readonly nu1 = this.service.nu1;
  protected readonly capAvgDrawdown = this.service.capAvgDrawdown;
  protected readonly nu2 = this.service.nu2;
  protected readonly capCdar = this.service.capCdar;
  protected readonly nu3 = this.service.nu3;
  protected readonly cdarAlpha = this.service.cdarAlpha;
  protected readonly penalty = this.service.penalty;
  protected readonly solver = this.service.solver;
  protected readonly swarmSize = this.service.swarmSize;

  // --- local UI state -----------------------------------------------------
  protected readonly advancedOpen = signal(false);
  protected readonly whatChangesOpen = signal(false);
  protected readonly confirmReset = signal(false);
  protected readonly announcement = signal('');

  private readonly objectiveCards = viewChildren<ElementRef<HTMLElement>>('objectiveCard');

  protected readonly feasibilityLabel = computed(() => FEASIBILITY_LABEL[this.feasibility()]);
  protected readonly feasibilityTone = computed(() => FEASIBILITY_TONE[this.feasibility()]);

  /** Objectives a user can actually pick, for arrow-key traversal. */
  private readonly selectableIds = computed(() =>
    this.objectives.filter((o) => !this.isDisabled(o.id)).map((o) => o.id),
  );

  constructor() {
    // The NP-hard notice opens Advanced itself and points at the fallback
    // solver, rather than leaving the user to find it.
    effect(() => {
      if (this.npHard()) {
        this.advancedOpen.set(true);
        this.announcement.set(
          'Cardinality combined with other constraints makes the solve NP-hard. Advanced solver opened; PSO is the suggested fallback.',
        );
      }
    });
  }

  protected isDisabled(id: ObjectiveId): boolean {
    return this.service.isDisabled(id);
  }

  protected select(id: ObjectiveId): void {
    if (this.isDisabled(id)) return;
    this.service.select(id);
    const label = this.objectives.find((o) => o.id === id)?.label ?? '';
    this.announcement.set(`${label} selected. Objective parameters updated.`);
  }

  /**
   * Arrow keys move the selection inside the radiogroup, skipping disabled
   * cards — a roving selection that lands on something unusable is a trap.
   */
  protected onCardKeydown(event: KeyboardEvent, id: ObjectiveId): void {
    const ids = this.selectableIds();
    const index = ids.indexOf(id);
    if (index === -1) return;

    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % ids.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + ids.length) % ids.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(id);
      return;
    }

    if (next === null) return;
    event.preventDefault();
    const targetId = ids[next];
    this.select(targetId);
    const position = this.objectives.findIndex((o) => o.id === targetId);
    this.objectiveCards()[position]?.nativeElement.focus();
  }

  // --- field handlers -----------------------------------------------------

  protected onRiskAversion(event: Event): void {
    this.service.patchParameters({ riskAversion: Number((event.target as HTMLInputElement).value) });
  }

  protected onTargetMode(mode: 'none' | 'at-least' | 'exactly'): void {
    this.service.patchParameters({ targetMode: mode });
  }

  protected onParamNumber(event: Event, key: 'targetReturn' | 'confidence' | 'lambda' | 'theta' | 'sigmaMax'): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) this.service.patchParameters({ [key]: value });
  }

  protected onBoundNumber(id: string, event: Event, key: 'minPercent' | 'maxPercent' | 'lotSize'): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? null : Number(raw);
    if (key === 'maxPercent') {
      this.service.patchBound(id, { maxPercent: value });
      return;
    }
    if (value !== null && !Number.isNaN(value)) this.service.patchBound(id, { [key]: value });
  }

  protected onBoundStrength(id: string, event: Event): void {
    this.service.patchBound(id, {
      strength: (event.target as HTMLSelectElement).value as 'hard' | 'soft',
    });
  }

  protected addBound(): void {
    this.service.addBound();
  }

  protected onSolver(kind: SolverKind): void {
    this.solver.set(kind);
  }

  protected onNumberSignal(event: Event, set: (v: number) => void): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) set(value);
  }

  protected onNullableNumber(event: Event, set: (v: number | null) => void): void {
    const raw = (event.target as HTMLInputElement).value;
    set(raw === '' ? null : Number(raw));
  }

  protected async checkFeasibility(): Promise<void> {
    await this.service.checkFeasibility();
    this.announcement.set(`Feasibility check ${FEASIBILITY_LABEL[this.feasibility()]}.`);
  }

  protected performReset(): void {
    this.confirmReset.set(false);
    this.service.reset();
    this.announcement.set('Objective and constraints reset to defaults.');
  }

  /** Human-readable A-value anchor, for the slider's `aria-valuetext`. */
  protected riskAversionText(value: number): string {
    if (value <= -0.5) return `${value.toFixed(2)}, risk-seeking`;
    if (value < 0.5) return `${value.toFixed(2)}, neutral`;
    return `${value.toFixed(2)}, risk-averse`;
  }
}
