/**
 * Region 1 — and the one behaviour the page exists to get right.
 *
 * `docs/17` carries a blocking review finding against itself: its `### Stati`
 * never says what happens when the *write* that engages or releases the switch
 * fails. The proposed correction is what this suite pins down, case by case —
 * the dialog stays open, the message says the kill-switch was NOT changed, the
 * rationale the operator typed is still in the field, confirm becomes Retry,
 * and the HeroStatCard has not moved a pixel. An operator who believes trading
 * is halted when it is not is the exact hazard the page is here to prevent, so
 * every one of those is asserted from the DOM rather than from a signal.
 *
 * The failure is forced by delegating to the service's own `fail` path, not by
 * stubbing the result: that way the assertions are made against the real write
 * guard, and a future optimistic update would break them.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  KILL_SWITCH_ANNOUNCEMENT,
  KILL_SWITCH_REASON_REQUIRED,
  KILL_SWITCH_UNKNOWN,
  KILL_SWITCH_WRITE_FAILURE,
  PRE_CHECK_NOTE,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { KillSwitchHero } from './kill-switch-hero';

describe('KillSwitchHero', () => {
  let fixture: ComponentFixture<KillSwitchHero>;
  let host: HTMLElement;
  let service: GuardrailService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [KillSwitchHero] }).compileComponents();
    fixture = TestBed.createComponent(KillSwitchHero);
    host = fixture.nativeElement;
    service = TestBed.inject(GuardrailService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();
  }

  function toggle(): HTMLButtonElement {
    return host.querySelector('[data-testid="kill-switch-toggle"]') as HTMLButtonElement;
  }

  function dialog(): HTMLElement | null {
    return host.querySelector('[data-testid="reason-dialog"]');
  }

  function field(): HTMLTextAreaElement {
    return host.querySelector('[data-testid="reason-dialog-field"]') as HTMLTextAreaElement;
  }

  function confirmButton(): HTMLButtonElement {
    return host.querySelector('[data-testid="reason-dialog-confirm"]') as HTMLButtonElement;
  }

  function dialogError(): string {
    return host.querySelector('[data-testid="reason-dialog-error"]')?.textContent ?? '';
  }

  function statusText(): string {
    return host.querySelector('[data-testid="kill-switch-status"]')?.textContent ?? '';
  }

  function announcement(): string {
    return (
      host.querySelector('[data-testid="kill-switch-announcement"]')?.textContent ?? ''
    ).trim();
  }

  function type(text: string): void {
    const input = field();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  /** Runs the real write, always down its failure branch. */
  function forceWriteFailure(): { mockRestore: () => void } {
    const real = service.setKillSwitch.bind(service);
    return vi
      .spyOn(service, 'setKillSwitch')
      .mockImplementation((engaged, reason) => real(engaged, reason, true));
  }

  /** A page read in which only the kill-switch region came back empty-handed. */
  async function failedRead(): Promise<void> {
    const pending = service.refresh(['kill-switch']);
    await settle();
    await pending;
    fixture.detectChanges();
  }

  async function openDialogWith(reason: string): Promise<void> {
    toggle().focus();
    toggle().click();
    fixture.detectChanges();
    if (reason !== '') type(reason);
  }

  // --- the card -------------------------------------------------------------

  it('when the state is known, the card prints the reading as icon and word', () => {
    expect(statusText()).toContain('TRADING ENABLED');
    expect(statusText()).toContain('●');
  });

  it('when the state is known, the card names when it last changed and who changed it', () => {
    const line = host.querySelector('[data-testid="kill-switch-last-change"]')?.textContent ?? '';
    expect(line).toContain('2026-07-29 14:02 UTC');
    expect(line).toContain('risk.admin');
  });

  it('when the card renders, it repeats that the pre-check runs before any model call', () => {
    expect(host.querySelector('[data-testid="pre-check-note"]')?.textContent?.trim()).toBe(
      PRE_CHECK_NOTE,
    );
  });

  it('when trading is enabled, the primary action offers to engage the switch', () => {
    expect(toggle().textContent).toContain('Engage kill-switch');
    expect(toggle().disabled).toBe(false);
  });

  it('when the card first renders, the assertive region is mounted and silent', () => {
    const region = host.querySelector('[data-testid="kill-switch-announcement"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('assertive');
    expect(announcement()).toBe('');
  });

  // --- never act on a value that is not known -------------------------------

  it('while the state is being read, the toggle is disabled and a placeholder stands in', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(toggle().disabled).toBe(true);
    expect(host.querySelector('[data-testid="kill-switch-loading"]')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(host.querySelector('[data-testid="kill-switch-status"]')).toBeNull();

    await settle();
    await pending;
  });

  it('when the state could not be read, the card says so and the toggle stays disabled', async () => {
    await failedRead();

    const error = host.querySelector('[data-testid="kill-switch-error"]');
    expect(error?.textContent).toContain(KILL_SWITCH_UNKNOWN);
    expect(toggle().disabled).toBe(true);
  });

  it('when the failed read is retried, the toggle stays disabled until the state comes back', async () => {
    await failedRead();

    const retry = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();

    expect(toggle().disabled).toBe(true);

    await settle();
    expect(toggle().disabled).toBe(false);
    expect(statusText()).toContain('TRADING ENABLED');
  });

  // --- the confirmation -----------------------------------------------------

  it('when the toggle is pressed, an alertdialog opens with focus on the reason field', async () => {
    await openDialogWith('');

    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('alertdialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(panel?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.activeElement).toBe(field());
  });

  it('when the toggle is pressed, the state has not changed yet', async () => {
    await openDialogWith('');

    expect(statusText()).toContain('TRADING ENABLED');
    expect(announcement()).toBe('');
  });

  it('when the dialog is cancelled, focus returns to the toggle', async () => {
    await openDialogWith('');

    (host.querySelector('[data-testid="reason-dialog-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('when Escape is pressed inside the dialog, it closes and focus returns to the toggle', async () => {
    await openDialogWith('');

    field().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('when confirm is pressed with a blank reason, the write is refused before any round trip', async () => {
    await openDialogWith('   ');

    confirmButton().click();
    await settle();

    expect(dialog()).not.toBeNull();
    expect(dialogError()).toContain(KILL_SWITCH_REASON_REQUIRED);
    expect(statusText()).toContain('TRADING ENABLED');
    expect(announcement()).toBe('');
  });

  it('when confirm is pressed with a blank reason, the refusal is not dressed up as a retry', async () => {
    await openDialogWith('   ');

    confirmButton().click();
    await settle();

    // Nothing was sent, so there is nothing to retry: the button keeps the
    // action's own label, and the field is the thing marked invalid.
    expect(confirmButton().textContent?.trim()).toBe('Engage kill-switch');
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  // --- the blocking fix: a write that does not land -------------------------

  it('when the write fails, the dialog stays open and says the kill-switch was NOT changed', async () => {
    forceWriteFailure();
    await openDialogWith('Vendor price feed stalled — halting until it is confirmed clean.');

    confirmButton().click();
    await settle();

    expect(dialog()).not.toBeNull();
    expect(dialogError()).toContain(KILL_SWITCH_WRITE_FAILURE);
    expect(dialogError()).toContain('NOT changed');
    expect(host.querySelector('[data-testid="reason-dialog-error"]')?.getAttribute('role')).toBe(
      'alert',
    );
  });

  it('when the write fails, the reason already typed is kept in the field', async () => {
    forceWriteFailure();
    const reason = 'Vendor price feed stalled — halting until it is confirmed clean.';
    await openDialogWith(reason);

    confirmButton().click();
    await settle();

    expect(field().value).toBe(reason);
  });

  it('when the write fails, the confirm action becomes a retry', async () => {
    forceWriteFailure();
    await openDialogWith('Halting: the pre-check cannot be trusted while the feed is stale.');

    confirmButton().click();
    await settle();

    expect(confirmButton().textContent?.trim()).toBe('Retry');
  });

  it('when the write fails, the hero card has not moved and nothing is announced', async () => {
    forceWriteFailure();
    const before = statusText();
    await openDialogWith('Halting: the pre-check cannot be trusted while the feed is stale.');

    confirmButton().click();
    await settle();

    expect(statusText()).toBe(before);
    expect(statusText()).toContain('TRADING ENABLED');
    expect(statusText()).not.toContain('KILL-SWITCH ENGAGED');
    expect(announcement()).toBe('');
  });

  it('when the retry lands, the card finally moves and the change is announced assertively', async () => {
    const spy = forceWriteFailure();
    await openDialogWith('Halting: the pre-check cannot be trusted while the feed is stale.');

    confirmButton().click();
    await settle();
    expect(statusText()).toContain('TRADING ENABLED');

    spy.mockRestore();
    confirmButton().click();
    await settle();

    expect(dialog()).toBeNull();
    expect(statusText()).toContain('KILL-SWITCH ENGAGED');
    expect(statusText()).toContain('✕');
    expect(announcement()).toBe(KILL_SWITCH_ANNOUNCEMENT.engaged);
  });

  // --- the happy path -------------------------------------------------------

  it('while the write is in flight, the toggle and confirm are both held down', async () => {
    await openDialogWith('Halting for the duration of the vendor outage.');

    confirmButton().click();
    fixture.detectChanges();

    expect(confirmButton().disabled).toBe(true);
    expect(toggle().disabled).toBe(true);

    await settle();
  });

  it('when the change is confirmed, the card, the action and the audit trail all move together', async () => {
    const events = service.events().length;
    await openDialogWith('Halting for the duration of the vendor outage.');

    confirmButton().click();
    await settle();

    expect(statusText()).toContain('KILL-SWITCH ENGAGED');
    expect(toggle().textContent).toContain('Release kill-switch');
    expect(host.querySelector('[data-testid="kill-switch-reason"]')?.textContent).toContain(
      'Halting for the duration of the vendor outage.',
    );
    expect(service.events().length).toBe(events + 1);
  });

  it('when the dialog is reopened after a change, the reason field starts empty', async () => {
    await openDialogWith('Halting for the duration of the vendor outage.');
    confirmButton().click();
    await settle();

    await openDialogWith('');
    expect(field().value).toBe('');
    expect(dialogError()).toBe('');
  });
});
