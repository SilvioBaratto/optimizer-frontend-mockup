import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { InfoCard } from '../../../shared/info-card/info-card';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import {
  AGENT_IDS,
  AGENT_LABEL,
  RUN_STATUS_LABEL,
  type AgentId,
  type RunStatus,
} from '../../../models/fund-state.model';
import { DeliberationService } from '../../../services/deliberation.service';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';
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
 * A `run` in the URL that is not the run this page holds.
 *
 * `retained` separates the two honest answers apart from each other: a run the
 * audit log still keeps, whose checkpoints simply are not loaded here, and an
 * id nothing in the app knows about.
 */
interface RunMismatch {
  requested: string;
  retained: boolean;
}

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
    PageContextBar,
    RouterLink,
    StatusBadge,
    ButtonDirective,
    SelectDirective,
  ],
  templateUrl: './deliberation.html',
  styleUrl: './deliberation.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Deliberation {
  private readonly service = inject(DeliberationService);
  private readonly route = inject(ActivatedRoute);

  /**
   * The run the reader asked for, if they arrived from a link that named one.
   *
   * Read once from the entry snapshot, on the same terms as doc 16's `trade`
   * parameter: it is the condition the page was entered under, not state to
   * keep in step with the URL.
   */
  private readonly requestedRunId = this.route.snapshot.queryParamMap.get('run');

  protected readonly agentIds = AGENT_IDS;
  protected readonly agentLabel = AGENT_LABEL;
  protected readonly runStatusLabel = RUN_STATUS_LABEL;

  protected readonly runId = this.service.runId;
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

  /**
   * Null when the URL named no run, or named the one on screen.
   *
   * Only this page knows which run it holds, so only this page can tell a
   * reader following an audit reference that they have not arrived at it. The
   * alternative — inventing checkpoints for #1246 so the link looks satisfied —
   * would put fabricated frozen state under an audit trail, which is a worse
   * failure than the silence it replaced.
   */
  protected readonly runMismatch = computed<RunMismatch | null>(() => {
    const requested = this.requestedRunId;
    if (!requested || requested === this.runId()) return null;
    return { requested, retained: this.service.retainedRunIds().includes(requested) };
  });

  /**
   * The summary line above the exit, describing what is and is not filled.
   *
   * The empty branch says what this view holds, not what the fund has ever
   * done. Now that the page names its run, "no run has been started" would
   * contradict the audit log the reader followed here — which retains that
   * exact run's decisions — over a stream this session simply has not opened.
   */
  protected readonly completionSummary = computed(() => {
    if (!this.hasRun()) {
      return 'No checkpoints are loaded for this run yet — Start Deliberation Run streams them.';
    }
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
