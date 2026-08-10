import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AUDIT_AGENT_LABEL,
  DECISION_TYPE_LABEL,
  HASH_LOGGED_NOTE,
  NOT_LOGGED_GLYPH,
  NOT_LOGGED_LABEL,
  NOT_LOGGED_NOTE,
} from '../../../models/report-audit.model';
import { ReportAuditService } from '../../../services/report-audit.service';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { SlideOverComponent } from '../../../shared/ui/slide-over/slide-over';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';

/**
 * Region 8 — the decision, exactly as it was produced.
 *
 * This is the audit-by-inspection surface: id, model, the full parameter set,
 * the prompt hash where one was logged, and the complete output. Nothing here
 * is summarised or trimmed — the panel scrolls instead, because a truncated
 * output is a record you cannot audit.
 *
 * It claims no more than it can. A logged hash identifies the prompt; it does
 * not promise a bit-exact replay, and the panel says so in the same breath.
 * A missing hash says the model gives no reproducibility guarantee, which is
 * the ordinary case and reads as a fact rather than as a defect.
 *
 * Focus: `app-slide-over` traps it and restores it to whatever was focused
 * when the panel opened — the row button that opened it — so Escape and Close
 * both land the reader back on the row they came from. On top of that the spec
 * asks for focus to start on the panel's heading rather than its first
 * control, so the heading is focusable and takes focus one microtask after the
 * trap has had its turn.
 */
@Component({
  selector: 'app-report-decision-detail',
  imports: [ButtonDirective, CrossPageLink, RouterLink, SlideOverComponent],
  templateUrl: './decision-detail.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionDetail {
  private readonly service = inject(ReportAuditService);

  protected readonly agentLabel = AUDIT_AGENT_LABEL;
  protected readonly typeLabel = DECISION_TYPE_LABEL;
  protected readonly notLoggedGlyph = NOT_LOGGED_GLYPH;
  protected readonly notLoggedLabel = NOT_LOGGED_LABEL;
  protected readonly notLoggedNote = NOT_LOGGED_NOTE;
  protected readonly hashLoggedNote = HASH_LOGGED_NOTE;

  protected readonly decision = this.service.selectedDecision;
  protected readonly open = computed(() => this.decision() !== null);

  /** The panel's accessible name, and the heading a reader hears on opening. */
  protected readonly headingText = computed(() => {
    const decision = this.decision();
    if (!decision) return 'Decision detail';
    return `${decision.id} · ${this.agentLabel[decision.agent]} · ${decision.time} ${decision.date}`;
  });

  protected readonly runLabel = computed(() => {
    const decision = this.decision();
    return decision ? this.service.runLabel(decision) : '';
  });

  /** Result of the copy, announced politely. Cleared when the panel changes. */
  protected readonly copyNotice = signal('');

  private readonly heading = viewChild<ElementRef<HTMLElement>>('panelHeading');

  /** Tracks the closed→open edge, so focus moves on opening and not every render. */
  private wasOpen = false;

  constructor() {
    effect(() => {
      if (!this.open()) {
        this.wasOpen = false;
        return;
      }
      if (this.wasOpen) return;
      this.wasOpen = true;
      this.copyNotice.set('');
      // After the render pass and after the focus trap has focused the panel's
      // first control — the spec puts focus on the heading instead, so a
      // screen reader hears which decision was opened before it hears a button.
      queueMicrotask(() => this.heading()?.nativeElement.focus());
    });
  }

  /** `temperature=0.7, top_p=0.9, max_tokens=512` — one line, as it was logged. */
  protected readonly paramLine = computed(() =>
    (this.decision()?.params ?? []).map((p) => `${p.name}=${p.value}`).join(', '),
  );

  /** The whole output as one string — what the clipboard receives. */
  protected readonly fullOutput = computed(() => (this.decision()?.output ?? []).join('\n\n'));

  protected close(): void {
    this.service.clearSelection();
  }

  /**
   * Copies the full output, not the preview.
   *
   * Guarded rather than assumed: the Clipboard API is absent in insecure
   * contexts and in the test environment, and a copy button that throws is
   * worse than one that says it could not copy.
   */
  protected async copyOutput(): Promise<void> {
    const text = this.fullOutput();
    try {
      await navigator.clipboard?.writeText(text);
      this.copyNotice.set('Full output copied to the clipboard.');
    } catch {
      this.copyNotice.set('Could not reach the clipboard. Select the output above and copy it.');
    }
  }
}
