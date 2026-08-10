import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  MARKET_REGIME_MODEL_LABEL,
  SIZE_PREMIUM_NOT_SPECIFIED,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BarChartComponent, chartTokens, seriesColor } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { signedBasisPoints } from '../regimes-format';

const CHART_HEIGHT = 240;

/**
 * The extent of the hatched "no estimate" bar, and the top of the value axis.
 *
 * It is **not** a value. `barLabel` prints it as a dash and the hatch says the
 * rest: a bar with a fill would be a claim about a magnitude the substance does
 * not specify. Deliberately not equal to any measured premium (+100, −61, +71),
 * so nothing real can collide with the sentinel.
 */
const NOT_SPECIFIED_EXTENT = 120;

/**
 * Region 8 — the size premium by regime.
 *
 * The taxonomy here is the **four-state VAR**, always, whatever the toolbar's
 * Regime model says. The estimate exists over those four states and over no
 * others: switching the toolbar to the two-state Hamilton model recomposes the
 * hero card, the probability path and the statistics table, and leaves this
 * panel exactly as it is. The subtitle says so, because a reader who has just
 * watched three regions drop to two states will otherwise read four bars here
 * as a bug.
 *
 * Recovery is the reason this panel needs care. The substance fixes the premium
 * in the crash (+100 bp a month), the slow-growth state (−61 bp) and the bull
 * state (+71 bp), and says nothing about the fourth. Nothing is estimated in
 * its place: the measured series carries a `null` there — a gap, not a zero —
 * and a second, hatched series marks the absence across the full width of the
 * track. Hatching means "not measured". A zero-length bar would mean "measured,
 * and it is zero", which is a claim nobody made, and the two have to be
 * distinguishable without colour.
 *
 * The max-minus-min spread is taken over the regimes that have an estimate at
 * all, so the absent one neither widens it nor narrows it.
 */
@Component({
  selector: 'app-market-regimes-size-premium',
  imports: [BarChartComponent],
  templateUrl: './size-premium.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SizePremium {
  private readonly service = inject(MarketRegimesService);

  protected readonly height = CHART_HEIGHT;
  protected readonly axisMax = NOT_SPECIFIED_EXTENT;
  protected readonly notSpecified = SIZE_PREMIUM_NOT_SPECIFIED;

  protected readonly rows = this.service.sizePremium;

  protected readonly categories = computed(() => this.rows().map((row) => row.state));

  /**
   * Two series: the measured premium, and the marker for the regime that has
   * none. They never overlap — every category carries a value in exactly one
   * of them — so the chart reads as one bar per regime with one of them
   * hatched.
   */
  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const rows = this.rows();
    return [
      {
        name: 'Small − Large, bp/month',
        data: rows.map((row) => row.premiumBp),
        color: seriesColor(0),
      },
      {
        name: 'Not specified',
        // The hatch is drawn in the neutral token, so the legend swatch has to
        // be that token too. Left to the palette it took `seriesColor(1)` — a
        // solid green that appears nowhere on the plot, and the very colour the
        // hero card and the probability path give the *Slow Growth* state. A
        // legend entry for a colour that is on no bar, in a state's colour, on
        // the one panel whose fourth row is deliberately not a reading.
        color: chartTokens().neutral,
        data: rows.map((row) => (row.premiumBp === null ? NOT_SPECIFIED_EXTENT : null)),
        pattern: true,
      },
    ];
  });

  /**
   * `+100 bp`, `−61 bp` — and a dash for the sentinel.
   *
   * The hatched bar's extent is a drawing device, so it must never be readable
   * as a number, on the chart or in the panel's tabular alternative.
   */
  protected readonly barLabel: ValueFormatter = (value) =>
    value === NOT_SPECIFIED_EXTENT ? '—' : signedBasisPoints(value);

  protected readonly unmeasured = computed(() => this.rows().filter((row) => row.premiumBp === null));

  protected readonly spreadLabel = computed(
    () => `${Math.round(this.service.sizePremiumSpreadBp())} bp`,
  );

  protected readonly modelNote = computed(
    () =>
      `Always the four states of the ${MARKET_REGIME_MODEL_LABEL['four-state']} model — the toolbar's ` +
      `Regime model does not change this panel.`,
  );

  protected readonly ariaLabel = computed(() => {
    const measured = this.rows()
      .filter((row) => row.premiumBp !== null)
      .map((row) => `${row.state} ${signedBasisPoints(row.premiumBp as number)}`)
      .join(', ');
    const absent = this.unmeasured()
      .map((row) => `${row.state} is ${SIZE_PREMIUM_NOT_SPECIFIED} and is drawn as a hatched bar, not as a zero`)
      .join('; ');
    return (
      `Small minus Large, in basis points per month, by state of the four-state multi-asset VAR: ` +
      `${measured}. ${absent}. The spread between the highest and the lowest measured regime is ` +
      `${this.spreadLabel()}.`
    );
  });
}
