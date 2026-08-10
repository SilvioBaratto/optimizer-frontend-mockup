import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  DOMINANT_SIGNALS_NOTE,
  SCORE_WEIGHTINGS,
  SCORE_WEIGHTING_LABEL,
  SHARPE_RELATION_NOTE,
  type ScoreWeighting,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine, ValueFormatter } from '../../../../shared/charts';
import { InfoCard } from '../../../../shared/info-card/info-card';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { AltDataMlModelTable } from '../ml-model-table/ml-model-table';
import { percent2, sharpeLabel } from '../alt-data-format';

const SHARPE: ValueFormatter = (value) => sharpeLabel(value);

/**
 * Regions 11, 12 and 13 in the ML Aggregation tab — the weighting selector, the
 * candidate models and the aggregate read against its best single component.
 *
 * The figure is deliberately a Sharpe ratio and not an `R²`. The two are not
 * alternatives: the `R²` is what the models are chosen on and lives in the
 * table above, and the Sharpe is what the choice is worth to a portfolio, which
 * is the only quantity the weighting selector moves. Printing both on one axis
 * would put a per-cent-per-month figure and a ratio on the same scale.
 *
 * The two reference lines are what stops the comparison being read as a claim
 * about the index: buying and holding it earns 0.51, timing it on the same
 * forecasts earns 0.77, and the long-short spread is a third thing again.
 */
@Component({
  selector: 'app-alt-data-ml-aggregation-panel',
  imports: [AltDataMlModelTable, BarChartComponent, InfoCard, SegmentedControl],
  templateUrl: './ml-aggregation-panel.html',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataMlAggregationPanel {
  private readonly service = inject(AltDataSentimentService);

  protected readonly formatter = SHARPE;
  protected readonly sharpeNote = SHARPE_RELATION_NOTE;
  protected readonly dominantNote = DOMINANT_SIGNALS_NOTE;

  protected readonly comparison = this.service.aggregate;
  protected readonly weighting = this.service.scoreWeighting;
  protected readonly selectedModel = this.service.selectedModel;

  protected readonly weightingOptions = computed<SegmentedOption[]>(() =>
    SCORE_WEIGHTINGS.map((value) => ({ value, label: SCORE_WEIGHTING_LABEL[value] })),
  );

  protected readonly categories = computed<readonly string[]>(() => {
    const comparison = this.comparison();
    return [comparison.aggregate.label, comparison.bestComponent.label];
  });

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const comparison = this.comparison();
    return [
      {
        name: `Long-short decile Sharpe, ${SCORE_WEIGHTING_LABEL[comparison.weighting].toLowerCase()}`,
        data: [comparison.aggregate.sharpe, comparison.bestComponent.sharpe],
      },
    ];
  });

  protected readonly refLines = computed<readonly RefLine[]>(() => {
    const comparison = this.comparison();
    return [
      {
        value: comparison.buyAndHoldSharpe,
        axis: 'x',
        label: `Index buy and hold ${sharpeLabel(comparison.buyAndHoldSharpe)}`,
        dashed: true,
      },
      {
        value: comparison.marketTimingSharpe,
        axis: 'x',
        label: `Index timed on the same forecasts ${sharpeLabel(comparison.marketTimingSharpe)}`,
        dashed: true,
      },
    ];
  });

  protected readonly subtitle = computed(() => {
    const comparison = this.comparison();
    return `R² oos ${percent2(comparison.aggregate.r2Oos)} against ${percent2(
      comparison.bestComponent.r2Oos,
    )} · ${SCORE_WEIGHTING_LABEL[comparison.weighting].toLowerCase()} decile spread`;
  });

  protected readonly ariaLabel = computed(() => {
    const comparison = this.comparison();
    return `Aggregate score against its best single component, ${SCORE_WEIGHTING_LABEL[
      comparison.weighting
    ].toLowerCase()}: ${comparison.aggregate.label} Sharpe ${sharpeLabel(
      comparison.aggregate.sharpe,
    )} with R² out of sample ${percent2(comparison.aggregate.r2Oos)}; ${
      comparison.bestComponent.label
    } Sharpe ${sharpeLabel(comparison.bestComponent.sharpe)} with R² out of sample ${percent2(
      comparison.bestComponent.r2Oos,
    )}.`;
  });

  /** The row the reader picked in the table, read against the aggregate. */
  protected readonly selectedNote = computed(() => {
    const model = this.selectedModel();
    if (model === null) return null;
    const comparison = this.comparison();
    return `${model.name}: R² oos ${percent2(model.r2Oos)}, weight ${model.weight}% of the aggregate score, which itself reads ${percent2(comparison.aggregate.r2Oos)}.`;
  });

  protected onWeighting(value: string): void {
    this.service.setScoreWeighting(value as ScoreWeighting);
  }
}
