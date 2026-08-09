import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  TOOL_CALL_STATUS_LABEL,
  type ToolCall,
  type ToolCallStatus,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { InfoCard } from '../../../../shared/info-card/info-card';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';

const STATUS_TONE: Record<ToolCallStatus, StatusTone> = {
  success: 'ok',
  error: 'alert',
};

/**
 * Region 8 — the audit log of every tool call in the selected run.
 *
 * Secondary by design and collapsed by default: it is for auditing and
 * diagnosis, not for reading the verdict. The Kind column is the interesting
 * one — every row says `read / compute-only`, and it says so because the type
 * has no other member. A side-effecting tool cannot appear in this table
 * because it cannot be constructed.
 */
@Component({
  selector: 'app-tool-call-log',
  imports: [InfoCard, StatusBadge, ButtonDirective],
  templateUrl: './tool-call-log.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolCallLog {
  private readonly service = inject(RiskAgentService);

  protected readonly calls = this.service.toolCalls;
  protected readonly statusLabel = TOOL_CALL_STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  /** `'09:14:02 UTC'` — sliced, never `Date`-formatted, so no timezone moves it. */
  protected clock(call: ToolCall): string {
    return `${call.at.slice(11, 19)} UTC`;
  }

  protected duration(call: ToolCall): string {
    return `${call.durationSeconds.toFixed(2)}s`;
  }
}
