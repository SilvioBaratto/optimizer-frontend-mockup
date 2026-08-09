import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';

import {
  ATTRIBUTION_GROUPING_COLUMN,
  ATTRIBUTION_GROUPING_NOUN,
  ATTRIBUTION_GROUPING_WEIGHT_COLUMN,
  ATTRIBUTION_METHOD_COLUMN,
  ATTRIBUTION_METHOD_LABEL,
  HEDGE_ICON,
  HEDGE_LABEL,
  HEDGE_NOTE,
  MARGINAL_DI_UNDEFINED_NOTE,
  RORAC_UNDEFINED_NOTE,
  type AttributionMethod,
  type ComponentContribution,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { PaginationComponent } from '../../../../shared/ui/pagination/pagination';
import {
  NOT_APPLICABLE,
  optionalShare,
  ratio,
  riskAmount,
  share,
} from '../attribution-format';

/** Every column the table can be ordered by. */
export type ContributionSortKey =
  | 'name'
  | 'weight'
  | 'standAlone'
  | 'marginal'
  | 'euler'
  | 'contributionShare'
  | 'rorac'
  | 'marginalDi';

const PAGE_SIZES: readonly number[] = [10, 25, 50];

/** Shared by both contribution cells, so the two columns cannot drift apart. */
const CONTRIBUTION_CELL = 'px-2 py-1.5 text-right tabular-nums';

/**
 * How a contribution cell is painted.
 *
 * The active method owns one of the two columns — the spec's "colonna
 * principale" — and it says so with weight, not with a hue: the secondary
 * column drops to the muted text token while the principal one keeps full
 * contrast and a medium weight. A negative figure is a hedge and stays in the
 * danger colour, but the minus sign, the `▼` glyph and the word `hedge` in the
 * same row all carry that reading without it.
 */
function contributionCellClass(value: number, principal: boolean): string {
  if (value < 0) return principal ? `${CONTRIBUTION_CELL} font-medium text-danger` : `${CONTRIBUTION_CELL} text-danger`;
  return principal
    ? `${CONTRIBUTION_CELL} font-medium text-text`
    : `${CONTRIBUTION_CELL} text-text-secondary`;
}

/** Placeholder rows while a recompute runs — the height of a full page. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/** True where the column has no value for this row — RORAC and marginal DI. */
function undefinedFor(row: ComponentContribution, key: ContributionSortKey): boolean {
  return key !== 'name' && row[key] === null;
}

/** Compares two rows that both *have* a value in the column. */
function compare(
  a: ComponentContribution,
  b: ComponentContribution,
  key: ContributionSortKey,
): number {
  if (key === 'name') return a.name.localeCompare(b.name);
  return (a[key] ?? 0) - (b[key] ?? 0);
}

/**
 * Region 3 — the decomposition itself, one row per component.
 *
 * Hand-rolled per the build conventions, following the sortable-header idiom
 * `pages/fund/execution-agent/orders-table` established: `aria-sort` lives on
 * the `<th>` and the control inside it is a real `<button>`, so the sort state
 * is announced rather than left to a glyph.
 *
 * Both contribution columns are on screen at once, which is the region's
 * content list and not a convenience: the page's whole argument is that
 * `ρ_marg(X_i|X) ≤ ρ_Euler(X_i|X)` and that the with-without column therefore
 * sums to strictly less than EC. A table that showed one of them at a time
 * would make the reader change a toolbar control and remember a number to see
 * the inequality the page exists to demonstrate, and the TOTAL row would never
 * carry `Σ stand-alone`, `Σ marginal` and `EC` together. The method control
 * still owns which of the two is *principal* — that column keeps full contrast,
 * drives the `%` column, the RORAC denominator and the coverage badge.
 *
 * Three rules the table is not free to soften:
 *
 * - the TOTAL row is a `<tfoot>` and is rendered on every page. It is the only
 *   place these sums are taken, and the KeyMetricsRow and the chart's two
 *   reference numbers read the same object — paginating away from it would
 *   hide the row every other panel is quoting;
 * - a negative contribution is a hedge and is marked with `▼` **and** the word,
 *   because a red number is not a label;
 * - RORAC on a zero or negative contribution prints `—` with the reason
 *   attached, never a figure. `μ_i / ρ(X_i|X)` is not a return on capital when
 *   no capital is consumed.
 *
 * Rows carry a roving tabindex: one tab stop for the whole body, arrows between
 * rows, Enter or Space to open the detail panel — a `<button>` gives the last
 * of those for free.
 */
@Component({
  selector: 'app-contribution-table',
  imports: [FilterChipBar, PaginationComponent, SelectDirective, SkeletonBlock],
  templateUrl: './contribution-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributionTable {
  private readonly service = inject(RiskAttributionService);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly hedgeIcon = HEDGE_ICON;
  protected readonly hedgeLabel = HEDGE_LABEL;
  protected readonly hedgeNote = HEDGE_NOTE;
  protected readonly roracUndefinedNote = RORAC_UNDEFINED_NOTE;
  protected readonly marginalDiUndefinedNote = MARGINAL_DI_UNDEFINED_NOTE;
  protected readonly notApplicable = NOT_APPLICABLE;

  protected readonly loading = this.service.loading;
  protected readonly rows = this.service.rows;
  protected readonly visibleRows = this.service.visibleRows;
  protected readonly totals = this.service.totals;
  protected readonly search = this.service.search;
  protected readonly selectedComponentId = this.service.selectedComponentId;
  protected readonly highlightedComponentId = this.service.highlightedComponentId;
  protected readonly parameterSummary = this.service.parameterSummary;

  // --- headers --------------------------------------------------------------

  protected readonly componentColumn = computed(
    () => ATTRIBUTION_GROUPING_COLUMN[this.service.grouping()],
  );
  protected readonly weightColumn = computed(
    () => ATTRIBUTION_GROUPING_WEIGHT_COLUMN[this.service.grouping()],
  );
  protected readonly groupingNoun = computed(
    () => ATTRIBUTION_GROUPING_NOUN[this.service.grouping()],
  );

  /** One header per allocation principle — both columns are always on screen. */
  protected readonly methodColumn = ATTRIBUTION_METHOD_COLUMN;

  /** Which of the two contribution columns the toolbar's method makes principal. */
  protected readonly method = this.service.method;

  protected readonly methodLabel = computed(() => ATTRIBUTION_METHOD_LABEL[this.method()]);

  protected readonly shareColumn = computed(() => `${this.methodLabel()} %`);

  protected isPrincipal(column: AttributionMethod): boolean {
    return this.method() === column;
  }

  /** Weight, not hue: the principal column keeps full contrast, the other does not. */
  protected contributionClass(value: number, column: AttributionMethod): string {
    return contributionCellClass(value, this.isPrincipal(column));
  }

  /** The `%` column belongs to the active method, so it is always the principal one. */
  protected shareClass(value: number): string {
    return contributionCellClass(value, true);
  }

  /** "26 of 26" reads as a filter having been applied; a plain count does not. */
  protected readonly filteredTotal = computed(() =>
    this.search().trim() ? this.rows().length : null,
  );

  protected readonly noMatches = computed(
    () => !this.loading() && this.rows().length > 0 && this.visibleRows().length === 0,
  );

  // --- sorting --------------------------------------------------------------

  private readonly _sortKey = signal<ContributionSortKey | null>(null);
  private readonly _ascending = signal(true);

  protected readonly sortKey = this._sortKey.asReadonly();
  protected readonly ascending = this._ascending.asReadonly();

  protected readonly sortedRows = computed<readonly ComponentContribution[]>(() => {
    const key = this._sortKey();
    const rows = this.visibleRows();
    if (key === null) return rows;
    const direction = this._ascending() ? 1 : -1;
    return [...rows].sort((a, b) => {
      // `—` is not a small number, so it sinks to the bottom whichever way the
      // column is pointing rather than heading the descending order.
      const left = undefinedFor(a, key);
      const right = undefinedFor(b, key);
      if (left !== right) return left ? 1 : -1;
      return compare(a, b, key) * direction;
    });
  });

  /** Only the active column carries a direction; the rest say `none`. */
  protected ariaSort(key: ContributionSortKey): 'ascending' | 'descending' | 'none' {
    if (this._sortKey() !== key) return 'none';
    return this._ascending() ? 'ascending' : 'descending';
  }

  /** Decorative — `aria-sort` on the header already carries the state. */
  protected sortGlyph(key: ContributionSortKey): string {
    if (this._sortKey() !== key) return '↕';
    return this._ascending() ? '▲' : '▼';
  }

  protected toggleSort(key: ContributionSortKey): void {
    if (this._sortKey() === key) {
      this._ascending.update((value) => !value);
      return;
    }
    this._sortKey.set(key);
    this._ascending.set(true);
  }

  // --- pagination -----------------------------------------------------------

  private readonly _page = signal(1);
  protected readonly pageSize = signal(25);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedRows().length / this.pageSize())),
  );

  /**
   * Clamped rather than reset in an effect: narrowing the search from three
   * pages to one must not leave the table on a page that no longer exists, and
   * a `computed` cannot fall out of step with the list the way a stored page
   * number can.
   */
  protected readonly page = computed(() => Math.min(this._page(), this.totalPages()));

  protected readonly pageRows = computed<readonly ComponentContribution[]>(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.sortedRows().slice(start, start + this.pageSize());
  });

  protected onPage(page: number): void {
    this._page.set(page);
    this._activeRowId.set(null);
  }

  protected onPageSize(event: Event): void {
    this.pageSize.set(Number((event.target as HTMLSelectElement).value));
    this._page.set(1);
    this._activeRowId.set(null);
  }

  // --- rows -----------------------------------------------------------------

  protected weight(row: ComponentContribution): string {
    return share(row.weight);
  }

  /** Stand-alone and contribution follow the toolbar's `$ / %` switch. */
  protected amount(value: number): string {
    return riskAmount(value, this.service.displayUnit(), this.service.netAssetValue());
  }

  protected shareOf(value: number): string {
    return share(value);
  }

  protected rorac(value: number | null): string {
    return optionalShare(value);
  }

  protected marginalDi(value: number | null): string {
    return ratio(value);
  }

  protected toggleRow(row: ComponentContribution): void {
    this.service.selectComponent(this.selectedComponentId() === row.id ? null : row.id);
  }

  /**
   * Hover and keyboard focus both write the transient highlight the chart reads,
   * which is the spec's "hover/click sincronizzati" between the two views. Focus
   * is wired alongside the pointer on purpose: a link that only exists under a
   * mouse is a link half the readers of this page never get.
   */
  protected highlight(id: string | null): void {
    this.service.highlightComponent(id);
  }

  // --- roving tabindex ------------------------------------------------------

  private readonly _activeRowId = signal<string | null>(null);
  private readonly rowButtons = viewChildren<ElementRef<HTMLButtonElement>>('rowButton');

  /**
   * The one row in the page's tab order.
   *
   * The selection takes it when it is on this page, so tabbing back into the
   * table after closing the detail panel lands on the row that opened it rather
   * than at the top.
   */
  protected readonly activeRowId = computed<string | null>(() => {
    const rows = this.pageRows();
    if (rows.length === 0) return null;
    const wanted = this._activeRowId() ?? this.service.selectedComponentId();
    return rows.some((row) => row.id === wanted) ? wanted : rows[0].id;
  });

  protected onRowKeydown(event: KeyboardEvent, index: number): void {
    // A modified arrow belongs to the browser, not to this table.
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const rows = this.pageRows();
    let target: number | null = null;
    if (event.key === 'ArrowDown') target = Math.min(index + 1, rows.length - 1);
    else if (event.key === 'ArrowUp') target = Math.max(index - 1, 0);
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = rows.length - 1;

    if (target === null) return;
    event.preventDefault();
    this._activeRowId.set(rows[target].id);
    this.rowButtons()[target]?.nativeElement.focus();
  }
}
