import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CRASH_RISK_ARMED_ICON,
  CRASH_RISK_ARMED_LABEL,
  CRASH_RISK_NOT_ARMED_ICON,
  CRASH_RISK_NOT_ARMED_LABEL,
  MOMENTUM_HORIZON_LABEL,
  MOMENTUM_LOOKBACKS,
  MOMENTUM_LOOKBACK_LABEL,
  MOMENTUM_MARKET_STATE_ICON,
  MOMENTUM_MARKET_STATE_LABEL,
  WML_WEIGHTING_LABEL,
  type MomentumLookback,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BarChartComponent, chartTokens } from '../../../../shared/charts';
import type { CategorySeries } from '../../../../shared/charts';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { percent1, sharpeLabel, signedPercent1, signedPercent2 } from '../regimes-format';

const PROFIT_HEIGHT = 220;
const SHARPE_HEIGHT = 180;

/** One half of the composite crash condition, with the reading behind it. */
interface CrashCondition {
  readonly id: string;
  readonly name: string;
  readonly reading: string;
  readonly holds: boolean;
}

/**
 * Region 7 — momentum's own market state.
 *
 * **This is a third state vocabulary.** It is not the regime model's Crash /
 * Slow Growth / Bull / Recovery and it is not the value premium's high- and
 * low-volatility Markov chain. It has two members, UP and DOWN, defined ex ante
 * by the sign of the market's cumulative return over a long horizon — 36 months
 * by default, and the finding is robust at 12 and 24 — and it shares no label
 * and no colour with either of the others. The charts here are drawn in neutral
 * grey for exactly that reason: a UP bar in the Bull band's colour would invite
 * a reading that the two taxonomies do not support.
 *
 * The conditional profits are the finding: after an UP state the winner-minus-
 * loser strategy earns about 0.93% a month raw in the first half year, after a
 * DOWN state nothing, and over months 13 to 60 after an UP state it reverses.
 * The CAPM-adjusted column is `null` for the long horizon because the substance
 * fixes no such figure — the bar is a gap and the cell says so, rather than a
 * zero that would read as "no alpha".
 *
 * The crash indicator is a **composite boolean and never a score**. It arms
 * only when a bear market state and high realised volatility hold at the same
 * time, which is what makes momentum crashes partly foreseeable at all; either
 * one alone leaves it off. Both conditions are named whichever way it comes
 * out, so "not armed" is never read as "nothing to see".
 */
@Component({
  selector: 'app-market-regimes-momentum-state',
  imports: [BarChartComponent, SegmentedControl],
  templateUrl: './momentum-state.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MomentumStatePanel {
  private readonly service = inject(MarketRegimesService);

  protected readonly profitHeight = PROFIT_HEIGHT;
  protected readonly sharpeHeight = SHARPE_HEIGHT;
  protected readonly profitFormatter = signedPercent2;
  protected readonly sharpeFormatter = sharpeLabel;

  protected readonly momentum = this.service.momentum;
  protected readonly universe = this.service.universe;

  protected readonly lookbackValue = computed<string>(() =>
    String(this.momentum().lookbackMonths),
  );

  protected readonly lookbackOptions = computed<readonly SegmentedOption[]>(() =>
    MOMENTUM_LOOKBACKS.map((months) => ({
      value: String(months),
      label: MOMENTUM_LOOKBACK_LABEL[months],
    })),
  );

  /** `▲ UP — 36-month cumulative market return +18.6%, at or above zero`. */
  protected readonly stateIcon = computed(
    () => MOMENTUM_MARKET_STATE_ICON[this.momentum().state],
  );

  protected readonly stateLabel = computed(
    () => MOMENTUM_MARKET_STATE_LABEL[this.momentum().state],
  );

  protected readonly stateReading = computed(() => {
    const momentum = this.momentum();
    const comparison = momentum.state === 'UP' ? 'at or above zero' : 'below zero';
    return (
      `${momentum.lookbackMonths}-month cumulative market return ` +
      `${signedPercent1(momentum.cumulativeMarketReturn)}, ${comparison}`
    );
  });

  protected readonly profitCategories = computed(() =>
    this.momentum().profits.map(
      (profit) => `${MOMENTUM_HORIZON_LABEL[profit.horizon]} after ${profit.afterState}`,
    ),
  );

  protected readonly profitSeries = computed<readonly CategorySeries[]>(() => {
    const profits = this.momentum().profits;
    const tokens = chartTokens();
    return [
      {
        name: 'Raw',
        data: profits.map((profit) => profit.rawPerMonth),
        color: tokens.neutral,
      },
      {
        name: 'CAPM-adjusted',
        data: profits.map((profit) => profit.capmAdjustedPerMonth),
        color: tokens.textMuted,
      },
    ];
  });

  /** The long-horizon sign flip, in words: a reversal is not a smaller number. */
  protected readonly reversalNote = computed(() => {
    const reversal = this.momentum().profits.find((profit) => profit.reversal);
    if (!reversal) return null;
    return (
      `${MOMENTUM_HORIZON_LABEL[reversal.horizon]} after ${reversal.afterState} is a reversal — ` +
      `${signedPercent2(reversal.rawPerMonth)} a month, the opposite sign to the first six.`
    );
  });

  protected readonly profitAriaLabel = computed(() => {
    const profits = this.momentum().profits;
    const readings = profits
      .map((profit) => {
        const adjusted =
          profit.capmAdjustedPerMonth === null
            ? 'no CAPM-adjusted figure is fixed by the domain substance'
            : `${signedPercent2(profit.capmAdjustedPerMonth)} CAPM-adjusted`;
        return (
          `${MOMENTUM_HORIZON_LABEL[profit.horizon]} after ${profit.afterState}, ` +
          `${signedPercent2(profit.rawPerMonth)} a month raw and ${adjusted}`
        );
      })
      .join('; ');
    return `Winner-minus-loser profit per month conditioned on the preceding market state: ${readings}.`;
  });

  protected readonly sharpeCategories = computed(() =>
    this.momentum().wmlSharpe.map((row) => WML_WEIGHTING_LABEL[row.weighting]),
  );

  protected readonly sharpeSeries = computed<readonly CategorySeries[]>(() => [
    {
      name: 'WML Sharpe',
      data: this.momentum().wmlSharpe.map((row) => row.sharpe),
      color: chartTokens().neutral,
    },
  ]);

  protected readonly sharpeAriaLabel = computed(() => {
    const readings = this.momentum()
      .wmlSharpe.map((row) => `${WML_WEIGHTING_LABEL[row.weighting]} ${sharpeLabel(row.sharpe)}`)
      .join(', ');
    return `Sharpe ratio of the winner-minus-loser strategy by weighting rule: ${readings}.`;
  });

  // --- the composite crash flag ---------------------------------------------

  protected readonly crashRisk = computed(() => this.momentum().crashRisk);

  protected readonly crashIcon = computed(() =>
    this.crashRisk().armed ? CRASH_RISK_ARMED_ICON : CRASH_RISK_NOT_ARMED_ICON,
  );

  protected readonly crashLabel = computed(() =>
    this.crashRisk().armed ? CRASH_RISK_ARMED_LABEL : CRASH_RISK_NOT_ARMED_LABEL,
  );

  /**
   * The two halves, each with the reading that decided it.
   *
   * Printed whether the flag is armed or not: the reader has to be able to see
   * which half is missing, and "not armed" with a bear state already holding is
   * a different situation from "not armed" with neither.
   */
  protected readonly crashConditions = computed<readonly CrashCondition[]>(() => {
    const risk = this.crashRisk();
    const momentum = this.momentum();
    return [
      {
        id: 'bear-state',
        name: 'Bear market state',
        reading: `market state ${MOMENTUM_MARKET_STATE_LABEL[momentum.state]} over ${momentum.lookbackMonths} months`,
        holds: risk.bearState,
      },
      {
        id: 'high-volatility',
        name: 'High realised volatility (126d)',
        reading:
          `${percent1(risk.realisedVolatility)} annualised on ${this.universe().label}, ` +
          `threshold ${percent1(risk.volatilityThreshold)}`,
        holds: risk.highVolatility,
      },
    ];
  });

  protected onLookback(value: string): void {
    this.service.setMomentumLookback(Number(value) as MomentumLookback);
  }
}
