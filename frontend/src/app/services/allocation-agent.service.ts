import { Injectable, computed, signal } from '@angular/core';

import {
  BENCHMARK_LABEL,
  DIRECT_METHOD_LABEL,
  OBJECTIVES,
  REMEDY_LABEL,
  type AllocationFlag,
  type AllocationRow,
  type AssetClass,
  type BenchmarkWeights,
  type Characteristic,
  type DirectMethod,
  type EstimationApproach,
  type EstimationDiagnostics,
  type FrontierPoint,
  type MacroInput,
  type ObjectiveId,
  type PortfolioSummary,
  type Publication,
  type Remedy,
  type RunLogEntry,
  type AgentStatus,
} from '../models/allocation-agent.model';

const RUN_MS = 1100;
const PUBLISH_MS = 800;

/**
 * GMVP, curvature and the tangency return, fitted so the CAL from r_f = 3.5%
 * touches the frontier rather than cutting it (§3).
 *
 * The tangency condition σ² = C(r − r_f)(r − r_g) solves at r = 7.5 for these
 * constants, which is why the tangency return is a constant here and not a
 * number chosen to look right.
 */
const GMVP_VOL = 6.322;
const GMVP_RETURN = 4.2;
const CURVATURE = 17.3045;
const TANGENCY_RETURN = 7.5;

/**
 * Above this, a long-only portfolio cannot reach the target: the frontier
 * terminates at the highest-return asset once shorts are ruled out.
 */
const LONG_ONLY_MAX_RETURN = 9.6;

/**
 * The investable universe: ticker, name, class, max-Sharpe tilt, volatility %,
 * correlation with the portfolio, capitalisation weight.
 *
 * The tilt stands in for the tangency portfolio's unconstrained weights — the
 * risky portfolio with the steepest CAL. Every other objective is built from it
 * and from the volatilities, so switching objective moves the book rather than
 * rescaling it.
 */
const UNIVERSE: readonly (readonly [
  string,
  string,
  AssetClass,
  number,
  number,
  number,
  number,
])[] = [
  ['AAPL', 'Apple', 'Equities', 14.2, 24.1, 0.78, 6.4],
  ['MSFT', 'Microsoft', 'Equities', 11.8, 22.4, 0.81, 6.1],
  ['NVDA', 'Nvidia', 'Equities', 6.9, 38.2, 0.74, 5.8],
  ['JPM', 'JPMorgan', 'Equities', 5.4, 21.6, 0.69, 2.2],
  ['XOM', 'Exxon Mobil', 'Equities', 4.1, 23.8, 0.52, 1.9],
  ['ASML', 'ASML', 'Equities', 3.6, 29.4, 0.71, 1.4],
  ['NESN', 'Nestlé', 'Equities', 2.8, 14.2, 0.48, 1.1],
  ['UST 10Y', 'US Treasury 10Y', 'Bonds', 28.0, 7.4, 0.24, 21.5],
  ['UST 2Y', 'US Treasury 2Y', 'Bonds', 7.2, 2.1, 0.18, 14.8],
  ['Bund 10Y', 'German Bund 10Y', 'Bonds', 5.1, 6.8, 0.21, 9.3],
  ['IG Credit', 'Investment grade credit', 'Bonds', 4.3, 8.9, 0.44, 11.6],
  ['HY Credit', 'High yield credit', 'Bonds', 2.4, 12.6, 0.62, 4.2],
  ['Gold', 'Gold', 'Commodities', 6.0, 15.3, 0.19, 4.8],
  ['Brent', 'Brent crude', 'Commodities', 2.2, 31.5, 0.34, 2.6],
  ['Copper', 'Copper', 'Commodities', 1.6, 26.8, 0.46, 1.4],
  ['Ags', 'Agriculture basket', 'Commodities', 1.1, 19.2, 0.12, 0.9],
  ['Cash', 'Cash', 'Cash', 4.0, 0.4, 0.02, 4.0],
  // Excluded from the optimisation: too little history for the covariance.
  ['SMCI', 'Super Micro Computer', 'Equities', 0, 0, 0, 0],
];

const EXCLUDED = new Set(['SMCI']);

/**
 * Standardised characteristic loadings ŷ, in the order
 * value · momentum · size · quality · low-volatility.
 *
 * These are what the parametric policy tilts on: x_i = x̄_i + (1/N)·θ'ŷ_i
 * (§10). They are per-asset observables, not estimates of a return
 * distribution — which is the whole point of the direct approach, since it
 * never forms a covariance matrix at all.
 */
const CHARACTERISTIC_SCORE: Record<string, readonly number[]> = {
  AAPL: [-0.9, 1.2, -1.4, 1.5, -0.3],
  MSFT: [-0.8, 1.0, -1.3, 1.6, -0.2],
  NVDA: [-1.5, 1.8, -1.1, 0.9, -1.4],
  JPM: [0.9, 0.4, -0.2, 0.3, -0.1],
  XOM: [1.3, -0.3, -0.3, 0.5, -0.2],
  ASML: [-1.1, 0.7, 0.2, 1.1, -0.8],
  NESN: [0.4, -0.5, 0.3, 1.2, 0.7],
  'UST 10Y': [0.6, -0.6, -1.6, 1.8, 1.1],
  'UST 2Y': [0.3, -0.2, -1.5, 1.8, 1.6],
  'Bund 10Y': [0.5, -0.8, -1.2, 1.7, 1.2],
  'IG Credit': [0.7, -0.1, -0.9, 1.2, 0.9],
  'HY Credit': [1.1, 0.3, 0.4, -0.6, 0.4],
  Gold: [-0.2, 0.9, -0.4, 0.2, 0.3],
  Brent: [0.8, 0.6, 0.1, -0.9, -1.1],
  Copper: [0.6, 0.2, 0.6, -0.7, -0.9],
  Ags: [0.4, -0.7, 1.2, -0.5, 0.0],
  Cash: [0.0, -1.1, 1.4, 0.4, 1.8],
};

const CHARACTERISTIC_INDEX: Record<Characteristic, number> = {
  value: 0,
  momentum: 1,
  size: 2,
  quality: 3,
  'low-vol': 4,
};

/**
 * θ, in percentage points of weight per unit of standardised characteristic,
 * before the 1/N scaling. Estimated by maximising the sample analogue of
 * expected utility — a constant here, which is exactly the point: the whole
 * policy is a handful of coefficients rather than N² covariance entries.
 */
const THETA = 90;

/**
 * Where each fixed-objective portfolio sits in the σ–E plane.
 *
 * `inefficiency` scales the frontier's own σ at that return: 1 means the
 * portfolio is on the frontier. ERC coincides with the tangency portfolio only
 * under a constant correlation matrix and equal individual Sharpe ratios, and
 * risk parity across classes is mean-variance optimal only for uncorrelated
 * components with equal Sharpe ratios — neither holds here, so both carry more
 * risk than the frontier does for the same return (§5, §6).
 */
const OBJECTIVE_POINT: Partial<
  Record<ObjectiveId, { expectedReturn: number; inefficiency: number }>
> = {
  gmvp: { expectedReturn: GMVP_RETURN, inefficiency: 1 },
  tangency: { expectedReturn: TANGENCY_RETURN, inefficiency: 1 },
  erc: { expectedReturn: 5.1, inefficiency: 1.06 },
  'risk-parity': { expectedReturn: 4.9, inefficiency: 1.09 },
};

/**
 * Where a directly-modelled book lands.
 *
 * It aims at no return — there is no objective in this branch — so this is
 * where the policy comes out, not where it was pointed. The nonparametric
 * variant carries the largest penalty because the curse of dimensionality
 * leaves it the noisiest of the three (§10, §11).
 */
const DIRECT_POINT: Record<DirectMethod, { expectedReturn: number; inefficiency: number }> = {
  parametric: { expectedReturn: 6.2, inefficiency: 1.02 },
  'state-index': { expectedReturn: 6.5, inefficiency: 1.04 },
  nonparametric: { expectedReturn: 5.6, inefficiency: 1.08 },
};

function volatilityAt(expectedReturn: number): number {
  return Math.sqrt(GMVP_VOL ** 2 + CURVATURE * (expectedReturn - GMVP_RETURN) ** 2);
}

type Asset = (typeof UNIVERSE)[number];

/** Raw positive scores to weights in percent. */
function normalise(raw: readonly (readonly [string, number])[]): Map<string, number> {
  const total = raw.reduce((sum, [, v]) => sum + v, 0);
  return new Map(raw.map(([ticker, v]) => [ticker, (v / total) * 100]));
}

/** The tangency portfolio: the tilt itself, normalised. */
function tangencyWeights(assets: readonly Asset[]): Map<string, number> {
  return normalise(assets.map(([ticker, , , tilt]) => [ticker, tilt] as const));
}

/**
 * The vertex. Under the constant-correlation proxy the minimum-variance weights
 * go as 1/σ², which is why the GMVP concentrates in the quietest assets and why
 * its weights do not depend on expected returns at all (§2).
 */
function gmvpWeights(assets: readonly Asset[]): Map<string, number> {
  return normalise(assets.map(([ticker, , , , vol]) => [ticker, 1 / Math.max(0.4, vol) ** 2] as const));
}

/**
 * Equal risk contributions. Under a constant correlation matrix the ERC
 * solution is exactly x_i ∝ 1/σ_i (§5), which also places it between the
 * minimum-variance portfolio and 1/n — the ordering σ_mv ≤ σ_erc ≤ σ_1/n.
 */
function ercWeights(assets: readonly Asset[]): Map<string, number> {
  return normalise(assets.map(([ticker, , , , vol]) => [ticker, 1 / Math.max(0.4, vol)] as const));
}

/**
 * Risk parity across asset classes (§6): each class carries the same share of
 * risk, and within a class the weights are inverse-volatility. Equalising the
 * class risk budgets gives a class weight in 1/σ_c with σ_c the harmonic mean
 * of the class, and the two together reduce to (1/σ_i)/n_c.
 */
function riskParityWeights(assets: readonly Asset[]): Map<string, number> {
  const classSize = new Map<AssetClass, number>();
  for (const [, , assetClass] of assets) {
    classSize.set(assetClass, (classSize.get(assetClass) ?? 0) + 1);
  }
  return normalise(
    assets.map(
      ([ticker, , assetClass, , vol]) =>
        [ticker, 1 / Math.max(0.4, vol) / classSize.get(assetClass)!] as const,
    ),
  );
}

/**
 * Two-fund separation: every portfolio on the mean-variance frontier is an
 * affine combination of the GMVP and the tangency portfolio, so a target return
 * π fixes the mix, k = (π − r_g)/(r_t − r_g).
 *
 * This is why π moves the book and not only the summary — and why a target
 * above the tangency return puts k past 1, which is a leveraged position in the
 * tangency portfolio funded by shorting the GMVP's quiet assets.
 */
function targetReturnWeights(assets: readonly Asset[], target: number): Map<string, number> {
  const gmvp = gmvpWeights(assets);
  const tangency = tangencyWeights(assets);
  const k = (target - GMVP_RETURN) / (TANGENCY_RETURN - GMVP_RETURN);
  return new Map(
    [...gmvp].map(([ticker, w]) => [ticker, w + k * (tangency.get(ticker)! - w)] as const),
  );
}

/** The benchmark portfolio x̄ the parametric policy deviates from (§10). */
function benchmarkVector(
  assets: readonly Asset[],
  kind: BenchmarkWeights,
  current: Map<string, number>,
): Map<string, number> {
  switch (kind) {
    case 'cap':
      return normalise(assets.map(([ticker, , , , , , cap]) => [ticker, cap] as const));
    case 'current':
      return new Map(current);
    default:
      return new Map(assets.map(([ticker]) => [ticker, 100 / assets.length] as const));
  }
}

/**
 * Parametric portfolio policy: x_i = x̄_i + (1/N)·θ'ŷ_i (§10).
 *
 * No covariance matrix is estimated anywhere in here. The deviations are
 * centred, so they sum to zero and the book still sums to one; and because θ is
 * a handful of constants rather than N² parameters, the weights come out less
 * extreme and more stable than a plug-in solution — which is the reason the
 * method exists, not a side effect.
 *
 * `strength` carries the difference between the direct methods: the state-index
 * variant collapses the predictors into one linear index Z'β and tilts harder
 * on it, while the nonparametric variant pays for the curse of dimensionality
 * with a noisier estimate and is shrunk back towards the benchmark.
 */
function parametricPolicyWeights(
  assets: readonly Asset[],
  benchmark: Map<string, number>,
  characteristics: readonly Characteristic[],
  strength: number,
): Map<string, number> {
  const n = assets.length;
  const deviation = new Map<string, number>(assets.map(([ticker]) => [ticker, 0]));

  for (const characteristic of characteristics) {
    const column = CHARACTERISTIC_INDEX[characteristic];
    const raw = assets.map(([ticker]) => CHARACTERISTIC_SCORE[ticker]?.[column] ?? 0);
    // Centred: a tilt has to be funded from somewhere inside the book.
    const mean = raw.reduce((sum, v) => sum + v, 0) / n;
    assets.forEach(([ticker], i) => {
      deviation.set(ticker, deviation.get(ticker)! + (strength * THETA * (raw[i] - mean)) / n);
    });
  }

  return new Map(
    assets.map(([ticker]) => [ticker, benchmark.get(ticker)! + deviation.get(ticker)!] as const),
  );
}

/**
 * Zero the shorts and rescale what is left.
 *
 * The non-negativity constraint costs the problem its closed form (§2); this
 * stands in for the numerical solution, and it converges immediately because
 * rescaling positive weights cannot make one negative.
 */
function removeShorts(weights: Map<string, number>): Map<string, number> {
  const positive = new Map([...weights].map(([t, w]) => [t, Math.max(0, w)] as const));
  const total = [...positive.values()].reduce((sum, w) => sum + w, 0);
  if (total <= 0) return positive;
  return new Map([...positive].map(([t, w]) => [t, (w / total) * 100] as const));
}

/**
 * Clip at the position limit, redistribute, repeat.
 *
 * Clipping once is not enough: the weight taken off a capped asset has to go
 * somewhere, and it can push another asset over the same limit. Iterating to a
 * fixed point is what makes the limit a real constraint (§9 — position limits
 * act as a form of covariance shrinkage).
 */
function applyPositionLimit(
  weights: Map<string, number>,
  limit: number,
): Map<string, { weight: number; clipped: boolean }> {
  const solved = new Map(weights);
  const clipped = new Set<string>();

  for (let pass = 0; pass < 20; pass++) {
    const over = [...solved.entries()].filter(([t, w]) => w > limit + 1e-9 && !clipped.has(t));
    if (!over.length) break;

    let excess = 0;
    for (const [ticker, weight] of over) {
      excess += weight - limit;
      solved.set(ticker, limit);
      clipped.add(ticker);
    }

    // Only long positions absorb the excess; adding it to a short would move
    // that position towards zero, which the limit never asked for.
    const free = [...solved.entries()].filter(([t, w]) => !clipped.has(t) && w > 0);
    const freeTotal = free.reduce((sum, [, w]) => sum + w, 0);
    if (freeTotal <= 0) break;
    for (const [ticker, weight] of free) {
      solved.set(ticker, weight + (excess * weight) / freeTotal);
    }
  }

  return new Map(
    [...solved.entries()].map(([ticker, weight]) => [
      ticker,
      { weight, clipped: clipped.has(ticker) },
    ]),
  );
}

/**
 * The allocation agent's proposal.
 *
 * The HTTP client is not wired yet. The behaviour that matters here is the one
 * the specification is strict about: editing a parameter never recomputes. It
 * marks the configuration modified, and the weights on screen stay the ones the
 * last run actually produced — so what is published is always what was solved.
 */
@Injectable({ providedIn: 'root' })
export class AllocationAgentService {
  private readonly _status = signal<AgentStatus>('idle');
  readonly status = this._status.asReadonly();

  private readonly _lastRun = signal<string | null>('2026-08-01 09:14 UTC');
  readonly lastRun = this._lastRun.asReadonly();

  private readonly _computeError = signal<string | null>(null);
  readonly computeError = this._computeError.asReadonly();

  private readonly _log = signal<readonly RunLogEntry[]>([
    { at: '09:14', message: 'received z_t from Macro & Regimes Agent (regime Expansion)' },
    { at: '09:14', message: 'solving mean-variance problem, target π = 6.0%' },
    { at: '09:15', message: 'applying mean and covariance shrinkage remedies' },
    { at: '09:15', message: 'SMCI dropped — insufficient history for the covariance estimate' },
    { at: '09:15', message: 'proposed allocation computed — pending publish' },
  ]);
  readonly log = this._log.asReadonly();

  // --- configuration --------------------------------------------------------

  readonly approach = signal<EstimationApproach>('plug-in');
  readonly remedies = signal<readonly Remedy[]>(['mean-shrinkage', 'covariance-shrinkage']);
  readonly objective = signal<ObjectiveId>('mv-target');
  readonly targetReturn = signal(6.0);
  readonly riskFreeRate = signal(3.5);
  readonly allowShortSelling = signal(false);
  readonly positionLimit = signal(25);
  readonly directMethod = signal<DirectMethod>('parametric');
  readonly benchmarkWeights = signal<BenchmarkWeights>('equal');
  readonly characteristics = signal<readonly Characteristic[]>(['value', 'momentum']);

  /**
   * The configuration the weights on screen were actually solved under.
   *
   * Everything displayed is derived from this, never from the live controls —
   * that is what makes "modified, run to apply" true rather than decorative.
   */
  private readonly applied = signal({
    approach: 'plug-in' as EstimationApproach,
    remedies: ['mean-shrinkage', 'covariance-shrinkage'] as readonly Remedy[],
    objective: 'mv-target' as ObjectiveId,
    targetReturn: 6.0,
    riskFreeRate: 3.5,
    allowShortSelling: false,
    positionLimit: 25,
    directMethod: 'parametric' as DirectMethod,
    benchmarkWeights: 'equal' as BenchmarkWeights,
    characteristics: ['value', 'momentum'] as readonly Characteristic[],
  });

  /** True as soon as a control differs from what the last run used. */
  readonly modified = computed(() => {
    const a = this.applied();
    return (
      a.approach !== this.approach() ||
      a.objective !== this.objective() ||
      a.targetReturn !== this.targetReturn() ||
      a.riskFreeRate !== this.riskFreeRate() ||
      a.allowShortSelling !== this.allowShortSelling() ||
      a.positionLimit !== this.positionLimit() ||
      a.directMethod !== this.directMethod() ||
      a.benchmarkWeights !== this.benchmarkWeights() ||
      // Both sides sorted: the set is what was solved under, not the order the
      // boxes happened to be ticked in.
      [...a.remedies].sort().join() !== [...this.remedies()].sort().join() ||
      [...a.characteristics].sort().join() !== [...this.characteristics()].sort().join()
    );
  });

  readonly objectives = OBJECTIVES;

  /**
   * π below the GMVP's return asks for a portfolio on the dominated branch.
   *
   * The frontier still has points there, which is exactly why this is caught
   * before the run rather than after: the solver would return weights, and they
   * would be inefficient at any level of risk (Fondamenti §2).
   */
  readonly targetBelowGmvp = computed(
    () =>
      this.approach() === 'plug-in' &&
      this.objective() === 'mv-target' &&
      this.targetReturn() <= GMVP_RETURN,
  );

  /**
   * π above what a long-only book can reach.
   *
   * Past the tangency return the mix is a leveraged position in the tangency
   * portfolio funded by shorting the quiet end of the GMVP; forbid the shorts
   * and the frontier terminates.
   */
  readonly targetAboveLongOnly = computed(
    () =>
      this.approach() === 'plug-in' &&
      this.objective() === 'mv-target' &&
      !this.allowShortSelling() &&
      this.targetReturn() > LONG_ONLY_MAX_RETURN,
  );

  readonly targetReturnInvalid = computed(
    () => this.targetBelowGmvp() || this.targetAboveLongOnly(),
  );

  /** The two bounds, for the message that explains which one was crossed. */
  readonly gmvpReturn = GMVP_RETURN;
  readonly longOnlyMaxReturn = LONG_ONLY_MAX_RETURN;

  readonly activeObjective = computed(
    () => OBJECTIVES.find((o) => o.id === this.objective()) ?? OBJECTIVES[0],
  );

  toggleRemedy(remedy: Remedy): void {
    this.remedies.update((all) =>
      all.includes(remedy) ? all.filter((r) => r !== remedy) : [...all, remedy].sort(),
    );
  }

  toggleCharacteristic(characteristic: Characteristic): void {
    this.characteristics.update((all) =>
      all.includes(characteristic)
        ? all.filter((c) => c !== characteristic)
        : [...all, characteristic].sort(),
    );
  }

  // --- input ----------------------------------------------------------------

  readonly macroInput = signal<MacroInput | null>({
    regime: 'Expansion',
    termSpread: 1.8,
    termSpreadNote: 'up, leading',
    creditSpread: 'tightening',
    logDividendYield: 2.1,
    riskBudget: null,
    universeSize: UNIVERSE.length,
    assetClasses: ['Equities', 'Bonds', 'Commodities', 'Cash'],
    receivedAt: '09:14',
  });

  readonly hasMacroInput = computed(() => this.macroInput() !== null);

  // --- proposal -------------------------------------------------------------

  readonly rows = computed<readonly AllocationRow[]>(() => {
    const applied = this.applied();
    const eligible = UNIVERSE.filter(([ticker]) => !EXCLUDED.has(ticker));

    // Each objective is a different portfolio, not a rescaling of one.
    const plugIn = (): Map<string, number> => {
      switch (applied.objective) {
        case 'gmvp':
          return gmvpWeights(eligible);
        case 'tangency':
          return tangencyWeights(eligible);
        case 'erc':
          return ercWeights(eligible);
        case 'risk-parity':
          return riskParityWeights(eligible);
        default:
          return targetReturnWeights(eligible, applied.targetReturn);
      }
    };

    let weights: Map<string, number>;
    if (applied.approach === 'direct') {
      // The first stage is skipped entirely: no moments are estimated, and the
      // weights are modelled as a deviation from a benchmark (§10).
      const benchmark = benchmarkVector(
        eligible,
        applied.benchmarkWeights,
        targetReturnWeights(eligible, applied.targetReturn),
      );
      const characteristics =
        applied.directMethod === 'nonparametric'
          ? // Two predictors is the practical ceiling for a nonparametric
            // regression on monthly post-war data — the curse of dimensionality
            // is a hard limit here, not a preference.
            applied.characteristics.slice(0, 2)
          : applied.characteristics;
      const strength =
        applied.directMethod === 'state-index' ? 1.4 : applied.directMethod === 'nonparametric' ? 0.6 : 1;
      weights = parametricPolicyWeights(eligible, benchmark, characteristics, strength);
    } else {
      weights = plugIn();
    }

    if (!applied.allowShortSelling) weights = removeShorts(weights);

    const solved = applyPositionLimit(weights, applied.positionLimit);

    // Risk contributions: σ_i(x) = x_i · ∂σ/∂x_i, normalised so they sum to
    // portfolio risk — Euler's theorem, not an arbitrary scaling (§4).
    const rawRisk = eligible.map(([ticker, , , , vol, corr]) => ({
      ticker,
      raw: (solved.get(ticker)?.weight ?? 0) * vol * corr,
    }));
    const riskTotal = rawRisk.reduce((sum, r) => sum + r.raw, 0);

    const rows: AllocationRow[] = UNIVERSE.map(([ticker, name, assetClass, , vol, corr]) => {
      if (EXCLUDED.has(ticker)) {
        return {
          ticker,
          name,
          assetClass,
          weight: null,
          riskContribution: null,
          flag: 'insufficient-data' as AllocationFlag,
          marginalRisk: null,
          volatility: null,
          correlation: null,
        };
      }
      const entry = solved.get(ticker)!;
      const raw = rawRisk.find((r) => r.ticker === ticker)!.raw;
      const contribution = riskTotal === 0 ? 0 : (raw / riskTotal) * 100;
      return {
        ticker,
        name,
        assetClass,
        weight: entry.weight,
        riskContribution: contribution,
        flag: entry.clipped ? 'at-limit' : 'none',
        // ∂σ/∂x_i, in percentage points of portfolio risk per unit of weight.
        marginalRisk: vol * corr,
        volatility: vol,
        correlation: corr,
      };
    });

    return rows;
  });

  readonly includedRows = computed(() => this.rows().filter((r) => r.weight !== null));

  readonly weightTotal = computed(() =>
    this.includedRows().reduce((sum, r) => sum + (r.weight ?? 0), 0),
  );

  readonly riskTotal = computed(() =>
    this.includedRows().reduce((sum, r) => sum + (r.riskContribution ?? 0), 0),
  );

  readonly atLimitCount = computed(() => this.rows().filter((r) => r.flag === 'at-limit').length);

  readonly summary = computed<PortfolioSummary>(() => {
    const applied = this.applied();
    const point =
      applied.approach === 'direct'
        ? DIRECT_POINT[applied.directMethod]
        : OBJECTIVE_POINT[applied.objective];
    const expectedReturn = point ? point.expectedReturn : applied.targetReturn;
    // ERC and risk parity are mean-variance optimal only under conditions the
    // universe does not meet, so they sit to the right of the frontier rather
    // than on it — the penalty is the distance (§5).
    const volatility = volatilityAt(expectedReturn) * (point?.inefficiency ?? 1);
    return {
      expectedReturn,
      volatility,
      riskFreeRate: applied.riskFreeRate,
      // Always derived. There is no setter for this anywhere.
      sharpe: (expectedReturn - applied.riskFreeRate) / volatility,
    };
  });

  // --- frontier -------------------------------------------------------------

  /**
   * The efficient arc, drawn far enough to contain the proposal.
   *
   * A target above the default span is a real request — it is reached by
   * leveraging the tangency portfolio — and the curve has to go there too, or
   * the marker would sit past the end of the line it belongs to.
   */
  readonly frontierCurve = computed<readonly (readonly [number, number])[]>(() => {
    const top = Math.max(GMVP_RETURN + 4.2, this.summary().expectedReturn + 0.4);
    const span = top - GMVP_RETURN;
    const points: (readonly [number, number])[] = [];
    for (let i = 0; i <= 40; i++) {
      const r = GMVP_RETURN + (i * span) / 40;
      points.push([volatilityAt(r), r] as const);
    }
    return points;
  });

  /**
   * The branch below the GMVP.
   *
   * Every point on it is dominated — the same risk is available with a higher
   * expected return on the arc above — so it is drawn, dashed, rather than
   * omitted: the parabola's lower half is why "only the arc above the vertex is
   * efficient" is a statement about geometry and not a convention.
   */
  readonly inefficientBranch = computed<readonly (readonly [number, number])[]>(() => {
    const points: (readonly [number, number])[] = [];
    for (let i = 0; i <= 20; i++) {
      const r = GMVP_RETURN - ((20 - i) * 2.1) / 20;
      points.push([volatilityAt(r), r] as const);
    }
    return points;
  });

  readonly frontierPoints = computed<readonly FrontierPoint[]>(() => {
    const summary = this.summary();
    return [
      {
        label: 'GMVP',
        volatility: GMVP_VOL,
        expectedReturn: GMVP_RETURN,
        description: 'the vertex; only the arc above it is efficient',
      },
      {
        label: 'Tangency',
        volatility: volatilityAt(7.5),
        expectedReturn: 7.5,
        description: 'steepest capital allocation line from r_f',
      },
      {
        label: 'Proposed',
        volatility: summary.volatility,
        expectedReturn: summary.expectedReturn,
        description: 'the allocation this run produced',
      },
    ];
  });

  // --- diagnostics ----------------------------------------------------------

  readonly diagnostics = computed<EstimationDiagnostics>(() => {
    const applied = this.applied();
    const remedyCount = applied.remedies.length;
    // Estimation error is the whole reason the approach matters: plug-in is
    // consistent but imprecise, and the remedies trade variance for bias (§11).
    const uncertainty =
      applied.approach === 'direct' ? 'Low' : remedyCount >= 2 ? 'Moderate' : 'High';
    const loss = applied.approach === 'direct' ? 0.2 : remedyCount >= 2 ? 0.4 : 1.1;
    return {
      approach: applied.approach,
      uncertainty,
      certaintyEquivalentLoss: loss,
      universeSize: UNIVERSE.length,
      excludedCount: EXCLUDED.size,
      remedies:
        applied.approach === 'direct'
          ? ['dimension reduction — the first stage is skipped']
          : applied.remedies.map((r) => REMEDY_LABEL[r]),
      covariancePositiveDefinite: true,
    };
  });

  // --- publication ----------------------------------------------------------

  private readonly _publication = signal<Publication>({
    state: 'stale',
    at: '2026-07-31 16:02 UTC',
    failureDetail: null,
  });
  readonly publication = this._publication.asReadonly();

  /** Publishing needs a proposal solved under the configuration on screen. */
  readonly canPublish = computed(
    () => this.status() !== 'running' && !this.modified() && this.computeError() === null,
  );

  private publishAttempts = 0;

  // --- actions --------------------------------------------------------------

  /** Set to make the next run fail, for the compute-error path. */
  private failRun = false;

  failNextRun(): void {
    this.failRun = true;
  }

  /** Enough to solve with: not already running, a z_t to condition on, valid π. */
  readonly canRun = computed(
    () => this.status() !== 'running' && this.hasMacroInput() && !this.targetReturnInvalid(),
  );

  async run(): Promise<void> {
    if (!this.canRun()) return;

    this._status.set('running');
    this._computeError.set(null);
    this._log.set([{ at: this.clock(), message: 'received z_t from the shared state' }]);

    await delay(RUN_MS);

    if (this.failRun) {
      this.failRun = false;
      this._status.set('error');
      this._computeError.set(
        'The covariance matrix is not positive definite under the current universe, so the problem has no unique solution.',
      );
      this.append('covariance estimate rejected — run aborted');
      return;
    }

    // Only now does the configuration on screen become the one that was solved.
    this.applied.set({
      approach: this.approach(),
      remedies: [...this.remedies()].sort(),
      objective: this.objective(),
      targetReturn: this.targetReturn(),
      riskFreeRate: this.riskFreeRate(),
      allowShortSelling: this.allowShortSelling(),
      positionLimit: this.positionLimit(),
      directMethod: this.directMethod(),
      benchmarkWeights: this.benchmarkWeights(),
      characteristics: [...this.characteristics()].sort(),
    });

    if (this.approach() === 'plug-in') {
      const target =
        this.objective() === 'mv-target' ? `, target π = ${this.targetReturn().toFixed(1)}%` : '';
      this.append(`solving ${this.activeObjective().label}${target}`);
      if (this.remedies().length) {
        const names = this.remedies().map((r) => REMEDY_LABEL[r].toLowerCase());
        this.append(`applying ${names.join(' and ')}`);
      }
    } else {
      this.append(
        `modelling weights directly — ${DIRECT_METHOD_LABEL[this.directMethod()].toLowerCase()}, ` +
          `${BENCHMARK_LABEL[this.benchmarkWeights()].toLowerCase()} benchmark, ` +
          `${this.characteristics().length} characteristics — no covariance matrix estimated`,
      );
    }
    this.append('SMCI dropped — insufficient history for the covariance estimate');
    const clipped = this.atLimitCount();
    if (clipped > 0) {
      this.append(
        `${clipped} ${clipped === 1 ? 'position' : 'positions'} clipped at the ` +
          `${this.positionLimit()}% limit and the excess redistributed`,
      );
    }
    this.append('proposed allocation computed — pending publish');

    this._lastRun.set(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    this._status.set('done');
    // A fresh proposal has not been published yet, whatever came before — and
    // whatever came before is now stale rather than merely old: this run
    // supersedes it. `never` is reserved for a state nothing was ever written to.
    const previous = this._publication().at;
    this._publication.set({
      state: previous ? 'stale' : 'never',
      at: previous,
      failureDetail: null,
    });
  }

  /**
   * Writes the proposal to the shared state.
   *
   * A failure here is never allowed to look like a success: the state goes to
   * `failed`, the proposal is left exactly as it was, and the log records the
   * failure rather than a publication.
   */
  async publish(): Promise<void> {
    // The state is left alone while the write is in flight: nothing about it is
    // known yet, and moving it early would show an outcome that has not happened.
    const previous = this._publication();
    await delay(PUBLISH_MS);

    // One transient failure, so the retry path is reachable rather than
    // theoretical; the retry then succeeds without recomputing.
    this.publishAttempts += 1;
    if (this.publishAttempts === 1) {
      this._publication.set({
        state: 'failed',
        at: previous.at,
        failureDetail:
          'The shared state rejected the write: version conflict with a concurrent update. Nothing was written, and the proposal below is unchanged.',
      });
      this.append('publish failed — Fund State was not updated');
      return;
    }

    const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    this._publication.set({ state: 'published', at, failureDetail: null });
    this.append('proposed allocation published to the Fund State');
  }

  private append(message: string): void {
    this._log.update((all) => [...all, { at: this.clock(), message }]);
  }

  private clock(): string {
    return new Date().toTimeString().slice(0, 5);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
