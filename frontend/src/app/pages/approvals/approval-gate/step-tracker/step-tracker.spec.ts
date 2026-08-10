/**
 * The four mandatory steps, and the three ways the current one is marked —
 * none of which is colour.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { ExecutionService } from '../../../../services/execution.service';
import { StepTracker } from './step-tracker';

describe('StepTracker', () => {
  let fixture: ComponentFixture<StepTracker>;
  let host: HTMLElement;
  let service: ApprovalGateService;
  let execution: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StepTracker] }).compileComponents();

    fixture = TestBed.createComponent(StepTracker);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    execution = TestBed.inject(ExecutionService);
    fixture.detectChanges();
  });

  function steps(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-testid="step-tracker"] li'));
  }

  function open(tradeId: string): void {
    service.select(tradeId);
    fixture.detectChanges();
  }

  it('when no trade is selected, the tracker has nothing to place', () => {
    expect(steps()).toHaveLength(0);
  });

  it('when a trade is selected, all four mandatory steps are listed in order', () => {
    open('TRD-2031');

    const labels = ['Pre-check', 'Rule Validation', 'Human Approval', 'Broker Adapter'];
    expect(steps()).toHaveLength(4);
    labels.forEach((label, index) => expect(steps()[index].textContent).toContain(label));
    expect(host.querySelector('[data-testid="step-tracker"]')?.tagName).toBe('OL');
  });

  it('when a trade is at the human gate, that step is marked in words and for a screen reader', () => {
    open('TRD-2031');

    const current = steps().filter((step) => step.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Human Approval');
    expect(current[0].textContent).toContain('— current');
    expect(current[0].getAttribute('data-step-state')).toBe('current');
  });

  it('when a trade is at the human gate, the steps behind it are marked passed', () => {
    open('TRD-2031');

    expect(steps().map((step) => step.getAttribute('data-step-state'))).toEqual([
      'passed',
      'passed',
      'current',
      'unreachable',
    ]);
    expect(steps()[0].textContent).toContain('Passed');
  });

  it('when no adapter is registered, the fourth step is unreachable and says why', () => {
    open('TRD-2031');

    const broker = steps()[3];
    expect(broker.getAttribute('data-step-state')).toBe('unreachable');
    // Not "not yet reached": the step does not run at all under this posture.
    expect(broker.textContent).toContain('Not reached — no broker configured');
  });

  it('when an adapter is connected, the fourth step becomes one still to come', () => {
    execution.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });
    open('TRD-2031');

    expect(steps()[3].getAttribute('data-step-state')).toBe('upcoming');
    expect(steps()[3].textContent).toContain('Not yet reached');
  });

  it('when a trade is still at the pre-check, only the first step is current', () => {
    service.stepFilter.set('pre-trade');
    open('TRD-2039');

    expect(steps().map((step) => step.getAttribute('data-step-state'))).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'unreachable',
    ]);
  });
});
