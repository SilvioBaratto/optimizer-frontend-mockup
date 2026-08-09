import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  BROKER_POSTURE_ICON,
  BROKER_POSTURE_LABEL,
  type BrokerPosture,
} from '../../../../models/order.model';
import { ExecutionService } from '../../../../services/execution.service';

/**
 * What the broker posture means for everything else on the page, stated once.
 *
 * Not `app-status-banner`, and the reason is in the spec rather than in taste:
 * the shared banner has exactly two variants, `success` (dismissible, prefixed
 * "Success —") and `error` (prefixed "Error —", with a Retry button). This
 * region's default reading is neither a success nor a failure — no adapter
 * registered is the product's normal posture — and the spec is explicit that it
 * is *not* dismissible and carries no action, because it conditions how the
 * whole page reads. Reusing the shared banner would have printed "Success — no
 * broker configured" beside a dismiss button that hides the one sentence
 * explaining why nothing on this page can send an order.
 *
 * `role="alert"` only for `error`: an adapter that has stopped sending is a
 * failure the reader has to hear now. The other two postures are announced
 * politely.
 */
@Component({
  selector: 'app-execution-broker-banner',
  templateUrl: './broker-banner.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrokerBanner {
  private readonly service = inject(ExecutionService);

  protected readonly broker = this.service.broker;
  protected readonly posture = this.service.brokerPosture;

  protected readonly label = computed(() => BROKER_POSTURE_LABEL[this.posture()]);
  protected readonly icon = computed(() => BROKER_POSTURE_ICON[this.posture()]);

  /**
   * The three readings of the pipeline, one per posture.
   *
   * Each names what still holds, not only what does not: with no adapter the
   * sizing, the schedule and the impact estimate remain the agent's honest
   * work, and the human simply places the order.
   */
  private static readonly MESSAGE: Record<BrokerPosture, string> = {
    'not-configured':
      'approved orders stop here and are executed manually. Sizing, scheduling and estimated ' +
      'market impact stay valid — the human gate is the last step an order can reach.',
    connected:
      'approved orders are sent to the broker after the human gate. Nothing on this page sends ' +
      'them: the adapter is reached only after a person signs the approval.',
    error:
      'sending is halted and the approved order list stays intact. Orders wait at the human gate ' +
      'until the adapter recovers; none of them has been placed.',
  };

  protected readonly message = computed(() => BrokerBanner.MESSAGE[this.posture()]);
}
