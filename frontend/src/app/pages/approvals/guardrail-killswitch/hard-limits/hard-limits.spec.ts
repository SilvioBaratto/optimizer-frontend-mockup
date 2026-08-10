/**
 * Regions 4 + 5 — the configured limits.
 *
 * The spec's `Casi limite` are the interesting cases and each gets its own
 * assertion: a BREACH stays visible and highlighted after the trade that raised
 * it is gone, and a disabled limit stays in the grid attenuated rather than
 * disappearing. Both are about a row that a naive implementation would filter
 * out, and both are things an auditor would come looking for.
 *
 * The third is the one with teeth: switching off a limit whose scope *is* the
 * kill-switch condition moves the same pass/fail boundary as the global switch,
 * so it is held behind the same rationale — refused without one, and refused
 * without changing anything.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  LIMIT_REASON_REQUIRED,
  NO_LIMITS_DETAIL,
  NO_LIMITS_TITLE,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { HardLimits } from './hard-limits';

const KILL_LIMIT = 'lim-kill-condition';
const BREACHED_LIMIT = 'lim-single-name';
const DISABLED_LIMIT = 'lim-sector-cap';

describe('HardLimits', () => {
  let fixture: ComponentFixture<HardLimits>;
  let host: HTMLElement;
  let service: GuardrailService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [HardLimits],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HardLimits);
    host = fixture.nativeElement;
    service = TestBed.inject(GuardrailService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();
  }

  function cards(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-limit]'));
  }

  function card(id: string): HTMLElement {
    return host.querySelector(`[data-limit="${id}"]`) as HTMLElement;
  }

  function click(selector: string): void {
    (host.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function dialogOpen(): boolean {
    return host.querySelector('[data-testid="reason-dialog"]') !== null;
  }

  function dialogError(): string {
    return host.querySelector('[data-testid="reason-dialog-error"]')?.textContent ?? '';
  }

  function typeReason(text: string): void {
    const field = host.querySelector(
      '[data-testid="reason-dialog-field"]',
    ) as HTMLTextAreaElement;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  // --- the grid -------------------------------------------------------------

  it('when the grid renders, every configured limit has a card', () => {
    expect(cards()).toHaveLength(service.limits().length);
    expect(cards()).toHaveLength(5);
  });

  it('when a card renders, it names the scope, the validator kind and the threshold', () => {
    const position = card('lim-max-position');
    expect(position.textContent).toContain('Max position size');
    expect(position.textContent).toContain('position');
    expect(position.textContent).toContain('@field_validator');
    expect(host.querySelector('[data-threshold="lim-max-position"]')?.textContent?.trim()).toBe(
      '8.0% NAV',
    );
  });

  it('when a limit has no numeric threshold, the card prints a dash rather than a zero', () => {
    expect(host.querySelector(`[data-threshold="${KILL_LIMIT}"]`)?.textContent?.trim()).toBe('—');
    expect(card(KILL_LIMIT).textContent).toContain('@model_validator(after)');
  });

  it('when the section renders, it carries the Add limit action beside its label', () => {
    expect(host.textContent).toContain('HARD LIMITS & VALIDATORS');
    expect(host.querySelector('[data-testid="add-limit"]')).not.toBeNull();
  });

  // --- casi limite ----------------------------------------------------------

  it('when a limit is in BREACH, the card stays in the grid and is highlighted', () => {
    const breached = card(BREACHED_LIMIT);
    expect(breached).not.toBeNull();
    expect(breached.getAttribute('data-status')).toBe('breach');
    expect(breached.className).toContain('border-danger');
    expect(host.querySelector(`[data-badge="${BREACHED_LIMIT}"]`)?.textContent).toContain('BREACH');
  });

  it('when a limit is disabled, the card stays in the grid, attenuated and labelled', () => {
    const disabled = card(DISABLED_LIMIT);
    expect(disabled).not.toBeNull();
    expect(disabled.getAttribute('data-enabled')).toBe('false');
    expect(disabled.className).toContain('grayscale');
    expect(disabled.textContent).toContain('Disabled');
  });

  it('when a limit is switched off, it keeps its position in the grid', () => {
    const before = cards().map((c) => c.getAttribute('data-limit'));

    click('[data-toggle="lim-max-position"]');

    expect(cards().map((c) => c.getAttribute('data-limit'))).toEqual(before);
    expect(card('lim-max-position').getAttribute('data-enabled')).toBe('false');
  });

  // --- the kill-switch-scope limit -----------------------------------------

  it('when a kill-switch-scope limit is switched off, the same confirmation opens', () => {
    click(`[data-toggle="${KILL_LIMIT}"]`);

    expect(dialogOpen()).toBe(true);
    expect(host.querySelector('[data-testid="reason-dialog"]')?.getAttribute('role')).toBe(
      'alertdialog',
    );
    expect(card(KILL_LIMIT).getAttribute('data-enabled')).toBe('true');
  });

  it('when that confirmation is submitted blank, it is refused and nothing changes', () => {
    click(`[data-toggle="${KILL_LIMIT}"]`);
    click('[data-testid="reason-dialog-confirm"]');

    expect(dialogOpen()).toBe(true);
    expect(dialogError()).toContain(LIMIT_REASON_REQUIRED);
    expect(card(KILL_LIMIT).getAttribute('data-enabled')).toBe('true');
    expect(service.limit(KILL_LIMIT)?.enabled).toBe(true);
  });

  it('when that confirmation is submitted blank, the refusal is not dressed up as a retry', () => {
    click(`[data-toggle="${KILL_LIMIT}"]`);
    click('[data-testid="reason-dialog-confirm"]');

    // Nothing was sent, so there is nothing to retry — the button keeps its own
    // label, and the field it is waiting on is the one marked invalid.
    const confirm = host.querySelector('[data-testid="reason-dialog-confirm"]');
    expect(confirm?.textContent?.trim()).toBe('Disable limit');
    expect(
      host.querySelector('[data-testid="reason-dialog-field"]')?.getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('when that confirmation carries a reason, the limit is switched off and stays in the grid', () => {
    click(`[data-toggle="${KILL_LIMIT}"]`);
    typeReason('Superseded by the venue-side kill switch for the migration window.');
    click('[data-testid="reason-dialog-confirm"]');

    expect(dialogOpen()).toBe(false);
    expect(card(KILL_LIMIT).getAttribute('data-enabled')).toBe('false');
    expect(cards()).toHaveLength(5);
  });

  it('when an ordinary limit is switched off, no confirmation is asked for', () => {
    click(`[data-toggle="${DISABLED_LIMIT}"]`);

    expect(dialogOpen()).toBe(false);
    expect(card(DISABLED_LIMIT).getAttribute('data-enabled')).toBe('true');
  });

  // --- View log -------------------------------------------------------------

  it('when View log is pressed, the audit trail is filtered to that validator and it is announced', () => {
    click(`[data-log="${BREACHED_LIMIT}"]`);

    expect(service.search()).toBe('concentration_limit');
    expect(host.querySelector('[data-testid="limits-filter-notice"]')?.textContent).toContain(
      'concentration_limit',
    );
  });

  it('when View log is pressed, the button says which validator it opens', () => {
    expect(host.querySelector(`[data-log="${BREACHED_LIMIT}"]`)?.getAttribute('aria-label')).toBe(
      'View audit log for concentration_limit',
    );
  });

  // --- add / edit -----------------------------------------------------------

  it('when Add limit is pressed, an empty form opens', () => {
    click('[data-testid="add-limit"]');

    const form = host.querySelector('[data-testid="limit-form"]');
    expect(form).not.toBeNull();
    expect(form?.textContent).toContain('Add limit');
    expect((host.querySelector('[data-testid="limit-form-name"]') as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('when Edit is pressed on a card, the form opens prefilled from that limit', () => {
    click(`[data-edit="${BREACHED_LIMIT}"]`);

    expect((host.querySelector('[data-testid="limit-form-name"]') as HTMLInputElement).value).toBe(
      'Max single-name concentration',
    );
    expect(
      (host.querySelector('[data-testid="limit-form-threshold"]') as HTMLInputElement).value,
    ).toBe('12');
  });

  it('when a save is rejected, the grid behind the form is untouched', async () => {
    click('[data-testid="add-limit"]');
    const name = host.querySelector('[data-testid="limit-form-name"]') as HTMLInputElement;
    name.value = 'Max position size';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    click('[data-testid="limit-form-save"]');
    await settle();

    expect(host.querySelector('[data-testid="limit-form"]')).not.toBeNull();
    expect(cards()).toHaveLength(5);
    expect(host.querySelector('[data-testid="limit-form-errors"]')?.textContent).toContain(
      'limit_name_not_unique',
    );
  });

  it('when a save is accepted, the form closes and the new limit joins the grid', async () => {
    click('[data-testid="add-limit"]');
    const name = host.querySelector('[data-testid="limit-form-name"]') as HTMLInputElement;
    name.value = 'Max sleeve size';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const threshold = host.querySelector('[data-testid="limit-form-threshold"]') as HTMLInputElement;
    threshold.value = '6';
    threshold.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    click('[data-testid="limit-form-save"]');
    await settle();

    expect(host.querySelector('[data-testid="limit-form"]')).toBeNull();
    expect(cards()).toHaveLength(6);
    expect(host.textContent).toContain('Max sleeve size');
  });

  // --- the four states ------------------------------------------------------

  it('while the limits are being read, placeholders stand in and the grid is absent', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(cards()).toHaveLength(0);
    expect(host.querySelector('[data-testid="limits-loading"]')?.getAttribute('aria-busy')).toBe(
      'true',
    );

    await settle();
    await pending;
  });

  it('when no limits are configured, the empty state prints the spec’s own copy', async () => {
    service.snapshotHasLimits.set(false);
    const pending = service.refresh();
    await settle();
    await pending;
    fixture.detectChanges();

    const empty = host.querySelector('app-empty-state');
    const text = empty?.textContent ?? '';
    expect(text).toContain(NO_LIMITS_TITLE);
    expect(text).toContain(NO_LIMITS_DETAIL);
    // …and says it once: the sentence is split at its em dash, not repeated.
    expect(text.match(/No limits configured yet/g)).toHaveLength(1);
    expect(host.querySelector('[data-testid="empty-add-limit"]')).not.toBeNull();
  });

  it('when the limits read fails, the error is localised and the retry restores the grid', async () => {
    const pending = service.refresh(['limits']);
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="limits-error"]')?.textContent).toContain(
      'Could not read the configured hard limits.',
    );
    expect(cards()).toHaveLength(0);
    expect(host.querySelector('[data-testid="add-limit"]')).not.toBeNull();

    const retry = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    ) as HTMLButtonElement;
    retry.click();
    await settle();

    expect(host.querySelector('[data-testid="limits-error"]')).toBeNull();
    expect(cards()).toHaveLength(5);
  });
});
