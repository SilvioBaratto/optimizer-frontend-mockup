import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import {
  LIMIT_SCOPES,
  LIMIT_SCOPE_LABEL,
  LIMIT_UNIT_LABEL,
  VALIDATOR_KIND_LABEL,
  type HardLimit,
  type LimitDraft,
  type LimitScope,
  type LimitUnit,
  type ValidatorKind,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { FocusTrapDirective } from '../../../../shared/ui/focus-trap/focus-trap.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/** Per-instance ids, so the labels bind to this form's fields and no other's. */
let nextId = 0;

/**
 * One request to open the form.
 *
 * A fresh object every time, deliberately: the field values are `linkedSignal`s
 * derived from it, so a new identity is what resets a half-typed draft when the
 * form is reopened. `limit: null` is Add; a limit is Edit.
 */
export interface LimitFormRequest {
  readonly limit: HardLimit | null;
}

/** `''` is "no threshold", not zero. `'abc'` is `NaN`, which the boundary refuses. */
function parseThreshold(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : Number(trimmed);
}

/**
 * The Add / Edit limit form — the same pass/fail boundary, in a modal.
 *
 * The spec is unusually specific about two things and both are implemented
 * literally:
 *
 * - **the save goes through the same Pydantic validators as the pre-check**,
 *   and a rejection prints the original error *in full*. Nothing here
 *   paraphrases `limit_name_not_unique: …` into "that name is taken": a
 *   screen and a backend log that disagree about why a limit was refused is
 *   the one divergence an audit trail cannot survive;
 * - the unit is **not** a field. `### Campi e controlli` says it "segue la
 *   definizione del limite selezionato", so it is derived from the scope, as
 *   is the validator decorator — which is informative anyway and introduces no
 *   second rules engine. A kill-switch-scope limit is a predicate, so its
 *   threshold field is disabled rather than merely ignored.
 *
 * A rejection changes nothing: the form stays open over an unchanged grid.
 */
@Component({
  selector: 'app-limit-form',
  imports: [ButtonDirective, FocusTrapDirective, SelectDirective],
  templateUrl: './limit-form.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitForm {
  private readonly service = inject(GuardrailService);

  readonly request = input<LimitFormRequest | null>(null);
  readonly saved = output<HardLimit>();
  readonly cancelled = output<void>();

  protected readonly scopes = LIMIT_SCOPES;
  protected readonly scopeLabel = LIMIT_SCOPE_LABEL;
  protected readonly unitLabel = LIMIT_UNIT_LABEL;
  protected readonly validatorLabel = VALIDATOR_KIND_LABEL;

  protected readonly open = computed(() => this.request() !== null);
  protected readonly editing = computed(() => this.request()?.limit ?? null);
  protected readonly saving = this.service.savingLimit;
  protected readonly errors = this.service.limitErrors;

  private readonly uid = `limit-form-${nextId++}`;
  protected readonly titleId = `${this.uid}-title`;
  protected readonly nameId = `${this.uid}-name`;
  protected readonly scopeId = `${this.uid}-scope`;
  protected readonly thresholdId = `${this.uid}-threshold`;
  protected readonly enabledId = `${this.uid}-enabled`;
  protected readonly errorsId = `${this.uid}-errors`;

  // --- the draft ------------------------------------------------------------

  protected readonly name = linkedSignal(() => this.request()?.limit?.name ?? '');
  protected readonly scope = linkedSignal<LimitScope>(
    () => this.request()?.limit?.scope ?? 'position',
  );
  protected readonly threshold = linkedSignal(() => {
    const value = this.request()?.limit?.threshold;
    return value === undefined || value === null ? '' : String(value);
  });
  protected readonly enabled = linkedSignal(() => this.request()?.limit?.enabled ?? true);

  /** The kill-switch condition is a predicate; everything else is a % of NAV. */
  protected readonly unit = computed<LimitUnit>(() =>
    this.scope() === 'kill-switch' ? 'none' : 'pct-nav',
  );

  /** Single field ⟹ `@field_validator`; anything cross-field ⟹ the model one. */
  protected readonly validator = computed<ValidatorKind>(() =>
    this.scope() === 'position' ? 'field_validator' : 'model_validator_after',
  );

  protected readonly thresholdEnabled = computed(() => this.scope() !== 'kill-switch');

  protected readonly draft = computed<LimitDraft>(() => ({
    id: this.editing()?.id ?? null,
    name: this.name(),
    scope: this.scope(),
    validator: this.validator(),
    threshold: this.thresholdEnabled() ? parseThreshold(this.threshold()) : null,
    unit: this.unit(),
    enabled: this.enabled(),
  }));

  protected readonly title = computed(() =>
    this.editing() === null ? 'Add limit' : `Edit ${this.editing()?.name}`,
  );

  /** Which fields the rejection is attached to, for `aria-invalid`. */
  protected readonly invalidFields = computed(
    () => new Set(this.errors().map((e) => e.field).filter((f): f is string => f !== null)),
  );

  // --- events ---------------------------------------------------------------

  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onScope(event: Event): void {
    this.scope.set((event.target as HTMLSelectElement).value as LimitScope);
  }

  protected onThreshold(event: Event): void {
    this.threshold.set((event.target as HTMLInputElement).value);
  }

  protected onEnabled(event: Event): void {
    this.enabled.set((event.target as HTMLInputElement).checked);
  }

  /** The form element's own submit, so Enter in a field saves too. */
  protected submit(event: Event): Promise<void> {
    event.preventDefault();
    return this.save();
  }

  /**
   * Saves through the boundary. A rejection leaves the form open with the
   * validators' own words in it, and leaves the grid behind it untouched.
   */
  protected async save(): Promise<void> {
    const result = await this.service.saveLimit(this.draft());
    if (result.ok && result.limit) this.saved.emit(result.limit);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
