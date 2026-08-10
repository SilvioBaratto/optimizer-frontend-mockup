import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CONFIDENCE_LABEL,
  HOLDING_PERIOD_SHORT_LABEL,
  VAR_CVAR_ORDER_NOTE,
  VAR_METHOD_SHORT_LABEL,
} from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { KeyMetricsRow, type KeyMetric } from '../../../../shared/key-metrics-row/key-metrics-row';
import { DRAWDOWN_UNITS_SUFFIX, MINUS, drawdownValue, percent2 } from '../monitoring-format';

/** The relation the CVaR card recalls. Text, not a hover target. */
const ORDER_BADGE = 'VaR ≤ CVaR';

/**
 * Region 2 — the four current readings, on the weights the fund actually holds.
 *
 * Two of the four are read off the marginal loss distribution and two off the
 * path of the equity curve, which is why the row reads as a pair of pairs: VaR
 * and CVaR answer "how bad can one day be", the drawdown and the time
 * underwater answer "how far from its own high is the fund, and for how long".
 *
 * The CVaR card carries `α_β(w) ≤ φ_β(w)` as a badge and the sentence beneath
 * the row spells it out. Neither redefines either measure: the ordering is a
 * property of the pair — the average of the losses beyond a threshold cannot be
 * below the threshold — and the card only reminds the reader of it.
 *
 * When the historical estimate has too few tail observations to mean anything,
 * the note lands on the VaR card itself and names the way out. The method is
 * never switched underneath the reader: the toolbar would still be claiming
 * `Historical` over a number computed the other way.
 */
@Component({
  selector: 'app-risk-monitoring-readings',
  imports: [KeyMetricsRow],
  templateUrl: './risk-readings.html',
  host: { class: 'flex flex-col gap-2' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskReadings {
  private readonly service = inject(RiskMonitoringService);

  protected readonly orderNote = VAR_CVAR_ORDER_NOTE;
  protected readonly insufficientHistoryNote = this.service.insufficientHistoryNote;

  protected readonly metrics = computed<readonly KeyMetric[]>(() => {
    const readings = this.service.readings();
    const summary = this.service.drawdownSummary();
    const units = this.service.drawdownUnits();
    const level = CONFIDENCE_LABEL[readings.confidence];
    const shortfall = this.insufficientHistoryNote();

    return [
      {
        // The badge marks the card the note under the row is about, so the two
        // are one message rather than a warning floating free of its figure.
        label: `VaR (${level}, ${VAR_METHOD_SHORT_LABEL[readings.method]}, ${HOLDING_PERIOD_SHORT_LABEL[readings.holdingPeriodDays]})`,
        value: `${percent2(readings.var)} of NAV`,
        note: shortfall === null ? this.sampleNote() : this.shortSampleNote(),
        badge: shortfall ? { label: 'Short sample', tone: 'warn' } : undefined,
      },
      {
        label: `CVaR / ES (${level})`,
        value: `${percent2(readings.cvar)} of NAV`,
        note: 'Mean loss beyond the VaR threshold',
        badge: { label: ORDER_BADGE, tone: 'neutral' },
      },
      {
        // The magnitude is stored non-negative; the fall is what is shown.
        label: 'Current drawdown',
        value: `${MINUS}${drawdownValue(readings.currentDrawdown, readings.currentDrawdownAbs, units)} (${DRAWDOWN_UNITS_SUFFIX[units]})`,
        note: `From the running maximum of ${summary.lastHighAt}`,
      },
      {
        label: 'Time underwater',
        value: `${readings.daysUnderwater} days`,
        note: `Observations since the last new high · ${summary.observations} in the period`,
      },
    ];
  });

  /**
   * What the VaR figure rests on, in the terms of the method that produced it.
   *
   * The two methods fail in different ways, so a single sentence would be wrong
   * for one of them: the historical estimate is only as good as the number of
   * observations in the tail, and the parametric one has no such floor and a
   * distributional assumption instead.
   */
  private sampleNote(): string {
    if (this.service.method() === 'parametric') {
      return 'Normal quantile over the holding period — no sample-size floor';
    }
    const tail = Math.floor(this.service.tailObservations());
    const sample = this.service.effectiveSampleSize();
    return `${tail} of ${sample} observations beyond the ${CONFIDENCE_LABEL[this.service.confidence()]} threshold`;
  }

  /**
   * The card's own note when the sample is too thin.
   *
   * The doc puts this note *on* the VaR/CVaR card, with the way out named — a
   * badge reading "Short sample" says a figure is suspect but not what to do
   * about it, and the sentence under the row is a live region rather than part
   * of the card a reader lands on. Kept to one line: the card is a quarter of
   * the row at `lg`, and the full reasoning is in the note below it.
   */
  private shortSampleNote(): string {
    return `${this.sampleNote()} — switch Method to Parametric`;
  }
}
