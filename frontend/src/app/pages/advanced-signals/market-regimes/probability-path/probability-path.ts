import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EMPTY_TITLE,
  MARKET_REGIME_MODEL_LABEL,
  PROBABILITY_BASIS_LABEL,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { percent0 } from '../regimes-format';

const CHART_HEIGHT = 320;

/**
 * How much of the path the chart opens on.
 *
 * The full sample is 1990-01 to 2026-07 — four hundred and forty months — and
 * on a phone that is more points than pixels. The window opens on the last
 * fifth, which is where the current run is, and the zoom slider reaches the
 * rest. Nothing is hidden: the tabular alternative always carries every month.
 */
const ZOOM_START = 80;

/**
 * Region 3 — the probability path, as stacked bands.
 *
 * Stacked and not overlaid, because the quantity being drawn is a probability
 * vector: the bands sum to one at every month by construction, so the figure
 * that shows that is one whose bands close at 100% and whose thicknesses are
 * the shares. Overlaid lines would draw four series that happen to add up and
 * make the reader verify it.
 *
 * The band order is the model's own state order, so a state occupies the same
 * slot — and the same colour — here as in the hero card above.
 *
 * Under the Hamilton model there are two bands, not four, and nothing here
 * decides that: the region reads the same `probabilityPath()` the hero card
 * and the statistics table read, so all three change state count together.
 *
 * `ChartPanel`'s own "View as table" is the underlying data table the spec
 * asks for. It is one button, focusable, and it renders every month and every
 * band through the same formatter the chart uses — which is exactly why there
 * is no second table hand-rolled beside the figure.
 */
@Component({
  selector: 'app-market-regimes-probability-path',
  imports: [EmptyState, LineChartComponent],
  templateUrl: './probability-path.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProbabilityPath {
  private readonly service = inject(MarketRegimesService);

  protected readonly height = CHART_HEIGHT;
  protected readonly zoomStart = ZOOM_START;
  protected readonly emptyTitle = EMPTY_TITLE;
  protected readonly formatter = percent0;

  /**
   * The spec's reduced-motion clause, and the only place on this page it bites.
   *
   * ECharts animates the bands into place inside a canvas, where the global
   * `prefers-reduced-motion` rule in `styles.css` — which reaches CSS
   * transitions and nothing else — cannot touch them. Suppressing it here is
   * what actually makes the stacked areas appear at their final state directly.
   * (The hero card's probability bars are plain width, with no transition to
   * suspend.) Read once and held: a fresh object every change-detection pass
   * would re-initialise the chart.
   */
  protected readonly chartOptionPatch = {
    animation: !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  };

  protected readonly months = this.service.probabilityPathMonths;
  protected readonly emptyDetail = this.service.emptyDetail;

  protected readonly hasPath = computed(() => this.service.probabilityPath().length > 0);

  protected readonly basisLabel = computed(
    () => PROBABILITY_BASIS_LABEL[this.service.probabilityBasis()],
  );

  protected readonly title = computed(() => `Probability path — ${this.basisLabel().toLowerCase()}`);

  protected readonly subtitle = computed(() => {
    const months = this.months();
    if (months.length === 0) return '';
    return `${MARKET_REGIME_MODEL_LABEL[this.service.model()]} · ${months[0]} → ${months[months.length - 1]}`;
  });

  protected readonly series = computed<readonly CategorySeries[]>(() =>
    this.service.probabilityPath().map((band) => ({
      name: band.state,
      data: [...band.probabilities],
    })),
  );

  /**
   * What a reader who cannot see the bands is told instead.
   *
   * It names the model, the basis, the extent of the sample and the reading at
   * the last month — which is the only month any other region on the page is
   * anchored to — rather than trying to narrate four hundred of them.
   */
  protected readonly ariaLabel = computed(() => {
    const months = this.months();
    const bands = this.service.probabilityPath();
    if (months.length === 0 || bands.length === 0) {
      return 'Probability path: no estimate for this combination of model, universe and sample window.';
    }

    const last = months[months.length - 1];
    const reading = bands
      .map((band) => `${band.state} ${percent0(band.probabilities[band.probabilities.length - 1])}`)
      .join(', ');

    return (
      `${this.basisLabel()} probability of each of the ${bands.length} states of the ` +
      `${MARKET_REGIME_MODEL_LABEL[this.service.model()]} model, stacked to 100% at every month, ` +
      `monthly from ${months[0]} to ${last} over ${months.length} months. ` +
      `At ${last} the reading is ${reading}.`
    );
  });
}
