import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CONFIDENCE_LABEL,
  CONFIDENCE_LEVELS,
  DRAWDOWN_UNITS,
  DRAWDOWN_UNITS_LABEL,
  HOLDING_PERIODS,
  HOLDING_PERIOD_LABEL,
  LOOKBACK_LABEL,
  LOOKBACK_WINDOWS,
  VAR_METHODS,
  VAR_METHOD_LABEL,
  type ConfidenceLevel,
  type DrawdownUnits,
  type HoldingPeriod,
  type LookbackWindow,
  type VarMethod,
} from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { PageContextBar } from '../../../../shared/page-context-bar/page-context-bar';
import { RefreshControl } from '../../../../shared/refresh-control/refresh-control';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/** Why every control is inert while a calculation is in flight. */
const BUSY_REASON = 'Unavailable while the risk measures are being recomputed.';

/**
 * Region 1 — the toolbar.
 *
 * Six controls that do three different things, and the difference is the point
 * of the region:
 *
 * - Confidence, method and holding period say *which* loss distribution is being
 *   read. Changing one is a calculation, so the page loads.
 * - The lookback window is the extent of one chart and slices a series that has
 *   already been computed.
 * - The drawdown units are presentation: both readings are already on every
 *   figure, so the toggle only chooses which field is printed.
 *
 * None of that is decided here — the service's setters carry it — but the
 * controls are laid out in that order so the reading order matches the cost.
 *
 * While a calculation runs every control is disabled rather than removed: the
 * spec asks for the toolbar to stay in place and stop accepting input, and a
 * control that vanishes takes the reader's place in the tab order with it.
 */
@Component({
  selector: 'app-risk-monitoring-toolbar',
  imports: [PageContextBar, RefreshControl, SegmentedControl, SelectDirective],
  templateUrl: './monitoring-toolbar.html',
  // `contents`, not `block`: this component's only child is an
  // app-page-context-bar, which sticks to the top of the scroll column. A
  // sticky box is constrained by its containing block, so a wrapper with a box
  // of its own — exactly as tall as the bar — leaves it nowhere to slide and
  // the stickiness silently does nothing. Measured with `block`: scrolling
  // 800px took the bar to top -620. With `contents` the wrapper generates no
  // box and the bar sticks at 0.
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonitoringToolbar {
  private readonly service = inject(RiskMonitoringService);

  protected readonly holdingPeriods = HOLDING_PERIODS;
  protected readonly holdingPeriodLabel = HOLDING_PERIOD_LABEL;
  protected readonly lookbackWindows = LOOKBACK_WINDOWS;
  protected readonly lookbackLabel = LOOKBACK_LABEL;

  protected readonly asOf = this.service.asOf;
  protected readonly holdingPeriod = this.service.holdingPeriodDays;
  protected readonly lookback = this.service.lookback;

  /** A recompute is in flight: the controls are shown, and refuse input. */
  protected readonly busy = computed(() => this.service.state() === 'loading');

  /** `SegmentedControl` speaks strings; β is a number. */
  protected readonly confidenceValue = computed(() => String(this.service.confidence()));
  protected readonly methodValue = computed<string>(() => this.service.method());
  protected readonly unitsValue = computed<string>(() => this.service.drawdownUnits());

  protected readonly confidenceOptions = computed<readonly SegmentedOption[]>(() =>
    CONFIDENCE_LEVELS.map((level) => this.option(String(level), CONFIDENCE_LABEL[level])),
  );

  protected readonly methodOptions = computed<readonly SegmentedOption[]>(() =>
    VAR_METHODS.map((method) => this.option(method, VAR_METHOD_LABEL[method])),
  );

  protected readonly unitsOptions = computed<readonly SegmentedOption[]>(() =>
    DRAWDOWN_UNITS.map((units) => this.option(units, DRAWDOWN_UNITS_LABEL[units])),
  );

  /** Disabled options keep their reason with them, per the shared control. */
  private option(value: string, label: string): SegmentedOption {
    const busy = this.busy();
    return { value, label, disabled: busy, disabledReason: busy ? BUSY_REASON : undefined };
  }

  protected onConfidence(value: string): void {
    this.service.setConfidence(Number(value) as ConfidenceLevel);
  }

  protected onMethod(value: string): void {
    this.service.setMethod(value as VarMethod);
  }

  protected onUnits(value: string): void {
    this.service.setDrawdownUnits(value as DrawdownUnits);
  }

  protected onHoldingPeriod(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value) as HoldingPeriod;
    this.service.setHoldingPeriod(value);
  }

  protected onLookback(event: Event): void {
    this.service.setLookback((event.target as HTMLSelectElement).value as LookbackWindow);
  }

  protected onRefresh(): void {
    void this.service.refresh();
  }
}
