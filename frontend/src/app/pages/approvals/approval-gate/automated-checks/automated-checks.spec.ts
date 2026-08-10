/**
 * The two automated steps, and the one thing this card must never do: report a
 * verdict that has not come back as though it had.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { GuardrailService } from '../../../../services/guardrail.service';
import { AutomatedChecks } from './automated-checks';

describe('AutomatedChecks', () => {
  let fixture: ComponentFixture<AutomatedChecks>;
  let host: HTMLElement;
  let service: ApprovalGateService;
  let guardrail: GuardrailService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutomatedChecks],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AutomatedChecks);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    guardrail = TestBed.inject(GuardrailService);
    fixture.detectChanges();
  });

  function open(tradeId: string): void {
    service.select(tradeId);
    fixture.detectChanges();
  }

  function ruleRows(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-rule-result]'));
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  // --- the pre-check --------------------------------------------------------

  it('when a trade has passed the pre-check, the result is a word beside its glyph', () => {
    open('TRD-2031');

    expect(byTestId('precheck-result')?.textContent).toContain('PASS');
    expect(byTestId('kill-switch-line')?.textContent).toContain('Kill-switch not triggered');
  });

  it('when the kill-switch is engaged, the pre-check refuses and says which boundary', async () => {
    await guardrail.setKillSwitch(true, 'Drawdown breach on the held book.');
    open('TRD-2031');

    expect(byTestId('precheck-result')?.textContent).toContain('FAIL');
    expect(byTestId('kill-switch-line')?.textContent).toContain('Kill-switch engaged');
    expect(host.textContent).toContain('refuses every proposed order while trading is halted');
  });

  it('when a trade is still at the pre-check, no result is invented for it', () => {
    open('TRD-2039');

    expect(byTestId('precheck-result')?.textContent).toContain('RESULT PENDING');
  });

  it('when the pre-check is shown, the page that owns the kill-switch is one link away', () => {
    open('TRD-2031');

    const link = host.querySelector('app-cross-page-link a');
    expect(link?.getAttribute('href')).toBe('/approvals/guardrail-killswitch');
    expect(link?.textContent).toContain('Guardrail & Kill-Switch');
  });

  // --- rule validation ------------------------------------------------------

  it('when a trade has cleared the rules engine, every configured limit reads within', () => {
    open('TRD-2031');

    expect(ruleRows().map((row) => row.querySelector('dt')?.textContent?.trim())).toEqual([
      'Position limit',
      'Exposure limit',
      'Concentration limit',
    ]);
    expect(ruleRows().every((row) => row.getAttribute('data-rule-result') === 'pass')).toBe(true);
    expect(host.textContent).toContain('within');
  });

  it('when a trade is still at rule validation, every limit reads result pending', () => {
    open('TRD-2035');

    expect(ruleRows()).toHaveLength(3);
    expect(ruleRows().every((row) => row.getAttribute('data-rule-result') === 'pending')).toBe(true);
    // The words, not a blank cell and not a fabricated pass.
    expect(ruleRows().every((row) => row.textContent?.includes('result pending'))).toBe(true);
    expect(host.textContent).toContain('never as a pass and never as a fail');
  });

  it('when a rule refused a trade, only that limit reads breached, in its own words', () => {
    open('TRD-2033');

    const breached = ruleRows().filter((row) => row.getAttribute('data-rule-result') === 'fail');
    expect(breached).toHaveLength(1);
    expect(breached[0].textContent).toContain('breached');
    // The validator's own sentence, not a red badge.
    expect(breached[0].textContent?.length).toBeGreaterThan('breached'.length + 20);
  });

  it('when a limit is switched off upstream, its row disappears from this card', () => {
    guardrail.setLimitEnabled('lim-gross-exposure', false, 'Retired for the quarter.');
    open('TRD-2031');

    expect(ruleRows().map((row) => row.querySelector('dt')?.textContent?.trim())).toEqual([
      'Position limit',
      'Concentration limit',
    ]);
  });

  it('when no trade is selected, the card claims no results', () => {
    expect(ruleRows()).toHaveLength(0);
    expect(host.textContent).toContain('No automated results are available');
  });
});
