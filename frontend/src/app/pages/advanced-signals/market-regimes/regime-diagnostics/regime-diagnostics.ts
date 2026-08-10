import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { LOW_CONFIDENCE_BAND_PCT } from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { CardTitle, InfoCard } from '../../../../shared/info-card/info-card';
import { logLikelihoodLabel, percent0 } from '../regimes-format';

/**
 * Region 11 — the diagnostics footer.
 *
 * Three readings about the fit rather than about the market, in a discreet
 * tone: the sample log-likelihood that the estimation actually maximised, when
 * the model was last recalibrated, and the highest state probability the filter
 * is currently reporting.
 *
 * The last of those is what raises the warning. When the top probability sits
 * within a few points of a half, the filter is as likely to have missed a
 * turning point as to have caught one — the probability path tracks the regime
 * well but does produce false alarms and does miss changes — and a reader
 * acting on the state above deserves to be told which of those they might be
 * looking at. The warning is **text**, not a tint: it has to survive greyscale,
 * a colourblind reader and a screen reader, and it is announced politely
 * because it is information about a reading the user asked for, not an
 * interruption.
 *
 * Nothing here is a threshold anybody can breach. It is a note about how much
 * weight the estimate carries.
 */
@Component({
  selector: 'app-market-regimes-diagnostics',
  imports: [CardTitle, InfoCard],
  templateUrl: './regime-diagnostics.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimeDiagnostics {
  private readonly service = inject(MarketRegimesService);

  protected readonly diagnostics = this.service.diagnostics;

  protected readonly logLikelihood = computed(() => {
    const value = this.diagnostics().logLikelihood;
    return value === null ? '—' : logLikelihoodLabel(value);
  });

  protected readonly topProbability = computed(() => {
    const value = this.diagnostics().topProbability;
    return value === null ? '—' : percent0(value);
  });

  /** Why the warning is showing, in the terms it was decided on. */
  protected readonly confidenceBand = computed(
    () => `the highest state probability is within ${LOW_CONFIDENCE_BAND_PCT} points of 50%`,
  );
}
