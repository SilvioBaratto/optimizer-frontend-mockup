import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { NOT_APPLICABLE, type RiskMeasureId } from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { CardTitle, InfoCard } from '../../../../shared/info-card/info-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';

/**
 * The one element the TCE ⇄ ES/CVaR coincidence note lives in.
 *
 * It is rendered once, on the TCE card where the wireframe puts it, and *both*
 * affected cards point `aria-describedby` at it — the note is a statement about
 * a relationship between two numbers, so announcing it beside only one of them
 * would tell half the story.
 */
const COINCIDENCE_NOTE_ID = 'risk-tce-coincidence-note';

/** Everything one measure card renders, resolved once per (confidence, method). */
interface MeasureView {
  id: RiskMeasureId;
  label: string;
  /** Formatted percent, or `—` where the measure is not computable. */
  value: string;
  horizon: string | null;
  annotation: string | null;
  /** Set only on the card that *owns* the shared coincidence note. */
  annotationId: string | null;
  /** Set on every card the shared note describes. */
  describedBy: string | null;
  definition: string;
  headingId: string;
}

/**
 * Region 6 — the five deterministic risk measures for the selected combination.
 *
 * Nothing in here computes: the cards read a result the tool already produced.
 * Two facts survive from the theory into the markup rather than into a comment:
 *
 * - Under RiskMetrics a continuous loss distribution is assumed, and TCE *is*
 *   ES/CVaR. The equality is annotated, and the annotation describes both cards.
 *   Under Historical the distribution is discrete, the two are separate numbers
 *   and the annotation is gone — from the DOM, not merely from view.
 * - WCE has no value under either method. It is not missing data: it is defined
 *   over every event of probability greater than α, so it needs the whole
 *   probability space. The card says so and shows a dash, never a blank.
 */
@Component({
  selector: 'app-risk-measures',
  imports: [CardTitle, InfoCard, SectionCardGrid, SkeletonBlock],
  templateUrl: './risk-measures.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskMeasures {
  private readonly service = inject(RiskAgentService);

  protected readonly running = this.service.running;
  protected readonly measuresLabel = this.service.measuresLabel;
  protected readonly methodNote = computed(() => this.service.measureSet()?.methodNote ?? '');

  protected readonly views = computed<readonly MeasureView[]>(() => {
    const coincides = this.service.measureSet()?.tceEqualsEs ?? false;

    return this.service.measures().map((measure) => {
      const sharesNote = coincides && (measure.id === 'tce' || measure.id === 'es');
      return {
        id: measure.id,
        label: measure.label,
        value: measure.value === null ? NOT_APPLICABLE : `${measure.value.toFixed(2)}%`,
        horizon: measure.horizon,
        annotation: measure.annotation,
        annotationId: coincides && measure.id === 'tce' ? COINCIDENCE_NOTE_ID : null,
        describedBy: sharesNote ? COINCIDENCE_NOTE_ID : null,
        definition: measure.definition,
        headingId: `risk-measure-${measure.id}-label`,
      };
    });
  });
}
