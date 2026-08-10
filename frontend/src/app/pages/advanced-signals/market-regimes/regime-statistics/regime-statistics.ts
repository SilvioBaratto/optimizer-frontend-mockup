import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CORRELATION_NOTE_DETAIL,
  type CorrelationCell,
  type CorrelationNote,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { correlationCellLabel, monthsLabel, percent0, percent1 } from '../regimes-format';

/**
 * Region 4 — the regime statistics table.
 *
 * Two kinds of column sit side by side and the difference between them is what
 * this region is for.
 *
 * The stationary probability, the average duration, the conditional mean and
 * the conditional volatility are computed on the selected universe: change the
 * universe and they move, because they are readings of that universe's returns
 * conditional on the state.
 *
 * The two correlation columns are not. They print only what the domain
 * substance actually fixes — ρ(Large, Small) = 0.82 in the crash and 0.50 in
 * the recovery, ρ(Equity, Bond) = −0.40 in the crash and positive elsewhere —
 * and where it fixes nothing they print a reason rather than a number. Three
 * different reasons, spelled three different ways, because they are three
 * different claims:
 *
 * - `—` the substance does not fix that pair for that regime;
 * - `n/d` the selected universe has no such pair to correlate at all;
 * - `+ positive` the sign is fixed and the magnitude is not.
 *
 * None of them is ever a zero. A zero correlation is a claim, and no claim was
 * made.
 */
@Component({
  selector: 'app-market-regimes-statistics',
  imports: [],
  templateUrl: './regime-statistics.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimeStatistics {
  private readonly service = inject(MarketRegimesService);

  protected readonly cell = correlationCellLabel;
  protected readonly probability = percent0;
  protected readonly moment = percent1;
  protected readonly duration = monthsLabel;

  protected readonly rows = this.service.regimeStatistics;
  protected readonly universe = this.service.universe;
  protected readonly emptyDetail = this.service.emptyDetail;

  protected readonly heading = computed(
    () => `Regime statistics · ${this.universe().label}`,
  );

  /**
   * The legend under the table, built from the notes actually in it.
   *
   * Listing all four reasons unconditionally would explain `n/d` on a universe
   * that has every series, which invites the reader to look for a cell that is
   * not there.
   */
  protected readonly noteLegend = computed<readonly { label: string; detail: string }[]>(() => {
    const seen = new Set<CorrelationNote>();
    for (const row of this.rows()) {
      for (const cell of [row.largeSmall, row.equityBond]) {
        if (cell.note !== null) seen.add(cell.note);
      }
    }
    return [...seen].map((note) => ({
      label: this.cell({ value: null, note } as CorrelationCell),
      detail: CORRELATION_NOTE_DETAIL[note],
    }));
  });
}
