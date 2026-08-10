import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  IMPACT_MEASURES,
  IMPACT_MEASURE_DEFINITION,
  IMPACT_MEASURE_LABEL,
  K_HINT,
  K_MAX,
  K_MIN,
  K_STEP,
  SCENARIO_KIND_LABEL,
  STALE_RESULT_NOTE,
  type ImpactMeasureId,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { PageContextBar } from '../../../../shared/page-context-bar/page-context-bar';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { kLabel } from '../stress-format';

/** A page-up/page-down jump on the radius slider, in steps. */
const PAGE_STEPS = 10;

/** Why `Save scenario` is inert before anything has been computed. */
export const NOTHING_TO_SAVE_REASON =
  'Evaluate a manual scenario, run the worst-case search or run a reverse search first — the library stores a result, not a set of controls.';

/** Why every control refuses input while a search is in flight. */
export const BUSY_REASON = 'Unavailable while a search is running.';

/**
 * Region 1 — the toolbar, and the rule the whole page turns on.
 *
 * Two of these controls are not settings but *coordinates*: every figure below
 * is a statement about one impact measure and one plausibility radius, and it
 * is only readable alongside them. So moving either one marks every result on
 * the page stale and recomputes nothing — the service's `setImpactMeasure` and
 * `setK` do exactly that and no more, and this bar says so in words the moment
 * it happens rather than leaving the reader to notice that a card and a
 * selector disagree.
 *
 * The radius is one value with two views. The number field is the way to state
 * a radius exactly and the slider is the way to feel the severity/plausibility
 * trade-off by sweeping it; both write `setK`, both read `k()`, and neither
 * holds a copy. The slider handles its own arrow, Page, Home and End keys for
 * the reason `cdar-curve` does: `End` has to land on exactly `K_MAX` rather
 * than on whatever the browser's own rounding produces, and `aria-valuetext`
 * has to be re-read along the same path a drag takes.
 *
 * `Run worst-case search` stays in the bar in both modes, because the toolbar
 * is shared and a control that disappears with a tab is not shared. It puts the
 * page back into the forward mode before it runs: the search populates the
 * forward regions, and running a search whose result is on the other tab would
 * be an action with no visible outcome. `loadScenario` in the service already
 * moves the mode to the one that owns the result it restores; this is the same
 * rule applied to a result the page has just produced.
 */
@Component({
  selector: 'app-stress-toolbar',
  imports: [ButtonDirective, PageContextBar, SelectDirective],
  templateUrl: './stress-toolbar.html',
  /**
   * The spec's `Sticky in cima al contenuto` lives here rather than on
   * `app-page-context-bar`'s inner bar. That bar declares `position: sticky`,
   * but its containing block is the wrapper component's own box, which is
   * exactly as tall as the bar — a sticky box with no room to slide never
   * moves. Hoisting the stickiness to this host puts the bar in the page's
   * scrolling column, which is the box it has to stay at the top of.
   */
  // `contents`, so the wrapper generates no box at all and the
  // app-page-context-bar inside it sticks against the page's scroll column.
  // This previously carried the sticky itself, as a local workaround for the
  // bar's own stickiness being inert; that root cause is now fixed on
  // PageContextBar, and duplicating it here would give two nested sticky boxes.
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StressToolbar {
  private readonly service = inject(StressTestingService);

  protected readonly measures = IMPACT_MEASURES;
  protected readonly measureLabel = IMPACT_MEASURE_LABEL;
  protected readonly measureDefinition = IMPACT_MEASURE_DEFINITION;
  protected readonly kHint = K_HINT;
  protected readonly staleNote = STALE_RESULT_NOTE;
  protected readonly nothingToSaveReason = NOTHING_TO_SAVE_REASON;
  protected readonly busyReason = BUSY_REASON;

  protected readonly min = K_MIN;
  protected readonly max = K_MAX;
  protected readonly step = K_STEP;

  protected readonly impactMeasure = this.service.impactMeasure;
  protected readonly measureUnit = this.service.measureUnit;
  protected readonly ellipsoidLabel = this.service.ellipsoidLabel;
  protected readonly k = this.service.k;
  protected readonly anyStale = this.service.anyStale;
  protected readonly canSave = this.service.canSave;
  protected readonly pendingAction = this.service.pendingAction;

  /** A search is in flight: the controls stay visible and refuse input. */
  protected readonly busy = computed(() => this.service.loading());

  protected readonly searching = computed(() => this.pendingAction() === 'worst-case');

  protected readonly kText = computed(() => kLabel(this.k()));

  /** What a screen reader hears as the handle moves, per `### Accessibilità`. */
  protected readonly valueText = computed(
    () => `Mahalanobis radius ${this.kText()}, Ell_${this.kText()}`,
  );

  protected readonly currentMeasureDefinition = computed(
    () => IMPACT_MEASURE_DEFINITION[this.impactMeasure()],
  );

  /**
   * Which of the three results `Save scenario` would store.
   *
   * The bar is shared, so the last result computed is not necessarily the one
   * the reader is looking at — a worst case run from the forward tab is still
   * what this button would save after a switch to Reverse. Naming it is the
   * difference between an action and a guess.
   */
  protected readonly savableLabel = computed(() => {
    const kind = this.service.savableKind();
    return kind === null ? '' : SCENARIO_KIND_LABEL[kind].toLowerCase();
  });

  protected onMeasure(event: Event): void {
    this.service.setImpactMeasure((event.target as HTMLSelectElement).value as ImpactMeasureId);
  }

  /**
   * The number field commits on change rather than on every keystroke.
   *
   * `k` is clamped and rounded to the step, so a live write would rewrite the
   * field under the person typing `12` the instant they had typed `1`. The
   * accepted value is echoed back afterwards, which is what makes a rejected or
   * clamped entry visible instead of leaving the field showing a radius the
   * page is not using.
   */
  protected onKField(event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Number(field.value);
    if (Number.isFinite(value) && field.value.trim() !== '') this.service.setK(value);
    field.value = this.kText();
  }

  protected onKSlider(event: Event): void {
    this.setK(Number((event.target as HTMLInputElement).value));
  }

  /**
   * Arrows step, Page jumps, Home and End reach the ends exactly.
   *
   * `preventDefault` on exactly the keys handled here: the browser would
   * otherwise apply its own step on top of this one and the handle would move
   * twice per press. A modified arrow is somebody else's chord, left alone.
   */
  protected onKKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const current = this.k();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + this.step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - this.step;
        break;
      case 'PageUp':
        next = current + this.step * PAGE_STEPS;
        break;
      case 'PageDown':
        next = current - this.step * PAGE_STEPS;
        break;
      case 'Home':
        next = this.min;
        break;
      case 'End':
        next = this.max;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.setK(next);
  }

  protected onSave(): void {
    this.service.saveScenario();
  }

  /**
   * The button stays focusable while the search runs, so the handler is what
   * refuses the second press — including the mode change, which would
   * otherwise move the tab out from under a search already in flight.
   */
  protected onRunWorstCase(): void {
    if (this.busy()) return;
    this.service.setMode('forward');
    void this.service.runWorstCase();
  }

  /** Rounded to the step before the service clamps it — `0.05` drifts in binary. */
  private setK(value: number): void {
    if (Number.isNaN(value)) return;
    this.service.setK(Math.round(value * 100) / 100);
  }
}
