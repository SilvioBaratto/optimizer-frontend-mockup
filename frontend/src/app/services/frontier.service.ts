import { Injectable, signal } from '@angular/core';

import type {
  AssetPoint,
  ConstraintView,
  FrontierPoint,
  FrontierResult,
  FrontierRun,
  NotablePortfolio,
  PortfolioMetrics,
  RiskContribution,
} from '../models/frontier.model';

export type FrontierState = 'loading' | 'ready' | 'empty' | 'error';

/** Stand-in latency, so the spec's loading state is actually reachable. */
const LATENCY_MS = 700;

/** r_f, percent. Feeds the CAL, the tangency portfolio and every Sharpe ratio. */
const RISK_FREE_RATE = 3.2;

/** Points the solver samples along the frontier. */
const SAMPLES = 40;

/**
 * The investable universe: ticker, name, SD_i (%), E(r_i) (%).
 *
 * The first four carry the tickers the spec's wireframe uses, so the numbers on
 * screen can be read against the document.
 */
const UNIVERSE: readonly (readonly [string, string, number, number])[] = [
  ['AAA', 'Ashford Industrials', 14.2, 5.1],
  ['BBB', 'Brightwater Utilities', 10.8, 5.9],
  ['CCC', 'Calderon Mining', 9.6, 3.6],
  ['DDD', 'Delmar Semiconductor', 22.4, 7.9],
  ['EEE', 'Eastgate Retail', 16.1, 6.2],
  ['FFF', 'Fairhaven Pharma', 19.3, 7.1],
  ['GGG', 'Granite Rail', 11.4, 4.8],
  ['HHH', 'Halloway Foods', 8.7, 3.9],
  ['III', 'Ironvale Steel', 20.6, 6.6],
  ['JJJ', 'Juniper Media', 24.1, 8.4],
  ['KKK', 'Kestrel Airlines', 27.3, 7.4],
  ['LLL', 'Lockridge Insurance', 12.2, 5.4],
  ['MMM', 'Marlowe Chemicals', 17.8, 6.0],
  ['NNN', 'Northbay Shipping', 21.5, 6.9],
  ['OOO', 'Oakfield Timber', 13.6, 4.6],
  ['PPP', 'Penrose Telecom', 12.9, 5.2],
  ['QQQ', 'Quillon Software', 25.8, 9.1],
  ['RRR', 'Redstone Energy', 23.2, 7.6],
  ['SSS', 'Sandbourne Banks', 15.4, 5.7],
  ['TTT', 'Thornbury Leisure', 18.9, 6.4],
  ['UUU', 'Underhill Water', 7.9, 3.4],
  ['VVV', 'Vantage Logistics', 16.7, 6.1],
  ['WWW', 'Westmere Hotels', 22.9, 6.8],
  ['XXX', 'Xenia Biotech', 29.6, 9.6],
  ['YYY', 'Yarrow Agriculture', 14.8, 5.0],
  ['ZZZ', 'Zephyr Aerospace', 20.1, 7.2],
  ['ABC', 'Abercrave Textiles', 13.1, 4.4],
  ['BCD', 'Bexley Construction', 19.8, 6.5],
  ['CDE', 'Corran Distilling', 11.9, 4.9],
  ['DEF', 'Dunmore Paper', 10.4, 4.1],
  ['EFG', 'Elmsworth Glass', 15.9, 5.6],
  ['FGH', 'Fenwick Automotive', 21.1, 6.7],
  ['GHI', 'Garnock Cement', 12.6, 4.7],
  ['HIJ', 'Hartsend Apparel', 17.2, 5.8],
  ['IJK', 'Inverness Marine', 18.4, 6.3],
  ['JKL', 'Jedburgh Tools', 14.5, 5.3],
  ['KLM', 'Kinloch Publishing', 16.3, 5.5],
  ['LMN', 'Larchmont Realty', 13.8, 4.5],
  ['MNO', 'Melrose Optics', 23.7, 8.0],
  ['NOP', 'Netherby Grid', 9.1, 4.0],
  ['OPQ', 'Ormiston Fisheries', 20.9, 6.6],
  ['PQR', 'Pentland Robotics', 26.4, 8.7],
];

/**
 * A frontier branch, as the closed-form hyperbola of Fondamenti §3:
 * σ(r) = √(σ_g² + b·(r − r_g)²), with its vertex at the GMVP.
 */
interface Branch {
  /** GMVP: (σ_g, r_g). */
  sdVertex: number;
  returnVertex: number;
  /** Curvature b. */
  b: number;
  /** Highest target return the solver reached under this constraint set. */
  returnMax: number;
  /**
   * Whether `returnMax` is the highest-returning single asset, which is where a
   * long-only arc has to stop (§5). A branch that allows shorts does not.
   */
  terminatesAtAsset: boolean;
  /** Peak on-curve diversification ratio, and the return it occurs at. */
  peakD: number;
  peakDReturn: number;
}

/**
 * Two constraint sets, two branches.
 *
 * The curvature of each is not free: it is pinned by requiring the CAL from
 * r_f to be tangent — not secant — at the tangency portfolio, which is the one
 * geometric claim the page makes visually. b = σ_g² / ((r_g − r_f)(r_t − r_g)).
 *
 * Removing short sales moves the vertex right and up (a worse GMVP) and bends
 * the branch far harder, because the arc can no longer run past the
 * highest-returning asset — under long-only it terminates there (§5). With
 * shorts allowed there is no such ceiling, so that branch runs past every
 * single asset's return.
 */
const BRANCHES: Record<ConstraintView, Branch> = {
  // Tangency at r = 9.70 ⇒ b = 8.90² / (1.90 × 4.60) = 9.063.
  'short-allowed': {
    sdVertex: 8.9,
    returnVertex: 5.1,
    b: 9.063,
    returnMax: 10.6,
    terminatesAtAsset: false,
    peakD: 1.92,
    peakDReturn: 6.8,
  },
  // Terminates at XXX (29.6, 9.6), the highest-returning asset in the universe
  // ⇒ b = (29.6² − 9.35²) / (9.6 − 5.35)² = 43.667.
  'long-only': {
    sdVertex: 9.35,
    returnVertex: 5.35,
    b: 43.667,
    returnMax: 9.6,
    terminatesAtAsset: true,
    peakD: 1.74,
    peakDReturn: 6.4,
  },
};

/** The most-diversified portfolio, which is off the mean-variance curve (§10). */
const MDP: Record<ConstraintView, { sd: number; expectedReturn: number; d: number }> = {
  'short-allowed': { sd: 10.6, expectedReturn: 6.8, d: 1.98 },
  'long-only': { sd: 11.9, expectedReturn: 6.1, d: 1.81 },
};

/**
 * Frontier points the solver failed to converge on, by index. They keep their
 * place in the sequence and carry no portfolio, which is what leaves a genuine
 * break in the plotted curve.
 */
const NOT_CONVERGED: Record<ConstraintView, readonly number[]> = {
  'short-allowed': [24, 25, 26],
  'long-only': [],
};

const RUNS: readonly FrontierRun[] = [
  {
    id: '128',
    label: '#128 · Aug 1 2026 14:32',
    computed: ['short-allowed'],
    stale: false,
  },
  {
    id: '127',
    label: '#127 · Jul 31 2026 09:04',
    computed: ['short-allowed', 'long-only'],
    stale: true,
  },
  {
    id: '124',
    label: '#124 · Jul 28 2026 16:20',
    computed: ['long-only'],
    stale: true,
  },
];

function sdAt(branch: Branch, r: number): number {
  return Math.sqrt(branch.sdVertex ** 2 + branch.b * (r - branch.returnVertex) ** 2);
}

/**
 * How far the branch has collapsed onto its single terminal asset, 0–1.
 *
 * A long-only arc ends at the highest-returning asset (§5): the only admissible
 * way to reach that return is to hold it alone. The cube keeps the pull
 * negligible over most of the arc and sharp only at the very top. A branch that
 * allows shorts never terminates, so it never concentrates this way.
 */
function terminalPull(branch: Branch, r: number): number {
  if (!branch.terminatesAtAsset) return 0;
  const span = branch.returnMax - branch.returnVertex;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (r - branch.returnVertex) / span)) ** 3;
}

/**
 * D(w) along the branch — highest near the MDP's return and falling away on
 * both sides, steeply below the peak where the portfolio collapses toward the
 * few lowest-volatility names.
 *
 * At a terminal single-asset endpoint it is exactly 1: a mono-asset portfolio
 * has no diversification at all, which is the equality case of D(w) ≥ 1 (§7).
 */
function diversificationAt(branch: Branch, r: number): number {
  const gap = r - branch.peakDReturn;
  const k = gap <= 0 ? 0.173 : 0.035;
  const smooth = branch.peakD - k * gap ** 2;
  const pull = terminalPull(branch, r);
  return smooth * (1 - pull) + 1 * pull;
}

/**
 * The volatility-weighted mean correlation ρ(w), rising with the target return
 * as the portfolio concentrates into the higher-returning names.
 */
function meanCorrelationAt(branch: Branch, r: number): number {
  return 0.16 + 0.012 * (r - branch.returnVertex);
}

/**
 * CR(w), from the identity 1/D² = (1 − ρ)·CR + ρ (Fondamenti §7).
 *
 * Deriving one of the three from the other two is what keeps the card's three
 * numbers from quietly contradicting each other.
 */
function concentrationFrom(d: number, meanCorrelation: number): number {
  return (1 / d ** 2 - meanCorrelation) / (1 - meanCorrelation);
}

function metricsFor(
  branch: Branch,
  r: number,
  sd: number,
  mdpD: number,
): PortfolioMetrics {
  const d = diversificationAt(branch, r);
  const rho = meanCorrelationAt(branch, r);
  return {
    expectedReturn: r,
    sd,
    sharpe: (r - RISK_FREE_RATE) / sd,
    diversificationRatio: d,
    weightedAvgCorrelation: rho,
    concentrationRatio: concentrationFrom(d, rho),
    // ρ_{P,M} = D(P)/D(M) (Fondamenti §9).
    correlationWithMdp: d / mdpD,
  };
}

/**
 * Holdings and the volatility decomposition for one point on the frontier.
 *
 * Weights tilt toward the higher-returning names as the target return climbs;
 * under long-only they are clamped at zero rather than allowed to go short.
 * The correlations are then scaled so Σ x_i·SD_i·Corr(i,P) lands exactly on
 * SD_P — the identity of §6 is what the table's TOTAL row checks, so it has to
 * hold to the last decimal rather than approximately.
 */
function holdingsFor(
  branch: Branch,
  view: ConstraintView,
  r: number,
  sd: number,
): RiskContribution[] {
  const meanReturn = 6.0;
  const tilt = (r - 5.1) / 5.5;

  const raw = UNIVERSE.map(([ticker, name, sdAsset, er], i) => {
    // A fixed base profile, deterministic in the index, plus the return tilt.
    // Climbing the frontier pushes weight into the higher-returning names and,
    // once shorting is allowed, funds it by going short the laggards.
    const base = 1 + 0.35 * Math.sin(i * 1.7) + 0.2 * Math.cos(i * 0.9);
    const weight = base + tilt * (er - meanReturn) * 1.1;
    return { ticker, name, sdAsset, er, weight: view === 'long-only' ? Math.max(0, weight) : weight };
  });

  const total = raw.reduce((sum, a) => sum + a.weight, 0);
  // Near a terminal endpoint the book collapses onto the one asset that can
  // reach that return, so the table agrees with the D(w) = 1 the endpoint has.
  const pull = terminalPull(branch, r);
  const topReturn = Math.max(...raw.map((a) => a.er));
  const weights = raw.map((a) => ({
    ...a,
    weight: (a.weight / total) * (1 - pull) + (a.er === topReturn ? pull : 0),
  }));

  // Correlation with the portfolio, before the scaling that enforces §6.
  const correlations = weights.map(
    (a, i) => 0.34 + 0.3 * Math.sin(i * 0.8 + 1.2) * 0.5 + 0.22 * (a.sdAsset / 30),
  );

  const rawContributions = weights.map((a, i) => a.weight * a.sdAsset * correlations[i]);
  const rawSum = rawContributions.reduce((sum, c) => sum + c, 0);
  const scale = rawSum === 0 ? 1 : sd / rawSum;

  return weights.map((a, i) => {
    const corr = correlations[i] * scale;
    const contribution = a.weight * a.sdAsset * corr;
    return {
      ticker: a.ticker,
      name: a.name,
      weight: a.weight * 100,
      sdAsset: a.sdAsset,
      corrWithPortfolio: corr,
      contribution,
      shareOfSd: (contribution / sd) * 100,
      betaToPortfolio: (a.sdAsset * corr) / sd,
    };
  });
}

function buildResult(runId: string, view: ConstraintView): FrontierResult {
  const branch = BRANCHES[view];
  const mdp = MDP[view];
  const notConverged = new Set(NOT_CONVERGED[view]);
  const step = (branch.returnMax - branch.returnVertex) / (SAMPLES - 1);

  const points: FrontierPoint[] = Array.from({ length: SAMPLES }, (_, i) => {
    const targetReturn = branch.returnVertex + i * step;
    if (notConverged.has(i)) {
      return { targetReturn, sd: null, converged: false, metrics: null, holdings: [] };
    }
    const sd = sdAt(branch, targetReturn);
    return {
      targetReturn,
      sd,
      converged: true,
      metrics: metricsFor(branch, targetReturn, sd, mdp.d),
      holdings: holdingsFor(branch, view, targetReturn, sd),
    };
  });

  // The tangency portfolio is the point of maximum Sharpe among those the
  // solver reached — found by scanning the returned points, never re-derived.
  let tangencyIndex = 0;
  for (const [i, point] of points.entries()) {
    if (!point.metrics) continue;
    if (point.metrics.sharpe > (points[tangencyIndex].metrics?.sharpe ?? -Infinity)) {
      tangencyIndex = i;
    }
  }

  // The run's own target: 8.40% where the branch reaches it, else its top.
  const runTargetIndex = Math.min(
    points.length - 1,
    Math.max(0, Math.round((8.4 - branch.returnVertex) / step)),
  );

  const notable: NotablePortfolio[] = [
    {
      id: 'gmvp',
      name: 'GMVP',
      metrics: points[0].metrics!,
      pointIndex: 0,
    },
    {
      id: 'tangency',
      name: 'Tangency',
      metrics: points[tangencyIndex].metrics!,
      pointIndex: tangencyIndex,
    },
    {
      id: 'mdp',
      name: 'MDP',
      metrics: {
        expectedReturn: mdp.expectedReturn,
        sd: mdp.sd,
        sharpe: (mdp.expectedReturn - RISK_FREE_RATE) / mdp.sd,
        diversificationRatio: mdp.d,
        weightedAvgCorrelation: 0.19,
        concentrationRatio: concentrationFrom(mdp.d, 0.19),
        correlationWithMdp: 1,
      },
      // Maximising D(w) is a different program from minimising variance at a
      // target return, so the MDP sits inside the feasible region, not on the
      // frontier — there is no point index to give.
      pointIndex: null,
    },
  ];

  // The branch below the vertex: minimum variance, but dominated (§3). Drawn
  // only a short way down — enough to show the vertex separating the two
  // branches, without stretching the value axis to make room for portfolios
  // nobody would hold.
  const inefficientBranch: (readonly [number, number])[] = Array.from(
    { length: 16 },
    (_, i) => {
      const targetReturn = branch.returnVertex - (i * 2.1) / 15;
      return [sdAt(branch, targetReturn), targetReturn] as const;
    },
  );

  const assets: AssetPoint[] = UNIVERSE.map(([ticker, , sd, expectedReturn]) => ({
    ticker,
    sd,
    expectedReturn,
  }));

  return {
    runId,
    constraintView: view,
    universeSize: UNIVERSE.length,
    riskFreeRate: RISK_FREE_RATE,
    correlationInvertible: true,
    points,
    inefficientBranch,
    assets,
    notable,
    runTargetIndex,
  };
}

/**
 * Optimisation results in the risk-return plane, per `docs/08`.
 *
 * The HTTP client is not wired yet. This stands in with the same shape: it
 * returns a frontier the solver would have sampled, and every scalar the page
 * shows — Sharpe, D(w), ρ(w), CR(w), the risk contributions — arrives with it.
 * Nothing on this page is worked out client-side, which is the rule that keeps
 * a displayed figure from disagreeing with the run that produced it.
 */
@Injectable({ providedIn: 'root' })
export class FrontierService {
  private readonly _state = signal<FrontierState>('loading');
  private readonly _result = signal<FrontierResult | null>(null);
  private readonly _runId = signal(RUNS[0].id);
  private readonly _constraintView = signal<ConstraintView>('short-allowed');

  readonly state = this._state.asReadonly();
  readonly result = this._result.asReadonly();
  readonly runId = this._runId.asReadonly();
  readonly constraintView = this._constraintView.asReadonly();

  /** Only runs that finished a frontier computation are offered. */
  readonly runs = RUNS.filter((run) => run.computed.length > 0);

  /** Set on the next load, to exercise the error state. */
  private failNext = false;

  run(id: string): FrontierRun | undefined {
    return RUNS.find((r) => r.id === id);
  }

  /**
   * Loads one run under one constraint set.
   *
   * Both the run selector and the constraint toggle go through here, because
   * the spec has both of them return the page to its loading state rather than
   * swapping data underneath a populated view.
   */
  async load(runId = this._runId(), view = this._constraintView()): Promise<void> {
    this._runId.set(runId);
    this._constraintView.set(view);
    this._state.set('loading');
    this._result.set(null);

    await delay(LATENCY_MS);

    if (this.failNext) {
      this.failNext = false;
      this._state.set('error');
      return;
    }

    const run = this.run(runId);
    if (!run || !run.computed.includes(view)) {
      this._state.set('empty');
      return;
    }

    this._result.set(buildResult(runId, view));
    this._state.set('ready');
  }

  /** Makes the next load fail — the retry path in the error state. */
  failOnce(): void {
    this.failNext = true;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
