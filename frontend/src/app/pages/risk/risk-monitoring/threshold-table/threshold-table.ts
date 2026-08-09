import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import {
  CAPITAL_BASE_LABEL,
  DRAWDOWN_MEASURE_DEFINITION,
  LIMITS_READ_ONLY_NOTE,
  THRESHOLD_STATUS_LABEL,
  THRESHOLD_STATUS_TONE,
  type DrawdownMeasureId,
  type DrawdownThresholdRow,
} from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { drawdownValue, percent1, utilisationLabel } from '../monitoring-format';

/** Where `ν` and the warning band are set. This page reads them. */
const LIMITS_ROUTE = '/approvals/guardrail-killswitch';

/**
 * Region 6 — the three drawdown measures against their configured limits.
 *
 * Hand-rolled per the build conventions: `<th scope="col">` on the headers,
 * `<th scope="row">` on the measure, numbers right-aligned and tabular, and a
 * status that is always a word beside its colour.
 *
 * Two things this table is not allowed to do:
 *
 * - It does not decide a badge. `status` arrives on the row, computed from the
 *   utilisation printed beside it, so the table cannot show a green tick
 *   against a figure over its limit.
 * - It does not edit a limit. `ν` and the warning band are configured on the
 *   guardrail page and the footnote says so, with the way there.
 *
 * The CDaR row is the one that moves with the slider above; it names the α it
 * was read at, so a reader who scrolls past the chart still knows which member
 * of the family the row is reporting.
 */
@Component({
  selector: 'app-risk-monitoring-threshold-table',
  imports: [CrossPageLink, StatusBadge],
  templateUrl: './threshold-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThresholdTable {
  private readonly service = inject(RiskMonitoringService);

  /** The row another region is pointing at, or the one just activated here. */
  readonly selected = input<DrawdownMeasureId | null>(null);

  readonly measureSelected = output<DrawdownMeasureId>();

  protected readonly rows = this.service.thresholds;
  protected readonly units = this.service.drawdownUnits;

  protected readonly limitsNote = LIMITS_READ_ONLY_NOTE;
  protected readonly limitsRoute = LIMITS_ROUTE;
  /** `C` — what the money column's limits are fractions of. */
  protected readonly capitalBase = CAPITAL_BASE_LABEL;
  protected readonly statusLabel = THRESHOLD_STATUS_LABEL;
  protected readonly statusTone = THRESHOLD_STATUS_TONE;
  protected readonly definitions = DRAWDOWN_MEASURE_DEFINITION;

  protected current(row: DrawdownThresholdRow): string {
    return drawdownValue(row.current, row.currentAbs, this.units());
  }

  protected limit(row: DrawdownThresholdRow): string {
    return drawdownValue(row.limit, row.limitAbs, this.units());
  }

  /** A ratio of two figures on the same base — the same number in either unit. */
  protected utilisation(row: DrawdownThresholdRow): string {
    return utilisationLabel(row.utilisation);
  }

  /** The band this row turns Warning at, spelled out beside its status. */
  protected warningBand(row: DrawdownThresholdRow): string {
    return `warns at ${percent1(row.warnAt * 100)} of the limit`;
  }

  protected select(row: DrawdownThresholdRow): void {
    this.measureSelected.emit(row.measure);
  }
}
