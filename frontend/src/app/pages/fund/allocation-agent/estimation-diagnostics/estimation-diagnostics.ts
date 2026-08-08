import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { APPROACH_LABEL, type UncertaintyLevel } from '../../../../models/allocation-agent.model';
import { AllocationAgentService } from '../../../../services/allocation-agent.service';

/** Tone per level — always beside the level's own name, never instead of it. */
const UNCERTAINTY_TONE: Record<UncertaintyLevel, StatusTone> = {
  Low: 'ok',
  Moderate: 'warn',
  High: 'alert',
};

/**
 * What the estimation stage cost.
 *
 * The plug-in optimiser is a documented error maximiser: it hands large weights
 * to whichever asset drew the largest positive error in its risk premium, and
 * the imprecision worsens quadratically in the number of assets (Fondamenti
 * §8). The certainty-equivalent loss is the economic price of that — how much
 * utility the proposal gives up against knowing the true parameters — so it is
 * reported next to the approach that incurred it rather than buried.
 */
@Component({
  selector: 'app-estimation-diagnostics',
  imports: [CrossPageLink, StatusBadge],
  templateUrl: './estimation-diagnostics.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstimationDiagnostics {
  private readonly service = inject(AllocationAgentService);

  protected readonly approachLabel = APPROACH_LABEL;
  protected readonly diagnostics = this.service.diagnostics;

  protected readonly uncertaintyTone = computed<StatusTone>(
    () => UNCERTAINTY_TONE[this.diagnostics().uncertainty],
  );

  /** Reads from what the last run applied, so it never advertises a pending edit. */
  protected readonly remedySummary = computed(() => {
    const remedies = this.diagnostics().remedies;
    return remedies.length ? remedies.join(' · ') : 'none — raw sample moments';
  });
}
