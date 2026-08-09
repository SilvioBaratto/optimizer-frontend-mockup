import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MathVar } from '../../../../shared/math/math-var';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

import {
  CONTRIBUTION_SORT_LABEL,
  type ContributionSort,
  type RiskContribution,
} from '../../../../models/frontier.model';

/** Rows shown before "View full table" is used. */
const COLLAPSED_ROWS = 4;

/**
 * The volatility decomposition of the selected portfolio, one row per asset:
 * SD(R_P) = Σ x_i · SD(R_i) · Corr(R_i, R_P)  (`docs/08`, Fondamenti §6).
 *
 * The TOTAL row is the check that the decomposition closes — it sums the
 * contribution column and must land on the portfolio's own SD. Both figures
 * come from the API; the sum here only re-adds what was sent, so a mismatch is
 * visible rather than papered over.
 *
 * Collapsed, the table is capped at the seven columns the spec allows; the
 * proportional contribution bar appears with the full table.
 */
@Component({
  selector: 'app-risk-contribution-table',
  imports: [ButtonDirective, MathVar, SelectDirective],
  templateUrl: './risk-contribution-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskContributionTable {
  readonly rows = input.required<readonly RiskContribution[]>();
  /** SD_P, for the TOTAL row and the bar scale. */
  readonly portfolioSd = input.required<number>();
  /** Ticker highlighted on the chart, kept in step with this table. */
  readonly highlighted = input<string | null>(null);

  /** Emitted as rows take focus or are clicked; null clears the highlight. */
  readonly highlightedChange = output<string | null>();

  protected readonly sortOptions = Object.entries(CONTRIBUTION_SORT_LABEL) as [
    ContributionSort,
    string,
  ][];

  protected readonly query = signal('');
  protected readonly sort = signal<ContributionSort>('weight');
  protected readonly expanded = signal(false);

  private readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.rows();
    if (!q) return rows;
    return rows.filter(
      (r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  });

  private readonly sorted = computed(() => {
    const rows = [...this.filtered()];
    switch (this.sort()) {
      case 'ticker':
        return rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
      case 'contribution':
        return rows.sort((a, b) => b.contribution - a.contribution);
      case 'share':
        return rows.sort((a, b) => b.shareOfSd - a.shareOfSd);
      default:
        return rows.sort((a, b) => b.weight - a.weight);
    }
  });

  protected readonly visibleRows = computed(() =>
    this.expanded() ? this.sorted() : this.sorted().slice(0, COLLAPSED_ROWS),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.sorted().length - COLLAPSED_ROWS),
  );

  protected readonly noMatches = computed(() => this.sorted().length === 0);

  /**
   * The sum of the contribution column as displayed. Compared against the
   * portfolio's own SD rather than assumed equal to it.
   */
  protected readonly contributionTotal = computed(() =>
    this.rows().reduce((sum, r) => sum + r.contribution, 0),
  );

  protected readonly weightTotal = computed(() =>
    this.rows().reduce((sum, r) => sum + r.weight, 0),
  );

  /** Widest absolute contribution, so the bars share one scale. */
  private readonly barScale = computed(() =>
    Math.max(0.001, ...this.rows().map((r) => Math.abs(r.contribution))),
  );

  protected barWidth(contribution: number): number {
    return (Math.abs(contribution) / this.barScale()) * 100;
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as ContributionSort);
  }

  protected highlight(ticker: string): void {
    this.highlightedChange.emit(ticker);
  }

  protected clearHighlight(): void {
    this.highlightedChange.emit(null);
  }
}
