import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { HeroStatCard } from '../../../shared/hero-stat-card/hero-stat-card';
import { InfoCard } from '../../../shared/info-card/info-card';
import { MathVar } from '../../../shared/math/math-var';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { TabComponent, TabPanelComponent, TabsComponent } from '../../../shared/ui/tabs/tabs';
import { BarChartComponent, percent } from '../../../shared/charts';
import type { CategorySeries } from '../../../shared/charts';
import {
  FACTOR_SOURCE_LABEL,
  SIGNAL_CATEGORY_LABEL,
  type Centering,
  type FactorSource,
  type ModelStatus,
} from '../../../models/factor-model.model';
import { SignalsService } from '../../../services/signals.service';
import { StepTracker } from '../step-tracker/step-tracker';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';

const SOURCES: readonly FactorSource[] = ['macroeconomic', 'style', 'statistical'];
const CENTERINGS: readonly Centering[] = ['centered', 'traded'];

const STATUS_TONE: Record<ModelStatus, StatusTone> = {
  draft: 'pending',
  estimating: 'active',
  estimated: 'ok',
};

const STATUS_LABEL: Record<ModelStatus, string> = {
  draft: 'Draft',
  estimating: 'Estimating…',
  estimated: 'Estimated',
};

/** Rows shown before the full-table affordance. */
const INLINE_ROWS = 3;

/**
 * `docs/04 Signals & Factors.md` — step 2 of the Build flow.
 *
 * Four tabs over one shared page: the factor-model library and its detail
 * panel, the fundamentals screener, the alpha-signal library, and the
 * combination diagnostics. Each tab keeps its own selection when you switch
 * away and back, which is why the selections live in signals here rather than
 * being reset on tab change.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-signals-factors',
  imports: [
    ActionButtonRow,
    BarChartComponent,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    HeroStatCard,
    InfoCard,
    MathVar,
    SkeletonBlock,
    StatusBadge,
    StepTracker,
    TabComponent,
    TabPanelComponent,
    TabsComponent,
    ButtonDirective,
    SelectDirective,
  ],
  templateUrl: './signals-factors.page.html',
  styleUrl: './signals-factors.page.css',
  host: { class: 'flex flex-col gap-8' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalsFactorsPage {
  private readonly service = inject(SignalsService);

  protected readonly sources = SOURCES;
  protected readonly centerings = CENTERINGS;
  protected readonly sourceLabel = FACTOR_SOURCE_LABEL;
  protected readonly categoryLabel = SIGNAL_CATEGORY_LABEL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly inlineRows = INLINE_ROWS;
  /** Variance shares are percentages. */
  protected readonly pct = percent;

  protected readonly models = this.service.models;
  protected readonly signalLibrary = this.service.signals;
  protected readonly screened = this.service.screened;
  protected readonly fundamentalLaw = this.service.fundamentalLaw;
  protected readonly selected = this.service.selected;
  protected readonly selectedSignal = this.service.selectedSignal;
  protected readonly isEstimating = this.service.isEstimating;
  protected readonly error = this.service.error;

  // --- local UI state -----------------------------------------------------
  protected readonly query = signal('');
  protected readonly showAllExposures = signal(false);
  protected readonly confirmRerun = signal(false);
  protected readonly tiltFactor = signal('PC2');
  protected readonly tiltObjective = signal<'max-exposure' | 'mean-variance'>('max-exposure');
  protected readonly gamma = signal(2.5);
  protected readonly topN = signal(50);
  protected readonly weighting = signal<'equal' | 'cap'>('equal');
  protected readonly breadth = signal(120);
  protected readonly lambdaR = signal(3.0);
  protected readonly signalCorrelation = signal(0.18);
  protected readonly targetAutocorrelation = signal(0.6);
  protected readonly announcement = signal('');

  /** Filters the loaded library by name; never refetches. */
  protected readonly filteredModels = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.models();
    return q ? all.filter((m) => m.name.toLowerCase().includes(q)) : all;
  });

  protected readonly isEmpty = computed(() => this.models().length === 0);

  /** Statistical models report variance shares; named schemes list factors. */
  protected readonly isStatistical = computed(() => this.selected()?.source === 'statistical');

  protected readonly varianceCategories = computed(() =>
    this.selected()?.variance.map((v) => v.name) ?? [],
  );

  protected readonly varianceSeries = computed<CategorySeries[]>(() => [
    {
      name: 'Variance explained',
      data: this.selected()?.variance.map((v) => v.share) ?? [],
    },
  ]);

  protected readonly cumulativeVariance = computed(() =>
    (this.selected()?.variance ?? []).reduce((sum, v) => sum + v.share, 0),
  );

  protected readonly visibleExposures = computed(() => {
    const all = this.selected()?.exposures ?? [];
    return this.showAllExposures() ? all : all.slice(0, INLINE_ROWS);
  });

  protected readonly hiddenExposureCount = computed(() =>
    Math.max(0, (this.selected()?.exposures.length ?? 0) - INLINE_ROWS),
  );

  /**
   * Blume shrinkage corrects a market or style beta towards one. There is no
   * such prior for a statistical factor, so the control is disabled rather
   * than silently doing nothing.
   */
  protected readonly blumeAvailable = computed(() => {
    const source = this.selected()?.source;
    return source === 'style' || source === 'macroeconomic';
  });

  protected readonly canSend = computed(
    () => this.selected()?.status === 'estimated' && !this.selected()?.stale,
  );

  // --- interactions -------------------------------------------------------

  protected select(id: string): void {
    this.service.select(id);
  }

  protected onSource(source: FactorSource): void {
    this.service.updateSpecification({ source });
    this.announcement.set(
      `Source set to ${FACTOR_SOURCE_LABEL[source]}. Existing exposures invalidated — re-run the estimation.`,
    );
  }

  protected onK(event: Event): void {
    const k = Number((event.target as HTMLSelectElement).value);
    this.service.updateSpecification({ k });
    this.announcement.set(`K set to ${k}. Existing exposures invalidated.`);
  }

  protected onCentering(event: Event): void {
    this.service.updateSpecification({
      centering: (event.target as HTMLSelectElement).value as Centering,
    });
  }

  /**
   * Re-running over an already-estimated model overwrites its exposures, so
   * it asks first. A draft has nothing to lose and runs straight away.
   */
  protected requestRun(): void {
    if (this.selected()?.status === 'estimated') {
      this.confirmRerun.set(true);
      return;
    }
    void this.run();
  }

  protected async run(): Promise<void> {
    this.confirmRerun.set(false);
    this.announcement.set('Estimation started.');
    await this.service.runEstimation();
    this.announcement.set('Estimation complete.');
  }

  protected statusTone(status: ModelStatus): StatusTone {
    return STATUS_TONE[status];
  }

  /** Full state in one string, so nothing depends on the badge colour. */
  protected cardLabel(name: string, source: FactorSource, k: number, status: ModelStatus): string {
    return `${name}, ${FACTOR_SOURCE_LABEL[source]}, K=${k}, ${STATUS_LABEL[status]}`;
  }

  protected onNumber(event: Event, target: (v: number) => void): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) target(value);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
