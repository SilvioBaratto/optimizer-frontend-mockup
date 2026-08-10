import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

/** `row` puts the content on one line and pushes it apart; `stack` keeps rows. */
export type ContextBarLayout = 'stack' | 'row';

/**
 * The bar that keeps a page's run, agent or scope state in sight while reading.
 *
 * It bleeds to the viewport edge and sticks under the topbar, so it is the one
 * piece of page chrome that is not a card. Six pages drew this by hand before
 * it was a component, under three different names — `CollectionStatBar`,
 * `Toolbar` and `HeroStatCard` — none of which matched what they rendered.
 * The specs' `HeroStatCard` is `app-hero-stat-card`, a card, and not this.
 *
 * Content is projected: the bars carry anything from a run selector to a live
 * SSE badge, and enumerating those shapes here would make it six components
 * wearing one name.
 */
@Component({
  selector: 'app-page-context-bar',
  templateUrl: './page-context-bar.html',
  styleUrl: './page-context-bar.css',
  // Two things are load-bearing here.
  //
  // The stickiness lives on the HOST, not on the inner div. A sticky element is
  // constrained by its containing block, which for the inner div is this host's
  // box — exactly as tall as the bar itself, so there is no room to slide and
  // `position: sticky` does nothing. Measured before this moved: scrolling
  // 700px took the bar from top 180 to top -520 on every page using it. The
  // host also needs an explicit display, since a custom element defaults to
  // `inline` and an inline box cannot be positioned at all.
  //
  // It sticks from `md` up, not at every width. These bars carry a page's whole
  // parameter set, and below `md` their controls collapse to one column: at
  // 320x800 the bar measures 403px on Risk Monitoring, 473px on Stress Testing
  // and 699px on Risk Attribution — 87% of the viewport, leaving about a
  // hundred pixels for the panels the bar exists to describe. A bar that eats
  // the content is not context. `backtest-validation` and doc 25's snapshot bar
  // both reached this independently before it was centralised here.
  //
  // It rests at `top-14`, not `top-0`: the shell topbar is pinned to the top of
  // the same scroll container and is `h-14` (56px), so a bar stuck at 0 would
  // slide underneath it and read as gone. `md:z-10` puts it one layer below
  // that topbar's `z-20` for the same reason — where the two overlap, the
  // topbar is the one that has to stay legible. Below `md` nothing here is
  // pinned, so no offset is needed at those widths.
  host: { class: 'block md:sticky md:top-14 md:z-10' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageContextBar {
  readonly layout = input<ContextBarLayout>('stack');

  /**
   * Tightens the gap between stacked rows. Only bites when the bar has more
   * than one row in flow — an `sr-only` heading is positioned out of it.
   */
  readonly compact = input(false, { transform: booleanAttribute });

  /**
   * Names the region for screen readers when the bar is a page's status
   * header rather than a toolbar. Rendered `sr-only`: the visible state
   * beneath it already says the same thing to a sighted reader.
   */
  readonly heading = input('');

  protected readonly classes = computed(() =>
    [
      '-mx-4 border-b border-border bg-surface px-4 py-3 md:-mx-8 md:px-8',
      this.layout() === 'row' ? 'flex flex-wrap items-center justify-between' : 'flex flex-col',
      this.compact() ? 'gap-2' : 'gap-3',
    ].join(' '),
  );
}
