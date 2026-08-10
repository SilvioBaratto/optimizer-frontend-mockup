import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  APPROVAL_EFFECT_DETAIL,
  APPROVAL_EFFECT_LABEL,
  APPROVAL_OUTCOME_ICON,
  APPROVAL_OUTCOME_LABEL,
} from '../../../../models/approval.model';
import { BROKER_POSTURE_LABEL } from '../../../../models/order.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { InfoCard } from '../../../../shared/info-card/info-card';

/** An approval whose reading was never recorded. Said, not guessed. */
const EFFECT_UNKNOWN =
  'The reading of this approval was not recorded with it, so whether the order was routed or ' +
  'authorised for manual placement cannot be recovered from here.';

const REJECTED_DETAIL =
  'Rejected at the human gate — nothing was routed and nothing was authorised for placement.';

/**
 * Region 10 — what was decided, and which of the two things "approved" meant.
 *
 * It replaces the decision row for a trade that is no longer waiting, and the
 * distinction the doc insists on is the whole content of the card: with an
 * adapter registered, approving handed the order to it and a real order left
 * the system; with none — the default posture — approving meant "authorised so
 * that you can place it", and nothing left. The card states which, in words,
 * every time.
 *
 * The reading and the posture come from the record written at the moment of the
 * decision, never re-derived from today's posture. Registering an adapter this
 * afternoon must not relabel this morning's approvals as routed: those orders
 * never left the system, and the audit trail would be claiming they did.
 */
@Component({
  selector: 'app-approval-decision-outcome',
  imports: [InfoCard],
  templateUrl: './decision-outcome.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionOutcome {
  private readonly service = inject(ApprovalGateService);

  protected readonly decision = this.service.selectedDecision;

  protected readonly outcomeLabel = APPROVAL_OUTCOME_LABEL;
  protected readonly outcomeIcon = APPROVAL_OUTCOME_ICON;
  protected readonly effectLabel = APPROVAL_EFFECT_LABEL;
  protected readonly postureLabel = BROKER_POSTURE_LABEL;

  /** The sentence that says which of the two readings applied. */
  protected readonly meaning = computed(() => {
    const decision = this.decision();
    if (decision === null) return '';
    if (decision.outcome === 'rejected') return REJECTED_DETAIL;
    return decision.effect === null ? EFFECT_UNKNOWN : APPROVAL_EFFECT_DETAIL[decision.effect];
  });
}
