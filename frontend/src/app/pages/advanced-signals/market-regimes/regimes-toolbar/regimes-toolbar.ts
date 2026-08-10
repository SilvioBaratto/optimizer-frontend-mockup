import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  MARKET_REGIME_MODELS,
  MARKET_REGIME_MODEL_DEFINITION,
  MARKET_REGIME_MODEL_LABEL,
  PROBABILITY_BASES,
  PROBABILITY_BASIS_DEFINITION,
  PROBABILITY_BASIS_LABEL,
  type MarketRegimeModelId,
  type ProbabilityBasis,
  type RegimeUniverseId,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { PageContextBar } from '../../../../shared/page-context-bar/page-context-bar';
import { RefreshControl } from '../../../../shared/refresh-control/refresh-control';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/** Why every control is inert while the recursive filter is being re-run. */
const BUSY_REASON = 'Unavailable while the filter is being re-estimated.';

/**
 * Region 1 — the toolbar.
 *
 * Five controls and a stamp, and the order they are read in is the order of
 * what each one costs:
 *
 * - the regime model and the universe re-fit the filter, so they recompose the
 *   hero card, the probability path and the statistics table;
 * - the sample window changes the data the likelihood is maximised over;
 * - Filtered / Smoothed is one and the same fitted model read two ways —
 *   `P[s_t | I_t]` against `P[s_t | I_T]` — and is the only control here that
 *   is a display choice rather than an estimation choice. It still costs a run,
 *   because the smoother is a second pass over the same sample.
 *
 * None of that is decided here; the service's setters carry it. What this
 * region owns is that an out-of-order sample window is refused *before* it can
 * queue a run: `da` must precede `a`, and a window that does not is an empty
 * combination rather than a failed estimate.
 *
 * While a run is in flight the controls stay in place and stop accepting
 * input, per the spec's loading state — a control that vanishes takes the
 * reader's place in the tab order with it.
 */
@Component({
  selector: 'app-market-regimes-toolbar',
  imports: [PageContextBar, RefreshControl, SegmentedControl, SelectDirective],
  templateUrl: './regimes-toolbar.html',
  // `contents`, not `block`: the only child is an app-page-context-bar, which
  // sticks to the top of the scroll column. A wrapper with a box of its own —
  // exactly as tall as the bar — re-creates the containing block and leaves
  // `position: sticky` nowhere to slide, so it silently does nothing.
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimesToolbar {
  private readonly service = inject(MarketRegimesService);

  protected readonly models = MARKET_REGIME_MODELS;
  protected readonly modelLabel = MARKET_REGIME_MODEL_LABEL;
  protected readonly modelDefinition = MARKET_REGIME_MODEL_DEFINITION;
  protected readonly basisDefinition = PROBABILITY_BASIS_DEFINITION;

  protected readonly universes = this.service.universes;
  protected readonly months = this.service.sampleMonthOptions;

  protected readonly model = this.service.model;
  protected readonly universeId = this.service.universeId;
  protected readonly universe = this.service.universe;
  protected readonly sampleFrom = this.service.sampleFrom;
  protected readonly sampleTo = this.service.sampleTo;
  protected readonly windowError = this.service.sampleWindowError;
  protected readonly lastUpdated = this.service.lastUpdated;

  /** A run is in flight: the controls are shown, and refuse input. */
  protected readonly busy = computed(() => this.service.state() === 'loading');

  /** Typed as the union, not as `string`: the two definition maps are keyed by it. */
  protected readonly basisValue = this.service.probabilityBasis;

  protected readonly basisOptions = computed<readonly SegmentedOption[]>(() => {
    const busy = this.busy();
    return PROBABILITY_BASES.map((basis) => ({
      value: basis,
      label: PROBABILITY_BASIS_LABEL[basis],
      disabled: busy,
      disabledReason: busy ? BUSY_REASON : undefined,
    }));
  });

  /**
   * How many months the filter actually has, once the universe's own first
   * observation is taken into account.
   *
   * A universe added last year cannot be estimated over a window that starts in
   * 1990 just because the window says so, and the difference between the window
   * asked for and the sample obtained is exactly what makes the empty state
   * reachable.
   */
  protected readonly effectiveFrom = this.service.effectiveSampleFrom;
  protected readonly effectiveMonths = this.service.effectiveSampleMonths;

  protected readonly sampleNote = computed(() => {
    const requested = this.sampleFrom();
    const effective = this.effectiveFrom();
    const months = this.effectiveMonths();
    if (effective === requested) return `${months} months in the estimation sample.`;
    return `${months} months in the estimation sample — the universe's first observation is ${effective}.`;
  });

  /**
   * Each handler refuses the change while a run is in flight and restores the
   * value the service still holds.
   *
   * This is what makes `aria-disabled` enough on a native select: the control
   * keeps its place in the tab order — so the reader who just used it keeps
   * their focus — and the refusal happens here rather than by removing the
   * element from the document.
   */
  protected onModel(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.busy()) {
      select.value = this.model();
      return;
    }
    this.service.setModel(select.value as MarketRegimeModelId);
  }

  protected onUniverse(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.busy()) {
      select.value = this.universeId();
      return;
    }
    this.service.setUniverse(select.value as RegimeUniverseId);
  }

  protected onBasis(value: string): void {
    if (this.busy()) return;
    this.service.setProbabilityBasis(value as ProbabilityBasis);
  }

  protected onSampleFrom(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.busy()) {
      select.value = this.sampleFrom();
      return;
    }
    this.service.setSampleFrom(select.value);
  }

  protected onSampleTo(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.busy()) {
      select.value = this.sampleTo();
      return;
    }
    this.service.setSampleTo(select.value);
  }

  protected onRefresh(): void {
    void this.service.refresh();
  }
}
