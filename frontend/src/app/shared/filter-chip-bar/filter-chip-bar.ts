import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Per-instance so two bars on one page cannot share a `<label for>` target. */
let nextId = 0;

/**
 * The toolbar row above a filtered collection: a search field, the caller's own
 * filter controls, and the live result count.
 *
 * Seven page specs (14, 15, 16, 17, 21, 23, 24) draw this region, each with a
 * different set of selects and chips, so the controls are projected rather than
 * enumerated — describing them here would make it seven components under one
 * name. What is *not* the caller's business is the count: the template's
 * "Regioni live" rule is that changing the numbers without announcing the total
 * is a silent change, so the count lives in an `aria-live="polite"` region that
 * is mounted from the first render. A region created at the same moment as its
 * text is not announced, which is why it stays in the DOM while empty.
 *
 * Sticky positioning is deliberately absent: docs 15 and 24 stick this under
 * their toolbar, doc 16 does not, and the ones that do stick it to a different
 * offset. That is the page's decision, not this component's.
 */
@Component({
  selector: 'app-filter-chip-bar',
  templateUrl: './filter-chip-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /*
    A component host is `display: inline` unless told otherwise, and an inline
    box drops vertical margins, ignores width and cannot be a grid/flex parent's
    predictable child. Seven pages will place this between cards in a
    `flex flex-col gap-6` column — blockified there by the flex parent, but not
    inside a tab panel or a card body, where the inline host would silently
    swallow any `class="mt-4"` the caller puts on the element. The sibling
    shared components landed in this phase (`app-collection-stat-bar`,
    `app-segmented-control`) both declare it; this one did not.
  */
  host: { class: 'block' },
})
export class FilterChipBar {
  /** Non-empty renders the search field; the string is its visible `<label>`. */
  readonly searchLabel = input('');
  /** Hint only — never the field's sole label. */
  readonly searchPlaceholder = input('');
  readonly searchValue = input('');
  readonly searchChange = output<string>();

  /** Rows currently shown. `null` means the page has nothing to announce yet. */
  readonly count = input<number | null>(null);
  /** Rows before filtering. Present ⟹ the count reads "N of M". */
  readonly total = input<number | null>(null);
  readonly countNoun = input('results');

  /** Second live line, e.g. "3 pending approval · 1 blocked". */
  readonly summary = input('');

  protected readonly searchId = `filter-chip-bar-search-${nextId++}`;

  /*
    `== null` rather than `=== null` on purpose. The inputs are typed
    `number | null`, but page services routinely hand back `number | undefined`
    from an optional field, and a template binding of an `undefined` narrowed
    away by a caller's own `?.` would print the literal string
    "undefined results" into a live region. Nullish is the only check that is
    right for both spellings of "not known yet".
  */
  protected readonly countText = computed(() => {
    const shown = this.count();
    if (shown == null) return '';
    const all = this.total();
    return all == null ? `${shown} ${this.countNoun()}` : `${shown} of ${all} ${this.countNoun()}`;
  });

  protected onSearch(event: Event): void {
    this.searchChange.emit((event.target as HTMLInputElement).value);
  }
}
