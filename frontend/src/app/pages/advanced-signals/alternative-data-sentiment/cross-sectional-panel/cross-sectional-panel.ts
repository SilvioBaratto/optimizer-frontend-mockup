import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CROSS_SECTION_MODEL_NOTE,
  DECILE_SHAPE_LABEL,
  FIRM_CHARACTERISTICS,
  FIRM_CHARACTERISTIC_AXIS,
  FIRM_CHARACTERISTIC_LABEL,
  SENTIMENT_BASES,
  SENTIMENT_BASIS_DEFINITION,
  SENTIMENT_BASIS_LABEL,
  SENTIMENT_BASIS_VARIANCE,
  SENTIMENT_REGIMES,
  SENTIMENT_REGIME_LABEL,
  SENTIMENT_REGIME_SERIES,
  type FirmCharacteristic,
  type SentimentBasis,
  type SentimentRegime,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine, ValueFormatter } from '../../../../shared/charts';
import { InfoCard } from '../../../../shared/info-card/info-card';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { decileLabel, signedPercent2 } from '../alt-data-format';

const MONTHLY_PER_CENT: ValueFormatter = (value) => signedPercent2(value);

/** The zero line is the whole reading: which side of it a decile falls on. */
const ZERO_LINE: readonly RefLine[] = [{ value: 0, axis: 'y', dashed: true }];

/**
 * Regions 11 and 13 in the Cross-Sectional Sentiment tab — the parameter panel
 * and the conditional cross-section it drives.
 *
 * **Both regimes are always drawn.** The finding is not "returns are low after
 * a high reading"; it is that the pattern under high sentiment attenuates or
 * inverts under low sentiment, and a chart showing one regime at a time cannot
 * state a difference between two. The regime toggle therefore chooses which
 * spread the summary is read for, not which series exists — and the summary
 * says which one it is reading, in words, above the chart.
 *
 * The index basis is a real choice and not a display option: the raw first
 * principal component still carries a macroeconomic component, so the spread it
 * conditions is not purely a sentiment spread. Switching to it attenuates every
 * conditional return, and the panel prints the share of proxy variance each
 * index explains so the trade is visible.
 */
@Component({
  selector: 'app-alt-data-cross-sectional-panel',
  imports: [BarChartComponent, InfoCard, SegmentedControl, SelectDirective],
  templateUrl: './cross-sectional-panel.html',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataCrossSectionalPanel {
  private readonly service = inject(AltDataSentimentService);

  protected readonly characteristics = FIRM_CHARACTERISTICS;
  protected readonly characteristicLabel = FIRM_CHARACTERISTIC_LABEL;
  protected readonly characteristicAxis = FIRM_CHARACTERISTIC_AXIS;
  protected readonly basisDefinition = SENTIMENT_BASIS_DEFINITION;
  protected readonly shapeLabel = DECILE_SHAPE_LABEL;
  protected readonly modelNote = CROSS_SECTION_MODEL_NOTE;
  protected readonly refLines = ZERO_LINE;
  protected readonly formatter = MONTHLY_PER_CENT;

  protected readonly result = this.service.crossSection;
  protected readonly regime = this.service.regime;
  protected readonly basis = this.service.basis;
  protected readonly characteristic = this.service.characteristic;

  protected readonly regimeOptions = computed<SegmentedOption[]>(() =>
    SENTIMENT_REGIMES.map((value) => ({ value, label: SENTIMENT_REGIME_LABEL[value] })),
  );

  protected readonly basisOptions = computed<SegmentedOption[]>(() =>
    SENTIMENT_BASES.map((value) => ({
      value,
      label: `${SENTIMENT_BASIS_LABEL[value]} — ${SENTIMENT_BASIS_VARIANCE[value]}% of proxy variance`,
    })),
  );

  protected readonly categories = computed<readonly string[]>(() =>
    this.result().rows.map((row) => decileLabel(row.decile)),
  );

  /**
   * The regime being read comes first, so the legend and the tooltip put it
   * where the eye lands before the comparison series.
   */
  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const result = this.result();
    const high: CategorySeries = {
      name: SENTIMENT_REGIME_SERIES.high,
      data: result.rows.map((row) => row.high),
    };
    const low: CategorySeries = {
      name: SENTIMENT_REGIME_SERIES.low,
      data: result.rows.map((row) => row.low),
    };
    return result.regime === 'high' ? [high, low] : [low, high];
  });

  protected readonly title = computed(
    () => `Monthly return by ${this.characteristicLabel[this.characteristic()].toLowerCase()} decile`,
  );

  protected readonly subtitle = computed(() => {
    const result = this.result();
    return `${SENTIMENT_BASIS_LABEL[result.basis]} · reading the ${SENTIMENT_REGIME_LABEL[
      result.regime
    ].toLowerCase()}-sentiment regime · ${this.characteristicAxis[result.characteristic]}`;
  });

  /** D10 − D1 in the regime the toggle is on, stated in words above the chart. */
  protected readonly spreadText = computed(() => {
    const result = this.result();
    const spread = result.regime === 'high' ? result.spreadHigh : result.spreadLow;
    const other = result.regime === 'high' ? result.spreadLow : result.spreadHigh;
    const otherName = result.regime === 'high' ? 'low' : 'high';
    return `D10 − D1 is ${signedPercent2(spread)} a month under ${SENTIMENT_REGIME_LABEL[
      result.regime
    ].toLowerCase()} sentiment, against ${signedPercent2(other)} under ${otherName} sentiment.`;
  });

  protected readonly ariaLabel = computed(() => {
    const result = this.result();
    const rows = result.rows
      .map((row) => `D${row.decile} high ${signedPercent2(row.high)}, low ${signedPercent2(row.low)}`)
      .join('; ');
    return `${this.title()}, conditioned on the sentiment regime: ${rows}.`;
  });

  protected onRegime(value: string): void {
    this.service.setSentimentRegime(value as SentimentRegime);
  }

  protected onBasis(value: string): void {
    this.service.setSentimentBasis(value as SentimentBasis);
  }

  protected onCharacteristic(event: Event): void {
    this.service.setCharacteristic((event.target as HTMLSelectElement).value as FirmCharacteristic);
  }
}
