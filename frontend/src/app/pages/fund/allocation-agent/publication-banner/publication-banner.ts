import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { AllocationAgentService } from '../../../../services/allocation-agent.service';

/**
 * Publication of the proposal to the shared fund state.
 *
 * This is the agent's only output channel — the risk and execution agents read
 * the state, they are never called from here (Fondamenti §1). Two rules follow,
 * and the component exists to hold them apart:
 *
 * A failure never looks like a success. The failed variant is `role="alert"`,
 * keeps the words "was not updated", and leaves the proposal exactly where it
 * was; retrying re-sends the same allocation without recomputing it.
 *
 * A stale publication is not a failure. A newer z_t arriving after the last
 * publish makes what was written obsolete, not wrong, and it is labelled that
 * way rather than with an error.
 */
@Component({
  selector: 'app-publication-banner',
  imports: [ConfirmDialog],
  templateUrl: './publication-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicationBanner {
  private readonly service = inject(AllocationAgentService);

  protected readonly publication = this.service.publication;
  protected readonly canPublish = this.service.canPublish;
  protected readonly modified = this.service.modified;
  protected readonly computeError = this.service.computeError;

  protected readonly confirming = signal(false);
  protected readonly publishing = signal(false);
  protected readonly detailOpen = signal(false);
  protected readonly announcement = signal('');

  /** Why the publish button is off, in the words that name the fix. */
  protected readonly blockedReason = computed(() => {
    if (this.computeError()) return 'The last run failed. Re-run the agent before publishing.';
    if (this.modified())
      return 'The configuration has changed since the last run. Run the agent so the published allocation is the one that was solved.';
    return '';
  });

  protected async confirmPublish(): Promise<void> {
    this.confirming.set(false);
    this.detailOpen.set(false);
    this.publishing.set(true);
    await this.service.publish();
    this.publishing.set(false);
    this.announcement.set(
      this.publication().state === 'published'
        ? 'Proposed allocation published to the fund state.'
        : 'Publish failed. The fund state was not updated.',
    );
  }
}
