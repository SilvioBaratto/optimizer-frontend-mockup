import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { ActionButtonRow } from '../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { EntityCard } from '../../shared/entity-card/entity-card';
import { ErrorState } from '../../shared/error-state/error-state';
import { HeroStatCard } from '../../shared/hero-stat-card/hero-stat-card';
import { InfoCard } from '../../shared/info-card/info-card';
import { RefreshControl } from '../../shared/refresh-control/refresh-control';
import { SectionCardGrid } from '../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../shared/status-badge/status-badge';
import { FrontierChartComponent } from '../../shared/charts';
import type { Point } from '../../shared/charts';
import type { AgentStatus } from '../../models/fund-state.model';
import {
  RISK_MEASURE_CAPTION,
  RISK_MEASURE_LABEL,
  type ConditionStatus,
  type OperationalCondition,
  type PhaseStatus,
  type RiskMeasure,
} from '../../models/optimization-run.model';
import { FundService } from '../../services/fund.service';
import { OptimizeService } from '../../services/optimize.service';

const RISK_MEASURES: readonly RiskMeasure[] = ['variance', 'semi-variance', 'mad-squared'];

const PHASE_TONE: Record<PhaseStatus, StatusTone> = {
  completed: 'ok',
  current: 'active',
  pending: 'pending',
};

const CONDITION_TONE: Record<ConditionStatus, StatusTone> = {
  ok: 'ok',
  watch: 'warn',
  alert: 'alert',
};

const AGENT_TONE: Record<AgentStatus, StatusTone> = {
  active: 'ok',
  'needs-review': 'warn',
  idle: 'pending',
  failed: 'alert',
};

const AGENT_LABEL: Record<AgentStatus, string> = {
  active: 'Active',
  'needs-review': 'Needs review',
  idle: 'Idle',
  failed: 'Failed',
};

/**
 * `docs/02 Dashboard.md` — the optimizer dashboard.
 *
 * Reads the current portfolio's last run and the surrounding process state. It
 * follows the topbar's portfolio scope: changing the active portfolio reloads
 * the whole page in the new context.
 *
 * The page renders no `<h1>` of its own — the shell renders it from the route,
 * so every heading here starts at `<h2>`.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    ActionButtonRow,
    CrossPageLink,
    EmptyState,
    EntityCard,
    ErrorState,
    FrontierChartComponent,
    HeroStatCard,
    InfoCard,
    RefreshControl,
    SectionCardGrid,
    SkeletonBlock,
    StatusBadge,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  // The outlet renders this as a sibling, so the shell's column gap does not
  // reach the page's regions — the page spaces its own.
  host: { class: 'flex flex-col gap-8' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly fund = inject(FundService);
  private readonly optimize = inject(OptimizeService);

  protected readonly riskMeasures = RISK_MEASURES;
  protected readonly riskLabel = RISK_MEASURE_LABEL;

  protected readonly portfolio = this.fund.active;
  protected readonly snapshot = this.optimize.snapshot;
  protected readonly activityFailed = this.optimize.activityFailed;

  protected readonly riskMeasure = signal<RiskMeasure>('variance');
  /** Condition whose explanation is open; only one at a time. */
  protected readonly openCondition = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected readonly isLoading = computed(() => this.optimize.state() === 'loading');
  protected readonly hasError = computed(() => this.optimize.state() === 'error');
  protected readonly run = computed(() => this.snapshot()?.run ?? null);
  /** No run yet for this portfolio — distinct from a failed load. */
  protected readonly noRun = computed(() => this.optimize.state() === 'ready' && !this.run());

  protected readonly riskValue = computed(() => this.run()?.metrics.risk[this.riskMeasure()] ?? null);
  protected readonly riskCaption = computed(() => RISK_MEASURE_CAPTION[this.riskMeasure()]);

  /**
   * Panel title tracks the selected measure.
   *
   * The spec carries a blocking review note on exactly this: the panel was
   * fixed at "Mean-Variance Position" while the axis switched to semi-variance
   * or MAD², presenting one construct under another's name. Of the two
   * corrections the note offers, this is the second — the title moves with the
   * axis, so the label always names what is drawn.
   */
  protected readonly positionTitle = computed(() => {
    const map: Record<RiskMeasure, string> = {
      variance: 'Mean-Variance Position',
      'semi-variance': 'Mean-Semivariance Position',
      'mad-squared': 'Mean-MAD² Position',
    };
    return map[this.riskMeasure()];
  });

  /**
   * Dominance is defined only against variance, so the comparison is stated
   * only there. Under the other measures the frontier and the dominance
   * criterion are not defined, and claiming one would be inventing theory.
   */
  protected readonly dominanceText = computed(() => {
    const run = this.run();
    if (!run) return '';
    if (this.riskMeasure() !== 'variance') {
      return 'Dominance is defined against variance only; no comparison is shown for this measure.';
    }
    return run.dominatedBy === 0
      ? 'Current portfolio is efficient — no frontier point dominates it.'
      : `Current portfolio is dominated by ${run.dominatedBy} frontier points.`;
  });

  /** Screen-reader equivalent of the chart, which conveys nothing on its own. */
  protected readonly positionSummary = computed(() => {
    const run = this.run();
    if (!run) return '';
    return (
      `Expected return ${run.metrics.expectedReturn.toFixed(1)} percent, ` +
      `${this.riskCaption()} ${this.riskValue()?.toFixed(1)} percent. ` +
      this.dominanceText()
    );
  });

  protected readonly frontierCurve = computed<Point[]>(
    () => this.run()?.frontier.map((p) => [p.risk, p.expectedReturn] as Point) ?? [],
  );

  protected readonly currentMarker = computed(() => {
    const run = this.run();
    return run ? [{ name: 'Current', x: run.current.risk, y: run.current.expectedReturn, emphasis: true }] : [];
  });

  constructor() {
    // The page follows the topbar's scope: a new active portfolio reloads it.
    effect(() => {
      const active = this.portfolio();
      if (active) void this.optimize.load(active.id);
    });
  }

  protected onRiskMeasure(event: Event): void {
    this.riskMeasure.set((event.target as HTMLSelectElement).value as RiskMeasure);
  }

  protected toggleCondition(condition: OperationalCondition): void {
    this.openCondition.update((id) => (id === condition.id ? null : condition.id));
  }

  protected refresh(): void {
    const active = this.portfolio();
    if (!active) return;
    this.announcement.set('Refreshing dashboard…');
    void this.optimize.load(active.id).then(() => this.announcement.set('Dashboard updated'));
  }

  protected phaseTone(status: PhaseStatus): StatusTone {
    return PHASE_TONE[status];
  }

  protected conditionTone(status: ConditionStatus): StatusTone {
    return CONDITION_TONE[status];
  }

  protected agentTone(status: AgentStatus): StatusTone {
    return AGENT_TONE[status];
  }

  protected agentLabel(status: AgentStatus): string {
    return AGENT_LABEL[status];
  }
}
