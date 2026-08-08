import { Injectable, computed, signal } from '@angular/core';

import {
  REGIME_MODELS,
  type AssetClass,
  type AssetClassFilter,
  type HandoffEntry,
  type LookbackWindow,
  type PayloadLine,
  type PredictiveSignal,
  type RegimeCorrelation,
  type RegimeEstimate,
  type RegimeModelId,
  type RegimeState,
  type RegimeView,
  type StressSnapshot,
  type ViewConfidence,
} from '../models/macro-regime.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

const FILTER_MS = 900;

/** Two states within this many points of each other is a coin toss, not a call. */
const UNCERTAINTY_GAP = 10;

/**
 * The four-state multi-asset model, and the two reduced ones.
 *
 * Expected runs come from the diagonal of the transition matrix: a state that
 * persists for eight months and one that persists for two are different objects
 * even at the same probability, which is why the duration travels with the
 * probability everywhere it is shown.
 */
const MODEL_STATES: Record<RegimeModelId, readonly RegimeState[]> = {
  'four-state': [
    { name: 'Crash', probability: 8, expectedRunMonths: 2, description: 'large negative excess returns, high volatility' },
    { name: 'Slow Growth', probability: 24, expectedRunMonths: 7, description: 'low volatility, small positive returns' },
    { name: 'Bull', probability: 62, expectedRunMonths: 8, description: 'persistent expansion' },
    { name: 'Recovery', probability: 6, expectedRunMonths: 3, description: 'sharp rebounds, high small-cap volatility' },
  ],

  'two-state-bear-bull': [
    { name: 'Bear', probability: 29, expectedRunMonths: 7, description: 'lower mean, much higher volatility, correlations up' },
    { name: 'Bull', probability: 71, expectedRunMonths: 51, description: 'higher mean, lower volatility' },
  ],
  hamilton: [
    { name: 'Recession', probability: 29, expectedRunMonths: 12, description: 'contraction, about 4.1 quarters expected' },
    { name: 'Expansion', probability: 71, expectedRunMonths: 32, description: 'expansion, about 10.5 quarters expected' },
  ],
};

/**
 * Filtered probabilities by sample, for the four-state model.
 *
 * A shorter window weights recent turbulence more heavily, so the estimate
 * genuinely moves with the lookback — the driver at one year is not the driver
 * over the full sample. This is why changing the window needs a fresh run
 * rather than a re-read.
 */
const FOUR_STATE_BY_LOOKBACK: Record<LookbackWindow, readonly number[]> = {
  '1Y': [34, 30, 22, 14],
  '3Y': [18, 38, 34, 10],
  '5Y': [12, 30, 50, 8],
  full: [8, 24, 62, 6],
};

/** Base magnitudes for the views; the sign comes from the driver regime. */
const VIEW_MAGNITUDES: readonly { assetClass: AssetClass; er: number; corr: number; growthSensitive: boolean }[] = [
  { assetClass: 'US Equity', er: 0.15, corr: 0.03, growthSensitive: true },
  { assetClass: 'Intl Equity', er: 0.12, corr: 0.02, growthSensitive: true },
  { assetClass: 'Govt Bonds', er: 0.05, corr: 0.01, growthSensitive: false },
  { assetClass: 'Credit', er: 0.08, corr: 0.02, growthSensitive: true },
  { assetClass: 'Commodities', er: 0.10, corr: 0.01, growthSensitive: true },
  { assetClass: 'Currencies', er: 0.04, corr: 0.01, growthSensitive: false },
];

const FILTER_MEMBERSHIP: Record<AssetClassFilter, readonly AssetClass[]> = {
  all: ['US Equity', 'Intl Equity', 'Govt Bonds', 'Credit', 'Commodities', 'Currencies'],
  equities: ['US Equity', 'Intl Equity'],
  bonds: ['Govt Bonds'],
  credit: ['Credit'],
  commodities: ['Commodities'],
  currencies: ['Currencies'],
};

/** States in which growth-sensitive assets are favoured. */
const RISK_ON_STATES = new Set(['Bull', 'Recovery', 'Expansion']);

const SIGNALS: readonly PredictiveSignal[] = [
  {
    id: 'term-spread',
    name: 'Term spread → recession probability',
    reading: '+0.95pp of slope → P(recession) 6% at four quarters',
    status: 'validated',
    reason: null,
    outOfSampleR2: 1.4,
    route: '/advanced-signals/market-regimes',
  },
  {
    id: 'ebp',
    name: 'Excess bond premium',
    reading: 'EBP +0.12 · the cyclical component of the credit spread',
    status: 'validated',
    reason: null,
    outOfSampleR2: 0.9,
    route: '/advanced-signals/market-regimes',
  },
  {
    id: 'vol-managed',
    name: 'Volatility-managed scaling',
    reading: 'scale 0.87× on realised volatility',
    status: 'validated',
    reason: null,
    outOfSampleR2: 2.1,
    route: '/advanced-signals/market-regimes',
  },
  {
    id: 'pc-all',
    name: 'Combined macro + technical index',
    reading: 'R²_OS +1.79% out of sample (PC-ALL)',
    status: 'validated',
    reason: null,
    outOfSampleR2: 1.79,
    route: '/advanced-signals/market-regimes',
  },
  {
    id: 'momentum-state',
    name: 'Momentum market state',
    reading: 'UP · 36-month lookback, active',
    status: 'excluded',
    reason: 'R²_OS below zero in the validation window — the historical mean did better',
    outOfSampleR2: -0.6,
    route: '/advanced-signals/factor-timing-rotation',
  },
  {
    id: 'value-regime',
    name: 'Value volatility regime',
    reading: 'low-volatility regime · value − growth 0.6%/yr',
    status: 'stale',
    reason: 'input vintage is 9 days behind the expected freshness threshold',
    outOfSampleR2: 1.1,
    route: '/advanced-signals/factor-timing-rotation',
  },
];

/** Correlations that move most across states (Fondamenti §6). */
const CORRELATIONS: readonly RegimeCorrelation[] = [
  { pair: 'Large cap ↔ Small cap', byState: { Crash: 0.82, 'Slow Growth': 0.71, Bull: 0.64, Recovery: 0.5 } },
  { pair: 'Equity ↔ Long bonds', byState: { Crash: -0.4, 'Slow Growth': 0.12, Bull: 0.21, Recovery: 0.18 } },
  { pair: 'US ↔ International equity', byState: { Crash: 0.88, 'Slow Growth': 0.74, Bull: 0.69, Recovery: 0.72 } },
  { pair: 'Credit ↔ Equity', byState: { Crash: 0.79, 'Slow Growth': 0.58, Bull: 0.47, Recovery: 0.61 } },
  { pair: 'Commodities ↔ Equity', byState: { Crash: 0.55, 'Slow Growth': 0.31, Bull: 0.28, Recovery: 0.44 } },
];

const HANDOFF_LOG: readonly HandoffEntry[] = [
  { id: 'h-8', at: '2026-07-30 18:00', author: 'SB', summary: 'Regime Bull 59% · 5 validated signals · radius k 2.5', driver: 'Bull' },
  { id: 'h-7', at: '2026-07-23 17:42', author: 'SB', summary: 'Regime Bull 55% · 5 validated signals · radius k 2.5', driver: 'Bull' },
  { id: 'h-6', at: '2026-07-16 18:05', author: 'AR', summary: 'Regime Slow Growth 41% · 4 validated signals · radius k 3.0', driver: 'Slow Growth' },
  { id: 'h-5', at: '2026-07-09 17:58', author: 'AR', summary: 'Regime Slow Growth 47% · 4 validated signals · radius k 3.0', driver: 'Slow Growth' },
  { id: 'h-4', at: '2026-06-30 18:11', author: 'SB', summary: 'Regime Bull 51% · 5 validated signals · radius k 2.5', driver: 'Bull' },
  { id: 'h-3', at: '2026-06-23 17:49', author: 'MC', summary: 'Regime Recovery 38% · 3 validated signals · radius k 2.0', driver: 'Recovery' },
  { id: 'h-2', at: '2026-06-16 18:02', author: 'MC', summary: 'Regime Recovery 44% · 3 validated signals · radius k 2.0', driver: 'Recovery' },
  { id: 'h-1', at: '2026-06-09 17:55', author: 'SB', summary: 'Regime Crash 33% · 2 validated signals · radius k 1.5', driver: 'Crash' },
];

/** 24 months of filtered probability for the driver state. */
function buildHistory(peak: number): { month: string; probability: number }[] {
  const months: { month: string; probability: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    // Rises out of a weaker patch, dips, then settles at the current reading.
    const value = peak * (0.42 + 0.58 * t) + 9 * Math.sin(i * 0.9) - 4 * Math.cos(i * 0.4);
    const year = 2024 + Math.floor((7 + i) / 12);
    const month = ((7 + i) % 12) + 1;
    months.push({
      month: `${year}-${String(month).padStart(2, '0')}`,
      probability: Math.max(1, Math.min(99, Math.round(value * 10) / 10)),
    });
  }
  // The series has to end where the current filtered reading is.
  months[months.length - 1] = { ...months[months.length - 1], probability: peak };
  return months;
}

/**
 * The macro agent's estimate, and the payload it would publish.
 *
 * The HTTP client is not wired yet. What matters in the stand-in is the shape
 * of the dependency: the regime drives the views, so changing the model changes
 * their signs, and the payload only becomes publishable when it actually
 * differs from what was published last.
 */
@Injectable({ providedIn: 'root' })
export class MacroRegimeService {
  private readonly _state = signal<PageState>('ready');
  readonly state = this._state.asReadonly();

  /** Set while the filter re-runs; the last good values stay on screen. */
  private readonly _recomputing = signal(false);
  readonly recomputing = this._recomputing.asReadonly();

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly model = signal<RegimeModelId>('four-state');
  readonly lookback = signal<LookbackWindow>('full');
  /**
   * The window the estimate on screen was actually run over. It only catches up
   * with `lookback` when a run succeeds, so a half-changed selector never
   * relabels an estimate that was computed over a different sample.
   */
  private readonly committedLookback = signal<LookbackWindow>('full');
  readonly assetClassFilter = signal<AssetClassFilter>('all');
  readonly showValidatedOnly = signal(false);

  readonly lastRun = signal('2026-07-31 22:10 UTC');
  readonly vintage = '2026-07-30';

  readonly models = REGIME_MODELS;
  readonly signals = SIGNALS;
  readonly correlations = CORRELATIONS;
  readonly handoffLog = HANDOFF_LOG;

  /** Signals whose inputs are behind the freshness threshold. */
  readonly staleSignals = computed(() => this.signals.filter((s) => s.status === 'stale'));

  // --- regime ---------------------------------------------------------------

  /**
   * Changing the model re-reads the filtered probabilities immediately; only
   * the lookback needs a fresh run, because only it changes the sample the
   * recursive filter is estimated over.
   */
  readonly estimate = computed<RegimeEstimate>(() => {
    const base = MODEL_STATES[this.model()];
    const sample = this.committedLookback();
    // Only the four-state model is re-estimated per sample here; the reduced
    // models are shown as published.
    const applied: RegimeState[] =
      this.model() === 'four-state'
        ? base.map((s, i) => ({ ...s, probability: FOUR_STATE_BY_LOOKBACK[sample][i] }))
        : [...base];
    const states = [...applied].sort((a, b) => b.probability - a.probability);
    const driver = states[0];
    const runnerUp = states[1];
    return {
      model: this.model(),
      lookback: sample,
      states: applied,
      driver: driver.name,
      driverProbability: driver.probability,
      elevatedUncertainty: runnerUp ? driver.probability - runnerUp.probability < UNCERTAINTY_GAP : false,
      lastRun: this.lastRun(),
      vintage: this.vintage,
      history: buildHistory(driver.probability),
      secondaryReading:
        this.model() === 'hamilton'
          ? 'Primary reading — the four-state model is the secondary one here'
          : 'Hamilton 2-state: Expansion 71% (growth / recession)',
    };
  });

  readonly statesByProbability = computed(() =>
    [...this.estimate().states].sort((a, b) => b.probability - a.probability),
  );

  /** Whether the driver favours growth-sensitive assets. */
  readonly riskOn = computed(() => RISK_ON_STATES.has(this.estimate().driver));

  // --- views ----------------------------------------------------------------

  /**
   * The views the regime implies.
   *
   * The sign is the regime's, not the asset's: in a risk-on state the
   * growth-sensitive classes get a higher expected return and slacker
   * correlations, and government bonds get the opposite. Switch the driver to
   * Crash and every sign flips, which is the whole content of the bridge.
   */
  readonly views = computed<readonly RegimeView[]>(() => {
    const riskOn = this.riskOn();
    const allowed = FILTER_MEMBERSHIP[this.assetClassFilter()];
    return VIEW_MAGNITUDES.filter((v) => allowed.includes(v.assetClass)).map((v) => {
      const favoured = v.growthSensitive === riskOn;
      return {
        assetClass: v.assetClass,
        expectedReturnDelta: favoured ? v.er : -v.er,
        // Correlations slacken when the favoured state holds and tighten when
        // it does not — the stylised fact that correlations rise in selloffs.
        correlationDelta: favoured ? -v.corr : v.corr,
        growthSensitive: v.growthSensitive,
      };
    });
  });

  readonly viewConfidence = computed<ViewConfidence>(() => {
    const p = this.estimate().driverProbability;
    if (p >= 70) return 'High';
    if (p >= 45) return 'Moderate';
    return 'Low';
  });

  // --- signals --------------------------------------------------------------

  readonly visibleSignals = computed(() =>
    this.showValidatedOnly() ? this.signals.filter((s) => s.status === 'validated') : this.signals,
  );

  readonly validatedCount = computed(() => this.signals.filter((s) => s.status === 'validated').length);
  readonly excludedCount = computed(() => this.signals.filter((s) => s.status === 'excluded').length);

  // --- stress ---------------------------------------------------------------

  readonly radius = signal(2.5);
  readonly reverseMode = signal(false);
  readonly reverseTarget = signal<number | null>(null);
  readonly fixedFactors = signal<readonly { factor: string; value: number }[]>([]);

  readonly stressFactors = [
    'Equity vol',
    'Term spread',
    'Credit spread',
    'Oil',
    'USD trade-weighted',
    'Inflation surprise',
  ];

  readonly stress = computed<StressSnapshot>(() => {
    const k = this.radius();
    // Maximum Loss deepens with the radius: a wider domain of admissibility
    // contains worse scenarios. The trade-off k governs is exactly this one.
    const maximumLoss = -(4.6 * k + 2.7);
    const shares = [41, 24, 13, 9, 6, 3].map((s, i) => Math.max(0, s - i * (k - 2.5) * 0.8));
    const contributions = this.stressFactors.map((factor, i) => ({ factor, share: shares[i] }));
    return {
      radius: k,
      maximumLoss,
      contributions,
      // Under 100%: the factors interact, and moving together does damage no
      // single one accounts for.
      contributionSum: contributions.reduce((sum, c) => sum + c.share, 0),
      fixedFactors: this.fixedFactors(),
      reverseMode: this.reverseMode(),
      reverseTarget: this.reverseTarget(),
    };
  });

  readonly topContribution = computed(() =>
    [...this.stress().contributions].sort((a, b) => b.share - a.share)[0],
  );

  fixFactor(factor: string, value: number): void {
    this.fixedFactors.update((all) => [...all.filter((f) => f.factor !== factor), { factor, value }]);
  }

  unfixFactor(factor: string): void {
    this.fixedFactors.update((all) => all.filter((f) => f.factor !== factor));
  }

  // --- handoff --------------------------------------------------------------

  readonly lastPublished = signal({ at: '2026-07-30 18:00', author: 'SB' });

  /** The state of the payload as it was last written, for the diff. */
  private readonly publishedSnapshot = signal({
    driver: 'Bull',
    driverProbability: 59,
    viewCount: 5,
    radius: 2.5,
    validatedCount: 4,
  });

  readonly payload = computed<readonly PayloadLine[]>(() => {
    const estimate = this.estimate();
    const previous = this.publishedSnapshot();
    const validated = this.validatedCount();
    const viewCount = VIEW_MAGNITUDES.length;

    const lines: PayloadLine[] = [
      {
        id: 'regime',
        label: 'regime state + P(state)',
        currentValue: `${estimate.driver} ${estimate.driverProbability}%`,
        previousValue: `${previous.driver} ${previous.driverProbability}%`,
        changed:
          estimate.driver !== previous.driver ||
          estimate.driverProbability !== previous.driverProbability,
      },
      {
        id: 'views',
        label: 'E[r] / covariance views',
        currentValue: `${viewCount} asset classes`,
        previousValue: `${previous.viewCount} asset classes`,
        changed: viewCount !== previous.viewCount,
      },
      {
        id: 'stress',
        label: 'stress scenarios',
        currentValue: `radius k ${this.radius().toFixed(1)}`,
        previousValue: `radius k ${previous.radius.toFixed(1)}`,
        changed: this.radius() !== previous.radius,
      },
      {
        id: 'signals',
        label: 'validated signals',
        currentValue: `${validated} of ${this.signals.length}`,
        previousValue: `${previous.validatedCount} of ${this.signals.length}`,
        changed: validated !== previous.validatedCount,
      },
    ];
    return lines;
  });

  /** Nothing to publish means nothing changed — the button says so by staying off. */
  readonly hasChangesToPublish = computed(() => this.payload().some((line) => line.changed));

  publish(at: string): void {
    const estimate = this.estimate();
    this.publishedSnapshot.set({
      driver: estimate.driver,
      driverProbability: estimate.driverProbability,
      viewCount: VIEW_MAGNITUDES.length,
      radius: this.radius(),
      validatedCount: this.validatedCount(),
    });
    this.lastPublished.set({ at, author: 'SB' });
  }

  // --- lifecycle ------------------------------------------------------------

  /** Set to make the next filter run fail, for the error path. */
  private failNext = false;

  failNextRun(): void {
    this.failNext = true;
  }

  /**
   * Re-runs the recursive filter over the current model and lookback.
   *
   * The last good estimate stays on screen throughout, labelled: a blank page
   * would be a worse answer than a slightly old one, and the run may fail.
   */
  async recompute(): Promise<void> {
    if (this._recomputing()) return;
    this._recomputing.set(true);
    this._errorMessage.set(null);

    await delay(FILTER_MS);

    if (this.failNext) {
      this.failNext = false;
      this._errorMessage.set(
        `Filter did not converge for the ${this.lookback()} lookback. The last successful estimate is still shown, and is stale.`,
      );
      this._recomputing.set(false);
      return;
    }

    this.committedLookback.set(this.lookback());
    this.lastRun.set(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    this._recomputing.set(false);
  }

  clearError(): void {
    this._errorMessage.set(null);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
