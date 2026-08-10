import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { RUNNING_TOOL_LABEL, VERDICT_LABEL } from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { HeroStatCard } from '../../../../shared/hero-stat-card/hero-stat-card';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/**
 * Why the run button is off. Both reasons are rendered as visible text *and*
 * pointed at by `aria-describedby`: a `title` alone is invisible to a keyboard
 * user and unreachable on touch, and a disabled control is not focusable, so
 * the reason has to be readable without ever reaching the button.
 */
const MISSING_ALLOCATION_REASON =
  'Disabled — state.allocation is missing. The Allocation Agent has not written a proposed allocation yet.';
const RUNNING_REASON = 'Disabled — a risk assessment is already running.';

const REASON_ID = 'risk-run-disabled-reason';
const HISTORICAL_NOTE_ID = 'risk-run-historical-note';

/**
 * Region 2 — the run picker and the page's one action.
 *
 * Re-running calls the deterministic tool and then waits for the model to
 * interpret what it returned. Both halves are read-only or pure-compute, so
 * there is no approval gate in front of this button and no confirmation
 * dialog behind it: nothing it can do has an effect outside `state.risk_verdict`.
 *
 * Picking an older run changes which run is on screen and nothing else — it
 * never starts a computation.
 */
@Component({
  selector: 'app-run-selector',
  imports: [HeroStatCard, ButtonDirective, SelectDirective],
  templateUrl: './run-selector.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunSelector {
  private readonly service = inject(RiskAgentService);

  protected readonly reasonId = REASON_ID;
  protected readonly noteId = HISTORICAL_NOTE_ID;

  private readonly runPicker = viewChild<ElementRef<HTMLSelectElement>>('runPicker');
  private readonly runButton = viewChild<ElementRef<HTMLButtonElement>>('runButton');

  protected readonly runOptions = this.service.runOptions;
  protected readonly selectedRunId = this.service.selectedRunId;
  protected readonly historicalRunNote = this.service.historicalRunNote;
  protected readonly canRun = this.service.canRun;
  protected readonly running = this.service.running;

  protected readonly heading = computed(() => {
    const run = this.service.selectedRun();
    return run ? `Run #${run.id}` : 'No run yet';
  });

  protected readonly disabledReason = computed<string | null>(() => {
    if (this.running()) return RUNNING_REASON;
    return this.canRun() ? null : MISSING_ALLOCATION_REASON;
  });

  /**
   * Progress and completion, announced politely.
   *
   * Mounted from the first render even while empty — a live region created at
   * the same moment as its text is not announced.
   */
  protected readonly announcement = signal('');

  /**
   * Takes focus into this card, so the page's Retry has somewhere to hand it.
   *
   * The page-level ErrorState is destroyed the moment Retry clears the error,
   * taking the button that held focus with it; focus would fall to `<body>`
   * and the next Tab would restart at the top of the document.
   *
   * The picker rather than the button: the button is disabled for the whole
   * run that Retry just started, and focus on a control that is about to be
   * disabled is focus lost a moment later. The picker is never disabled, sits
   * immediately before the button, and is inside the card the retried action
   * belongs to.
   */
  focusRunCard(): void {
    const target = this.runPicker()?.nativeElement ?? this.runButton()?.nativeElement;
    target?.focus();
  }

  protected onRun(event: Event): void {
    this.service.selectRun((event.target as HTMLSelectElement).value);
  }

  protected async rerun(): Promise<void> {
    if (!this.canRun()) return;

    this.announcement.set(RUNNING_TOOL_LABEL);
    await this.service.recompute();

    const failure = this.service.error();
    if (failure) {
      this.announcement.set(failure.message);
      return;
    }

    const verdict = this.service.verdict();
    this.announcement.set(
      verdict
        ? `Risk assessment complete — verdict ${VERDICT_LABEL[verdict.state]}`
        : 'Risk assessment complete',
    );
  }
}
