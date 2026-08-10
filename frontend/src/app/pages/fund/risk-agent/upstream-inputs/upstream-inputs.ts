import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  CONSUMED_NOTE,
  FUND_STATE_INPUT_LABEL,
  type UpstreamInput,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';

/**
 * Region 3 — the two `FundState` fields the risk agent reads.
 *
 * Both cards are read-only summaries: the risk agent consumes this state and
 * never writes it, so there is no editable field anywhere in here. The one
 * interactive element per cell is the `CrossPageLink` back to the agent that
 * wrote the field, and it sits beside the card rather than inside it — a card
 * given `route` becomes an anchor, and an anchor may not contain a separately
 * focusable link, which is what `EntityCard`'s contract forbids.
 *
 * The macro card's warning is a *freshness* signal derived from the two
 * timestamps, not a judgement about the macro call. The allocation is the
 * reference point of that comparison, so it is never the card that is behind.
 */
@Component({
  selector: 'app-upstream-inputs',
  imports: [CrossPageLink, EntityCard, SectionCardGrid, StatusBadge],
  templateUrl: './upstream-inputs.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpstreamInputs {
  private readonly service = inject(RiskAgentService);

  protected readonly inputs = this.service.inputs;
  protected readonly fieldLabel = FUND_STATE_INPUT_LABEL;
  protected readonly consumedNote = CONSUMED_NOTE;

  /**
   * The card's meta line — provenance only.
   *
   * `EntityCard` truncates title and meta to one line each, so anything the
   * spec requires to be *readable* has to live outside them. This is the one
   * part short enough to survive the narrowest card.
   */
  protected source(input: UpstreamInput): string {
    return `from ${input.writtenBy}`;
  }

  /** `'8 positions · updated 09:12 UTC'` — wraps, so 320px keeps the stamp. */
  protected detail(input: UpstreamInput): string {
    return `${input.summary} · updated ${input.atLabel}`;
  }
}
