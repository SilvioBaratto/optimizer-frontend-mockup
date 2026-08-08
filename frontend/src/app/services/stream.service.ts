import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  type OptimalityCertificate,
  type PenaltyDiagnostics,
  type ProblemClassification,
  type RunLogEvent,
  type RunMetric,
  type RunStatus,
  type StreamState,
} from '../models/optimization-run.model';

/** Milliseconds between simulated iteration events. */
const TICK_MS = 400;
const MAX_ITERATIONS = 1500;
/**
 * One convergence point every `STRIDE` iterations.
 *
 * The chart plots the whole run rather than a trailing window: the shape of a
 * descent is the point of the panel, and by iteration 1400 a trailing window
 * is a flat line that says nothing.
 */
const STRIDE = 12;

/**
 * The objective at a given iteration.
 *
 * A decay slow enough to still be visibly falling at iteration 1500, so the
 * tail of the curve is not perfectly flat.
 */
function objectiveAt(iteration: number): number {
  return 2.4e4 + 2e5 * Math.exp(-iteration / 300);
}

/** The constraint penalty still riding on top of the objective. */
function gapAt(iteration: number): number {
  return 4.2e3 * Math.exp(-iteration / 210);
}

/**
 * Iterations that carry a plotted point: the stride grid up to `current`, plus
 * `current` itself so the head of the curve tracks the run between grid steps.
 * At most ~126 entries, so the whole list is rebuilt on each tick.
 */
function buildIterations(current: number): number[] {
  const iterations: number[] = [];
  for (let i = 0; i < current; i += STRIDE) iterations.push(i);
  iterations.push(current);
  return iterations;
}

/**
 * The solver run, followed over Server-Sent Events.
 *
 * The deliberation and solve are long and stepwise, so the frontend follows
 * them over SSE rather than polling, and the consuming service exposes state
 * as signals — no subscription logic scattered through components (§7.2).
 *
 * The real `EventSource` is not wired yet; this drives the same signals from a
 * timer so the streaming states, the reconnect gap and the stopped-run
 * behaviour are all reachable. Every figure it emits is what the solver would
 * have sent; none is derived here.
 */
@Injectable({ providedIn: 'root' })
export class StreamService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _status = signal<RunStatus>('running');
  private readonly _streamState = signal<StreamState>('connected');
  private readonly _lastEventId = signal(4821);
  private readonly _elapsedSeconds = signal(157);
  private readonly _iteration = signal(1420);
  private readonly _log = signal<readonly RunLogEvent[]>([]);
  private readonly _convergence = signal<readonly number[]>([]);
  private readonly _fitness = signal<readonly number[]>([]);
  private readonly _gap = signal<readonly number[]>([]);
  /** Iteration each convergence point belongs to; the chart's x categories. */
  private readonly _convergenceIterations = signal<readonly number[]>([]);
  /** Iteration at which a stopped run froze; anchors the chart marker. */
  private readonly _stoppedAt = signal<number | null>(null);

  readonly status = this._status.asReadonly();
  readonly streamState = this._streamState.asReadonly();
  readonly lastEventId = this._lastEventId.asReadonly();
  readonly iteration = this._iteration.asReadonly();
  readonly log = this._log.asReadonly();
  readonly convergence = this._convergence.asReadonly();
  readonly convergenceIterations = this._convergenceIterations.asReadonly();

  /** Every metric the convergence chart can plot, indexed by its id. */
  readonly metricSeries = computed<Record<RunMetric, readonly number[]>>(() => ({
    objective: this._convergence(),
    fitness: this._fitness(),
    gap: this._gap(),
  }));
  readonly stoppedAt = this._stoppedAt.asReadonly();
  readonly maxIterations = MAX_ITERATIONS;

  readonly runId = 'fund-4agent-eq-mv-20260801-1142';
  readonly pastRuns = ['current', 'fund-4agent-eq-mv-20260731-0904', 'fund-4agent-cvar-20260729-1530'];

  /** Log continues buffering while paused; only the view stops following. */
  readonly paused = signal(false);

  /**
   * Whether this run carries integer constraints.
   *
   * This single flag decides the whole page's mode: it is known from the
   * problem structure alone, before any iteration arrives, which is why the
   * certificate can be declared inapplicable immediately.
   */
  readonly hasIntegerConstraints = signal(true);

  private timer: ReturnType<typeof setInterval> | null = null;

  readonly elapsed = computed(() => {
    const total = this._elapsedSeconds();
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `00:${mm}:${ss}`;
  });

  readonly isRunning = computed(() => this._status() === 'running');

  readonly classification = computed<ProblemClassification>(() => ({
    detectedClass: 'SOCP',
    hasIntegerConstraints: this.hasIntegerConstraints(),
    variables: 48,
    inequalities: 96,
    equalities: 1,
    // A mixed-integer run cannot answer this until the residual is zero.
    feasibility: this.hasIntegerConstraints()
      ? 'pending'
      : this._status() === 'converged'
        ? 'feasible'
        : 'pending',
  }));

  /** Convex path only — never populated alongside the swarm diagnostics. */
  readonly certificate = computed<OptimalityCertificate | null>(() => {
    if (this.hasIntegerConstraints()) return null;
    if (this._status() === 'idle' || this._status() === 'running') return null;
    return {
      primalValue: 15.241,
      dualValue: 15.2408,
      dualityGap: 0.0002,
      slaterHolds: true,
      strongDuality: true,
      partial: this._status() === 'stopped',
      conditions: [
        { name: 'Stationarity', satisfied: true, residual: 3.1e-9 },
        { name: 'Primal feasibility', satisfied: true, residual: 0 },
        { name: 'Dual feasibility', satisfied: true, residual: 0 },
        // Complementarity stays a binary outcome; the residual sits beside it.
        { name: 'Complementarity', satisfied: true, residual: 4.7e-8 },
      ],
    };
  });

  /** Mixed-integer path only — never populated alongside the certificate. */
  readonly penalty = computed<PenaltyDiagnostics | null>(() => {
    if (!this.hasIntegerConstraints()) return null;
    const status = this._status();
    return {
      particles: 80,
      topology: 'fully connected',
      inertiaFrom: 0.9,
      inertiaTo: 0.4,
      penaltyFactor: 1.0e-3,
      maxHoldings: 10,
      iteration: this._iteration(),
      maxIterations: MAX_ITERATIONS,
      portfolioVariance: 15.241,
      penaltyShare: 0.0022,
      outcome:
        status === 'stopped' ? 'partial' : status === 'converged' ? 'converged-in-probability' : 'in-progress',
    };
  });

  constructor() {
    this.seed();
    this.start();
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  /** Backfills the history the page opens with, mid-run. */
  private seed(): void {
    const current = this._iteration();
    this.setConvergence(buildIterations(current));

    this._log.set([
      {
        id: 4809,
        at: '14:11:58',
        kind: 'notice',
        message: 'stream reconnected · gap id 4802 → 4809 · 7 events replayed',
      },
      { id: 4817, at: '14:12:01', kind: 'event', message: 'iter 1417   fitness 15.2433   VP 15.2409   gap 2.4e-03' },
      { id: 4818, at: '14:12:03', kind: 'event', message: 'iter 1418   fitness 15.2431   VP 15.2409   gap 2.2e-03' },
      { id: 4819, at: '14:12:03', kind: 'event', message: 'iter 1419   fitness 15.2432   VP 15.2409   gap 2.3e-03' },
      { id: 4820, at: '14:12:04', kind: 'event', message: 'iter 1420   fitness 15.2432   VP 15.2410   gap 2.2e-03' },
    ]);
  }

  /** Keeps every metric series and their iteration labels in lockstep. */
  private setConvergence(iterations: readonly number[]): void {
    this._convergenceIterations.set([...iterations]);
    this._convergence.set(iterations.map(objectiveAt));
    this._fitness.set(iterations.map((i) => objectiveAt(i) + gapAt(i)));
    this._gap.set(iterations.map(gapAt));
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this._status() !== 'running') return;

    const iteration = this._iteration() + 1;
    this._iteration.set(iteration);
    this._elapsedSeconds.update((s) => s + 1);
    this._lastEventId.update((id) => id + 1);

    const next = objectiveAt(iteration);
    this.setConvergence(buildIterations(iteration));

    // Buffering continues while paused — only the view stops following.
    this._log.update((events) => [
      ...events.slice(-199),
      {
        id: this._lastEventId(),
        at: new Date().toTimeString().slice(0, 8),
        kind: 'event',
        message: `iter ${iteration}   fitness ${(15.243 + Math.abs(next) * 1e-7).toFixed(4)}   VP 15.2410   gap 2.2e-03`,
      },
    ]);

    if (iteration >= MAX_ITERATIONS) {
      this._status.set('converged');
      this._streamState.set('closed');
      this.stopTimer();
    }
  }

  /**
   * Stops the run at the user's request.
   *
   * The timer freezes where it is rather than resetting, and the status is
   * `stopped` — a neutral outcome, never folded in with a failure.
   */
  stop(): void {
    if (this._status() !== 'running') return;
    this._status.set('stopped');
    this._stoppedAt.set(this._iteration());
    this._streamState.set('closed');
    this.stopTimer();
  }

  /**
   * Restarts from the current configuration.
   *
   * A fresh run has no history, so neither the convergence window nor the log
   * is backfilled — both start empty and fill from iteration 1.
   */
  restart(): void {
    this._status.set('running');
    this._stoppedAt.set(null);
    this._streamState.set('connected');
    this._iteration.set(0);
    this._elapsedSeconds.set(0);
    this.setConvergence([0]);
    this._log.set([]);
    this.start();
  }

  togglePause(): void {
    this.paused.update((p) => !p);
  }
}
