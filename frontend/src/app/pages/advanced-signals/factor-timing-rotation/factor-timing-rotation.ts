import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';

import {
  EMPTY_ACTION_LABEL,
  EMPTY_COMPARISON_PLACEHOLDER,
  EMPTY_SPREAD_PLACEHOLDER,
  EMPTY_TITLE,
  LOAD_FAILURE_DETAIL,
  UNIVERSE_DATA_ROUTE,
} from '../../../models/factor-timing.model';
import { FactorTimingService } from '../../../services/factor-timing.service';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { ExcessReturnChart } from './excess-return-chart/excess-return-chart';
import { FactorSignalTable } from './factor-signal-table/factor-signal-table';
import { FactorTimingToolbar } from './factor-timing-toolbar/factor-timing-toolbar';
import { GuardrailBanner } from './guardrail-banner/guardrail-banner';
import { RegimeMarketState } from './regime-market-state/regime-market-state';
import { SignalActions } from './signal-actions/signal-actions';
import { TimingComparison } from './timing-comparison/timing-comparison';
import { ValueSpread } from './value-spread/value-spread';

/** Placeholder blocks, one per panel, at the heights they stand in for. */
const SKELETON_PANELS = [
  { id: 'regime', height: 'h-56' },
  { id: 'spread', height: 'h-72' },
  { id: 'cycles', height: 'h-80' },
  { id: 'signals', height: 'h-72' },
  { id: 'comparison', height: 'h-72' },
];

/**
 * `docs/23 Factor Timing & Rotation.md` — the page that asks whether a factor
 * premium can be timed, and answers it without overstating either side.
 *
 * The reading order is the argument. The regime and market state comes first
 * because it is the condition everything below is stated under; the value
 * spread next, because valuation is the one predictor that survives out of
 * sample; then the cycles that make timing conceivable at all; then the
 * cross-section the model actually acts on; then the honest comparison of what
 * timing has been shown to earn; then the guardrails; then the exit.
 *
 * Three constraints run across the regions and are the reason it is laid out
 * this way.
 *
 * **One regime engine.** The state in the first card is
 * `MarketRegimesService`'s — doc 22's estimate, the one the Macro & Regimes
 * Agent reads — and the toolbar's market-state lookback writes that service's
 * own signal. No second regime is declared anywhere on this page.
 *
 * **The valuation of a factor is one number.** The marker on the value-spread
 * band, the arrow in the signal table's Valuation column and the sentence in
 * the extrapolation callout are three renderings of the same field. The doc's
 * blocking review finding was that two of them said opposite things about
 * momentum; deriving all three from one place is what makes that impossible
 * rather than merely fixed.
 *
 * **Absent is never zero.** Market timing has no out-of-sample information
 * ratio and is drawn hatched; a factor without enough history reads
 * "insufficient history" and leaves the composite; the expected-utility gain is
 * a different measure and never touches the information-ratio axis.
 *
 * The shell renders the `<h1>` and the breadcrumb from the route, so the page's
 * own outline starts at `<h2>`.
 */
@Component({
  selector: 'app-factor-timing-rotation',
  imports: [
    CrossPageLink,
    EmptyState,
    ErrorState,
    ExcessReturnChart,
    FactorSignalTable,
    FactorTimingToolbar,
    GuardrailBanner,
    RegimeMarketState,
    SignalActions,
    SkeletonBlock,
    TimingComparison,
    ValueSpread,
  ],
  templateUrl: './factor-timing-rotation.html',
  styleUrl: './factor-timing-rotation.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactorTimingRotation {
  private readonly service = inject(FactorTimingService);

  protected readonly skeletonPanels = SKELETON_PANELS;
  protected readonly emptyTitle = EMPTY_TITLE;
  protected readonly emptyActionLabel = EMPTY_ACTION_LABEL;
  protected readonly universeRoute = UNIVERSE_DATA_ROUTE;
  protected readonly loadFailureDetail = LOAD_FAILURE_DETAIL;
  protected readonly spreadPlaceholder = EMPTY_SPREAD_PLACEHOLDER;
  protected readonly comparisonPlaceholder = EMPTY_COMPARISON_PLACEHOLDER;

  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  protected readonly state = this.service.state;
  protected readonly emptyDetail = this.service.emptyDetail;
  protected readonly loadFailure = this.service.loadFailure;

  /**
   * The panels are showing the last signal set that computed, not this one.
   *
   * Two different failures land here: the whole computation failing, and the
   * shared regime filter failing on its own. The second one leaves every signal
   * standing and only drains the page of colour — the regime card carries its
   * own ErrorState, and the rest is still a valid reading of an older state.
   */
  protected readonly stale = this.service.stale;

  /**
   * Moves the reader past the toolbar to the signals.
   *
   * The default is cancelled rather than followed: `<base href="/">` makes a
   * bare `#ft-content` resolve against the base and not the document, so the
   * browser would leave the page for the dashboard. Focus is set here instead,
   * which is the part of "skip to content" that actually matters.
   */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    const target = this.content().nativeElement;
    if (typeof target.scrollIntoView === 'function') {
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    target.focus({ preventScroll: true });
  }

  protected async retry(): Promise<void> {
    this.service.clearError();
    await this.service.refresh();
  }
}
