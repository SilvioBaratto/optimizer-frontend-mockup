/**
 * Types behind `docs/10 Review & Rebalancing.md` — deciding whether to move the
 * portfolio the market has drifted away from, or leave it alone.
 *
 * The page turns on one comparison: the expected return the revision would add,
 * against what the revision costs. Both sides are money, so the verdict is a
 * subtraction — and every input to it is editable, which is why the costs are
 * modelled per asset rather than as three totals.
 */

/** Which model picks the revision candidate (Fondamenti §3). */
export type RevisionMethod = 'smith' | 'stone-hill';

export const METHOD_LABEL: Record<RevisionMethod, string> = {
  smith: 'Smith',
  'stone-hill': 'Stone-Hill',
};

/**
 * Where the current portfolio stands under the updated parameters.
 *
 * Only `neither` produces a revision candidate: still-optimal needs no change,
 * and still-efficient is a holding the investor is assumed content with.
 */
export type RevisionClassification = 'optimal' | 'efficient' | 'neither';

export const CLASSIFICATION_LABEL: Record<RevisionClassification, string> = {
  optimal: 'Optimal',
  efficient: 'Efficient (hold)',
  neither: 'Neither — candidate C',
};

/** What the weight change implies for the position. */
export type RevisionAction = 'buy' | 'sell' | 'hold' | 'buy-short-reduced' | 'sell-short-increased';

/**
 * The verb, kept short enough to read inside a badge. The qualifier is carried
 * separately so a narrow column can wrap it instead of clipping it.
 */
export const ACTION_LABEL: Record<RevisionAction, string> = {
  buy: 'BUY',
  sell: 'SELL',
  hold: 'HOLD',
  'buy-short-reduced': 'BUY',
  'sell-short-increased': 'SELL',
};

export const ACTION_NOTE: Record<RevisionAction, string> = {
  buy: '',
  sell: '',
  hold: 'inside tolerance',
  'buy-short-reduced': 'short reduced',
  'sell-short-increased': 'short increased',
};

/** One asset, current against revised. */
export interface RevisionRow {
  ticker: string;
  name: string;
  /** z*_t — the weight selected at t. */
  currentWeight: number;
  /** z*_{t+Δt} — the weight the updated parameters call for. */
  revisedWeight: number;
  /** Δ = revised − current. */
  delta: number;
  action: RevisionAction;
  /** Expected return r_{t+Δt,i}, percent. */
  expectedReturn: number;
  /** Cash traded, in currency. */
  tradedAmount: number;
  /** bc_i — buy cost, percent of the amount traded. */
  buyCost: number;
  /** sc_i — sell cost, percent. */
  sellCost: number;
  /** The transaction cost this row actually incurs, in currency. */
  transactionCost: number;
  /**
   * Capital gain the sale realises, in currency. Zero on a buy, and zero on a
   * sale that realises nothing — the tax is a variable cost, owed only when a
   * disposal actually books a gain (§5).
   */
  realisedGain: number;
  taxDue: number;
  /** β_i, for the systematic-risk correction Stone-Hill applies. */
  beta: number;
  /** c_i = r_i − β_i·θ — the return corrected for systematic risk. */
  correctedReturn: number;
}

/** One side of the Stone-Hill exchange ranking (§3). */
export interface ExchangeCandidate {
  ticker: string;
  name: string;
  /** c_i − bc_i for a buy candidate, c_j + sc_j for a held position. */
  score: number;
  correctedReturn: number;
  /** bc_i or sc_j, whichever applies to this side. */
  cost: number;
  /** f_i — upper bound on the weight. */
  limit: number;
  currentWeight: number;
}

/**
 * The swap the exchange rule proposes: buy the top-ranked candidate, sell the
 * bottom-ranked holding, and only when c_i − c_j exceeds bc_i + sc_j.
 */
export interface ProposedExchange {
  buy: ExchangeCandidate;
  sell: ExchangeCandidate;
  /** c_i − c_j. */
  advantage: number;
  /** bc_i + sc_j — the hurdle the advantage has to clear. */
  hurdle: number;
  worthwhile: boolean;
  /** Amount the f_i limits allow, in currency. */
  amount: number;
}

/** A point in the Var(X)–E(X) plane. */
export interface FrontierPoint {
  label: string;
  variance: number;
  expectedReturn: number;
  description: string;
  /** Whether a revision can actually be aimed at this point. */
  actionable: boolean;
}

export interface RevisionCost {
  /** Fixed: paid whether or not the portfolio is revised (§4). */
  dataProcessing: number;
  transaction: number;
  capitalGainTax: number;
  /** prc_{t+Δt}. */
  total: number;
}

export interface ConvenienceVerdict {
  /** Σ (z*_{t+Δt,i} − z*_{t,i})·P·r, in currency. */
  deltaExpectedReturn: number;
  cost: number;
  /** Gain minus cost; positive means the revision pays for itself. */
  surplus: number;
  convenient: boolean;
}

/** Which of the three information coefficients the panel is showing (§7). */
export type IcView = 'conventional' | 'lagged' | 'horizon';

export const IC_VIEW_LABEL: Record<IcView, string> = {
  conventional: 'Conventional',
  lagged: 'Lagged',
  horizon: 'Horizon',
};

export interface SignalFactor {
  id: string;
  name: string;
  /** ρ_f — forecast autocorrelation. Low means fast decay, high turnover (§8). */
  autocorrelation: number;
  category: 'value' | 'momentum' | 'quality';
  /** IC at lag 0, 1, 2, … */
  laggedIc: readonly number[];
}

/** One action the page can submit, each with its own independent cycle. */
export type SubmitAction = 'approve' | 'hold' | 'forward';

export type SubmitState = 'idle' | 'sending' | 'sent' | 'error';

export interface SubmitOutcome {
  state: SubmitState;
  /** Confirmation reference, when the send succeeded. */
  reference: string | null;
  at: string | null;
  message: string | null;
}

/** Which recalculation stage failed, so the retry can restart only that one. */
export type RecalcStage = 'data' | 'frontier' | 'costs';

export const RECALC_STAGE_LABEL: Record<RecalcStage, string> = {
  data: 'collecting and processing the data',
  frontier: 'recomputing the updated frontier',
  costs: 'computing the revision costs',
};
