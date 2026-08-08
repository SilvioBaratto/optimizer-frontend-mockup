/**
 * Types behind `docs/09 Backtest & Validation.md` — deciding whether a
 * backtest's numbers can be believed before anyone acts on them.
 *
 * One quantity ties the page together: the Sharpe ratio of the strategy that
 * was selected. The haircut and the deflation are both discounts applied to
 * that one number, so it is modelled once, sourced from one trial, and carried
 * into every panel that discounts it — never restated per panel.
 */

/** Outcome of one validation criterion. */
export type CriterionStatus = 'pass' | 'warn' | 'fail' | 'not-set' | 'calculating' | 'error';

/** The seven sections, in the order the page presents them. */
export type SectionId =
  | 'trial-log'
  | 'oos-test'
  | 'multiple-testing'
  | 'haircut-sr'
  | 'deflated-sr'
  | 'pbo'
  | 'rationale';

export interface SectionMeta {
  id: SectionId;
  /** Full heading, used as the section's `<h2>`. */
  title: string;
  /** Abbreviated label for the in-page nav. */
  navLabel: string;
}

export const SECTIONS: readonly SectionMeta[] = [
  { id: 'trial-log', title: 'Trial log', navLabel: 'Trial Log' },
  { id: 'oos-test', title: 'Out-of-sample test', navLabel: 'OOS Test' },
  { id: 'multiple-testing', title: 'Multiple testing correction', navLabel: 'Mult. Testing' },
  { id: 'haircut-sr', title: 'Haircut Sharpe ratio', navLabel: 'Haircut SR' },
  { id: 'deflated-sr', title: 'Deflated Sharpe ratio', navLabel: 'Deflated SR' },
  { id: 'pbo', title: 'Probability of backtest overfitting', navLabel: 'PBO' },
  { id: 'rationale', title: 'Economic rationale', navLabel: 'Rationale' },
];

/** One logged attempt. Every variant tried counts, including discarded ones. */
export interface Trial {
  id: string;
  /** ISO date. */
  date: string;
  variant: string;
  /**
   * In-sample Sharpe, annualised. Null where the log has no record — a gap
   * that is itself the finding, so it is never silently treated as zero.
   */
  sharpeIs: number | null;
  loggedBy: string | null;
  outcome: 'selected' | 'discarded' | 'no-record';
}

/**
 * The Sharpe ratio every discount on this page is applied to.
 *
 * Carried as one object with its provenance attached, because the panels that
 * discount it must be able to say which trial it came from. Showing a bare
 * number in two panels leaves a reader unable to check they are the same one.
 */
export interface SelectedSharpe {
  /** Annualised Sharpe ratio, Ŝ R. */
  value: number;
  /** Trial the value belongs to. */
  trialId: string;
  variant: string;
  /** How it is labelled wherever it appears. */
  provenance: string;
}

export interface TrialLogSummary {
  /** M — every trial attempted. */
  totalTrials: number;
  /** ρ̂ — average pairwise correlation between trials. */
  averageCorrelation: number;
  /** N̄ = ρ̂ + (1 − ρ̂)M — independent trials implied by that correlation. */
  independentTrials: number;
  /** Whether anyone has confirmed the log lists every variant tested. */
  completenessConfirmed: boolean;
}

export interface OutOfSampleTest {
  /** Share of the sample held in-sample, percent. */
  inSamplePercent: number;
  /** Date the in-sample window ends. */
  splitDate: string;
  navDates: readonly string[];
  navInSample: readonly (number | null)[];
  navOutOfSample: readonly (number | null)[];
  sharpeIs: number;
  sharpeOos: number;
  maxDrawdownIs: number;
  maxDrawdownOos: number;
  /** Every re-run of the holdout is itself a trial and adds to M. */
  holdoutReruns: number;
}

export type CorrectionMethod = 'bonferroni' | 'holm' | 'bhy';

export interface CorrectionRow {
  method: CorrectionMethod;
  label: string;
  /** What the procedure controls — FWER or FDR. */
  controls: string;
  adjustedP: number;
  rejectsNull: boolean;
}

export interface MultipleTesting {
  alpha: number;
  /** Unadjusted p-value of the selected strategy. */
  singleP: number;
  rows: readonly CorrectionRow[];
  /** Which row drives the summary badge. */
  method: CorrectionMethod;
}

export interface HaircutSharpe {
  /** p^M = 1 − (1 − p^S)^N. */
  multipleP: number;
  /** ĤSR, annualised. */
  haircutSharpe: number;
  /** hc = (ŜR − ĤSR)/ŜR. */
  proportionalDiscount: number;
  /** Independent trials the discount assumes. */
  trials: number;
  /** User-set floor; null until set, and the badge says so rather than guessing. */
  minimumAcceptable: number | null;
  /** The discount curve against assumed trial count. */
  curve: readonly { trials: number; haircutSharpe: number; discount: number }[];
}

export interface DeflatedSharpe {
  /** N — independent trials assumed. Prefilled from N̄, editable for sensitivity. */
  trials: number;
  /** V[{ŜR_n}] — variance of the Sharpe ratios tested. */
  varianceOfSharpes: number;
  /** T — length of the return series. */
  sampleLength: number;
  /** γ̂₃ and γ̂₄ of the selected strategy's returns. */
  skewness: number;
  kurtosis: number;
  /** ŜR₀ = E[max{ŜR_n}], annualised. */
  expectedMaxSharpe: number;
  deflatedSharpe: number;
  acceptanceThreshold: number;
}

export interface LogitBin {
  label: string;
  /** Share of combinations in this bin, percent. */
  share: number;
  /** Whether the bin sits left of zero, and so counts toward the PBO. */
  belowZero: boolean;
}

export interface PboCscv {
  /** S — partitions. Even, so the combinations split in half. */
  partitions: number;
  /** C(S, S/2). */
  combinations: number;
  threshold: number;
  /** φ — the mass of the logit distribution left of zero. */
  pbo: number;
  bins: readonly LogitBin[];
  /** Slope of OOS Sharpe regressed on IS Sharpe; negative means overfitting. */
  regressionSlope: number;
  slopeCiLow: number;
  slopeCiHigh: number;
  /** Prob[OOS Sharpe < 0] — can be high even when the PBO is near zero. */
  probNegativeOos: number;
  secondOrderDominance: boolean;
}

export interface EconomicRationale {
  text: string;
  /** Attestation that the reasoning predates, and is independent of, this backtest. */
  independentlyDocumented: boolean;
  author: string;
  lastSaved: string | null;
  /** Once locked the text cannot change — that is the point of locking it. */
  locked: boolean;
}

/** One line of the summary card. */
export interface CriterionSummary {
  section: SectionId;
  label: string;
  status: CriterionStatus;
  detail: string;
}
