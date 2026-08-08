import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/**
 * Explicit confirmation for a destructive or irreversible action.
 *
 * Uses the native `<dialog>` element with `showModal()`, which gives the focus
 * trap, the Escape handling and the inert background for free — all three are
 * required by the spec and all three are easy to get subtly wrong by hand.
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  /** Styles the confirm action as destructive. */
  readonly destructive = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (!el) return;
      if (this.open() && !el.open) el.showModal();
      if (!this.open() && el.open) el.close();
    });
  }
}
