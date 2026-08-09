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
      'sticky top-0 z-20 -mx-4 border-b border-border bg-surface px-4 py-3 md:-mx-8 md:px-8',
      this.layout() === 'row' ? 'flex flex-wrap items-center justify-between' : 'flex flex-col',
      this.compact() ? 'gap-2' : 'gap-3',
    ].join(' '),
  );
}
