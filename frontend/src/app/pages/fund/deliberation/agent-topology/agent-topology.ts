import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AGENT_ROUTE,
  NODE_STATUS_ICON,
  NODE_STATUS_LABEL,
  type AgentNode,
  type NodeStatus,
} from '../../../../models/fund-state.model';
import { DeliberationService } from '../../../../services/deliberation.service';

/**
 * The frozen topology (Fondamenti §1).
 *
 * Four agents, each with an arrow into one shared state, and a single arrow out
 * of that state to the proposed allocation. There is deliberately no edge
 * between any two agents: they hand off only through the state, and a diagram
 * that drew otherwise would misdescribe the system.
 *
 * Built from DOM rather than a charting library. Six nodes at fixed positions
 * need no layout engine, and the specification requires each node to be
 * focusable and to announce its own status — which real elements do and canvas
 * shapes cannot.
 */
@Component({
  selector: 'app-agent-topology',
  imports: [RouterLink],
  templateUrl: './agent-topology.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentTopology {
  private readonly service = inject(DeliberationService);

  protected readonly route = AGENT_ROUTE;
  protected readonly statusIcon = NODE_STATUS_ICON;
  protected readonly statusLabel = NODE_STATUS_LABEL;

  protected readonly nodes = this.service.nodes;
  protected readonly activeCheckpoint = this.service.activeCheckpoint;
  protected readonly hasRun = this.service.hasRun;
  protected readonly orderCount = this.service.proposedOrderCount;

  protected readonly stateSummary = computed(() => {
    const checkpoint = this.activeCheckpoint();
    return checkpoint ? `checkpointed at step ${checkpoint.step}` : 'not yet checkpointed';
  });

  protected readonly allocationSummary = computed(() => {
    const count = this.orderCount();
    return count > 0 ? `ready — ${count} orders` : 'not yet proposed';
  });

  /** What a screen reader hears on each node: name, state, and when. */
  protected nodeLabel(node: AgentNode): string {
    const when = node.at ? `, updated ${node.at}` : '';
    return `${node.label} agent, ${this.statusLabel[node.status]}${when}`;
  }

  protected statusClass(status: NodeStatus): string {
    switch (status) {
      case 'done':
        return 'text-primary';
      case 'running':
        return 'text-text';
      case 'failed':
        return 'text-danger';
      default:
        return 'text-text-secondary';
    }
  }
}
