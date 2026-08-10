import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EMPTY_TITLE,
  LOAD_FAILURE_DETAIL,
  MARKET_REGIMES_RELATED_PAGES,
  MARKET_REGIME_MODEL_LABEL,
  PROBABILITY_BASIS_LABEL,
} from '../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../services/market-regimes.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { ErrorState } from '../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { CorrelationDiagnostic } from './correlation-diagnostic/correlation-diagnostic';
import { DominantStateCard } from './dominant-state-card/dominant-state-card';
import { MacroNowcast } from './macro-nowcast/macro-nowcast';
import { MomentumStatePanel } from './momentum-state/momentum-state';
import { ProbabilityPath } from './probability-path/probability-path';
import { RegimeDiagnostics } from './regime-diagnostics/regime-diagnostics';
import { RegimeStatistics } from './regime-statistics/regime-statistics';
import { RegimeViewBridge } from './regime-view-bridge/regime-view-bridge';
import { RegimesToolbar } from './regimes-toolbar/regimes-toolbar';
import { SizePremium } from './size-premium/size-premium';
import { ValuePremium } from './value-premium/value-premium';

/** Placeholder blocks, one per panel, at the heights they stand in for. */
const SKELETON_PANELS = [
  { id: 'hero', height: 'h-56' },
  { id: 'path', height: 'h-80' },
  { id: 'statistics', height: 'h-56' },
  { id: 'correlation', height: 'h-80' },
  { id: 'nowcast', height: 'h-72' },
  { id: 'momentum', height: 'h-80' },
  { id: 'size-premium', height: 'h-64' },
  { id: 'value-premium', height: 'h-56' },
];

/**
 * `docs/22 Market Regimes.md` — the page that establishes that the state of the
 * market is not constant.
 *
 * A Markov switching model and its recursive filter turn realised returns into
 * a probability over persistent states; those states change means, volatilities,
 * correlations and tails; and the state the filter reports is the economic
 * content from which a Black-Litterman view is formed. The page runs from the
 * estimate at the top to that view at the bottom, and everything between them is
 * the evidence for it.
 *
 * **Three state vocabularies live on this page and never blend.** It is the
 * doc's most repeated constraint and the reason the regions are laid out the
 * way they are:
 *
 * 1. the toolbar's regime model — Crash / Slow Growth / Bull / Recovery under
 *    the four-state VAR, Recession / Expansion under Hamilton. It drives the
 *    hero card, the probability path, the statistics table and, always in its
 *    four-state form, the size premium;
 * 2. the value premium's own two-state Markov chain on book-to-market
 *    portfolios — high-volatility and low-volatility — which has its own panel,
 *    its own heading and no row aligned with anything above it, and which the
 *    toolbar's Regime model does not touch;
 * 3. momentum's UP / DOWN market state, a third taxonomy sharing no label and
 *    no colour with either.
 *
 * The type layer enforces the separation — every row carries its vocabulary as
 * a literal discriminant, so a template that tried to zip a size-premium row
 * with a value-premium row would not compile — and the layout carries it: three
 * panels, three headings, three axes, no shared row anywhere.
 *
 * The other invariant is the one at the bottom. The direction in the bridge
 * card is a `computed()` off the dominant state with no setter anywhere, so the
 * hero card and the bridge card cannot disagree.
 *
 * The shell renders the `<h1>` and the breadcrumb from the route, so the page's
 * own outline starts at `<h2>`.
 */
@Component({
  selector: 'app-market-regimes',
  imports: [
    ActionButtonRow,
    CorrelationDiagnostic,
    CrossPageLink,
    DominantStateCard,
    ErrorState,
    MacroNowcast,
    MomentumStatePanel,
    ProbabilityPath,
    RegimeDiagnostics,
    RegimeStatistics,
    RegimeViewBridge,
    RegimesToolbar,
    SizePremium,
    SkeletonBlock,
    ValuePremium,
  ],
  templateUrl: './market-regimes.html',
  styleUrl: './market-regimes.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketRegimes {
  private readonly service = inject(MarketRegimesService);

  protected readonly skeletonPanels = SKELETON_PANELS;
  protected readonly relatedPages = MARKET_REGIMES_RELATED_PAGES;
  protected readonly loadFailureDetail = LOAD_FAILURE_DETAIL;

  protected readonly state = this.service.state;

  /**
   * The failure of the estimate, which is the only thing this page frames as a
   * page-level failure.
   *
   * The primary action's own failure is a separate signal in the service and
   * belongs beside the button that raised it: a filter that did not converge
   * leaves the last good panels standing and is retried from here, while a
   * draft view that could not be handed over changes nothing about the panels.
   */
  protected readonly loadFailure = this.service.errorMessage;

  /** The panels are showing the last estimate that converged, not this one. */
  protected readonly stale = computed(() => this.loadFailure() !== null);

  /**
   * What the page's one live region says at any moment.
   *
   * The reading, not the fact that a reading arrived: a reader who changed the
   * universe wants to hear the state the filter now puts in front, and the four
   * coordinates it is stated in, without going to look for them. Failures are
   * left to the ErrorState beside the retry that fixes them, so the two are not
   * announced twice.
   */
  protected readonly liveSummary = computed(() => {
    switch (this.state()) {
      case 'loading':
        return 'Re-estimating the regime filter…';
      case 'empty':
        return `${EMPTY_TITLE}. ${this.service.emptyDetail() ?? ''}`;
      default: {
        const dominant = this.service.dominantState();
        if (dominant === null) return '';
        // `filtered`, whatever the toolbar's toggle says, for the same reason
        // the hero card's eyebrow says it: this is the reading at t = T, where
        // the smoother has no future to condition on and the two coincide.
        const basis = PROBABILITY_BASIS_LABEL.filtered.toLowerCase();
        return (
          `${dominant.state} ${Math.round(dominant.probability)}%, ${basis}, under the ` +
          `${MARKET_REGIME_MODEL_LABEL[dominant.model]} model on ${this.service.universe().label}.`
        );
      }
    }
  });

  protected async retry(): Promise<void> {
    this.service.clearError();
    await this.service.refresh();
  }
}
