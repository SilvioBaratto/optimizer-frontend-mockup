import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  PC1_HORIZON_NOTE,
  PC1_SATURATION_MONTHS,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { HistogramChartComponent, LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, HistogramBin, RefPoint } from '../../../../shared/charts';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { points, sharePercent, wholeNumber } from '../turbulence-format';

/** Lookback windows the panel offers, in months. Spans the saturation point. */
const LOOKBACKS: readonly number[] = [3, 6, 12, 18, 20, 24, 30, 36];

/** Horizons, in months. `m` is normally shorter than the lookback `n`. */
const HORIZONS: readonly number[] = [1, 2, 3, 6, 12];

/**
 * Region 11 — the growth of the first principal component.
 *
 * `ΔPC1(t) = PC1(t) − PC1(t−m)` over a rolling window of `n` months. The two
 * controls are the source's own parameters and both change the reading, which
 * is why they are here rather than in the page toolbar: the window decides the
 * *timing* of the signal, and past about twenty months a longer window swamps
 * the shock, the peak slides forward and the reading stops responding. The
 * panel says so when the reader crosses that point instead of quietly showing a
 * flat line — the warning is raised by the service, from a rolling window that
 * really is capped, so the sentence and the drawing cannot disagree.
 *
 * Two figures, because the distribution is the second half of the argument: the
 * distribution of past ΔPC1 is asymmetric and it is the right tail that carries
 * the systemic-risk reading, so where today falls in it says more than the
 * level does. The current bin is highlighted *and* named in the annotation, so
 * the emphasis is never carried by shading alone.
 */
@Component({
  selector: 'app-turbulence-pc1-growth',
  imports: [
    HistogramChartComponent,
    LineChartComponent,
    PanelFallback,
    SelectDirective,
  ],
  templateUrl: './pc1-growth.html',
  host: { class: 'flex flex-col gap-4' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pc1Growth {
  private readonly service = inject(TurbulenceService);

  protected readonly lookbacks = LOOKBACKS;
  protected readonly horizons = HORIZONS;
  protected readonly horizonNote = PC1_HORIZON_NOTE;
  protected readonly saturationMonths = PC1_SATURATION_MONTHS;

  protected readonly shareFormatter = sharePercent;
  protected readonly countFormatter = wholeNumber;

  protected readonly ready = computed(() => this.service.panelStatus()['pc1-growth'] === 'ready');
  protected readonly lookback = this.service.pc1Lookback;
  protected readonly horizon = this.service.pc1Horizon;
  protected readonly saturationWarning = this.service.pc1SaturationWarning;
  protected readonly pc1 = this.service.pc1;

  // --- the share through time ------------------------------------------------

  protected readonly months = computed(() => this.service.pc1Series().map((point) => point.month));

  protected readonly series = computed<readonly CategorySeries[]>(() => [
    { name: 'PC1 variance share', data: this.service.pc1Series().map((point) => point.share) },
  ]);

  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const series = this.service.pc1Series();
    const reading = this.pc1();
    const marks: RefPoint[] = [];

    const peak = series.find((point) => point.month === reading.peakMonth);
    if (peak) {
      marks.push({ x: peak.month, y: peak.share, label: `peak ${peak.month}` });
    }

    const last = series[series.length - 1];
    if (last && last.month !== reading.peakMonth) {
      marks.push({ x: last.month, y: last.share, label: sharePercent(last.share) });
    }
    return marks;
  });

  protected readonly subtitle = computed(() => {
    const reading = this.pc1();
    return (
      `PC1 share ${sharePercent(reading.share)} now, ${points(reading.changeOverLookback)} over ` +
      `${reading.lookbackMonths}mo · peak dPC1 ${reading.peakMonth}`
    );
  });

  protected readonly ariaLabel = computed(() => {
    const reading = this.pc1();
    const series = this.service.pc1Series();
    const first = series[0];
    if (!first) return 'PC1 variance share: no monthly observations.';

    return (
      `Share of variance explained by the first principal component, monthly, on a rolling ` +
      `${reading.lookbackMonths}-month window. It runs from ${sharePercent(first.share)} in ` +
      `${first.month} to ${sharePercent(reading.share)} now, ` +
      `${points(reading.changeOverLookback)} over the lookback. The largest one-step increase in ` +
      `the sample, marked on the line, is ${reading.peakMonth} at ` +
      `${points(reading.peakDelta, 1)}. ` +
      (reading.saturated
        ? `Past a lookback of about ${PC1_SATURATION_MONTHS} months the signal saturates and this line stops moving.`
        : `The horizon m is ${reading.horizonMonths} month${reading.horizonMonths === 1 ? '' : 's'}.`)
    );
  });

  // --- the distribution of ΔPC1 ---------------------------------------------

  protected readonly bins = computed<readonly HistogramBin[]>(() =>
    this.service.pc1Distribution().map((bin) => ({
      // The marker is on the label, not only in the shading: the highlighted
      // bin has to be findable in the tabular alternative too.
      label: bin.current ? `${bin.label} ◀ current` : bin.label,
      value: bin.count,
      highlight: bin.current,
    })),
  );

  protected readonly currentBinLabel = computed(
    () => this.service.pc1Distribution().find((bin) => bin.current)?.label ?? '—',
  );

  protected readonly distributionAnnotation = computed(() => {
    const reading = this.pc1();
    return (
      `The current dPC1 of ${points(reading.delta, 1)} falls in decile ${reading.decile} of 10 ` +
      `of the historical distribution, in the bin ${this.currentBinLabel()}. The right tail is the ` +
      `one associated with the largest increases in systemic risk.`
    );
  });

  protected readonly distributionAriaLabel = computed(() => {
    const reading = this.pc1();
    const bins = this.service.pc1Distribution();
    return (
      `Distribution of past dPC1 over ${bins.length} bins at a horizon of ` +
      `${reading.horizonMonths} month${reading.horizonMonths === 1 ? '' : 's'}. ` +
      `${this.distributionAnnotation()}`
    );
  });

  // --- controls --------------------------------------------------------------

  protected onLookback(event: Event): void {
    this.service.setPc1Lookback(Number((event.target as HTMLSelectElement).value));
  }

  protected onHorizon(event: Event): void {
    this.service.setPc1Horizon(Number((event.target as HTMLSelectElement).value));
  }
}
