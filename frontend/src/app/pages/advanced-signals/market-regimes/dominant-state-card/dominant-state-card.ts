import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  EMPTY_TITLE,
  MARKET_REGIME_MODEL_LABEL,
  PROBABILITY_BASIS_LABEL,
  SAMPLE_FROM_DEFAULT,
  SAMPLE_TO_DEFAULT,
  type RegimeUniverse,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { HeroStatCard } from '../../../../shared/hero-stat-card/hero-stat-card';
import { monthsLabel, percent0 } from '../regimes-format';

/** One state's row in the probability list. */
interface StateBar {
  readonly state: string;
  readonly probability: number;
  readonly label: string;
  readonly description: string;
  readonly modal: boolean;
  readonly barClass: string;
}

/**
 * Written out in full, one per state slot.
 *
 * An interpolated `bg-${token}` is invisible to Tailwind v4's source scan and
 * its rule is silently never emitted, so the bar would render with no fill at
 * all. The four values are the same four the probability path's bands take, in
 * the same order, so a state is the same colour in both regions.
 */
const STATE_BAR_CLASS: readonly string[] = [
  'bg-primary',
  'bg-signature',
  'bg-warning',
  'bg-info',
];

/**
 * Region 2 — the current regime, and every state's probability beside it.
 *
 * The card answers three questions the rest of the page is anchored to: which
 * state the filter puts in front, how confident it is, and how long that state
 * is expected to last. All three come from one reading, so the number in the
 * heading and the bar beneath it can never be two different numbers.
 *
 * Two things are deliberately shown together rather than one instead of the
 * other. The **filtered** probability is the real-time reading and moves; the
 * **stationary** probability π is the unconditional law of the chain and does
 * not. Crash at 58% against a stationary 9% is the whole point — the market is
 * six times more likely to be in a crash right now than it is on an average
 * month — and neither figure means much without the other.
 *
 * The bars carry a colour and a percentage, and the percentage is what conveys
 * the value: every row prints its own number, so nothing here is legible only
 * to a reader who can compare bar lengths or tell the four fills apart.
 *
 * The state named here is what the ContextBridgeCard's direction is computed
 * from. There is no second copy of it anywhere.
 */
@Component({
  selector: 'app-market-regimes-dominant-state',
  imports: [ButtonDirective, EmptyState, HeroStatCard],
  templateUrl: './dominant-state-card.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DominantStateCard {
  private readonly service = inject(MarketRegimesService);

  protected readonly emptyTitle = EMPTY_TITLE;

  protected readonly dominant = this.service.dominantState;
  protected readonly emptyDetail = this.service.emptyDetail;

  /** `Crash 58%` — the heading is the reading, not a label for one. */
  protected readonly title = computed(() => {
    const dominant = this.dominant();
    return dominant === null ? 'No current regime' : `${dominant.state} ${percent0(dominant.probability)}`;
  });

  /**
   * Always `Filtered`, whatever the toolbar's toggle says — and that is the
   * statement, not an oversight.
   *
   * This card is the reading at the last month of the sample. There the
   * smoother has no future left to condition on, so `P[s_T | I_T]` is the
   * filtered probability identically; the toggle revises the path behind it and
   * not this number. The spec says as much: the HeroStatCard shows the filtered
   * probability.
   */
  protected readonly eyebrow = computed(() => {
    const basis = PROBABILITY_BASIS_LABEL.filtered;
    const model = MARKET_REGIME_MODEL_LABEL[this.service.model()];
    return `Current regime · ${basis} · ${model} · ${this.service.universe().label}`;
  });

  /** Shown only under the smoother, where the equality needs saying out loud. */
  protected readonly smootherNote = computed(() =>
    this.service.probabilityBasis() === 'smoothed'
      ? 'At the last month of the sample the smoother has no future data to condition on, so P[s_T | I_T] is the filtered reading. The Smoothed toggle revises the path below, not the state here.'
      : null,
  );

  /**
   * The three qualifiers the wireframe prints beside the state, as one line.
   *
   * `mostLikelySince` is read off the probability path rather than declared
   * next to it, so the date and the drawing below cannot disagree.
   */
  protected readonly meta = computed(() => {
    const dominant = this.dominant();
    if (dominant === null) return '';
    return (
      `most likely since ${dominant.mostLikelySince} · ` +
      `stationary ${percent0(dominant.stationaryProbability)} · ` +
      `expected duration ${monthsLabel(dominant.expectedDurationMonths)}`
    );
  });

  protected readonly bars = computed<readonly StateBar[]>(() => {
    const dominantState = this.dominant()?.state ?? null;
    return this.service.stateReadings().map((reading, index) => ({
      state: reading.name,
      probability: reading.probability,
      label: percent0(reading.probability),
      description: reading.description,
      modal: reading.name === dominantState,
      barClass: STATE_BAR_CLASS[index % STATE_BAR_CLASS.length],
    }));
  });

  /**
   * The two ways out the spec names — each offered only where it leads
   * somewhere.
   *
   * Widening the window fixes an out-of-order or over-narrow window. It fixes
   * nothing when the window is *already* the whole axis, which is precisely the
   * situation a universe with too little history lands in: measured on
   * `EM equities`, pressing "Reset the sample window" left the window at
   * 1990-01 → 2026-07 and the page still empty, with nothing announced. So the
   * button is rendered only when it would change something, and the second way
   * out — a different universe — is a real control rather than a sentence
   * pointing at the toolbar.
   */
  protected readonly canWidenWindow = computed(
    () =>
      this.service.sampleFrom() !== SAMPLE_FROM_DEFAULT ||
      this.service.sampleTo() !== SAMPLE_TO_DEFAULT,
  );

  /** The universe with the longest history among those not already selected. */
  protected readonly longestUniverse = computed<RegimeUniverse>(() => {
    const current = this.service.universeId();
    const others = this.service.universes.filter((entry) => entry.id !== current);
    return others.reduce((best, entry) =>
      entry.firstObservation < best.firstObservation ? entry : best,
    );
  });

  protected resetSampleWindow(): void {
    this.service.setSampleFrom(SAMPLE_FROM_DEFAULT);
    this.service.setSampleTo(SAMPLE_TO_DEFAULT);
  }

  protected switchUniverse(): void {
    this.service.setUniverse(this.longestUniverse().id);
  }
}
