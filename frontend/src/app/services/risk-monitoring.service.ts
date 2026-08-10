import { Injectable, computed, signal } from '@angular/core';

import {
  CAPITAL_BASE_EUR_M,
  CDAR_ALPHA_DEFAULT,
  CDAR_ALPHA_MAX,
  CDAR_ALPHA_MIN,
  DRAWDOWN_LIMITS,
  DRAWDOWN_MEASURE_LABEL,
  DRAWDOWN_MEASURE_ORDER,
  HISTORY_OBSERVATIONS,
  LOAD_FAILURE_DETAIL,
  LOAD_FAILURE_MESSAGE,
  MIN_TAIL_OBSERVATIONS,
  RISK_MONITORING_RELATED_PAGES,
  TAIL_COINCIDENCE_THRESHOLD,
  type CdarPoint,
  type ConfidenceLevel,
  type DrawdownMeasureId,
  type DrawdownSummary,
  type DrawdownThresholdRow,
  type DrawdownUnits,
  type HoldingPeriod,
  type LogEntry,
  type LookbackWindow,
  type RiskReadings,
  type ThresholdStatus,
  type UnderwaterPoint,
  type VarCvarPoint,
  type VarMethod,
} from '../models/risk-monitoring.model';
import { normalQuantile } from './normal-distribution';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 600;

const DEFAULT_PORTFOLIO = 'Balanced Growth v3';

// ---------------------------------------------------------------------------
// The loss distribution the tail measures are read off
// ---------------------------------------------------------------------------

/** Daily volatility of the held weights, as a percentage of NAV. */
const DAILY_SIGMA = 2.0;

/**
 * How far the realised tail sits from the normal one.
 *
 * The empirical quantile is a little tighter than the normal one in the body
 * and a good deal wider deep in the tail — the usual shape of a realised return
 * sample — which is why the factor rises with β rather than being one number.
 */
const EMPIRICAL_VAR_FACTOR: Record<ConfidenceLevel, number> = { 90: 0.98, 95: 1.04, 99: 1.18 };

/**
 * Empirical CVaR as a multiple of the empirical VaR.
 *
 * Every entry is greater than one, which is what makes `VaR ≤ CVaR` a property
 * of the construction rather than of the particular numbers chosen: the average
 * of the losses beyond a threshold cannot be below the threshold.
 */
const EMPIRICAL_TAIL_RATIO: Record<ConfidenceLevel, number> = { 90: 1.52, 95: 1.424, 99: 1.29 };

/** φ(z) — the standard normal density, for the parametric Expected Shortfall. */
function normalPdf(z: number): number {
  return Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * The β-VaR and β-CVaR of the held weights over the holding period.
 *
 * Parametric: `VaR = z_β·σ√h` and `CVaR = σ√h·φ(z_β)/(1−β)`. Their ratio is the
 * Mills ratio `φ(z)/((1−β)z)`, which exceeds one for every β above a half — so
 * the ordering holds under this branch by the closed form, not by assertion.
 *
 * Historical: the realised quantile, with the empirical tail multiple above.
 * Both branches return a positive percentage; a loss is rendered with its sign
 * where it is shown.
 */
function baseReading(
  confidence: ConfidenceLevel,
  method: VarMethod,
  holdingPeriodDays: HoldingPeriod,
): { readonly var: number; readonly cvar: number } {
  const beta = confidence / 100;
  const z = normalQuantile(beta);
  const scale = DAILY_SIGMA * Math.sqrt(holdingPeriodDays);

  if (method === 'parametric') {
    return { var: scale * z, cvar: scale * (normalPdf(z) / (1 - beta)) };
  }

  const quantile = scale * z * EMPIRICAL_VAR_FACTOR[confidence];
  return { var: quantile, cvar: quantile * EMPIRICAL_TAIL_RATIO[confidence] };
}

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

const AS_OF_DATE = '2026-07-31';
const DAY_MS = 86_400_000;

/** `count` business days ending on `end`, oldest first. */
function businessDaysEndingAt(end: string, count: number): readonly string[] {
  const days: string[] = [];
  let cursor = Date.parse(`${end}T00:00:00Z`);
  while (days.length < count) {
    const date = new Date(cursor);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(date.toISOString().slice(0, 10));
    cursor -= DAY_MS;
  }
  return days.reverse();
}

/** `count` weekly observations ending on `end`, oldest first. */
function weeklyDaysEndingAt(end: string, count: number): readonly string[] {
  const days: string[] = [];
  let cursor = Date.parse(`${end}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor -= 7 * DAY_MS;
  }
  return days.reverse();
}

// ---------------------------------------------------------------------------
// The VaR / CVaR trend
// ---------------------------------------------------------------------------

/** A year of weekly readings; the window selector slices this, never re-runs it. */
const TREND_OBSERVATIONS = 53;

const TREND_DATES = weeklyDaysEndingAt(AS_OF_DATE, TREND_OBSERVATIONS);

/** How many of those weeks each window shows. `1Y` is the whole sample. */
const TREND_EXTENT: Record<LookbackWindow, number> = { '3M': 14, '6M': 27, '9M': 40, '1Y': 53 };

/**
 * The path of the tail through the year, as a multiple of the current reading.
 *
 * It is pinned to exactly 1 at the right-hand end — the last point of the trend
 * *is* the KeyMetricsRow reading, and a chart whose final point disagreed with
 * the number printed above it would be worse than no chart.
 */
function trendShape(u: number): number {
  return 0.6 + 0.4 * u + 0.06 * Math.sin(6 * Math.PI * u) * (1 - u);
}

/** The same pinning for the CVaR-to-VaR ratio: no modulation at the last point. */
function tailShape(u: number): number {
  return 1 + 0.05 * Math.sin(4 * Math.PI * u) * (1 - u);
}

// ---------------------------------------------------------------------------
// The drawdown path
// ---------------------------------------------------------------------------
//
// The underwater curve is designed as the drawdown itself and the cumulative
// return is reconstructed from it, rather than the other way round. Both
// directions produce the same object, but this one makes the property the page
// turns on structural: `D` is zero at chosen indices, the running maximum steps
// up at exactly those indices, and the reconstructed return therefore touches a
// new high there and nowhere else.

const OBSERVATIONS = 252;
const SERIES_DATES = businessDaysEndingAt(AS_OF_DATE, OBSERVATIONS);

/** The deepest single fall in the period, percent. */
const TROUGH = 18.4;
/** `D(x,t)` at the as-of instant, percent. */
const CURRENT_DRAWDOWN = 6.1;
/** Observations in the open episode. */
const UNDERWATER_OBSERVATIONS = 47;
/** `A(x)` the fixture is calibrated to, percent. */
const AVERAGE_DRAWDOWN_TARGET = 7.2;

/** A single-session shock, on the ninth observation of the window. */
const CRASH_INDEX = 9;
const DECLINE = [1.2, 2.6, 4.0, 5.4, 6.6, 7.4, 8.0, 8.4];
const REBOUND = [9.6, 9.0, 8.8, 8.7, 8.6, 8.5, 8.5, 8.4];

const PLATEAU_FROM = CRASH_INDEX + 1 + REBOUND.length;
const RECOVERY_LENGTH = 14;
const EPISODE_FROM = OBSERVATIONS - UNDERWATER_OBSERVATIONS;
const PLATEAU_TO = EPISODE_FROM - RECOVERY_LENGTH;

/** A brief touch of the old high in the middle of the long grind. */
const MID_HIGH_INDEX = 112;
const MID_HIGH_HALF = 6;

/** Where the reconstructed cumulative return starts, percent. */
const PEAK_START = 12;
/** How far each new high clears the previous one, percent. */
const NEW_HIGH_STEP = 0.6;

/**
 * `D(x,t)` for a given depth of the long grind, in percent.
 *
 * Every value outside the fixed opening, the crash and the open episode is
 * proportional to `level`, which is what lets the depth be solved for in one
 * step rather than searched for.
 */
function drawdownShape(level: number): number[] {
  const d = new Array<number>(OBSERVATIONS).fill(0);

  DECLINE.forEach((value, i) => (d[1 + i] = value));
  d[CRASH_INDEX] = TROUGH;
  REBOUND.forEach((value, i) => (d[CRASH_INDEX + 1 + i] = value));

  for (let i = PLATEAU_FROM; i < PLATEAU_TO; i++) {
    const u = (i - PLATEAU_FROM) / (PLATEAU_TO - PLATEAU_FROM - 1);
    d[i] =
      level *
      (1 + 0.02 * Math.sin(2 * Math.PI * 2.5 * u) + 0.007 * Math.sin(2 * Math.PI * 7 * u));
  }

  // Carve the mid-period new high out of the grind: down to zero and back.
  const lead = d[MID_HIGH_INDEX - MID_HIGH_HALF - 1];
  const trail = d[MID_HIGH_INDEX + MID_HIGH_HALF + 1];
  for (let k = 1; k <= MID_HIGH_HALF; k++) {
    d[MID_HIGH_INDEX - MID_HIGH_HALF - 1 + k] = lead * (1 - k / (MID_HIGH_HALF + 1));
    d[MID_HIGH_INDEX + k] = trail * (k / (MID_HIGH_HALF + 1));
  }
  d[MID_HIGH_INDEX] = 0;

  // Back to a new high, which is where the open episode starts from.
  const last = d[PLATEAU_TO - 1];
  for (let k = 0; k < RECOVERY_LENGTH; k++) {
    d[PLATEAU_TO + k] = last * (1 - (k + 1) / RECOVERY_LENGTH);
  }

  for (let k = 0; k < UNDERWATER_OBSERVATIONS; k++) {
    const u = (k + 1) / UNDERWATER_OBSERVATIONS;
    d[EPISODE_FROM + k] =
      CURRENT_DRAWDOWN * Math.pow(u, 0.75) * (1 + 0.1 * Math.sin(2 * Math.PI * 2 * u) * (1 - u));
  }
  d[OBSERVATIONS - 1] = CURRENT_DRAWDOWN;

  return d;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The depth of the grind that makes the fund's average drawdown 7.2%.
 *
 * `drawdownShape` is affine in its argument, so the level that lands on the
 * documented AvDD is read off two evaluations instead of being searched for.
 * MaxDD is not solved for: it is the trough constant, which no level in
 * `[0, TROUGH)` can displace.
 */
const SHAPE_FIXED = drawdownShape(0);
const SHAPE_UNIT = drawdownShape(1).map((value, i) => value - SHAPE_FIXED[i]);
const GRIND_LEVEL = (AVERAGE_DRAWDOWN_TARGET - average(SHAPE_FIXED)) / average(SHAPE_UNIT);

/**
 * The underwater curve, rebuilt through the definition.
 *
 * The cumulative return is `peak − D`, and the running maximum is then taken
 * over that return by the definition rather than carried across from the design
 * — so `drawdown` on every point below is a difference actually computed from
 * two neighbouring fields, and is zero exactly where the return meets its own
 * running maximum.
 */
const UNDERWATER_SERIES: readonly UnderwaterPoint[] = (() => {
  const designed = drawdownShape(GRIND_LEVEL);

  const returns: number[] = [];
  let peak = PEAK_START;
  for (let i = 0; i < OBSERVATIONS; i++) {
    if (designed[i] === 0 && i > 0) peak += NEW_HIGH_STEP;
    returns.push(peak - designed[i]);
  }

  const points: UnderwaterPoint[] = [];
  let runningMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < OBSERVATIONS; i++) {
    runningMax = Math.max(runningMax, returns[i]);
    const drawdown = runningMax - returns[i];
    points.push({
      date: SERIES_DATES[i],
      cumulativeReturn: returns[i],
      runningMax,
      drawdown,
      drawdownAbs: (drawdown / 100) * CAPITAL_BASE_EUR_M,
      newHigh: drawdown === 0,
    });
  }
  return points;
})();

const DRAWDOWNS = UNDERWATER_SERIES.map((point) => point.drawdown);

/** The drawdown sample, worst first — the order every CDaR reading is taken in. */
const DRAWDOWNS_DESC = [...DRAWDOWNS].sort((a, b) => b - a);

const MAX_DRAWDOWN = DRAWDOWNS_DESC[0];
const AVERAGE_DRAWDOWN = average(DRAWDOWNS);

const TROUGH_INDEX = DRAWDOWNS.indexOf(MAX_DRAWDOWN);
const LAST_HIGH_INDEX = UNDERWATER_SERIES.map((p) => p.newHigh).lastIndexOf(true);

/**
 * `Δ_α(x)` — the mean of the worst `(1−α)` of the drawdowns experienced.
 *
 * The two ends are the identity the CDaR family exists to express, and they are
 * returned as the sample mean and the sample maximum themselves: `Δ₀(x)` is an
 * average over the whole sample and `Δ₁(x)` an average over none of it, so
 * evaluating the general form there would only reorder the same additions and
 * hand back a number a few ulps away from the one printed beside it.
 *
 * In between, the tail fraction is generally not a whole number of
 * observations, so the boundary one is taken at its fractional weight — the
 * same convention the empirical CVaR uses.
 */
function cdarOf(alpha: number): number {
  if (alpha <= CDAR_ALPHA_MIN) return AVERAGE_DRAWDOWN;
  if (alpha >= CDAR_ALPHA_MAX) return MAX_DRAWDOWN;

  const tail = (1 - alpha) * DRAWDOWNS_DESC.length;
  const whole = Math.floor(tail);
  let sum = 0;
  for (let i = 0; i < whole; i++) sum += DRAWDOWNS_DESC[i];
  const remainder = tail - whole;
  if (remainder > 0) sum += remainder * DRAWDOWNS_DESC[whole];
  return sum / tail;
}

/** 101 samples, one per step of the slider. */
const CDAR_CURVE: readonly CdarPoint[] = Array.from({ length: 101 }, (_, i) => {
  const alpha = i / 100;
  const value = cdarOf(alpha);
  return { alpha, value, valueAbs: (value / 100) * CAPITAL_BASE_EUR_M };
});

const DRAWDOWN_SUMMARY: DrawdownSummary = {
  maxDrawdown: MAX_DRAWDOWN,
  maxDrawdownAbs: (MAX_DRAWDOWN / 100) * CAPITAL_BASE_EUR_M,
  maxDrawdownAt: SERIES_DATES[TROUGH_INDEX],
  averageDrawdown: AVERAGE_DRAWDOWN,
  averageDrawdownAbs: (AVERAGE_DRAWDOWN / 100) * CAPITAL_BASE_EUR_M,
  daysUnderwater: OBSERVATIONS - 1 - LAST_HIGH_INDEX,
  lastHighAt: SERIES_DATES[LAST_HIGH_INDEX],
  observations: OBSERVATIONS,
  from: SERIES_DATES[0],
  to: SERIES_DATES[OBSERVATIONS - 1],
};

const DRAWDOWN_MEASURE_SYMBOL: Record<Exclude<DrawdownMeasureId, 'cdar'>, string> = {
  maxdd: 'M(x)',
  avdd: 'A(x)',
};

// ---------------------------------------------------------------------------
// The alert & breach log
// ---------------------------------------------------------------------------
//
// Every stamp below is a trading day of `SERIES_DATES`, because activating an
// entry is meant to highlight the matching point on the chart above it. Two of
// them are the chart's own turning points: the crash of 2025-08-27 and the new
// high of 2026-01-19.

const ALERT_LOG: readonly LogEntry[] = [
  {
    id: 'alert-2026-07-29',
    at: '2026-07-29 14:02',
    text: 'AvDD crossed into Warning band (72% of limit)',
    detail: 'AvDD A(x) 7.2% · limit 10.0% (ν₂C) · warning band at 70% of the limit',
  },
  {
    id: 'alert-2026-07-09',
    at: '2026-07-09 09:11',
    text: 'Drawdown duration exceeded 30 days',
    detail: 'Open episode since 2026-05-27 · D(x,t) 4.6% on the day the threshold was passed',
  },
  {
    id: 'alert-2026-05-01',
    at: '2026-05-01 11:47',
    text: 'CDaR (0.95) returned to OK band',
    detail: 'Δ_0.95(x) 9.8% · limit 14.0% (ν₃C) · warning band at 75% of the limit',
  },
  // The rule that fires twice: this path has two episodes long enough to trip
  // the duration limit. It is *not* a second MaxDD warning — M(x) reached 18.4%
  // in the single session of 2025-08-27, which is 61% of its limit, so the
  // MaxDD band was crossed there and nowhere else. An entry claiming that
  // crossing seven months later would contradict the one below it.
  {
    id: 'alert-2026-03-04',
    at: '2026-03-04 16:20',
    text: 'Drawdown duration exceeded 30 days',
    detail: 'Episode of 2026-01-19 · D(x,t) 8.7% on the day the threshold was passed',
  },
  {
    id: 'alert-2026-01-19',
    at: '2026-01-19 10:05',
    text: 'Drawdown returned to zero at a new running maximum',
    detail: 'D(x,t) 0.0% · the grind that began on 2025-08-14 closed after 112 observations',
  },
  {
    id: 'alert-2025-08-27',
    at: '2025-08-27 09:05',
    text: 'MaxDD set at 18.4% in a single session',
    detail: 'MaxDD M(x) 18.4% · limit 30.0% (ν₁C) · a one-session fall from the running maximum',
  },
];

/** How many entries the panel shows before 'View all alerts'. */
const RECENT_ALERTS = 3;

// ---------------------------------------------------------------------------

/**
 * The fund's risk posture on the weights it actually holds.
 *
 * Four toolbar parameters, three of which mean different things:
 *
 * - β, the method and the holding period define *which* loss distribution is
 *   being read, so changing one of them is a calculation: the page loads.
 * - The lookback window is the extent of one chart. It slices a series that has
 *   already been computed and nothing else on the page moves.
 * - The drawdown units are presentation. Every drawdown quantity here carries
 *   both its percentage and its money value, computed from the same number, so
 *   the toggle switches which field is read and cannot start a computation or
 *   let the two readings drift apart.
 * - α is the level of the CDaR family. It moves the Δ readout, the marker on
 *   the curve and the CDaR row of the threshold table — all three of which are
 *   the same `computed`, so there is no version of this page on which they
 *   disagree.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the loading and error states in
 * the page spec actually reachable.
 */
@Injectable({ providedIn: 'root' })
export class RiskMonitoringService {
  // --- toolbar parameters ---------------------------------------------------
  //
  // Held privately and written through setters, because for three of them the
  // write has a cost: it starts a calculation. A public writable signal would
  // let a caller change the confidence level without ever loading, and the page
  // would then print a 99% reading under a card labelled as computed at 95%.

  private readonly _confidence = signal<ConfidenceLevel>(95);
  readonly confidence = this._confidence.asReadonly();

  private readonly _method = signal<VarMethod>('historical');
  readonly method = this._method.asReadonly();

  private readonly _holdingPeriodDays = signal<HoldingPeriod>(1);
  readonly holdingPeriodDays = this._holdingPeriodDays.asReadonly();

  private readonly _lookback = signal<LookbackWindow>('1Y');
  readonly lookback = this._lookback.asReadonly();

  private readonly _drawdownUnits = signal<DrawdownUnits>('rel');
  readonly drawdownUnits = this._drawdownUnits.asReadonly();

  private readonly _cdarAlpha = signal(CDAR_ALPHA_DEFAULT);
  readonly cdarAlpha = this._cdarAlpha.asReadonly();

  /** β. Re-reads the loss distribution, so the page loads. */
  setConfidence(value: ConfidenceLevel): void {
    if (value === this._confidence()) return;
    this._confidence.set(value);
    this.queueRecompute();
  }

  /** Parametric or historical. Re-reads the loss distribution; the page loads. */
  setMethod(value: VarMethod): void {
    if (value === this._method()) return;
    this._method.set(value);
    this.queueRecompute();
  }

  /** The horizon the measures are stated over. The page loads. */
  setHoldingPeriod(value: HoldingPeriod): void {
    if (value === this._holdingPeriodDays()) return;
    this._holdingPeriodDays.set(value);
    this.queueRecompute();
  }

  /** The extent of one chart. Nothing is recomputed. */
  setLookback(value: LookbackWindow): void {
    this._lookback.set(value);
  }

  /** Presentation only: both readings are already on every drawdown figure. */
  setDrawdownUnits(value: DrawdownUnits): void {
    this._drawdownUnits.set(value);
  }

  /** The CDaR level. Clamped, because the slider's ends are meaningful values. */
  setCdarAlpha(value: number): void {
    this._cdarAlpha.set(Math.min(CDAR_ALPHA_MAX, Math.max(CDAR_ALPHA_MIN, value)));
  }

  // --- scope ----------------------------------------------------------------

  private readonly _portfolio = signal<string | null>(DEFAULT_PORTFOLIO);
  readonly portfolio = this._portfolio.asReadonly();

  /** Null models the ScopeSwitcher with nothing chosen — the page's empty state. */
  selectPortfolio(name: string | null): void {
    this._portfolio.set(name);
  }

  // --- the current readings -------------------------------------------------

  /**
   * The stamp of the last successful calculation.
   *
   * It advances one minute per completed run rather than reading the wall
   * clock, so the whole fixture — including the alert log's relation to it —
   * stays deterministic. A failed run leaves it where it was, which is what
   * makes the greyed-out readings honestly labelled as old.
   */
  private readonly _asOfMinutes = signal(16 * 60 + 45);

  readonly asOf = computed(() => {
    const minutes = this._asOfMinutes();
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${AS_OF_DATE} ${hh}:${mm} UTC`;
  });

  readonly readings = computed<RiskReadings>(() => {
    const confidence = this._confidence();
    const method = this._method();
    const holdingPeriodDays = this._holdingPeriodDays();
    const base = baseReading(confidence, method, holdingPeriodDays);
    const last = UNDERWATER_SERIES[UNDERWATER_SERIES.length - 1];

    return {
      confidence,
      method,
      holdingPeriodDays,
      var: base.var,
      cvar: base.cvar,
      currentDrawdown: last.drawdown,
      currentDrawdownAbs: last.drawdownAbs,
      daysUnderwater: DRAWDOWN_SUMMARY.daysUnderwater,
      asOf: this.asOf(),
    };
  });

  // --- the VaR / CVaR trend -------------------------------------------------

  /**
   * The whole year, at the current β, method and holding period.
   *
   * Kept separate from the sliced view so that changing the window really is a
   * slice: there is one series, and the selector cannot produce a 3M chart
   * whose points differ from the last quarter of the 1Y one.
   */
  private readonly fullTrend = computed<readonly VarCvarPoint[]>(() => {
    const base = baseReading(this._confidence(), this._method(), this._holdingPeriodDays());
    const ratio = base.cvar / base.var;

    return TREND_DATES.map((date, i) => {
      const u = i / (TREND_OBSERVATIONS - 1);
      const value = base.var * trendShape(u);
      // Never below one: the average of the losses beyond the threshold cannot
      // be smaller than the threshold, whatever the modulation does.
      const pointRatio = Math.max(1, ratio * tailShape(u));
      return { date, var: value, cvar: value * pointRatio };
    });
  });

  readonly varCvarTrend = computed<readonly VarCvarPoint[]>(() => {
    const points = this.fullTrend();
    return points.slice(points.length - TREND_EXTENT[this._lookback()]);
  });

  // --- the drawdown path ----------------------------------------------------

  private readonly _underwaterSeries = signal<readonly UnderwaterPoint[]>(UNDERWATER_SERIES);
  /** `D(x,t)`, with the cumulative return and running maximum it comes from. */
  readonly underwaterSeries = this._underwaterSeries.asReadonly();

  private readonly _drawdownSummary = signal<DrawdownSummary>(DRAWDOWN_SUMMARY);
  readonly drawdownSummary = this._drawdownSummary.asReadonly();

  private readonly _cdarCurve = signal<readonly CdarPoint[]>(CDAR_CURVE);
  /** `Δ_α(x)` sampled across the whole of `[0, 1]`, ends included. */
  readonly cdarCurve = this._cdarCurve.asReadonly();

  /** `Δ_α(x)` at any α, for the slider's readout between sampled steps. */
  cdarAt(alpha: number): number {
    return cdarOf(alpha);
  }

  readonly cdarValue = computed(() => cdarOf(this._cdarAlpha()));

  readonly cdarValueAbs = computed(() => (this.cdarValue() / 100) * CAPITAL_BASE_EUR_M);

  /** The marker the CDaR chart draws on its curve at the selected level. */
  readonly cdarMarker = computed<CdarPoint>(() => ({
    alpha: this._cdarAlpha(),
    value: this.cdarValue(),
    valueAbs: this.cdarValueAbs(),
  }));

  // --- the threshold table --------------------------------------------------

  /**
   * The three measures against their configured limits.
   *
   * The CDaR row reads the same `cdarValue` the chart's readout does, so the
   * table cannot report a level the slider is not on. Nothing here is editable:
   * `ν` and the warning band are configured on the guardrail page.
   */
  readonly thresholds = computed<readonly DrawdownThresholdRow[]>(() => {
    const summary = this._drawdownSummary();
    const alpha = this._cdarAlpha();

    const current: Record<DrawdownMeasureId, number> = {
      maxdd: summary.maxDrawdown,
      avdd: summary.averageDrawdown,
      cdar: this.cdarValue(),
    };

    return DRAWDOWN_MEASURE_ORDER.map((measure) => {
      const limit = DRAWDOWN_LIMITS[measure];
      const value = current[measure];
      const limitPercent = limit.nu * 100;
      const utilisation = (value / limitPercent) * 100;

      return {
        measure,
        label: DRAWDOWN_MEASURE_LABEL[measure],
        symbol:
          measure === 'cdar' ? `Δ_${alpha.toFixed(2)}(x)` : DRAWDOWN_MEASURE_SYMBOL[measure],
        alpha: measure === 'cdar' ? alpha : null,
        current: value,
        currentAbs: (value / 100) * CAPITAL_BASE_EUR_M,
        limit: limitPercent,
        limitAbs: (limitPercent / 100) * CAPITAL_BASE_EUR_M,
        nu: limit.nu,
        utilisation,
        warnAt: limit.warnAt,
        status: statusOf(utilisation, limit.warnAt),
      };
    });
  });

  // --- the alert & breach log -----------------------------------------------

  private readonly _alertLog = signal<readonly LogEntry[]>(ALERT_LOG);
  readonly alertLog = this._alertLog.asReadonly();

  /** What the panel shows before 'View all alerts' opens the full history. */
  readonly recentAlerts = computed(() => this._alertLog().slice(0, RECENT_ALERTS));

  readonly relatedPages = RISK_MONITORING_RELATED_PAGES;

  // --- edge cases -----------------------------------------------------------

  /** Non-overlapping windows of the holding period within the daily sample. */
  readonly effectiveSampleSize = computed(() =>
    Math.floor(HISTORY_OBSERVATIONS / this._holdingPeriodDays()),
  );

  /** How many of those observations fall beyond the β threshold. */
  readonly tailObservations = computed(
    () => (this.effectiveSampleSize() * (100 - this._confidence())) / 100,
  );

  /**
   * True when the historical estimate would be read off too few tail
   * observations to mean anything.
   *
   * It never changes the method. Falling back to the parametric estimate would
   * silently swap the assumption the number rests on while leaving the toolbar
   * claiming the other one; the page says so instead, and the person decides.
   */
  readonly insufficientHistory = computed(
    () => this._method() === 'historical' && this.tailObservations() < MIN_TAIL_OBSERVATIONS,
  );

  readonly insufficientHistoryNote = computed<string | null>(() => {
    if (!this.insufficientHistory()) return null;
    const beyond = Math.floor(this.tailObservations());
    return `Only ${beyond} of ${this.effectiveSampleSize()} non-overlapping ${this._holdingPeriodDays()}-day observations fall beyond the ${this._confidence()}% threshold — fewer than ${MIN_TAIL_OBSERVATIONS}. Switch Method to Parametric for a distributional estimate.`;
  });

  /** How far CVaR sits above VaR, as a share of VaR. */
  readonly tailGap = computed(() => {
    const readings = this.readings();
    return (readings.cvar - readings.var) / readings.var;
  });

  /**
   * True when the two measures nearly coincide.
   *
   * The trend chart is annotated and nothing else happens: neither measure is
   * redefined, and a small gap is a reading about the tail, not a fault.
   */
  readonly tailCoincidence = computed(() => this.tailGap() <= TAIL_COINCIDENCE_THRESHOLD);

  readonly tailCoincidenceNote = computed<string | null>(() => {
    if (!this.tailCoincidence()) return null;
    return `CVaR is only ${(this.tailGap() * 100).toFixed(1)}% above VaR at this reading — the two nearly coincide. Neither measure is redefined; only the gap between them is small.`;
  });

  // --- lifecycle ------------------------------------------------------------

  private readonly _loading = signal(false);

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  /** The second line of the ErrorState: what the numbers below it now are. */
  readonly errorDetail = computed<string | null>(() =>
    this._errorMessage() === null ? null : LOAD_FAILURE_DETAIL,
  );

  /** The readings on screen are the last good ones, not the current ones. */
  readonly stale = computed(() => this._errorMessage() !== null);

  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    if (this._portfolio() === null) return 'empty';
    if (this._errorMessage() !== null) return 'error';
    return 'ready';
  });

  private recomputing: Promise<void> = Promise.resolve();

  /** Resolves once any calculation a toolbar setter started has finished. */
  settled(): Promise<void> {
    return this.recomputing;
  }

  private queueRecompute(): void {
    // A run already in flight will land on the parameters as they now are, so
    // starting a second one would only make the page load twice for one change.
    if (this._loading()) return;
    this.recomputing = this.refresh();
  }

  /**
   * Re-runs the calculation with the toolbar's current parameters.
   *
   * The readings are a function of those parameters, so they never disappear:
   * a failed run leaves the last good numbers on screen and raises the error
   * beside them, which is exactly what the page needs in order to grey them and
   * call them stale rather than show an empty dashboard.
   */
  async refresh(fail = false): Promise<void> {
    if (this._portfolio() === null || this._loading()) return;

    this._loading.set(true);
    this._errorMessage.set(null);

    await delay(LATENCY_MS);

    if (fail) {
      this._errorMessage.set(LOAD_FAILURE_MESSAGE);
      this._loading.set(false);
      return;
    }

    this._asOfMinutes.update((minutes) => minutes + 1);
    this._loading.set(false);
  }

  clearError(): void {
    this._errorMessage.set(null);
  }
}

/**
 * OK, Warning or Breach, from the utilisation alone.
 *
 * A row's badge is never set by hand: it is a function of the number printed
 * beside it, so the table cannot show a green tick against a figure over its
 * limit. The warning band is per measure because a single event and a whole
 * profile are not watched from the same point.
 */
function statusOf(utilisation: number, warnAt: number): ThresholdStatus {
  if (utilisation >= 100) return 'breach';
  if (utilisation >= warnAt * 100) return 'warning';
  return 'ok';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
