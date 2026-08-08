import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { HeroStatCard } from '../../../shared/hero-stat-card/hero-stat-card';
import { InfoCard } from '../../../shared/info-card/info-card';
import { RetryButton } from '../../../shared/retry-button/retry-button';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../shared/status-badge/status-badge';
import { BarChartComponent, FrontierChartComponent } from '../../../shared/charts';
import type { CategorySeries, FrontierMarker, Point } from '../../../shared/charts';
import {
  CLASSIFICATION_LABEL,
  METHOD_LABEL,
  RECALC_STAGE_LABEL,
  type RevisionClassification,
  type RevisionMethod,
  type SubmitAction,
} from '../../../models/review-rebalancing.model';
import { ReviewRebalancingService } from '../../../services/review-rebalancing.service';
import { DynamicTradingPlan } from './dynamic-trading-plan/dynamic-trading-plan';
import { RevisionComparison } from './revision-comparison/revision-comparison';
import { RevisionCost } from './revision-cost/revision-cost';
import { SignalPersistence } from './signal-persistence/signal-persistence';

const CLASSIFICATIONS: readonly RevisionClassification[] = ['optimal', 'efficient', 'neither'];
const METHODS: readonly RevisionMethod[] = ['smith', 'stone-hill'];

/** An estimation window older than this is worth pointing out. */
const STALE_AFTER_DAYS = 7;

/**
 * `docs/10 Review & Rebalancing.md` — whether to move the portfolio or leave it.
 *
 * The whole page resolves to one subtraction: the expected return the revision
 * would add, less what the revision costs. Everything above the verdict exists
 * to make both sides of that subtraction inspectable — which candidate, at what
 * trading cost, with what tax — and everything below it explains why the signal
 * driving the change generates the turnover it does.
 *
 * Two cycles run independently here and are deliberately never merged: the
 * recalculation, whose failures belong to the section that failed, and the
 * submission of an action, whose failures belong to the button that was pressed.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-review-rebalancing',
  imports: [
    ActionButtonRow,
    BarChartComponent,
    CrossPageLink,
    DynamicTradingPlan,
    EmptyState,
    ErrorState,
    FrontierChartComponent,
    HeroStatCard,
    InfoCard,
    RetryButton,
    RevisionComparison,
    RevisionCost,
    SignalPersistence,
    SkeletonBlock,
    StatusBadge,
  ],
  templateUrl: './review-rebalancing.html',
  styleUrl: './review-rebalancing.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewRebalancing {
  private readonly service = inject(ReviewRebalancingService);

  protected readonly methods = METHODS;
  protected readonly methodLabel = METHOD_LABEL;
  protected readonly classifications = CLASSIFICATIONS;
  protected readonly classificationLabel = CLASSIFICATION_LABEL;
  protected readonly stageLabel = RECALC_STAGE_LABEL;

  protected readonly state = this.service.state;
  protected readonly failedStage = this.service.failedStage;
  protected readonly method = this.service.method;
  protected readonly classification = this.service.classification;
  protected readonly hasCandidate = this.service.hasCandidate;
  protected readonly cost = this.service.cost;
  protected readonly verdict = this.service.verdict;
  protected readonly rows = this.service.rows;
  protected readonly smithPoints = this.service.smithPoints;
  protected readonly currentPoint = this.service.currentPoint;
  protected readonly anySending = this.service.anySending;
  protected readonly asOf = this.service.asOf;
  protected readonly previousAsOf = this.service.previousAsOf;
  protected readonly windowAgeDays = this.service.windowAgeDays;

  protected readonly windowStale = computed(() => this.windowAgeDays() > STALE_AFTER_DAYS);

  constructor() {
    void this.service.load();
  }

  // --- frontier chart -------------------------------------------------------

  /**
   * One formatter for both axes, which the chart shares.
   *
   * Variance and expected return live on different scales here — variance runs
   * in hundredths, the return in percent — so the split at 1 keeps three
   * decimals where they are needed and two where they are not.
   */
  protected readonly planeFormatter = (value: number): string =>
    Math.abs(value) < 1 ? value.toFixed(3) : `${value.toFixed(2)}%`;

  protected readonly frontierCurve = computed<Point[]>(() =>
    this.service.frontierCurve().map((p) => [p[0], p[1]] as Point),
  );

  protected readonly frontierMarkers = computed<FrontierMarker[]>(() => [
    {
      name: 'z*_t',
      x: this.currentPoint.variance,
      y: this.currentPoint.expectedReturn,
    },
    ...this.smithPoints().map((p) => ({
      name: p.label,
      x: p.variance,
      y: p.expectedReturn,
      // Filled marks the point a revision can actually be aimed at.
      emphasis: p.actionable,
    })),
  ]);

  protected readonly frontierDescription = computed(() => {
    const named = this.smithPoints()
      .map((p) => `${p.label} at variance ${p.variance.toFixed(3)}, return ${p.expectedReturn.toFixed(2)}%`)
      .join('; ');
    return `The updated efficient frontier. The current holding z*_t sits at variance ${this.currentPoint.variance.toFixed(
      3,
    )} and return ${this.currentPoint.expectedReturn.toFixed(2)}%, below the frontier. ${named}. The table below carries the same weights.`;
  });

  // --- Stone-Hill corrected returns ----------------------------------------

  protected readonly correctedCategories = computed(() => this.rows().map((r) => r.ticker));

  protected readonly correctedSeries = computed<CategorySeries[]>(() => [
    { name: 'Corrected return c_i', data: this.rows().map((r) => r.correctedReturn) },
  ]);

  // --- verdict bars ---------------------------------------------------------

  protected readonly verdictCategories = ['Δ expected return', 'Revision cost prc'];

  protected readonly verdictSeries = computed<CategorySeries[]>(() => {
    const v = this.verdict();
    return [{ name: 'EUR', data: [v.deltaExpectedReturn, v.cost] }];
  });

  protected readonly moneyFormatter = (value: number): string =>
    value.toLocaleString('en-GB', { maximumFractionDigits: 0 });

  // --- interactions ---------------------------------------------------------

  protected onMethod(method: RevisionMethod): void {
    this.service.setMethod(method);
  }

  protected async refresh(): Promise<void> {
    await this.service.load();
  }

  protected async retryStage(): Promise<void> {
    await this.service.load();
  }

  protected outcome(action: SubmitAction) {
    return this.service.outcome(action);
  }

  protected async submit(action: SubmitAction): Promise<void> {
    await this.service.submit(action);
  }

  protected sendingLabel(action: SubmitAction): string {
    switch (action) {
      case 'approve':
        return 'Sending…';
      case 'hold':
        return 'Recording…';
      default:
        return 'Forwarding…';
    }
  }

  protected readonly banner = this.service.latestOutcome;

  protected actionTitle(action: SubmitAction): string {
    switch (action) {
      case 'approve':
        return 'Approve & send to Execution & Orders Agent';
      case 'hold':
        return 'Hold current portfolio';
      default:
        return 'Send to Human Approval Gate';
    }
  }
}
