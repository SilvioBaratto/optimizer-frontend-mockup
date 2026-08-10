import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  MISSING_IR_DETAIL,
  MISSING_IR_LABEL,
  NO_RECOMMENDATION_NOTE,
  RECOMMENDATION_ANSWER,
  RECOMMENDATION_PROMPT,
  UTILITY_GAIN_NOTE,
  UTILITY_GAIN_TITLE,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { BarChartComponent, chartTokens, seriesColor } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { ratio2, signedGain } from '../factor-timing-format';

/** What an axis-triggered tooltip callback is handed, narrowed to what is read. */
interface TooltipParam {
  readonly dataIndex: number;
}

const CHART_HEIGHT = 220;

/**
 * The extent of the hatched "not measured" marker, and the top of the axis.
 *
 * It is **not** a value. `barLabel` prints it as the words "not measured" and
 * the hatch says the rest: a bar with a fill would be a claim about a magnitude
 * nobody reported. Deliberately unequal to any measured ratio (0.42, 0.59,
 * 0.60), so nothing real can collide with the sentinel.
 */
const NOT_MEASURED_EXTENT = 0.75;

/**
 * Region 6 — the timing comparison.
 *
 * The panel's whole reason for care is one row. **Market timing has no
 * out-of-sample information ratio in the evidence at all.** It is drawn as a
 * hatched marker, labelled "not measured", and never as a bar of length zero —
 * a zero-length bar would say the ratio was measured and came out at nothing,
 * which is a claim nobody made. Doc 22's Size Premium panel needs exactly the
 * same distinction and solves it the same way.
 *
 * Factor investing is off the value axis for a second, different reason: the
 * information ratio is measured *against* it, so it has no ratio of its own.
 * Drawing it as a bar would have made "baseline" and "not measured" look like
 * one kind of absence, and they are two.
 *
 * The expected-utility gain is a **different measure**. It lives in its own
 * box, with its own heading and a dashed border, and it shares no axis with the
 * ratios — 1.26 next to 0.60 on one scale would invite a comparison that has no
 * meaning.
 *
 * Nothing is highlighted as recommended. The reading of the evidence exists,
 * but behind a disclosure the reader has to open: the doc is explicit that no
 * variant is marked recommended without an explicit request, and a bar drawn in
 * an accent colour is a recommendation whatever the caption says.
 */
@Component({
  selector: 'app-factor-timing-comparison',
  imports: [BarChartComponent],
  templateUrl: './timing-comparison.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimingComparison {
  private readonly service = inject(FactorTimingService);

  protected readonly height = CHART_HEIGHT;
  protected readonly axisMax = NOT_MEASURED_EXTENT;
  protected readonly missingLabel = MISSING_IR_LABEL;
  protected readonly missingDetail = MISSING_IR_DETAIL;
  protected readonly utilityTitle = UTILITY_GAIN_TITLE;
  protected readonly utilityNote = UTILITY_GAIN_NOTE;
  protected readonly noRecommendation = NO_RECOMMENDATION_NOTE;
  protected readonly recommendationPrompt = RECOMMENDATION_PROMPT;
  protected readonly recommendationAnswer = RECOMMENDATION_ANSWER;

  protected readonly gains = this.service.utilityGains;
  protected readonly gainRange = this.service.utilityGainRange;
  protected readonly gainLabel = signedGain;

  /** Opened only on request — nothing is marked recommended by default. */
  protected readonly readingOpen = signal(false);

  private readonly variants = this.service.timingVariants;

  /** The baseline is stated, never plotted: it is what the axis is measured from. */
  protected readonly baseline = computed(() =>
    this.variants().find((row) => row.missingReason === 'baseline'),
  );

  protected readonly plotted = computed(() =>
    this.variants().filter((row) => row.missingReason !== 'baseline'),
  );

  protected readonly unmeasured = computed(() =>
    this.plotted().filter((row) => row.missingReason === 'not-reported'),
  );

  protected readonly categories = computed(() => this.plotted().map((row) => row.label));

  /**
   * Two series that never overlap: the measured ratios, and the marker for the
   * variant that has none. Every category carries a value in exactly one of
   * them, so the chart reads as one bar per variant with one of them hatched.
   */
  protected readonly series = computed<readonly CategorySeries[]>(() => {
    const rows = this.plotted();
    return [
      {
        name: 'Information ratio, out of sample',
        data: rows.map((row) => row.informationRatio),
        color: seriesColor(0),
      },
      {
        name: 'Not measured',
        data: rows.map((row) => (row.informationRatio === null ? NOT_MEASURED_EXTENT : null)),
        pattern: true,
      },
    ];
  });

  /**
   * `0.42` — and the words for the sentinel.
   *
   * The hatched marker's extent is a drawing device, so it must never be
   * readable as a number, on the chart or in the panel's tabular alternative.
   */
  protected readonly barLabel: ValueFormatter = (value) =>
    value === NOT_MEASURED_EXTENT ? MISSING_IR_LABEL['not-reported'] : ratio2(value);

  /**
   * The tooltip, written out rather than left to the default.
   *
   * The stock axis tooltip reads the raw data, and the raw data is not what
   * this panel is claiming. A `null` bar is drawn at the axis origin, so the
   * default prints `Information ratio, out of sample 0` for market timing —
   * exactly the zero the panel exists to avoid — and the hatched marker's
   * extent leaks as `Not measured 0.75`, a number nobody reported. Measured in
   * a browser before this patch existed; both strings were on screen.
   *
   * `optionPatch` is merged over the built option as a whole key, so the
   * surface, border and confinement of `baseTooltip` are restated here to keep
   * the frame identical to every other chart's.
   */
  protected readonly tooltipPatch = computed(() => {
    const rows = this.plotted();
    const t = chartTokens();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: t.surface,
        borderColor: t.grid,
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: t.text, fontSize: 12 },
        formatter: (params: TooltipParam | readonly TooltipParam[]) => {
          const first = Array.isArray(params) ? params[0] : (params as TooltipParam);
          const row = rows[first?.dataIndex ?? -1];
          if (row === undefined) return '';
          return row.informationRatio === null
            ? `${row.label}<br/>${MISSING_IR_LABEL['not-reported']} — no out-of-sample information ratio is reported for it.`
            : `${row.label}<br/>Information ratio, out of sample ${ratio2(row.informationRatio)}`;
        },
      },
    };
  });

  protected readonly definitions = computed(() => this.variants());

  protected readonly ariaLabel = computed(() => {
    const measured = this.plotted()
      .filter((row) => row.informationRatio !== null)
      .map((row) => `${row.label} ${ratio2(row.informationRatio as number)}`)
      .join(', ');
    const absent = this.unmeasured()
      .map(
        (row) =>
          `${row.label} has no reported out-of-sample information ratio and is drawn as a hatched marker, not as a zero`,
      )
      .join('; ');
    const baseline = this.baseline();
    return (
      `Out-of-sample information ratio by timing variant, measured against ${baseline?.label ?? 'the baseline'}, ` +
      `which therefore has no bar of its own: ${measured}. ${absent}.`
    );
  });

  protected toggleReading(): void {
    this.readingOpen.update((open) => !open);
  }
}
