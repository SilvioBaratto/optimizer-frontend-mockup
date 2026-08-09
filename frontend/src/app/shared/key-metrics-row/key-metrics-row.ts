import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StatusBadge, StatusTone } from '../status-badge/status-badge';

/**
 * One labelled figure in a `KeyMetricsRow`.
 *
 * `value` is a formatted string, not a number: the three consumer specs print
 * `$4,182,300`, `3.42% of NAV` and `2026-07-30 16:00 UTC` in the same slot, and
 * a numeric input would force each caller to pipe it back to a string anyway.
 */
export interface KeyMetric {
  label: string;
  value: string;
  /** Qualifier under the figure — units, method, or the reading in words. */
  note?: string;
  /**
   * State beside the figure. The badge always renders its label as text, so a
   * status is never carried by colour alone.
   */
  badge?: { label: string; tone: StatusTone };
}

/**
 * Column counts, written out so Tailwind can see every class it must generate.
 *
 * Same shape as `app-section-card-grid`'s map and for the same reason: an
 * interpolated `lg:grid-cols-${n}` is invisible to the v4 source scan and the
 * rule is silently never emitted.
 */
const COLUMN_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * Two to four headline figures on one bordered surface.
 *
 * Docs 18, 19 and 25 all draw this region as a single card with the figures
 * side by side inside it — not as N stat cards in a grid, which is what three
 * pages would otherwise have grown independently.
 *
 * The body is a real `<dl>`: template 00 requires key-value pairs to be a
 * description list rather than a styled grid of divs, so the pairing survives
 * into the accessibility tree.
 *
 * Doc 25 uses the region as an "as of" line with a refresh control on the
 * right; that control comes in through the trailing `<ng-content>` slot rather
 * than as a fifth input, because it is a whole component and not a figure.
 */
@Component({
  selector: 'app-key-metrics-row',
  templateUrl: './key-metrics-row.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusBadge],
  /*
    A custom element is `display: inline` until told otherwise, and this one
    wraps a block that carries `.surface-card`'s negative `margin-inline` bleed
    below 40rem — negative margins on a block inside an inline box are exactly
    the arrangement that renders differently depending on what the parent
    happens to be. Doc 25 also asks for the region to stick to the top of the
    content area while scrolling, and `position: sticky` on an inline box does
    not do what the page means; the consumer needs a block host to put
    `sticky top-0` on. Same reason `app-segmented-control` sets it.
  */
  host: { class: 'block' },
})
export class KeyMetricsRow {
  readonly metrics = input.required<readonly KeyMetric[]>();

  /**
   * One column at 320px, two from `sm`, then one column per metric from `lg`.
   * Capped at four: a fifth figure on one row stops being readable before it
   * stops fitting.
   *
   * `sm:flex-1` and not `flex-1`: the surrounding flex container only turns
   * into a row at `sm`. Below it the main axis is vertical, where `flex-1`
   * means `flex-basis: 0` on the *height* — a claim about vertical growth that
   * this list never wanted to make, and one whose resolution depends on the
   * consumer's own height constraints.
   */
  protected readonly listClass = computed(() => {
    const columns = Math.min(Math.max(this.metrics().length, 1), 4);
    return `grid min-w-0 gap-x-6 gap-y-4 sm:flex-1 ${COLUMN_CLASS[columns]}`;
  });
}
