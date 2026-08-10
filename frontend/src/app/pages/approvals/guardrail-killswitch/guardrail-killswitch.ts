import { ChangeDetectionStrategy, Component, ElementRef, viewChild } from '@angular/core';

import { ApprovalPipeline } from './approval-pipeline/approval-pipeline';
import { AuditTrail } from './audit-trail/audit-trail';
import { ConcentrationPanel } from './concentration-panel/concentration-panel';
import { HardLimits } from './hard-limits/hard-limits';
import { KillSwitchHero } from './kill-switch-hero/kill-switch-hero';

/**
 * `docs/17 Guardrail & Kill-Switch.md` — the deterministic control that runs
 * before any model is called.
 *
 * The page is one argument: business-critical conditions are evaluated first
 * and without an LLM, so a tripped limit or an engaged kill-switch beats any
 * probabilistic routing the orchestrator would otherwise do. Everything on
 * screen is that boundary — the switch itself, the four mandatory steps every
 * proposed trade passes in order, the Pydantic validators that implement the
 * pass/fail decision, the diversification indices the concentration limits are
 * written against, and the checkpointed trail of every transition.
 *
 * Two design decisions are worth stating outright.
 *
 * **The kill-switch toggle is the first focusable element on the page.** There
 * is no page toolbar above it and no page-level skip link that would jump past
 * it; the shell's skip link lands on the main content and the toggle is what it
 * lands on. That is the doc's `### Accessibilità` read literally, and the
 * reason it gives is the right one: the control with deterministic priority
 * over every other decision should not be reached through anything else.
 *
 * **Every region loads, fails and retries on its own.** There is no page-level
 * error branch that blanks the screen: a failed read of the limits leaves the
 * audit trail, the pipeline counters and the kill-switch exactly where they
 * were, each with its own localised ErrorState. The one state that is *not*
 * localised is the kill-switch's, and only because it disables the primary
 * action — never offer an action on a value that has not been confirmed.
 *
 * The shell renders the `<h1>` and the breadcrumb from the route, so headings
 * here start at `<h2>`.
 */
@Component({
  selector: 'app-guardrail-killswitch',
  imports: [ApprovalPipeline, AuditTrail, ConcentrationPanel, HardLimits, KillSwitchHero],
  templateUrl: './guardrail-killswitch.html',
  styleUrl: './guardrail-killswitch.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuardrailKillswitch {
  private readonly auditRegion = viewChild<ElementRef<HTMLElement>>('auditRegion');

  /**
   * "View log" on a limit card filters the trail three regions down the page.
   *
   * Moving focus there is the whole difference between a filter that happened
   * and a filter the reader can find: the grid it narrowed is off-screen from
   * the button that narrowed it.
   */
  protected focusAuditTrail(): void {
    this.auditRegion()?.nativeElement.focus();
  }
}
