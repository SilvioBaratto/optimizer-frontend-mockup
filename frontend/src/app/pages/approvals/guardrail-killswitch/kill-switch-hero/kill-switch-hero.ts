import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  KILL_SWITCH_ACTION_LABEL,
  KILL_SWITCH_ANNOUNCEMENT,
  KILL_SWITCH_STATUS_ICON,
  KILL_SWITCH_STATUS_LABEL,
  PRE_CHECK_NOTE,
  type KillSwitchStatus,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { HeroStatCard } from '../../../../shared/hero-stat-card/hero-stat-card';
import { RefreshControl } from '../../../../shared/refresh-control/refresh-control';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { ReasonDialog } from '../reason-dialog/reason-dialog';

/** What the ErrorState adds under `Kill-switch status unknown — treat as unsafe`. */
const UNKNOWN_DETAIL =
  'The toggle stays disabled until the real state comes back. Treat the book as if trading were ' +
  'halted: acting on a state nobody has confirmed is the same hazard as acting on a write that ' +
  'silently failed.';

const ENGAGE_MESSAGE =
  'Engaging halts trading: the deterministic pre-check will refuse every proposed order, before ' +
  'any model is called. The change is recorded in the audit trail and is only undone by an ' +
  'explicit release.';

const RELEASE_MESSAGE =
  'Releasing lets proposed orders reach the pre-check again. They still have to clear the hard ' +
  'limits, the rule validators and the human gate.';

const REASON_HINT = 'Recorded in the guardrail audit trail with your name and the time.';

/**
 * Region 1 — the kill-switch, and the page's primary action.
 *
 * This is where doc 17's own blocking review finding is answered. The spec's
 * `### Interazioni` assumed the happy path ("confermare … aggiorna
 * immediatamente la HeroStatCard"); the correction it proposes is implemented
 * here instead, and it is the reason this region owns state at all:
 *
 * - the card renders `killSwitch()` and nothing else, so it **cannot** move
 *   before the service has a confirmed write. There is no optimistic local
 *   copy of the state for a failed round trip to leave behind;
 * - a failed write leaves `dialogOpen` true, leaves `reason` exactly as typed,
 *   and parks the returned message on the dialog, which turns confirm into
 *   Retry;
 * - a blank rationale is refused before any round trip, by the same call.
 *
 * The toggle is the first focusable element on the page, matching the control's
 * deterministic priority, and it is held disabled whenever the state is not
 * known — while the read is in flight, and after a read that failed.
 */
@Component({
  selector: 'app-kill-switch-hero',
  imports: [
    ButtonDirective,
    ErrorState,
    HeroStatCard,
    ReasonDialog,
    RefreshControl,
    SkeletonBlock,
  ],
  templateUrl: './kill-switch-hero.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KillSwitchHero {
  private readonly service = inject(GuardrailService);

  protected readonly statusLabel = KILL_SWITCH_STATUS_LABEL;
  protected readonly statusIcon = KILL_SWITCH_STATUS_ICON;
  protected readonly actionLabel = KILL_SWITCH_ACTION_LABEL;
  protected readonly preCheckNote = PRE_CHECK_NOTE;
  protected readonly unknownDetail = UNKNOWN_DETAIL;
  protected readonly reasonHint = REASON_HINT;

  protected readonly killSwitch = this.service.killSwitch;
  protected readonly status = this.service.killSwitchStatus;
  protected readonly engaged = this.service.killSwitchEngaged;
  protected readonly writing = this.service.killSwitchWriting;
  protected readonly readError = this.service.killSwitchError;
  protected readonly loading = this.service.loading;
  protected readonly readAt = this.service.readAt;

  /** The region is busy while the page reads, and while this region retries. */
  protected readonly busy = computed(
    () => this.loading() || this.service.pendingRegion() === 'kill-switch',
  );

  /**
   * Never offer an action on a value that has not been confirmed.
   *
   * `killSwitchToggleDisabled` already covers the page read and the write in
   * flight; the retry of this one region is the third case — it clears the
   * error before the round trip, so the state is unknown while it runs even
   * though nothing is "loading" page-wide.
   */
  protected readonly toggleDisabled = computed(
    () => this.service.killSwitchToggleDisabled() || this.busy(),
  );

  protected readonly dialogOpen = signal(false);

  /** Lives on the component, not in the DOM: a failed write must not lose it. */
  protected readonly reason = signal('');

  /** Set only from a confirmed write, so the assertive region never lies. */
  protected readonly announcement = signal('');

  /** The blocking message for the dialog — from the write's own result. */
  protected readonly dialogError = signal<string | null>(null);

  /**
   * True only when the message above came back from a round trip.
   *
   * A write that did not land is worth pressing again; a rationale that was
   * never typed is not, and calling that "Retry" would claim an attempt the
   * backend never saw.
   */
  protected readonly dialogRetryable = signal(false);

  /** The state confirming would write. */
  protected readonly target = computed(() => !this.engaged());

  protected readonly targetStatus = computed<KillSwitchStatus>(() =>
    this.target() ? 'engaged' : 'trading-enabled',
  );

  protected readonly dialogTitle = computed(() => this.actionLabel[this.status()]);

  protected readonly dialogMessage = computed(() =>
    this.target() ? ENGAGE_MESSAGE : RELEASE_MESSAGE,
  );

  // --- the primary action ---------------------------------------------------

  protected openDialog(): void {
    this.service.clearKillSwitchActionError();
    this.dialogError.set(null);
    this.dialogRetryable.set(false);
    this.reason.set('');
    this.dialogOpen.set(true);
  }

  /**
   * Confirms the change — and closes the dialog only if the backend said so.
   *
   * Every early return here is the fix: `ok === false` covers both the blank
   * rationale, refused before any round trip, and the write that did not land.
   * In both cases the dialog is left open with the typed reason intact and the
   * validator's or the transport's own message on screen.
   */
  protected async confirm(reason: string): Promise<void> {
    this.reason.set(reason);
    const result = await this.service.setKillSwitch(this.target(), reason);

    if (!result.ok) {
      this.dialogError.set(result.error);
      this.dialogRetryable.set(reason.trim() !== '');
      return;
    }

    this.announcement.set(KILL_SWITCH_ANNOUNCEMENT[this.status()]);
    this.close();
  }

  protected close(): void {
    this.dialogOpen.set(false);
    this.dialogError.set(null);
    this.dialogRetryable.set(false);
    this.reason.set('');
    this.service.clearKillSwitchActionError();
  }

  // --- reads ----------------------------------------------------------------

  protected retryRead(): Promise<void> {
    return this.service.retryRegion('kill-switch');
  }

  protected refresh(): Promise<void> {
    return this.service.refresh();
  }
}
