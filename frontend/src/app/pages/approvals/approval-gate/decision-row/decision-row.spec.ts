/**
 * The decision, and the two guarantees the doc puts around it: the controls are
 * announced as unavailable rather than hidden away from the human gate, and an
 * irreversible action is never one keystroke away — the confirmation opens with
 * focus on Cancel.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  DECISION_EFFECT_SENTENCE,
  DECISION_WRITE_FAILURE,
  NOT_AT_GATE,
} from '../../../../models/approval.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { ExecutionService } from '../../../../services/execution.service';
import { DecisionRow } from './decision-row';

/**
 * jsdom implements `<dialog>` as an element with a reflected `open` attribute
 * and nothing else — `showModal()` and `close()` are absent, so the shared
 * `ConfirmDialog`'s effect throws the moment a spec opens one. The shim
 * supplies exactly those two browser primitives and nothing more; in
 * particular it focuses nothing, so the focus assertions below are about this
 * component's own code rather than about the shim.
 */
function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement): void {
      this.open = false;
    };
  }
}

function settle(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('DecisionRow', () => {
  let fixture: ComponentFixture<DecisionRow>;
  let host: HTMLElement;
  let service: ApprovalGateService;
  let execution: ExecutionService;

  beforeAll(() => {
    installDialogPolyfill();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DecisionRow] }).compileComponents();

    fixture = TestBed.createComponent(DecisionRow);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    execution = TestBed.inject(ExecutionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function open(tradeId: string): void {
    service.select(tradeId);
    fixture.detectChanges();
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function approveButton(): HTMLButtonElement {
    return byTestId('approve-button') as HTMLButtonElement;
  }

  function note(): HTMLTextAreaElement {
    return host.querySelector('#approval-decision-note') as HTMLTextAreaElement;
  }

  function type(value: string): void {
    const field = note();
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function dialogButton(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('dialog button')).find(
      (button) => button.textContent?.trim() === label,
    );
    expect(match).toBeTruthy();
    return match!;
  }

  // --- at the gate ----------------------------------------------------------

  it('when the trade is at the human gate, the row states what approving will mean', () => {
    open('TRD-2031');

    expect(byTestId('decision-sentence')?.textContent?.trim()).toBe(
      DECISION_EFFECT_SENTENCE['not-configured'],
    );
    expect(note()).not.toBeNull();
    expect(approveButton().getAttribute('aria-disabled')).toBeNull();
    expect(byTestId('reject-button')?.getAttribute('aria-disabled')).toBeNull();
  });

  it('when the trade is at the human gate, both controls are native buttons', () => {
    open('TRD-2031');

    expect(approveButton().tagName).toBe('BUTTON');
    expect(approveButton().getAttribute('type')).toBe('button');
    expect((byTestId('reject-button') as HTMLElement).tagName).toBe('BUTTON');
  });

  // --- away from the gate ---------------------------------------------------

  it('when the trade is not at the human gate, the controls are disabled, not hidden', () => {
    open('TRD-2035');

    const approve = approveButton();
    const reject = byTestId('reject-button')!;

    // Present and announced — a control that disappears teaches nothing.
    expect(approve).not.toBeNull();
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(reject.getAttribute('aria-disabled')).toBe('true');

    // …with the reason wired to the control that is unavailable.
    const reasonId = approve.getAttribute('aria-describedby');
    expect(reasonId).toBe(reject.getAttribute('aria-describedby'));
    expect(host.querySelector(`#${reasonId}`)?.textContent?.trim()).toBe(NOT_AT_GATE);
  });

  it('when the trade is not at the human gate, the decision row itself is absent', () => {
    open('TRD-2035');

    expect(byTestId('decision-sentence')).toBeNull();
    expect(note()).toBeNull();
  });

  it('when a disabled control is clicked, nothing is asked and nothing opens', () => {
    open('TRD-2035');

    approveButton().click();
    fixture.detectChanges();

    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(service.selectedTrade()?.status).toBe('pending');
  });

  // --- the confirmation -----------------------------------------------------

  it('when Approve is pressed, the confirmation opens with focus on Cancel', async () => {
    open('TRD-2031');
    approveButton().focus();

    approveButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    // Confirm is one keystroke from the opener unless something puts the caret
    // on Cancel; this is that something.
    expect(document.activeElement).toBe(dialogButton('Cancel'));
    expect(document.activeElement).not.toBe(dialogButton('Approve trade'));
  });

  it('when the confirmation opens, it restates the outcome in the posture’s own terms', () => {
    open('TRD-2031');
    approveButton().click();
    fixture.detectChanges();

    const dialog = host.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Approve TRD-2031?');
    expect(dialog.textContent).toContain('AAPL BUY 12,400 sh ($2,460,000)');
    expect(dialog.textContent).toContain('Approved for manual placement');
  });

  it('when an adapter is connected, the same confirmation says the order will be routed', () => {
    execution.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });
    open('TRD-2031');
    approveButton().click();
    fixture.detectChanges();

    expect(host.querySelector('dialog')?.textContent).toContain('Approved and routed automatically');
  });

  it('when Reject is pressed, the confirmation names what will not happen', () => {
    open('TRD-2031');
    (byTestId('reject-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = host.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Reject TRD-2031?');
    expect(dialog.textContent).toContain('Nothing is routed and nothing is authorised');
  });

  it('when the confirmation is cancelled, focus returns to the button that opened it', async () => {
    open('TRD-2031');
    const opener = approveButton();
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await fixture.whenStable();

    dialogButton('Cancel').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(approveButton());
    expect(service.selectedTrade()?.status).toBe('pending');
  });

  it('when the confirmation is cancelled, a typed note is not thrown away', async () => {
    open('TRD-2031');
    type('Waiting on the desk');
    approveButton().click();
    fixture.detectChanges();

    dialogButton('Cancel').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(note().value).toBe('Waiting on the desk');
  });

  // --- one note per trade ---------------------------------------------------

  it('when another trade is selected, the note written about the first does not follow it', () => {
    open('TRD-2031');
    type('AAPL is already at the sleeve cap.');

    // The region is not rebuilt between two pending trades — it is the same
    // component instance — so a note held in plain component state would be
    // submitted with a decision about a trade it was never written for.
    open('TRD-2030');

    expect(note().value).toBe('');
  });

  it('when another trade is selected mid-confirmation, the confirmation does not follow it', () => {
    open('TRD-2031');
    approveButton().click();
    fixture.detectChanges();
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);

    open('TRD-2030');

    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });

  // --- submitting -----------------------------------------------------------

  it('when the confirmation is confirmed, the decision and its note are recorded', async () => {
    open('TRD-2031');
    type('Sized within the desk limit.');
    approveButton().click();
    fixture.detectChanges();

    dialogButton('Approve trade').click();
    await settle();
    fixture.detectChanges();

    const decision = service.decisionFor('TRD-2031')!;
    expect(decision.outcome).toBe('approved');
    expect(decision.effect).toBe('manual-placement');
    expect(decision.note).toBe('Sized within the desk limit.');
    // The region has nothing left to offer for this trade.
    expect(byTestId('decision-sentence')).toBeNull();
  });

  it('when the write does not land, nothing is recorded and the note survives', async () => {
    vi.spyOn(execution, 'advanceStage').mockReturnValue(false);
    open('TRD-2031');
    type('Approved by the risk desk.');

    approveButton().click();
    fixture.detectChanges();
    dialogButton('Approve trade').click();
    await settle();
    fixture.detectChanges();

    const failure = byTestId('decision-error')!;
    expect(failure.getAttribute('role')).toBe('alert');
    expect(failure.textContent).toContain(DECISION_WRITE_FAILURE);
    // The trade is still waiting, and the reason is still typed.
    expect(service.canDecide()).toBe(true);
    expect(note().value).toBe('Approved by the risk desk.');
    expect(service.decisionFor('TRD-2031')).toBeNull();
  });
});
