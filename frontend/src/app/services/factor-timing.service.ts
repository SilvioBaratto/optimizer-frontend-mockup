import { Injectable, computed, inject, signal } from '@angular/core';

import {
  DIRECTION_TOLERANCE,
  EMPTY_DETAIL,
  EXCESS_RETURN_FIRST_YEAR,
  EXCESS_RETURN_LAST_YEAR,
  EXPORT_FILENAME,
  FACTORS,
  FACTOR_IDS,
  GUARDRAIL_NOTICES,
  INSUFFICIENT_HISTORY_DETAIL,
  LOAD_FAILURE_DETAIL,
  LOAD_FAILURE_MESSAGE,
  MIN_FACTORS_IN_VIEW,
  NO_CONFLICT_KEY,
  NO_FACTOR_SELECTED_ERROR,
  PREDICTOR_CATEGORIES,
  PREDICTOR_CATEGORY_HORIZON,
  REBALANCING_INTERVAL_DAYS,
  REGIME_UNCERTAIN_THRESHOLD_PCT,
  SIGNAL_CADENCE_DEFAULT,
  TILT_INTENSITY,
  TIMING_VARIANTS,
  TIMING_VARIANT_DEFINITION,
  TIMING_VARIANT_LABEL,
  VALUE_SPREAD_BAND_THRESHOLD,
  VALUE_SPREAD_EXTREME_SD,
  VALUE_SPREAD_METRIC_LABEL,
  VALUE_VOLATILITY_STATES,
  VALUE_VOLATILITY_STATE_LABEL,
  VALUE_VOLATILITY_STATE_OF_REGIME,
  VIEWS_BUILDER_ROUTE,
  APPLY_BLOCKED_EMPTY,
  APPLY_BLOCKED_ERROR,
  APPLY_BLOCKED_LOADING,
  APPLY_FAILURE_DETAIL,
  APPLY_FAILURE_MESSAGE,
  type AppliedTilt,
  type AppliedTiltSet,
  type ExcessReturnSeries,
  type ExtrapolationCheck,
  type FactorId,
  type FactorSignalRow,
  type FactorTimingEmptyReason,
  type GuardrailNotice,
  type MomentumLookback,
  type PredictorCategory,
  type PredictorReading,
  type RebalancingFrequency,
  type SignalDirection,
  type TiltDirection,
  type TimingModelId,
  type TimingVariantRow,
  type UtilityGainRange,
  type UtilityGainRow,
  type ValueRegimeReading,
  type ValueSpreadBand,
  type ValueSpreadMetric,
  type ValueSpreadOmission,
  type ValueSpreadReading,
  type WmlWeighting,
} from '../models/factor-timing.model';
import { MarketRegimesService } from './market-regimes.service';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 700;

// ---------------------------------------------------------------------------
// The factor panel
// ---------------------------------------------------------------------------

/**
 * How much price history each factor has, in months.
 *
 * The 3-year rolling excess return needs 36 months on top of whatever the
 * market-state lookback asks for, so a factor is scored only when it has
 * `36 + lookback`. Profitability, added late to the panel, never clears the
 * bar — it is the page's "insufficient history" case and is excluded from the
 * composite rather than scored at zero.
 */
const HISTORY_MONTHS: Record<FactorId, number> = {
  value: 678,
  momentum: 678,
  size: 678,
  quality: 414,
  'low-vol': 462,
  profitability: 42,
};

const ROLLING_WINDOW_MONTHS = 36;

/** Weight of each factor sleeve today, percent of the portfolio. */
const CURRENT_WEIGHT_PCT: Record<FactorId, number> = {
  value: 12,
  momentum: 10,
  size: 8,
  quality: 15,
  'low-vol': 15,
  profitability: 0,
};

/**
 * The value spread of each factor, in standard deviations from its own 1968
 * mean, measured on the z-score specification.
 *
 * Nothing sits beyond two standard deviations: betting-against-beta is the
 * expensive one and it is still well inside the historical range. Every other
 * metric is a restatement of these numbers, not a second measurement.
 */
const VALUE_SPREAD_Z: Record<FactorId, number | null> = {
  value: -0.62,
  momentum: 0.58,
  size: 0.34,
  quality: 0.93,
  'low-vol': 1.35,
  profitability: null,
};

/**
 * How each metric restates the spread.
 *
 * The measure is not unique and the doc's whole sceptical thread turns on it:
 * a factor that reads elevated on price-to-book can read ordinary on a z-score.
 * Quality is exactly that factor here — 0.93 SD on the z-score specification,
 * 1.19 on price-to-book, which crosses the one-SD line.
 */
const METRIC_TRANSFORM: Record<ValueSpreadMetric, { scale: number; shift: number }> = {
  'z-score': { scale: 1, shift: 0 },
  percentile: { scale: 0.85, shift: 0 },
  'price-book': { scale: 1.15, shift: 0.12 },
  'price-earnings': { scale: 0.78, shift: -0.08 },
};

/** Mean and dispersion of the printed ratio, for the two ratio metrics. */
const RATIO_SCALE: Record<'price-book' | 'price-earnings', { mean: number; sd: number }> = {
  'price-book': { mean: 0.42, sd: 0.11 },
  'price-earnings': { mean: 0.58, sd: 0.14 },
};

/**
 * The trailing-performance signal, −1 … +1.
 *
 * Deliberately never an input to the composite on its own account: this is the
 * quantity whose five-year correlation with the next five years is *negative*,
 * and the parsimonious model weights it a quarter against valuation's
 * three quarters for exactly that reason.
 */
const TREND_SCORE: Record<FactorId, number | null> = {
  value: -0.42,
  momentum: 0.27,
  size: 0.33,
  quality: -0.14,
  'low-vol': -0.37,
  profitability: null,
};

/** Corporate credit spreads, TED, money supply growth. */
const FINANCIAL_SCORE: Record<FactorId, number | null> = {
  value: 0.44,
  momentum: -0.2,
  size: 0.18,
  quality: -0.22,
  'low-vol': -0.15,
  profitability: null,
};

/** GDP growth, capacity ratio, consumer confidence. */
const MACRO_SCORE: Record<FactorId, number | null> = {
  value: -0.31,
  momentum: 0.12,
  size: 0.29,
  quality: -0.18,
  'low-vol': -0.24,
  profitability: null,
};

/** VIX and the PMI — the defensive factors read as safe here, value as risky. */
const SENTIMENT_SCORE: Record<FactorId, number | null> = {
  value: -0.26,
  momentum: 0.35,
  size: -0.12,
  quality: 0.41,
  'low-vol': 0.33,
  profitability: null,
};

/**
 * Shrinkage on the valuation signal.
 *
 * The estimation error around a return forecast is usually larger than the
 * forecast, so the raw spread is not handed to the optimiser at face value. The
 * cap is what stops the single most expensive factor dominating the
 * cross-section — the breadth moderation the guardrail banner announces.
 */
const VALUATION_SHRINK_CAP = 0.3;

/** Standard deviations per unit of valuation score, before the cap. */
const VALUATION_SCORE_PER_SD = 0.5;

/**
 * A shorter market-state window reads louder.
 *
 * The UP/DOWN finding itself is robust across 12, 24 and 36 months, so the
 * state does not move with this; what moves is how much of the recent path the
 * trend signal is measuring.
 */
const TREND_LOOKBACK_SCALE: Record<MomentumLookback, number> = { 12: 1.15, 24: 1.05, 36: 1 };

/**
 * What each timing model weights.
 *
 * The parsimonious model is two vetted signals with a prior reason to work,
 * valuation carrying three times the trend. The panel model spreads the weight
 * over all five categories and their interactions — a better in-sample fit and
 * far more surface for a spurious relation to hide on.
 */
const MODEL_WEIGHTS: Record<TimingModelId, Record<PredictorCategory, number>> = {
  parsimonious: { financial: 0, macro: 0, sentiment: 0, valuation: 0.75, trend: 0.25 },
  'multi-signal': { financial: 0.2, macro: 0.12, sentiment: 0.08, valuation: 0.4, trend: 0.2 },
};

// ---------------------------------------------------------------------------
// The rolling excess-return cycles
// ---------------------------------------------------------------------------

/**
 * Two harmonics per factor, out of phase with one another.
 *
 * A stylised cycle rather than a reproduction of any particular index: what the
 * panel has to show is that the factor premia are cyclical and *not
 * synchronised*, which is the reason factor diversification disappoints exactly
 * when it is needed and the reason there is anything to time at all.
 */
const CYCLE: Record<FactorId, { amp: number; period: number; phase: number; slowAmp: number; slowPhase: number; drift: number }> = {
  value: { amp: 9.4, period: 11, phase: 1.1, slowAmp: 4.8, slowPhase: 0.4, drift: -0.6 },
  momentum: { amp: 8.1, period: 9, phase: 4.2, slowAmp: 5.6, slowPhase: 2.5, drift: 0.9 },
  size: { amp: 6.7, period: 13, phase: 2.7, slowAmp: 3.9, slowPhase: 4.1, drift: -0.3 },
  quality: { amp: 5.2, period: 15, phase: 5.0, slowAmp: 3.1, slowPhase: 1.2, drift: 1.4 },
  'low-vol': { amp: 5.9, period: 17, phase: 0.3, slowAmp: 3.4, slowPhase: 3.3, drift: 1.1 },
  profitability: { amp: 4.4, period: 12, phase: 3.6, slowAmp: 2.2, slowPhase: 5.5, drift: 0.5 },
};

const SLOW_PERIOD = 31;

// ---------------------------------------------------------------------------
// The timing comparison
// ---------------------------------------------------------------------------

/**
 * Out-of-sample information ratios.
 *
 * Factor investing is the benchmark the ratio is measured against, so it has
 * none of its own. **Market timing has none reported at all** — that is a gap
 * in the evidence, not a value of zero, and the panel draws it as a hatched
 * marker rather than as a bar of length zero.
 */
const INFORMATION_RATIO: Record<string, number | null> = {
  'factor-investing': null,
  'market-timing': null,
  'factor-timing': 0.42,
  'anomaly-timing': 0.6,
  'pure-anomaly-timing': 0.59,
};

/** A different measure, on its own scale, never handed to the ratio axis. */
const UTILITY_GAIN: readonly { variant: 'market-timing' | 'pure-anomaly-timing'; gain: number }[] = [
  { variant: 'market-timing', gain: 0.03 },
  { variant: 'pure-anomaly-timing', gain: 1.26 },
];

const UTILITY_GAIN_RANGE: UtilityGainRange = { from: 1.66, to: 2.96 };

// ---------------------------------------------------------------------------
// The stamp
// ---------------------------------------------------------------------------

const COMPUTED_DATE = '2026-07-31';
const COMPUTED_BASE_MINUTES = 6 * 60;

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Abramowitz–Stegun 7.1.26, good to 1.5e-7 — enough to print a percentile. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function directionOf(score: number): SignalDirection {
  if (score > DIRECTION_TOLERANCE) return 'up';
  if (score < -DIRECTION_TOLERANCE) return 'down';
  return 'flat';
}

/**
 * Rounds the raw tilts to whole percentage points **without letting them add
 * up to anything but zero**.
 *
 * The tilt reallocates weight between factors; it never adds any. Rounding each
 * one on its own would leave a residue of a point or two, which would read as
 * the page quietly levering the portfolio up. Largest-remainder puts the residue
 * where the rounding threw away the most, so no row moves by more than one
 * point away from its own raw tilt.
 */
function roundToZeroSum(raw: readonly number[]): number[] {
  const rounded = raw.map((value) => Math.round(value));
  let residue = -rounded.reduce((sum, value) => sum + value, 0);

  while (residue !== 0) {
    const step = residue > 0 ? 1 : -1;
    let best = -1;
    let bestError = -Infinity;
    for (let i = 0; i < rounded.length; i++) {
      const error = (raw[i] - rounded[i]) * step;
      if (error > bestError) {
        bestError = error;
        best = i;
      }
    }
    if (best < 0) break;
    rounded[best] += step;
    residue -= step;
  }

  return rounded;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * The engine behind `docs/23 Factor Timing & Rotation.md`.
 *
 * **It runs no regime filter of its own.** The market trend state, the
 * multi-asset regime probabilities and the value chain's two volatility states
 * are all read out of `MarketRegimesService` — the same estimate doc 22 shows
 * and the Macro & Regimes Agent consumes. The market-state lookback in this
 * page's toolbar writes that service's own signal, so the two pages cannot end
 * up looking at different markets.
 *
 * What this service owns is the cross-section: five predictor categories per
 * factor, a timing model that says which of them count, and the tilt that comes
 * out. Three properties hold by construction and are worth stating because each
 * of them is a way the page could otherwise lie:
 *
 * 1. **The valuation signal is the value spread.** `valuationScore` is a pure
 *    function of `ValueSpreadReading.zScore`, so the arrow in the signal table,
 *    the marker on the historical band and the sentence in the extrapolation
 *    callout are three renderings of one number.
 * 2. **The tilts sum to zero.** The composite is centred on its
 *    weight-weighted mean and the rounding uses largest-remainder, so the tilt
 *    reallocates weight and never adds any.
 * 3. **Absent is never zero.** A factor without enough history has `null`
 *    everywhere and is dropped from the composite; market timing's missing
 *    information ratio is `null` with a reason attached.
 */
@Injectable({ providedIn: 'root' })
export class FactorTimingService {
  private readonly regimes = inject(MarketRegimesService);

  // --- toolbar --------------------------------------------------------------

  /**
   * The market-state lookback, held by the **shared** regime service.
   *
   * Reading and writing it there rather than here is what makes the market
   * trend state on this page the same object doc 22 shows: there is no second
   * copy to fall out of step.
   */
  readonly lookback = this.regimes.momentumLookback;

  private readonly _rebalancing = signal<RebalancingFrequency>('quarterly');
  readonly rebalancing = this._rebalancing.asReadonly();

  private readonly _weighting = signal<WmlWeighting>('dynamic');
  readonly weighting = this._weighting.asReadonly();

  private readonly _timingModel = signal<TimingModelId>('parsimonious');
  readonly timingModel = this._timingModel.asReadonly();

  private readonly _valueSpreadMetric = signal<ValueSpreadMetric>('z-score');
  readonly valueSpreadMetric = this._valueSpreadMetric.asReadonly();

  private readonly _factorsInView = signal<readonly FactorId[]>(FACTOR_IDS);
  readonly factorsInView = this._factorsInView.asReadonly();

  private readonly _selectionError = signal<string | null>(null);
  readonly selectionError = this._selectionError.asReadonly();

  readonly factors = FACTOR_IDS;
  readonly factorDefinitions = FACTORS;

  setLookback(months: MomentumLookback): void {
    if (this.lookback() === months) return;
    this.regimes.setMomentumLookback(months);
    this.queueRecompute();
  }

  setRebalancing(frequency: RebalancingFrequency): void {
    if (this._rebalancing() === frequency) return;
    this._rebalancing.set(frequency);
    this.queueRecompute();
  }

  setWeighting(mode: WmlWeighting): void {
    if (this._weighting() === mode) return;
    this._weighting.set(mode);
    this.queueRecompute();
  }

  setTimingModel(model: TimingModelId): void {
    if (this._timingModel() === model) return;
    this._timingModel.set(model);
    this.queueRecompute();
  }

  setValueSpreadMetric(metric: ValueSpreadMetric): void {
    if (this._valueSpreadMetric() === metric) return;
    this._valueSpreadMetric.set(metric);
    this.queueRecompute();
  }

  /**
   * Adds or removes one factor from the view.
   *
   * Refuses to remove the last one: an empty cross-section has nothing to time,
   * and silently re-adding a chip the reader just cleared would be worse than
   * saying so.
   */
  toggleFactor(id: FactorId): void {
    const current = this._factorsInView();
    if (current.includes(id)) {
      if (current.length <= MIN_FACTORS_IN_VIEW) {
        this._selectionError.set(NO_FACTOR_SELECTED_ERROR);
        return;
      }
      this._selectionError.set(null);
      this._factorsInView.set(current.filter((factor) => factor !== id));
    } else {
      this._selectionError.set(null);
      this._factorsInView.set(FACTOR_IDS.filter((factor) => current.includes(factor) || factor === id));
    }
    this.queueRecompute();
  }

  /** The general setter. Unlike `toggleFactor` it accepts an empty selection. */
  setFactorsInView(ids: readonly FactorId[]): void {
    const next = FACTOR_IDS.filter((factor) => ids.includes(factor));
    this._selectionError.set(null);
    this._factorsInView.set(next);
    this.queueRecompute();
  }

  // --- the stamp and its staleness -----------------------------------------

  private readonly _runCount = signal(0);

  readonly lastComputed = computed(() => {
    const total = COMPUTED_BASE_MINUTES + this._runCount();
    const hours = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    return `${COMPUTED_DATE} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} UTC`;
  });

  /**
   * The rebalancing cadence the signals on screen were actually estimated for.
   *
   * Only a completed re-run adopts the toolbar's frequency. Changing the
   * frequency re-derives the tilts from the signals that exist; it does not
   * re-estimate them, so picking an interval shorter than the one they were
   * built for leaves them older than the decision they would inform — which is
   * what the Stale badge says.
   */
  private readonly _signalCadence = signal<RebalancingFrequency>(SIGNAL_CADENCE_DEFAULT);
  readonly signalCadence = this._signalCadence.asReadonly();

  readonly staleSignals = computed(
    () =>
      REBALANCING_INTERVAL_DAYS[this._rebalancing()] <
      REBALANCING_INTERVAL_DAYS[this._signalCadence()],
  );

  readonly staleDetail = computed(() => {
    if (!this.staleSignals()) return null;
    const cadence = REBALANCING_INTERVAL_DAYS[this._signalCadence()];
    const selected = REBALANCING_INTERVAL_DAYS[this._rebalancing()];
    return `The signals were estimated on a ${cadence}-day cadence and the selected interval is ${selected} days, so they are older than the decision they would inform. Refresh signals to re-estimate them on the selected interval.`;
  });

  // --- the shared regime reading -------------------------------------------

  /** The market trend state, straight off the shared engine. */
  readonly marketState = this.regimes.momentum;

  /** Every state of the shared filter, with its probability. */
  readonly regimeProbabilities = this.regimes.stateProbabilities;

  readonly dominantState = this.regimes.dominantState;

  /** Which model the shared filter is currently fitted under. */
  readonly regimeModel = this.regimes.model;

  /** No estimate at all — the shared filter's own empty combination. */
  readonly regimeUnavailable = computed(() => this.regimes.stateProbabilities().length === 0);

  readonly regimeFailed = computed(() => this.regimes.state() === 'error');

  readonly topRegimeProbability = computed<number | null>(() => {
    const probabilities = this.regimes.stateProbabilities();
    if (probabilities.length === 0) return null;
    return Math.max(...probabilities.map((entry) => entry.probability));
  });

  /** A display rule over the shared reading, never a second estimate. */
  readonly regimeUncertain = computed(() => {
    const top = this.topRegimeProbability();
    return top !== null && top < REGIME_UNCERTAIN_THRESHOLD_PCT;
  });

  /**
   * The value chain's two volatility states.
   *
   * The probability is the shared filter's own mass, **grouped** by volatility
   * state rather than re-estimated: crash and recovery are its high-volatility
   * states, slow growth and bull its low-volatility ones, and Hamilton's two
   * states split the same way. The premium beside it comes from the shared
   * service as well. Nothing here is a second filter.
   */
  readonly valueRegime = computed<readonly ValueRegimeReading[]>(() => {
    const probabilities = this.regimes.stateProbabilities();
    if (probabilities.length === 0) return [];
    const premia = this.regimes.valuePremium();

    return VALUE_VOLATILITY_STATES.map((state) => {
      const mass = probabilities
        .filter((entry) => VALUE_VOLATILITY_STATE_OF_REGIME[entry.state] === state)
        .reduce((sum, entry) => sum + entry.probability, 0);
      const premium = premia.find((row) => row.state === state);
      return {
        state,
        label: VALUE_VOLATILITY_STATE_LABEL[state],
        probability: round1(mass),
        premiumPercent: premium?.premiumPercent ?? 0,
      };
    });
  });

  /** Re-runs the shared filter — the local recovery for a regime failure. */
  async retryRegime(): Promise<void> {
    this.regimes.clearError();
    await this.regimes.refresh();
  }

  // --- the value spread -----------------------------------------------------

  private readonly scoredFactors = computed<readonly FactorId[]>(() =>
    this._factorsInView().filter((id) => !this.lacksHistory(id)),
  );

  private lacksHistory(id: FactorId): boolean {
    return HISTORY_MONTHS[id] < ROLLING_WINDOW_MONTHS + this.lookback();
  }

  private metricZ(id: FactorId): number | null {
    const base = VALUE_SPREAD_Z[id];
    if (base === null) return null;
    const { scale, shift } = METRIC_TRANSFORM[this._valueSpreadMetric()];
    return round4(base * scale + shift);
  }

  /** One row per factor in view that has a spread to read at all. */
  readonly valueSpread = computed<readonly ValueSpreadReading[]>(() => {
    const metric = this._valueSpreadMetric();
    return this.scoredFactors()
      .map((id) => {
        const z = this.metricZ(id);
        if (z === null) return null;
        const definition = FACTORS[id];
        return {
          factor: id,
          label: definition.label,
          portfolio: definition.portfolio,
          zScore: z,
          display: this.metricDisplay(z, metric),
          metric,
          band: bandOf(z),
          extreme: Math.abs(z) >= VALUE_SPREAD_EXTREME_SD,
        } satisfies ValueSpreadReading;
      })
      .filter((row): row is ValueSpreadReading => row !== null);
  });

  private metricDisplay(z: number, metric: ValueSpreadMetric): number {
    if (metric === 'percentile') return round1(normalCdf(z) * 100);
    if (metric === 'z-score') return round2(z);
    const { mean, sd } = RATIO_SCALE[metric];
    return round2(mean + z * sd);
  }

  /** Factors in view with no band to sit on, and why. */
  readonly valueSpreadOmissions = computed<readonly ValueSpreadOmission[]>(() =>
    this._factorsInView()
      .filter((id) => this.lacksHistory(id) || VALUE_SPREAD_Z[id] === null)
      .map((id) => ({
        factor: id,
        label: FACTORS[id].label,
        reason: INSUFFICIENT_HISTORY_DETAIL,
      })),
  );

  readonly anyExtreme = computed(() => this.valueSpread().some((row) => row.extreme));

  // --- the drivers and the composite ---------------------------------------

  private scoreOf(id: FactorId, category: PredictorCategory): number | null {
    switch (category) {
      case 'valuation': {
        const z = this.metricZ(id);
        if (z === null) return null;
        return round4(
          clamp(-z * VALUATION_SCORE_PER_SD, -VALUATION_SHRINK_CAP, VALUATION_SHRINK_CAP),
        );
      }
      case 'trend': {
        const base = TREND_SCORE[id];
        return base === null ? null : round4(base * TREND_LOOKBACK_SCALE[this.lookback()]);
      }
      case 'financial':
        return FINANCIAL_SCORE[id];
      case 'macro':
        return MACRO_SCORE[id];
      case 'sentiment':
        return SENTIMENT_SCORE[id];
    }
  }

  /**
   * One row per factor in view.
   *
   * The composite is a cross-sectional score: the model's blend of the drivers
   * less its weight-weighted mean over the scored factors. Centring is what
   * makes the tilt a reallocation — the deltas sum to zero — and it is also
   * what makes a factor sitting at the cross-sectional average come out at
   * exactly no tilt rather than at a small arbitrary one.
   */
  readonly signalRows = computed<readonly FactorSignalRow[]>(() => {
    const weights = MODEL_WEIGHTS[this._timingModel()];
    const inView = this._factorsInView();
    const intensity = TILT_INTENSITY[this._weighting()];

    interface Draft {
      readonly id: FactorId;
      readonly drivers: PredictorReading[];
      readonly raw: number | null;
      readonly scored: boolean;
    }

    const drafts: Draft[] = inView.map((id) => {
      const scored = !this.lacksHistory(id);
      const drivers: PredictorReading[] = PREDICTOR_CATEGORIES.map((category) => {
        const score = scored ? this.scoreOf(id, category) : null;
        return {
          category,
          score: score ?? 0,
          direction: score === null ? 'flat' : directionOf(score),
          horizon: PREDICTOR_CATEGORY_HORIZON[category],
          used: weights[category] > 0,
          weight: weights[category],
        };
      });

      if (!scored) return { id, drivers, raw: null, scored };

      const raw = PREDICTOR_CATEGORIES.reduce((sum, category) => {
        const score = this.scoreOf(id, category);
        return sum + (score ?? 0) * weights[category];
      }, 0);
      return { id, drivers, raw: round4(raw), scored };
    });

    const scoredDrafts = drafts.filter((draft) => draft.raw !== null);
    const weightTotal = scoredDrafts.reduce((sum, draft) => sum + CURRENT_WEIGHT_PCT[draft.id], 0);
    const mean =
      weightTotal === 0
        ? 0
        : scoredDrafts.reduce(
            (sum, draft) => sum + CURRENT_WEIGHT_PCT[draft.id] * (draft.raw as number),
            0,
          ) / weightTotal;

    const rawDeltas = scoredDrafts.map(
      (draft) => CURRENT_WEIGHT_PCT[draft.id] * intensity * ((draft.raw as number) - mean),
    );
    const deltas = roundToZeroSum(rawDeltas);
    const deltaById = new Map<FactorId, number>();
    scoredDrafts.forEach((draft, index) => deltaById.set(draft.id, deltas[index]));

    return drafts.map((draft) => {
      const definition = FACTORS[draft.id];
      const currentWeightPct = CURRENT_WEIGHT_PCT[draft.id];

      if (draft.raw === null) {
        return {
          factor: draft.id,
          label: definition.label,
          portfolio: definition.portfolio,
          insufficientHistory: true,
          excluded: true,
          drivers: draft.drivers,
          valuation: 'flat' as SignalDirection,
          valuationScore: null,
          trend: 'flat' as SignalDirection,
          trendScore: null,
          rawComposite: null,
          composite: null,
          tilt: null,
          conflict: false,
          currentWeightPct,
          timingWeightPct: null,
          deltaPp: null,
          bindingHorizon: null,
        } satisfies FactorSignalRow;
      }

      const valuationScore = this.scoreOf(draft.id, 'valuation') as number;
      const trendScore = this.scoreOf(draft.id, 'trend') as number;
      const valuation = directionOf(valuationScore);
      const trend = directionOf(trendScore);
      const composite = round4(draft.raw - mean);
      const deltaPp = deltaById.get(draft.id) ?? 0;
      const tilt: TiltDirection =
        deltaPp > 0 ? 'overweight' : deltaPp < 0 ? 'underweight' : 'neutral';

      return {
        factor: draft.id,
        label: definition.label,
        portfolio: definition.portfolio,
        insufficientHistory: false,
        excluded: false,
        drivers: draft.drivers,
        valuation,
        valuationScore,
        trend,
        trendScore,
        rawComposite: draft.raw,
        composite,
        tilt,
        // Opposed *and unresolved*: a row where one signal wins has a
        // determinate tilt and is not a conflict. This is the marker that
        // feeds the extrapolation callout.
        conflict:
          valuation !== 'flat' && trend !== 'flat' && valuation !== trend && tilt === 'neutral',
        currentWeightPct,
        timingWeightPct: currentWeightPct + deltaPp,
        deltaPp,
        bindingHorizon: bindingHorizonOf(draft.drivers),
      } satisfies FactorSignalRow;
    });
  });

  readonly scoredRows = computed(() => this.signalRows().filter((row) => !row.excluded));

  readonly excludedRows = computed(() => this.signalRows().filter((row) => row.excluded));

  readonly conflictedRows = computed(() => this.signalRows().filter((row) => row.conflict));

  /** Identifies *which* rows conflict, so a dismissal can be scoped to them. */
  readonly conflictKey = computed(() => {
    const conflicted = this.conflictedRows().map((row) => row.factor);
    return conflicted.length === 0 ? NO_CONFLICT_KEY : conflicted.join('+');
  });

  /** The tilts add up to nothing — the invariant, exposed so a test can hold it. */
  readonly tiltSumPp = computed(() =>
    this.scoredRows().reduce((sum, row) => sum + (row.deltaPp ?? 0), 0),
  );

  /**
   * The anti-extrapolation callout, generated from the conflicted row.
   *
   * Both clauses are rendered from the same two fields the table's two arrows
   * are rendered from, which is the whole point: the callout cannot report a
   * cheap valuation while the table prints a rich one.
   */
  readonly extrapolationCheck = computed<ExtrapolationCheck | null>(() => {
    const row = this.conflictedRows()[0];
    if (row === undefined) return null;

    const trendClause =
      row.trend === 'up'
        ? 'trailing return is strong'
        : row.trend === 'down'
          ? 'trailing return is weak'
          : 'trailing return is flat';
    const valuationClause =
      row.valuation === 'down'
        ? 'valuation reads rich'
        : row.valuation === 'up'
          ? 'valuation reads cheap'
          : 'valuation reads ordinary';

    return {
      factor: row.factor,
      label: row.label,
      trendClause,
      valuationClause,
      summary: `${row.label} — ${trendClause}, ${valuationClause}.`,
    };
  });

  // --- the rolling excess-return cycles ------------------------------------

  readonly excessReturnYears = computed<readonly number[]>(() => {
    const years: number[] = [];
    for (let year = EXCESS_RETURN_FIRST_YEAR; year <= EXCESS_RETURN_LAST_YEAR; year++) {
      years.push(year);
    }
    return years;
  });

  readonly excessReturnSeries = computed<readonly ExcessReturnSeries[]>(() => {
    const years = this.excessReturnYears();
    return this._factorsInView().map((id) => {
      const shape = CYCLE[id];
      return {
        factor: id,
        label: FACTORS[id].label,
        values: years.map((year) => {
          const t = year - EXCESS_RETURN_FIRST_YEAR;
          // A factor whose history starts late has no rolling window to fill,
          // so the early years are gaps rather than zeros.
          const monthsBefore = (EXCESS_RETURN_LAST_YEAR - year) * 12;
          if (monthsBefore + ROLLING_WINDOW_MONTHS > HISTORY_MONTHS[id]) return null;
          const fast = shape.amp * Math.sin((2 * Math.PI * t) / shape.period + shape.phase);
          const slow = shape.slowAmp * Math.sin((2 * Math.PI * t) / SLOW_PERIOD + shape.slowPhase);
          return round1(fast + slow + shape.drift);
        }),
      };
    });
  });

  // --- the timing comparison ------------------------------------------------

  readonly timingVariants = computed<readonly TimingVariantRow[]>(() =>
    TIMING_VARIANTS.map((variant) => {
      const ratio = INFORMATION_RATIO[variant];
      return {
        variant,
        label: TIMING_VARIANT_LABEL[variant],
        informationRatio: ratio,
        missingReason:
          ratio !== null ? null : variant === 'factor-investing' ? 'baseline' : 'not-reported',
        definition: TIMING_VARIANT_DEFINITION[variant],
      };
    }),
  );

  readonly utilityGains = computed<readonly UtilityGainRow[]>(() =>
    UTILITY_GAIN.map((row) => ({
      variant: row.variant,
      label: TIMING_VARIANT_LABEL[row.variant],
      gain: row.gain,
    })),
  );

  readonly utilityGainRange = UTILITY_GAIN_RANGE;

  // --- guardrails -----------------------------------------------------------

  readonly guardrailNotices: readonly GuardrailNotice[] = GUARDRAIL_NOTICES;

  /**
   * Which conflict the banner was dismissed for.
   *
   * Scoping the dismissal to the conflict rather than making it permanent is
   * what brings the banner back when a different factor starts conflicting —
   * and because the service lives for the session, a reload brings it back too.
   */
  private readonly _guardrailDismissedFor = signal<string | null>(null);

  readonly guardrailVisible = computed(
    () => this._guardrailDismissedFor() !== this.conflictKey(),
  );

  dismissGuardrails(): void {
    this._guardrailDismissedFor.set(this.conflictKey());
  }

  // --- the hand-off to Views Builder ---------------------------------------

  readonly appliedTiltSet = computed<AppliedTiltSet | null>(() => {
    const rows = this.scoredRows();
    if (rows.length === 0) return null;

    const tilts: AppliedTilt[] = rows.map((row) => ({
      factor: row.factor,
      label: row.label,
      currentWeightPct: row.currentWeightPct,
      timingWeightPct: row.timingWeightPct as number,
      deltaPp: row.deltaPp as number,
    }));

    return {
      at: this.lastComputed(),
      timingModel: this._timingModel(),
      weighting: this._weighting(),
      rebalancing: this._rebalancing(),
      lookbackMonths: this.lookback(),
      horizon: bindingHorizonOf(rows[0].drivers) ?? '12m',
      tilts,
      targetRoute: VIEWS_BUILDER_ROUTE,
    };
  });

  private readonly _applying = signal(false);
  readonly applying = this._applying.asReadonly();

  private readonly _applied = signal<AppliedTiltSet | null>(null);
  readonly applied = this._applied.asReadonly();

  readonly canApply = computed(
    () => this.state() === 'ready' && this.appliedTiltSet() !== null && !this._applying(),
  );

  /** Why the primary action is unavailable, in words, or `null` when it is not. */
  readonly applyBlockedReason = computed<string | null>(() => {
    switch (this.state()) {
      case 'loading':
        return APPLY_BLOCKED_LOADING;
      case 'error':
        return APPLY_BLOCKED_ERROR;
      case 'empty':
        return APPLY_BLOCKED_EMPTY;
      default:
        return this.appliedTiltSet() === null ? APPLY_BLOCKED_EMPTY : null;
    }
  });

  /**
   * Hands the timing weights to Views Builder as a tactical view.
   *
   * What is sent is `appliedTiltSet()` as it stands, so the payload is the
   * Timing % column the table is showing at that moment, carrying the model and
   * the horizon that produced it.
   */
  async applyTilts(fail = false): Promise<boolean> {
    const payload = this.appliedTiltSet();
    if (this._applying() || payload === null || !this.canApply()) return false;

    this._applying.set(true);
    this._errorMessage.set(null);
    this._errorDetail.set(null);
    await delay(LATENCY_MS);
    this._applying.set(false);

    if (fail) {
      this._errorMessage.set(APPLY_FAILURE_MESSAGE);
      this._errorDetail.set(APPLY_FAILURE_DETAIL);
      return false;
    }

    this._applied.set(payload);
    return true;
  }

  /** The current signals and tilts, as CSV. */
  exportSnapshot(): string {
    const header = [
      'factor',
      'portfolio',
      'valuation_score',
      'trend_score',
      'composite',
      'tilt',
      'current_pct',
      'timing_pct',
      'delta_pp',
      'note',
    ].join(',');

    const lines = this.signalRows().map((row) =>
      [
        row.label,
        row.portfolio,
        row.valuationScore ?? '',
        row.trendScore ?? '',
        row.composite ?? '',
        row.tilt ?? '',
        row.currentWeightPct,
        row.timingWeightPct ?? '',
        row.deltaPp ?? '',
        row.insufficientHistory ? 'insufficient history — excluded' : row.conflict ? 'trend vs valuation conflict' : '',
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  readonly exportFilename = EXPORT_FILENAME;

  // --- lifecycle ------------------------------------------------------------

  readonly emptyReason = computed<FactorTimingEmptyReason | null>(() => {
    if (this._factorsInView().length === 0) return 'no-factors';
    if (this.scoredFactors().length === 0) return 'no-history';
    return null;
  });

  readonly emptyDetail = computed<string | null>(() => {
    const reason = this.emptyReason();
    return reason === null ? null : EMPTY_DETAIL[reason];
  });

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  private readonly _errorDetail = signal<string | null>(null);
  readonly errorDetail = this._errorDetail.asReadonly();

  /**
   * The whole computation failed, as opposed to the hand-off having failed.
   *
   * One error signal carries both; only the first one blanks the page.
   */
  readonly loadFailure = computed(() => {
    const message = this._errorMessage();
    return message === null || message === APPLY_FAILURE_MESSAGE ? null : message;
  });

  readonly stale = computed(() => this.loadFailure() !== null || this.regimeFailed());

  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    if (this.emptyReason() !== null) return 'empty';
    if (this.loadFailure() !== null) return 'error';
    return 'ready';
  });

  private recomputing: Promise<void> = Promise.resolve();

  /** Resolves once any run a toolbar setter started has finished. */
  settled(): Promise<void> {
    return this.recomputing;
  }

  private queueRecompute(): void {
    if (this._loading()) return;
    // A toolbar change re-derives the tilts from the signals that exist. It
    // deliberately does NOT adopt the rebalancing cadence: re-estimating the
    // signals is the Refresh action, and if a parameter change quietly adopted
    // it, picking a shorter interval would clear the Stale badge it just
    // earned.
    this.recomputing = this.run(false);
  }

  /**
   * Re-estimates the signals on the toolbar's current parameters.
   *
   * A completed run adopts the selected rebalancing cadence, which is what
   * clears the Stale badge: the signals are now as recent as the interval they
   * would be traded on.
   */
  async refresh(fail = false): Promise<void> {
    await this.run(true, fail);
  }

  private async run(adoptCadence: boolean, fail = false): Promise<void> {
    if (this._loading()) return;

    this._loading.set(true);
    this._errorMessage.set(null);
    this._errorDetail.set(null);

    await delay(LATENCY_MS);

    if (fail) {
      this._errorMessage.set(LOAD_FAILURE_MESSAGE);
      this._errorDetail.set(LOAD_FAILURE_DETAIL);
      this._loading.set(false);
      return;
    }

    if (adoptCadence) this._signalCadence.set(this._rebalancing());
    this._runCount.update((count) => count + 1);
    this._loading.set(false);
  }

  clearError(): void {
    this._errorMessage.set(null);
    this._errorDetail.set(null);
  }

  /** For the metric's own caption. */
  readonly metricLabel = computed(() => VALUE_SPREAD_METRIC_LABEL[this._valueSpreadMetric()]);
}

function bandOf(z: number): ValueSpreadBand {
  if (z >= VALUE_SPREAD_BAND_THRESHOLD) return 'elevated';
  if (z <= -VALUE_SPREAD_BAND_THRESHOLD) return 'cheap';
  return 'ordinary';
}

/**
 * The horizon of the loudest driver the model is actually using.
 *
 * In factor timing the horizon is not a detail: a signal that predicts at three
 * years says nothing about next month, and a row whose composite is carried by
 * valuation is a three-to-five-year claim however it is drawn.
 */
function bindingHorizonOf(drivers: readonly PredictorReading[]): string | null {
  const used = drivers.filter((driver) => driver.used);
  if (used.length === 0) return null;
  let best = used[0];
  for (const driver of used) {
    if (Math.abs(driver.score) * driver.weight > Math.abs(best.score) * best.weight) best = driver;
  }
  return best.horizon;
}
