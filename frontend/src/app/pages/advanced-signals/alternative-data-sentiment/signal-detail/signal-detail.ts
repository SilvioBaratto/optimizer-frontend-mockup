import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';

import {
  EMPTY_DETAIL_DETAIL,
  EMPTY_DETAIL_TITLE,
  FEED_HEALTH_LABEL,
  FEED_HEALTH_TONE,
  H4N_MISCLASSIFICATION_NOTE,
  INCLUDE_LABEL,
  NEWS_AGGREGATIONS,
  NEWS_AGGREGATION_LABEL,
  PARTIAL_COVERAGE_BADGE,
  SECONDARY_FLAGS_LABEL,
  TEMPORAL_DEFINITION,
  TEMPORAL_LABEL,
  TEMPORAL_TONE,
  TONE_DICTIONARIES,
  TONE_DICTIONARY_LABEL,
  TONE_WEIGHTINGS,
  TONE_WEIGHTING_LABEL,
  type NewsAggregation,
  type ToneDictionary,
  type ToneWeighting,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { HeroStatCard } from '../../../../shared/hero-stat-card/hero-stat-card';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { SlideOverComponent } from '../../../../shared/ui/slide-over/slide-over';
import { AltDataDetailFigure } from '../detail-figure/detail-figure';
import { percent0 } from '../alt-data-format';

/**
 * Regions 7 (expanded card), 9 (HeroStatCard) and 10 (ActionButtonRow) — the
 * evidence for the card currently driving the panel.
 *
 * The method controls live here rather than inside the grid's options, and that
 * placement is load-bearing rather than cosmetic: the children of a
 * `role="option"` are presentational, so a radio group inside a card in the
 * listbox would be invisible to assistive tech and unreachable by keyboard.
 * The wireframe draws the same thing — the selected card expanded, with its
 * dictionary and weighting on it, sitting between the grid and the figure.
 *
 * There is no save step. Every control writes straight to the service and the
 * figure, the verdict and the classification badge are `computed()` off it, so
 * "apply" would have nothing to do.
 *
 * The include checkbox appears once, in the ActionButtonRow the spec names. The
 * wireframe draws a second one on the expanded card; one control for one piece
 * of state is the version that cannot get out of step with itself, and the grid
 * card already shows the state through `aria-checked`.
 */
@Component({
  selector: 'app-alt-data-signal-detail',
  imports: [
    ActionButtonRow,
    AltDataDetailFigure,
    ButtonDirective,
    EmptyState,
    HeroStatCard,
    SegmentedControl,
    SlideOverComponent,
    StatusBadge,
  ],
  templateUrl: './signal-detail.html',
  host: { class: 'flex flex-col gap-4' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataSignalDetail {
  private readonly service = inject(AltDataSentimentService);

  /**
   * Asks the page to open the Cross-Sectional tab.
   *
   * Raised rather than switching the tab here, because switching it destroys
   * this component — and with it the button that was just pressed, which drops
   * focus to `<body>`. The page owns the tablist, survives the switch, and can
   * put focus on the tab that is now selected.
   */
  readonly crossSectionalRequested = output<void>();

  protected readonly emptyTitle = EMPTY_DETAIL_TITLE;
  protected readonly emptyDetail = EMPTY_DETAIL_DETAIL;
  protected readonly temporalLabel = TEMPORAL_LABEL;
  protected readonly temporalTone = TEMPORAL_TONE;
  protected readonly temporalDefinition = TEMPORAL_DEFINITION;
  protected readonly feedLabel = FEED_HEALTH_LABEL;
  protected readonly feedTone = FEED_HEALTH_TONE;
  protected readonly partialBadge = PARTIAL_COVERAGE_BADGE;
  protected readonly flagsLabel = SECONDARY_FLAGS_LABEL;
  protected readonly includeLabel = INCLUDE_LABEL;
  protected readonly h4nNote = H4N_MISCLASSIFICATION_NOTE;

  protected readonly detail = this.service.detail;
  protected readonly toneDictionary = this.service.toneDictionary;
  protected readonly toneWeighting = this.service.toneWeighting;
  protected readonly newsAggregation = this.service.newsAggregation;

  protected readonly methodologyOpen = signal(false);

  protected readonly dictionaryOptions = computed<SegmentedOption[]>(() =>
    TONE_DICTIONARIES.map((value) => ({ value, label: TONE_DICTIONARY_LABEL[value] })),
  );

  protected readonly weightingOptions = computed<SegmentedOption[]>(() =>
    TONE_WEIGHTINGS.map((value) => ({ value, label: TONE_WEIGHTING_LABEL[value] })),
  );

  protected readonly aggregationOptions = computed<SegmentedOption[]>(() =>
    NEWS_AGGREGATIONS.map((value) => ({ value, label: NEWS_AGGREGATION_LABEL[value] })),
  );

  /** The H4N caution is about the dictionary chosen, so it follows the choice. */
  protected readonly showH4nNote = computed(
    () => this.detail()?.signal.method === 'tone' && this.toneDictionary() === 'h4n',
  );

  protected readonly included = computed(() => {
    const current = this.detail();
    return current !== null && this.service.isIncluded(current.signal.id);
  });

  protected readonly coverageText = computed(() => {
    const current = this.detail();
    return current === null ? '' : percent0(current.signal.coverage);
  });

  protected readonly feedBadgeLabel = computed(() => {
    const current = this.detail();
    if (current === null) return '';
    const item = current.signal;
    if (item.feed === 'failed' && item.lastGoodAt !== null) {
      return `${this.feedLabel.failed} — last good ${item.lastGoodAt}`;
    }
    if (item.feed === 'stale') return `${this.feedLabel.stale} — expected ${item.cadence}`;
    return this.feedLabel.live;
  });

  protected readonly feedBadgeTone = computed<StatusTone>(() => {
    const current = this.detail();
    return current === null ? 'neutral' : this.feedTone[current.signal.feed];
  });

  protected onDictionary(value: string): void {
    this.service.setToneDictionary(value as ToneDictionary);
  }

  protected onWeighting(value: string): void {
    this.service.setToneWeighting(value as ToneWeighting);
  }

  protected onAggregation(value: string): void {
    this.service.setNewsAggregation(value as NewsAggregation);
  }

  protected onInclude(): void {
    const current = this.detail();
    if (current === null) return;
    this.service.toggleInclude(current.signal.id);
  }

  protected openMethodology(): void {
    if (this.detail() === null) return;
    this.methodologyOpen.set(true);
  }

  protected closeMethodology(): void {
    this.methodologyOpen.set(false);
  }

  protected openCrossSectional(): void {
    this.crossSectionalRequested.emit();
  }
}
