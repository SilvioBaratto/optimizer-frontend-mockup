import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  SENTIMENT_BASIS_LABEL,
  TONE_DICTIONARY_SHORT,
  TONE_WEIGHTING_LABEL,
  type LagCausalityFigure,
  type SignalDetailView,
} from '../../../../models/alt-data-sentiment.model';
import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine, ValueFormatter } from '../../../../shared/charts';
import {
  loadingLabel,
  pValueLabel,
  percent2,
  signedBasisPoints,
  tStatLabel,
} from '../alt-data-format';

/** Text drawn where a bar would be for a combination nobody estimated. */
const NOT_REPORTED_LABEL = 'not reported';

const BASIS_POINTS: ValueFormatter = (value) => signedBasisPoints(value);
const T_STATISTIC: ValueFormatter = (value) => tStatLabel(value);
const PER_CENT: ValueFormatter = (value) => percent2(value);
const LOADING: ValueFormatter = (value) => loadingLabel(value);

/**
 * The figure inside the detail panel, which is a different figure per kind of
 * signal — that is what the spec means by content specific to the signal type.
 *
 * Four of the five kinds are one bar chart with different inputs, so they are
 * assembled in TypeScript and the template renders a single `app-bar-chart`.
 * The chart supplies its own "View as table" alternative, so there is no second
 * table beside it. The fifth is a causality table, which is a table because the
 * reading is a p-value against a threshold per lag and not a magnitude.
 *
 * Two conventions carry meaning here rather than decoration:
 *
 * - a `null` datum draws no bar at all and prints "not reported". The Fin-Neg ×
 *   tf.idf pairing has no published estimate, and a zero-length bar labelled
 *   `0.00` would be a measurement nobody made;
 * - the category labels mark the combination in force with a filled glyph, so
 *   which pairing the verdict belongs to survives into the table alternative
 *   and into greyscale.
 */
@Component({
  selector: 'app-alt-data-detail-figure',
  imports: [BarChartComponent],
  templateUrl: './detail-figure.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataDetailFigure {
  readonly view = input.required<SignalDetailView>();

  protected readonly unavailableLabel = NOT_REPORTED_LABEL;

  /** The one kind that is a table rather than a chart. */
  protected readonly causality = computed<LagCausalityFigure | null>(() => {
    const figure = this.view().figure;
    return figure.kind === 'lag-causality' ? figure : null;
  });

  protected readonly categories = computed<readonly string[]>(() => {
    const figure = this.view().figure;
    switch (figure.kind) {
      case 'shock-response':
      case 'news-cadence':
        return figure.points.map((point) => point.label);
      case 'tone-methods':
        return figure.combinations.map((combination) => {
          const active =
            combination.dictionary === figure.active.dictionary &&
            combination.weighting === figure.active.weighting;
          return `${active ? '●' : '○'} ${TONE_DICTIONARY_SHORT[combination.dictionary]} · ${TONE_WEIGHTING_LABEL[
            combination.weighting
          ].toLowerCase()}`;
        });
      case 'loadings':
        return figure.loadings.map((loading) => (loading.lagged ? `${loading.name} (t−1)` : loading.name));
      default:
        return [];
    }
  });

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const figure = this.view().figure;
    switch (figure.kind) {
      case 'shock-response':
        return [{ name: 'Response', data: figure.points.map((point) => point.value) }];
      case 'news-cadence':
        return [{ name: 'Predictability', data: figure.points.map((point) => point.value) }];
      case 'tone-methods':
        return [
          { name: 't-statistic', data: figure.combinations.map((item) => item.tStat) },
        ];
      case 'loadings':
        return [{ name: 'Loading', data: figure.loadings.map((loading) => loading.value) }];
      default:
        return [];
    }
  });

  protected readonly refLines = computed<readonly RefLine[]>(() => {
    const figure = this.view().figure;
    if (figure.kind === 'tone-methods') {
      return [
        { value: figure.criticalValue, axis: 'x', label: '5% critical value', dashed: true },
        { value: 0, axis: 'x', dashed: true },
      ];
    }
    if (figure.kind === 'shock-response' || figure.kind === 'loadings') {
      return [{ value: 0, axis: 'x', dashed: true }];
    }
    return [];
  });

  protected readonly formatter = computed<ValueFormatter>(() => {
    switch (this.view().figure.kind) {
      case 'shock-response':
        return BASIS_POINTS;
      case 'tone-methods':
        return T_STATISTIC;
      case 'loadings':
        return LOADING;
      default:
        return PER_CENT;
    }
  });

  /**
   * Thirteen weekly bars read as a column chart and as thirteen cramped rows;
   * everything else on this page is a short list of named things, which reads
   * better lying down.
   */
  protected readonly orientation = computed<'horizontal' | 'vertical'>(() =>
    this.categories().length > 6 ? 'vertical' : 'horizontal',
  );

  protected readonly valueAxisName = computed(() => {
    const figure = this.view().figure;
    if (figure.kind === 'shock-response' || figure.kind === 'news-cadence') return figure.axisName;
    if (figure.kind === 'tone-methods') return 't-statistic';
    if (figure.kind === 'loadings') return 'Loading on the first component';
    return '';
  });

  protected readonly categoryAxisName = computed(() => {
    const figure = this.view().figure;
    if (figure.kind === 'tone-methods') return 'Dictionary and weighting';
    if (figure.kind === 'loadings') return 'Proxy';
    if (figure.kind === 'news-cadence') return 'Horizon';
    return 'Horizon';
  });

  /**
   * The reading in words, so the figure is not only a picture.
   *
   * Built from the same categories and values the chart draws, so it cannot
   * describe a chart other than the one on screen.
   */
  protected readonly ariaLabel = computed(() => {
    const format = this.formatter();
    const values = this.series()[0]?.data ?? [];
    const pairs = this.categories().map((category, index) => {
      const value = values[index];
      return `${category} ${value === null || value === undefined ? NOT_REPORTED_LABEL : format(value)}`;
    });
    return `${this.view().figureTitle}: ${pairs.join(', ')}.`;
  });

  protected readonly subtitle = computed(() => this.view().figureSubtitle);

  /**
   * What the figure on screen does not say on its own.
   *
   * For news, that is the other cadence. The spec asks the news card for a
   * daily/weekly *comparison*, and one cadence drawn at a time is not one: the
   * whole finding is that the same articles predict for one to two days when
   * aggregated daily and for a full quarter when aggregated weekly, so the
   * figure that is not drawn has to be stated in words beside the one that is.
   *
   * For the aggregate index, that is which principal component the loadings
   * belong to and how much of the proxies' variance it explains — the number
   * that makes SENT and SENT⊥ two different indices rather than two labels.
   */
  protected readonly figureNote = computed<string | null>(() => {
    const figure = this.view().figure;
    if (figure.kind === 'news-cadence') {
      return `Predictability runs ${figure.horizonLabel}. ${figure.alternativeLabel}`;
    }
    if (figure.kind === 'loadings') {
      return `${SENTIMENT_BASIS_LABEL[figure.basis]} — the first principal component of the six proxies, explaining ${figure.varianceExplained}% of their variance.`;
    }
    return null;
  });

  protected pValue(value: number): string {
    return pValueLabel(value);
  }
}
