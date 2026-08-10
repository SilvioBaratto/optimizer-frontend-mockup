import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  POSTURE_OFF_GLYPH,
  POSTURE_ON_GLYPH,
  POSTURE_UNAVAILABLE_GLYPH,
  POSTURE_UNAVAILABLE_LABEL,
} from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { InfoCard } from '../../../shared/info-card/info-card';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';

/**
 * Region 4 — the four audit-posture indicators and the positions provenance.
 *
 * Read-only, and the only place on the page that states what the audit trail
 * does and does not promise: decisions are logged with model, params and full
 * output regardless of reproducibility; reproducibility itself is not
 * guaranteed and depends on the Ollama model; validation and retry sit at the
 * LLM port; and broker idempotency is not configured, because no broker is.
 *
 * The fourth row is derived from `ExecutionService.brokerPosture()` through the
 * page service, not written down here — the same signal doc 15's banner and
 * doc 17's fourth pipeline step read. A card that hardcoded "Not configured"
 * would keep saying it after somebody registered an adapter.
 *
 * No indicator carries its state in colour: each pairs a glyph with the state
 * spelled out as a word, and the words are the accessible content.
 */
@Component({
  selector: 'app-report-posture-card',
  imports: [InfoCard, SkeletonBlock],
  templateUrl: './posture-card.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostureCard {
  private readonly service = inject(ReportAuditService);

  protected readonly onGlyph = POSTURE_ON_GLYPH;
  protected readonly offGlyph = POSTURE_OFF_GLYPH;
  protected readonly unavailableGlyph = POSTURE_UNAVAILABLE_GLYPH;
  protected readonly unavailableLabel = POSTURE_UNAVAILABLE_LABEL;

  protected readonly state = this.service.state;
  protected readonly indicators = this.service.postureIndicators;
  protected readonly positionsSourceLine = this.service.positionsSourceLine;

  /** Four placeholders, one per indicator, so nothing shifts when the read lands. */
  protected readonly placeholders = [0, 1, 2, 3];
}
