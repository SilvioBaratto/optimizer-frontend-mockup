import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { FLAG_LABEL, type AllocationRow } from '../../../../models/allocation-agent.model';
import { AllocationAgentService } from '../../../../services/allocation-agent.service';

/** Rows shown before "View full table" is used. */
const COLLAPSED_ROWS = 5;

/**
 * The proposed allocation: weight and total risk contribution per asset.
 *
 * The two columns are not two views of one number. Capital and risk part
 * company as soon as volatilities differ — a 60/40 book puts 40% of its capital
 * in bonds and under 10% of its risk there — and risk budgeting is the practice
 * of allocating the second rather than the first (Fondamenti §5, §6). Euler's
 * theorem is what makes the second column add up at all: σ is homogeneous of
 * degree one, so σ(x) = Σ σ_i(x) exactly.
 *
 * Collapsed, the table shows the largest positions plus every flagged row —
 * a constraint that bound and an asset that was dropped are the two things a
 * reader must not have to expand the table to discover.
 */
@Component({
  selector: 'app-proposed-allocation',
  imports: [StatusBadge],
  templateUrl: './proposed-allocation.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProposedAllocation {
  private readonly service = inject(AllocationAgentService);

  /**
   * The last run failed, so these numbers are the previous run's.
   *
   * They stay on screen because a blank table would lose the only valid
   * proposal the page has; the marking is what keeps them from being read as
   * the result of the run that just failed.
   */
  readonly superseded = input(false);

  protected readonly flagLabel = FLAG_LABEL;
  protected readonly rows = this.service.rows;
  protected readonly summary = this.service.summary;
  protected readonly weightTotal = this.service.weightTotal;
  protected readonly riskTotal = this.service.riskTotal;

  protected readonly expanded = signal(false);
  protected readonly openRow = signal<string | null>(null);

  private readonly sorted = computed(() =>
    [...this.rows()].sort((a, b) => (b.weight ?? -1) - (a.weight ?? -1)),
  );

  /**
   * Largest positions, plus every row a reader must not have to expand the
   * table to find: a bound constraint, a dropped asset, and any short — a large
   * negative position sorts to the bottom by weight and is the last thing that
   * should be hidden behind a disclosure.
   */
  protected readonly visibleRows = computed<readonly AllocationRow[]>(() => {
    const sorted = this.sorted();
    if (this.expanded()) return sorted;

    const head = sorted.slice(0, COLLAPSED_ROWS);
    const notable = sorted
      .slice(COLLAPSED_ROWS)
      .filter((r) => r.flag !== 'none' || (r.weight ?? 0) < 0);
    return [...head, ...notable];
  });

  protected readonly hiddenCount = computed(
    () => this.sorted().length - this.visibleRows().length,
  );

  /**
   * One decimal, and never a signed zero: a contribution of −0.004% is zero to
   * the reader, and printing "-0.0%" only invites the question of what the
   * minus sign means.
   */
  protected pct(value: number | null): string {
    if (value === null) return '—';
    const rounded = Math.abs(value) < 0.05 ? 0 : value;
    return `${rounded.toFixed(1)}%`;
  }

  protected toggleRow(ticker: string): void {
    this.openRow.update((open) => (open === ticker ? null : ticker));
  }
}
