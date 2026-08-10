import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  CDAR_ALPHA_MAX,
  CDAR_ALPHA_MIN,
  CDAR_ALPHA_STEP,
  CDAR_ENDPOINTS_NOTE,
} from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { alphaLabel, deltaLabel, drawdownValue, moneyM, percent1 } from '../monitoring-format';

/** A page up/down jump, in slider steps. */
const PAGE_STEPS = 10;

/**
 * Region 5 — the CDaR family `Δ_α(x)`, with the slider that reads it.
 *
 * The curve is the region's whole point: `Δ_α` is not a third measure beside
 * MaxDD and AvDD but the family that interpolates them, so the two ends are
 * labelled as what they are — `Δ₀(x) = AvDD` and `Δ₁(x) = MaxDD` — and the
 * slider can reach both exactly, with Home and End, because that identity is
 * only visible at the endpoints.
 *
 * The slider is a real `<input type="range">`, and it handles its own arrow,
 * Home, End and Page keys rather than leaving them to the platform. Two
 * reasons: α is clamped and rounded to the step, so `End` has to land on
 * exactly 1 rather than on whatever the browser's own rounding produces; and
 * `aria-valuetext` has to be re-read as the value moves, which means the value
 * has to move through the same path a drag does.
 *
 * Moving it changes three things and no others: this readout, the marker on the
 * curve, and the CDaR row of the threshold table. All three read one `computed`
 * in the service, so there is no version of the page on which they disagree,
 * and none of them is a calculation — the curve was sampled once.
 */
@Component({
  selector: 'app-risk-monitoring-cdar-curve',
  imports: [LineChartComponent],
  templateUrl: './cdar-curve.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CdarCurve {
  private readonly service = inject(RiskMonitoringService);

  /** A caption another region asked for, when it points at this figure. */
  readonly highlight = input<string | null>(null);

  protected readonly min = CDAR_ALPHA_MIN;
  protected readonly max = CDAR_ALPHA_MAX;
  protected readonly step = CDAR_ALPHA_STEP;
  protected readonly endpointsNote = CDAR_ENDPOINTS_NOTE;

  protected readonly alpha = this.service.cdarAlpha;
  private readonly units = this.service.drawdownUnits;

  protected readonly formatter = computed<ValueFormatter>(() =>
    this.units() === 'abs' ? moneyM : percent1,
  );

  protected readonly alphaText = computed(() => alphaLabel(this.alpha()));

  /** `Δ_0.95(x)` in the units currently selected. */
  protected readonly value = computed(() =>
    drawdownValue(this.service.cdarValue(), this.service.cdarValueAbs(), this.units()),
  );

  protected readonly readout = computed(() => `${deltaLabel(this.alpha())} = ${this.value()}`);

  /** What a screen reader hears as the handle moves: `α = 0.95, Δ = 9.8%`. */
  protected readonly valueText = computed(() => `α = ${this.alphaText()}, Δ = ${this.value()}`);

  protected readonly alphas = computed(() =>
    this.service.cdarCurve().map((point) => alphaLabel(point.alpha)),
  );

  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const abs = this.units() === 'abs';
    return [
      {
        name: 'Δ_α(x)',
        data: this.service.cdarCurve().map((point) => (abs ? point.valueAbs : point.value)),
      },
    ];
  });

  /**
   * The two ends and the level being read.
   *
   * At an end the marker and the endpoint are the same point, so the label
   * carries both readings rather than drawing two dots on one coordinate —
   * which is exactly where the identity is worth stating.
   */
  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const curve = this.service.cdarCurve();
    const first = curve[0];
    const last = curve[curve.length - 1];
    if (!first || !last) return [];

    const format = this.formatter();
    const alpha = this.alpha();
    const marker = this.service.cdarValue();
    const abs = this.units() === 'abs';
    const at = (value: number, valueAbs: number) => format(abs ? valueAbs : value);

    const suffix = alpha <= this.min ? ' = AvDD' : alpha >= this.max ? ' = MaxDD' : '';
    const points: RefPoint[] = [
      {
        x: this.alphaText(),
        y: abs ? this.service.cdarValueAbs() : marker,
        label: `${this.readout()}${suffix}`,
      },
    ];

    if (alpha > this.min) {
      points.unshift({
        x: alphaLabel(first.alpha),
        y: abs ? first.valueAbs : first.value,
        label: `Δ₀ = AvDD ${at(first.value, first.valueAbs)}`,
      });
    }
    if (alpha < this.max) {
      points.push({
        x: alphaLabel(last.alpha),
        y: abs ? last.valueAbs : last.value,
        label: `Δ₁ = MaxDD ${at(last.value, last.valueAbs)}`,
      });
    }
    return points;
  });

  protected readonly ariaLabel = computed(() => {
    const curve = this.service.cdarCurve();
    const first = curve[0];
    const last = curve[curve.length - 1];
    if (!first || !last) return 'Conditional drawdown at risk: no curve available.';

    const abs = this.units() === 'abs';
    const format = this.formatter();

    return (
      `Conditional drawdown at risk from α = 0 to α = 1, in ${curve.length} samples, ` +
      `non-decreasing throughout. Δ₀ is ${format(abs ? first.valueAbs : first.value)}, the average ` +
      `drawdown, and Δ₁ is ${format(abs ? last.valueAbs : last.value)}, the maximum drawdown. ` +
      `At the selected α = ${this.alphaText()} the reading is ${this.value()}.`
    );
  });

  protected onInput(event: Event): void {
    this.setAlpha(Number((event.target as HTMLInputElement).value));
  }

  /**
   * Arrows step, Page jumps, Home and End reach the ends exactly.
   *
   * `preventDefault` on exactly the keys handled here: the browser would
   * otherwise apply its own step on top of this one and the handle would move
   * twice per press. A modified arrow is somebody else's chord and is left
   * alone.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const current = this.alpha();
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
    this.setAlpha(next);
  }

  /**
   * Rounded to the step before the service clamps it.
   *
   * Repeated `+= 0.01` in binary drifts — `0.9500000000000001` would print as a
   * category the curve does not have and the marker would fall off the line.
   */
  private setAlpha(value: number): void {
    if (Number.isNaN(value)) return;
    this.service.setCdarAlpha(Math.round(value * 100) / 100);
  }
}
