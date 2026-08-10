import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChildren,
} from '@angular/core';

import {
  CATEGORY_LAST_ONE_NOTE,
  EMPTY_UNIVERSE_DETAIL,
  EMPTY_UNIVERSE_TITLE,
  EMPTY_WINDOW_DETAIL,
  EMPTY_WINDOW_TITLE,
  FAILED_FEED_NOTE,
  FEED_HEALTH_LABEL,
  FEED_HEALTH_TONE,
  INCLUDE_LABEL,
  ML_CATEGORY_EMPTY_DETAIL,
  ML_CATEGORY_EMPTY_TITLE,
  NEWS_AGGREGATION_LABEL,
  NO_MATCH_DETAIL,
  NO_MATCH_TITLE,
  PARTIAL_COVERAGE_BADGE,
  SELECTION_HINT,
  SIGNAL_CATEGORIES,
  SIGNAL_CATEGORY_LABEL,
  TEMPORAL_CLASSES,
  TEMPORAL_LABEL,
  TEMPORAL_TONE,
  TONE_DICTIONARY_SHORT,
  TONE_WEIGHTING_LABEL,
  type AltSignal,
  type AltSignalId,
  type SignalCategory,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { percent0 } from '../alt-data-format';

/** The keys the listbox owns. Everything else is left to the browser. */
const NAV_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

/**
 * Regions 5 to 8 — the filter bar, the badge legend and the grid of signals.
 *
 * **Driving the detail panel and being included are two different things, and
 * this component is where the difference is enforced.** The grid is a
 * single-select listbox: `aria-selected` marks the one card whose evidence the
 * detail panel is showing, and Enter (or a click) is what moves it.
 * `aria-checked` marks the cards that will be handed to Views Builder, and
 * Space is what toggles it — without touching the selection. Arrow keys move
 * focus and nothing else, because selection here has a consequence (the whole
 * detail panel changes) and selection-follows-focus would fire it on every
 * keystroke.
 *
 * A card whose feed has failed is a card like any other: it keeps its place, it
 * keeps its keyboard behaviour, and it carries an error badge with the
 * timestamp of the last good extract. Removing it would be the page deciding
 * that partial data is no data.
 *
 * The children of a `role="option"` are presentational, so nothing inside a
 * card is announced on its own. Every card therefore carries a composed
 * `aria-label` with its category, coverage, freshness and classification — the
 * same facts the badges show, in the same order.
 */
@Component({
  selector: 'app-alt-data-signal-library',
  imports: [ButtonDirective, EmptyState, FilterChipBar, StatusBadge],
  templateUrl: './signal-library.html',
  host: { class: 'flex flex-col gap-4' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataSignalLibrary {
  private readonly service = inject(AltDataSentimentService);

  private readonly options = viewChildren<ElementRef<HTMLElement>>('option');

  /** Raised when Enter moved the selection, so the page can move focus with it. */
  readonly activated = output<AltSignalId>();

  protected readonly categories = SIGNAL_CATEGORIES;
  protected readonly categoryLabel = SIGNAL_CATEGORY_LABEL;
  protected readonly temporalClasses = TEMPORAL_CLASSES;
  protected readonly temporalLabel = TEMPORAL_LABEL;
  protected readonly temporalTone = TEMPORAL_TONE;
  protected readonly feedLabel = FEED_HEALTH_LABEL;
  protected readonly feedTone = FEED_HEALTH_TONE;
  protected readonly partialBadge = PARTIAL_COVERAGE_BADGE;
  protected readonly failedFeedNote = FAILED_FEED_NOTE;
  protected readonly includeLabel = INCLUDE_LABEL;
  protected readonly selectionHint = SELECTION_HINT;
  protected readonly noMatchTitle = NO_MATCH_TITLE;
  protected readonly noMatchDetail = NO_MATCH_DETAIL;
  protected readonly mlEmptyTitle = ML_CATEGORY_EMPTY_TITLE;
  protected readonly mlEmptyDetail = ML_CATEGORY_EMPTY_DETAIL;
  protected readonly emptyUniverseTitle = EMPTY_UNIVERSE_TITLE;
  protected readonly emptyUniverseDetail = EMPTY_UNIVERSE_DETAIL;
  protected readonly emptyWindowTitle = EMPTY_WINDOW_TITLE;
  protected readonly emptyWindowDetail = EMPTY_WINDOW_DETAIL;
  protected readonly categoryRuleNote = CATEGORY_LAST_ONE_NOTE;

  protected readonly rows = this.service.visibleSignals;
  protected readonly total = this.service.totalCount;
  protected readonly query = this.service.query;
  protected readonly detailId = this.service.detailSignalId;
  protected readonly onlyMl = this.service.onlyMlCategory;
  protected readonly universeHasNoCoverage = this.service.universeHasNoCoverage;
  protected readonly toneDictionary = this.service.toneDictionary;
  protected readonly toneWeighting = this.service.toneWeighting;
  protected readonly newsAggregation = this.service.newsAggregation;

  /** Nothing available at all, as against nothing matching the filters. */
  protected readonly libraryEmpty = computed(() => this.total() === 0);

  /** True while one chip is carrying the whole filter and cannot be turned off. */
  protected readonly lastCategoryLeft = computed(
    () => this.service.activeCategories().length === 1,
  );

  /** The universe the "no coverage here" empty state offers instead. */
  protected readonly coveredUniverse = computed(
    () => this.service.universes.find((option) => option.altDataCoverage) ?? null,
  );

  protected readonly coveredUniverseName = computed(() => this.coveredUniverse()?.name ?? '');

  /**
   * Which card Tab lands on.
   *
   * Null until an arrow key moves it, so the tab stop starts on the card that
   * is driving the detail panel — the one the reader is already looking at the
   * evidence for. Clamped to the list, because filtering can shorten it under
   * a focus index that was valid a keystroke ago.
   */
  private readonly focusRequest = signal<number | null>(null);

  protected readonly focusIndex = computed(() => {
    const rows = this.rows();
    if (rows.length === 0) return -1;
    const requested = this.focusRequest();
    if (requested !== null) return Math.min(requested, rows.length - 1);
    const selected = rows.findIndex((row) => row.id === this.detailId());
    return selected >= 0 ? selected : 0;
  });

  protected isSelected(row: AltSignal): boolean {
    return row.id === this.detailId();
  }

  protected isIncluded(row: AltSignal): boolean {
    return this.service.isIncluded(row.id);
  }

  protected isCategoryActive(category: SignalCategory): boolean {
    return this.service.isCategoryActive(category);
  }

  protected isLastCategory(category: SignalCategory): boolean {
    return this.service.isLastCategory(category);
  }

  /** The empty states' ways out, which is what makes them states and not walls. */
  protected clearFilters(): void {
    this.service.resetFilters();
    this.focusRequest.set(null);
  }

  protected widenWindow(): void {
    this.service.widenCoverageWindow();
  }

  protected useCoveredUniverse(): void {
    const universe = this.coveredUniverse();
    if (universe !== null) this.service.setUniverse(universe.id);
  }

  protected coverageText(row: AltSignal): string {
    return percent0(row.coverage);
  }

  protected updatedDate(row: AltSignal): string {
    return row.updatedAt.slice(0, 10);
  }

  /** `Feed error — last good 2026-07-29 18:00 UTC`, timestamp included. */
  protected feedBadgeLabel(row: AltSignal): string {
    if (row.feed === 'failed' && row.lastGoodAt !== null) {
      return `${this.feedLabel.failed} — last good ${row.lastGoodAt}`;
    }
    if (row.feed === 'stale') {
      return `${this.feedLabel.stale} — expected ${row.cadence}`;
    }
    return this.feedLabel.live;
  }

  protected feedBadgeTone(row: AltSignal): StatusTone {
    return this.feedTone[row.feed];
  }

  /**
   * The method currently chosen on a card, as read-only text.
   *
   * The controls themselves are not here: a `role="option"`'s children are
   * presentational, so a radio group inside one would be invisible to assistive
   * tech. They live on the expanded card below the grid, which is where the
   * wireframe draws them, and this line keeps the grid honest about what the
   * evidence is currently being read under.
   */
  protected methodSummary(row: AltSignal): string | null {
    if (row.method === 'tone') {
      return `${TONE_DICTIONARY_SHORT[this.toneDictionary()]} · ${TONE_WEIGHTING_LABEL[
        this.toneWeighting()
      ].toLowerCase()}`;
    }
    if (row.method === 'aggregation') {
      return `${NEWS_AGGREGATION_LABEL[this.newsAggregation()]} aggregation`;
    }
    return null;
  }

  /**
   * Everything a card shows, composed for assistive tech.
   *
   * A `role="option"`'s children are presentational, so the badges inside are
   * not announced. Inclusion is deliberately absent: `aria-checked` already
   * carries it, and repeating it here would have it read twice.
   */
  protected optionLabel(row: AltSignal): string {
    const parts = [
      row.name,
      row.categoryLabel,
      `coverage ${this.coverageText(row)}${row.partialCoverage ? `, ${this.partialBadge}` : ''}`,
      `updated ${this.updatedDate(row)}`,
      this.feedBadgeLabel(row),
      this.temporalLabel[row.temporal],
    ];
    return `${parts.join('. ')}.`;
  }

  protected onSearch(value: string): void {
    this.service.setQuery(value);
    this.focusRequest.set(null);
  }

  protected toggleCategory(category: SignalCategory): void {
    this.service.toggleCategory(category);
    this.focusRequest.set(null);
  }

  /** A click drives the detail panel — the pointer equivalent of Enter. */
  protected drive(row: AltSignal, index: number): void {
    this.focusRequest.set(index);
    this.service.selectForDetail(row.id);
  }

  /**
   * The include control, which never changes which card drives the detail.
   *
   * `stopPropagation` because the card underneath it is the select-for-detail
   * target: without it a pointer user could not include a card without also
   * moving the detail panel onto it.
   */
  protected toggleInclude(row: AltSignal, event: Event): void {
    event.stopPropagation();
    this.service.toggleInclude(row.id);
  }

  /**
   * The listbox keyboard contract.
   *
   * Arrows and Home/End move focus only. Space includes or excludes the focused
   * card and leaves the selection alone. Enter — and only Enter — makes the
   * card drive the detail panel, and tells the page so it can move focus onto
   * the panel's heading.
   */
  protected onKeydown(event: KeyboardEvent, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = this.rows();
    if (rows.length === 0) return;

    if (event.key === ' ' || event.key === 'Spacebar') {
      // Space scrolls the page by default, and a listbox that scrolls away
      // from the card it just ticked has lost the reader's place.
      event.preventDefault();
      this.service.toggleInclude(rows[index].id);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.service.selectForDetail(rows[index].id);
      this.activated.emit(rows[index].id);
      return;
    }

    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();

    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % rows.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = (index - 1 + rows.length) % rows.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;

    this.focusRequest.set(next);
    this.options()[next]?.nativeElement.focus();
  }
}
