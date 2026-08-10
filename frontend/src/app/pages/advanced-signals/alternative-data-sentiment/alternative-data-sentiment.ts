import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChildren,
} from '@angular/core';

import {
  ALT_DATA_RELATED_PAGES,
  ALT_DATA_TABS,
  LOAD_FAILURE_DETAIL,
  type AltDataTab,
} from '../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../services/alt-data-sentiment.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { ErrorState } from '../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { AltDataCrossSectionalPanel } from './cross-sectional-panel/cross-sectional-panel';
import { AltDataDiagnosticLegend } from './diagnostic-legend/diagnostic-legend';
import { AltDataMlAggregationPanel } from './ml-aggregation-panel/ml-aggregation-panel';
import { AltDataScopeBar } from './scope-bar/scope-bar';
import { AltDataSelectionFooter } from './selection-footer/selection-footer';
import { AltDataSignalDetail } from './signal-detail/signal-detail';
import { AltDataSignalLibrary } from './signal-library/signal-library';

/** Placeholder blocks at the heights of the regions they stand in for. */
const SKELETON_PANELS = [
  { id: 'filters', height: 'h-16' },
  { id: 'grid', height: 'h-72' },
  { id: 'detail', height: 'h-96' },
];

/**
 * `docs/21 Alternative Data & Sentiment.md` — the page that asks of every
 * alternative-data signal not whether it predicts, but for how long.
 *
 * The diagnostic criterion is the spine. Sentiment theory predicts that a move
 * a signal induces is reversed; information theory predicts it persists. So the
 * page is organised around a temporal signature rather than around a
 * correlation: every card carries the verdict of that test, and opening a card
 * shows the evidence the verdict rests on — a reversal profile for media
 * pessimism and retail attention, a t-statistic per dictionary and weighting
 * for filing tone, a causality table by lag for social mood, a cadence
 * comparison for news, and the component loadings for the aggregate index.
 *
 * Three invariants hold the page together, and all three live above the
 * regions:
 *
 * 1. **Selecting a card and including a card are different acts.** Enter makes
 *    a card drive the detail panel (`aria-selected`); Space includes it in the
 *    hand-over (`aria-checked`) and changes nothing about the panel. The page
 *    opens in exactly that state — three cards ticked, a fourth showing its
 *    evidence — so the distinction is visible before anyone reads about it.
 * 2. **The classification is a result, not a label.** The news cadence toggle
 *    moves the same signal from Transient to Persistent, because the evidence
 *    it is read from changes. The library's own badge stays Mixed, which is the
 *    honest summary of a signal that answers differently at two horizons.
 * 3. **A failed feed narrows a window; it does not remove a signal.** The card
 *    keeps its place in the grid, keeps its keyboard behaviour, and carries the
 *    timestamp of the last good extract.
 *
 * The three tabs are three analyses of one scope rather than three pages: the
 * scope bar, the tab bar and the selection footer are outside the tab panel and
 * stay put, while the filter bar, the grid and the detail panel are replaced
 * wholesale by the parameter panel, the model table and the figure of the other
 * two modes.
 *
 * The shell renders the `<h1>` and the breadcrumb from the route, so the page's
 * own outline starts at `<h2>`.
 */
@Component({
  selector: 'app-alternative-data-sentiment',
  imports: [
    ActionButtonRow,
    AltDataCrossSectionalPanel,
    AltDataDiagnosticLegend,
    AltDataMlAggregationPanel,
    AltDataScopeBar,
    AltDataSelectionFooter,
    AltDataSignalDetail,
    AltDataSignalLibrary,
    CrossPageLink,
    ErrorState,
    SkeletonBlock,
  ],
  templateUrl: './alternative-data-sentiment.html',
  styleUrl: './alternative-data-sentiment.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlternativeDataSentiment {
  private readonly service = inject(AltDataSentimentService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected readonly tabs = ALT_DATA_TABS;
  protected readonly relatedPages = ALT_DATA_RELATED_PAGES;
  protected readonly loadFailureDetail = LOAD_FAILURE_DETAIL;
  protected readonly skeletonPanels = SKELETON_PANELS;

  protected readonly tab = this.service.tab;
  protected readonly state = this.service.state;
  protected readonly panelLoading = this.service.panelLoading;
  protected readonly errorMessage = this.service.errorMessage;

  protected readonly activeTabTitle = computed(
    () => this.tabs.find((tab) => tab.id === this.tab())?.title ?? '',
  );

  protected readonly activeTabDefinition = computed(
    () => this.tabs.find((tab) => tab.id === this.tab())?.definition ?? '',
  );

  /** One placeholder set covers the page read and the per-panel read alike. */
  protected readonly busy = computed(
    () => this.state() === 'loading' || this.panelLoading(),
  );

  protected selectTab(tab: AltDataTab): void {
    this.service.setTab(tab);
  }

  /**
   * The aggregate index's detail panel asked for the Cross-Sectional tab.
   *
   * The switch destroys the button that was pressed, so focus has to be put
   * somewhere deliberately or it falls to `<body>`: the reader is left with no
   * focus ring, no announcement and no idea the page changed under them. It
   * goes to the tab that is now selected, which is where a reader arriving at
   * this view by any other route would already be.
   */
  protected openCrossSectional(): void {
    this.selectTab('cross-sectional');
    const index = this.tabs.findIndex((item) => item.id === 'cross-sectional');
    this.tabButtons()[index]?.nativeElement.focus();
  }

  /**
   * Arrow keys move between tabs, Home and End jump to the ends, and only the
   * active tab is in the tab order — the roving pattern a tablist expects.
   *
   * Activation follows focus, which is right here: switching discards nothing.
   * The universe, the window and the selection are all outside the panel and
   * survive every switch, so the cost of landing on a tab is a short read.
   */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const count = this.tabs.length;
    let next: number | null = null;

    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;

    if (next === null) return;
    event.preventDefault();
    this.selectTab(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  /**
   * Enter on a card moved the detail panel, so focus follows it to the panel's
   * heading.
   *
   * Without this a keyboard reader activates a card and the panel that changed
   * is somewhere below the focus ring, unannounced. The heading is queried from
   * this component's own host rather than from the document: both the grid and
   * the panel are children of this page, and the page is the only place that
   * knows they belong together.
   */
  protected onSignalActivated(): void {
    queueMicrotask(() => {
      const heading = this.host.nativeElement.querySelector('#ads-detail-heading');
      if (heading instanceof HTMLElement) heading.focus();
    });
  }

  protected async retry(): Promise<void> {
    this.service.clearError();
    await this.service.refresh();
  }
}
