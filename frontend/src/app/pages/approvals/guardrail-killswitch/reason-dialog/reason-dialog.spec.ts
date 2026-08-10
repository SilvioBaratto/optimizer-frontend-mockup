/**
 * The shared confirmation, tested on its own because two callers depend on it:
 * the global kill-switch and the kill-switch-scope limit. Both move the same
 * pass/fail boundary, and the spec holds both behind the same rationale, so a
 * regression here would be a regression in two places at once.
 *
 * The contract is small and entirely observable: an `alertdialog`, opening
 * focus on the field, Escape and Cancel both cancelling, focus handed back to
 * the opener, and — the important one — an `error` that keeps the dialog open
 * with the typed text intact and turns confirm into a retry.
 */

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReasonDialog } from './reason-dialog';

@Component({
  imports: [ReasonDialog],
  template: `
    <button id="opener" type="button" (click)="open.set(true)">Open</button>
    <app-reason-dialog
      [open]="open()"
      title="Engage kill-switch"
      message="Engaging halts trading."
      confirmLabel="Engage kill-switch"
      [destructive]="true"
      [error]="error()"
      [retryable]="retryable()"
      [(reason)]="reason"
      (confirmed)="confirmed.push($event)"
      (cancelled)="open.set(false)"
    />
  `,
})
class TestHost {
  readonly open = signal(false);
  readonly reason = signal('');
  readonly error = signal<string | null>(null);
  readonly retryable = signal(true);
  readonly confirmed: string[] = [];
}

describe('ReasonDialog', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: HTMLElement;
  let component: TestHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
    fixture = TestBed.createComponent(TestHost);
    host = fixture.nativeElement;
    component = fixture.componentInstance;
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function opener(): HTMLButtonElement {
    return host.querySelector('#opener') as HTMLButtonElement;
  }

  function panel(): HTMLElement | null {
    return host.querySelector('[data-testid="reason-dialog"]');
  }

  function field(): HTMLTextAreaElement {
    return host.querySelector('[data-testid="reason-dialog-field"]') as HTMLTextAreaElement;
  }

  function confirmButton(): HTMLButtonElement {
    return host.querySelector('[data-testid="reason-dialog-confirm"]') as HTMLButtonElement;
  }

  function open(): void {
    opener().focus();
    opener().click();
    fixture.detectChanges();
  }

  function type(text: string): void {
    field().value = text;
    field().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('when closed, nothing of the dialog is in the document', () => {
    expect(panel()).toBeNull();
  });

  it('when opened, it is an alertdialog with an accessible name', () => {
    open();

    expect(panel()?.getAttribute('role')).toBe('alertdialog');
    expect(panel()?.getAttribute('aria-modal')).toBe('true');
    const labelledBy = panel()?.getAttribute('aria-labelledby');
    expect(host.querySelector(`#${labelledBy}`)?.textContent).toBe('Engage kill-switch');
  });

  it('when opened, focus lands on the reason field rather than on a button', () => {
    open();

    expect(document.activeElement).toBe(field());
  });

  it('when Tab reaches the last control, focus wraps back inside the dialog', () => {
    open();
    confirmButton().focus();

    confirmButton().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(document.activeElement).toBe(field());
  });

  it('when confirmed, it emits the text that was typed', () => {
    open();
    type('Vendor feed stalled.');

    confirmButton().click();
    fixture.detectChanges();

    expect(component.confirmed).toEqual(['Vendor feed stalled.']);
  });

  it('when cancelled, it closes and hands focus back to the opener', () => {
    open();

    (host.querySelector('[data-testid="reason-dialog-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('when Escape is pressed, it closes and hands focus back to the opener', () => {
    open();

    field().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  // --- the blocking error ---------------------------------------------------

  it('when an error is set, the dialog stays open and announces it as an alert', () => {
    open();
    type('Vendor feed stalled.');

    component.error.set('Could not confirm: the kill-switch was NOT changed.');
    fixture.detectChanges();

    expect(panel()).not.toBeNull();
    const alert = host.querySelector('[data-testid="reason-dialog-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('NOT changed');
  });

  it('when a write fails, the typed reason survives and confirm becomes a retry', () => {
    open();
    type('Vendor feed stalled.');

    component.error.set('Could not confirm: the kill-switch was NOT changed.');
    fixture.detectChanges();

    expect(field().value).toBe('Vendor feed stalled.');
    expect(confirmButton().textContent?.trim()).toBe('Retry');
    expect(field().getAttribute('aria-describedby')).toContain('error');
  });

  it('when a write fails, the rationale is not marked invalid — the transport failed, not the text', () => {
    open();
    type('Vendor feed stalled.');

    component.error.set('Could not confirm: the kill-switch was NOT changed.');
    fixture.detectChanges();

    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('when the error is not retryable, confirm keeps its label and the field is the invalid one', () => {
    open();
    component.retryable.set(false);
    component.error.set('A reason is required.');
    fixture.detectChanges();

    expect(confirmButton().textContent?.trim()).toBe('Engage kill-switch');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toContain('error');
  });

  it('when retried after an error, it emits the same reason again', () => {
    open();
    type('Vendor feed stalled.');
    component.error.set('Could not confirm.');
    fixture.detectChanges();

    confirmButton().click();
    fixture.detectChanges();

    expect(component.confirmed).toEqual(['Vendor feed stalled.']);
  });
});
