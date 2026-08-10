import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CHECK_RESULT_ICON,
  CHECK_RESULT_LABEL,
  RULE_RESULT_LABEL,
} from '../../../../models/approval.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { InfoCard } from '../../../../shared/info-card/info-card';

/** The page that owns the kill-switch and the limits this card reports on. */
const GUARDRAIL_ROUTE = '/approvals/guardrail-killswitch';

/**
 * Region 7 — what the two automated steps returned for this trade.
 *
 * Read-only, and deliberately without a single threshold number: the limits are
 * configured on Guardrail & Kill-Switch and the rules engine reports an outcome
 * per rule, not a distance from a boundary. Printing "8.2% of 10%" here would
 * be inventing a figure this step never produced.
 *
 * The card's whole reason for existing carefully is `pending`. A limit whose
 * verdict has not come back reads "result pending", never a pass because the
 * trade looks healthy and never a fail because it is stuck — and the same for
 * the pre-check when the kill-switch state could not be read. This is the one
 * screen where a fabricated verdict authorises money to move.
 */
@Component({
  selector: 'app-approval-automated-checks',
  imports: [CrossPageLink, InfoCard],
  templateUrl: './automated-checks.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutomatedChecks {
  private readonly service = inject(ApprovalGateService);

  protected readonly guardrailRoute = GUARDRAIL_ROUTE;

  protected readonly checks = this.service.selectedChecks;

  protected readonly resultIcon = CHECK_RESULT_ICON;
  protected readonly resultLabel = CHECK_RESULT_LABEL;
  protected readonly ruleResultLabel = RULE_RESULT_LABEL;

  /**
   * The kill-switch, in one line, with "unknown" as a first-class reading.
   *
   * It sits beside the pre-check result rather than under it because "PASS"
   * says nothing without it: the deterministic step refuses every proposed
   * order while trading is halted, whatever the trade itself looks like.
   */
  protected readonly killSwitchLine = computed(() => {
    const pre = this.checks()?.preCheck;
    if (!pre) return '';
    if (!pre.killSwitchKnown) return 'Kill-switch state unknown';
    return pre.killSwitchEngaged
      ? 'Kill-switch engaged — trading is halted'
      : 'Kill-switch not triggered';
  });
}
