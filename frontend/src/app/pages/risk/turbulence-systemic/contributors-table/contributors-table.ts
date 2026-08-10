import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  CONTRIBUTOR_SORTS,
  CONTRIBUTOR_SORT_LABEL,
  PARTIAL_COVERAGE_ICON,
  TABLE_PREVIEW_ROWS,
  type ContributorSort,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { fixed, shareTenth } from '../turbulence-format';

/**
 * Region 8 — which assets the current `d_t` is made of.
 *
 * Two columns and a rank. The `z` column is the standardised return over the
 * correlation window, and the contribution column is that asset's share of the
 * current score: it is normalised over the active universe, so it sums to
 * exactly one whatever universe is on screen rather than because the seeds
 * happened to add up.
 *
 * Ordering is by `|z|` by default, not by signed `z`: the sign is a direction,
 * not a size, and a signed descending order would bury the largest negative
 * move at the bottom — which is exactly the row a reader of a turbulence page
 * is looking for.
 *
 * Sorting is offered twice on purpose, and both write the same service signal
 * so they cannot disagree: the wireframe's `Sort [ … ▾ ]` control, which is the
 * one a touch reader reaches for, and the column headers, which is where
 * everyone else looks. `aria-sort` lives on the `<th>` so the state is
 * announced rather than left to a glyph.
 *
 * The preview shows five rows with the rest a click away, per the wireframe's
 * "… 19 more assets".
 */
@Component({
  selector: 'app-turbulence-contributors-table',
  imports: [CoverageNote, PanelFallback, SelectDirective],
  templateUrl: './contributors-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorsTable {
  private readonly service = inject(TurbulenceService);

  protected readonly sorts = CONTRIBUTOR_SORTS;
  protected readonly sortLabel = CONTRIBUTOR_SORT_LABEL;
  protected readonly coverageIcon = PARTIAL_COVERAGE_ICON;
  protected readonly previewRows = TABLE_PREVIEW_ROWS;

  protected readonly ready = computed(() => this.service.panelStatus().contributors === 'ready');
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly sort = this.service.contributorSort;
  protected readonly all = this.service.contributors;
  protected readonly reading = this.service.reading;

  protected readonly expanded = signal(false);

  protected readonly rows = computed(() =>
    this.expanded() ? this.all() : this.all().slice(0, TABLE_PREVIEW_ROWS),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.all().length - TABLE_PREVIEW_ROWS),
  );

  /** Only the active column carries a direction; the rest say `none`. */
  protected ariaSort(column: ContributorSort): 'descending' | 'ascending' | 'none' {
    if (this.sort() !== column) return 'none';
    // Both numeric columns rank largest first; the asset column is A→Z.
    return column === 'asset' ? 'ascending' : 'descending';
  }

  /** Decorative — `aria-sort` on the header already carries the state. */
  protected sortGlyph(column: ContributorSort): string {
    if (this.sort() !== column) return '↕';
    return column === 'asset' ? '▲' : '▼';
  }

  protected zScore(value: number): string {
    return fixed(value, 2);
  }

  protected contribution(value: number): string {
    return shareTenth(value);
  }

  protected onSortSelect(event: Event): void {
    this.service.setContributorSort((event.target as HTMLSelectElement).value as ContributorSort);
  }

  protected onSortColumn(column: ContributorSort): void {
    this.service.setContributorSort(column);
  }

  protected toggleExpanded(): void {
    this.expanded.update((value) => !value);
  }
}
