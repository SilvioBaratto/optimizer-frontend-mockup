import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';

import {
  LIMIT_ENABLED_LABEL,
  LIMIT_SCOPE_LABEL,
  LIMIT_STATUS_LABEL,
  NO_LIMITS_DETAIL,
  NO_LIMITS_TITLE,
  VALIDATOR_KIND_LABEL,
  type HardLimit,
} from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { EntityCard } from '../../../../shared/entity-card/entity-card';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { SectionCardGrid } from '../../../../shared/section-card-grid/section-card-grid';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { thresholdText } from '../guardrail-format';
import { LimitForm, type LimitFormRequest } from '../limit-form/limit-form';
import { ReasonDialog } from '../reason-dialog/reason-dialog';

const DISABLE_KILL_LIMIT_MESSAGE =
  'Switching this off moves the deterministic pass/fail boundary: proposed orders will no longer ' +
  'be stopped by this condition before any model is called.';

const SKELETON_ROWS = [0, 1, 2, 3];

/**
 * Regions 4 and 5 — the configured hard limits, and the form that edits them.
 *
 * Three behaviours here are the spec's, not decoration:
 *
 * - **a BREACH stays.** The status is what the last run of the boundary found
 *   about the book, not about one order, so the card stays in the grid and
 *   stays highlighted after the trade that raised it has been approved,
 *   rejected or cleared;
 * - **a disabled limit stays too**, attenuated and labelled. Somebody decided
 *   to switch it off, and a row that vanishes hides that decision;
 * - **switching off a kill-switch-scope limit is held behind the same
 *   rationale as the global switch**, because it moves the same boundary. It
 *   is the only per-row action on the page that opens a dialog.
 *
 * "View log" is a filter, not a navigation: it narrows the audit trail below to
 * the rows that validator raised, and asks the page to move focus there — a
 * filter applied three regions away that nothing announces is a silent change.
 */
@Component({
  selector: 'app-hard-limits',
  imports: [
    ActionButtonRow,
    ButtonDirective,
    EmptyState,
    EntityCard,
    ErrorState,
    LimitForm,
    ReasonDialog,
    SectionCardGrid,
    SkeletonBlock,
    StatusBadge,
  ],
  templateUrl: './hard-limits.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HardLimits {
  private readonly service = inject(GuardrailService);

  /** "View log" filtered the trail — the page moves focus to it. */
  readonly logRequested = output<string>();

  protected readonly scopeLabel = LIMIT_SCOPE_LABEL;
  protected readonly statusLabel = LIMIT_STATUS_LABEL;
  protected readonly enabledLabel = LIMIT_ENABLED_LABEL;
  protected readonly validatorLabel = VALIDATOR_KIND_LABEL;
  protected readonly noLimitsTitle = NO_LIMITS_TITLE;
  protected readonly noLimitsDetail = NO_LIMITS_DETAIL;
  protected readonly disableMessage = DISABLE_KILL_LIMIT_MESSAGE;
  protected readonly skeletonRows = SKELETON_ROWS;

  protected readonly limits = this.service.limits;
  protected readonly empty = this.service.limitsEmpty;
  protected readonly error = this.service.limitsError;
  protected readonly actionError = this.service.limitActionError;

  protected readonly busy = computed(
    () => this.service.loading() || this.service.pendingRegion() === 'limits',
  );

  /** Null while closed; a fresh request object every time it opens. */
  protected readonly formRequest = signal<LimitFormRequest | null>(null);

  /** The kill-switch-scope limit waiting on a rationale before it is switched off. */
  protected readonly disableTarget = signal<HardLimit | null>(null);
  protected readonly disableReason = signal('');

  protected readonly disableTitle = computed(
    () => `Disable ${this.disableTarget()?.name ?? 'limit'}`,
  );

  /** What the last filter did, announced politely rather than silently applied. */
  protected readonly filterNotice = signal('');

  protected threshold(limit: HardLimit): string {
    return thresholdText(limit);
  }

  protected meta(limit: HardLimit): string {
    return `${this.scopeLabel[limit.scope]} · ${this.validatorLabel[limit.validator]}`;
  }

  /**
   * A breach is ringed; a disabled limit is desaturated rather than faded.
   *
   * `opacity` was the obvious way to attenuate a switched-off row and it is the
   * wrong one — it drags the secondary text under the contrast floor. Greyscale
   * drains the badge and the ring while every ratio survives, and the word
   * "Disabled" carries the state regardless.
   */
  protected cardClass(limit: HardLimit): string {
    const base = 'flex flex-col gap-2 rounded-lg border p-1';
    if (limit.status === 'breach') return `${base} border-danger bg-surface-inset`;
    if (!limit.enabled) return `${base} border-transparent grayscale`;
    return `${base} border-transparent`;
  }

  // --- add / edit -----------------------------------------------------------

  protected add(): void {
    this.service.clearLimitErrors();
    this.formRequest.set({ limit: null });
  }

  protected edit(limit: HardLimit): void {
    this.service.clearLimitErrors();
    this.formRequest.set({ limit });
  }

  protected closeForm(): void {
    this.formRequest.set(null);
    this.service.clearLimitErrors();
  }

  // --- enable / disable -----------------------------------------------------

  /**
   * Switching a limit on never asks; switching a kill-switch-scope limit off
   * always does. The service refuses a rationale-less disable anyway — this
   * only makes the refusal visible before it happens.
   */
  protected toggleEnabled(limit: HardLimit): void {
    const next = !limit.enabled;
    if (!next && limit.scope === 'kill-switch') {
      this.service.clearLimitErrors();
      this.disableReason.set('');
      this.disableTarget.set(limit);
      return;
    }
    this.service.setLimitEnabled(limit.id, next);
  }

  protected confirmDisable(reason: string): void {
    const target = this.disableTarget();
    if (target === null) return;
    this.disableReason.set(reason);
    if (this.service.setLimitEnabled(target.id, false, reason)) this.cancelDisable();
  }

  protected cancelDisable(): void {
    this.disableTarget.set(null);
    this.disableReason.set('');
    this.service.clearLimitErrors();
  }

  // --- the audit trail ------------------------------------------------------

  protected viewLog(limit: HardLimit): void {
    this.service.filterByValidator(limit.validatorName);
    this.filterNotice.set(`Audit trail filtered to ${limit.validatorName}`);
    this.logRequested.emit(limit.validatorName);
  }

  protected retry(): Promise<void> {
    return this.service.retryRegion('limits');
  }
}
