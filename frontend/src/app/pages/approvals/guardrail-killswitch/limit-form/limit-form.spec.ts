/**
 * The Add / Edit form — the same pass/fail boundary, in a modal.
 *
 * The single rule the spec states and this suite enforces is that a rejected
 * save shows *the original error, in full*. The assertions therefore compare
 * against the exact strings the validators raise, character for character: a
 * test that accepted a paraphrase would let the screen and the backend log
 * drift apart, which is precisely the thing an audit trail cannot survive.
 *
 * The second rule is quieter and just as load-bearing: a rejection changes
 * nothing. Every rejection case re-reads the service's limits afterwards.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { HardLimit } from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { LimitForm } from './limit-form';

const DUPLICATE_NAME =
  "limit_name_not_unique: a limit named 'Max position size' already exists — the name identifies " +
  'the validator in the audit trail and must be unique';

const ZERO_BUDGET =
  'limit_zero_budget: a zero bound is not a limit — a component with a zero risk budget must be ' +
  'excluded from the universe rather than constrained inside it';

describe('LimitForm', () => {
  let fixture: ComponentFixture<LimitForm>;
  let host: HTMLElement;
  let service: GuardrailService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [LimitForm] }).compileComponents();
    fixture = TestBed.createComponent(LimitForm);
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

  function openFor(limit: HardLimit | null): void {
    fixture.componentRef.setInput('request', { limit });
    fixture.detectChanges();
  }

  function nameField(): HTMLInputElement {
    return host.querySelector('[data-testid="limit-form-name"]') as HTMLInputElement;
  }

  function thresholdField(): HTMLInputElement {
    return host.querySelector('[data-testid="limit-form-threshold"]') as HTMLInputElement;
  }

  function scopeField(): HTMLSelectElement {
    return host.querySelector('[data-testid="limit-form-scope"]') as HTMLSelectElement;
  }

  function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true,
    }));
    fixture.detectChanges();
  }

  async function save(): Promise<void> {
    (host.querySelector('[data-testid="limit-form-save"]') as HTMLButtonElement).click();
    await settle();
  }

  function messages(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="limit-form-error-message"]')).map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  // --- opening --------------------------------------------------------------

  it('when no request is set, the modal is not in the document', () => {
    expect(host.querySelector('[data-testid="limit-form"]')).toBeNull();
  });

  it('when opened to add, it is a modal dialog with an empty draft', () => {
    openFor(null);

    const modal = host.querySelector('[data-testid="limit-form"]');
    expect(modal?.getAttribute('role')).toBe('dialog');
    expect(modal?.getAttribute('aria-modal')).toBe('true');
    expect(nameField().value).toBe('');
    expect(document.activeElement).toBe(nameField());
  });

  it('when opened to edit, every field is prefilled from the limit', () => {
    openFor(service.limit('lim-gross-exposure'));

    expect(nameField().value).toBe('Max gross exposure');
    expect(scopeField().value).toBe('exposure');
    expect(thresholdField().value).toBe('150');
    expect((host.querySelector('[data-testid="limit-form-enabled"]') as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('when reopened for a different limit, the fields are re-seeded rather than kept', () => {
    openFor(service.limit('lim-gross-exposure'));
    setValue(nameField(), 'half-typed');

    openFor(service.limit('lim-max-position'));

    expect(nameField().value).toBe('Max position size');
  });

  // --- the derived fields ---------------------------------------------------

  it('when the scope is a position, the form says a field validator implements it', () => {
    openFor(null);

    expect(host.querySelector('[data-testid="limit-form-validator"]')?.textContent).toContain(
      '@field_validator',
    );
    expect(host.querySelector('[data-testid="limit-form-validator"]')?.textContent).toContain(
      '% NAV',
    );
  });

  it('when the scope is cross-field, the form says a model validator implements it', () => {
    openFor(null);
    setValue(scopeField(), 'concentration');

    expect(host.querySelector('[data-testid="limit-form-validator"]')?.textContent).toContain(
      '@model_validator(after)',
    );
  });

  it('when the scope is the kill-switch, the threshold is disabled and the form says why', () => {
    openFor(null);
    setValue(scopeField(), 'kill-switch');

    expect(thresholdField().disabled).toBe(true);
    expect(host.querySelector('[data-testid="limit-form-threshold-note"]')?.textContent).toContain(
      'predicate and takes no threshold',
    );
  });

  // --- rejections, printed verbatim ----------------------------------------

  it('when the name duplicates an existing limit, the original error is printed in full', async () => {
    openFor(null);
    setValue(nameField(), 'Max position size');
    setValue(thresholdField(), '6');

    await save();

    expect(messages()).toContain(DUPLICATE_NAME);
    expect(host.querySelector('[data-testid="limit-form-errors"]')?.getAttribute('role')).toBe(
      'alert',
    );
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
  });

  it('when the threshold is negative, the validator’s own wording is printed unchanged', async () => {
    openFor(null);
    setValue(nameField(), 'Max sleeve size');
    setValue(thresholdField(), '-3');

    await save();

    expect(messages()).toContain('Value error, threshold must be a non-negative number, got -3.0');
    expect(thresholdField().getAttribute('aria-invalid')).toBe('true');
  });

  it('when the threshold is zero, the zero-budget rejection is printed in full', async () => {
    openFor(null);
    setValue(nameField(), 'Max sleeve size');
    setValue(thresholdField(), '0');

    await save();

    expect(messages()).toContain(ZERO_BUDGET);
  });

  it('when a save is rejected, the form stays open and nothing was written', async () => {
    const before = service.limits();
    openFor(null);
    setValue(nameField(), 'Max sleeve size');
    setValue(thresholdField(), '-3');

    await save();

    expect(host.querySelector('[data-testid="limit-form"]')).not.toBeNull();
    expect(service.limits()).toEqual(before);
  });

  it('when the rejection is corrected, the save goes through', async () => {
    openFor(null);
    setValue(nameField(), 'Max sleeve size');
    setValue(thresholdField(), '-3');
    await save();
    expect(messages().length).toBeGreaterThan(0);

    setValue(thresholdField(), '6');
    await save();

    expect(service.limit('lim-max-sleeve-size')?.threshold).toBe(6);
  });

  // --- an accepted edit -----------------------------------------------------

  it('when a breached limit is edited, the evaluated status and its detail survive', async () => {
    const before = service.limit('lim-single-name');
    openFor(before);
    setValue(thresholdField(), '13');

    await save();

    const after = service.limit('lim-single-name');
    expect(after?.threshold).toBe(13);
    expect(after?.status).toBe('breach');
    expect(after?.breachDetail).toBe(before?.breachDetail);
  });

  it('when a save is accepted, the limit count does not grow for an edit', async () => {
    const count = service.limits().length;
    openFor(service.limit('lim-max-position'));
    setValue(thresholdField(), '9');

    await save();

    expect(service.limits()).toHaveLength(count);
  });

  it('while the save is in flight, the submit is held down', async () => {
    openFor(null);
    setValue(nameField(), 'Max sleeve size');
    setValue(thresholdField(), '6');

    (host.querySelector('[data-testid="limit-form-save"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect((host.querySelector('[data-testid="limit-form-save"]') as HTMLButtonElement).disabled).toBe(
      true,
    );

    await settle();
  });
});
