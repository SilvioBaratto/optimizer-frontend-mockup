import { Injectable, computed, signal } from '@angular/core';

import {
  type CorrectionMethod,
  type CorrectionRow,
  type CriterionStatus,
  type CriterionSummary,
  type DeflatedSharpe,
  type HaircutSharpe,
  type LogitBin,
  type MultipleTesting,
  type OutOfSampleTest,
  type PboCscv,
  type SectionId,
  type SelectedSharpe,
  type Trial,
  type TrialLogSummary,
} from '../models/backtest-validation.model';
import { normalCdf, normalQuantile, twoSidedP } from './normal-distribution';

export type ValidationState = 'loading' | 'ready' | 'empty' | 'error';

const LATENCY_MS = 700;
/** How long a dependent section shows "Recalculating…" after an input changes. */
const RECALC_MS = 550;

/** Observations per year, for annualising a per-period Sharpe ratio. */
const PERIODS_PER_YEAR = 252;
/** Euler–Mascheroni, in the expected-maximum approximation. */
const EULER = 0.5772156649015329;

/** Below this many observations, γ̂₃ and γ̂₄ are not worth estimating. */
const MIN_SAMPLE_FOR_MOMENTS = 30;

/**
 * The strategy that was selected, and the Sharpe every discount applies to.
 *
 * One value, one provenance. The haircut and the deflation are two discounts on
 * this same number, so both panels display it read-only and name the trial it
 * came from — a reader has to be able to see that the two panels are
 * discounting the same thing.
 */
const SELECTED: SelectedSharpe = {
  value: 1.22,
  trialId: 'T-0187',
  variant: 'Momentum v3',
  provenance: 'Sharpe(IS) of T-0187, from the trial log',
};

/**
 * The four rows the spec names, pinned to the head of the log.
 *
 * Pinned rather than sorted in, so the selected trial is on the first page:
 * two panels below link back to its row, and a link into page nine of a
 * paginated table is not a link anyone can follow.
 */
const NAMED_TRIALS: readonly Trial[] = [
  {
    id: 'T-0187',
    date: '2026-06-02',
    variant: 'Momentum v3',
    sharpeIs: 1.22,
    loggedBy: 's.baratto',
    outcome: 'selected',
  },
  {
    id: 'T-0186',
    date: '2026-06-02',
    variant: 'Momentum v2 12m lookback',
    sharpeIs: 1.09,
    loggedBy: 's.baratto',
    outcome: 'discarded',
  },
  {
    id: 'T-0142',
    date: '2026-05-18',
    variant: 'Momentum v1 + vol target',
    sharpeIs: 0.94,
    loggedBy: 'a.rossi',
    outcome: 'discarded',
  },
  {
    id: 'T-0031',
    date: '2026-03-04',
    variant: 'Mean reversion 5d',
    sharpeIs: null,
    loggedBy: null,
    outcome: 'no-record',
  },
];

const VARIANT_FAMILIES = [
  'Momentum',
  'Mean reversion',
  'Carry',
  'Vol target',
  'Cross-sectional rank',
  'Breakout',
  'Seasonality',
  'Trend + filter',
];

const LOOKBACKS = ['3m', '6m', '9m', '12m', '18m', '24m'];
const AUTHORS = ['s.baratto', 'a.rossi', 'm.conti', 'l.ferrari'];

/** Annualised Sharpe implied by a two-sided p-value at sample length T. */
function sharpeFromP(p: number, sampleLength: number): number {
  return (normalQuantile(1 - p / 2) / Math.sqrt(sampleLength)) * Math.sqrt(PERIODS_PER_YEAR);
}

/** Two-sided p-value of an annualised Sharpe ratio at sample length T (§4). */
function pFromSharpe(annualSharpe: number, sampleLength: number): number {
  const perPeriod = annualSharpe / Math.sqrt(PERIODS_PER_YEAR);
  return twoSidedP(perPeriod * Math.sqrt(sampleLength));
}

/**
 * The full trial log.
 *
 * Variants of one strategy family, which is what makes their results
 * correlated and N̄ well below M. Deterministic in the index: the log has to
 * read the same on every render.
 */
function buildTrials(total: number): Trial[] {
  const trials: Trial[] = [...NAMED_TRIALS].slice(0, Math.max(0, total));
  const named = new Set(NAMED_TRIALS.map((t) => t.id));

  // Ids count down from a base chosen to cover the whole log with room to
  // spare. It has to scale with the total: M is editable and "Log a trial"
  // raises it, so a fixed base would run out of positive ids and leave this
  // loop skipping every candidate forever.
  const base = Math.max(200, total + 40);

  for (let i = 0; trials.length < total && i < base; i++) {
    const id = `T-${String(base - i).padStart(4, '0')}`;
    if (named.has(id)) continue;

    // Sharpe ratios fan out below the selected one; the strategy that was kept
    // is the best of the family, which is exactly the selection that needs
    // discounting.
    const spread = 0.5 + 0.5 * Math.sin(i * 1.31) + 0.35 * Math.cos(i * 0.57);
    const sharpe = Math.round((1.18 - 1.02 * (i / total) - 0.28 * spread) * 100) / 100;

    // A few rows predate the logging discipline — the gap is the finding.
    const missing = i % 37 === 11;
    const month = 6 - Math.floor(i / 32);
    const day = 1 + (i % 27);

    trials.push({
      id,
      date: `2026-${String(Math.max(1, month)).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      variant: `${VARIANT_FAMILIES[i % VARIANT_FAMILIES.length]} ${LOOKBACKS[i % LOOKBACKS.length]}`,
      sharpeIs: missing ? null : sharpe,
      loggedBy: missing ? null : AUTHORS[i % AUTHORS.length],
      outcome: missing ? 'no-record' : 'discarded',
    });
  }

  return trials;
}

/** Bonferroni, Holm and BHY over the recorded p-values (§3). */
function correctionRows(
  sortedP: readonly number[],
  selectedP: number,
  totalTrials: number,
  alpha: number,
): CorrectionRow[] {
  const n = sortedP.length;
  const m = Math.max(totalTrials, 1);
  const rank = Math.max(1, sortedP.findIndex((p) => p >= selectedP) + 1);

  const bonferroni = Math.min(m * selectedP, 1);

  let holm = 0;
  for (let j = 1; j <= rank && j <= n; j++) {
    holm = Math.max(holm, (m - j + 1) * sortedP[j - 1]);
  }
  holm = Math.min(holm, 1);

  // c(M) = Σ 1/j, which is what makes BHY valid under arbitrary dependence.
  let cM = 0;
  for (let j = 1; j <= m; j++) cM += 1 / j;

  const bhyAll = new Array<number>(n);
  bhyAll[n - 1] = Math.min(sortedP[n - 1], 1);
  for (let i = n - 1; i >= 1; i--) {
    bhyAll[i - 1] = Math.min(bhyAll[i], ((m * cM) / i) * sortedP[i - 1], 1);
  }
  const bhy = bhyAll[rank - 1];

  return [
    {
      method: 'bonferroni',
      label: 'Bonferroni',
      controls: 'FWER',
      adjustedP: bonferroni,
      rejectsNull: bonferroni < alpha,
    },
    { method: 'holm', label: 'Holm', controls: 'FWER', adjustedP: holm, rejectsNull: holm < alpha },
    { method: 'bhy', label: 'BHY', controls: 'FDR', adjustedP: bhy, rejectsNull: bhy < alpha },
  ];
}

/** E[max{ŜR_n}] over N independent trials, annualised (§5). */
function expectedMaxSharpe(trials: number, varianceOfSharpes: number): number {
  const n = Math.max(2, trials);
  return (
    Math.sqrt(Math.max(0, varianceOfSharpes)) *
    ((1 - EULER) * normalQuantile(1 - 1 / n) + EULER * normalQuantile(1 - 1 / (n * Math.E)))
  );
}

/** C(s, s/2) — the number of CSCV combinations. */
function combinations(s: number): number {
  const half = s / 2;
  let result = 1;
  for (let i = 1; i <= half; i++) result = (result * (s - half + i)) / i;
  return Math.round(result);
}

/**
 * Validation state for one backtest, per `docs/09`.
 *
 * The HTTP client is not wired yet. Unlike the other stand-ins in this app,
 * this one really does compute: the haircut, the expected maximum Sharpe, the
 * deflation and the three multiple-testing corrections are the formulas from
 * the domain notes, run over the trial log. They have to be, because every one
 * of them responds to a field the user edits — a hardcoded answer would stop
 * being the answer the moment N or α or S changed.
 */
@Injectable({ providedIn: 'root' })
export class BacktestValidationService {
  private readonly _state = signal<ValidationState>('loading');
  readonly state = this._state.asReadonly();

  readonly selectedSharpe = SELECTED;

  // --- trial log ------------------------------------------------------------
  /** M — editable, because the log is a declaration and may need correcting. */
  readonly totalTrials = signal(214);
  readonly averageCorrelation = signal(0.38);
  readonly completenessConfirmed = signal(false);

  private readonly allTrials = computed(() => buildTrials(this.totalTrials()));

  readonly trialSummary = computed<TrialLogSummary>(() => {
    const m = this.totalTrials();
    const rho = this.averageCorrelation();
    return {
      totalTrials: m,
      averageCorrelation: rho,
      // N̄ = ρ̂ + (1 − ρ̂)M — interpolates between 1 trial and M (§5).
      independentTrials: Math.max(1, Math.round(rho + (1 - rho) * m)),
      completenessConfirmed: this.completenessConfirmed(),
    };
  });

  // --- out-of-sample test ---------------------------------------------------
  readonly inSamplePercent = signal(70);
  readonly holdoutReruns = signal(3);

  readonly outOfSample = computed<OutOfSampleTest>(() => {
    const dates: string[] = [];
    const is: (number | null)[] = [];
    const oos: (number | null)[] = [];
    const points = 48;
    const splitAt = Math.round((points * this.inSamplePercent()) / 100);

    let nav = 1;
    for (let i = 0; i < points; i++) {
      const year = 2022 + Math.floor(i / 12);
      dates.push(`${year}-${String((i % 12) + 1).padStart(2, '0')}`);
      // Steadier in-sample, choppier and flatter after the split — the shape a
      // strategy fitted to its own history tends to have.
      const drift = i < splitAt ? 0.011 : 0.004;
      const wobble = i < splitAt ? 0.018 : 0.042;
      nav *= 1 + drift + wobble * Math.sin(i * 1.9);
      const value = Math.round(nav * 1000) / 1000;
      // The two series share the split point, so the line joins rather than
      // showing a false gap where the sample changes.
      is.push(i <= splitAt ? value : null);
      oos.push(i >= splitAt ? value : null);
    }

    return {
      inSamplePercent: this.inSamplePercent(),
      splitDate: dates[Math.min(splitAt, points - 1)],
      navDates: dates,
      navInSample: is,
      navOutOfSample: oos,
      sharpeIs: SELECTED.value,
      sharpeOos: 0.81,
      maxDrawdownIs: 8.4,
      maxDrawdownOos: 14.1,
      holdoutReruns: this.holdoutReruns(),
    };
  });

  // --- multiple testing -----------------------------------------------------
  readonly alpha = signal(0.05);
  readonly correctionMethod = signal<CorrectionMethod>('bhy');

  /** T — the length of the selected strategy's return series. */
  readonly sampleLength = signal(1250);

  private readonly selectedP = computed(() =>
    pFromSharpe(SELECTED.value, this.sampleLength()),
  );

  readonly multipleTesting = computed<MultipleTesting>(() => {
    const t = this.sampleLength();
    const recorded = this.allTrials()
      .map((trial) => trial.sharpeIs)
      .filter((s): s is number => s !== null)
      .map((s) => pFromSharpe(Math.max(0.01, s), t))
      .sort((a, b) => a - b);

    const selectedP = this.selectedP();
    const alpha = this.alpha();
    return {
      alpha,
      singleP: selectedP,
      rows: correctionRows(recorded, selectedP, this.totalTrials(), alpha),
      method: this.correctionMethod(),
    };
  });

  readonly activeCorrection = computed(() => {
    const mt = this.multipleTesting();
    return mt.rows.find((r) => r.method === mt.method) ?? mt.rows[0];
  });

  // --- haircut Sharpe ratio -------------------------------------------------
  readonly minimumAcceptableHsr = signal<number | null>(null);

  readonly haircut = computed<HaircutSharpe>(() => {
    const t = this.sampleLength();
    const pS = this.selectedP();
    const n = this.trialSummary().independentTrials;

    const at = (trials: number) => {
      // p^M = 1 − (1 − p^S)^N, then read the Sharpe back off that p-value.
      const pM = 1 - Math.pow(1 - pS, Math.max(1, trials));
      const hsr = sharpeFromP(pM, t);
      return { pM, hsr, discount: (SELECTED.value - hsr) / SELECTED.value };
    };

    const here = at(n);
    // Log-spaced, because the discount bites hardest over the first few dozen
    // trials and a linear axis would hide exactly that.
    const curve = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((trials) => {
      const point = at(trials);
      return { trials, haircutSharpe: point.hsr, discount: point.discount };
    });

    return {
      multipleP: here.pM,
      haircutSharpe: here.hsr,
      proportionalDiscount: here.discount,
      trials: n,
      minimumAcceptable: this.minimumAcceptableHsr(),
      curve,
    };
  });

  // --- deflated Sharpe ratio ------------------------------------------------
  /** Prefilled from N̄, then owned by the user for sensitivity work. */
  private readonly dsrTrialsOverride = signal<number | null>(null);
  readonly varianceOfSharpes = signal(0.5);
  readonly dsrThreshold = signal(0.95);
  readonly skewness = -3;
  readonly kurtosis = 10;

  readonly dsrTrials = computed(
    () => this.dsrTrialsOverride() ?? this.trialSummary().independentTrials,
  );

  /** A series this short cannot support a skewness or kurtosis estimate. */
  readonly momentsUnavailable = computed(() => this.sampleLength() < MIN_SAMPLE_FOR_MOMENTS);

  readonly deflated = computed<DeflatedSharpe>(() => {
    const trials = this.dsrTrials();
    const variance = this.varianceOfSharpes();
    const t = this.sampleLength();
    const sr0Annual = expectedMaxSharpe(trials, variance);

    // The deflation works in per-period units; the trial log and the cards
    // speak in annualised ones, so both are converted at the same factor.
    const scale = Math.sqrt(PERIODS_PER_YEAR);
    const sr = SELECTED.value / scale;
    const sr0 = sr0Annual / scale;
    const numerator = (sr - sr0) * Math.sqrt(Math.max(1, t - 1));
    const denominator = Math.sqrt(
      Math.max(1e-9, 1 - this.skewness * sr + ((this.kurtosis - 1) / 4) * sr * sr),
    );

    return {
      trials,
      varianceOfSharpes: variance,
      sampleLength: t,
      skewness: this.skewness,
      kurtosis: this.kurtosis,
      expectedMaxSharpe: sr0Annual,
      deflatedSharpe: normalCdf(numerator / denominator),
      acceptanceThreshold: this.dsrThreshold(),
    };
  });

  // --- PBO / CSCV -----------------------------------------------------------
  readonly partitions = signal(16);
  readonly pboThreshold = signal(0.05);

  /** S has to be even for the combinations to split into halves (§6). */
  readonly partitionsInvalid = computed(() => {
    const s = this.partitions();
    return !Number.isInteger(s) || s < 2 || s % 2 !== 0;
  });

  readonly pbo = computed<PboCscv>(() => {
    const s = this.partitions();
    // Finer partitions resolve the left tail a little better, so the estimate
    // moves with S rather than sitting inert while the field changes.
    const drift = (16 - s) * 0.0022;
    const shares = [0.4, 0.9, 1.8, 14.2, 31.5, 51.2].map((v, i) =>
      Math.max(0, v + (i < 3 ? drift * 100 * 0.4 : -drift * 100 * 0.13)),
    );
    const bins: LogitBin[] = [
      { label: 'λ < −2', share: shares[0], belowZero: true },
      { label: '−2 … −1', share: shares[1], belowZero: true },
      { label: '−1 … 0', share: shares[2], belowZero: true },
      { label: '0 … 1', share: shares[3], belowZero: false },
      { label: '1 … 2', share: shares[4], belowZero: false },
      { label: 'λ > 2', share: shares[5], belowZero: false },
    ];

    const pboValue =
      bins.filter((b) => b.belowZero).reduce((sum, b) => sum + b.share, 0) / 100;

    return {
      partitions: s,
      combinations: this.partitionsInvalid() ? 0 : combinations(s),
      threshold: this.pboThreshold(),
      pbo: pboValue,
      bins,
      regressionSlope: -0.42,
      slopeCiLow: -0.61,
      slopeCiHigh: -0.23,
      probNegativeOos: 0.18,
      secondOrderDominance: true,
    };
  });

  // --- economic rationale ---------------------------------------------------
  readonly rationaleText = signal('');
  readonly rationaleAttested = signal(false);
  readonly rationaleLocked = signal(false);
  readonly rationaleSavedAt = signal<string | null>(null);
  readonly rationaleAuthor = 's.baratto';

  readonly canLockRationale = computed(
    () => this.rationaleText().trim().length > 0 && this.rationaleAttested() && !this.rationaleLocked(),
  );

  // --- recalculation --------------------------------------------------------
  private readonly _recalculating = signal<readonly SectionId[]>([]);
  readonly recalculating = this._recalculating.asReadonly();

  isRecalculating(section: SectionId): boolean {
    return this._recalculating().includes(section);
  }

  /**
   * Marks the sections a changed input feeds into, so each shows its own
   * "Recalculating…" rather than the page blanking as a whole.
   */
  markRecalculating(sections: readonly SectionId[]): void {
    this._recalculating.set([...sections]);
    setTimeout(() => this._recalculating.set([]), RECALC_MS);
  }

  // --- verdict --------------------------------------------------------------

  readonly criteria = computed<CriterionSummary[]>(() => {
    const summary = this.trialSummary();
    const oos = this.outOfSample();
    const correction = this.activeCorrection();
    const hsr = this.haircut();
    const dsr = this.deflated();
    const pbo = this.pbo();

    const disclosure: CriterionSummary = {
      section: 'trial-log',
      label: 'Trial disclosure',
      status: summary.completenessConfirmed ? 'pass' : 'warn',
      detail: summary.completenessConfirmed
        ? `${summary.totalTrials} trials logged, completeness confirmed`
        : `${summary.totalTrials} trials logged, completeness unconfirmed`,
    };

    /**
     * An unconfirmed trial log makes every downstream number provisional, so a
     * criterion that would otherwise pass is reported as a warning — and says
     * so. A `warn` badge next to text that reads like a pass would be worse
     * than no badge at all.
     */
    const downgrade = (status: CriterionStatus, detail: string) => {
      if (status !== 'pass' || summary.completenessConfirmed) return { status, detail };
      // Kept short: the summary is a scan, and the full reason is stated once,
      // in the trial log's own banner.
      return { status: 'warn' as CriterionStatus, detail: `${detail} — provisional` };
    };

    return [
      disclosure,
      {
        section: 'oos-test',
        label: 'Out-of-sample test',
        ...downgrade(
          oos.sharpeOos > 0 ? 'pass' : 'fail',
          `Sharpe(OOS) ${oos.sharpeOos.toFixed(2)} on a ${100 - oos.inSamplePercent}% holdout`,
        ),
      },
      {
        section: 'multiple-testing',
        label: `Multiple testing (${correction.label})`,
        ...(this.isRecalculating('multiple-testing')
          ? { status: 'calculating' as CriterionStatus, detail: 'recalculating…' }
          : downgrade(
              correction.rejectsNull ? 'pass' : 'fail',
              `adjusted p ${correction.adjustedP.toFixed(4)} ${
                correction.rejectsNull ? '<' : '≥'
              } α ${this.alpha()}`,
            )),
      },
      {
        section: 'haircut-sr',
        label: 'Haircut Sharpe ratio',
        ...(hsr.minimumAcceptable === null
          ? {
              status: 'not-set' as CriterionStatus,
              detail: `HSR ${hsr.haircutSharpe.toFixed(2)} · no minimum threshold set`,
            }
          : downgrade(
              hsr.haircutSharpe >= hsr.minimumAcceptable ? 'pass' : 'fail',
              `HSR ${hsr.haircutSharpe.toFixed(2)} vs floor ${hsr.minimumAcceptable}`,
            )),
      },
      {
        section: 'deflated-sr',
        label: 'Deflated Sharpe ratio',
        ...(this.momentsUnavailable()
          ? {
              status: 'error' as CriterionStatus,
              detail: `series too short for γ₃ and γ₄ (T = ${this.sampleLength()})`,
            }
          : this.isRecalculating('deflated-sr')
            ? { status: 'calculating' as CriterionStatus, detail: 'recalculating…' }
            : downgrade(
                dsr.deflatedSharpe >= dsr.acceptanceThreshold ? 'pass' : 'fail',
                `DSR ${dsr.deflatedSharpe.toFixed(4)} ${
                  dsr.deflatedSharpe >= dsr.acceptanceThreshold ? '≥' : '<'
                } accept-if ${dsr.acceptanceThreshold}`,
              )),
      },
      {
        section: 'pbo',
        label: 'PBO / CSCV',
        ...(this.partitionsInvalid()
          ? {
              status: 'error' as CriterionStatus,
              detail: `S = ${this.partitions()} cannot be split into two halves`,
            }
          : this.isRecalculating('pbo')
            ? { status: 'calculating' as CriterionStatus, detail: 'recalculating…' }
            : downgrade(
                pbo.pbo < pbo.threshold ? 'pass' : 'fail',
                `PBO ${pbo.pbo.toFixed(3)} ${pbo.pbo < pbo.threshold ? '<' : '≥'} threshold ${pbo.threshold}`,
              )),
      },
    ];
  });

  readonly failingCount = computed(
    () => this.criteria().filter((c) => c.status === 'fail' || c.status === 'error').length,
  );
  readonly warningCount = computed(
    () => this.criteria().filter((c) => c.status === 'warn' || c.status === 'not-set').length,
  );

  readonly validated = computed(
    () => this.failingCount() === 0 && this.warningCount() === 0 && this.rationaleLocked(),
  );

  // --- paging ---------------------------------------------------------------
  readonly page = signal(1);
  readonly pageSize = signal(20);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.allTrials().length / this.pageSize())),
  );

  readonly visibleTrials = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.allTrials().slice(start, start + this.pageSize());
  });

  // --- actions --------------------------------------------------------------

  async load(): Promise<void> {
    this._state.set('loading');
    await delay(LATENCY_MS);
    this._state.set('ready');
  }

  setTotalTrials(value: number): void {
    this.totalTrials.set(Math.max(1, Math.round(value)));
    this.page.set(1);
    // M feeds N̄, which feeds all three discounts (§5).
    this.markRecalculating(['multiple-testing', 'haircut-sr', 'deflated-sr']);
  }

  setDsrTrials(value: number | null): void {
    this.dsrTrialsOverride.set(value === null ? null : Math.max(1, Math.round(value)));
    this.markRecalculating(['deflated-sr']);
  }

  saveRationale(at: string): void {
    this.rationaleSavedAt.set(at);
  }

  lockRationale(at: string): void {
    if (!this.canLockRationale()) return;
    this.rationaleLocked.set(true);
    this.rationaleSavedAt.set(at);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
