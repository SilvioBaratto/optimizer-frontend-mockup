import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  DISPLAY_RANGE_LABEL,
  TURBULENCE_SERIES,
  TURBULENCE_SERIES_LABEL,
  type TurbulenceSeriesId,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefBand, RefLine, RefPoint } from '../../../../shared/charts';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { fixed, score } from '../turbulence-format';

/** One checkbox of the series group. */
interface SeriesToggle {
  readonly id: TurbulenceSeriesId;
  readonly label: string;
  readonly checked: boolean;
}

/**
 * Region 6 — `d_t` through time, with its decomposition and its own threshold.
 *
 * Three claims are drawn here, and each of them is a derivation rather than a
 * drawing decision:
 *
 * - **The threshold line is `χ²₀.₇₅(n)/n`.** It is a function of the number of
 *   assets in the current universe — 14.84 at the source's twelve series — so
 *   the line moves the moment the universe changes size. Nothing on this page
 *   stores it, and the label says which count produced it.
 * - **The shaded bands are cut from the series against that line**, so a band
 *   cannot outlive the threshold that produced it.
 * - **The value plotted is the normalised `d_t/n`**, which is the scale the
 *   decomposition is written in: `turbulence = magnitude surprise × correlation
 *   surprise` holds at every point of the three lines. The raw χ² figure is
 *   printed beside it rather than mixed into the same axis — the doc carries a
 *   blocking review precisely because a wireframe put a normalised value next
 *   to a raw-scale threshold.
 *
 * At least one series must stay selected: unchecking the last one is refused
 * and the panel says why, rather than leaving an empty chart with no
 * explanation of how to get back.
 */
@Component({
  selector: 'app-turbulence-chart',
  imports: [CoverageNote, LineChartComponent, PanelFallback],
  templateUrl: './turbulence-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TurbulenceChart {
  private readonly service = inject(TurbulenceService);

  protected readonly formatter = score;

  protected readonly ready = computed(() => this.service.panelStatus().turbulence === 'ready');
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly seriesNote = this.service.seriesNote;
  protected readonly reading = this.service.reading;
  protected readonly showOverlay = this.service.showThresholdAndBands;

  protected readonly dates = computed(() =>
    this.service.turbulenceSeries().map((point) => point.date),
  );

  protected readonly toggles = computed<readonly SeriesToggle[]>(() => {
    const visible = this.service.visibleSeries();
    return TURBULENCE_SERIES.map((id) => ({
      id,
      label: TURBULENCE_SERIES_LABEL[id],
      checked: visible.includes(id),
    }));
  });

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const points = this.service.turbulenceSeries();
    const visible = this.service.visibleSeries();
    const pick: Record<TurbulenceSeriesId, (index: number) => number> = {
      turbulence: (i) => points[i].turbulence,
      magnitude: (i) => points[i].magnitudeSurprise,
      correlation: (i) => points[i].correlationSurprise,
    };
    // TURBULENCE_SERIES order, not click order: the legend and the dash
    // patterns would otherwise reshuffle every time a box is ticked.
    return TURBULENCE_SERIES.filter((id) => visible.includes(id)).map((id) => ({
      name: TURBULENCE_SERIES_LABEL[id],
      data: points.map((_, index) => pick[id](index)),
    }));
  });

  protected readonly refLines = computed<readonly RefLine[]>(() => {
    if (!this.showOverlay()) return [];
    const reading = this.reading();
    return [
      {
        value: reading.thresholdNormalized,
        label: `chi2 threshold ${fixed(reading.thresholdNormalized, 2)} for ${reading.assetCount} assets`,
        dashed: true,
      },
    ];
  });

  /**
   * The shaded outlier runs, as indices into the window on screen.
   *
   * `markArea` on a category axis takes positions, and the periods are already
   * cut from the same sliced series the lines are drawn from, so the two cannot
   * fall out of step.
   */
  protected readonly refBands = computed<readonly RefBand[]>(() => {
    if (!this.showOverlay()) return [];
    const dates = this.dates();
    const index = new Map(dates.map((date, i) => [date, i]));
    return this.service.outlierPeriods().flatMap<RefBand>((period) => {
      const from = index.get(period.from);
      const to = index.get(period.to);
      if (from === undefined || to === undefined) return [];
      return [{ from, to, axis: 'x' }];
    });
  });

  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const points = this.service.turbulenceSeries();
    const last = points[points.length - 1];
    if (!last || !this.service.visibleSeries().includes('turbulence')) return [];
    return [{ x: last.date, y: last.turbulence, label: `${last.date}  d_t/n ${score(last.turbulence)}` }];
  });

  protected readonly bandCount = computed(() => this.service.outlierPeriods().length);

  protected readonly subtitle = computed(() => {
    const reading = this.reading();
    return (
      `${DISPLAY_RANGE_LABEL[this.service.displayRange()]} window · ` +
      `d_t/n ${score(reading.turbulence)} · d_t ${fixed(reading.turbulenceRaw, 2)} raw`
    );
  });

  /**
   * The textual equivalent of the drawing.
   *
   * A canvas is not readable by assistive tech, and this figure is the one the
   * page's headline claim rests on, so the summary carries the current reading
   * on both scales, the threshold that produced the verdict and the count of
   * shaded runs.
   */
  protected readonly ariaLabel = computed(() => {
    const reading = this.reading();
    const points = this.service.turbulenceSeries();
    const names = this.series()
      .map((s) => s.name)
      .join(', ');
    const bands = this.bandCount();

    return (
      `Turbulence and its decomposition over the ${DISPLAY_RANGE_LABEL[this.service.displayRange()]} ` +
      `window, ${points.length} weekly observations. Series shown: ${names || 'none'}. ` +
      `Current reading on ${reading.date}: turbulence ${score(reading.turbulence)} normalised, ` +
      `${fixed(reading.turbulenceRaw, 2)} raw, decomposed into magnitude surprise ` +
      `${score(reading.magnitudeSurprise)} times correlation surprise ${score(reading.correlationSurprise)}. ` +
      `The chi-squared threshold for ${reading.assetCount} assets is ` +
      `${fixed(reading.thresholdNormalized, 2)} normalised, ${fixed(reading.threshold, 2)} raw, and the ` +
      `reading is ${reading.outlier ? 'above' : 'inside'} it. ` +
      `${bands} outlier ${bands === 1 ? 'period is' : 'periods are'} shaded in this window.`
    );
  });

  /**
   * Ticks or unticks a series, and puts the box back when the toggle is refused.
   *
   * Unchecking the last series leaves `visibleSeries` untouched, so the binding
   * has nothing to re-render and the browser's own change would stand: a box
   * showing unchecked beside a line that is still drawn. Same repair the pair
   * selectors make.
   */
  protected onToggle(id: TurbulenceSeriesId, event: Event): void {
    this.service.toggleSeries(id);
    (event.target as HTMLInputElement).checked = this.service.visibleSeries().includes(id);
  }
}
