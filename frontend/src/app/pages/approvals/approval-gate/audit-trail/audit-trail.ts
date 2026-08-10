import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { CardTitle, InfoCard } from '../../../../shared/info-card/info-card';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';

let nextId = 0;

/**
 * Region 9 — every checkpointed transition of the selected trade.
 *
 * Present for every trade in the queue, decided or not, and collapsed by
 * default: the trail is what makes the pipeline replayable rather than a log of
 * the interesting bits, and most readings of this page do not need it open.
 *
 * The disclosure is a real `<button>` carrying `aria-expanded` and
 * `aria-controls`, and collapsing removes the list from the DOM rather than
 * hiding it, so a collapsed trail is absent from the accessibility tree as well
 * as from the page. Toggling it changes nothing else — the doc is explicit that
 * expanding the history must not disturb the current selection.
 */
@Component({
  selector: 'app-approval-audit-trail',
  imports: [ButtonDirective, CardTitle, InfoCard],
  templateUrl: './audit-trail.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditTrail {
  private readonly service = inject(ApprovalGateService);

  protected readonly checkpoints = this.service.selectedCheckpoints;
  protected readonly count = computed(() => this.checkpoints().length);

  protected readonly expanded = signal(false);

  /** Per-instance, so `aria-controls` cannot point at another card's region. */
  protected readonly regionId = `approval-audit-trail-${nextId++}`;

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }
}
