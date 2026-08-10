import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  HUMAN_APPROVAL_EXIT,
  type PipelineStepCounts,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';

/**
 * Regions 2 and 3 — the four mandatory steps, with today's counters.
 *
 * Nothing here is a number typed into a mock. Every counter is derived by
 * `GuardrailService.pipeline()` from the one order list the execution agent
 * publishes, so this grid cannot claim a trade that doc 15's queue does not
 * show, and step [4] cannot claim a routed order while no adapter is
 * registered.
 *
 * The broker step is the edge case the spec calls out by name: with no adapter
 * configured it says so and prints `— no orders routed`, and that is a posture,
 * not a failure. It carries a neutral badge rather than an alert one, because
 * the human gate being the last step is the system working as designed.
 */
@Component({
  selector: 'app-approval-pipeline',
  imports: [CrossPageLink, EntityCard, SectionCardGrid, SkeletonBlock, StatusBadge],
  templateUrl: './approval-pipeline.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalPipeline {
  private readonly service = inject(GuardrailService);

  protected readonly humanApprovalExit = HUMAN_APPROVAL_EXIT;

  protected readonly steps = this.service.pipeline;
  protected readonly loading = this.service.loading;

  /** Four placeholders, so the grid does not resize when the counters land. */
  protected readonly skeletons = computed(() => this.steps().map((s) => s.stage));

  /**
   * The card's second line.
   *
   * The broker step's subtitle is the posture, which gets a badge of its own —
   * repeating it in the meta line would print "No broker configured" twice on
   * one card.
   */
  protected meta(step: PipelineStepCounts): string {
    if (step.stage === 'broker-adapter') return step.detail;
    return step.subtitle === null ? step.detail : `${step.detail} · ${step.subtitle}`;
  }
}
