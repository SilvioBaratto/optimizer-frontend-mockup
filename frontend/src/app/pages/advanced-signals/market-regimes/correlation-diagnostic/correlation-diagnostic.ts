import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EXCEEDANCE_MODEL_LABEL,
  EXCEEDANCE_MODEL_SYMBOL,
  THETA_MAX,
  THETA_MIN,
  THETA_STEP,
  type ExceedanceModelId,
  type SeriesPairId,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { ScatterChartComponent } from '../../../../shared/charts';
import type { RefLine, XySeries } from '../../../../shared/charts';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { correlationLabel, thetaLabel } from '../regimes-format';

const CHART_HEIGHT = 320;

/** A Page-key jump, in slider steps. */
const PAGE_STEPS = 4;

/** One model's reading at the θ the slider is on. */
interface ThetaReading {
  readonly model: ExceedanceModelId;
  readonly label: string;
  readonly correlation: string;
  readonly verdict: string | null;
}

/**
 * Region 5 — the exceedance-correlation diagnostic.
 *
 * The exceedance correlation at a level θ is the correlation computed inside
 * the subset of months where *both* series exceeded `(1 + θ)` times their mean
 * — the upper tail for θ > 0, the lower tail for θ < 0. Drawn against θ it is
 * the standard test of whether a model gets the tails right, and the finding it
 * exists to show is that the empirical curve is **asymmetric** while a normal
 * distribution's is not.
 *
 * Four series, one empirical and three candidates, distinguished by symbol
 * shape rather than by colour alone. Whether a candidate reproduces the
 * empirical asymmetry is derived — each series carries the mean of
 * `ρ(−θ) − ρ(+θ)` over the positive half of the grid, and a candidate passes
 * when its gap sits within tolerance of the empirical one. Nothing here asserts
 * that the normal fails; the comparison does, and the region only prints the
 * outcome.
 *
 * The asymmetry's *direction* is a property of the pair and not a law: two
 * equity sleeves move together hardest on the way down, but equity against long
 * bonds does the opposite, because the crash regime is exactly where that
 * correlation turns negative. So the pattern is never restated in words beside
 * the figure — it is read off the curve — and the one place it is put into
 * words is the chart's accessible label, which stands in for the drawing for a
 * reader who cannot see it.
 */
@Component({
  selector: 'app-market-regimes-correlation-diagnostic',
  imports: [ScatterChartComponent, SelectDirective],
  templateUrl: './correlation-diagnostic.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CorrelationDiagnostic {
  private readonly service = inject(MarketRegimesService);

  protected readonly height = CHART_HEIGHT;
  protected readonly min = THETA_MIN;
  protected readonly max = THETA_MAX;
  protected readonly step = THETA_STEP;
  protected readonly formatter = correlationLabel;

  protected readonly pairs = this.service.availablePairs;
  protected readonly pair = this.service.pair;
  protected readonly theta = this.service.theta;

  protected readonly thetaText = computed(() => thetaLabel(this.theta()));

  protected readonly title = computed(() => {
    const pair = this.pair();
    return pair === null
      ? 'Exceedance correlation'
      : `Exceedance correlation — ${pair.label}`;
  });

  protected readonly hasSeries = computed(() => this.service.exceedanceSeries().length > 0);

  protected readonly series = computed<readonly XySeries[]>(() =>
    this.service.exceedanceSeries().map((series) => ({
      name: EXCEEDANCE_MODEL_LABEL[series.model],
      points: series.points.map((point) => [point.theta, point.correlation] as const),
      symbol: EXCEEDANCE_MODEL_SYMBOL[series.model],
      // A line through the points, so the *shape* of each curve either side of
      // zero is what the eye compares — which is the whole diagnostic. The
      // empirical one stays solid; the candidates are dashed, so the benchmark
      // is distinguishable from the things being judged against it without
      // relying on colour.
      line: true,
      dashed: !series.isReference,
    })),
  );

  /** Where the slider is, drawn on the figure rather than only under it. */
  protected readonly refLines = computed<readonly RefLine[]>(() => [
    { value: this.theta(), axis: 'x', label: `θ = ${this.thetaText()}`, dashed: true },
  ]);

  protected readonly readings = computed<readonly ThetaReading[]>(() => {
    const byModel = new Map(this.service.exceedanceSeries().map((s) => [s.model, s]));
    return this.service.exceedanceAtTheta().map((reading) => {
      const series = byModel.get(reading.model);
      const reproduces = series?.reproducesAsymmetry ?? null;
      return {
        model: reading.model,
        label: EXCEEDANCE_MODEL_LABEL[reading.model],
        correlation: correlationLabel(reading.correlation),
        verdict:
          reproduces === null
            ? null
            : reproduces
              ? 'reproduces the empirical asymmetry'
              : 'does not reproduce the empirical asymmetry',
      };
    });
  });

  /** `α = 0.00 σ, symmetric` — what the handle announces as it moves. */
  protected readonly valueText = computed(() => {
    const empirical = this.readings()[0];
    const empiricalNote = empirical ? `, empirical ρ ${empirical.correlation}` : '';
    return `θ = ${this.thetaText()} standard deviations, symmetric${empiricalNote}`;
  });

  /**
   * The accessible equivalent of the figure.
   *
   * This is the one place the asymmetry is put into words, because here the
   * words *are* the figure. The side it runs on is taken from the pair rather
   * than assumed: `equity-bond`'s empirical exceedance correlation sits higher
   * on the **upside**, and labelling it as downside-higher would be a claim the
   * data does not make.
   */
  protected readonly ariaLabel = computed(() => {
    const pair = this.pair();
    const all = this.service.exceedanceSeries();
    if (pair === null || all.length === 0) {
      return 'Exceedance correlation: the selected universe carries no pair of series to correlate.';
    }

    const empirical = all[0];
    const higher = pair.downsideExceedance === 'higher' ? 'downside' : 'upside';
    const gap = correlationLabel(Math.abs(empirical.asymmetryGap));
    const reproducing = all
      .filter((series) => series.reproducesAsymmetry === true)
      .map((series) => EXCEEDANCE_MODEL_LABEL[series.model]);
    const failing = all
      .filter((series) => series.reproducesAsymmetry === false)
      .map((series) => EXCEEDANCE_MODEL_LABEL[series.model]);

    return (
      `Exceedance correlation of ${pair.label} against the threshold θ, from ${thetaLabel(THETA_MIN)} ` +
      `to ${thetaLabel(THETA_MAX)} standard deviations, for the empirical series and three models. ` +
      `Empirically the ${higher} exceedance correlations sit above the opposite side by ${gap} on average. ` +
      `${this.listSentence(reproducing, 'reproduces that asymmetry', 'reproduce that asymmetry')} ` +
      `${this.listSentence(failing, 'does not', 'do not')} ` +
      `At θ = ${this.thetaText()} the readings are ` +
      `${this.readings().map((reading) => `${reading.label} ${reading.correlation}`).join(', ')}.`
    );
  });

  protected onPair(event: Event): void {
    this.service.setPair((event.target as HTMLSelectElement).value as SeriesPairId);
  }

  protected onInput(event: Event): void {
    this.setTheta(Number((event.target as HTMLInputElement).value));
  }

  /**
   * Arrows step, Page jumps, Home and End reach the ends of the grid exactly.
   *
   * `preventDefault` on exactly the keys handled here: the browser would apply
   * its own step on top of this one and the handle would move twice per press.
   * A modified arrow is somebody else's chord and is left alone.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const current = this.theta();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + this.step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - this.step;
        break;
      case 'PageUp':
        next = current + this.step * PAGE_STEPS;
        break;
      case 'PageDown':
        next = current - this.step * PAGE_STEPS;
        break;
      case 'Home':
        next = this.min;
        break;
      case 'End':
        next = this.max;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.setTheta(next);
  }

  /**
   * `A and B do not`, `A does not`, or nothing at all when the list is empty.
   *
   * Both conjugations are passed in rather than derived: which models pass the
   * comparison is data, so the sentence has to survive one, two or three names
   * on either side of it without reading as a template.
   */
  private listSentence(names: readonly string[], singular: string, plural: string): string {
    if (names.length === 0) return '';
    const joined =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${joined} ${names.length === 1 ? singular : plural}.`;
  }

  /**
   * Rounded to the step before the service clamps it.
   *
   * Repeated `+= 0.25` in binary drifts, and a θ of `0.7500000000000001` finds
   * no point on the grid — the readout would fall back to the middle of the
   * series and stop following the handle.
   */
  private setTheta(value: number): void {
    if (Number.isNaN(value)) return;
    this.service.setTheta(Math.round(value * 100) / 100);
  }
}
