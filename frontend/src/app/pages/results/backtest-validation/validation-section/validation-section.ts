import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import type { CriterionStatus } from '../../../../models/backtest-validation.model';

const TONE: Record<CriterionStatus, StatusTone> = {
  pass: 'ok',
  warn: 'warn',
  fail: 'alert',
  'not-set': 'pending',
  calculating: 'active',
  error: 'alert',
};

const LABEL: Record<CriterionStatus, string> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  'not-set': 'not set',
  calculating: 'calculating',
  error: 'error',
};

/**
 * The frame every section of `docs/09` sits in.
 *
 * Exists to keep three things uniform across seven sections: the `<h2>` (the
 * spec allows no skipped levels, and the summary card above is already an
 * `<h2>`), the id the in-page nav scrolls to, and the badge that repeats the
 * criterion's verdict beside its own evidence.
 */
@Component({
  selector: 'app-validation-section',
  imports: [SkeletonBlock, StatusBadge],
  templateUrl: './validation-section.html',
  // No `scroll-mt-*` here. It read as the jump allowance for a year and was
  // never applied to anything: the jump targets `#{sectionId}`, which is the
  // `<section>` inside this template, and a scroll margin only counts on the
  // element actually being scrolled to. The allowance is written on that
  // `<section>` by `backtest-validation`'s `goToSection`, from the pinned
  // summary's measured height — 312px at 1440, 493px at 768, where the class
  // said 128px at both.
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValidationSection {
  readonly sectionId = input.required<string>();
  readonly heading = input.required<string>();
  /** Omit for a section that carries no verdict of its own. */
  readonly status = input<CriterionStatus | null>(null);
  /** Replaces the body with a skeleton while a dependent input recalculates. */
  readonly recalculating = input(false);
  /**
   * Keeps the body mounted while recalculating, announcing it in a line above
   * instead of swapping in a skeleton.
   *
   * For sections holding a chart: unmounting one tears down its canvas and
   * remounts it at zero size, which ECharts cannot measure. Those sections show
   * the panel's own loading overlay instead.
   */
  readonly keepContent = input(false);

  protected tone(status: CriterionStatus): StatusTone {
    return TONE[status];
  }

  protected label(status: CriterionStatus): string {
    return LABEL[status];
  }
}
