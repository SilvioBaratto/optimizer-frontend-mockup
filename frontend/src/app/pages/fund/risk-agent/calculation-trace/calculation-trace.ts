import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  DETERMINISTIC_CALCULATION_NOTE,
  RUNNING_TOOL_LABEL,
  type ToolCall,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { InfoCard } from '../../../../shared/info-card/info-card';

/**
 * Region 4 — the trace of the deterministic risk calculation.
 *
 * The point of the card is the sentence at the top of it: `portopt` is invoked
 * by the orchestrator, not chosen by the model. It runs on every assessment,
 * whatever the display filters below say, and a weak model cannot skip it
 * because no model decides whether it happens.
 *
 * While it runs the card shows a labelled progress bar. The label is the
 * information; the animation is decoration and the app-wide
 * `prefers-reduced-motion` rule stops it, leaving the static text behind.
 */
@Component({
  selector: 'app-calculation-trace',
  imports: [InfoCard],
  templateUrl: './calculation-trace.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculationTrace {
  private readonly service = inject(RiskAgentService);

  protected readonly note = DETERMINISTIC_CALCULATION_NOTE;
  protected readonly runningLabel = RUNNING_TOOL_LABEL;

  protected readonly running = this.service.running;
  protected readonly calculation = this.service.calculation;
  protected readonly atLabel = this.service.calculationAtLabel;

  /** `'0.42s'` — seconds to two places, as the audit log states them. */
  protected duration(call: ToolCall): string {
    return `${call.durationSeconds.toFixed(2)}s`;
  }
}
