import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DISPLAY_RANGE_LABEL } from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint } from '../../../../shared/charts';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { oneDecimal } from '../turbulence-format';

/**
 * Region 10 — how many directions the universe is actually using.
 *
 * `erank = exp(H(p))` with `p_k = λ_k / Σλ`, which satisfies
 * `1 ≤ erank ≤ rank ≤ N`: one when a single eigenvalue carries everything, and
 * `N` only when the spectrum is flat. The point of the figure is the gap
 * between it and the raw rank, so the raw rank is on the chart rather than
 * merely mentioned.
 *
 * It is drawn as a second, constant series rather than as a reference line, and
 * that is deliberate: a mark line does not extend the value axis, so at an
 * effective rank of eight a raw rank of twenty-four would sit off the top of
 * the drawing — the one comparison this panel exists to make would be invisible.
 * As a series it forces the axis, carries its own dash pattern, names itself in
 * the legend and appears in the panel's tabular alternative.
 */
@Component({
  selector: 'app-turbulence-effective-rank-chart',
  imports: [CoverageNote, LineChartComponent, PanelFallback],
  templateUrl: './effective-rank-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EffectiveRankChart {
  private readonly service = inject(TurbulenceService);

  protected readonly formatter = oneDecimal;

  protected readonly ready = computed(() => this.service.panelStatus()['effective-rank'] === 'ready');
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly reading = this.service.effectiveRank;

  protected readonly dates = computed(() =>
    this.service.effectiveRankSeries().map((point) => point.date),
  );

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const points = this.service.effectiveRankSeries();
    const rawRank = this.reading().rawRank;
    return [
      { name: 'Effective rank', data: points.map((point) => point.effectiveRank) },
      { name: `Raw rank — ${rawRank} assets`, data: points.map(() => rawRank) },
    ];
  });

  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const points = this.service.effectiveRankSeries();
    const last = points[points.length - 1];
    if (!last) return [];
    return [{ x: last.date, y: last.effectiveRank, label: oneDecimal(last.effectiveRank) }];
  });

  /** `reading.note` already names the raw rank, so the line states it once. */
  protected readonly subtitle = computed(() => {
    const reading = this.reading();
    return `Effective rank ${oneDecimal(reading.effectiveRank)} — ${reading.note}`;
  });

  protected readonly ariaLabel = computed(() => {
    const reading = this.reading();
    const points = this.service.effectiveRankSeries();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return 'Effective rank: no observations in the selected window.';

    const direction =
      last.effectiveRank < first.effectiveRank
        ? 'falls'
        : last.effectiveRank > first.effectiveRank
          ? 'rises'
          : 'is flat';

    return (
      `Effective rank over the ${DISPLAY_RANGE_LABEL[this.service.displayRange()]} window, ` +
      `${points.length} weekly observations, against a flat reference line at the raw rank of ` +
      `${reading.rawRank}. It ${direction} from ${oneDecimal(first.effectiveRank)} to ` +
      `${oneDecimal(last.effectiveRank)} — ${reading.note}. A falling effective rank means the ` +
      `universe is using fewer independent directions than it has assets.`
    );
  });
}
