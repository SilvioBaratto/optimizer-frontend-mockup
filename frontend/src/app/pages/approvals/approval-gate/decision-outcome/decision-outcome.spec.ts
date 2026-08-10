/**
 * The historical outcome, and the distinction the page exists to make: which of
 * the two things "approved" meant when it was signed.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { ExecutionService } from '../../../../services/execution.service';
import { DecisionOutcome } from './decision-outcome';

describe('DecisionOutcome', () => {
  let fixture: ComponentFixture<DecisionOutcome>;
  let host: HTMLElement;
  let service: ApprovalGateService;
  let execution: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DecisionOutcome] }).compileComponents();

    fixture = TestBed.createComponent(DecisionOutcome);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    execution = TestBed.inject(ExecutionService);
    fixture.detectChanges();
  });

  function open(tradeId: string): void {
    service.select(tradeId);
    fixture.detectChanges();
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  it('when the trade is still waiting, no outcome card is rendered at all', () => {
    open('TRD-2031');

    expect(byTestId('outcome-status')).toBeNull();
  });

  it('when a trade was approved with no adapter, the card says it was never routed', () => {
    open('TRD-2028');

    expect(byTestId('outcome-status')?.textContent).toContain('APPROVED');
    expect(byTestId('outcome-effect')?.textContent).toContain('manual placement');
    expect(byTestId('outcome-meaning')?.textContent).toContain('does not leave the system');
    expect(host.textContent).toContain('09:44:39');
    expect(host.textContent).toContain('No broker configured');
  });

  it('when a trade was rejected, the card names both things that did not happen', () => {
    open('TRD-2022');

    expect(byTestId('outcome-status')?.textContent).toContain('REJECTED');
    expect(byTestId('outcome-effect')).toBeNull();
    expect(byTestId('outcome-meaning')?.textContent).toContain(
      'nothing was routed and nothing was authorised',
    );
  });

  it('when an adapter is registered later, a past approval is not relabelled as routed', () => {
    open('TRD-2028');
    execution.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });
    fixture.detectChanges();

    // The order never left the system; today's posture cannot rewrite that.
    expect(byTestId('outcome-effect')?.textContent).toContain('manual placement');
    expect(byTestId('outcome-effect')?.textContent).not.toContain('routed to the broker');
    expect(host.textContent).toContain('No broker configured');
  });
});
