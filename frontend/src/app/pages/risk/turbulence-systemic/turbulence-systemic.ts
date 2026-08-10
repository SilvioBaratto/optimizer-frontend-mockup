import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';

import {
  PLACEMENT_NOTES,
  PLACEMENT_NOTE_TITLE,
  TURBULENCE_EMPTY_ACTION,
  TURBULENCE_EMPTY_DETAIL,
  TURBULENCE_EMPTY_TITLE,
  TURBULENCE_RELATED_PAGES,
  TURBULENCE_SECTION_ANCHOR,
  type TurbulenceSection,
} from '../../../models/turbulence.model';
import { TurbulenceService } from '../../../services/turbulence.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { AbsorptionChart } from './absorption-chart/absorption-chart';
import { ContributorsTable } from './contributors-table/contributors-table';
import { DisplayToolbar } from './display-toolbar/display-toolbar';
import { EffectiveRankChart } from './effective-rank-chart/effective-rank-chart';
import { EigenSpectrum } from './eigen-spectrum/eigen-spectrum';
import { IndicatorGrid } from './indicator-grid/indicator-grid';
import { PairwiseInspector } from './pairwise-inspector/pairwise-inspector';
import { PanelFallback } from './panel-fallback/panel-fallback';
import { ParticipationChart } from './participation-chart/participation-chart';
import { Pc1ContributionTable } from './pc1-contribution-table/pc1-contribution-table';
import { Pc1Growth } from './pc1-growth/pc1-growth';
import { SectionNav } from './section-nav/section-nav';
import { SnapshotBar } from './snapshot-bar/snapshot-bar';
import { TurbulenceChart } from './turbulence-chart/turbulence-chart';

/** Breathing room between the pinned as-of bar and a section jumped to. */
const SECTION_GAP_PX = 16;

/**
 * `docs/25 Turbulence & Systemic Risk.md` — how unusual the current market
 * state is, and how compact its correlation structure has become.
 *
 * The page is read-only: no confirmation, no submission and nothing
 * destructive. Its primary action is an orienting read of the six current
 * readings, with the panels below as the detail behind each of them.
 *
 * Four page-level decisions live here rather than in a region, because each
 * one is about how the regions relate:
 *
 * - **The sections are the SectionNav's targets.** The four anchors come from
 *   the model, so the jump link and the heading it scrolls to cannot drift
 *   apart, and the jump moves focus as well as the viewport — scrolling alone
 *   would leave a keyboard reader several screens behind what they asked to
 *   see. Nothing about the jump touches a service signal: the data does not
 *   reload.
 * - **A failed panel is not a failed page.** Errors are held against the panel
 *   that raised them, so eight panels keep their figures while the ninth shows
 *   its own message and its own retry. The page-level error state below needs
 *   *every* panel to have failed, which is what the service's `state` means.
 * - **Nor is a recomputing page a blank one.** A refresh leaves the structure
 *   standing and every region shows its own placeholder — the six cards of the
 *   grid, and each panel at the height of the figure it stands in for. That is
 *   what the spec asks for twice: "la SectionCardGrid mostra SkeletonBlock al
 *   posto dei valori correnti e ogni ChartPanel o DataTable mostra uno
 *   SkeletonBlock della stessa altezza del contenuto finale", and
 *   "RefreshControl … mostra lo stato di caricamento su ogni pannello
 *   coinvolto". A page-wide sheet of generic blocks would also throw away the
 *   toolbar and the jump links mid-read.
 * - **Below-the-fold figures are deferred.** Eight ECharts instances on one
 *   route is a real first-render cost — each one initialises a canvas and
 *   installs a `ResizeObserver` — so the six that a reader has to scroll to
 *   arrive on idle, behind placeholders of the same height. Nothing about what
 *   they draw changes; only when the work happens does.
 *
 * The shell renders the `<h1>` and the breadcrumb from the route, so the page's
 * own outline starts at `<h2>`.
 */
@Component({
  selector: 'app-turbulence-systemic',
  imports: [
    AbsorptionChart,
    ActionButtonRow,
    ContributorsTable,
    CrossPageLink,
    DisplayToolbar,
    EffectiveRankChart,
    EigenSpectrum,
    EmptyState,
    ErrorState,
    IndicatorGrid,
    InfoCard,
    PairwiseInspector,
    PanelFallback,
    ParticipationChart,
    Pc1ContributionTable,
    Pc1Growth,
    SectionNav,
    SnapshotBar,
    TurbulenceChart,
  ],
  templateUrl: './turbulence-systemic.html',
  styleUrl: './turbulence-systemic.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TurbulenceSystemic {
  private readonly service = inject(TurbulenceService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly anchor = TURBULENCE_SECTION_ANCHOR;
  protected readonly emptyAction = TURBULENCE_EMPTY_ACTION;
  protected readonly placementTitle = PLACEMENT_NOTE_TITLE;
  protected readonly placementNotes = PLACEMENT_NOTES;
  protected readonly relatedPages = TURBULENCE_RELATED_PAGES;

  protected readonly state = this.service.state;

  protected readonly emptyTitle = computed(() => {
    const reason = this.service.emptyReason();
    return reason === null ? '' : TURBULENCE_EMPTY_TITLE[reason];
  });

  protected readonly emptyDetail = computed(() => {
    const reason = this.service.emptyReason();
    return reason === null ? '' : TURBULENCE_EMPTY_DETAIL[reason];
  });

  /**
   * The page-level failure, which is every panel having failed at once.
   *
   * The nine messages are per-panel and stay on their panels; what a reader
   * needs here is the shape of the failure and the one action that addresses
   * all of it.
   */
  protected readonly errorDetail = computed(() => {
    const count = this.service.panelErrors().length;
    return (
      `All ${count} indicator panels failed on the last run — the covariance estimate for the ` +
      `current window could not be formed, so no reading is available on either scale. ` +
      `Retrying recomputes every panel.`
    );
  });

  /**
   * How tall the pinned as-of bar is, in pixels.
   *
   * The topbar above it is not counted here: `styles.css` gives the scrollport
   * a `scroll-padding-top` of the topbar's own height, and scroll padding and
   * scroll margin are additive, so counting it again would land every jump 56px
   * lower than asked. This is only the extra reach the bar itself adds.
   *
   * Zero unless the bar is actually stuck — below `md` it is in normal flow and
   * a jump needs no allowance beyond the topbar's. Measured rather than written
   * as a `scroll-mt-*` class because the bar is 111px at 1440, 155px at 1024
   * and 225px at 768: any single class is wrong at two of the three.
   *
   * The element probed has to be the one that carries the sticky. This used to
   * probe `app-turbulence-snapshot-bar`, which is `display: contents` — it
   * never generates a box, so `position` reads `static` and the height is 0,
   * and the guard below rejected it at every width. The 16px allowance that
   * left behind put the heading 151px behind the bar at 1440, 195px at 1024 and
   * 265px at 768. The unit test passed throughout, because it mocked the
   * snapshot bar into being sticky and 242px tall — a shape that element has
   * never had in a browser.
   */
  private stickyBarOffset(): number {
    const bar = this.host.nativeElement.querySelector('app-page-context-bar');
    if (!(bar instanceof HTMLElement)) return 0;
    if (globalThis.getComputedStyle?.(bar).position !== 'sticky') return 0;
    return bar.getBoundingClientRect().height;
  }

  /**
   * Scrolls to a section and takes the focus with it.
   *
   * The scroll clears the pinned bar: `scrollIntoView` honours
   * `scroll-margin-top`, so the allowance is written there from the bar's
   * measured height. The topbar above it is the scrollport's
   * `scroll-padding-top` and is already accounted for. Without this the jump
   * lands the heading *behind* the bar, which is the one thing a jump link
   * must not do.
   *
   * The anchor takes a programmatic `tabindex` so it can receive focus without
   * joining the tab order; `styles.css` suppresses the ring on those, so
   * nothing is painted. Guarded on the method existing, so a non-browser
   * environment is never asked to scroll, and it honours
   * `prefers-reduced-motion` — an unexpected smooth scroll of a page this long
   * is exactly the motion that setting exists for.
   */
  protected goToSection(section: TurbulenceSection): void {
    const target = this.host.nativeElement.querySelector(`#${TURBULENCE_SECTION_ANCHOR[section]}`);
    if (!(target instanceof HTMLElement)) return;
    if (typeof target.scrollIntoView === 'function') {
      const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.style.scrollMarginTop = `${Math.round(this.stickyBarOffset()) + SECTION_GAP_PX}px`;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  protected async retry(): Promise<void> {
    this.service.clearError();
    await this.service.refresh();
  }
}
