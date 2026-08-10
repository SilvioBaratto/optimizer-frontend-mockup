import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FACTORS,
  MOMENTUM_LOOKBACKS,
  MOMENTUM_LOOKBACK_LABEL,
  REBALANCING_FREQUENCIES,
  REBALANCING_FREQUENCY_LABEL,
  STALE_SIGNALS_BADGE,
  TIMING_MODELS,
  TIMING_MODEL_DEFINITION,
  TIMING_MODEL_LABEL,
  VALUE_SPREAD_METRICS,
  VALUE_SPREAD_METRIC_DEFINITION,
  VALUE_SPREAD_METRIC_LABEL,
  VALUE_SPREAD_METRIC_NOTE,
  WEIGHTING_MODE_DEFINITION,
  WEIGHTING_MODE_LABEL,
  WML_WEIGHTINGS,
  type FactorId,
  type MomentumLookback,
  type RebalancingFrequency,
  type TimingModelId,
  type ValueSpreadMetric,
  type WmlWeighting,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import { PageContextBar } from '../../../../shared/page-context-bar/page-context-bar';
import { RefreshControl } from '../../../../shared/refresh-control/refresh-control';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';

/** Why every control is inert while the signals are being recomputed. */
const BUSY_REASON = 'Unavailable while the signals are being recomputed.';

/**
 * Region 1 — the toolbar.
 *
 * Six controls and a stamp, and the order they are read in is the order of what
 * each one reaches:
 *
 * - the market-state lookback is not this page's signal at all. It writes
 *   `MarketRegimesService`, because the UP/DOWN state shown below is that
 *   service's estimate and a private copy here would be free to disagree with
 *   the Macro & Regimes Agent about the same market;
 * - the rebalancing frequency changes what "recent enough" means, and picking
 *   an interval shorter than the one the signals were estimated over is exactly
 *   what makes them stale;
 * - the weighting mode is how hard the tilt is applied, capped by the
 *   breadth guardrail;
 * - the timing model decides which of the five predictor categories count;
 * - the value-spread metric restates every valuation reading on the page, and
 *   the doc's sceptical thread turns on the fact that it can move a factor
 *   across a band;
 * - the factor chips choose the cross-section, and refuse to empty it.
 *
 * Every one of the five groups is a real radiogroup rather than a row of toggle
 * buttons: `app-segmented-control` carries the roving tabindex, the arrow keys
 * and `aria-checked`.
 *
 * While a run is in flight the controls stay in place and stop accepting input,
 * per the spec's loading state — a control that vanishes takes the reader's
 * place in the tab order with it. Refresh stays live, since it is the thing
 * that ends the run.
 */
@Component({
  selector: 'app-factor-timing-toolbar',
  imports: [FilterChipBar, PageContextBar, RefreshControl, SegmentedControl, StatusBadge],
  templateUrl: './factor-timing-toolbar.html',
  // `contents`, not `block`: the only child is an app-page-context-bar, which
  // sticks to the top of the scroll column. A wrapper with a box of its own —
  // exactly as tall as the bar — re-creates the containing block and leaves
  // `position: sticky` nowhere to slide, so it silently does nothing.
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactorTimingToolbar {
  private readonly service = inject(FactorTimingService);

  protected readonly staleBadge = STALE_SIGNALS_BADGE;
  protected readonly busyReason = BUSY_REASON;
  protected readonly metricNote = VALUE_SPREAD_METRIC_NOTE;
  protected readonly modelDefinition = TIMING_MODEL_DEFINITION;
  protected readonly weightingDefinition = WEIGHTING_MODE_DEFINITION;
  protected readonly metricDefinition = VALUE_SPREAD_METRIC_DEFINITION;
  protected readonly factorDefinitions = FACTORS;

  protected readonly lookback = this.service.lookback;
  protected readonly rebalancing = this.service.rebalancing;
  protected readonly weighting = this.service.weighting;
  protected readonly timingModel = this.service.timingModel;
  protected readonly metric = this.service.valueSpreadMetric;
  protected readonly factorsInView = this.service.factorsInView;
  protected readonly selectionError = this.service.selectionError;
  protected readonly lastComputed = this.service.lastComputed;
  protected readonly stale = this.service.staleSignals;
  protected readonly staleDetail = this.service.staleDetail;

  /** A run is in flight: the controls are shown, and refuse input. */
  protected readonly busy = computed(() => this.service.state() === 'loading');

  /**
   * Builds one group's options.
   *
   * `value` is stringified because a radiogroup's value is a string and the
   * lookback's is a number; the setter narrows it back on the way in, so the
   * union never leaves the service.
   */
  private options<T extends string | number>(
    values: readonly T[],
    label: (value: T) => string,
  ): readonly SegmentedOption[] {
    const busy = this.busy();
    return values.map((value) => ({
      value: String(value),
      label: label(value),
      disabled: busy,
      disabledReason: busy ? BUSY_REASON : undefined,
    }));
  }

  protected readonly lookbackOptions = computed(() =>
    this.options(MOMENTUM_LOOKBACKS, (value) => `${value}m`),
  );

  protected readonly rebalancingOptions = computed(() =>
    this.options(REBALANCING_FREQUENCIES, (value) => REBALANCING_FREQUENCY_LABEL[value]),
  );

  protected readonly weightingOptions = computed(() =>
    this.options(WML_WEIGHTINGS, (value) => WEIGHTING_MODE_LABEL[value]),
  );

  protected readonly timingModelOptions = computed(() =>
    this.options(TIMING_MODELS, (value) => TIMING_MODEL_LABEL[value]),
  );

  protected readonly metricOptions = computed(() =>
    this.options(VALUE_SPREAD_METRICS, (value) => VALUE_SPREAD_METRIC_LABEL[value]),
  );

  /** The lookback's own value has to be a string for the radiogroup. */
  protected readonly lookbackValue = computed(() => String(this.lookback()));

  protected readonly lookbackNote = computed(
    () =>
      `${MOMENTUM_LOOKBACK_LABEL[this.lookback()]} of cumulative market return — the shared regime engine's own window, not a second one.`,
  );

  protected readonly factorChips = computed(() => {
    const inView = this.factorsInView();
    return this.service.factors.map((id) => ({
      id,
      label: FACTORS[id].label,
      detail: FACTORS[id].detail,
      checked: inView.includes(id),
    }));
  });

  protected readonly factorCount = computed(() => this.factorsInView().length);

  protected onLookback(value: string): void {
    this.service.setLookback(Number(value) as MomentumLookback);
  }

  protected onRebalancing(value: string): void {
    this.service.setRebalancing(value as RebalancingFrequency);
  }

  protected onWeighting(value: string): void {
    this.service.setWeighting(value as WmlWeighting);
  }

  protected onTimingModel(value: string): void {
    this.service.setTimingModel(value as TimingModelId);
  }

  protected onMetric(value: string): void {
    this.service.setValueSpreadMetric(value as ValueSpreadMetric);
  }

  /**
   * The tick follows the model, never the click.
   *
   * The default is always cancelled: the service owns the selection and may
   * refuse the change (it will not let the last factor leave the view), and a
   * checkbox that has already toggled itself cannot be put back — the `checked`
   * binding sees no change to write. Cancelling first means the box only ever
   * moves when the model does.
   */
  protected onFactor(event: Event, id: FactorId): void {
    event.preventDefault();
    if (this.busy()) return;
    this.service.toggleFactor(id);
  }

  protected onRefresh(): void {
    void this.service.refresh();
  }
}
