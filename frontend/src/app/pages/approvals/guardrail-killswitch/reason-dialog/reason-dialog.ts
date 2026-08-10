import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { FocusTrapDirective } from '../../../../shared/ui/focus-trap/focus-trap.directive';

/** Per-instance, so two dialogs on one page cannot share a `<label for>` target. */
let nextId = 0;

/**
 * The confirmation that will not take "yes" for an answer.
 *
 * Two controls on this page move the deterministic pass/fail boundary: the
 * global kill-switch, and switching off a limit whose scope *is* the
 * kill-switch condition. The spec holds both behind the same gate — a written
 * rationale, recorded in the audit trail with the actor and the time — so they
 * share this component rather than growing two dialogs that drift apart.
 *
 * `app-confirm-dialog` could not be reused. It is a native `<dialog>` with a
 * fixed Cancel/Confirm pair and no room for a field, and this dialog's whole
 * job is the field plus the blocking error that keeps it open. Three
 * properties are load-bearing and none of them are decoration:
 *
 * - **`error` never closes the dialog.** The parent decides when to close; a
 *   failed write hands back a message and the dialog stays exactly where it
 *   is, with the rationale the operator typed still in the field.
 * - The confirm action reads **Retry** while an error stands, so the second
 *   press is visibly a second attempt at the same write rather than a new one.
 * - `role="alertdialog"`, because this interrupts: the doc names the role, and
 *   an operator halting trading is not browsing a form.
 *
 * Initial focus goes to the rationale field rather than to Cancel. That is a
 * deliberate departure from the house rule for destructive dialogs, and the
 * doc's `### Accessibilità` asks for it by name ("sposta il focus iniziale sul
 * campo Motivo del cambio di stato"): the field is *why* this dialog exists,
 * and confirm is unreachable without filling it in, so the accidental-confirm
 * hazard the house rule guards against is already closed by the validation.
 * `FocusTrapDirective` focuses the first focusable child, and the field is it.
 */
@Component({
  selector: 'app-reason-dialog',
  imports: [ButtonDirective, FocusTrapDirective],
  templateUrl: './reason-dialog.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReasonDialog {
  readonly open = input(false);
  readonly title = input.required<string>();
  /** What confirming would do, in one sentence. */
  readonly message = input('');
  readonly reasonLabel = input('Reason for the state change');
  readonly reasonHint = input('');
  readonly confirmLabel = input.required<string>();
  /** Styles confirm as destructive — engaging the switch, disabling a limit. */
  readonly destructive = input(false);
  /** The write is in flight: confirm is held down so it cannot be double-sent. */
  readonly busy = input(false);
  /**
   * Blocking failure. Present ⟹ the dialog stays open and the rationale stays
   * in the field.
   */
  readonly error = input<string | null>(null);

  /**
   * Whether pressing confirm again could fix the standing `error`.
   *
   * A write that did not land can be retried, so confirm reads **Retry**. A
   * rationale that was left blank cannot: nothing was attempted, the operator
   * has to type one, and relabelling the button "Retry" would claim a round
   * trip that never happened. It is also what decides `aria-invalid` — a
   * transport failure says nothing about the value in the field, and marking a
   * perfectly good rationale invalid is a lie told to a screen reader.
   */
  readonly retryable = input(true);

  /**
   * Two-way so the parent keeps the text across a failed write.
   *
   * The field itself is destroyed and re-created every time `open` flips, so a
   * value held only in the DOM would be lost on the next render. The parent
   * owns it; this dialog only edits it.
   */
  readonly reason = model('');

  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  private readonly uid = `reason-dialog-${nextId++}`;
  protected readonly titleId = `${this.uid}-title`;
  protected readonly messageId = `${this.uid}-message`;
  protected readonly fieldId = `${this.uid}-reason`;
  protected readonly errorId = `${this.uid}-error`;
  protected readonly hintId = `${this.uid}-hint`;

  protected onReason(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected confirm(): void {
    this.confirmed.emit(this.reason());
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  /** What the field is described by, in the order a reader needs it. */
  protected describedBy(): string {
    return [this.error() ? this.errorId : '', this.reasonHint() ? this.hintId : '']
      .filter((id) => id !== '')
      .join(' ');
  }
}
