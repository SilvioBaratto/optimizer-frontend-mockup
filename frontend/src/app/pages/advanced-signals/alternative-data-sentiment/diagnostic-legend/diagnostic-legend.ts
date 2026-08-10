import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import {
  CRITERION_FOOTNOTE,
  CRITERION_PERSISTENT,
  CRITERION_TITLE,
  CRITERION_TRANSIENT,
} from '../../../../models/alt-data-sentiment.model';
import { InfoCard } from '../../../../shared/info-card/info-card';

/**
 * Region 3 — the diagnostic criterion, as interpretive framing and nothing else.
 *
 * It states no threshold of its own: the badge on every card below is the
 * outcome of this test, and the evidence for each verdict lives in that
 * signal's own detail panel. Sentiment theory predicts a short-horizon move is
 * reversed; information theory predicts it persists. That difference is the
 * whole reason the page is laid out around a temporal signature rather than
 * around a correlation.
 *
 * Collapsible, because it is a reminder rather than a reading: a real
 * `<button>` carries the Enter and Space the spec asks for without a key
 * handler, and `aria-expanded` says which way it is.
 */
@Component({
  selector: 'app-alt-data-diagnostic-legend',
  imports: [InfoCard],
  templateUrl: './diagnostic-legend.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataDiagnosticLegend {
  protected readonly title = CRITERION_TITLE;
  protected readonly transient = CRITERION_TRANSIENT;
  protected readonly persistent = CRITERION_PERSISTENT;
  protected readonly footnote = CRITERION_FOOTNOTE;

  protected readonly expanded = signal(true);

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }
}
