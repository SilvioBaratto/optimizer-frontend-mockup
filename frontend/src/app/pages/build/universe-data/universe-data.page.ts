import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { RetryButton } from '../../../shared/retry-button/retry-button';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { BarChartComponent } from '../../../shared/charts';
import type { CategorySeries } from '../../../shared/charts';
import {
  ASSET_STATUS_LABEL,
  ESTIMATOR_LABEL,
  type AssetDataStatus,
  type CovarianceEstimator,
  type DataFrequency,
  type WarningSeverity,
} from '../../../models/universe.model';
import { UniverseService } from '../../../services/universe.service';
import { BuildStepTrackerService } from '../build-step-tracker.service';
import { StepTracker } from '../step-tracker/step-tracker';

const ESTIMATORS: readonly CovarianceEstimator[] = ['sample', 'linear', 'nonlinear', 'ewma', 'dcc'];

const STATUS_TONE: Record<AssetDataStatus, StatusTone> = {
  ok: 'ok',
  short: 'warn',
  gaps: 'warn',
  unavailable: 'alert',
};

const SEVERITY_TONE: Record<WarningSeverity, StatusTone> = {
  blocking: 'alert',
  warning: 'warn',
  ok: 'ok',
};

/** How many table rows show before the "view full table" affordance. */
const INLINE_ROWS = 5;

/**
 * `docs/03 Universe & Data.md` — step 1 of the Build flow.
 *
 * Fixes the investable universe, the sample window and the covariance
 * estimator. Everything numeric on the page is an estimate produced behind the
 * API; the two exceptions are parameter calculators the spec attaches to their
 * own control, and both are marked where they are computed.
 *
 * The page renders no `<h1>` — the shell renders it from the route, so headings
 * here start at `<h2>`.
 */
@Component({
  selector: 'app-universe-data',
  imports: [
    ActionButtonRow,
    BarChartComponent,
    ConfirmDialog,
    EmptyState,
    InfoCard,
    RetryButton,
    SkeletonBlock,
    StatusBadge,
    StepTracker,
  ],
  templateUrl: './universe-data.page.html',
  styleUrl: './universe-data.page.css',
  host: { class: 'flex flex-col gap-8' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UniverseDataPage {
  private readonly universe = inject(UniverseService);
  private readonly tracker = inject(BuildStepTrackerService);

  protected readonly estimators = ESTIMATORS;
  protected readonly estimatorLabel = ESTIMATOR_LABEL;
  protected readonly statusLabel = ASSET_STATUS_LABEL;
  protected readonly inlineRows = INLINE_ROWS;

  protected readonly assets = this.universe.assets;
  protected readonly estimates = this.universe.estimates;
  protected readonly winsorized = this.universe.winsorized;
  protected readonly diagnostics = this.universe.diagnostics;
  protected readonly notices = this.universe.notices;
  protected readonly estimator = this.universe.estimator;
  protected readonly frequency = this.universe.frequency;
  protected readonly recalculating = this.universe.recalculating;
  protected readonly universeSize = this.universe.universeSize;
  protected readonly observations = this.universe.observations;
  protected readonly pOverN = this.universe.pOverN;
  protected readonly hasBlockingWarning = this.universe.hasBlockingWarning;
  protected readonly lastRefresh = this.universe.lastRefresh;

  // --- local UI state -----------------------------------------------------
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly showAllAssets = signal(false);
  protected readonly showAllEstimates = signal(false);
  protected readonly showAllEigenvalues = signal(false);
  protected readonly winsorizationOn = signal(true);
  protected readonly censoredPerTail = signal(2);
  protected readonly showBeforeAfter = signal(false);
  protected readonly decay = signal(0.94);
  protected readonly windowTolerance = signal(1);
  protected readonly targetHalfWidth = signal(2);
  protected readonly confirmReset = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly announcement = signal('');

  protected readonly visibleAssets = computed(() =>
    this.showAllAssets() ? this.assets() : this.assets().slice(0, INLINE_ROWS),
  );
  protected readonly hiddenAssetCount = computed(() =>
    Math.max(0, this.assets().length - INLINE_ROWS),
  );

  protected readonly visibleEstimates = computed(() =>
    this.showAllEstimates() ? this.estimates() : this.estimates().slice(0, INLINE_ROWS),
  );
  protected readonly hiddenEstimateCount = computed(() =>
    Math.max(0, this.estimates().length - INLINE_ROWS),
  );

  protected readonly isEmpty = computed(() => this.assets().length === 0);

  /**
   * EWMA effective window, `K = ln(Υ_L)/ln(λ)`.
   *
   * Derived here rather than fetched: it is a readout of the two controls
   * beside it, not an estimate of anything, and the spec assigns the
   * recalculation to the control itself.
   */
  protected readonly effectiveObservations = computed(() => {
    const lambda = this.decay();
    const tolerance = this.windowTolerance() / 100;
    if (lambda <= 0 || lambda >= 1 || tolerance <= 0) return null;
    return Math.round(Math.log(tolerance) / Math.log(lambda));
  });

  /**
   * Required sample size for the target half-width, `T = (2σ/h)²`.
   *
   * Same category as `K`: a calculator behind its own field. It changes
   * nothing on the page — the estimates shown stay as the API returned them.
   */
  protected readonly requiredObservations = computed(() => {
    const h = this.targetHalfWidth();
    if (h <= 0) return [];
    return this.estimates()
      .filter((e) => e.sd !== null)
      .map((e) => ({ ticker: e.ticker, required: Math.round((2 * (e.sd as number) / h) ** 2) }))
      .sort((a, b) => b.required - a.required)
      .slice(0, 2);
  });

  /** Grouped bars: raw eigenvalue against its shrunk counterpart. */
  protected readonly spectrumCategories = computed(() => {
    const all = this.diagnostics().spectrum;
    const shown = this.showAllEigenvalues() ? all : all.slice(0, 3);
    return shown.map((e) => `λ${e.index}`);
  });

  protected readonly spectrumSeries = computed<CategorySeries[]>(() => {
    const all = this.diagnostics().spectrum;
    const shown = this.showAllEigenvalues() ? all : all.slice(0, 3);
    return [
      { name: 'Sample', data: shown.map((e) => e.sample) },
      { name: 'Shrunk', data: shown.map((e) => e.shrunk) },
    ];
  });

  protected readonly hiddenEigenvalueCount = computed(() =>
    Math.max(0, this.diagnostics().spectrum.length - 3),
  );

  // --- interactions -------------------------------------------------------

  protected isSelected(ticker: string): boolean {
    return this.selected().includes(ticker);
  }

  protected toggleSelected(ticker: string, checked: boolean): void {
    this.selected.update((current) =>
      checked ? [...current, ticker] : current.filter((t) => t !== ticker),
    );
  }

  protected toggleIncluded(ticker: string, included: boolean): void {
    this.universe.toggleAsset(ticker, included);
  }

  /**
   * Removal always confirms when it would leave fewer than two assets — a
   * one-asset universe has no covariance to estimate.
   */
  protected requestRemove(): void {
    if (this.selected().length === 0) return;
    this.confirmRemove.set(true);
  }

  protected async performRemove(): Promise<void> {
    const removed = this.selected();
    this.confirmRemove.set(false);
    this.selected.set([]);
    await this.universe.remove(removed);
    this.announcement.set(`${removed.length} asset(s) removed. Estimates recalculated.`);
  }

  protected wouldDropBelowTwo(): boolean {
    return this.assets().length - this.selected().length < 2;
  }

  protected onEstimator(estimator: CovarianceEstimator): void {
    this.universe.setEstimator(estimator);
    this.announcement.set(`${ESTIMATOR_LABEL[estimator]} selected. Diagnostics recalculated.`);
  }

  protected async onFrequency(frequency: DataFrequency): Promise<void> {
    // Changing frequency moves the conventional default for lambda with it.
    this.decay.set(frequency === 'daily' ? 0.94 : 0.97);
    await this.universe.setFrequency(frequency);
    this.announcement.set(`Frequency set to ${frequency}. Estimates recalculated.`);
  }

  protected async retry(ticker: string): Promise<void> {
    await this.universe.retry(ticker);
    this.announcement.set(`${ticker} data refetched.`);
  }

  protected async performReset(): Promise<void> {
    this.confirmReset.set(false);
    await this.universe.reset();
    this.announcement.set('Page reset to defaults.');
  }

  protected continue(): void {
    this.tracker.unlock(2);
  }

  protected statusTone(status: AssetDataStatus): StatusTone {
    return STATUS_TONE[status];
  }

  protected severityTone(severity: WarningSeverity): StatusTone {
    return SEVERITY_TONE[severity];
  }

  protected onNumber(event: Event, target: (v: number) => void): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) target(value);
  }
}
