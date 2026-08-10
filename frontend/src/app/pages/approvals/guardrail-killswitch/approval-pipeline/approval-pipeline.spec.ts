/**
 * Regions 2 + 3 — the four mandatory steps.
 *
 * Two claims are worth pinning down. The counters are *derived*, so the cards
 * are checked against `ExecutionService`'s own figures rather than against
 * numbers copied out of the wireframe: a card that agreed with the wireframe
 * and disagreed with the order queue would be worse than one that showed
 * nothing. And step [4] says "no broker configured" as a posture, not as a
 * failure — no alert tone, no error state, and `— no orders routed` in words.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NO_ORDERS_ROUTED } from '../../../../models/guardrail.model';
import { ExecutionService } from '../../../../services/execution.service';
import { GuardrailService } from '../../../../services/guardrail.service';
import { ApprovalPipeline } from './approval-pipeline';

describe('ApprovalPipeline', () => {
  let fixture: ComponentFixture<ApprovalPipeline>;
  let host: HTMLElement;
  let execution: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalPipeline],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ApprovalPipeline);
    host = fixture.nativeElement;
    execution = TestBed.inject(ExecutionService);
    fixture.detectChanges();
  });

  function cards(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-step]'));
  }

  function card(stage: string): HTMLElement {
    return host.querySelector(`[data-step="${stage}"]`) as HTMLElement;
  }

  function summary(stage: string): string {
    return (host.querySelector(`[data-summary="${stage}"]`)?.textContent ?? '').trim();
  }

  it('when the grid renders, the four mandatory steps appear in order', () => {
    expect(cards()).toHaveLength(4);
    expect(cards().map((c) => c.getAttribute('data-step'))).toEqual([
      'pre-trade',
      'rule-validation',
      'human-gate',
      'broker-adapter',
    ]);
  });

  it('when the grid renders, each step is numbered and titled as the wireframe draws it', () => {
    expect(card('pre-trade').textContent).toContain('[1] Pre-check');
    expect(card('rule-validation').textContent).toContain('[2] Rule Validation');
    expect(card('human-gate').textContent).toContain('[3] Human Approval');
    expect(card('broker-adapter').textContent).toContain('[4] Broker Adapter');
  });

  it('when the grid renders, the label says these are today’s counters', () => {
    expect(host.textContent).toContain('APPROVAL PIPELINE · TODAY');
  });

  it('when the grid renders, step [1] says it is deterministic and calls no model', () => {
    expect(card('pre-trade').textContent).toContain('deterministic, no LLM call');
    expect(card('pre-trade').textContent).toContain('kill-switch condition + hard limits');
  });

  it('when the grid renders, step [2] names the two kinds of Pydantic validator', () => {
    expect(card('rule-validation').textContent).toContain('Pydantic field + model validators');
    expect(card('rule-validation').textContent).toContain('position / exposure / concentration');
  });

  // --- the counters are derived, not seeded --------------------------------

  it('when the grid renders, the blocked orders it counts are the ones the queue holds', () => {
    const blocked =
      Number(summary('pre-trade').match(/(\d+) blocked/)?.[1] ?? -1) +
      Number(summary('rule-validation').match(/(\d+) blocked/)?.[1] ?? -1);

    expect(blocked).toBe(execution.blockedCount());
  });

  it('when the grid renders, the human gate counts the orders actually awaiting a signature', () => {
    const atGate = execution.ordersByStage()['human-gate'];
    const approved = atGate.filter((o) => o.status === 'approved').length;

    expect(summary('human-gate')).toBe(`${approved} approved · ${execution.pendingApprovalCount()} pending`);
    expect(execution.pendingApprovalCount()).toBeGreaterThan(0);
  });

  // --- the broker step ------------------------------------------------------

  it('when no broker is registered, step [4] says so as a posture and routes nothing', () => {
    const posture = host.querySelector('[data-testid="broker-posture"]');
    expect(posture?.textContent).toContain('No broker configured');
    expect(summary('broker-adapter')).toBe(NO_ORDERS_ROUTED);
  });

  it('when no broker is registered, step [4] is not rendered as an error', () => {
    expect(card('broker-adapter').querySelector('app-error-state')).toBeNull();
    expect(card('broker-adapter').textContent).not.toContain('Adapter error');
  });

  // --- the exit -------------------------------------------------------------

  it('when the grid renders, step [3] carries the exit to the Human Approval Gate', () => {
    const link = card('human-gate').querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toContain('Open Human Approval Gate');
    expect(link.getAttribute('href')).toBe('/approvals/approval-gate');
  });

  it('when the grid renders, no card is itself a link wrapping another link', () => {
    for (const step of cards()) {
      expect(step.querySelector('a a')).toBeNull();
    }
  });

  // --- loading --------------------------------------------------------------

  it('while the page reads, placeholders stand in for the four cards', async () => {
    vi.useFakeTimers();
    try {
      const service = TestBed.inject(GuardrailService);
      const pending = service.refresh();
      fixture.detectChanges();

      expect(cards()).toHaveLength(0);
      expect(host.querySelectorAll('app-skeleton-block')).toHaveLength(4);

      await vi.advanceTimersByTimeAsync(5_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});
