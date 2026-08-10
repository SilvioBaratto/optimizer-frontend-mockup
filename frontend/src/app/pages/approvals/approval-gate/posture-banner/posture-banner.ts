import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { BROKER_POSTURE_LABEL, type BrokerPosture } from '../../../../models/order.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';

/**
 * Region 1 — the broker posture, and what approving means under it.
 *
 * Not `app-status-banner`, and the reason is the spec's rather than taste: the
 * shared banner has two variants, `success` (dismissible) and `error` (prefixed
 * "Error —", with a Retry). This region's default reading is neither. No
 * adapter registered is the product's *normal* posture, the doc says the banner
 * is "sempre visibile … non collassabile", and it carries no action — there is
 * nothing here to retry and nothing to dismiss. Reusing the shared component
 * would have printed "Success — no broker configured" beside a close button
 * that hides the one sentence conditioning how the whole page reads.
 *
 * The sentence under the badge is `ApprovalGateService.decisionSentence()` —
 * the *same string* the decision row prints above the Approve button. The doc
 * is explicit that the decision row's sentence must be derived from the posture
 * shown here and must not introduce an independent assertion; deriving them
 * both from one map keyed by posture is the only arrangement in which they
 * cannot drift. A second, prettier sentence written by hand here would be
 * exactly the second assertion the spec forbids.
 *
 * `role="status"` with `aria-live="polite"`: a live region is not announced on
 * the render that creates it, only on later changes, which is precisely the
 * doc's "solo per i cambi di postura avvenuti durante la sessione, non per il
 * caricamento iniziale". Not `alert` even for `error` — the doc names polite,
 * and an adapter fault does not change what the reader may do on this page, it
 * only changes what approving will mean.
 */
@Component({
  selector: 'app-approval-posture-banner',
  imports: [StatusBadge],
  templateUrl: './posture-banner.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostureBanner {
  private readonly service = inject(ApprovalGateService);

  protected readonly broker = this.service.broker;
  protected readonly posture = this.service.brokerPosture;

  /** `NO BROKER CONFIGURED`, `BROKER CONNECTED: IBKR`. */
  protected readonly badgeLabel = computed(() => {
    const adapter = this.broker().adapter;
    const label = BROKER_POSTURE_LABEL[this.posture()].toUpperCase();
    return adapter === null ? label : `${label}: ${adapter.toUpperCase()}`;
  });

  /**
   * `not-configured` is `neutral`, not `warn`.
   *
   * The doc's own grounding is that no broker is the default posture rather
   * than a limitation being worked around: everything up to the last metre
   * works, and only the placement of the order is the person's job. A warning
   * tone would tell the reader something is wrong when nothing is.
   */
  private static readonly TONE: Record<BrokerPosture, StatusTone> = {
    'not-configured': 'neutral',
    connected: 'active',
    error: 'alert',
  };

  protected readonly tone = computed(() => PostureBanner.TONE[this.posture()]);

  /** The one sentence, shared verbatim with the decision row. */
  protected readonly effectSentence = this.service.decisionSentence;

  /**
   * What would change the posture, and what it forecloses meanwhile.
   *
   * A claim about the pipeline, never a second claim about routing: the
   * sentence above already said what approving does, and this one says only
   * which step can run at all. With no adapter — or with one that has stopped
   * sending — the fourth step does not execute, which is why no card in the
   * queue can carry a Broker Adapter badge while this posture is in force.
   */
  protected readonly context = computed(() => {
    switch (this.posture()) {
      case 'connected':
        return (
          'The broker adapter is the fourth and last of the mandatory steps: it is the only ' +
          'point at which a real order leaves the system, and it runs only after a person signs here.'
        );
      case 'error':
        return (
          `${this.broker().detail ?? 'The registered adapter has stopped sending.'} ` +
          'No trade can stand at the Broker Adapter step until it recovers.'
        );
      default:
        return (
          `Posture switches to ${BROKER_POSTURE_LABEL.connected} once an adapter is registered — ` +
          'registering one is an action you take, not a state the system reaches on its own. ' +
          'Until then no trade can stand at the Broker Adapter step.'
        );
    }
  });
}
