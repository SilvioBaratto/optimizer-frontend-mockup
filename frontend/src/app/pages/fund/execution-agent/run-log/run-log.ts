import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core';

import { EventLogPanel, type LogEntry } from '../../../../shared/event-log-panel/event-log-panel';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { TOOL_CALL_KIND_LABEL } from '../../../../models/order.model';
import { ExecutionService } from '../../../../services/execution.service';

/**
 * The last run's trace: which tools the agent called, and the reasoning excerpt
 * that produced the order list on screen.
 *
 * Every entry carries its kind — read-only or pure compute — because that is
 * what makes the toolbar's claim checkable rather than decorative. There is no
 * tool in this list that could place an order, and there is no tool in the
 * model's vocabulary that could.
 *
 * The trace belongs to the *run*, not to the snapshot: `Refresh` re-reads the
 * fund state without starting a run, so nothing here moves when it is used. On
 * a failed read the panel says outright that what it shows is the last trace
 * available and not the current state.
 */
@Component({
  selector: 'app-execution-run-log',
  imports: [ButtonDirective, EventLogPanel, SkeletonBlock],
  templateUrl: './run-log.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunLog {
  private readonly service = inject(ExecutionService);

  /**
   * Shared with the toolbar's "View full trace →", which controls the same
   * region: two controls with one disclosure state, rather than two disclosures
   * that can disagree about whether the trace is open.
   */
  readonly fullTrace = model(false);

  protected readonly state = this.service.state;
  protected readonly lastRun = this.service.lastRun;
  protected readonly reasoning = this.service.reasoningExcerpt;
  protected readonly toolCalls = this.service.toolCalls;

  protected readonly loading = computed(() => this.state() === 'loading');
  protected readonly stale = computed(() => this.state() === 'error');

  /** An empty snapshot has no run to show a trace for. */
  protected readonly empty = computed(() => this.state() === 'empty');

  protected readonly entries = computed<LogEntry[]>(() => {
    if (this.empty()) return [];
    return this.toolCalls().map((call) => ({
      id: call.id,
      at: call.at,
      text: call.tool,
      detail: TOOL_CALL_KIND_LABEL[call.kind],
    }));
  });

  protected toggleTrace(): void {
    this.fullTrace.set(!this.fullTrace());
  }

  protected retry(): void {
    this.service.clearError();
    void this.service.refresh();
  }
}
