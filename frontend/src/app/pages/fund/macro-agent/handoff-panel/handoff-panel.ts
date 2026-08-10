import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { ConfirmDialog } from '../../../../shared/confirm-dialog/confirm-dialog';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { MacroRegimeService } from '../../../../services/macro-regime.service';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/** Windows the log can be filtered to. */
const RANGES = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: 100000 },
];

/**
 * What the agent would write to the shared state, and what it has written
 * before.
 *
 * Publishing overwrites the payload the allocation, risk and execution agents
 * read, so it is never a single click: the button opens a confirmation showing
 * the full diff first. And it stays off entirely when nothing has changed —
 * republishing an identical payload only muddies the audit trail.
 */
@Component({
  selector: 'app-handoff-panel',
  imports: [ConfirmDialog, CrossPageLink, StatusBadge,
    ButtonDirective,
    SelectDirective,
  ],
  templateUrl: './handoff-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandoffPanel {
  private readonly service = inject(MacroRegimeService);

  /** `preview` is the overview card; `log` is the full publication history. */
  readonly mode = input<'preview' | 'log'>('preview');

  protected readonly ranges = RANGES;
  protected readonly payload = this.service.payload;
  protected readonly hasChanges = this.service.hasChangesToPublish;
  protected readonly lastPublished = this.service.lastPublished;
  protected readonly log = this.service.handoffLog;

  protected readonly confirming = signal(false);
  protected readonly announcement = signal('');
  protected readonly query = signal('');
  protected readonly range = signal('90');

  protected readonly changedLines = computed(() => this.payload().filter((line) => line.changed));

  protected readonly filteredLog = computed(() => {
    const q = this.query().trim().toLowerCase();
    const days = RANGES.find((r) => r.id === this.range())?.days ?? 90;
    // The log is short and fixed; the cut-off is measured from its newest entry
    // so the filter stays meaningful without a live clock.
    const newest = new Date(this.log[0].at.replace(' ', 'T'));
    const cutoff = new Date(newest.getTime() - days * 86400000);

    return this.log.filter((entry) => {
      const at = new Date(entry.at.replace(' ', 'T'));
      if (at < cutoff) return false;
      if (!q) return true;
      return (
        entry.summary.toLowerCase().includes(q) ||
        entry.author.toLowerCase().includes(q) ||
        entry.driver.toLowerCase().includes(q)
      );
    });
  });

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onRange(event: Event): void {
    this.range.set((event.target as HTMLSelectElement).value);
  }

  protected performPublish(): void {
    this.confirming.set(false);
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
    this.service.publish(at);
    this.announcement.set('Payload published to the shared fund state.');
  }
}
