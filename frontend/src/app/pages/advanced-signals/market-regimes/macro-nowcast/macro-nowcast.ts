import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FACTOR_COUNTS,
  FACTOR_COUNT_LABEL,
  STALE_VINTAGE_BADGE,
  UNCERTAINTY_LEVEL_LABEL,
  type FactorCount,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BulletChartComponent, chartTokens } from '../../../../shared/charts';
import type { BulletRow } from '../../../../shared/charts';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { shareLabel, signedNews, signedPercent1, signedVintageDelta } from '../regimes-format';

const CHART_HEIGHT = 180;

/**
 * Region 6 — the macro nowcast.
 *
 * This runs **beside** the returns filter and never replaces it. The filter
 * infers the regime from realised returns; the nowcast projects GDP on roughly
 * two hundred monthly series through a dynamic factor model, with a Kalman
 * filter over an unbalanced panel that gives an unpublished series weight zero.
 * The two measure the same economy through different windows, and the page
 * shows both rather than reconciling them.
 *
 * Two things here are worth their own paragraph.
 *
 * The **factor count** is a genuine trade: six factors explain 39% of the
 * variance of the panel and twelve explain 53%, and the extra six take a little
 * uncertainty out of the common component and leave more of it in the
 * idiosyncratic one. The blocks the first six load on are fixed by the
 * substance; the blocks for factors 7–12 are not, and the panel says so rather
 * than inventing six more labels.
 *
 * The **stale-vintage badge** is a text badge and not a tint. A nowcast built
 * on a vintage older than the month the returns filter is anchored to is a
 * stale input to a comparison the reader is being invited to make, and that has
 * to survive greyscale, a colourblind reader and a screen reader alike.
 */
@Component({
  selector: 'app-market-regimes-macro-nowcast',
  imports: [BulletChartComponent, SegmentedControl, StatusBadge],
  templateUrl: './macro-nowcast.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroNowcast {
  private readonly service = inject(MarketRegimesService);

  protected readonly height = CHART_HEIGHT;
  protected readonly staleBadge = STALE_VINTAGE_BADGE;
  protected readonly share = shareLabel;
  protected readonly news = signedNews;

  protected readonly nowcast = this.service.nowcast;

  protected readonly gdpLabel = computed(() => `${signedPercent1(this.nowcast().gdpGrowthQoq)} q/q`);

  protected readonly deltaLabel = computed(
    () => `${signedVintageDelta(this.nowcast().deltaVsPriorVintagePp)} vs prior vintage ${this.nowcast().priorVintage}`,
  );

  protected readonly staleDetail = computed(
    () =>
      `The nowcast vintage ${this.nowcast().vintage} is older than the month the returns filter is ` +
      `anchored to, ${this.nowcast().filterReferenceMonth}.`,
  );

  protected readonly factorValue = computed<string>(() => String(this.nowcast().factorCount));

  protected readonly factorOptions = computed<readonly SegmentedOption[]>(() =>
    FACTOR_COUNTS.map((count) => ({ value: String(count), label: FACTOR_COUNT_LABEL[count] })),
  );

  /**
   * Projection uncertainty, split between the common factors and the
   * idiosyncratic components.
   *
   * A bullet row rather than a bar, because each share sits on a bounded 0–1
   * track and what matters is where on that track it lands. `status` carries
   * the word — `high` / `low` — so the level is never only a length.
   *
   * Neutral grey, not a palette slot: this panel is a parallel measurement of
   * the macro state, and dressing it in the regime model's colours would invite
   * reading it as one of the states.
   */
  protected readonly uncertaintyRows = computed<readonly BulletRow[]>(() => {
    const nowcast = this.nowcast();
    const colour = chartTokens().neutral;
    return [
      {
        label: 'Common factors',
        value: nowcast.commonUncertainty,
        status: UNCERTAINTY_LEVEL_LABEL[nowcast.commonUncertaintyLevel],
        color: colour,
      },
      {
        label: 'Idiosyncratic',
        value: nowcast.idiosyncraticUncertainty,
        status: UNCERTAINTY_LEVEL_LABEL[nowcast.idiosyncraticUncertaintyLevel],
        color: colour,
      },
    ];
  });

  protected readonly ariaLabel = computed(() => {
    const nowcast = this.nowcast();
    return (
      `Projection uncertainty of the ${nowcast.factorCount}-factor nowcast on a nought-to-one track: ` +
      `the common factors carry ${shareLabel(nowcast.commonUncertainty)}, which is ` +
      `${UNCERTAINTY_LEVEL_LABEL[nowcast.commonUncertaintyLevel]}, and the idiosyncratic components ` +
      `${shareLabel(nowcast.idiosyncraticUncertainty)}, which is ` +
      `${UNCERTAINTY_LEVEL_LABEL[nowcast.idiosyncraticUncertaintyLevel]}.`
    );
  });

  protected onFactorCount(value: string): void {
    this.service.setFactorCount(Number(value) as FactorCount);
  }
}
