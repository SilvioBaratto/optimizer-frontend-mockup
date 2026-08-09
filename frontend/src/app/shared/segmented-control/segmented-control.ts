import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChildren,
} from '@angular/core';

/**
 * One choice in the group.
 *
 * `disabled` never removes the option: doc 19 requires an unavailable control
 * to stay visible, reachable and announced, so the layout does not reflow when
 * a measure stops applying. `disabledReason` is what turns a dimmed button into
 * an explanation — it is rendered off-screen and pointed at by
 * `aria-describedby`, so a screen reader gets the reason with the option rather
 * than after hunting for it.
 */
export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

/** The rendered shape of one option — everything the template needs, computed once. */
interface Segment {
  value: string;
  label: string;
  disabled: boolean;
  reason: string | null;
  reasonId: string | null;
  checked: boolean;
  tabIndex: 0 | -1;
  classes: string;
}

/**
 * The keys this control owns. `preventDefault()` is scoped to exactly this set:
 * Enter and Space are deliberately absent because a native `<button>` already
 * turns them into a click, and swallowing them would break that.
 */
const NAV_KEYS: ReadonlySet<string> = new Set([
  'ArrowRight',
  'ArrowDown',
  'ArrowLeft',
  'ArrowUp',
  'Home',
  'End',
]);

/**
 * The focus ring is a utility here rather than the app-wide `*:focus-visible`
 * rule, and that is not duplication.
 *
 * `styles.css` cancels the global outline for `[tabindex='-1']` — a deliberate
 * rule aimed at programmatic focus targets like `#main-content`. A roving
 * tabindex puts `-1` on every unselected option, so the group inherits that
 * cancellation and any moment an option holds focus while its `0` has not
 * arrived yet, it holds it with no indicator at all. Utilities outrank
 * `@layer base`, so stating the outline on the button restores it
 * unconditionally. `ui-tab`, `ui-pagination` and `ui-accordion` all carry their
 * own ring for the same reason.
 */
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 py-2' +
  ` text-sm font-medium tabular-nums transition-colors ${FOCUS_RING}`;

/**
 * Border *style* carries the state, so it survives greyscale and the specs' "mai
 * solo colore" rule: solid accent edge = chosen, no edge = available, dashed
 * edge = unavailable. Colour and background move with them but never carry the
 * meaning alone.
 *
 * The chosen-but-unavailable combination is a real state, not a corner case —
 * doc 19's method field retires the current method when the risk measure
 * changes — so it keeps both edges: dashed, in the accent colour. Fading it
 * with `opacity` instead would leave tone as the only difference from an
 * ordinary selection, and tone is colour.
 */
const CHECKED = `${BASE} border-solid border-primary bg-surface-raised text-primary`;
const AVAILABLE =
  `${BASE} border-solid border-transparent text-text-secondary` +
  ' hover:bg-surface-raised hover:text-text';
const UNAVAILABLE = `${BASE} border-dashed border-border-control text-text-tertiary cursor-not-allowed`;
const UNAVAILABLE_CHECKED =
  `${BASE} border-dashed border-primary bg-surface-raised text-primary cursor-not-allowed`;

/**
 * No `opacity-*` anywhere in here. `--color-text-tertiary` is 3.35:1 and
 * `--color-border-control` 3.13:1 against the group's inset background: both
 * are picked to sit just over the WCAG floor, and multiplying either by a
 * transparency drops the unavailable state's only non-colour cue below it.
 */
function segmentClasses(checked: boolean, disabled: boolean): string {
  if (disabled) return checked ? UNAVAILABLE_CHECKED : UNAVAILABLE;
  return checked ? CHECKED : AVAILABLE;
}

let nextControlId = 0;

/**
 * Segmented control — an APG radiogroup, not a row of toggle buttons.
 *
 * Six pages (docs 14, 18, 19, 22, 23, 25) put one of these in a toolbar to pick
 * a confidence level, an estimation method, a lookback window or a chart range.
 * It exists as one component because the hand-rolled radiogroup on
 * `objective-constraints` was about to be copied six times, and a copied roving
 * tabindex is a copied bug.
 *
 * `value` is an input rather than a model: the pages that use this hold the
 * selection in a service signal, and a two-way binding would give the control a
 * second, private copy of a value the service already owns.
 */
@Component({
  selector: 'app-segmented-control',
  templateUrl: './segmented-control.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SegmentedControl {
  readonly options = input.required<readonly SegmentedOption[]>();
  readonly value = input.required<string>();
  /** The group's accessible name — announced before the checked option. */
  readonly label = input.required<string>();

  readonly valueChange = output<string>();

  private readonly uid = `segmented-control-${nextControlId++}`;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('optionButton');

  /**
   * Which option Tab lands on. APG parks the roving `0` on the checked radio;
   * when `value` matches nothing — a page whose default has not resolved yet —
   * that would leave the whole group unreachable, so the first enabled option
   * takes it instead.
   */
  private readonly focusValue = computed(() => {
    const options = this.options();
    const selected = this.value();
    if (options.some((option) => option.value === selected)) return selected;
    return (options.find((option) => !option.disabled) ?? options[0])?.value ?? null;
  });

  protected readonly segments = computed<Segment[]>(() => {
    const selected = this.value();
    const focus = this.focusValue();

    return this.options().map((option, index) => {
      const disabled = option.disabled === true;
      const reason = disabled && option.disabledReason ? option.disabledReason : null;
      const checked = option.value === selected;

      return {
        value: option.value,
        label: option.label,
        disabled,
        reason,
        reasonId: reason ? `${this.uid}-reason-${index}` : null,
        checked,
        tabIndex: option.value === focus ? 0 : -1,
        classes: segmentClasses(checked, disabled),
      };
    });
  });

  /** The off-screen description elements `aria-describedby` resolves against. */
  protected readonly reasons = computed(() => {
    const out: { id: string; text: string }[] = [];
    for (const segment of this.segments()) {
      if (segment.reasonId && segment.reason) {
        out.push({ id: segment.reasonId, text: segment.reason });
      }
    }
    return out;
  });

  protected onSelect(segment: Segment): void {
    if (segment.disabled || segment.checked) return;
    this.valueChange.emit(segment.value);
  }

  protected onKeydown(event: KeyboardEvent, from: number): void {
    // A modified arrow is somebody else's chord. Alt/Cmd + Arrow is browser
    // history navigation and Ctrl/Cmd + Home scrolls the document to the top;
    // a radiogroup that eats them takes a shortcut away and gives nothing back.
    // Shift is left alone deliberately — there is no selection to extend here,
    // so a stray Shift should not stall the group.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();

    const target = this.resolveTarget(event.key, from);
    if (target === null) return;

    // Focus follows the selection, per APG — the group is one tab stop and the
    // user has to be able to keep arrowing from wherever they just landed.
    this.buttons()[target]?.nativeElement.focus();

    const next = this.options()[target].value;
    if (next !== this.value()) this.valueChange.emit(next);
  }

  /** Index the given key moves to, skipping disabled options; null when none qualifies. */
  private resolveTarget(key: string, from: number): number | null {
    const count = this.options().length;
    if (count === 0) return null;

    if (key === 'Home') return this.scan(0, 1);
    if (key === 'End') return this.scan(count - 1, -1);

    const delta = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    for (let hop = 1; hop <= count; hop++) {
      const index = (((from + delta * hop) % count) + count) % count;
      if (!this.options()[index].disabled) return index;
    }
    return null;
  }

  /** First enabled option from `start`, walking in `delta`'s direction. */
  private scan(start: number, delta: number): number | null {
    const options = this.options();
    for (let i = start; i >= 0 && i < options.length; i += delta) {
      if (!options[i].disabled) return i;
    }
    return null;
  }
}
