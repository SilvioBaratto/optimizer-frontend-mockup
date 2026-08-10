import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  AR_SPIKE_SIGMA,
  AR_VS_CORRELATION_NOTE,
  DISPLAY_RANGE_LABEL,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint } from '../../../../shared/charts';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { score, sigma } from '../turbulence-format';

/**
 * Region 9 — the absorption ratio, and the standardised shift that precedes a
 * drawdown.
 *
 * The panel prints two quantities the doc is careful to keep apart: the
 * absorption ratio, which weights each asset by how much of the variance it
 * carries, and the average pairwise correlation, which does not. They move
 * apart — the source's own example has the mean correlation falling from 0.36
 * to 0.32 while AR climbs from 0.55 to 0.80 — and the one that speaks to
 * fragility is the ratio. Both are on screen so the reader can see the gap.
 *
 * The marks are ΔAR spikes at or above one σ, measured as the 15-day mean
 * against the one-year mean over the one-year σ. Every one of the worst monthly
 * drawdowns in the source was preceded by such a spike, which is why they are
 * marked as events rather than left to be read off the slope of the line.
 *
 * The 500-day window is the one place on the page where coverage can be
 * complete while the correlation panels report partial cover, so the coverage
 * note here reads the absorption window's own count.
 */
@Component({
  selector: 'app-turbulence-absorption-chart',
  imports: [CoverageNote, LineChartComponent, PanelFallback],
  templateUrl: './absorption-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbsorptionChart {
  private readonly service = inject(TurbulenceService);

  protected readonly formatter = score;
  protected readonly spikeSigma = AR_SPIKE_SIGMA;
  protected readonly comparisonNote = AR_VS_CORRELATION_NOTE;

  protected readonly ready = computed(() => this.service.panelStatus().absorption === 'ready');
  protected readonly coverage = this.service.absorptionCoverage;
  protected readonly absorption = this.service.absorption;

  protected readonly dates = computed(() =>
    this.service.absorptionSeries().map((point) => point.date),
  );

  protected readonly series = computed<readonly CategorySeries[]>(() => [
    {
      name: 'Absorption ratio',
      data: this.service.absorptionSeries().map((point) => point.absorptionRatio),
    },
  ]);

  /**
   * The spikes inside the window on screen, plus the current reading.
   *
   * Only the last mark is labelled: a label on every spike would stack text
   * over a year of weekly observations, and the footnote already says what the
   * dots mean.
   */
  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const points = this.service.absorptionSeries();
    const last = points[points.length - 1];
    const marks: RefPoint[] = points
      .filter((point) => point.spike && point !== last)
      .map((point) => ({ x: point.date, y: point.absorptionRatio, label: '' }));

    if (last) {
      marks.push({
        x: last.date,
        y: last.absorptionRatio,
        label: `AR ${score(last.absorptionRatio)}`,
      });
    }
    return marks;
  });

  protected readonly spikeCount = computed(
    () => this.service.absorptionSeries().filter((point) => point.spike).length,
  );

  protected readonly subtitle = computed(() => {
    const reading = this.absorption();
    return (
      `AR ${score(reading.absorptionRatio)} · average pairwise correlation ` +
      `${score(reading.averageCorrelation)} · dAR 15d vs 1y ${sigma(reading.deltaSigma)}`
    );
  });

  protected readonly ariaLabel = computed(() => {
    const reading = this.absorption();
    const points = this.service.absorptionSeries();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return 'Absorption ratio: no observations in the selected window.';

    const direction =
      last.absorptionRatio > first.absorptionRatio
        ? 'rises'
        : last.absorptionRatio < first.absorptionRatio
          ? 'falls'
          : 'is flat';

    // Read off the two figures rather than asserted: the ratio is not
    // guaranteed to sit above the mean correlation for every universe, and a
    // summary that says "lower" without looking is the same class of mistake
    // as a badge that contradicts its own number.
    const comparison =
      reading.averageCorrelation < reading.absorptionRatio
        ? 'lower'
        : reading.averageCorrelation > reading.absorptionRatio
          ? 'higher'
          : 'the same today';

    return (
      `Absorption ratio over the ${DISPLAY_RANGE_LABEL[this.service.displayRange()]} window, ` +
      `${points.length} weekly observations. It ${direction} from ${score(first.absorptionRatio)} ` +
      `to ${score(last.absorptionRatio)}, the share of variance absorbed by the leading ` +
      `${reading.eigenvectors} eigenvectors. The average pairwise correlation is ` +
      `${score(reading.averageCorrelation)}, which is a different measurement and ${comparison}. ` +
      `The standardised 15-day against 1-year shift is ${sigma(reading.deltaSigma)}, ` +
      `${reading.spike ? 'at or above' : 'below'} the one-sigma spike threshold; over twelve ` +
      `months it is ${sigma(reading.deltaSigma12m)}. ` +
      `${this.spikeCount()} spikes are marked in this window.`
    );
  });
}
