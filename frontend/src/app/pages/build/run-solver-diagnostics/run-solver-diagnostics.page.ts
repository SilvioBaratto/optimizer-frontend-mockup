import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { LineChartComponent } from '../../../shared/charts';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { MathVar } from '../../../shared/math/math-var';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import type { CategorySeries, RefLine } from '../../../shared/charts';
import {
  CONVEX_CHAIN,
  type FeasibilityBadge,
  type RunMetric,
  type RunStatus,
  type SwarmOutcome,
} from '../../../models/optimization-run.model';
import { StreamService } from '../../../services/stream.service';
import { StepTracker } from '../step-tracker/step-tracker';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';

/**
 * Each outcome gets its own treatment. `stopped` is neutral — a user decision,
 * never dressed as a failure — and `infeasible`/`unbounded` are results the
 * solver reached, not errors it hit.
 */
const STATUS_TONE: Record<RunStatus, StatusTone> = {
  idle: 'pending',
  running: 'active',
  converged: 'ok',
  infeasible: 'warn',
  unbounded: 'warn',
  failed: 'alert',
  stopped: 'neutral',
};

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Not started',
  running: 'Running',
  converged: 'Converged',
  infeasible: 'Infeasible',
  unbounded: 'Unbounded',
  failed: 'Failed',
  stopped: 'Stopped',
};

const FEASIBILITY_LABEL: Record<FeasibilityBadge, string> = {
  pending: 'pending',
  feasible: 'feasible',
  infeasible: 'infeasible',
};

const SWARM_OUTCOME_TEXT: Record<SwarmOutcome, string> = {
  'in-progress':
    'in progress — converges in probability only, not in a finite step count, and never into a global optimality certificate',
  'converged-in-probability':
    'converged in probability — this is not a global optimality certificate',
  partial: 'partial — run stopped before completion',
};

const METRIC_LABEL: Record<RunMetric, string> = {
  objective: 'Objective (VP)',
  fitness: 'Fitness (VP + penalty)',
  gap: 'Gap (fitness − VP)',
};

const METRIC_AXIS_NAME: Record<RunMetric, string> = {
  objective: 'VP',
  fitness: 'f',
  gap: 'gap',
};

/** Log rows kept in view; the buffer behind them keeps filling. */
const VISIBLE_LOG_ROWS = 5;

/**
 * `docs/07 Run & Solver Diagnostics.md` — step 5 of the Build flow.
 *
 * Follows a solve over SSE. The page has two mutually exclusive modes decided
 * by one fact — whether the run carries integer constraints:
 *
 * - purely convex: an optimality certificate with primal, dual, gap, Slater,
 *   strong duality and the four KKT conditions;
 * - mixed-integer: a complexity notice and penalty/swarm diagnostics, with the
 *   certificate declared inapplicable.
 *
 * They never appear together for the same run.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-run-solver-diagnostics',
  imports: [
    ActionButtonRow,
    ConfirmDialog,
    CrossPageLink,
    EmptyState,
    InfoCard,
    LineChartComponent,
    MathVar,
    PageContextBar,
    StatusBadge,
    StepTracker,
    ButtonDirective,
    SelectDirective,
  ],
  templateUrl: './run-solver-diagnostics.page.html',
  styleUrl: './run-solver-diagnostics.page.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunSolverDiagnosticsPage {
  private readonly stream = inject(StreamService);

  protected readonly convexChain = CONVEX_CHAIN;
  protected readonly runId = this.stream.runId;
  protected readonly pastRuns = this.stream.pastRuns;
  protected readonly status = this.stream.status;
  protected readonly streamState = this.stream.streamState;
  protected readonly lastEventId = this.stream.lastEventId;
  protected readonly elapsed = this.stream.elapsed;
  protected readonly iteration = this.stream.iteration;
  protected readonly maxIterations = this.stream.maxIterations;
  protected readonly classification = this.stream.classification;
  protected readonly certificate = this.stream.certificate;
  protected readonly penalty = this.stream.penalty;
  protected readonly log = this.stream.log;
  protected readonly paused = this.stream.paused;
  protected readonly stoppedAt = this.stream.stoppedAt;
  protected readonly isRunning = this.stream.isRunning;

  // --- local UI state -----------------------------------------------------
  protected readonly logScale = signal(true);
  protected readonly metric = signal<RunMetric>('objective');
  protected readonly autoScroll = signal(true);
  protected readonly compareRun = signal('none');
  protected readonly whyNotShownOpen = signal(false);
  protected readonly confirmStop = signal(false);
  protected readonly showFullLog = signal(false);

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly statusTone = computed(() => STATUS_TONE[this.status()]);

  protected readonly feasibilityLabel = computed(
    () => FEASIBILITY_LABEL[this.classification().feasibility],
  );
  protected readonly feasibilityTone = computed<StatusTone>(() => {
    const badge = this.classification().feasibility;
    return badge === 'feasible' ? 'ok' : badge === 'infeasible' ? 'alert' : 'pending';
  });

  /** Mixed-integer runs carry the complexity notice and the swarm panel. */
  protected readonly isMixedInteger = computed(() => this.classification().hasIntegerConstraints);

  protected readonly detectedClassText = computed(() => {
    const c = this.classification();
    return c.hasIntegerConstraints
      ? `mixed-integer (${c.detectedClass} relaxation)`
      : c.detectedClass;
  });

  protected readonly swarmOutcomeText = computed(() => {
    const p = this.penalty();
    return p ? SWARM_OUTCOME_TEXT[p.outcome] : '';
  });

  protected readonly isEmpty = computed(() => this.status() === 'idle');

  // --- chart --------------------------------------------------------------

  /**
   * Real iteration numbers, not point positions — the axis is labelled `iter`,
   * so a run at iteration 1439 must not show a category axis running 1…126.
   */
  protected readonly convergenceX = computed(() =>
    this.stream.convergenceIterations().map(String),
  );

  protected readonly metricLabel = computed(() => METRIC_LABEL[this.metric()]);
  protected readonly metricAxisName = computed(() => METRIC_AXIS_NAME[this.metric()]);

  protected readonly convergenceSeries = computed<CategorySeries[]>(() => {
    const metric = this.metric();
    const data = this.stream.metricSeries()[metric];
    const series: CategorySeries[] = [{ name: METRIC_LABEL[metric], data: [...data] }];
    // A compared run overlays a dashed second series and leaves the current
    // run's values untouched.
    if (this.compareRun() !== 'none') {
      series.push({ name: this.compareRun(), data: data.map((v) => v * 1.18) });
    }
    return series;
  });

  /**
   * Anchors the chart at the point a stopped run froze.
   *
   * The x axis is categorical, so the value is a category index, not an
   * iteration number — the last point kept in the window is where the stream
   * went quiet.
   */
  protected readonly stopMarker = computed<RefLine[]>(() => {
    const at = this.stoppedAt();
    if (at === null) return [];
    const lastIndex = this.stream.convergence().length - 1;
    if (lastIndex < 0) return [];
    return [{ value: lastIndex, label: 'run stopped', axis: 'x' }];
  });

  // --- log ----------------------------------------------------------------

  /**
   * The newest event id the view is allowed to show, or `null` when following
   * live. Set on pause, so the view holds still while the buffer behind it
   * keeps filling — matched by event id rather than index, because the buffer
   * drops its oldest entries and every index would shift underneath.
   */
  private readonly frozenLastId = signal<number | null>(null);

  /** Everything buffered, cut off at the freeze point when paused. */
  private readonly followedLog = computed(() => {
    const all = this.log();
    const cut = this.frozenLastId();
    return cut === null ? all : all.filter((entry) => entry.id <= cut);
  });

  protected readonly visibleLog = computed(() => {
    const followed = this.followedLog();
    return this.showFullLog() ? followed : followed.slice(-VISIBLE_LOG_ROWS);
  });

  protected readonly hiddenLogCount = computed(() =>
    Math.max(0, this.followedLog().length - VISIBLE_LOG_ROWS),
  );

  /** Announced only on status changes, never on every iteration. */
  protected readonly statusAnnouncement = computed(() => {
    switch (this.status()) {
      case 'stopped':
        return 'Run stopped by user, partial data available.';
      case 'converged':
        return 'Run converged.';
      case 'failed':
        return 'Run failed.';
      case 'infeasible':
        return 'Problem is infeasible.';
      case 'unbounded':
        return 'Problem is unbounded.';
      default:
        return '';
    }
  });

  private readonly logList = viewChild<ElementRef<HTMLElement>>('logList');

  constructor() {
    // Keeps the newest row in view as events arrive. Reading `visibleLog()` is
    // what subscribes this to new events; scrolling is a DOM side effect, so it
    // belongs in an effect rather than a computed.
    effect(() => {
      this.visibleLog();
      if (!this.autoScroll()) return;
      const el = this.logList()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // --- interactions -------------------------------------------------------

  protected requestStop(): void {
    this.confirmStop.set(true);
  }

  protected performStop(): void {
    this.confirmStop.set(false);
    this.stream.stop();
  }

  protected restart(): void {
    this.stream.restart();
  }

  protected togglePause(): void {
    const pausing = !this.paused();
    this.frozenLastId.set(pausing ? (this.log().at(-1)?.id ?? null) : null);
    this.stream.togglePause();
  }

  /** Writes the whole buffer, not the truncated view. */
  protected downloadLog(): void {
    const body = this.log()
      .map((entry) => `${entry.at}  ${entry.id}  ${entry.message}`)
      .join('\n');
    this.saveFile(`${this.runId}-log.txt`, body, 'text/plain');
  }

  /** The run's diagnostics exactly as the page received them. */
  protected exportDiagnostics(): void {
    const payload = {
      run: this.runId,
      status: this.status(),
      iteration: this.iteration(),
      maxIterations: this.maxIterations,
      classification: this.classification(),
      certificate: this.certificate(),
      penalty: this.penalty(),
      stoppedAt: this.stoppedAt(),
      log: this.log(),
    };
    this.saveFile(
      `${this.runId}-diagnostics.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
  }

  private saveFile(name: string, contents: string, type: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected onCompare(event: Event): void {
    this.compareRun.set((event.target as HTMLSelectElement).value);
  }

  protected onMetric(event: Event): void {
    this.metric.set((event.target as HTMLSelectElement).value as RunMetric);
  }
}
