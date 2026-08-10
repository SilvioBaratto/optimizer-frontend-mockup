import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  EMPTY_FORWARD_DETAIL,
  FACTOR_INTERACTION_ICON,
  FACTOR_INTERACTION_LABEL,
  FACTOR_INTERACTION_NOTE,
  KEY_FACTOR_SHARE,
  LOSS_CONTRIBUTION_NOTE,
  STALE_RESULT_BADGE,
  STALE_RESULT_NOTE,
  type LossContribution,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine, ValueFormatter } from '../../../../shared/charts';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { SlideOverComponent } from '../../../../shared/ui/slide-over/slide-over';
import { lossPoints, shareLabel, sharePoints, shockLabel } from '../stress-format';

const CHART_HEIGHT = 260;

/** What no worst-case search yet means for this figure specifically. */
export const NO_CONTRIBUTIONS_MESSAGE = 'No maximum-loss contributions yet.';

/** Word for the driver flag, so a key factor is never only a longer bar. */
export const DRIVER_LABEL = 'key risk factor';
export const NON_DRIVER_LABEL = 'minor';

/**
 * Region 6 — which factors carry the worst case's loss, and what the shortfall
 * in their sum means.
 *
 * `LC(i, r)` is the loss the book would take if **only** factor `i` moved to its
 * worst-case value, over the loss of the whole move. Those shares do not sum to
 * one and are not made to: the sum is exactly 100% only when the CEP is
 * additive in the factors, i.e. when every cross derivative vanishes, and the
 * gap is the interaction. Below 100% the joint move costs more than the
 * individual moves add up to — the dangerous case, because reading the factors
 * one at a time then understates the damage and adding market and credit
 * capital separately understates the true risk.
 *
 * So the sum and the **sign** of the interaction are printed as a sentence, and
 * the sentence names the direction in words. Bar lengths carry none of it: a
 * reader who cannot compare four horizontal lengths against an invisible 100%
 * total would otherwise lose the only finding on the figure.
 *
 * The `Details` link opens the per-factor arithmetic — the individual loss and
 * the share it produces — in a slide-over rather than a second table beside the
 * chart, which is what the spec asks for and what keeps the reader on the page.
 */
@Component({
  selector: 'app-stress-loss-contributions',
  imports: [BarChartComponent, EmptyState, SkeletonBlock, SlideOverComponent, StatusBadge],
  templateUrl: './loss-contributions.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LossContributions {
  private readonly service = inject(StressTestingService);

  protected readonly height = CHART_HEIGHT;
  protected readonly emptyMessage = NO_CONTRIBUTIONS_MESSAGE;
  protected readonly emptyDetail = EMPTY_FORWARD_DETAIL;
  protected readonly staleBadge = STALE_RESULT_BADGE;
  protected readonly staleNote = STALE_RESULT_NOTE;
  protected readonly contributionNote = LOSS_CONTRIBUTION_NOTE;
  protected readonly driverLabel = DRIVER_LABEL;
  protected readonly nonDriverLabel = NON_DRIVER_LABEL;
  protected readonly keyFactorThreshold = shareLabel(KEY_FACTOR_SHARE);

  protected readonly contributions = this.service.maximumLossContributions;
  protected readonly worstCase = this.service.worstCaseResult;

  protected readonly loading = computed(() => this.service.pendingAction() === 'worst-case');

  protected readonly hasContributions = computed(() => this.contributions().length > 0);

  protected readonly stale = computed(() => this.worstCase()?.stale ?? false);

  protected readonly detailOpen = signal(false);

  protected readonly categories = computed(() =>
    this.contributions().map((row) => row.name),
  );

  protected readonly series = computed<readonly CategorySeries[]>(() => [
    { name: 'MLC', data: this.contributions().map((row) => sharePoints(row.share)) },
  ]);

  protected readonly valueFormatter = computed<ValueFormatter>(
    () => (value: number) => `${value.toFixed(1)}%`,
  );

  /** The share above which a factor is a key risk factor, drawn once, in words. */
  protected readonly refLines = computed<readonly RefLine[]>(() => [
    {
      value: sharePoints(KEY_FACTOR_SHARE),
      label: `key risk factor ≥ ${this.keyFactorThreshold}`,
      axis: 'x',
      dashed: true,
    },
  ]);

  protected readonly sum = this.service.contributionSum;
  protected readonly residual = this.service.contributionResidual;
  protected readonly interaction = this.service.contributionInteraction;

  protected readonly sumLabel = computed(() => shareLabel(this.sum()));

  /** `< 100%`, `> 100%` or `= 100%` — the comparison the sentence turns on. */
  protected readonly comparison = computed(() => {
    const interaction = this.interaction();
    if (interaction === 'negative') return '< 100%';
    if (interaction === 'positive') return '> 100%';
    return '= 100%';
  });

  protected readonly interactionLabel = computed(
    () => FACTOR_INTERACTION_LABEL[this.interaction()],
  );

  protected readonly interactionIcon = computed(() => FACTOR_INTERACTION_ICON[this.interaction()]);

  protected readonly interactionNote = computed(() => FACTOR_INTERACTION_NOTE[this.interaction()]);

  /** The whole finding as one sentence, exactly as the wireframe prints it. */
  protected readonly interactionSentence = computed(
    () =>
      `Sum MLC ${this.sumLabel()} (${this.comparison()}) — ${this.interactionLabel()} between factors`,
  );

  protected readonly drivers = computed(() => this.contributions().filter((row) => row.driver));

  protected readonly ariaLabel = computed(() => {
    const rows = this.contributions();
    if (rows.length === 0) return 'Maximum loss contributions: no worst-case search has been run.';

    const readings = rows.map((row) => `${row.name} ${shareLabel(row.share)}`).join(', ');
    const drivers = this.drivers().map((row) => row.name);
    const named =
      drivers.length === 0
        ? ''
        : ` The key risk ${drivers.length === 1 ? 'factor is' : 'factors are'} ${drivers.join(' and ')}.`;

    return (
      `Maximum loss contribution per factor in the worst-case scenario, largest first: ${readings}. ` +
      `${this.interactionSentence()}.${named}`
    );
  });

  protected share(value: number): string {
    return shareLabel(value);
  }

  protected loss(value: number): string {
    return lossPoints(-value);
  }

  protected move(row: LossContribution): string {
    return shockLabel(row.value, row.unit);
  }

  protected openDetail(): void {
    this.detailOpen.set(true);
  }

  protected closeDetail(): void {
    this.detailOpen.set(false);
  }
}
