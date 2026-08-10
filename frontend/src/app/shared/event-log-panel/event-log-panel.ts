import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/**
 * One line of a run trace, an alert log or a breach history.
 *
 * `at` is a preformatted stamp, not a Date: doc 15 prints `09:14:02` against a
 * single run and doc 18 prints `2026-07-29 14:02` against a year of alerts. The
 * two want different precision, and the page that owns the data is the only
 * place that knows which — formatting here would force one of them to be wrong.
 */
export interface LogEntry {
  readonly id: string;
  readonly at: string;
  readonly text: string;
  readonly detail?: string;
}

let nextId = 0;

/**
 * Timestamped, collapsible event list.
 *
 * Doc 15 renders the last run's read-only tool calls plus a reasoning excerpt,
 * collapsible, with `View full trace →` and `Retry` beside the toggle. Doc 18
 * renders the alert & breach log, where activating an entry highlights the
 * matching point on the chart above. Those are the same control with different
 * words in it, which is why it is built once rather than twice.
 *
 * Two things it deliberately does not do:
 *
 * - It does not format `at` and it does not decide what an entry means. The
 *   whole entry comes back out through `entrySelected` so the page can match
 *   it against its own chart series.
 * - It does not paginate. Doc 18's "View all alerts" is a projected link to a
 *   separate history, not a control this panel owns.
 *
 * Every entry is a real `<button>` inside a real `<li>`: the list count is
 * announced, and each row's accessible name is its own timestamp and text
 * rather than a shared "view", which is what makes a screen reader's list of
 * controls usable at ten entries.
 */
@Component({
  selector: 'app-event-log-panel',
  templateUrl: './event-log-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLogPanel {
  readonly entries = input.required<readonly LogEntry[]>();

  /**
   * What this log is, in the words the page uses for it — doc 15's panel is a
   * run trace and doc 18's is an alert & breach log. It names the toggle and it
   * names the region, so a page carrying two of these does not present two
   * controls called "Event log" and two unlabelled regions.
   */
  readonly label = input('Event log');

  /** False renders the list permanently open, with no toggle at all. */
  readonly collapsible = input(true);

  /**
   * A `model`, not a bare input, so the disclosure is honest on its own.
   *
   * `[(expanded)]` still works and a page can still drive the panel from a URL
   * parameter or collapse it when a run starts — the input/output pair is
   * exactly what `model` compiles to. The difference is what happens to a
   * caller who binds `[expanded]` one way and ignores `expandedChange`: with a
   * plain input the toggle would move nothing and `aria-expanded` would keep
   * announcing a state the panel is not in, which is worse than no toggle. The
   * fallback state keeps the announcement true whatever the caller binds.
   */
  readonly expanded = model(true);

  readonly entrySelected = output<LogEntry>();

  readonly emptyMessage = input('No events recorded.');

  /**
   * Stable target for the toggle's `aria-controls`. It names the region the
   * list lives in rather than the `<ul>` itself, because collapsing removes
   * the list from the DOM and `aria-controls` pointing at an id that is not
   * there resolves to nothing.
   */
  protected readonly regionId = `event-log-panel-${nextId++}`;

  protected readonly count = computed(() => this.entries().length);

  /**
   * Collapsing removes the body rather than hiding it, so a collapsed panel is
   * absent from the accessibility tree as well as from the page.
   */
  protected readonly showBody = computed(() => !this.collapsible() || this.expanded());

  protected toggle(): void {
    this.expanded.set(!this.expanded());
  }
}
