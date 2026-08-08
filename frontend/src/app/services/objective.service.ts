import { Injectable, computed, signal } from '@angular/core';

import {
  DEFAULT_PARAMETERS,
  OBJECTIVES,
  type ObjectiveId,
  type ObjectiveParameters,
  type SolverKind,
  type WeightBound,
} from '../models/allocation.model';

const LATENCY_MS = 800;

const DEFAULT_BOUNDS: readonly WeightBound[] = [
  { id: 'eq-us', name: 'Equities US', minPercent: 0, maxPercent: 35, lotSize: 1, strength: 'hard' },
  { id: 'eq-eu', name: 'Equities EU', minPercent: 0, maxPercent: 25, lotSize: 1, strength: 'hard' },
  { id: 'govt', name: 'Govt Bonds', minPercent: 0, maxPercent: 60, lotSize: 1, strength: 'soft' },
  { id: 'gold', name: 'Gold ETF', minPercent: 0, maxPercent: null, lotSize: 100, strength: 'soft' },
  { id: 'credit', name: 'IG Credit', minPercent: 0, maxPercent: 30, lotSize: 1, strength: 'hard' },
];

export type FeasibilityOutcome = 'unknown' | 'checking' | 'passed' | 'failed' | 'error';

/**
 * The optimization problem being configured.
 *
 * Parameters are stored per objective so switching away and back does not
 * discard what was typed — the spec requires that within a session.
 *
 * Feasibility is a solver verdict. This service asks for it and reports the
 * answer; it never decides one locally.
 */
@Injectable({ providedIn: 'root' })
export class ObjectiveService {
  private readonly _objective = signal<ObjectiveId | null>('mean-variance');
  private readonly _parameters = signal<Record<string, ObjectiveParameters>>({});
  private readonly _bounds = signal<readonly WeightBound[]>(DEFAULT_BOUNDS);
  private readonly _feasibility = signal<FeasibilityOutcome>('passed');
  private readonly _lastChecked = signal<string | null>('14:02');

  /** Set when Views Builder has not produced an expected-return vector. */
  readonly expectedReturnsAvailable = signal(false);

  readonly objectives = OBJECTIVES;

  /**
   * The effective selection.
   *
   * An objective whose expected-return dependency is unmet reads as *no*
   * selection, even though the underlying choice is retained: showing a card
   * simultaneously selected and disabled states two contradictory things, and
   * the summary would then print a formula for something unusable. Keeping the
   * stored id means the choice returns by itself once Views Builder supplies μ.
   */
  readonly objective = computed(() => {
    const id = this._objective();
    if (!id) return null;
    return this.isDisabled(id) ? null : id;
  });
  readonly bounds = this._bounds.asReadonly();
  readonly feasibility = this._feasibility.asReadonly();
  readonly lastChecked = this._lastChecked.asReadonly();

  // --- constraint toggles -------------------------------------------------
  readonly longOnly = signal(true);
  readonly limitHoldings = signal(false);
  readonly holdingsLimit = signal(15);
  readonly requireMinLots = signal(false);
  readonly minLots = signal(1);
  readonly capMaxDrawdown = signal(false);
  readonly nu1 = signal(0.2);
  readonly capAvgDrawdown = signal(false);
  readonly nu2 = signal<number | null>(null);
  readonly capCdar = signal(false);
  readonly nu3 = signal<number | null>(null);
  readonly cdarAlpha = signal(0.95);
  readonly penalty = signal(0.001);
  readonly solver = signal<SolverKind>('exact');
  readonly swarmSize = signal(50);

  /** Parameters for the objective currently selected. */
  readonly parameters = computed<ObjectiveParameters>(() => {
    const id = this._objective();
    if (!id) return DEFAULT_PARAMETERS;
    return this._parameters()[id] ?? DEFAULT_PARAMETERS;
  });

  readonly definition = computed(() =>
    OBJECTIVES.find((o) => o.id === this._objective()) ?? null,
  );

  /** An objective needing μ is unusable until Views Builder supplies it. */
  isDisabled(id: ObjectiveId): boolean {
    const def = OBJECTIVES.find((o) => o.id === id);
    return Boolean(def?.requiresExpectedReturns) && !this.expectedReturnsAvailable();
  }

  readonly disabledObjectives = computed(() =>
    OBJECTIVES.filter((o) => o.requiresExpectedReturns && !this.expectedReturnsAvailable()),
  );

  // --- constraint accounting ---------------------------------------------

  /** Bounds with a real restriction, split by how strictly they bind. */
  readonly hardCount = computed(
    () => this._bounds().filter((b) => b.strength === 'hard').length,
  );
  readonly softCount = computed(
    () => this._bounds().filter((b) => b.strength === 'soft').length,
  );

  /** Constraints active outside the weight-bounds table. */
  readonly otherActiveCount = computed(
    () =>
      [
        this.longOnly(),
        this.requireMinLots(),
        this.capMaxDrawdown(),
        this.capAvgDrawdown(),
        this.capCdar(),
      ].filter(Boolean).length,
  );

  readonly activeConstraintCount = computed(
    () => this.hardCount() + this.softCount() + this.otherActiveCount(),
  );

  /**
   * Cardinality turns feasibility NP-complete and the solve NP-hard, but only
   * once it sits alongside other binding constraints — the spec puts the
   * threshold at three.
   */
  readonly npHard = computed(() => this.limitHoldings() && this.otherActiveCount() >= 3);

  // --- validation ---------------------------------------------------------

  /** Sum of the lower bounds cannot exceed the budget. */
  readonly minSum = computed(() =>
    this._bounds().reduce((sum, b) => sum + b.minPercent, 0),
  );

  readonly boundErrors = computed(() => {
    const errors: Record<string, string> = {};
    for (const b of this._bounds()) {
      if (b.maxPercent !== null && b.minPercent > b.maxPercent) {
        errors[b.id] = 'Minimum cannot exceed maximum.';
      }
    }
    return errors;
  });

  /** Assets forced into the portfolio by a positive lower bound. */
  readonly forcedHoldings = computed(
    () => this._bounds().filter((b) => b.minPercent > 0).length,
  );

  readonly blockingErrors = computed<string[]>(() => {
    const out: string[] = [];
    if (this.minSum() > 100) {
      out.push(`Weight minimums sum to ${this.minSum().toFixed(1)}%, above the 100% budget.`);
    }
    if (Object.keys(this.boundErrors()).length > 0) {
      out.push('One or more weight bounds have a minimum above their maximum.');
    }
    if (this.limitHoldings() && this.holdingsLimit() < this.forcedHoldings()) {
      out.push(
        `K = ${this.holdingsLimit()} is below the ${this.forcedHoldings()} assets forced in by a positive minimum.`,
      );
    }
    for (const [label, value] of [
      ['ν₁', this.capMaxDrawdown() ? this.nu1() : null],
      ['ν₂', this.capAvgDrawdown() ? this.nu2() : null],
      ['ν₃', this.capCdar() ? this.nu3() : null],
    ] as const) {
      if (value !== null && (value < 0 || value > 1)) out.push(`${label} must be between 0 and 1.`);
    }
    if (!this.objective()) out.push('Select an optimization objective.');
    return out;
  });

  readonly canContinue = computed(() => this.blockingErrors().length === 0);

  // --- mutations ----------------------------------------------------------

  select(id: ObjectiveId): void {
    if (this.isDisabled(id)) return;
    this._objective.set(id);
  }

  /** Writes against the selected objective, leaving the others untouched. */
  patchParameters(patch: Partial<ObjectiveParameters>): void {
    const id = this._objective();
    if (!id) return;
    this._parameters.update((all) => ({
      ...all,
      [id]: { ...(all[id] ?? DEFAULT_PARAMETERS), ...patch },
    }));
  }

  patchBound(id: string, patch: Partial<WeightBound>): void {
    this._bounds.update((all) => all.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  addBound(): void {
    this._bounds.update((all) => [
      ...all,
      {
        id: `row-${all.length + 1}-${Date.now()}`,
        name: 'New row',
        minPercent: 0,
        maxPercent: null,
        lotSize: 1,
        strength: 'hard',
      },
    ]);
  }

  async checkFeasibility(fail = false): Promise<void> {
    this._feasibility.set('checking');
    await delay(LATENCY_MS);
    this._feasibility.set(fail ? 'error' : this.canContinue() ? 'passed' : 'failed');
    this._lastChecked.set(new Date().toTimeString().slice(0, 5));
  }

  reset(): void {
    this._objective.set('mean-variance');
    this._parameters.set({});
    this._bounds.set(DEFAULT_BOUNDS);
    this.longOnly.set(true);
    this.limitHoldings.set(false);
    this.holdingsLimit.set(15);
    this.requireMinLots.set(false);
    this.minLots.set(1);
    this.capMaxDrawdown.set(false);
    this.nu1.set(0.2);
    this.capAvgDrawdown.set(false);
    this.nu2.set(null);
    this.capCdar.set(false);
    this.nu3.set(null);
    this.cdarAlpha.set(0.95);
    this.penalty.set(0.001);
    this.solver.set('exact');
    this.swarmSize.set(50);
    this._feasibility.set('unknown');
    this._lastChecked.set(null);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
