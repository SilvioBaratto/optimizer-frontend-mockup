import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';

import {
  READS_NOTE,
  RISK_AGENT_EXITS,
  RISK_RUN_STATUS_LABEL,
  TRUST_BOUNDARY_NOTES,
  WRITES_NOTE,
  type RiskRunStatus,
} from '../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../services/risk-agent.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { CalculationTrace } from './calculation-trace/calculation-trace';
import { MeasureFilters } from './measure-filters/measure-filters';
import { RiskMeasures } from './risk-measures/risk-measures';
import { RunSelector } from './run-selector/run-selector';
import { ToolCallLog } from './tool-call-log/tool-call-log';
import { UpstreamInputs } from './upstream-inputs/upstream-inputs';
import { VerdictPanel } from './verdict-panel/verdict-panel';

/** Tone per run status — always beside the status word, never instead of it. */
const STATUS_TONE: Record<RiskRunStatus, StatusTone> = {
  idle: 'neutral',
  running: 'active',
  done: 'ok',
  error: 'alert',
};

const NO_ALLOCATION_DETAIL =
  'state.allocation has not been written yet. The Allocation Agent proposes the allocation this agent assesses, so the risk assessment cannot run until it has.';
const NO_RUN_DETAIL =
  'No run of the risk agent has been recorded for this portfolio yet. Re-run the assessment, or open the agent that writes the allocation it reads.';

/**
 * `docs/14 Risk Agent.md` — the agent that judges a proposed allocation.
 *
 * The page exists to make one distinction visible. The numbers are produced by
 * a tool the orchestrator invokes deterministically, on every run, whatever the
 * model does; the model only reads them and writes a sentence. So the
 * calculation trace and the measures come *before* the verdict on the page, and
 * the verdict card says out loud that it recomputes nothing.
 *
 * Everything the agent can reach is read-only or pure-compute, fixed at build
 * time. Nothing on this page mutates any state but `state.risk_verdict`, and
 * the two exits at the bottom lead to the pages where a downstream action would
 * still face a human gate.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-risk-agent',
  imports: [
    ActionButtonRow,
    CalculationTrace,
    CrossPageLink,
    EmptyState,
    ErrorState,
    InfoCard,
    MeasureFilters,
    PageContextBar,
    RiskMeasures,
    RunSelector,
    StatusBadge,
    ToolCallLog,
    UpstreamInputs,
    VerdictPanel,
  ],
  templateUrl: './risk-agent.html',
  styleUrl: './risk-agent.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskAgent {
  private readonly service = inject(RiskAgentService);

  private readonly runSelector = viewChild(RunSelector);

  protected readonly readsNote = READS_NOTE;
  protected readonly writesNote = WRITES_NOTE;
  protected readonly trustBoundaryNotes = TRUST_BOUNDARY_NOTES;
  protected readonly exits = RISK_AGENT_EXITS;

  protected readonly state = this.service.state;
  protected readonly error = this.service.error;
  protected readonly runStamp = computed(() => this.service.selectedRunLabel() ?? '—');

  protected readonly runNumber = computed(() => {
    const run = this.service.selectedRun();
    return run ? `run #${run.id}` : 'no run';
  });

  /**
   * What the breadcrumb reports.
   *
   * The live page state outranks the stored status of the run being inspected:
   * while an assessment is in flight the bar has to say `Running`, not repeat
   * the `Done` of the run still on screen.
   */
  private readonly runStatus = computed<RiskRunStatus>(() => {
    if (this.service.running()) return 'running';
    if (this.service.error()) return 'error';
    return this.service.selectedRun()?.status ?? 'idle';
  });

  protected readonly statusLabel = computed(() => RISK_RUN_STATUS_LABEL[this.runStatus()]);
  protected readonly statusTone = computed(() => STATUS_TONE[this.runStatus()]);

  /** The empty state has two causes and they need different next steps. */
  protected readonly emptyDetail = computed(() =>
    this.service.allocationInput() === null ? NO_ALLOCATION_DETAIL : NO_RUN_DETAIL,
  );

  /**
   * Retrying destroys the alert the button lives in, so focus is moved out of
   * it *first* — into the run card, which owns the action being retried.
   * Left alone, focus falls to `<body>` and the next Tab restarts at the top
   * of the document.
   */
  protected async retry(): Promise<void> {
    this.runSelector()?.focusRunCard();
    this.service.clearError();
    await this.service.recompute();
  }
}
