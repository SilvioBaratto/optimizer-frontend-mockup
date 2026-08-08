import { Injectable, computed, signal } from '@angular/core';

/** One step of the Build flow, in the order the sidebar lists them. */
export interface BuildStep {
  index: number;
  label: string;
  route: string;
}

export const BUILD_STEPS: readonly BuildStep[] = [
  { index: 1, label: 'Universe & Data', route: '/build/universe-data' },
  { index: 2, label: 'Signals & Factors', route: '/build/signals-factors' },
  { index: 3, label: 'Views Builder', route: '/build/views-builder' },
  { index: 4, label: 'Objective & Constraints', route: '/build/objective-constraints' },
  { index: 5, label: 'Run & Solver Diagnostics', route: '/build/run-solver-diagnostics' },
];

/**
 * How far the Build flow has been unlocked.
 *
 * A later step becomes reachable only once the pages before it are free of
 * blocking warnings, which is why this is shared state rather than something
 * each page decides for itself.
 */
@Injectable({ providedIn: 'root' })
export class BuildStepTrackerService {
  /** Highest step reached so far; later steps stay disabled. */
  private readonly _unlockedThrough = signal(1);

  readonly steps = BUILD_STEPS;
  readonly unlockedThrough = this._unlockedThrough.asReadonly();

  readonly isReachable = computed(() => (step: number) => step <= this._unlockedThrough());

  /** Called when a step's page reports itself free of blocking warnings. */
  unlock(step: number): void {
    this._unlockedThrough.update((current) => Math.max(current, step));
  }

  /** Re-locks everything after a step — used when its inputs go invalid again. */
  lockAfter(step: number): void {
    this._unlockedThrough.update((current) => Math.min(current, step));
  }
}
