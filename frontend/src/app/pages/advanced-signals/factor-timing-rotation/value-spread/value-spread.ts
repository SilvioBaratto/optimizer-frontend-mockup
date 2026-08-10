import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EXTRAPOLATION_CHECK_RULE,
  EXTRAPOLATION_CHECK_TITLE,
  GUARDRAIL_BANNER_ID,
  GUARDRAIL_REFERENCE_LABEL,
  NO_EXTREME_NOTE,
  VALUE_SPREAD_BAND_ICON,
  VALUE_SPREAD_BAND_LABEL,
  VALUE_SPREAD_BAND_SD,
  VALUE_SPREAD_BASE_YEAR,
  VALUE_SPREAD_METRIC_NOTE,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { BulletChartComponent } from '../../../../shared/charts';
import type { BulletRow, ValueFormatter } from '../../../../shared/charts';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { bandCaption, valueSpreadLabel } from '../factor-timing-format';

const CHART_HEIGHT = 240;

const BAND_TONE: Record<string, StatusTone> = {
  cheap: 'ok',
  ordinary: 'neutral',
  elevated: 'warn',
};

/**
 * Region 3 — the value spread.
 *
 * Each factor sits on its own historical band, the 1968 mean at the centre and
 * two standard deviations either side, drawn as a marker rather than a filled
 * bar: the reading is a *position on a band*, and a bar growing from the floor
 * would read as a magnitude.
 *
 * Two things this card is answerable for.
 *
 * **The measure is not unique.** Switching the toolbar's metric restates every
 * marker here, and can move a factor across a band — quality reads ordinary on
 * a z-score and elevated on price-to-book. The caption says so, because a
 * reader who takes one specification for the answer has taken the doc's central
 * sceptical point backwards.
 *
 * **The extrapolation callout is not written here.** It is generated from the
 * conflicted row of the signal table, out of the same two fields that table's
 * arrows are rendered from, so the callout cannot report a cheap valuation
 * while the table prints a rich one — the doc's own blocking review finding.
 * It points at the guardrail banner **by reference** and deliberately does not
 * repeat its text.
 */
@Component({
  selector: 'app-factor-timing-value-spread',
  imports: [BulletChartComponent, StatusBadge],
  templateUrl: './value-spread.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValueSpread {
  private readonly service = inject(FactorTimingService);

  protected readonly height = CHART_HEIGHT;
  protected readonly bandSd = VALUE_SPREAD_BAND_SD;
  protected readonly baseYear = VALUE_SPREAD_BASE_YEAR;
  protected readonly metricNote = VALUE_SPREAD_METRIC_NOTE;
  protected readonly noExtremeNote = NO_EXTREME_NOTE;
  protected readonly checkTitle = EXTRAPOLATION_CHECK_TITLE;
  protected readonly checkRule = EXTRAPOLATION_CHECK_RULE;
  protected readonly bannerId = GUARDRAIL_BANNER_ID;
  protected readonly bannerReference = GUARDRAIL_REFERENCE_LABEL;

  protected readonly metricLabel = this.service.metricLabel;
  protected readonly readings = this.service.valueSpread;
  protected readonly omissions = this.service.valueSpreadOmissions;
  protected readonly anyExtreme = this.service.anyExtreme;
  protected readonly check = this.service.extrapolationCheck;

  protected readonly caption = computed(() =>
    bandCaption(this.service.valueSpreadMetric(), VALUE_SPREAD_BAND_SD),
  );

  /**
   * One marker per factor, positioned in standard deviations.
   *
   * The track is the same ±2 SD for every row on purpose: the point of the
   * panel is that no factor is near an extreme, and a per-row axis would hide
   * exactly that by rescaling each band to its own reading.
   */
  protected readonly rows = computed<readonly BulletRow[]>(() =>
    this.readings().map((reading) => ({
      label: `${reading.portfolio} · ${reading.label}`,
      value: reading.zScore,
      min: -VALUE_SPREAD_BAND_SD,
      max: VALUE_SPREAD_BAND_SD,
      // Text, never colour alone: the band's word travels with the marker.
      status: VALUE_SPREAD_BAND_LABEL[reading.band],
    })),
  );

  protected readonly badges = computed(() =>
    this.readings().map((reading) => ({
      factor: reading.factor,
      label: `${reading.portfolio} · ${reading.label}`,
      reading: valueSpreadLabel(reading),
      band: VALUE_SPREAD_BAND_LABEL[reading.band],
      icon: VALUE_SPREAD_BAND_ICON[reading.band],
      tone: BAND_TONE[reading.band],
    })),
  );

  /** `−0.62` on the axis — the marker's position is always in SD. */
  protected readonly markerLabel: ValueFormatter = (value) =>
    `${value > 0 ? '+' : ''}${value.toFixed(2).replace('-', '−')} SD`;

  protected readonly ariaLabel = computed(() => {
    const readings = this.readings()
      .map(
        (reading) =>
          `${reading.portfolio} ${valueSpreadLabel(reading)}, ${VALUE_SPREAD_BAND_LABEL[reading.band]}`,
      )
      .join('; ');
    const extreme = this.anyExtreme()
      ? 'At least one factor sits beyond two standard deviations.'
      : `${NO_EXTREME_NOTE}: every reading is inside ±${VALUE_SPREAD_BAND_SD} standard deviations.`;
    return `Position of each factor on its own valuation band since ${VALUE_SPREAD_BASE_YEAR}, measured with ${this.metricLabel()}: ${readings}. ${extreme}`;
  });

  /**
   * Takes the reader to the guardrail notice this callout refers to.
   *
   * The reference has to move focus, not only the viewport: the notice is eight
   * regions further down, and a reader who is scrolled there without their
   * place following would Tab back into the value spread. The anchor carries a
   * programmatic `tabindex`, so it accepts focus without joining the tab order.
   *
   * Guarded on the methods existing so a non-browser environment is not asked
   * to scroll, and it honours `prefers-reduced-motion`.
   */
  protected showGuardrailNotice(): void {
    const target = document.getElementById(GUARDRAIL_BANNER_ID);
    if (!(target instanceof HTMLElement)) return;
    if (typeof target.scrollIntoView === 'function') {
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    target.focus({ preventScroll: true });
  }
}
