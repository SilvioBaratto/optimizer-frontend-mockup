import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  VALUE_PREMIUM_MODEL_NOTE,
  VALUE_VOLATILITY_STATE_LABEL,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BarChartComponent, seriesColor } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { signedPercent1 } from '../regimes-format';

const CHART_HEIGHT = 200;

/**
 * Region 9 — the value premium by volatility state.
 *
 * A **second, separate** Markov chain, on book-to-market portfolios, with two
 * states of its own: a high-volatility state associated with recessions and a
 * low-volatility state associated with expansions. It is not the toolbar's
 * regime model — changing that selector does nothing here — and no row of this
 * panel lines up with a row of the Size Premium panel above it. That is the
 * point of keeping them as two panels with two headings rather than one table
 * with a shared axis: the four VAR regimes and these two states are estimated
 * on different models and there is no correspondence between them to draw.
 *
 * The finding itself is that the premium is counter-cyclical: about 12.4% a
 * year in the high-volatility state against about 0.6% in the low-volatility
 * one, which is compensation for the downside risk value firms carry in bad
 * times rather than a free spread.
 */
@Component({
  selector: 'app-market-regimes-value-premium',
  imports: [BarChartComponent],
  templateUrl: './value-premium.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValuePremium {
  private readonly service = inject(MarketRegimesService);

  protected readonly height = CHART_HEIGHT;
  protected readonly modelNote = VALUE_PREMIUM_MODEL_NOTE;
  protected readonly formatter = signedPercent1;

  protected readonly rows = this.service.valuePremium;

  /** The state names are this model's own, and are spelled out in full. */
  protected readonly categories = computed(() =>
    this.rows().map((row) => VALUE_VOLATILITY_STATE_LABEL[row.state]),
  );

  /**
   * A palette slot, and specifically not slot 0.
   *
   * Every bar in a panel takes one colour here, so the colour names the
   * *series*, not a state — the state names are on the category axis. What it
   * must not do is match the panel above: Size Premium draws in `seriesColor(0)`
   * and these two blocks are the pair the doc insists must never read as one
   * table. `seriesColor(4)` is not an escape from that — `--color-accent` is a
   * declared alias of `--color-primary`, so slot 4 renders the same terracotta
   * as slot 0.
   */
  protected readonly series = computed<readonly CategorySeries[]>(() => [
    {
      name: 'Value − Growth, annualised',
      data: this.rows().map((row) => row.premiumPercent),
      color: seriesColor(1),
    },
  ]);

  protected readonly ariaLabel = computed(() => {
    const readings = this.rows()
      .map((row) => `${VALUE_VOLATILITY_STATE_LABEL[row.state]} ${signedPercent1(row.premiumPercent)} a year`)
      .join(', ');
    return (
      'Value minus growth, annualised, by state of a separate two-state Markov model on ' +
      `book-to-market portfolios: ${readings}. These two states are not the regime model's states.`
    );
  });
}
