import { Injectable, computed, signal } from '@angular/core';

import {
  type ConvenienceVerdict,
  type ExchangeCandidate,
  type FrontierPoint,
  type ProposedExchange,
  type RecalcStage,
  type RevisionAction,
  type RevisionClassification,
  type RevisionCost,
  type RevisionMethod,
  type RevisionRow,
  type SignalFactor,
  type SubmitAction,
  type SubmitOutcome,
} from '../models/review-rebalancing.model';

export type PageState = 'loading' | 'ready' | 'empty' | 'error';

const LATENCY_MS = 700;
const SEND_MS = 900;

/** Portfolio value, against which weights become cash amounts. */
const CAPITAL = 1_000_000;

/** Fixed cost of collecting and processing the data — paid either way (§4). */
const DATA_COST = 1240;

/** θ — the systematic-risk correction Stone-Hill applies to each return. */
const THETA = 2.0;

/** |Δ| below this is treated as inside tolerance and not traded. */
const TOLERANCE = 0.0005;

/**
 * The book: the three names from the worked example, plus the rest of the
 * portfolio around them.
 *
 * The first three carry the document's own figures — a single day's shift in
 * the estimation window moving x₁ from 0.69193 to 0.96600 (§2). They are the
 * numbers a reader will check, so they are exact.
 */
const BOOK: readonly (readonly [string, string, number, number, number, number, number, number, number])[] = [
  // ticker, name, z_t, z_{t+Δt}, r %, bc %, sc %, realised gain, β
  ['X1', 'Alleanza Assicurazioni', 0.69193, 0.966, 5.72, 0.35, 0.3, 0, 1.12],
  ['X2', 'Fondiaria-Sai', 0.52029, 0.095, 2.7, 0.35, 0.3, 8115, 0.94],
  ['X3', 'Unicredito Italiano', -0.21223, -0.061, 3.5, 0.4, 0.35, 0, 1.31],
  ['X4', 'Generali', 0.142, 0.142, 3.1, 0.3, 0.28, 0, 0.88],
  ['X5', 'Intesa Sanpaolo', 0.086, 0.131, 4.1, 0.32, 0.3, 0, 1.24],
  ['X6', 'Enel', 0.115, 0.07, 2.4, 0.28, 0.26, 1850, 0.71],
  ['X7', 'Eni', 0.093, 0.12, 3.8, 0.3, 0.28, 0, 0.96],
  ['X8', 'Telecom Italia', -0.064, -0.091, 1.9, 0.42, 0.38, 0, 1.05],
  ['X9', 'Mediobanca', 0.051, 0.051, 3.2, 0.34, 0.31, 0, 1.08],
  ['X10', 'Snam', 0.042, 0.042, 2.6, 0.26, 0.24, 0, 0.62],
  ['X11', 'Prysmian', -0.375, -0.363, 4.4, 0.36, 0.33, 0, 1.18],
  ['X12', 'Moncler', -0.09, -0.102, 5.1, 0.38, 0.35, 0, 1.35],
];

/** Signals the persistence panel can inspect, with their measured decay (§8). */
const FACTORS: readonly SignalFactor[] = [
  {
    id: 'e2p',
    name: 'Earnings-to-price (E2PFY0)',
    autocorrelation: 0.96,
    category: 'value',
    laggedIc: [0.041, 0.039, 0.038, 0.036, 0.035, 0.034, 0.032, 0.031],
  },
  {
    id: 'b2p',
    name: 'Book-to-price (B2P)',
    autocorrelation: 0.93,
    category: 'value',
    laggedIc: [0.036, 0.034, 0.033, 0.031, 0.03, 0.028, 0.027, 0.026],
  },
  {
    id: 'ret9',
    name: 'Price momentum (Ret9Monx1)',
    autocorrelation: 0.6,
    category: 'momentum',
    laggedIc: [0.068, 0.049, 0.031, 0.017, 0.006, -0.002, -0.007, -0.009],
  },
  {
    id: 'earnrev',
    name: 'Earnings revision (EarnRev9)',
    autocorrelation: 0.64,
    category: 'momentum',
    laggedIc: [0.058, 0.043, 0.029, 0.018, 0.009, 0.003, -0.001, -0.004],
  },
  {
    id: 'rnoa',
    name: 'Return on net operating assets (RNOA)',
    autocorrelation: 0.89,
    category: 'quality',
    laggedIc: [0.033, 0.031, 0.029, 0.028, 0.026, 0.025, 0.024, 0.022],
  },
];

/**
 * The three points Smith places on the updated frontier (§3).
 *
 * The frontier is a parabola in the Var–E plane with its vertex at the global
 * minimum-variance portfolio. A and C are pinned by their definitions — A holds
 * the current expected return and cuts variance, C holds the current variance
 * and lifts return — so the curve is fitted through them rather than drawn
 * freehand, and the current holding then falls below it, which is exactly the
 * situation that makes a revision worth considering.
 */
const VERTEX_VARIANCE = 0.03;
const VERTEX_RETURN = 2.2;
const CURVATURE = 0.014815;
const CURRENT_VARIANCE = 0.06;
const CURRENT_RETURN = 3.1;

function varianceAt(expectedReturn: number): number {
  return VERTEX_VARIANCE + CURVATURE * (expectedReturn - VERTEX_RETURN) ** 2;
}

function returnAt(variance: number): number {
  return VERTEX_RETURN + Math.sqrt(Math.max(0, (variance - VERTEX_VARIANCE) / CURVATURE));
}

function actionFor(row: { currentWeight: number; delta: number }): RevisionAction {
  if (Math.abs(row.delta) < TOLERANCE) return 'hold';
  if (row.delta > 0) return row.currentWeight < 0 ? 'buy-short-reduced' : 'buy';
  return row.currentWeight < 0 ? 'sell-short-increased' : 'sell';
}

/**
 * Revision decision for the current portfolio, per `docs/10`.
 *
 * The HTTP client is not wired yet. The weights, expected returns and realised
 * gains are what the API would send; everything derived from them — traded
 * amounts, per-asset transaction cost, tax, the total prc and the verdict — is
 * computed here because every one of those responds to a field the user edits.
 * A hardcoded total would stop being the total the moment a cost input changed.
 */
@Injectable({ providedIn: 'root' })
export class ReviewRebalancingService {
  private readonly _state = signal<PageState>('loading');
  readonly state = this._state.asReadonly();

  /** Set when a recalculation stage fails, so the retry can restart just it. */
  private readonly _failedStage = signal<RecalcStage | null>(null);
  readonly failedStage = this._failedStage.asReadonly();

  readonly capital = CAPITAL;
  readonly method = signal<RevisionMethod>('smith');
  readonly classification = signal<RevisionClassification>('neither');

  readonly asOf = '2026-07-31';
  readonly previousAsOf = '2026-07-30';
  /** Days since the estimation window closed; drives the staleness notice. */
  readonly windowAgeDays = signal(9);

  // --- cost inputs ----------------------------------------------------------
  readonly taxRate = signal(26);
  /** Per-asset overrides of bc_i and sc_i, keyed by ticker. */
  private readonly buyCostOverrides = signal<Record<string, number>>({});
  private readonly sellCostOverrides = signal<Record<string, number>>({});

  setBuyCost(ticker: string, value: number): void {
    this.buyCostOverrides.update((m) => ({ ...m, [ticker]: Math.max(0, value) }));
  }

  setSellCost(ticker: string, value: number): void {
    this.sellCostOverrides.update((m) => ({ ...m, [ticker]: Math.max(0, value) }));
  }

  // --- rows -----------------------------------------------------------------

  readonly rows = computed<RevisionRow[]>(() => {
    const buyOverrides = this.buyCostOverrides();
    const sellOverrides = this.sellCostOverrides();

    return BOOK.map(([ticker, name, current, revised, r, bc, sc, gain, beta]) => {
      const delta = revised - current;
      const buyCost = buyOverrides[ticker] ?? bc;
      const sellCost = sellOverrides[ticker] ?? sc;
      const traded = Math.abs(delta) * CAPITAL;
      const action = actionFor({ currentWeight: current, delta });
      const rate = delta > 0 ? buyCost : sellCost;

      return {
        ticker,
        name,
        currentWeight: current,
        revisedWeight: revised,
        delta,
        action,
        expectedReturn: r,
        tradedAmount: traded,
        buyCost,
        sellCost,
        transactionCost: (traded * rate) / 100,
        realisedGain: gain,
        taxDue: (gain * this.taxRate()) / 100,
        beta,
        correctedReturn: r - beta * THETA,
      };
    });
  });

  /** Σ Δ — the control total. Buys and sells have to net out. */
  readonly deltaSum = computed(() => this.rows().reduce((sum, r) => sum + r.delta, 0));

  /**
   * A sum this far from zero means the two weight vectors do not describe the
   * same amount of capital, so the costs below are being computed on a trade
   * that cannot be executed as stated.
   */
  readonly deltaSumAnomalous = computed(() => Math.abs(this.deltaSum()) > 0.001);

  readonly tradingRows = computed(() => this.rows().filter((r) => r.action !== 'hold'));

  // --- Stone-Hill exchange ranking (§3) -------------------------------------

  readonly theta = THETA;

  /** Buy candidates ranked by c_i − bc_i, best first. */
  readonly buyRanking = computed<ExchangeCandidate[]>(() =>
    this.rows()
      .map((r) => ({
        ticker: r.ticker,
        name: r.name,
        score: r.correctedReturn - r.buyCost,
        correctedReturn: r.correctedReturn,
        cost: r.buyCost,
        limit: 0.35,
        currentWeight: r.currentWeight,
      }))
      .sort((a, b) => b.score - a.score),
  );

  /** Held positions ranked by c_j + sc_j, worst first — the first to release. */
  readonly sellRanking = computed<ExchangeCandidate[]>(() =>
    this.rows()
      .filter((r) => r.currentWeight > 0)
      .map((r) => ({
        ticker: r.ticker,
        name: r.name,
        score: r.correctedReturn + r.sellCost,
        correctedReturn: r.correctedReturn,
        cost: r.sellCost,
        limit: 0.35,
        currentWeight: r.currentWeight,
      }))
      .sort((a, b) => a.score - b.score),
  );

  /** Buy i and sell j is worth doing when c_i − c_j > bc_i + sc_j. */
  readonly proposedExchange = computed<ProposedExchange | null>(() => {
    const buy = this.buyRanking()[0];
    const sell = this.sellRanking()[0];
    if (!buy || !sell || buy.ticker === sell.ticker) return null;

    const advantage = buy.correctedReturn - sell.correctedReturn;
    const hurdle = buy.cost + sell.cost;
    // Bounded by what the f_i cap leaves room for, and by the position on offer.
    const room = Math.max(0, buy.limit - buy.currentWeight);
    return {
      buy,
      sell,
      advantage,
      hurdle,
      worthwhile: advantage > hurdle,
      amount: Math.min(room, sell.currentWeight) * CAPITAL,
    };
  });

  // --- frontier -------------------------------------------------------------

  readonly currentPoint: FrontierPoint = {
    label: 'z*ₜ',
    variance: CURRENT_VARIANCE,
    expectedReturn: CURRENT_RETURN,
    description: 'the current holding, now below the updated frontier',
    actionable: false,
  };

  readonly smithPoints = computed<FrontierPoint[]>(() => [
    {
      label: 'A',
      variance: varianceAt(CURRENT_RETURN),
      expectedReturn: CURRENT_RETURN,
      description: 'same expected return, lower variance',
      // A pure risk reduction has no numeraire return to weigh against the cost.
      actionable: false,
    },
    {
      label: 'B',
      variance: varianceAt(3.4),
      expectedReturn: 3.4,
      description: 'tangency with the preference function',
      // The preference function is never specified, so B cannot be targeted.
      actionable: false,
    },
    {
      label: 'C',
      variance: CURRENT_VARIANCE,
      expectedReturn: returnAt(CURRENT_VARIANCE),
      description: 'same variance, higher expected return — the revision target',
      actionable: true,
    },
  ]);

  /** The updated frontier, sampled across the plotted range. */
  readonly frontierCurve = computed<readonly (readonly [number, number])[]>(() => {
    const points: (readonly [number, number])[] = [];
    for (let i = 0; i <= 40; i++) {
      const e = VERTEX_RETURN + (i * 2.4) / 40;
      points.push([varianceAt(e), e] as const);
    }
    return points;
  });

  // --- cost and verdict -----------------------------------------------------

  readonly cost = computed<RevisionCost>(() => {
    const rows = this.rows();
    const transaction = rows.reduce((sum, r) => sum + r.transactionCost, 0);
    const capitalGainTax = rows.reduce((sum, r) => sum + r.taxDue, 0);
    return {
      dataProcessing: DATA_COST,
      transaction,
      capitalGainTax,
      total: DATA_COST + transaction + capitalGainTax,
    };
  });

  readonly verdict = computed<ConvenienceVerdict>(() => {
    // Σ (z*_{t+Δt,i} − z*_{t,i}) · P · r_{t+Δt,i}  (§6).
    const gain = this.rows().reduce(
      (sum, r) => sum + r.delta * CAPITAL * (r.expectedReturn / 100),
      0,
    );
    const cost = this.cost().total;
    return { deltaExpectedReturn: gain, cost, surplus: gain - cost, convenient: gain > cost };
  });

  /** No candidate exists unless the current holding is neither optimal nor efficient. */
  readonly hasCandidate = computed(() => this.classification() === 'neither');

  // --- signal persistence (§7–§9) -------------------------------------------

  readonly factors = FACTORS;
  readonly factorId = signal(FACTORS[2].id);
  readonly icView = signal<'conventional' | 'lagged' | 'horizon'>('conventional');

  readonly factor = computed(
    () => FACTORS.find((f) => f.id === this.factorId()) ?? FACTORS[0],
  );

  /** ρ_target, the autocorrelation the combined forecast is constrained to. */
  readonly targetAutocorrelation = signal(0.71);

  /** Turnover at the factor's own autocorrelation — the starting point. */
  readonly baseTurnover = computed(() => {
    const rho = this.factor().autocorrelation;
    // T ∝ √(1 − ρ_f): the same scaling the moving-average argument uses (§9).
    return 18.4 * Math.sqrt((1 - rho) / (1 - 0.6));
  });

  /** Turnover falls monotonically as the forecast is made more persistent. */
  turnoverAt(rho: number): number {
    const base = this.factor().autocorrelation;
    return this.baseTurnover() * Math.sqrt((1 - rho) / Math.max(1e-6, 1 - base));
  }

  /**
   * The information ratio rises, peaks, then falls as ρ_target climbs — the
   * peak is the turnover the signal actually justifies (§9).
   */
  informationRatioAt(rho: number): number {
    const peak = 2.39;
    const at = 0.89;
    const k = rho <= at ? 6.2 : 22;
    return Math.max(0, peak - k * (rho - at) ** 2);
  }

  readonly turnover = computed(() => this.turnoverAt(this.targetAutocorrelation()));
  readonly informationRatio = computed(() =>
    this.informationRatioAt(this.targetAutocorrelation()),
  );

  /** ρ_target that maximises the information ratio, over the plotted grid. */
  readonly optimalAutocorrelation = 0.89;

  // --- dynamic trading plan (§10–§12) ---------------------------------------

  /** Configured in Objective & Constraints; read-only here. */
  readonly riskAversion = 0.3126;
  readonly costParameter = 1.0;
  readonly discount = 0.02;

  /** a, from the closed form of Proposition 2. */
  readonly tradeCoefficient = computed(() => {
    const g = this.riskAversion;
    const l = this.costParameter;
    const p = this.discount;
    return (-(g + l * p) + Math.sqrt((g + l * p) ** 2 + 4 * g * l * (1 - p))) / (2 * (1 - p) * l);
  });

  /** a/λ — the share of the gap to the aim portfolio closed each period. */
  readonly tradeRate = computed(() => this.tradeCoefficient() / this.costParameter);

  /** z = γ/(γ + a) — the weight the aim puts on today's Markowitz portfolio. */
  readonly aimWeight = computed(() => this.riskAversion / (this.riskAversion + this.tradeCoefficient()));

  /** Positions whose distance from the aim exceeds the rebalancing tolerance. */
  readonly beyondTolerance = computed(
    () => this.aimComparison().filter((a) => Math.abs(a.aim - a.current) > 0.02).length,
  );

  readonly aimComparison = computed(() =>
    this.rows()
      .slice(0, 8)
      .map((r) => ({
        ticker: r.ticker,
        current: r.currentWeight,
        // The aim is the Markowitz portfolio with each signal shrunk by its own
        // mean reversion, so a fast-decaying signal pulls the aim less (§11).
        aim: r.revisedWeight * (1 - 0.18 * (r.beta - 1)),
      })),
  );

  /** Convergence of one position toward a fixed aim, at rate a/λ (§11). */
  readonly homingPath = computed(() => {
    const rate = this.tradeRate();
    const aim = 0.966;
    let position = 0.69193;
    const path: { period: number; position: number; aim: number }[] = [];
    for (let t = 0; t <= 12; t++) {
      path.push({ period: t, position, aim });
      position += rate * (aim - position);
    }
    return path;
  });

  /**
   * Sharpe of the three policies, gross and net of trading cost (§12).
   *
   * Markowitz wins gross and loses badly net; the dynamic policy wins net,
   * because it trades toward persistent signals rather than chasing every one.
   */
  readonly policyComparison = [
    { policy: 'Markowitz (no cost model)', gross: 1.42, net: 0.31 },
    { policy: 'Static rebalancing', gross: 1.18, net: 0.86 },
    { policy: 'Dynamic (aim portfolio)', gross: 1.24, net: 1.03 },
  ];

  // --- submit ---------------------------------------------------------------

  private readonly outcomes = signal<Record<SubmitAction, SubmitOutcome>>({
    approve: idleOutcome(),
    hold: idleOutcome(),
    forward: idleOutcome(),
  });

  outcome(action: SubmitAction): SubmitOutcome {
    return this.outcomes()[action];
  }

  readonly anySending = computed(() =>
    Object.values(this.outcomes()).some((o) => o.state === 'sending'),
  );

  readonly latestOutcome = computed(() => {
    const all = this.outcomes();
    const order: SubmitAction[] = ['approve', 'hold', 'forward'];
    return order.map((a) => ({ action: a, outcome: all[a] })).find((x) => x.outcome.state !== 'idle') ?? null;
  });

  /** One transient failure per action, so the retry path is reachable. */
  private readonly attempted = new Set<SubmitAction>();

  async submit(action: SubmitAction): Promise<void> {
    this.setOutcome(action, { state: 'sending', reference: null, at: null, message: null });
    await delay(SEND_MS);

    const firstTry = !this.attempted.has(action);
    this.attempted.add(action);
    if (firstTry) {
      this.setOutcome(action, {
        state: 'error',
        reference: null,
        at: null,
        message: 'Gateway timeout. Nothing was routed; the recalculation is untouched.',
      });
      return;
    }

    this.setOutcome(action, {
      state: 'sent',
      reference: `A-${441 + this.attempted.size}`,
      at: new Date().toTimeString().slice(0, 5),
      message: null,
    });
  }

  private setOutcome(action: SubmitAction, outcome: SubmitOutcome): void {
    this.outcomes.update((m) => ({ ...m, [action]: outcome }));
  }

  // --- lifecycle ------------------------------------------------------------

  /** Set to make the next load fail at a given stage. */
  private failStage: RecalcStage | null = null;

  failNextAt(stage: RecalcStage): void {
    this.failStage = stage;
  }

  async load(): Promise<void> {
    this._state.set('loading');
    this._failedStage.set(null);
    await delay(LATENCY_MS);

    if (this.failStage) {
      this._failedStage.set(this.failStage);
      this.failStage = null;
      this._state.set('error');
      return;
    }
    this._state.set('ready');
  }

  /** Switching method recomputes the candidate only — no refetch. */
  setMethod(method: RevisionMethod): void {
    this.method.set(method);
  }
}

function idleOutcome(): SubmitOutcome {
  return { state: 'idle', reference: null, at: null, message: null };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
