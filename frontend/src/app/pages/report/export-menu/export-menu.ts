import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_LABEL,
  type ExportFormat,
} from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';

let nextId = 0;

/**
 * Region 2 — Export, over the filtered set of the active tab.
 *
 * The only action on the page, and the only one that produces anything: it
 * writes a derived file and changes no audit state, which is why it needs no
 * confirmation step. The format is a choice rather than two buttons because
 * the wireframe draws one control, and because "Export" is the verb — CSV and
 * PDF are the same act in two spellings.
 *
 * The menu is a disclosure, not a `<select>`: choosing a format *does* the
 * export, and a select that fires on change would export twice for anyone
 * arrowing through the options. `aria-expanded` and `aria-controls` tie the
 * button to the list, Escape closes it, and focus comes back to the button
 * either way so the reader never loses their place in the row.
 */
@Component({
  selector: 'app-report-export-menu',
  imports: [ActionButtonRow, ButtonDirective],
  templateUrl: './export-menu.html',
  /*
    Escape is caught on the host rather than on the `role="menu"` element: the
    list itself is not focusable, so a handler there would only fire for events
    that bubbled up from an item, and Escape pressed while the trigger still
    holds focus — which is where it is the instant the menu opens — would be
    missed.
  */
  host: { class: 'block', '(keydown)': 'onMenuKeydown($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportMenu {
  private readonly service = inject(ReportAuditService);

  protected readonly formats = EXPORT_FORMATS;
  protected readonly formatLabel = EXPORT_FORMAT_LABEL;

  protected readonly menuId = `report-export-menu-${nextId++}`;
  protected readonly scopeId = `report-export-scope-${nextId++}`;

  private readonly requested = signal(false);

  protected readonly notice = this.service.exportNotice;
  protected readonly rowCount = this.service.exportRowCount;
  protected readonly activeTab = this.service.activeTab;
  protected readonly loading = this.service.loading;

  /**
   * The menu closes itself when a read starts.
   *
   * Derived rather than written from an effect: the list is describing a row
   * count that is being replaced, so it must not survive the read, and a
   * refusal in `choose()` alone would leave a stale scope line hanging over
   * the filters. Focus is on the Refresh control at that moment, never inside
   * the list, so nothing is dropped by the list going away.
   */
  protected readonly open = computed(() => this.requested() && !this.loading());

  /** "the filtered set of the active tab", said in the numbers of the moment. */
  protected readonly scope = computed(
    () => `${this.rowCount()} ${this.activeTab().noun} · ${this.activeTab().title}`,
  );

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('exportTrigger');

  /** Refused while the log is being re-read; `aria-disabled` leaves it clickable. */
  protected toggle(): void {
    if (this.loading()) return;
    this.requested.update((open) => !open);
  }

  protected choose(format: ExportFormat): void {
    if (this.loading()) return;
    this.service.exportActiveSet(format);
    this.close();
  }

  /**
   * Closes and hands focus back.
   *
   * Called from the item, from Escape and from the button itself, so there is
   * exactly one place that decides where focus lands when the menu goes away.
   */
  protected close(): void {
    if (!this.open()) return;
    this.requested.set(false);
    this.trigger()?.nativeElement.focus();
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.open()) return;
    event.preventDefault();
    this.close();
  }
}
