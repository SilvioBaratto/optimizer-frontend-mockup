import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  linkedSignal,
  output,
} from '@angular/core';

import { ALREADY_DECIDED, NOT_AT_GATE } from '../../../../models/approval.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { InfoCard } from '../../../../shared/info-card/info-card';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { formatExactNotional, formatShares } from '../approval-format';

/** Which button opened the confirmation, and therefore what Confirm will do. */
type PendingDecision = 'approve' | 'reject';

let nextId = 0;

/**
 * Region 8 — the decision, and the only place on the page anything is written.
 *
 * Three properties are the spec's, and each is a rule rather than a preference.
 *
 * **The sentence above the buttons is not written here.** It is
 * `ApprovalGateService.decisionSentence()`, the same string the posture banner
 * at the top of the page prints, derived from one map keyed by broker posture.
 * The doc says the sentence "è derivata univocamente dalla postura mostrata
 * nello StatusBanner … non introduce un'affermazione indipendente", and a
 * second sentence composed here — however carefully — would be that
 * independent assertion.
 *
 * **The buttons are disabled, not removed.** Away from the human gate they stay
 * in the DOM, `aria-disabled="true"`, with the reason wired through
 * `aria-describedby`. A control that vanishes teaches a screen-reader user
 * nothing; one that announces itself as unavailable and says why teaches them
 * where the trade actually is. What *is* absent for the other three steps is
 * the decision row itself — the posture sentence and the note field — because
 * there is nothing to note about a decision that cannot be taken.
 *
 * **Nothing is submitted on the first click.** Both buttons open
 * `app-confirm-dialog` with the expected outcome spelled out in the posture's
 * own terms, focus lands on Cancel rather than Confirm, and focus returns to
 * the button that opened it. A failed write keeps the typed note and says so.
 */
@Component({
  selector: 'app-approval-decision-row',
  imports: [ActionButtonRow, ButtonDirective, ConfirmDialog, InfoCard],
  templateUrl: './decision-row.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionRow {
  private readonly service = inject(ApprovalGateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Raised once a decision has landed, so the panel can take focus back. */
  readonly decided = output<void>();

  protected readonly trade = this.service.selectedTrade;
  protected readonly canDecide = this.service.canDecide;
  protected readonly deciding = this.service.deciding;
  protected readonly decisionError = this.service.decisionError;

  /** The one sentence, shared verbatim with the posture banner. */
  protected readonly sentence = this.service.decisionSentence;

  /**
   * The trade this region is currently about.
   *
   * Angular keeps one instance of this component across selections — the
   * branch it sits in stays mounted while one pending trade replaces another —
   * so everything the reader typed about the old trade has to be tied to that
   * trade explicitly. A `signal('')` was not: a note written about TRD-2031
   * survived the click onto TRD-2030 and would have been recorded against it.
   */
  private readonly subject = computed(() => this.trade()?.tradeId ?? null);

  protected readonly note = linkedSignal<string | null, string>({
    source: this.subject,
    computation: () => '',
  });

  /** Reset with the note: a confirmation is about one trade, never the next. */
  protected readonly pending = linkedSignal<string | null, PendingDecision | null>({
    source: this.subject,
    computation: () => null,
  });

  /** Per-instance so `aria-describedby` cannot point at another panel's reason. */
  protected readonly reasonId = `approval-decision-reason-${nextId++}`;

  /**
   * Why the two buttons are unavailable, in the words the service refuses with.
   *
   * The same two messages `decide()` would return, so the reason announced
   * before the attempt and the reason returned after one cannot disagree.
   */
  protected readonly reason = computed(() => {
    const trade = this.trade();
    if (trade === null || trade.stage !== 'human-gate') return NOT_AT_GATE;
    return ALREADY_DECIDED;
  });

  protected readonly dialogTitle = computed(() => {
    const id = this.trade()?.tradeId ?? 'this trade';
    return this.pending() === 'reject' ? `Reject ${id}?` : `Approve ${id}?`;
  });

  protected readonly confirmLabel = computed(() =>
    this.pending() === 'reject' ? 'Reject trade' : 'Approve trade',
  );

  /**
   * What Confirm will actually do, restated before it is pressed.
   *
   * The approval branch is `approvalSummary()` — the posture's own reading of
   * "approved", so the dialog says "routed to the broker" or "authorised for
   * manual placement" rather than a generic "are you sure". The rejection
   * branch names both things that will *not* happen, because with no adapter
   * registered the difference between the two outcomes is otherwise invisible.
   */
  protected readonly dialogMessage = computed(() => {
    const trade = this.trade();
    if (trade === null) return '';
    const subject = `${trade.symbol} ${trade.side.toUpperCase()} ${formatShares(trade.quantity)} (${formatExactNotional(trade.notionalValue)})`;
    return this.pending() === 'reject'
      ? `${subject} will be recorded as rejected at the human gate. Nothing is routed and nothing is authorised for placement, and the outcome cannot be rewritten afterwards.`
      : `${subject}. ${this.service.approvalSummary()}`;
  });

  /** The button the dialog was opened from, so focus can go back to it. */
  private opener: HTMLElement | null = null;
  private dialogOpen = false;

  constructor() {
    effect(() => {
      if (this.pending() === null) {
        this.dialogOpen = false;
        return;
      }
      if (this.dialogOpen) return;
      this.dialogOpen = true;
      // After the render that opens the dialog. The native <dialog> focuses
      // its first control on showModal(), which is already Cancel; this makes
      // the guarantee the spec asks for explicit rather than incidental, so an
      // irreversible action is never one keystroke from the opener.
      queueMicrotask(() => this.focusCancel());
    });
  }

  protected onNote(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Opens the confirmation. `aria-disabled` announces but does not block, so
   * the guard is here: a button that says it is unavailable must be.
   */
  protected ask(decision: PendingDecision, event: Event): void {
    if (!this.canDecide() || this.deciding()) return;
    this.opener = event.currentTarget as HTMLElement;
    this.service.clearDecisionError();
    this.pending.set(decision);
  }

  protected cancel(): void {
    if (this.pending() === null) return;
    this.pending.set(null);
    this.restoreFocus();
  }

  /**
   * Submits, then gets out of the way.
   *
   * On success the note is cleared and `decided` is raised: this whole region
   * is about to be replaced by the historical-outcome card, so focus is handed
   * to the panel heading rather than left on a button that no longer exists.
   * On failure the dialog closes but the note survives — the service records
   * nothing on a failed write, the trade is still waiting, and re-typing the
   * reason would be a second punishment for the first failure.
   */
  protected async confirm(): Promise<void> {
    const decision = this.pending();
    const trade = this.trade();
    if (decision === null || trade === null) return;
    // The dialog stays up for the length of the write, so Confirm can be
    // pressed twice. One confirmation is one decision.
    if (this.deciding()) return;

    const result = await this.service.decide(trade.tradeId, decision === 'approve', this.note());
    this.pending.set(null);

    if (!result.ok) {
      this.restoreFocus();
      return;
    }

    this.note.set('');
    this.decided.emit();
  }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    queueMicrotask(() => opener?.focus());
  }

  private focusCancel(): void {
    const cancel = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('dialog button'),
    ).find((button) => button.textContent?.trim() === 'Cancel');
    cancel?.focus();
  }
}
