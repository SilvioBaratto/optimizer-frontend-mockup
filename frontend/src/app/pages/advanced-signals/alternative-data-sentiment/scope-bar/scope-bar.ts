import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import {
  AS_OF_DATE,
  COVERAGE_MIN_DATE,
  FEED_HEALTH_LABEL,
  PARTIAL_COVERAGE_BADGE,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { InfoCard } from '../../../../shared/info-card/info-card';
import { PageContextBar } from '../../../../shared/page-context-bar/page-context-bar';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';

/**
 * Regions 1 and 2 — the scope switcher and the coverage/freshness card, which
 * stick to the top of the content together.
 *
 * They are one component because they are one statement: every percentage,
 * badge and figure below is stated *for this universe over this window*, and a
 * bar that scrolled the universe away while leaving the window in place would
 * let a reader attribute a coverage figure to the wrong scope.
 *
 * The universe picker is a combobox rather than a menu, and the distinction is
 * the keyboard contract: `aria-expanded` and `aria-controls` on the trigger, a
 * `role="listbox"` popup, and Escape that closes it and puts focus back on the
 * trigger it came from.
 *
 * The window is validated rather than clamped. An end date before the start, or
 * after the last date any feed holds, is refused with a message and the
 * previous window stays in force — a silently clamped date would leave the
 * field showing one window and the cards computed on another.
 */
@Component({
  selector: 'app-alt-data-scope-bar',
  imports: [InfoCard, PageContextBar, StatusBadge],
  templateUrl: './scope-bar.html',
  // `contents`, not `block`: the only child is an app-page-context-bar, which
  // sticks to the top of the scroll column. A sticky box is constrained by its
  // containing block, so a wrapper with a box of its own — exactly as tall as
  // the bar — leaves it nowhere to slide and the stickiness silently does
  // nothing.
  host: { class: 'contents', '(keydown.escape)': 'close()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataScopeBar {
  private readonly service = inject(AltDataSentimentService);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly minDate = COVERAGE_MIN_DATE;
  protected readonly maxDate = AS_OF_DATE;
  protected readonly partialBadge = PARTIAL_COVERAGE_BADGE;
  protected readonly feedLabel = FEED_HEALTH_LABEL;

  protected readonly universes = this.service.universes;
  protected readonly universe = this.service.universe;
  protected readonly coverageStart = this.service.coverageStart;
  protected readonly coverageEnd = this.service.coverageEnd;
  protected readonly coverageError = this.service.coverageError;
  protected readonly feedsUpdatedAt = this.service.feedsUpdatedAt;
  protected readonly staleFeeds = this.service.staleFeedCount;
  protected readonly failedFeeds = this.service.failedFeedCount;
  protected readonly partialFeeds = this.service.partialCoverageCount;

  protected readonly open = signal(false);
  protected readonly query = signal('');

  /** Client-side filter over the already-loaded list — no refetch. */
  protected readonly matches = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const all = this.universes;
    return needle ? all.filter((option) => option.name.toLowerCase().includes(needle)) : all;
  });

  /**
   * The health of the feeds as one sentence, so the bar states it in words and
   * not only in the badge's colour.
   */
  protected readonly feedSummary = computed(() => {
    const stale = this.staleFeeds();
    const failed = this.failedFeeds();
    if (failed === 0 && stale === 0) return 'All feeds within their cadence';
    const parts: string[] = [];
    if (failed > 0) parts.push(`${failed} failed`);
    if (stale > 0) parts.push(`${stale} past its cadence`);
    return parts.join(' · ');
  });

  protected readonly feedTone = computed<StatusTone>(() => {
    if (this.failedFeeds() > 0) return 'alert';
    if (this.staleFeeds() > 0) return 'warn';
    return 'ok';
  });

  protected readonly feedBadgeLabel = computed(() => {
    if (this.failedFeeds() > 0) return this.feedLabel.failed;
    if (this.staleFeeds() > 0) return this.feedLabel.stale;
    return this.feedLabel.live;
  });

  protected toggle(): void {
    this.open.update((value) => !value);
    if (!this.open()) this.query.set('');
  }

  protected select(id: string): void {
    this.service.setUniverse(id);
    this.close();
  }

  /** Escape closes and returns focus to the trigger, per the combobox contract. */
  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    this.trigger()?.nativeElement.focus();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onStart(event: Event): void {
    this.service.setCoverageStart((event.target as HTMLInputElement).value);
  }

  protected onEnd(event: Event): void {
    this.service.setCoverageEnd((event.target as HTMLInputElement).value);
  }
}
