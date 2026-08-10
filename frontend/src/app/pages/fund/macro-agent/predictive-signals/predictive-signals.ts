import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import type { SignalStatus } from '../../../../models/macro-regime.model';
import { MacroRegimeService } from '../../../../services/macro-regime.service';
import { MathVar } from '../../../../shared/math/math-var';

const TONE: Record<SignalStatus, StatusTone> = {
  validated: 'ok',
  excluded: 'alert',
  stale: 'warn',
};

/**
 * The signals the agent offers to the shared state, and whether each survived
 * validation.
 *
 * An excluded signal stays on the board with its reason attached. Dropping it
 * silently would leave the dashboard indistinguishable from one where nobody
 * had tested it — and the reason is usually the most useful thing on the card:
 * a negative out-of-sample R² means the historical mean did better.
 */
@Component({
  selector: 'app-predictive-signals',
  imports: [RouterLink, StatusBadge,
    MathVar,
  ],
  templateUrl: './predictive-signals.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PredictiveSignals {
  private readonly service = inject(MacroRegimeService);

  protected readonly signals = this.service.visibleSignals;
  protected readonly total = this.service.signals.length;
  protected readonly validatedCount = this.service.validatedCount;
  protected readonly excludedCount = this.service.excludedCount;
  protected readonly staleCount = computed(() => this.service.staleSignals().length);
  protected readonly showValidatedOnly = this.service.showValidatedOnly;

  protected tone(status: SignalStatus): StatusTone {
    return TONE[status];
  }
}
