import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Grid of cards under an uppercase group heading.
 *
 * The heading is the template's `SectionLabel`. It lives here rather than in a
 * component of its own because the closed component inventory has no entry for
 * one — and because a label with no grid beneath it has no meaning.
 *
 * It renders as a real `<h2>`: the template is explicit that a group label over
 * navigable content must be a heading of the correct level, small-styled, not a
 * fake heading built from a styled span.
 */
@Component({
  selector: 'app-section-card-grid',
  templateUrl: './section-card-grid.html',
  styleUrl: './section-card-grid.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionCardGrid {
  readonly label = input('');
  /** Columns at the widest breakpoint; steps down to one on mobile. */
  readonly columns = input<1 | 2 | 3 | 4>(3);
  /** Ordered when the cards are sequential steps, e.g. a process stepper. */
  readonly ordered = input(false);

  protected readonly gridClass = computed(() => {
    const map: Record<number, string> = {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    };
    return `grid gap-3 ${map[this.columns()]}`;
  });
}
