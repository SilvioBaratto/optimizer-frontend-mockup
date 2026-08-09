import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The separator, glued to the text on its left.
 *
 * The leading space is a non-breaking one on purpose: with an ordinary space
 * the browser may wrap between the last word of a part and the dot, stranding
 * the dot at the start of the next line. Bound this way, the only break
 * opportunity around a separator is the ordinary space that follows it, so a
 * wrapped line ends "…queue ·" and the next one starts with real content. A
 * separator can never open a line, and can never sit on one alone.
 */
const SEPARATOR = '\u00a0· ';

/**
 * One line saying what the collection under it currently shows — count,
 * category and scope, joined by a middle dot.
 *
 * "6 of 14 trades in queue · step Human Gate · sorted by waiting time, longest
 * first" (doc 16), "184 decisions · Decision Log · All agents · Last 30 days"
 * (doc 24), "3 of 6 signals selected" (doc 21).
 *
 * The host element *is* the live region, and it is rendered whether or not
 * there is anything to say. An `@if` around it would take the region out of
 * the DOM exactly when the collection is empty, and a live region inserted at
 * the same moment as its text is the classic reason nothing is announced —
 * assistive technology has to be watching the element before the text lands.
 *
 * The parts arrive already worded and already formatted. This component does
 * not count, pluralise or parse numbers out of them: the caller knows whether
 * it filtered 6 of 14 trades or selected 3 of 6 signals, and no amount of
 * string inspection here would know it better.
 */
@Component({
  selector: 'app-collection-stat-bar',
  templateUrl: './collection-stat-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    'aria-live': 'polite',
    /*
      The sentence is announced whole. `role="status"` implies it, but the
      implication is honoured unevenly across screen readers and `shell.html`
      already states it outright on its own polite region; a summary read as
      "96" with no idea what was counted is the failure this prevents.
    */
    'aria-atomic': 'true',
    /*
      Not focusable and never focused: `role="status"` announces in place, so
      the summary reaches a screen-reader user without the page yanking the
      caret away from the filter control they are still typing in.

      `break-words` is the 320px insurance — a single unbroken token (a trade
      id, a hash) must break inside itself rather than push the page sideways.
      `min-w-0` is what lets it: doc 21 sets this bar beside a "Send 3 to Views
      Builder" button, and a flex item's default `min-width: auto` floors it at
      its min-content width — a floor `overflow-wrap: break-word` does not
      lower. Without it the row grows instead of the text wrapping. Inert in
      block flow, so it costs the other two consumers nothing.

      `tabular-nums` because the leading count is the part that changes: with
      proportional digits, "184 decisions" narrowing to "96 decisions" shifts
      every word after it, and the line the user is reading twitches on every
      keystroke in the filter field.
    */
    class: 'block min-w-0 text-sm text-text-secondary tabular-nums break-words',
  },
})
export class CollectionStatBar {
  /** Already-worded fragments, in reading order. */
  readonly parts = input.required<readonly string[]>();

  /**
   * One text node rather than a span per part.
   *
   * Split across elements, the separators would have to be `aria-hidden`
   * decorations and screen readers would be left to guess whether to insert a
   * pause between the fragments. As a single string the sentence is announced
   * the way it reads, and it wraps the way ordinary prose wraps.
   *
   * Blank fragments are dropped rather than joined. Callers assemble this line
   * from optional pieces — doc 24's scope is "All agents · Last 30 days" only
   * while both filters are set — and `''` for the piece with nothing to say
   * must not surface as "184 decisions ·  · Last 30 days" or as a line ending
   * on a dot. Each fragment is trimmed for the same reason the separator
   * carries a non-breaking space: a caller's stray trailing space would sit
   * immediately left of the separator and reopen the wrap that strands it at
   * the start of the next line.
   */
  protected readonly text = computed(() =>
    this.parts()
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(SEPARATOR),
  );
}
