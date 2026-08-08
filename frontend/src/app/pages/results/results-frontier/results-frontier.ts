import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { EntityCard } from '../../../shared/entity-card/entity-card';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { SectionCardGrid } from '../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../shared/status-badge/status-badge';
import { FrontierChartComponent } from '../../../shared/charts';
import type { ChartPointClick, FrontierMarker, Point } from '../../../shared/charts';
import {
  CONSTRAINT_VIEW_LABEL,
  type ConstraintView,
  type NotablePortfolio,
  type PortfolioMetrics,
} from '../../../models/frontier.model';
import { FrontierService } from '../../../services/frontier.service';
import { RiskContributionTable } from './risk-contribution-table/risk-contribution-table';

const CONSTRAINT_VIEWS: readonly ConstraintView[] = ['short-allowed', 'long-only'];

/** Series names the frontier chart emits clicks under. */
const CURVE_SERIES = 'Frontier';
const MARKER_SERIES = 'Notable portfolios';
const ASSET_SERIES = 'Assets';

/**
 * `docs/08 Results & Frontier.md` — the optimisation result in the risk-return
 * plane.
 *
 * One selection drives the whole page: a point on the frontier, moved with the
 * target-return slider or by clicking the curve. The summary card, the notable
 * portfolios and the risk decomposition all read from it.
 *
 * Nothing here is computed. The frontier, the tangency portfolio, the
 * diversification ratio and every risk contribution arrive from the run; the
 * page picks one of the points the solver returned and formats it. That is why
 * the slider snaps to computed points instead of interpolating between them —
 * an interpolated portfolio is one the solver never produced.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-results-frontier',
  imports: [
    ActionButtonRow,
    CrossPageLink,
    EmptyState,
    EntityCard,
    ErrorState,
    FrontierChartComponent,
    InfoCard,
    RiskContributionTable,
    SectionCardGrid,
    SkeletonBlock,
    StatusBadge,
  ],
  templateUrl: './results-frontier.html',
  styleUrl: './results-frontier.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsFrontier {
  private readonly service = inject(FrontierService);

  private readonly chart = viewChild(FrontierChartComponent);

  protected readonly constraintViews = CONSTRAINT_VIEWS;
  protected readonly constraintLabel = CONSTRAINT_VIEW_LABEL;
  protected readonly runs = this.service.runs;
  protected readonly runId = this.service.runId;
  protected readonly constraintView = this.service.constraintView;
  protected readonly state = this.service.state;
  protected readonly result = this.service.result;

  /**
   * Redraw animation is suppressed for a reader who asked for reduced motion.
   * Read once: the option object has to keep a stable identity, or every change
   * detection pass would hand ECharts a new one and re-initialise the chart.
   */
  protected readonly chartOptionPatch = {
    animation: !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  };

  // --- overlays -------------------------------------------------------------
  protected readonly showFrontier = signal(true);
  protected readonly showCal = signal(true);
  protected readonly showGmvp = signal(true);
  protected readonly showMdp = signal(true);
  protected readonly showAssets = signal(true);

  /** Asset highlighted on the plane, kept in step with the table. */
  protected readonly highlightedTicker = signal<string | null>(null);

  /** Set once the user moves off the run's own target. */
  private readonly overrideIndex = signal<number | null>(null);

  protected readonly currentRun = computed(() => this.service.run(this.runId()));
  protected readonly isStale = computed(() => this.currentRun()?.stale ?? false);

  /** A constraint set this run never computed cannot be shown. */
  protected isViewComputed(view: ConstraintView): boolean {
    return this.currentRun()?.computed.includes(view) ?? false;
  }

  /** The CAL needs r_f; the MDP needs an invertible correlation matrix (§8). */
  protected readonly calAvailable = computed(() => this.result()?.riskFreeRate !== null);
  protected readonly mdpAvailable = computed(() => this.result()?.correlationInvertible ?? false);

  // --- selection ------------------------------------------------------------

  /** Points the solver converged on — the only ones the slider can land on. */
  private readonly convergedIndices = computed(() => {
    const points = this.result()?.points ?? [];
    return points.flatMap((point, i) => (point.converged ? [i] : []));
  });

  protected readonly selectedIndex = computed(() => {
    const result = this.result();
    if (!result) return 0;
    const override = this.overrideIndex();
    if (override !== null && result.points[override]?.converged) return override;
    return this.nearestConverged(result.runTargetIndex);
  });

  /** Position of the selection within the converged points — the slider value. */
  protected readonly sliderPosition = computed(() =>
    Math.max(0, this.convergedIndices().indexOf(this.selectedIndex())),
  );

  protected readonly sliderMax = computed(() => Math.max(0, this.convergedIndices().length - 1));

  protected readonly selected = computed<PortfolioMetrics | null>(
    () => this.result()?.points[this.selectedIndex()]?.metrics ?? null,
  );

  protected readonly holdings = computed(
    () => this.result()?.points[this.selectedIndex()]?.holdings ?? [],
  );

  protected readonly atRunTarget = computed(() => this.overrideIndex() === null);

  protected readonly sliderValueText = computed(() => {
    const metrics = this.selected();
    if (!metrics) return '';
    return `${metrics.expectedReturn.toFixed(2)}% target return, standard deviation ${metrics.sd.toFixed(
      2,
    )}%, point ${this.sliderPosition() + 1} of ${this.convergedIndices().length}`;
  });

  // --- chart data -----------------------------------------------------------

  /**
   * The curve, index-aligned with the run's points so a click maps straight
   * back. A point the solver did not converge on is a `null` here, which is
   * what leaves the break in the line rather than bridging over it.
   */
  protected readonly curve = computed<(Point | null)[]>(() => {
    if (!this.showFrontier()) return [];
    return (this.result()?.points ?? []).map((point) =>
      point.converged && point.sd !== null ? ([point.sd, point.targetReturn] as Point) : null,
    );
  });

  protected readonly inefficientBranch = computed<readonly Point[]>(() =>
    this.showFrontier() ? (this.result()?.inefficientBranch ?? []) : [],
  );

  protected readonly notConvergedCount = computed(
    () => (this.result()?.points ?? []).filter((p) => !p.converged).length,
  );

  /** GMVP, tangency and MDP as the run reported them, plus the live selection. */
  protected readonly notable = computed<readonly NotablePortfolio[]>(() => {
    const result = this.result();
    const metrics = this.selected();
    if (!result || !metrics) return [];
    return [
      ...result.notable,
      { id: 'selected', name: 'Selected', metrics, pointIndex: this.selectedIndex() },
    ];
  });

  protected readonly markers = computed<FrontierMarker[]>(() => {
    const markers: FrontierMarker[] = [];
    for (const portfolio of this.notable()) {
      if (portfolio.id === 'gmvp' && !this.showGmvp()) continue;
      if (portfolio.id === 'mdp' && !(this.showMdp() && this.mdpAvailable())) continue;
      if (portfolio.id === 'tangency' && !(this.showCal() && this.calAvailable())) continue;
      markers.push({
        name: portfolio.name,
        x: portfolio.metrics.sd,
        y: portfolio.metrics.expectedReturn,
        // The filled marker is the selection — the point everything else reads
        // from. The chart derives the CAL from the tangency marker by name.
        emphasis: portfolio.id === 'selected',
      });
    }
    return markers;
  });

  /**
   * The chart derives the CAL from r_f through the tangency marker. Withholding
   * the rate is what the overlay toggle switches off, so the line and its
   * marker disappear together.
   */
  protected readonly riskFreeForChart = computed(() =>
    this.showCal() ? (this.result()?.riskFreeRate ?? undefined) : undefined,
  );

  protected readonly assetPoints = computed(() => {
    if (!this.showAssets()) return [];
    const highlighted = this.highlightedTicker();
    return (this.result()?.assets ?? []).map((asset) => ({
      name: asset.ticker,
      x: asset.sd,
      y: asset.expectedReturn,
      highlight: asset.ticker === highlighted,
    }));
  });

  protected readonly chartAriaLabel = computed(() => {
    const named = this.notable()
      .map((p) => `${p.name} at ${p.metrics.sd.toFixed(1)}% risk, ${p.metrics.expectedReturn.toFixed(1)}% return`)
      .join('; ');
    return `Efficient frontier in the risk-return plane. ${named}. The notable portfolio cards and the risk contribution table below carry the same figures.`;
  });

  constructor() {
    void this.service.load();
  }

  // --- interactions ---------------------------------------------------------

  protected async onRun(event: Event): Promise<void> {
    this.resetSelection();
    const runId = (event.target as HTMLSelectElement).value;
    // A run may not have computed the set currently on screen; fall back to one
    // it did, rather than loading straight into the empty state.
    const run = this.service.run(runId);
    const view = run?.computed.includes(this.constraintView())
      ? this.constraintView()
      : (run?.computed[0] ?? this.constraintView());
    await this.service.load(runId, view);
  }

  protected async onConstraintView(view: ConstraintView): Promise<void> {
    if (view === this.constraintView() || !this.isViewComputed(view)) return;
    this.resetSelection();
    await this.service.load(this.runId(), view);
  }

  protected async retry(): Promise<void> {
    await this.service.load();
  }

  protected onSlider(event: Event): void {
    const position = Number((event.target as HTMLInputElement).value);
    const index = this.convergedIndices()[position];
    if (index !== undefined) this.overrideIndex.set(index);
  }

  protected resetTarget(): void {
    this.overrideIndex.set(null);
  }

  /**
   * A click on the plane. The curve and the markers both select; an asset point
   * highlights its row instead, which is the same link the table drives in the
   * other direction.
   */
  protected onChartClick(event: ChartPointClick): void {
    if (event.seriesName === CURVE_SERIES) {
      if (this.result()?.points[event.dataIndex]?.converged) {
        this.overrideIndex.set(event.dataIndex);
      }
      return;
    }
    if (event.seriesName === MARKER_SERIES) {
      const target = this.markers()[event.dataIndex];
      const portfolio = this.notable().find((p) => p.name === target?.name);
      if (portfolio?.pointIndex !== null && portfolio?.pointIndex !== undefined) {
        this.overrideIndex.set(portfolio.pointIndex);
      }
      return;
    }
    if (event.seriesName === ASSET_SERIES) {
      this.highlightedTicker.set(event.name || null);
    }
  }

  /** Selecting a notable portfolio moves the frontier selection to its point. */
  protected selectNotable(portfolio: NotablePortfolio): void {
    if (portfolio.pointIndex === null) return;
    this.overrideIndex.set(portfolio.pointIndex);
  }

  /** Kept short: the card's meta line is a single truncating row. */
  protected cardMeta(metrics: PortfolioMetrics): string {
    return `E(r) ${metrics.expectedReturn.toFixed(2)}% · SD ${metrics.sd.toFixed(
      2,
    )}% · SR ${metrics.sharpe.toFixed(3)} · D ${metrics.diversificationRatio.toFixed(2)}`;
  }

  // --- exports --------------------------------------------------------------

  protected exportWeights(): void {
    const rows = this.holdings();
    const header = 'ticker,name,weight_pct,sd_pct,corr_with_portfolio,contribution_pct,share_of_sd_pct,beta_to_portfolio';
    const body = rows
      .map((r) =>
        [
          r.ticker,
          `"${r.name}"`,
          r.weight.toFixed(4),
          r.sdAsset.toFixed(4),
          r.corrWithPortfolio.toFixed(4),
          r.contribution.toFixed(4),
          r.shareOfSd.toFixed(4),
          r.betaToPortfolio.toFixed(4),
        ].join(','),
      )
      .join('\n');
    this.save(`run-${this.runId()}-weights.csv`, `${header}\n${body}`, 'text/csv');
  }

  protected exportChart(): void {
    const dataUrl = this.chart()?.exportPng();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `run-${this.runId()}-frontier.png`;
    link.click();
  }

  private save(name: string, contents: string, type: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  // --- helpers --------------------------------------------------------------

  private resetSelection(): void {
    this.overrideIndex.set(null);
    this.highlightedTicker.set(null);
  }

  /** Nearest converged point to a given index, searching outward. */
  private nearestConverged(index: number): number {
    const indices = this.convergedIndices();
    if (!indices.length) return 0;
    return indices.reduce((best, i) =>
      Math.abs(i - index) < Math.abs(best - index) ? i : best,
    );
  }
}
