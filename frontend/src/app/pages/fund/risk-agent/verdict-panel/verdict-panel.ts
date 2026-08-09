import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import {
  MODEL_INTERPRETATION_NOTE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { InfoCard } from '../../../../shared/info-card/info-card';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';

/**
 * Region 7 — `state.risk_verdict`, the one field this page writes.
 *
 * The badge, the rationale and the drivers are the model's contribution: it
 * read the numbers `portopt` had already computed and wrote a sentence about
 * them. It recomputed nothing, and the card says so under the drivers.
 *
 * The raw disclosure shows the object as deposited, with every confidence and
 * method the tool produced — not the combination the chips happen to be on.
 * A display filter has no business rewriting the shared state.
 */
@Component({
  selector: 'app-verdict-panel',
  imports: [InfoCard, StatusBadge, ButtonDirective],
  templateUrl: './verdict-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerdictPanel {
  private readonly service = inject(RiskAgentService);

  protected readonly verdict = this.service.verdict;
  protected readonly raw = this.service.rawVerdict;

  protected readonly verdictLabel = VERDICT_LABEL;
  protected readonly verdictTone = VERDICT_TONE;
  protected readonly interpretationNote = MODEL_INTERPRETATION_NOTE;

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((v) => !v);
  }
}
