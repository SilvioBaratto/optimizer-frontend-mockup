import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { ApprovalGateService } from '../../../services/approval-gate.service';
import { CollectionStatBar } from '../../../shared/collection-stat-bar/collection-stat-bar';
import { ErrorState } from '../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { ApprovalQueue } from './approval-queue/approval-queue';
import { PostureBanner } from './posture-banner/posture-banner';
import { QueueFilters } from './queue-filters/queue-filters';
import { TradeDetail } from './trade-detail/trade-detail';

/** Upper bound on placeholder cards, so a long queue does not render a wall. */
const MAX_SKELETON_ROWS = 6;

/**
 * `docs/16 Human Approval Gate.md` — the step at which a person, and only a
 * person, lets an order move.
 *
 * Every trade the execution agent proposes walks four mandatory steps in order:
 * a deterministic pre-check, a rules engine, this gate, and — only if a broker
 * adapter is registered — the adapter itself. The first two are machines and
 * the fourth is the only point at which a real order leaves the system. The
 * third is an `interrupt()` that suspends the flow until someone signs, and it
 * exists because the tools the agents can reach are read-only or pure compute:
 * an action with an effect in the world is never something a model can call.
 *
 * That is why the page reads the way it does. The broker posture is stated
 * first and never dismissible, because it decides what approving *means* — with
 * no adapter registered, the default, this gate is the last step and an
 * approval is "authorised so that you can place it", not "sent". Every sentence
 * on the page about routing is derived from that one signal, so the banner, the
 * sentence above the buttons and the record written with a decision cannot
 * disagree.
 *
 * The queue opens on Human Gate / Pending because that is the only pair the
 * page can act on; the other three steps stay visible, read-only, so a trade
 * can be found wherever it got to. Nothing is submitted on a first click.
 *
 * The shell renders the `<h1>` and the breadcrumb, so headings here start at
 * `<h2>`.
 */
@Component({
  selector: 'app-approval-gate',
  imports: [
    ApprovalQueue,
    CollectionStatBar,
    ErrorState,
    PostureBanner,
    QueueFilters,
    SkeletonBlock,
    TradeDetail,
  ],
  templateUrl: './approval-gate.html',
  styleUrl: './approval-gate.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalGate {
  private readonly service = inject(ApprovalGateService);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = this.service.state;
  protected readonly errorMessage = this.service.errorMessage;

  /**
   * One part, not three.
   *
   * The sentence is `ApprovalGateService.queueSummary()` exactly as the service
   * words it — the count, the step and the ordering are one claim about one
   * collection, and splitting it here so the bar could rejoin it would put a
   * second copy of that sentence's grammar in the page.
   */
  protected readonly statParts = computed(() => [this.service.queueSummary()]);

  /**
   * As many placeholders as the queue last showed.
   *
   * The order list is not cleared while it is being re-read, so this is the
   * last known size rather than a guess, and the cards do not jump when the
   * snapshot lands.
   */
  protected readonly skeletonRows = computed(() =>
    Array.from({ length: Math.min(Math.max(this.service.visibleCount(), 1), MAX_SKELETON_ROWS) },
      (_, index) => index,
    ),
  );

  constructor() {
    /*
      Doc 15 and doc 24 deep-link a single trade into this page. The parameter
      is read once, from the snapshot the page was entered with: it is an
      entry condition, not a piece of state to keep synchronised, and an
      unknown id is a no-op rather than an empty panel.
    */
    const requested = this.route.snapshot.queryParamMap.get('trade');
    if (requested) this.service.select(requested);
  }

  protected retry(): Promise<void> {
    return this.service.refresh();
  }
}
