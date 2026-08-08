import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { BacktestValidationService } from '../../../../services/backtest-validation.service';

const PAGE_SIZES = [10, 20, 50];

/**
 * The log of every variant tried — the input the whole page rests on.
 *
 * The number of trials attempted is the single most important thing a backtest
 * can disclose and the thing most often left out (§7), so this panel is where
 * M is declared and where the honesty of that declaration is attested. M and
 * the implied independent-trial count N̄ feed the three discounts downstream,
 * which is why editing M here announces a recalculation rather than silently
 * changing their answers.
 */
@Component({
  selector: 'app-trial-log',
  imports: [StatusBadge],
  templateUrl: './trial-log.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialLog {
  private readonly service = inject(BacktestValidationService);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly summary = this.service.trialSummary;
  protected readonly trials = this.service.visibleTrials;
  protected readonly page = this.service.page;
  protected readonly pageSize = this.service.pageSize;
  protected readonly pageCount = this.service.pageCount;
  protected readonly selected = this.service.selectedSharpe;
  protected readonly confirmed = this.service.completenessConfirmed;

  /** Open state of the "log a trial" form. */
  protected readonly logging = signal(false);
  protected readonly draftVariant = signal('');
  protected readonly draftDate = signal('');
  protected readonly draftSharpe = signal('');
  protected readonly draftOutcome = signal<'selected' | 'discarded'>('discarded');
  protected readonly announcement = signal('');

  protected readonly draftValid = computed(
    () =>
      this.draftVariant().trim().length > 0 &&
      this.draftDate().length > 0 &&
      this.draftSharpe().trim().length > 0 &&
      !Number.isNaN(Number(this.draftSharpe())),
  );

  protected readonly rangeLabel = computed(() => {
    const from = (this.page() - 1) * this.pageSize() + 1;
    const to = Math.min(this.page() * this.pageSize(), this.summary().totalTrials);
    return `${from}–${to} of ${this.summary().totalTrials}`;
  });

  protected onTotalTrials(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value) || value < 1) return;
    this.service.setTotalTrials(value);
    this.announcement.set(
      `Trial count set to ${value}. Multiple testing, haircut and deflated Sharpe are recalculating.`,
    );
  }

  protected onCorrelation(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value) || value <= -1 || value > 1) return;
    this.service.averageCorrelation.set(value);
    this.service.markRecalculating(['multiple-testing', 'haircut-sr', 'deflated-sr']);
  }

  protected onConfirmed(event: Event): void {
    this.confirmed.set((event.target as HTMLInputElement).checked);
  }

  protected onPageSize(event: Event): void {
    this.pageSize.set(Number((event.target as HTMLSelectElement).value));
    this.page.set(1);
  }

  protected go(delta: number): void {
    this.page.set(Math.min(this.pageCount(), Math.max(1, this.page() + delta)));
  }

  /**
   * Records the trial by raising M.
   *
   * A newly logged trial is one more attempt in the denominator, so it makes
   * every discount downstream harsher rather than softer — which is the point.
   */
  protected submitTrial(): void {
    if (!this.draftValid()) return;
    this.service.setTotalTrials(this.summary().totalTrials + 1);
    this.announcement.set(
      `Trial logged. M is now ${this.summary().totalTrials}; the discounts downstream are recalculating.`,
    );
    this.logging.set(false);
    this.draftVariant.set('');
    this.draftDate.set('');
    this.draftSharpe.set('');
  }

  protected onDraft(signalRef: { set(value: string): void }, event: Event): void {
    signalRef.set((event.target as HTMLInputElement).value);
  }
}
