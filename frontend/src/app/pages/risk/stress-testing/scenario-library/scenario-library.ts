import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import {
  DELETE_SCENARIO_MESSAGE,
  DELETE_SCENARIO_TITLE,
  EMPTY_LIBRARY_DETAIL,
  EMPTY_LIBRARY_MESSAGE,
  LIBRARY_FILTERS,
  LIBRARY_FILTER_LABEL,
  REVERSE_OUTCOME_RESULT_LABEL,
  SCENARIO_KIND_ICON,
  SCENARIO_KIND_LABEL,
  type LibraryFilter,
  type SavedScenario,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import {
  NOT_APPLICABLE,
  kLabel,
  lossPoints,
  mahaLabel,
  measureValue,
  normaliseMinus,
} from '../stress-format';

/**
 * Region 7 — the saved scenarios, in both modes.
 *
 * A row records the parameters as well as the figures, and the columns print
 * both, because a CEP means nothing without the impact measure it was taken in
 * and the radius it was searched at. That is also what lets `Load` reproduce a
 * row exactly: the service restores `k` and the measure first and re-derives
 * the result from them, so a library row can never show a figure the current
 * model would not produce again.
 *
 * `Load` is the one control on the page that moves the reader between tabs, and
 * it does so because the row decides which mode owns it: loading a reverse row
 * with the forward panels on screen would restore a result into a region that
 * is not visible.
 *
 * `Delete` is the page's only destructive action and never fires on the first
 * click. The confirmation opens with focus on Cancel — the native `<dialog>`
 * happens to focus its first control, which is already Cancel, and this makes
 * that a guarantee rather than an accident — and focus goes back to the row's
 * own Delete button on cancel, or to the region heading once the row it lived
 * on has been removed.
 */
@Component({
  selector: 'app-stress-scenario-library',
  imports: [ButtonDirective, ConfirmDialog, EmptyState, SelectDirective],
  templateUrl: './scenario-library.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioLibrary {
  private readonly service = inject(StressTestingService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly filters = LIBRARY_FILTERS;
  protected readonly filterLabel = LIBRARY_FILTER_LABEL;
  protected readonly kindLabel = SCENARIO_KIND_LABEL;
  protected readonly kindIcon = SCENARIO_KIND_ICON;
  protected readonly notApplicable = NOT_APPLICABLE;
  protected readonly emptyMessage = EMPTY_LIBRARY_MESSAGE;
  protected readonly emptyDetail = EMPTY_LIBRARY_DETAIL;
  protected readonly deleteTitle = DELETE_SCENARIO_TITLE;

  protected readonly rows = this.service.visibleLibrary;
  protected readonly total = this.service.libraryCount;
  protected readonly filter = this.service.libraryFilter;

  protected readonly busy = computed(() => this.service.loading());

  /** Nothing saved at all, as against nothing matching the current filter. */
  protected readonly libraryEmpty = computed(() => this.total() === 0);

  protected readonly filteredOut = computed(
    () => !this.libraryEmpty() && this.rows().length === 0,
  );

  protected readonly filteredOutMessage = computed(
    () =>
      `No ${this.filterLabel[this.filter()].toLowerCase()} scenarios saved. The library still holds ${this.total()} — choose “All types” to see them.`,
  );

  protected readonly countLabel = computed(() => {
    const total = this.total();
    const noun = total === 1 ? 'scenario' : 'scenarios';
    if (this.filter() === 'all') return `${total} ${noun} saved`;
    return `${this.rows().length} of ${total} ${noun} shown`;
  });

  /** The row awaiting confirmation, so the dialog can name what it will remove. */
  protected readonly pendingDelete = signal<SavedScenario | null>(null);

  protected readonly deleteMessage = computed(() => {
    const row = this.pendingDelete();
    return row === null
      ? DELETE_SCENARIO_MESSAGE
      : `“${normaliseMinus(row.name)}” — ${DELETE_SCENARIO_MESSAGE}`;
  });

  /** The Delete button the confirmation was opened from, so focus can go back. */
  private opener: HTMLElement | null = null;
  private dialogOpen = false;

  constructor() {
    effect(() => {
      if (this.pendingDelete() === null) {
        this.dialogOpen = false;
        return;
      }
      if (this.dialogOpen) return;
      this.dialogOpen = true;
      // After the render that opens the dialog. The native <dialog> focuses its
      // first control on showModal(), which is already Cancel; this makes the
      // guarantee explicit rather than incidental, so a destructive action is
      // never one keystroke from the button that opened the confirmation.
      queueMicrotask(() => this.focusCancel());
    });
  }

  protected name(row: SavedScenario): string {
    return normaliseMinus(row.name);
  }

  protected radius(value: number): string {
    return kLabel(value);
  }

  protected maha(value: number): string {
    return mahaLabel(value);
  }

  /**
   * The CEP column, in the row's own unit.
   *
   * A reverse row has no CEP to print: it reports the plausibility an outcome
   * costs, not a profit, so the outcome's own word goes here instead.
   */
  protected cep(row: SavedScenario): string {
    if (row.cep === null) {
      return row.reverse === null
        ? this.notApplicable
        : REVERSE_OUTCOME_RESULT_LABEL[row.reverse.outcome];
    }
    return measureValue(row.cep, row.unit);
  }

  protected loss(row: SavedScenario): string {
    return row.loss === null ? this.notApplicable : lossPoints(row.loss);
  }

  protected onFilter(event: Event): void {
    this.service.setLibraryFilter((event.target as HTMLSelectElement).value as LibraryFilter);
  }

  protected onLoad(row: SavedScenario): void {
    this.service.loadScenario(row.id);
  }

  protected askDelete(row: SavedScenario, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.pendingDelete.set(row);
  }

  protected cancelDelete(): void {
    if (this.pendingDelete() === null) return;
    this.pendingDelete.set(null);
    this.restoreFocus();
  }

  /**
   * Removes the row, then parks focus on the region heading.
   *
   * The button focus was on is about to be destroyed with its row; left alone,
   * focus falls to `<body>` and the next Tab restarts at the top of the page.
   */
  protected confirmDelete(): void {
    const row = this.pendingDelete();
    if (row === null) return;
    this.service.deleteScenario(row.id);
    this.pendingDelete.set(null);
    this.opener = null;
    queueMicrotask(() => this.focusHeading());
  }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    queueMicrotask(() => opener?.focus());
  }

  private focusHeading(): void {
    const heading = this.host.nativeElement.querySelector('#st-library-heading');
    if (heading instanceof HTMLElement) heading.focus();
  }

  private focusCancel(): void {
    const cancel = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find((button) => button.textContent?.trim() === 'Cancel');
    cancel?.focus();
  }
}
