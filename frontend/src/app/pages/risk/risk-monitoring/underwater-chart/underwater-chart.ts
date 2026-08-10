import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { drawdownValue, negativeDrawdownFormatter, signedDrawdown } from '../monitoring-format';

/**
 * A point of the path another region asked to have called out.
 *
 * `date` may be null: "AvDD" is a property of the whole path and marking one
 * observation with it would be a lie, so the highlight is then a caption and a
 * reference line rather than a dot.
 */
export interface UnderwaterHighlight {
  readonly date: string | null;
  readonly label: string;
}

/**
 * Region 4 — the underwater curve `D(x,t)`.
 *
 * Drawn below the zero line, because that is what the reader is being shown: a
 * fall from the running maximum. The magnitudes arrive non-negative, as `D` is
 * defined, and the sign is added here — in the series, in the reference lines,
 * in the tick labels and therefore in the "View as table" cells, which
 * `ChartPanel` builds with the same formatter the axis uses.
 *
 * The zero line is not decoration: it *is* the running maximum, and the curve
 * touches it exactly at the observations flagged `newHigh`. The footnote counts
 * them, so the property is legible without reading the drawing.
 *
 * The units toggle switches which field of the same point is plotted. It never
 * converts one into the other, and it cannot make this chart disagree with the
 * card above it or the table below it.
 */
@Component({
  selector: 'app-risk-monitoring-underwater-chart',
  imports: [LineChartComponent],
  templateUrl: './underwater-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnderwaterChart {
  private readonly service = inject(RiskMonitoringService);

  readonly highlight = input<UnderwaterHighlight | null>(null);

  protected readonly summary = this.service.drawdownSummary;
  protected readonly units = this.service.drawdownUnits;

  protected readonly formatter = computed<ValueFormatter>(() =>
    negativeDrawdownFormatter(this.units()),
  );

  protected readonly dates = computed(() => this.service.underwaterSeries().map((p) => p.date));

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const abs = this.units() === 'abs';
    return [
      {
        name: 'Drawdown D(x,t)',
        data: this.service.underwaterSeries().map((p) => -(abs ? p.drawdownAbs : p.drawdown)),
      },
    ];
  });

  /** Observations at which the curve is exactly back on its running maximum. */
  protected readonly newHighs = computed(
    () => this.service.underwaterSeries().filter((p) => p.newHigh).length,
  );

  protected readonly refLines = computed<readonly RefLine[]>(() => {
    const summary = this.summary();
    const units = this.units();
    return [
      { value: 0, label: 'running max', dashed: false },
      {
        value: -this.pick(summary.maxDrawdown, summary.maxDrawdownAbs),
        label: `MaxDD ${signedDrawdown(summary.maxDrawdown, summary.maxDrawdownAbs, units)}`,
      },
      {
        value: -this.pick(summary.averageDrawdown, summary.averageDrawdownAbs),
        label: `AvDD ${signedDrawdown(summary.averageDrawdown, summary.averageDrawdownAbs, units)}`,
      },
    ];
  });

  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const points = this.service.underwaterSeries();
    const last = points[points.length - 1];
    const units = this.units();
    const marks: RefPoint[] = [];

    if (last) {
      marks.push({
        x: last.date,
        y: -this.pick(last.drawdown, last.drawdownAbs),
        label: `now ${signedDrawdown(last.drawdown, last.drawdownAbs, units)}`,
      });
    }

    // What another region pointed at. Only a real observation gets a dot: a
    // highlight for a date this path does not contain would invent a point.
    const wanted = this.highlight()?.date ?? null;
    const found = wanted ? points.find((p) => p.date === wanted) : undefined;
    if (found && found !== last) {
      marks.push({
        x: found.date,
        y: -this.pick(found.drawdown, found.drawdownAbs),
        label: `${found.date} ${signedDrawdown(found.drawdown, found.drawdownAbs, units)}`,
      });
    }
    return marks;
  });

  /** The wireframe's footnote, in the units currently selected. */
  protected readonly footnote = computed(() => {
    const summary = this.summary();
    const units = this.units();
    return (
      `MaxDD ${signedDrawdown(summary.maxDrawdown, summary.maxDrawdownAbs, units)} ref · ` +
      `AvDD ${signedDrawdown(summary.averageDrawdown, summary.averageDrawdownAbs, units)} ref · ` +
      `time underwater ${summary.daysUnderwater} days`
    );
  });

  protected readonly ariaLabel = computed(() => {
    const summary = this.summary();
    const points = this.service.underwaterSeries();
    const last = points[points.length - 1];
    const units = this.units();
    const current = last ? drawdownValue(last.drawdown, last.drawdownAbs, units) : '—';

    return (
      `Drawdown from the running maximum over ${summary.observations} observations, ` +
      `${summary.from} to ${summary.to}. The fund is ${current} below its running maximum and has ` +
      `been underwater for ${summary.daysUnderwater} days since the high of ${summary.lastHighAt}. ` +
      `The deepest fall in the period was ${drawdownValue(summary.maxDrawdown, summary.maxDrawdownAbs, units)} ` +
      `on ${summary.maxDrawdownAt} and the time average ` +
      `${drawdownValue(summary.averageDrawdown, summary.averageDrawdownAbs, units)}. ` +
      `The curve returns to exactly zero at each of the ${this.newHighs()} new highs.`
    );
  });

  /** Plot the field the toggle asks for; both are on the same point already. */
  private pick(percent: number, abs: number): number {
    return this.units() === 'abs' ? abs : percent;
  }
}
