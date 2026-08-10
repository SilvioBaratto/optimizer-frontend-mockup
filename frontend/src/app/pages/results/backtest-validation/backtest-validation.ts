import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { HeroStatCard } from '../../../shared/hero-stat-card/hero-stat-card';
import { MathVar } from '../../../shared/math/math-var';
import { RetryButton } from '../../../shared/retry-button/retry-button';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { BarChartComponent, LineChartComponent, decimal, percent } from '../../../shared/charts';
import type { CategorySeries } from '../../../shared/charts';
import {
  SECTIONS,
  type CorrectionMethod,
  type CriterionStatus,
  type SectionId,
} from '../../../models/backtest-validation.model';
import { BacktestValidationService } from '../../../services/backtest-validation.service';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';
import { EconomicRationale } from './economic-rationale/economic-rationale';
import { TrialLog } from './trial-log/trial-log';
import { ValidationSection } from './validation-section/validation-section';

const BADGE_TONE: Record<CriterionStatus, StatusTone> = {
  pass: 'ok',
  warn: 'warn',
  fail: 'alert',
  'not-set': 'pending',
  calculating: 'active',
  error: 'alert',
};

const BADGE_LABEL: Record<CriterionStatus, string> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  'not-set': 'not set',
  calculating: 'calculating',
  error: 'error',
};

/** Actions that talk to a backend and can therefore fail on their own. */
type PageAction = 'export' | 'report' | 'send';

/**
 * `docs/09 Backtest & Validation.md` — deciding whether a backtest's numbers
 * can be believed.
 *
 * The page is one argument in seven parts, and its spine is a single number:
 * the Sharpe ratio of the trial that was selected. The haircut and the
 * deflation are two different discounts applied to that same Sharpe, so both
 * panels show it read-only, name the trial it came from, and link back to that
 * row in the log. Two panels quoting two different Sharpes would leave a reader
 * unable to tell what is being discounted — which is the one blocking finding
 * recorded against this spec.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-backtest-validation',
  imports: [
    ActionButtonRow,
    BarChartComponent,
    CrossPageLink,
    EconomicRationale,
    EmptyState,
    HeroStatCard,
    LineChartComponent,
    MathVar,
    RetryButton,
    SkeletonBlock,
    StatusBadge,
    TrialLog,
    ValidationSection,
    ButtonDirective,
    SelectDirective,
  ],
  templateUrl: './backtest-validation.html',
  styleUrl: './backtest-validation.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BacktestValidation {
  private readonly service = inject(BacktestValidationService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly sections = SECTIONS;
  protected readonly state = this.service.state;
  protected readonly selected = this.service.selectedSharpe;

  protected readonly criteria = this.service.criteria;
  protected readonly failingCount = this.service.failingCount;
  protected readonly warningCount = this.service.warningCount;
  protected readonly validated = this.service.validated;

  protected readonly trialSummary = this.service.trialSummary;
  protected readonly outOfSample = this.service.outOfSample;
  protected readonly multipleTesting = this.service.multipleTesting;
  protected readonly haircut = this.service.haircut;
  protected readonly deflated = this.service.deflated;
  protected readonly pbo = this.service.pbo;
  protected readonly partitionsInvalid = this.service.partitionsInvalid;
  protected readonly momentsUnavailable = this.service.momentsUnavailable;
  protected readonly rationaleLocked = this.service.rationaleLocked;

  protected readonly alpha = this.service.alpha;
  protected readonly sampleLength = this.service.sampleLength;
  protected readonly varianceOfSharpes = this.service.varianceOfSharpes;
  protected readonly dsrThreshold = this.service.dsrThreshold;
  protected readonly partitions = this.service.partitions;
  protected readonly pboThreshold = this.service.pboThreshold;
  protected readonly minimumAcceptableHsr = this.service.minimumAcceptableHsr;
  protected readonly inSamplePercent = this.service.inSamplePercent;

  protected readonly percentFormatter = percent;
  protected readonly decimalFormatter = decimal;

  /** Section currently in view, for the nav's `aria-current`. */
  protected readonly activeSection = signal<SectionId>('trial-log');

  protected readonly exportMenuOpen = signal(false);
  /** Actions that failed and are offering a retry, keyed by action. */
  protected readonly failures = signal<readonly PageAction[]>([]);
  protected readonly reportGenerated = signal(false);
  protected readonly announcement = signal('');

  /**
   * One transient failure per action, so the spec's inline error banner and its
   * retry are reachable rather than theoretical. Stands in for a flaky endpoint;
   * the retry then succeeds.
   */
  private readonly attempted = new Set<PageAction>();

  private readonly reducedMotion =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  private observer: IntersectionObserver | null = null;

  constructor() {
    void this.service.load();

    // The sections do not exist while the page is still loading, so the
    // observer is attached once the content is actually in the DOM — not on
    // first render, when there is nothing to observe.
    effect((onCleanup) => {
      if (this.state() !== 'ready') return;
      const handle = setTimeout(() => this.attachScrollSpy());
      onCleanup(() => clearTimeout(handle));
    });

    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  // --- summary --------------------------------------------------------------

  protected badgeTone(status: CriterionStatus): StatusTone {
    return BADGE_TONE[status];
  }

  protected badgeLabel(status: CriterionStatus): string {
    return BADGE_LABEL[status];
  }

  protected statusOf(section: SectionId): CriterionStatus | null {
    return this.criteria().find((c) => c.section === section)?.status ?? null;
  }

  protected isRecalculating(section: SectionId): boolean {
    return this.service.isRecalculating(section);
  }

  protected readonly verdict = computed(() => {
    if (this.validated()) return 'VALIDATED';
    const parts: string[] = [];
    if (this.failingCount()) parts.push(`${this.failingCount()} failing`);
    if (this.warningCount()) parts.push(`${this.warningCount()} warning`);
    if (!this.rationaleLocked()) parts.push('rationale not locked');
    return `NOT VALIDATED — ${parts.join(', ')}`;
  });

  // --- charts ---------------------------------------------------------------

  protected readonly navSeries = computed<CategorySeries[]>(() => {
    const oos = this.outOfSample();
    return [
      { name: 'In-sample', data: [...oos.navInSample] },
      { name: 'Out-of-sample', data: [...oos.navOutOfSample] },
    ];
  });

  protected readonly navDates = computed(() => this.outOfSample().navDates);

  protected readonly haircutCategories = computed(() =>
    this.haircut().curve.map((point) => String(point.trials)),
  );

  protected readonly haircutSeries = computed<CategorySeries[]>(() => [
    { name: 'Haircut Sharpe ratio', data: this.haircut().curve.map((p) => p.haircutSharpe) },
  ]);

  /**
   * Two series rather than one, so the bins that make up the PBO are named in
   * the legend instead of being distinguished by colour alone.
   */
  protected readonly logitSeries = computed<CategorySeries[]>(() => {
    const bins = this.pbo().bins;
    return [
      {
        name: 'Left of zero — counts toward PBO',
        data: bins.map((b) => (b.belowZero ? b.share : null)),
      },
      { name: 'Right of zero', data: bins.map((b) => (b.belowZero ? null : b.share)) },
    ];
  });

  protected readonly logitCategories = computed(() => this.pbo().bins.map((b) => b.label));

  // --- field handlers -------------------------------------------------------

  private numberFrom(event: Event): number | null {
    const raw = (event.target as HTMLInputElement).value;
    if (raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isNaN(value) ? null : value;
  }

  protected onAlpha(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null || value <= 0 || value >= 1) return;
    this.alpha.set(value);
    this.service.markRecalculating(['multiple-testing']);
  }

  protected onMethod(method: CorrectionMethod): void {
    this.service.correctionMethod.set(method);
  }

  protected onSplit(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null || value < 10 || value > 90) return;
    this.inSamplePercent.set(value);
  }

  protected onMinimumHsr(event: Event): void {
    // Empty clears the floor, and the badge goes back to saying it is not set —
    // never to guessing a default the user did not choose.
    this.minimumAcceptableHsr.set(this.numberFrom(event));
  }

  protected onDsrTrials(event: Event): void {
    this.service.setDsrTrials(this.numberFrom(event));
  }

  protected onVariance(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null || value < 0) return;
    this.varianceOfSharpes.set(value);
    this.service.markRecalculating(['deflated-sr']);
  }

  protected onSampleLength(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null || value < 2) return;
    this.sampleLength.set(Math.round(value));
    this.service.markRecalculating(['multiple-testing', 'haircut-sr', 'deflated-sr']);
  }

  protected onDsrThreshold(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null || value <= 0 || value >= 1) return;
    this.dsrThreshold.set(value);
  }

  protected onPartitions(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null) return;
    this.partitions.set(Math.round(value));
    this.service.markRecalculating(['pbo']);
  }

  protected onPboThreshold(event: Event): void {
    const value = this.numberFrom(event);
    if (value === null || value <= 0 || value >= 1) return;
    this.pboThreshold.set(value);
  }

  // --- actions --------------------------------------------------------------

  protected readonly canGenerateReport = computed(
    () => this.rationaleLocked() && !this.partitionsInvalid() && !this.momentsUnavailable(),
  );

  protected hasFailed(action: PageAction): boolean {
    return this.failures().includes(action);
  }

  private settle(action: PageAction, succeeded: boolean): void {
    this.failures.update((list) =>
      succeeded ? list.filter((a) => a !== action) : [...new Set([...list, action])],
    );
  }

  private run(action: PageAction): boolean {
    const firstTry = !this.attempted.has(action);
    this.attempted.add(action);
    this.settle(action, !firstTry);
    return !firstTry;
  }

  protected exportReport(format: 'pdf' | 'csv'): void {
    this.exportMenuOpen.set(false);
    if (!this.run('export')) {
      this.announcement.set('Export failed. A retry is available beside the export button.');
      return;
    }
    this.announcement.set(`Validation state exported as ${format.toUpperCase()}.`);
  }

  protected generateReport(): void {
    if (!this.canGenerateReport()) return;
    if (!this.run('report')) {
      this.announcement.set('Report generation failed. A retry is available beside the button.');
      return;
    }
    this.reportGenerated.set(true);
    this.announcement.set('Validation report generated.');
  }

  protected sendToApproval(): void {
    if (!this.reportGenerated()) return;
    if (!this.run('send')) {
      this.announcement.set('Send failed. A retry is available beside the button.');
      return;
    }
    this.announcement.set('Sent to the Human Approval Gate.');
  }

  protected retry(action: PageAction): void {
    if (action === 'export') this.exportReport('pdf');
    else if (action === 'report') this.generateReport();
    else this.sendToApproval();
  }

  // --- in-page navigation ---------------------------------------------------

  protected goToSection(id: SectionId, event?: Event): void {
    event?.preventDefault();
    const target = this.host.nativeElement.querySelector(`#${id}`);
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    // Focus follows the scroll, or a keyboard user is left where they were.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    this.activeSection.set(id);
  }

  protected onNavSelect(event: Event): void {
    this.goToSection((event.target as HTMLSelectElement).value as SectionId);
  }

  /** Scrollspy — reports which section is in view, without announcing it. */
  private attachScrollSpy(): void {
    this.observer?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) this.activeSection.set(visible.target.id as SectionId);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    for (const section of this.sections) {
      const el = this.host.nativeElement.querySelector(`#${section.id}`);
      if (el) observer.observe(el);
    }
    this.observer = observer;
  }
}
