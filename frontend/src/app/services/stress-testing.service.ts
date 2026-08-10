import { Injectable, computed, signal, type WritableSignal } from '@angular/core';

import {
  EVALUATION_FAILED_DETAIL,
  EVALUATION_FAILED_MESSAGE,
  IMPACT_MEASURE_UNIT,
  INFEASIBLE_DETAIL,
  INFEASIBLE_MESSAGE,
  KEY_FACTOR_SHARE,
  K_DEFAULT,
  K_MAX,
  K_MIN,
  REVERSE_FAILED_DETAIL,
  REVERSE_FAILED_MESSAGE,
  REVERSE_MAX_MAHA,
  REVERSE_OUTCOME_SHORT_LABEL,
  REVERSE_TARGET_ABOVE_CURRENT_DETAIL,
  REVERSE_TARGET_ABOVE_CURRENT_MESSAGE,
  REVERSE_UNREACHABLE_DETAIL,
  REVERSE_UNREACHABLE_MESSAGE,
  SEARCH_FAILED_DETAIL,
  SEARCH_FAILED_MESSAGE,
  type FactorInteraction,
  type FactorUnit,
  type ImpactMeasureId,
  type ImpliedFactorMove,
  type LibraryFilter,
  type LossContribution,
  type ReverseOutcomeId,
  type ReverseResult,
  type RiskFactorRow,
  type SavedFactorValue,
  type SavedScenario,
  type ScenarioFactorValue,
  type ScenarioKind,
  type ScenarioResult,
  type SeverityBar,
  type StressAction,
  type StressError,
  type StressMode,
} from '../models/stress-testing.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 700;

const AS_OF_DATE = '2026-07-31';

// ---------------------------------------------------------------------------
// The systematic risk factors
// ---------------------------------------------------------------------------

/**
 * One systematic risk factor of the book.
 *
 * `mean` and `sigma` are the marginal of the factor's **shock** — a one-month
 * move — in the unit the shock is quoted in. `lastObservation` is the last
 * realised reading, which for the two rates is a level and for equity and FX a
 * return; the two units are therefore kept apart.
 */
interface FactorSeed {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly lastObservation: number;
  readonly lastObservationUnit: FactorUnit;
  readonly unit: FactorUnit;
  /** `μ_i` — the expected one-month move. */
  readonly mean: number;
  /** `σ_i` — its standard deviation. */
  readonly sigma: number;
  readonly suggestedShock: number;
}

/**
 * The four factors, in the order the wireframe's table lists them.
 *
 * The equity volatility is not a free choice: 3.4317% a month (≈11.9%
 * annualised) is the number that puts the source's hand-picked scenario — a
 * 18.0% fall in the equity market — at exactly the 5.42σ event it describes.
 * Everything the page says about that scenario follows from this one constant
 * rather than from a figure typed beside it.
 */
const FACTORS: readonly FactorSeed[] = [
  {
    id: 'equity',
    name: 'Equity market',
    description: 'Developed-market equity index, one-month total return',
    lastObservation: 0.3,
    lastObservationUnit: '%',
    unit: '%',
    mean: 0.6,
    sigma: 3.4317,
    suggestedShock: -18,
  },
  {
    id: 'rate-10y',
    name: 'Rate 10Y (dom.)',
    description: 'Domestic 10-year government yield, one-month change',
    lastObservation: 3.1,
    lastObservationUnit: '%',
    unit: 'pp',
    mean: 0,
    sigma: 0.25,
    suggestedShock: 0.5,
  },
  {
    id: 'credit-spread',
    name: 'Credit spread',
    description: 'Investment-grade spread over governments, one-month change',
    lastObservation: 142,
    lastObservationUnit: 'bp',
    unit: 'bp',
    mean: 0,
    sigma: 30,
    suggestedShock: 75,
  },
  {
    id: 'fx-eurusd',
    name: 'FX EUR/USD',
    description: 'EUR/USD spot, one-month return',
    lastObservation: -0.4,
    lastObservationUnit: '%',
    unit: '%',
    mean: 0,
    sigma: 2.2,
    suggestedShock: 9,
  },
];

const N = FACTORS.length;

/**
 * The correlation matrix of the standardised factors.
 *
 * Equity falls with widening credit spreads (−0.55) and rises with yields
 * (+0.15); the dollar is bid when spreads widen (+0.20). Equity and EUR/USD are
 * all but uncorrelated at +0.03 — the pair whose correlation is famously
 * unstable — which is what makes an equity crash leave the FX leg of this book
 * nearly untouched, and therefore what makes the hand-picked scenario so much
 * milder than the systematic one at a *lower* plausibility cost.
 */
const CORRELATION: readonly (readonly number[])[] = [
  [1, 0.15, -0.55, 0.03],
  [0.15, 1, -0.25, 0.1],
  [-0.55, -0.25, 1, 0.2],
  [0.03, 0.1, 0.2, 1],
];

/**
 * `∂CEP/∂z_i` — what one standard deviation of each factor is worth to the
 * book, in points of the regulatory measure.
 *
 * FX dominates: this is a foreign-currency lending book, so the exchange rate
 * carries most of the damage and the equity market a fifth of it. The four
 * numbers were solved so that the maximum-loss contributions of the worst case
 * come out at the documented 68.4 / 17.9 / 4.2 / 1.5 — they are the input, and
 * the contributions the chart draws are the output.
 */
const SENSITIVITY: readonly number[] = [0.451927, -0.156913, -0.115944, -0.829704];

/**
 * The curvature of the loss in the size of the move.
 *
 * `Loss(r) = κ · ℓ(r)^p` with `ℓ(r) = −Σ s_i z_i` the additive part. The
 * exponent is the whole content of the interaction:
 *
 * - `p = 1` — the CEP is additive, every cross derivative vanishes and the loss
 *   contributions sum to exactly 100%;
 * - `p > 1` — the loss of a joint move exceeds the sum of the losses of the
 *   individual moves, so `Σ MLC < 100%` and the interaction is **negative**;
 * - `p < 1` — the mirror image, and `Σ MLC > 100%`.
 *
 * At 1.1063 the four contributions sum to 92.0%, which is the reading the page
 * has to explain in words. Nothing in the code asserts that sum: it is
 * `Σ w_i^p` for shares `w_i` that add to one, which is below one for every
 * `p > 1`.
 */
const LOSS_CURVATURE = 1.1062866;

/** The radius the loss scale is calibrated at. */
const REFERENCE_K = 5;

/** `Maximum Loss` at `REFERENCE_K` under the regulatory measure, in points. */
const MAX_LOSS_AT_REFERENCE_K = 6.6;

/**
 * How each impact measure reads the same stress.
 *
 * `expectedCep` is `CEP(μ)` in that measure's unit and `lossScale` converts the
 * regulatory loss into it. The two are independent on purpose: a measure is not
 * a change of units, and a result computed against risk-weighted assets cannot
 * be relabelled in `% NAV` without being recomputed. That is why moving this
 * selector marks every result stale instead of rescaling it.
 */
const MEASURE_CALIBRATION: Record<
  ImpactMeasureId,
  { readonly expectedCep: number; readonly lossScale: number }
> = {
  'asset-values': { expectedCep: 2.6, lossScale: 0.62 },
  'accounting-pnl': { expectedCep: 3.1, lossScale: 0.48 },
  'economic-pnl': { expectedCep: 2.9, lossScale: 0.71 },
  'regulatory-capital': { expectedCep: 4.2, lossScale: 1 },
  'economic-capital': { expectedCep: 5.4, lossScale: 1.36 },
  'liquidity-gap': { expectedCep: 6.8, lossScale: 1.9 },
};

/**
 * Where each reverse outcome's metric stands today, and the level the page
 * offers as a starting point.
 *
 * The capital ratio is 13.3% against a regulatory minimum of 8.0%, so a breach
 * costs 5.3 points of loss — which the loss curve reaches at Maha 4.10.
 * Insolvency costs the whole 21.4-point capital base and is out of reach of any
 * radius this page will argue from, which is the honest answer to that question
 * rather than an error.
 */
const REVERSE_OUTCOME_LEVELS: Record<
  ReverseOutcomeId,
  { readonly currentLevel: number; readonly suggestedTarget: number }
> = {
  'capital-ratio-breach': { currentLevel: 13.3, suggestedTarget: 8 },
  illiquidity: { currentLevel: 12.5, suggestedTarget: 0 },
  insolvency: { currentLevel: 21.4, suggestedTarget: 0 },
};

// ---------------------------------------------------------------------------
// Linear algebra — small, dense and deterministic
// ---------------------------------------------------------------------------

type Matrix = readonly (readonly number[])[];

function dot(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

function matVec(m: Matrix, v: readonly number[]): number[] {
  return m.map((row) => dot(row, v));
}

/** Gauss-Jordan with partial pivoting. The matrices here are 1×1 to 4×4. */
function invert(m: Matrix): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    }
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function submatrix(m: Matrix, rows: readonly number[], cols: readonly number[]): number[][] {
  return rows.map((i) => cols.map((j) => m[i][j]));
}

/** `sign(x)·|x|^p` — the odd extension, so a favourable move is a gain. */
function signedPower(x: number, p: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), p);
}

// ---------------------------------------------------------------------------
// The factor model
// ---------------------------------------------------------------------------

/** `Cov⁻¹` in standardised coordinates — the quadratic form of `Maha`. */
const PRECISION = invert(CORRELATION);

/** `Cov · s`, up to the standardisation. The worst move runs along `−R s`. */
const CORRELATED_SENSITIVITY = matVec(CORRELATION, SENSITIVITY);

/** `s' R s` — the variance of the additive loss, in measure points squared. */
const LOSS_VARIANCE = dot(SENSITIVITY, CORRELATED_SENSITIVITY);

const LOSS_VOLATILITY = Math.sqrt(LOSS_VARIANCE);

/**
 * `κ`, solved rather than typed: the scale that makes the maximum loss at the
 * default radius exactly the 6.6 points of the worked example.
 */
const LOSS_SCALE =
  MAX_LOSS_AT_REFERENCE_K / Math.pow(REFERENCE_K * LOSS_VOLATILITY, LOSS_CURVATURE);

/** `z_i = (r_i − μ_i)/σ_i`. */
function standardise(value: number, index: number): number {
  return (value - FACTORS[index].mean) / FACTORS[index].sigma;
}

/** The inverse map, back into the factor's own unit. */
function factorValue(z: number, index: number): number {
  return FACTORS[index].mean + FACTORS[index].sigma * z;
}

/** `Maha(r) = √(z' Cov⁻¹ z)`, the plausibility of a whole scenario. */
function maha(z: readonly number[]): number {
  return Math.sqrt(Math.max(0, dot(z, matVec(PRECISION, z))));
}

/** `ℓ(r) = −Σ s_i z_i` — the additive part of the loss, in measure points. */
function additiveLoss(z: readonly number[]): number {
  return -dot(SENSITIVITY, z);
}

/**
 * `CEP(μ) − CEP(r)` under one impact measure: positive when the scenario hurts.
 *
 * The whole loss is a power of the additive part, which is what makes the
 * interaction between factors real rather than decorative — see
 * `LOSS_CURVATURE`.
 */
function damage(z: readonly number[], measure: ImpactMeasureId): number {
  return (
    MEASURE_CALIBRATION[measure].lossScale *
    LOSS_SCALE *
    signedPower(additiveLoss(z), LOSS_CURVATURE)
  );
}

/** A scenario in which one factor alone moves, for the loss contributions. */
function isolate(z: readonly number[], index: number): number[] {
  const only = new Array<number>(N).fill(0);
  only[index] = z[index];
  return only;
}

/** The fixed part of a partial scenario: which factors, and at what value. */
interface FixedShock {
  readonly index: number;
  readonly z: number;
}

/**
 * The completion of a partial scenario: unfixed factors at `E[z_U | z_S]`.
 *
 * This is the treatment the method fixes rather than offers — among all
 * completions it is the one of highest plausibility, and its Mahalanobis
 * distance equals that of the fixed sub-vector alone. Moving any unfixed factor
 * off this value can only push the scenario further out.
 */
function conditionalCompletion(fixed: readonly FixedShock[]): number[] {
  const z = new Array<number>(N).fill(0);
  if (fixed.length === 0) return z;

  const fixedIndex = fixed.map((f) => f.index);
  const free = indicesExcept(fixedIndex);
  for (const f of fixed) z[f.index] = f.z;
  if (free.length === 0) return z;

  // E[z_U | z_S] = −A_UU⁻¹ A_US z_S, with A the precision matrix.
  const auu = invert(submatrix(PRECISION, free, free));
  const aus = submatrix(PRECISION, free, fixedIndex);
  const conditional = matVec(auu, matVec(aus, fixed.map((f) => f.z)));
  free.forEach((index, position) => (z[index] = -conditional[position]));
  return z;
}

function indicesExcept(taken: readonly number[]): number[] {
  const free: number[] = [];
  for (let i = 0; i < N; i++) if (!taken.includes(i)) free.push(i);
  return free;
}

/**
 * `argmin CEP(r)` over `{ r ∈ Ell_k : r_S = fixed }` — the worst-case search.
 *
 * With the fixed factors held at their values, the admissible set for the rest
 * is the ellipsoid of radius `√(k² − Maha(r_C)²)` centred on the conditional
 * expectation, so the search has a closed form and the answer lands **exactly**
 * on the boundary: `Maha(r_WC) = k` by construction, whatever the fixed set.
 *
 * `null` is not a failure of the code. It is the answer when the fixed factors
 * are already less plausible than the radius admits: the admissible set is
 * empty and there is no point to return.
 */
function worstCaseScenario(fixed: readonly FixedShock[], k: number): number[] | null {
  const centre = conditionalCompletion(fixed);
  const spent = maha(centre);
  if (spent > k + 1e-12) return null;

  const free = indicesExcept(fixed.map((f) => f.index));
  if (free.length === 0) return centre;

  const auu = invert(submatrix(PRECISION, free, free));
  const direction = matVec(
    auu,
    free.map((i) => -SENSITIVITY[i]),
  );
  const scale = Math.sqrt(
    Math.max(
      0,
      dot(
        free.map((i) => -SENSITIVITY[i]),
        direction,
      ),
    ),
  );
  const z = [...centre];
  if (scale === 0) return z;

  const budget = Math.sqrt(Math.max(0, k * k - spent * spent));
  free.forEach((index, position) => (z[index] += (budget * direction[position]) / scale));
  return z;
}

/** The radius at which the unconstrained maximum loss reaches `target`. */
function radiusForLoss(target: number, measure: ImpactMeasureId): number {
  const scale = MEASURE_CALIBRATION[measure].lossScale;
  return Math.pow(target / (LOSS_SCALE * scale), 1 / LOSS_CURVATURE) / LOSS_VOLATILITY;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SHOCK_DECIMALS: Record<FactorUnit, number> = { '%': 1, bp: 0, pp: 2 };

function formatShock(value: number, unit: FactorUnit): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(SHOCK_DECIMALS[unit])}${unit}`;
}

function stamp(minutes: number): string {
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${AS_OF_DATE} ${hh}:${mm} UTC`;
}

/** The clock the deterministic stamps advance on, in minutes past midnight. */
const START_MINUTES = 9 * 60;
const MINUTES_PER_RUN = 7;

// ---------------------------------------------------------------------------
// Scenario builders — module level, so the seeded library is built by exactly
// the code that will rebuild those rows when they are loaded
// ---------------------------------------------------------------------------

interface ScenarioInput {
  readonly kind: ScenarioKind;
  readonly label: string;
  readonly z: readonly number[];
  readonly fixed: readonly number[];
  readonly measure: ImpactMeasureId;
  readonly k: number;
  readonly computedAt: string;
}

function buildResult(input: ScenarioInput): ScenarioResult {
  const { z, measure } = input;
  const cost = damage(z, measure);
  const distance = maha(z);
  const shares = z.map((_, i) => (cost === 0 ? 0 : damage(isolate(z, i), measure) / cost));

  const factors: readonly ScenarioFactorValue[] = FACTORS.map((factor, i) => ({
    factorId: factor.id,
    name: factor.name,
    value: factorValue(z[i], i),
    unit: factor.unit,
    fixed: input.fixed.includes(i),
    conditional: !input.fixed.includes(i),
    driver: Math.abs(shares[i]) >= KEY_FACTOR_SHARE,
  }));

  return {
    kind: input.kind,
    label: input.label,
    maha: distance,
    cep: MEASURE_CALIBRATION[measure].expectedCep - cost,
    loss: -cost,
    measure,
    unit: IMPACT_MEASURE_UNIT[measure],
    k: input.k,
    onBoundary: Math.abs(distance - input.k) < 1e-9,
    withinEllipsoid: distance <= input.k + 1e-9,
    factors,
    computedAt: input.computedAt,
    stale: false,
  };
}

/** `LC(i, r_WC)` for every factor, largest first. Never normalised. */
function buildContributions(
  z: readonly number[],
  measure: ImpactMeasureId,
): readonly LossContribution[] {
  const cost = damage(z, measure);
  if (cost === 0) return [];
  return FACTORS.map((factor, i) => {
    const individualLoss = damage(isolate(z, i), measure);
    const share = individualLoss / cost;
    return {
      factorId: factor.id,
      name: factor.name,
      value: factorValue(z[i], i),
      unit: factor.unit,
      individualLoss,
      share,
      driver: Math.abs(share) >= KEY_FACTOR_SHARE,
    };
  }).sort((a, b) => b.share - a.share);
}

/** `'Equity market -18.0%, FX EUR/USD +9.0%'` — the pinned part of a scenario. */
function shockSummary(fixed: readonly FixedShock[]): string {
  return fixed
    .map((f) => `${FACTORS[f.index].name} ${formatShock(factorValue(f.z, f.index), FACTORS[f.index].unit)}`)
    .join(', ');
}

function manualLabel(fixed: readonly FixedShock[]): string {
  const summary = shockSummary(fixed);
  return summary === '' ? 'Manual scenario' : `Manual scenario — ${summary}`;
}

/** The library name of a manual row, generated the same way wherever it is saved. */
function manualRowName(fixed: readonly FixedShock[]): string {
  const summary = shockSummary(fixed);
  return summary === '' ? 'Manual scenario' : `${summary} (manual)`;
}

function buildManual(
  fixed: readonly FixedShock[],
  measure: ImpactMeasureId,
  k: number,
  computedAt: string,
): ScenarioResult {
  return buildResult({
    kind: 'manual',
    label: manualLabel(fixed),
    z: conditionalCompletion(fixed),
    fixed: fixed.map((f) => f.index),
    measure,
    k,
    computedAt,
  });
}

function buildWorstCase(
  z: readonly number[],
  fixed: readonly FixedShock[],
  measure: ImpactMeasureId,
  k: number,
  computedAt: string,
): ScenarioResult {
  return buildResult({
    kind: 'worst-case',
    label: `Worst-case scenario — Ell_k, k = ${k.toFixed(2)}`,
    z,
    fixed: fixed.map((f) => f.index),
    measure,
    k,
    computedAt,
  });
}

function buildExpected(measure: ImpactMeasureId, k: number, computedAt: string): ScenarioResult {
  return buildResult({
    kind: 'expected',
    label: 'Expected (μ)',
    z: new Array<number>(N).fill(0),
    fixed: [],
    measure,
    k,
    computedAt,
  });
}

function toFixedShocks(values: readonly SavedFactorValue[]): FixedShock[] {
  return values.flatMap((value) => {
    const index = FACTORS.findIndex((factor) => factor.id === value.factorId);
    return index === -1 ? [] : [{ index, z: standardise(value.value, index) }];
  });
}

// ---------------------------------------------------------------------------
// The seeded library
// ---------------------------------------------------------------------------
//
// Every row is produced by the builders above, at the parameters the row
// itself records. A row therefore cannot show a figure that pressing `Load`
// would fail to reproduce.

const SEED_EQUITY_SHOCK: readonly SavedFactorValue[] = [{ factorId: 'equity', value: -18 }];

function seedManualRow(): SavedScenario {
  const fixed = toFixedShocks(SEED_EQUITY_SHOCK);
  const result = buildManual(fixed, 'regulatory-capital', K_DEFAULT, stamp(START_MINUTES));
  return {
    id: 'saved-1',
    name: manualRowName(fixed),
    kind: 'manual',
    k: K_DEFAULT,
    maha: result.maha,
    measure: result.measure,
    unit: result.unit,
    cep: result.cep,
    loss: result.loss,
    runAt: '2026-07-29',
    fixed: SEED_EQUITY_SHOCK,
    reverse: null,
  };
}

function seedWorstCaseRow(id: string, k: number, runAt: string): SavedScenario {
  const z = worstCaseScenario([], k) ?? new Array<number>(N).fill(0);
  const result = buildWorstCase(z, [], 'regulatory-capital', k, stamp(START_MINUTES));
  return {
    id,
    name: `WC @k=${k.toFixed(2)}`,
    kind: 'worst-case',
    k,
    maha: result.maha,
    measure: result.measure,
    unit: result.unit,
    cep: result.cep,
    loss: result.loss,
    runAt,
    fixed: [],
    reverse: null,
  };
}

function seedReverseRow(): SavedScenario {
  const outcome: ReverseOutcomeId = 'capital-ratio-breach';
  const levels = REVERSE_OUTCOME_LEVELS[outcome];
  const minimalMaha = radiusForLoss(
    levels.currentLevel - levels.suggestedTarget,
    'regulatory-capital',
  );
  return {
    id: 'saved-4',
    name: `Reverse: ${REVERSE_OUTCOME_SHORT_LABEL[outcome]}`,
    kind: 'reverse',
    k: minimalMaha,
    maha: minimalMaha,
    measure: 'regulatory-capital',
    unit: IMPACT_MEASURE_UNIT['regulatory-capital'],
    cep: null,
    loss: null,
    runAt: '2026-07-31',
    fixed: [],
    reverse: { outcome, targetLevel: levels.suggestedTarget },
  };
}

const SEED_LIBRARY: readonly SavedScenario[] = [
  seedManualRow(),
  seedWorstCaseRow('saved-2', 5, '2026-07-30'),
  seedWorstCaseRow('saved-3', 6, '2026-07-30'),
  seedReverseRow(),
];

// ---------------------------------------------------------------------------

/** What the page holds for one factor: whether it is pinned, and at what. */
interface FactorState {
  readonly fixed: boolean;
  readonly value: number | null;
}

const INITIAL_FACTOR_STATE: readonly FactorState[] = FACTORS.map(() => ({
  fixed: false,
  value: null,
}));

/**
 * Two searches over one set of parameters: forward, which fixes the
 * plausibility radius and looks for the worst loss inside it, and reverse,
 * which fixes the outcome and looks for the least implausible scenario that
 * produces it.
 *
 * The rule the whole page turns on lives in `setImpactMeasure` and `setK`:
 * moving either one marks every result on screen **stale** and recomputes
 * nothing. A result is a statement about a particular radius and a particular
 * impact measure, both of which it carries; silently rescaling it under a new
 * radius, or relabelling a figure computed against risk-weighted assets as a
 * share of NAV, would print a number nobody computed. So the figures stay
 * exactly as they were, badged, until the person re-runs the search.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the loading and error states in
 * the page spec actually reachable.
 */
@Injectable({ providedIn: 'root' })
export class StressTestingService {
  // --- toolbar parameters ---------------------------------------------------

  private readonly _impactMeasure = signal<ImpactMeasureId>('regulatory-capital');
  readonly impactMeasure = this._impactMeasure.asReadonly();

  private readonly _k = signal(K_DEFAULT);
  /** `k`, the Mahalanobis radius that defines `Ell_k`. */
  readonly k = this._k.asReadonly();

  private readonly _mode = signal<StressMode>('forward');
  readonly mode = this._mode.asReadonly();

  /** The unit every CEP and loss on screen should be read in, once re-run. */
  readonly measureUnit = computed(() => IMPACT_MEASURE_UNIT[this._impactMeasure()]);

  /** `Ell_k = { r : Maha(r) <= 5.00 }`, with the radius in force. */
  readonly ellipsoidLabel = computed(
    () => `Ell_k = { r : Maha(r) <= ${this._k().toFixed(2)} }`,
  );

  /**
   * The impact measure the whole page is read against.
   *
   * Every displayed result goes stale and **nothing is recomputed**: the
   * figures were produced against another measure and are not convertible into
   * this one by arithmetic.
   */
  setImpactMeasure(measure: ImpactMeasureId): void {
    if (measure === this._impactMeasure()) return;
    this._impactMeasure.set(measure);
    this.markAllStale();
  }

  /**
   * The plausibility radius. Clamped to the slider's range; a change marks
   * every result stale without re-running any search.
   */
  setK(value: number): void {
    if (!Number.isFinite(value)) return;
    const next = Math.round(Math.min(K_MAX, Math.max(K_MIN, value)) * 100) / 100;
    if (next === this._k()) return;
    this._k.set(next);
    this.markAllStale();
  }

  setMode(mode: StressMode): void {
    this._mode.set(mode);
  }

  // --- the systematic risk factors ------------------------------------------

  private readonly _factorState = signal<readonly FactorState[]>(INITIAL_FACTOR_STATE);

  /**
   * The partial scenario as it stands: the pinned factors at their values, the
   * rest at their conditional expected value given them.
   */
  readonly factors = computed<readonly RiskFactorRow[]>(() => {
    const state = this._factorState();
    const completion = conditionalCompletion(this.activeShocks());
    return FACTORS.map((factor, i) => {
      const conditionalValue = factorValue(completion[i], i);
      const fixed = state[i].fixed;
      const scenarioValue = state[i].value;
      return {
        id: factor.id,
        name: factor.name,
        description: factor.description,
        lastObservation: factor.lastObservation,
        lastObservationUnit: factor.lastObservationUnit,
        unit: factor.unit,
        fixed,
        scenarioValue: fixed ? scenarioValue : null,
        conditionalValue,
        effectiveValue: fixed && scenarioValue !== null ? scenarioValue : conditionalValue,
        editable: fixed,
        suggestedShock: factor.suggestedShock,
      };
    });
  });

  /** Only the factors that actually constrain the scenario. */
  readonly fixedFactors = computed(() =>
    this.factors().filter((row) => row.fixed && row.scenarioValue !== null),
  );

  /**
   * `Maha` of the partial scenario the fixed factors describe.
   *
   * Zero when nothing is fixed. This is the number the worst-case search has to
   * fit inside `k`, so it is also the page's feasibility reading.
   */
  readonly fixedMaha = computed(() => maha(conditionalCompletion(this.activeShocks())));

  /** False when the fixed factors already sit outside `Ell_k`. */
  readonly partialScenarioFeasible = computed(() => this.fixedMaha() <= this._k() + 1e-12);

  /**
   * Pins a factor, or releases it.
   *
   * Releasing drops the value with it: a shock nobody can see is a shock that
   * would re-apply itself the next time the box is ticked. Either way the
   * manual result on screen was computed against a different partial scenario,
   * so it is marked stale — and not recomputed.
   */
  setFactorFixed(id: string, fixed: boolean): void {
    const index = FACTORS.findIndex((factor) => factor.id === id);
    if (index === -1 || this._factorState()[index].fixed === fixed) return;
    this._factorState.update((state) =>
      state.map((entry, i) =>
        i === index ? { fixed, value: fixed ? entry.value : null } : entry,
      ),
    );
    this.markManualStale();
  }

  /**
   * Writes the shock of a pinned factor.
   *
   * A factor that is not pinned cannot be given one: it is held at its
   * conditional expected value, which is a consequence of the method and not a
   * field the page may overwrite.
   */
  setFactorValue(id: string, value: number | null): void {
    const index = FACTORS.findIndex((factor) => factor.id === id);
    if (index === -1) return;
    const entry = this._factorState()[index];
    if (!entry.fixed || entry.value === value) return;
    if (value !== null && !Number.isFinite(value)) return;
    this._factorState.update((state) =>
      state.map((current, i) => (i === index ? { ...current, value } : current)),
    );
    this.markManualStale();
  }

  private activeShocks(): FixedShock[] {
    const state = this._factorState();
    const shocks: FixedShock[] = [];
    state.forEach((entry, index) => {
      if (entry.fixed && entry.value !== null) {
        shocks.push({ index, z: standardise(entry.value, index) });
      }
    });
    return shocks;
  }

  // --- results --------------------------------------------------------------

  private readonly _clockMinutes = signal(START_MINUTES);

  private readonly _expectedResult = signal<ScenarioResult>(
    buildExpected('regulatory-capital', K_DEFAULT, stamp(START_MINUTES)),
  );
  /** `CEP(μ)` — the reading every loss on the page is measured against. */
  readonly expectedResult = this._expectedResult.asReadonly();

  private readonly _manualResult = signal<ScenarioResult | null>(null);
  readonly manualResult = this._manualResult.asReadonly();

  private readonly _worstCaseResult = signal<ScenarioResult | null>(null);
  readonly worstCaseResult = this._worstCaseResult.asReadonly();

  private readonly _contributions = signal<readonly LossContribution[]>([]);
  /** `MLC(i)` for the worst case on screen, largest first. */
  readonly maximumLossContributions = this._contributions.asReadonly();

  private readonly _reverseResult = signal<ReverseResult | null>(null);
  readonly reverseResult = this._reverseResult.asReadonly();

  /** True when anything on screen was computed at parameters that have moved. */
  readonly anyStale = computed(
    () =>
      this._expectedResult().stale ||
      (this._manualResult()?.stale ?? false) ||
      (this._worstCaseResult()?.stale ?? false) ||
      (this._reverseResult()?.stale ?? false),
  );

  /** The three bars of the severity comparison, all at the same k. */
  readonly severityBars = computed<readonly SeverityBar[]>(() => {
    const bars: SeverityBar[] = [
      barOf(this._expectedResult(), null),
      ...toBar(this._manualResult(), null),
      ...toBar(this._worstCaseResult(), 'Maximum Loss'),
    ];
    return bars;
  });

  /** `Σ MLC`. Reported as computed — never rescaled to one. */
  readonly contributionSum = computed(() =>
    this._contributions().reduce((total, row) => total + row.share, 0),
  );

  /** `1 − Σ MLC`: what the individual moves do not explain. */
  readonly contributionResidual = computed(() => 1 - this.contributionSum());

  /**
   * The sign of the interaction between factors, read off the residual.
   *
   * Below 100% the joint move costs more than the individual moves add up to,
   * which is the reading the page has to put into words rather than leave to
   * the length of a bar.
   */
  readonly contributionInteraction = computed<FactorInteraction>(() => {
    if (this._contributions().length === 0) return 'none';
    const residual = this.contributionResidual();
    if (Math.abs(residual) < 1e-9) return 'none';
    return residual > 0 ? 'negative' : 'positive';
  });

  // --- the reverse stress test ----------------------------------------------

  private readonly _reverseOutcome = signal<ReverseOutcomeId>('capital-ratio-breach');
  readonly reverseOutcome = this._reverseOutcome.asReadonly();

  private readonly _reverseTargetLevel = signal<number | null>(null);
  /** Null is an empty field — the search cannot run without a level. */
  readonly reverseTargetLevel = this._reverseTargetLevel.asReadonly();

  /** Where the selected outcome's metric stands today, in the measure's unit. */
  readonly reverseCurrentLevel = computed(
    () => REVERSE_OUTCOME_LEVELS[this._reverseOutcome()].currentLevel,
  );

  /** Placeholder for the target field — never written into it. */
  readonly reverseSuggestedTarget = computed(
    () => REVERSE_OUTCOME_LEVELS[this._reverseOutcome()].suggestedTarget,
  );

  setReverseOutcome(outcome: ReverseOutcomeId): void {
    this._reverseOutcome.set(outcome);
  }

  setReverseTargetLevel(level: number | null): void {
    if (level !== null && !Number.isFinite(level)) return;
    this._reverseTargetLevel.set(level);
  }

  // --- the scenario library -------------------------------------------------

  private readonly _library = signal<readonly SavedScenario[]>(SEED_LIBRARY);
  readonly library = this._library.asReadonly();

  private readonly _libraryFilter = signal<LibraryFilter>('all');
  readonly libraryFilter = this._libraryFilter.asReadonly();

  readonly visibleLibrary = computed(() => {
    const filter = this._libraryFilter();
    const rows = this._library();
    return filter === 'all' ? rows : rows.filter((row) => row.kind === filter);
  });

  readonly libraryCount = computed(() => this._library().length);

  setLibraryFilter(filter: LibraryFilter): void {
    this._libraryFilter.set(filter);
  }

  private savedCounter = SEED_LIBRARY.length;

  private readonly _lastResultKind = signal<Exclude<ScenarioKind, 'expected'> | null>(null);

  /** Which result `Save scenario` would store if pressed now. */
  readonly savableKind = this._lastResultKind.asReadonly();

  readonly canSave = computed(() => this.resultFor(this._lastResultKind()) !== null);

  /**
   * Adds a result to the library, with the parameters it was computed at.
   *
   * The row records `k` and the impact measure because a scenario means nothing
   * without them — that is also what lets `loadScenario` reproduce the figures
   * exactly rather than approximately.
   */
  saveScenario(kind?: Exclude<ScenarioKind, 'expected'>): string | null {
    const target = kind ?? this._lastResultKind();
    if (target === null) return null;
    const row = this.buildSavedRow(target);
    if (row === null) return null;
    this._library.update((rows) => [...rows, row]);
    return row.id;
  }

  /**
   * Restores a saved scenario.
   *
   * The parameters go back first and the figures are then derived again from
   * them, so a loaded row is a live result rather than a snapshot: it agrees
   * with what re-running the search would produce, because it *is* that. Any
   * other result on screen was computed at the parameters this row has just
   * displaced, so it is marked stale.
   */
  loadScenario(id: string): boolean {
    const row = this._library().find((entry) => entry.id === id);
    if (!row) return false;

    this._impactMeasure.set(row.measure);
    this._k.set(row.k);
    const at = this.tick();
    this._expectedResult.set(buildExpected(row.measure, row.k, at));

    const fixed = toFixedShocks(row.fixed);
    this._factorState.set(
      FACTORS.map((factor) => {
        const saved = row.fixed.find((entry) => entry.factorId === factor.id);
        return saved ? { fixed: true, value: saved.value } : { fixed: false, value: null };
      }),
    );

    if (row.kind === 'manual') {
      this._mode.set('forward');
      this._manualResult.set(buildManual(fixed, row.measure, row.k, at));
      this.markStale(this._worstCaseResult);
      this.markStale(this._reverseResult);
    } else if (row.kind === 'worst-case') {
      this._mode.set('forward');
      const z = worstCaseScenario(fixed, row.k);
      if (z !== null) {
        this._worstCaseResult.set(buildWorstCase(z, fixed, row.measure, row.k, at));
        this._contributions.set(buildContributions(z, row.measure));
      }
      this.markStale(this._manualResult);
      this.markStale(this._reverseResult);
    } else {
      this._mode.set('reverse');
      if (row.reverse) {
        this._reverseOutcome.set(row.reverse.outcome);
        this._reverseTargetLevel.set(row.reverse.targetLevel);
        this._reverseResult.set(
          this.buildReverse(row.reverse.outcome, row.reverse.targetLevel, row.measure, row.k, at),
        );
      }
      this.markStale(this._manualResult);
      this.markStale(this._worstCaseResult);
    }

    this._lastResultKind.set(row.kind);
    this._error.set(null);
    return true;
  }

  /** Removes exactly one row. The rest of the library is untouched. */
  deleteScenario(id: string): boolean {
    const before = this._library();
    if (!before.some((row) => row.id === id)) return false;
    this._library.set(before.filter((row) => row.id !== id));
    return true;
  }

  // --- actions --------------------------------------------------------------

  private readonly _pendingAction = signal<StressAction | null>(null);
  /** Which button carries the progress indicator, and which card the skeleton. */
  readonly pendingAction = this._pendingAction.asReadonly();

  readonly loading = computed(() => this._pendingAction() !== null);

  private readonly _error = signal<StressError | null>(null);
  readonly error = this._error.asReadonly();

  readonly state = computed<PageState>(() => {
    if (this._pendingAction() !== null) return 'loading';
    if (this._error() !== null) return 'error';
    const populated =
      this._manualResult() !== null ||
      this._worstCaseResult() !== null ||
      this._reverseResult() !== null;
    return populated ? 'ready' : 'empty';
  });

  /** At least one factor pinned to a value the scenario can be evaluated at. */
  readonly canEvaluateManual = computed(() => this.fixedFactors().length > 0);

  readonly canRunWorstCase = computed(() => this._k() > 0);

  readonly canSearchReverse = computed(() => this._reverseTargetLevel() !== null);

  /**
   * Evaluates the partial scenario the factor table describes.
   *
   * A hand-picked scenario is allowed to sit outside `Ell_k` — the wireframe's
   * own example does, at 5.42 against a radius of 5.00 — so nothing here checks
   * the radius. The result records `withinEllipsoid` and the page says so.
   */
  async evaluateManual(fail = false): Promise<void> {
    if (this._pendingAction() !== null || !this.canEvaluateManual()) return;
    const fixed = this.activeShocks();
    const measure = this._impactMeasure();
    const k = this._k();

    this._pendingAction.set('manual');
    this._error.set(null);
    await delay(LATENCY_MS);
    this._pendingAction.set(null);

    if (fail) {
      this._error.set({
        section: 'manual',
        message: EVALUATION_FAILED_MESSAGE,
        detail: EVALUATION_FAILED_DETAIL,
      });
      return;
    }

    const at = this.tick();
    this._expectedResult.set(buildExpected(measure, k, at));
    this._manualResult.set(buildManual(fixed, measure, k, at));
    this._lastResultKind.set('manual');
  }

  /**
   * Searches `Ell_k` for the scenario of lowest conditional expected profit.
   *
   * The fixed factors constrain the search. When they are already less
   * plausible than `k` allows there is no admissible point at all, which is an
   * outcome of the exercise and not a crash: the page says so inline and the
   * previous result is left exactly where it was.
   */
  async runWorstCase(fail = false): Promise<void> {
    if (this._pendingAction() !== null || !this.canRunWorstCase()) return;
    const fixed = this.activeShocks();
    const measure = this._impactMeasure();
    const k = this._k();

    this._pendingAction.set('worst-case');
    this._error.set(null);
    await delay(LATENCY_MS);
    this._pendingAction.set(null);

    if (fail) {
      this._error.set({
        section: 'worst-case',
        message: SEARCH_FAILED_MESSAGE,
        detail: SEARCH_FAILED_DETAIL,
      });
      return;
    }

    const z = worstCaseScenario(fixed, k);
    if (z === null) {
      this._error.set({
        section: 'worst-case',
        message: INFEASIBLE_MESSAGE,
        detail: INFEASIBLE_DETAIL,
      });
      return;
    }

    const at = this.tick();
    this._expectedResult.set(buildExpected(measure, k, at));
    this._worstCaseResult.set(buildWorstCase(z, fixed, measure, k, at));
    this._contributions.set(buildContributions(z, measure));
    this._lastResultKind.set('worst-case');
  }

  /**
   * Searches for the least implausible scenario that reaches the target.
   *
   * The forward exercise fixes the radius and reads off a loss; this one fixes
   * the loss the outcome implies and reads off the radius. Both run on the same
   * loss surface, so the scenario reported here reaches the target level
   * exactly.
   */
  async searchReverse(fail = false): Promise<void> {
    if (this._pendingAction() !== null || !this.canSearchReverse()) return;
    const outcome = this._reverseOutcome();
    const target = this._reverseTargetLevel();
    const measure = this._impactMeasure();
    const k = this._k();
    if (target === null) return;

    this._pendingAction.set('reverse');
    this._error.set(null);
    await delay(LATENCY_MS);
    this._pendingAction.set(null);

    if (fail) {
      this._error.set({
        section: 'reverse',
        message: REVERSE_FAILED_MESSAGE,
        detail: REVERSE_FAILED_DETAIL,
      });
      return;
    }

    const current = REVERSE_OUTCOME_LEVELS[outcome].currentLevel;
    if (target >= current) {
      this._error.set({
        section: 'reverse',
        message: REVERSE_TARGET_ABOVE_CURRENT_MESSAGE,
        detail: REVERSE_TARGET_ABOVE_CURRENT_DETAIL,
      });
      return;
    }

    const minimalMaha = radiusForLoss(current - target, measure);
    if (minimalMaha > REVERSE_MAX_MAHA) {
      this._error.set({
        section: 'reverse',
        message: REVERSE_UNREACHABLE_MESSAGE,
        detail: REVERSE_UNREACHABLE_DETAIL,
      });
      return;
    }

    const at = this.tick();
    this._expectedResult.set(buildExpected(measure, k, at));
    this._reverseResult.set(this.buildReverse(outcome, target, measure, k, at));
    this._lastResultKind.set('reverse');
  }

  clearError(): void {
    this._error.set(null);
  }

  // --- staleness ------------------------------------------------------------
  //
  // The one thing that must never happen here is a recompute. Each writer flips
  // a flag on the objects already stored and leaves every number in them
  // untouched, so the page keeps showing exactly what was computed, badged with
  // the parameters it was computed under.

  private markAllStale(): void {
    const expected = this._expectedResult();
    if (!expected.stale) this._expectedResult.set({ ...expected, stale: true });
    this.markStale(this._manualResult);
    this.markStale(this._worstCaseResult);
    this.markStale(this._reverseResult);
  }

  private markManualStale(): void {
    this.markStale(this._manualResult);
  }

  private markStale<T extends { readonly stale: boolean }>(
    target: WritableSignal<T | null>,
  ): void {
    const current = target();
    if (current === null || current.stale) return;
    target.set({ ...current, stale: true });
  }

  // --- derivation -----------------------------------------------------------

  private resultFor(
    kind: Exclude<ScenarioKind, 'expected'> | null,
  ): ScenarioResult | ReverseResult | null {
    if (kind === 'manual') return this._manualResult();
    if (kind === 'worst-case') return this._worstCaseResult();
    if (kind === 'reverse') return this._reverseResult();
    return null;
  }

  private buildSavedRow(kind: Exclude<ScenarioKind, 'expected'>): SavedScenario | null {
    if (kind === 'reverse') {
      const result = this._reverseResult();
      if (result === null) return null;
      return {
        id: `saved-${++this.savedCounter}`,
        name: `Reverse: ${REVERSE_OUTCOME_SHORT_LABEL[result.outcome]}`,
        kind,
        k: result.minimalMaha,
        maha: result.minimalMaha,
        measure: result.measure,
        unit: result.unit,
        cep: null,
        loss: null,
        runAt: AS_OF_DATE,
        fixed: [],
        reverse: { outcome: result.outcome, targetLevel: result.targetLevel },
      };
    }

    const result = kind === 'manual' ? this._manualResult() : this._worstCaseResult();
    if (result === null) return null;
    const fixed: readonly SavedFactorValue[] = result.factors
      .filter((factor) => factor.fixed)
      .map((factor) => ({ factorId: factor.factorId, value: factor.value }));

    return {
      id: `saved-${++this.savedCounter}`,
      name:
        kind === 'worst-case'
          ? `WC @k=${result.k.toFixed(2)}`
          : manualRowName(toFixedShocks(fixed)),
      kind,
      k: result.k,
      maha: result.maha,
      measure: result.measure,
      unit: result.unit,
      cep: result.cep,
      loss: result.loss,
      runAt: AS_OF_DATE,
      fixed,
      reverse: null,
    };
  }

  private buildReverse(
    outcome: ReverseOutcomeId,
    targetLevel: number,
    measure: ImpactMeasureId,
    k: number,
    computedAt: string,
  ): ReverseResult {
    const currentLevel = REVERSE_OUTCOME_LEVELS[outcome].currentLevel;
    const requiredLoss = currentLevel - targetLevel;
    const minimalMaha = radiusForLoss(requiredLoss, measure);
    const z = worstCaseScenario([], minimalMaha) ?? new Array<number>(N).fill(0);
    const cost = damage(z, measure);
    const scenario: readonly ImpliedFactorMove[] = FACTORS.map((factor, i) => ({
      factorId: factor.id,
      name: factor.name,
      value: factorValue(z[i], i),
      unit: factor.unit,
      driver: cost === 0 ? false : Math.abs(damage(isolate(z, i), measure) / cost) >= KEY_FACTOR_SHARE,
    }));

    return {
      outcome,
      targetLevel,
      currentLevel,
      requiredLoss,
      minimalMaha,
      measure,
      unit: IMPACT_MEASURE_UNIT[measure],
      k,
      withinCurrentRadius: minimalMaha <= k,
      scenario,
      computedAt,
      stale: false,
    };
  }

  /** Advances the deterministic clock one run and returns the new stamp. */
  private tick(): string {
    this._clockMinutes.update((minutes) => minutes + MINUTES_PER_RUN);
    return stamp(this._clockMinutes());
  }
}

// ---------------------------------------------------------------------------

function barOf(result: ScenarioResult, annotation: string | null): SeverityBar {
  return {
    kind: result.kind,
    label: result.label,
    cep: result.cep,
    unit: result.unit,
    k: result.k,
    annotation,
    stale: result.stale,
  };
}

function toBar(result: ScenarioResult | null, annotation: string | null): SeverityBar[] {
  return result === null ? [] : [barOf(result, annotation)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
