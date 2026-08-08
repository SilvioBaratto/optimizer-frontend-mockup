import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { InfoCard } from '../../../shared/info-card/info-card';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import {
  AGENT_IDS,
  AGENT_LABEL,
  RUN_STATUS_LABEL,
  type AgentId,
  type RunStatus,
} from '../../../models/fund-state.model';
import { DeliberationService } from '../../../services/deliberation.service';
import { AgentTopology } from './agent-topology/agent-topology';
import { AuditCheckpoints } from './audit-checkpoints/audit-checkpoints';
import { FundStateInspector } from './fund-state-inspector/fund-state-inspector';
import { LiveEventStream } from './live-event-stream/live-event-stream';

const RUN_TONE: Record<RunStatus, StatusTone> = {
  idle: 'pending',
  running: 'active',
  complete: 'ok',
  failed: 'alert',
};

/**
 * `docs/11 Fund Deliberation.md` — the four agents deliberating, made visible.
 *
 * One object does the work here twice over: `FundState` decouples the agents
 * from each other, and because it is frozen and serialisable the same object
 * is the audit record checkpointed at every step. The page is built around
 * that: the diagram shows who may write, the inspector shows what has been
 * written, and the checkpoint history lets any earlier step be read back
 * exactly as it stood.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-deliberation',
  imports: [
    ActionButtonRow,
    AgentTopology,
    AuditCheckpoints,
    CrossPageLink,
    FundStateInspector,
    InfoCard,
    LiveEventStream,
    StatusBadge,
  ],
  templateUrl: './deliberation.html',
  styleUrl: './deliberation.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Deliberation {
  private readonly service = inject(DeliberationService);

  protected readonly agentIds = AGENT_IDS;
  protected readonly agentLabel = AGENT_LABEL;
  protected readonly runStatusLabel = RUN_STATUS_LABEL;

  protected readonly status = this.service.status;
  protected readonly connection = this.service.connection;
  protected readonly checkpoints = this.service.checkpoints;
  protected readonly latestCheckpoint = this.service.latestCheckpoint;
  protected readonly activeCheckpoint = this.service.activeCheckpoint;
  protected readonly selectedStep = this.service.selectedStep;
  protected readonly nodeFilter = this.service.nodeFilter;
  protected readonly hasRun = this.service.hasRun;
  protected readonly canSendToGate = this.service.canSendToGate;
  protected readonly agentFieldsComplete = this.service.agentFieldsComplete;
  protected readonly lastEventId = this.service.lastEventId;
  protected readonly replayedCount = this.service.replayedCount;

  protected readonly runTone = computed(() => RUN_TONE[this.status()]);
  protected readonly isRunning = computed(() => this.status() === 'running');
  protected readonly disconnected = computed(() => this.connection() === 'reconnecting');

  /** The summary line above the exit, describing what is and is not filled. */
  protected readonly completionSummary = computed(() => {
    if (!this.hasRun()) return 'No run has been started for this portfolio.';
    const latest = this.latestCheckpoint();
    const written = latest ? latest.fields.filter((f) => f.field !== 'approvals' && f.set).length : 0;
    if (written < 4) {
      return `${written} of 4 agent fields set · approvals still empty`;
    }
    return 'All four agent fields are set · approvals still empty';
  });

  protected start(): void {
    this.service.start();
  }

  protected onCheckpoint(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.service.selectStep(value === 'latest' ? null : Number(value));
  }

  protected onNodeFilter(event: Event): void {
    this.nodeFilter.set((event.target as HTMLSelectElement).value as AgentId | 'all');
  }

  /** `step 5 (final)` for the newest, plain `step n` for the rest. */
  protected checkpointLabel(step: number): string {
    return step === this.latestCheckpoint()?.step ? `step ${step} (final)` : `step ${step}`;
  }
}
