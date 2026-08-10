import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  PC1_SORTS,
  PC1_SORT_LABEL,
  TABLE_PREVIEW_ROWS,
  type Pc1Sort,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { loading, shareTenth } from '../turbulence-format';

/**
 * Region 14 — which assets the first component is made of.
 *
 * Two columns off one eigenvector: the loading `ω₁ᵢ`, which is signed, and
 * `ω₁ᵢ⁴/I₁`, the share of the inverse participation ratio that asset carries.
 * The second column sums to one by construction and is scale-invariant, so
 * normalising the eigenvector to unit length — which the participation ratio
 * above needs, or its scale would have no top — leaves it exactly where it was.
 *
 * Ranked by `|ω|` rather than by signed weight: a large negative loading is a
 * strong participation in the component pointing the other way, and a signed
 * order would file it below every near-zero weight in the book.
 *
 * The search narrows this table and nothing else — not the participation ratio,
 * not the spectrum, not the `I₁` the column is a share of. A decomposition of
 * the rows that happen to match a search term does not sum to anything.
 */
@Component({
  selector: 'app-turbulence-pc1-contribution-table',
  imports: [CoverageNote, FilterChipBar, PanelFallback, SelectDirective],
  templateUrl: './pc1-contribution-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pc1ContributionTable {
  private readonly service = inject(TurbulenceService);

  protected readonly sorts = PC1_SORTS;
  protected readonly sortLabel = PC1_SORT_LABEL;
  protected readonly previewRows = TABLE_PREVIEW_ROWS;

  protected readonly ready = computed(
    () => this.service.panelStatus()['pc1-contribution'] === 'ready',
  );
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly sort = this.service.pc1Sort;
  protected readonly filter = this.service.pc1Filter;
  protected readonly matches = this.service.visiblePc1Weights;
  protected readonly total = this.service.pc1Weights;

  protected readonly expanded = signal(false);

  protected readonly rows = computed(() =>
    this.expanded() ? this.matches() : this.matches().slice(0, TABLE_PREVIEW_ROWS),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.matches().length - TABLE_PREVIEW_ROWS),
  );

  protected readonly noMatches = computed(
    () => this.total().length > 0 && this.matches().length === 0,
  );

  /** "24 of 24" reads as a filter having been applied; a bare count does not. */
  protected readonly filteredTotal = computed(() =>
    this.filter().trim() ? this.total().length : null,
  );

  protected ariaSort(column: Pc1Sort): 'descending' | 'ascending' | 'none' {
    if (this.sort() !== column) return 'none';
    return column === 'asset' ? 'ascending' : 'descending';
  }

  protected sortGlyph(column: Pc1Sort): string {
    if (this.sort() !== column) return '↕';
    return column === 'asset' ? '▲' : '▼';
  }

  protected weight(value: number): string {
    return loading(value);
  }

  protected contribution(value: number): string {
    return shareTenth(value);
  }

  protected onSearch(value: string): void {
    this.service.pc1Filter.set(value);
    this.expanded.set(false);
  }

  protected onSortSelect(event: Event): void {
    this.service.setPc1Sort((event.target as HTMLSelectElement).value as Pc1Sort);
  }

  protected onSortColumn(column: Pc1Sort): void {
    this.service.setPc1Sort(column);
  }

  protected toggleExpanded(): void {
    this.expanded.update((value) => !value);
  }
}
