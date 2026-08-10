import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EMPTY_FORWARD_DETAIL,
  EMPTY_FORWARD_MESSAGE,
  SCENARIO_KIND_LABEL,
  STALE_RESULT_BADGE,
  STALE_RESULT_NOTE,
  type SeverityBar,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { kLabel, measureValue, signed } from '../stress-format';

/** Height of the figure, and of the placeholder that stands in for it. */
const CHART_HEIGHT = 240;

/**
 * Region 5 — the same portfolio under three scenarios, at one and the same k.
 *
 * The comparison only means anything because the plausibility is held fixed
 * across the bars: that is what makes "the systematic search finds a much worse
 * scenario than the one you picked by hand" an argument rather than an artefact
 * of comparing a 5σ event with a 3σ one. The subtitle names the radius for that
 * reason.
 *
 * Three things this figure refuses to do:
 *
 * - **Rescale a bar into the current unit.** Each bar carries the unit its
 *   result was computed in. They normally agree; after a measure change followed
 *   by one re-run they need not, and when they disagree the unit is written into
 *   the category label rather than averaged away in the axis name.
 * - **Carry staleness in a shade.** A stale bar is named in the footer under a
 *   `Result not up to date` badge, in words.
 * - **Hand-roll a second table.** `app-bar-chart` binds `[table]` into the chart
 *   panel, so the "View as table" alternative the spec demands is the panel's
 *   own and shows exactly the figures the bars do.
 */
@Component({
  selector: 'app-stress-severity-chart',
  imports: [BarChartComponent, EmptyState, SkeletonBlock, StatusBadge],
  templateUrl: './severity-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeverityChart {
  private readonly service = inject(StressTestingService);

  protected readonly height = CHART_HEIGHT;
  protected readonly emptyMessage = EMPTY_FORWARD_MESSAGE;
  protected readonly emptyDetail = EMPTY_FORWARD_DETAIL;
  protected readonly staleBadge = STALE_RESULT_BADGE;
  protected readonly staleNote = STALE_RESULT_NOTE;

  protected readonly bars = this.service.severityBars;

  /**
   * Only the worst-case search blanks this figure.
   *
   * `### Stati` assigns the skeleton on ChartPanel (Severity) to
   * RunWorstCaseSearchButton and SearchMinimalPlausibilityButton; a manual
   * evaluation places one on its own card and nowhere else. Blanking three
   * bars because one of them is being recomputed would also throw away the two
   * that are not moving.
   */
  protected readonly loading = computed(() => this.service.pendingAction() === 'worst-case');

  /** One bar is the expected scenario alone, which is not a comparison. */
  protected readonly hasComparison = computed(() => this.bars().length > 1);

  /** All bars in one unit, or empty when a measure change has split them. */
  private readonly commonUnit = computed(() => {
    const units = new Set(this.bars().map((bar) => bar.unit));
    return units.size === 1 ? [...units][0] : '';
  });

  /**
   * The radius every bar was computed at, or null once they have split.
   *
   * Read off the bars and never off the toolbar. A bar is a statement about the
   * radius it was searched at, and after `k` moves with the figures left
   * standing — which is the whole point of the stale rule — the toolbar's
   * radius is no longer the figure's. Captioning it with the new one would
   * print a reading nobody computed, exactly as relabelling the unit would.
   */
  private readonly commonK = computed(() => {
    const radii = new Set(this.bars().map((bar) => bar.k));
    return radii.size === 1 ? [...radii][0] : null;
  });

  protected readonly subtitle = computed(() => {
    const k = this.commonK();
    return k === null
      ? 'CEP at the radius each scenario was searched at — re-run to bring them back to one k'
      : `CEP at Maha ≤ k = ${kLabel(k)}, lower is more severe`;
  });

  protected readonly categories = computed(() => this.bars().map((bar) => this.categoryOf(bar)));

  protected readonly series = computed<readonly CategorySeries[]>(() => [
    { name: 'CEP', data: this.bars().map((bar) => bar.cep) },
  ]);

  /**
   * The unit rides on the value when every bar agrees on it.
   *
   * When they do not, it has already been written into the category label, and
   * repeating it here would print `+4.2% RWA` against a row labelled `% NAV`.
   */
  protected readonly valueFormatter = computed<ValueFormatter>(() => {
    const unit = this.commonUnit();
    return (value: number) => (unit === '' ? signed(value, 1) : measureValue(value, unit));
  });

  protected readonly staleBars = computed(() => this.bars().filter((bar) => bar.stale));

  protected readonly staleNames = computed(() =>
    this.staleBars()
      .map((bar) => SCENARIO_KIND_LABEL[bar.kind])
      .join(', '),
  );

  /** The bar the spec annotates: the worst case is the maximum loss in `Ell_k`. */
  protected readonly annotated = computed(() =>
    this.bars().find((bar) => bar.annotation !== null),
  );

  protected readonly ariaLabel = computed(() => {
    const bars = this.bars();
    if (bars.length === 0) return 'Severity comparison: nothing evaluated yet.';

    const shared = this.commonK();
    const readings = bars
      .map((bar) => {
        const reading = `${SCENARIO_KIND_LABEL[bar.kind]} ${measureValue(bar.cep, bar.unit)}`;
        // Once the radii have split, each reading has to name its own: a
        // single radius in the opening clause would be false for most of them.
        return shared === null ? `${reading} at k = ${kLabel(bar.k)}` : reading;
      })
      .join(', ');
    const opening =
      shared === null
        ? 'Conditional expected profit under each scenario, each at the radius it was searched at: '
        : `Conditional expected profit under each scenario at k = ${kLabel(shared)}: `;
    const worst = this.annotated();
    const maximum =
      worst === undefined
        ? ''
        : ` The worst case is the maximum loss admitted by Ell_k at the radius it was searched at.`;
    const stale =
      this.staleBars().length === 0
        ? ''
        : ` ${this.staleNames()} ${this.staleBars().length === 1 ? 'is' : 'are'} not up to date: a toolbar parameter moved after it was computed.`;

    return `${opening}${readings}.${maximum}${stale}`;
  });

  /**
   * `Worst case`, plus whatever the bars no longer agree on.
   *
   * The unit and the radius are properties of the bar, not of the toolbar, so
   * once they differ across bars each one carries its own rather than borrowing
   * the axis name or the subtitle.
   */
  private categoryOf(bar: SeverityBar): string {
    const qualifiers: string[] = [];
    if (this.commonUnit() === '') qualifiers.push(bar.unit);
    if (this.commonK() === null) qualifiers.push(`k = ${kLabel(bar.k)}`);
    const label = SCENARIO_KIND_LABEL[bar.kind];
    return qualifiers.length === 0 ? label : `${label} (${qualifiers.join(', ')})`;
  }
}
