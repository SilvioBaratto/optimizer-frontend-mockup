import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CONFIDENCE_LABEL,
  HOLDING_PERIOD_LABEL,
  LOOKBACK_LABEL,
  VAR_METHOD_LABEL,
} from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { percent2 } from '../monitoring-format';

/**
 * Region 3 — VaR and CVaR through the lookback window.
 *
 * The two lines are one object per instant, not two series that happen to be
 * plotted together: `VarCvarPoint` carries the threshold and the value of the
 * same minimisation, so the drawing cannot show a moment at which CVaR dips
 * below VaR. The footnote says which line is which in words, because a solid
 * and a dashed line are the only distinction that survives greyscale.
 *
 * The window selector re-extends this chart and nothing else. Confidence,
 * method and holding period change what is plotted, and the subtitle names all
 * three so the figure is never read under the wrong assumptions.
 */
@Component({
  selector: 'app-risk-monitoring-var-cvar-trend',
  imports: [LineChartComponent],
  templateUrl: './var-cvar-trend.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VarCvarTrend {
  private readonly service = inject(RiskMonitoringService);

  /** Stable reference — a new arrow each render would rebuild the option. */
  protected readonly percent: ValueFormatter = percent2;

  protected readonly coincidenceNote = this.service.tailCoincidenceNote;

  protected readonly dates = computed(() => this.service.varCvarTrend().map((p) => p.date));

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const trend = this.service.varCvarTrend();
    return [
      { name: 'VaR', data: trend.map((p) => p.var) },
      { name: 'CVaR', data: trend.map((p) => p.cvar) },
    ];
  });

  /** The right-hand end of both lines — the figures the cards above print. */
  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const trend = this.service.varCvarTrend();
    const last = trend[trend.length - 1];
    if (!last) return [];
    return [
      { x: last.date, y: last.cvar, label: `CVaR ${percent2(last.cvar)}` },
      { x: last.date, y: last.var, label: `VaR ${percent2(last.var)}` },
    ];
  });

  protected readonly subtitle = computed(() => {
    const readings = this.service.readings();
    return [
      LOOKBACK_LABEL[this.service.lookback()],
      CONFIDENCE_LABEL[readings.confidence],
      VAR_METHOD_LABEL[readings.method],
      HOLDING_PERIOD_LABEL[readings.holdingPeriodDays],
    ].join(' · ');
  });

  protected readonly ariaLabel = computed(() => {
    const trend = this.service.varCvarTrend();
    const first = trend[0];
    const last = trend[trend.length - 1];
    if (!first || !last) return 'VaR and CVaR trend: no observations in the selected window.';

    const direction = last.var > first.var ? 'rises' : last.var < first.var ? 'falls' : 'is flat';
    const coincidence = this.service.tailCoincidence()
      ? ' The two nearly coincide at the current reading.'
      : '';

    return (
      `VaR and CVaR over the ${LOOKBACK_LABEL[this.service.lookback()]} window at ` +
      `${CONFIDENCE_LABEL[this.service.confidence()]} confidence, ` +
      `${VAR_METHOD_LABEL[this.service.method()]} method, ` +
      `${HOLDING_PERIOD_LABEL[this.service.holdingPeriodDays()]} holding period. ` +
      `VaR ${direction} from ${percent2(first.var)} to ${percent2(last.var)} of NAV and CVaR from ` +
      `${percent2(first.cvar)} to ${percent2(last.cvar)}, across ${trend.length} weekly readings. ` +
      `CVaR is at or above VaR at every point.${coincidence}`
    );
  });
}
