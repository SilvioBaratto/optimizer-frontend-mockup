import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { BacktestValidationService } from '../../../../services/backtest-validation.service';

/**
 * The second validation criterion (§7): a reason the strategy should work that
 * does not come from the backtest.
 *
 * Locking is the whole mechanism. A rationale that can still be edited after
 * the results are known is not independent of them, so the lock is
 * irreversible and gated behind an explicit confirmation — the attestation
 * checkbox alone would be too easy to tick on the way past.
 */
@Component({
  selector: 'app-economic-rationale',
  imports: [ConfirmDialog, StatusBadge],
  templateUrl: './economic-rationale.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EconomicRationale {
  private readonly service = inject(BacktestValidationService);

  protected readonly text = this.service.rationaleText;
  protected readonly attested = this.service.rationaleAttested;
  protected readonly locked = this.service.rationaleLocked;
  protected readonly savedAt = this.service.rationaleSavedAt;
  protected readonly author = this.service.rationaleAuthor;
  protected readonly canLock = this.service.canLockRationale;

  protected readonly confirmingLock = signal(false);
  protected readonly announcement = signal('');

  protected onText(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAttested(event: Event): void {
    this.attested.set((event.target as HTMLInputElement).checked);
  }

  protected saveDraft(): void {
    this.service.saveRationale(now());
    this.announcement.set('Rationale draft saved.');
  }

  protected performLock(): void {
    this.confirmingLock.set(false);
    this.service.lockRationale(now());
    this.announcement.set('Rationale locked. It can no longer be edited.');
  }
}

function now(): string {
  return new Date().toTimeString().slice(0, 5);
}
