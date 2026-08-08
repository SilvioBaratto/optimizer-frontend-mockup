import { Injectable, computed, signal } from '@angular/core';

import type {
  AlphaSignal,
  Centering,
  FactorModel,
  FactorSource,
  FundamentalLawOutcome,
  ScreenedName,
} from '../models/factor-model.model';

/** Stand-in latency, so the estimation states the spec mandates are reachable. */
const ESTIMATION_MS = 1200;

const PCA_FACTORS = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5'];

const MODELS: readonly FactorModel[] = [
  {
    id: 'ff-carhart-4f',
    name: 'FF-Carhart 4F',
    source: 'style',
    k: 4,
    centering: 'traded',
    status: 'draft',
    lastRun: null,
    stale: false,
    factorNames: ['MKT', 'SMB', 'HML', 'UMD'],
    variance: [],
    exposures: [],
    excludedAssets: 0,
  },
  {
    id: 'macro-4',
    name: 'Macro-4',
    source: 'macroeconomic',
    k: 4,
    centering: 'traded',
    status: 'estimated',
    lastRun: '2026-07-27 09:14',
    stale: false,
    factorNames: ['Growth', 'Inflation', 'Real rate', 'Credit'],
    variance: [],
    exposures: [
      { ticker: 'AAPL', betas: [0.62, -0.18, -0.31, 0.07], rSquared: 0.44 },
      { ticker: 'MSFT', betas: [0.58, -0.14, -0.28, 0.05], rSquared: 0.41 },
      { ticker: 'EMBOND', betas: [0.11, 0.34, 0.52, 0.61], rSquared: 0.57 },
    ],
    excludedAssets: 1,
  },
  {
    id: 'pca-statistical',
    name: 'PCA Statistical',
    source: 'statistical',
    k: 5,
    centering: 'traded',
    status: 'estimated',
    lastRun: '2026-07-28 14:02',
    stale: false,
    factorNames: PCA_FACTORS,
    variance: [
      { name: 'PC1', share: 30 },
      { name: 'PC2', share: 9 },
      { name: 'PC3', share: 6 },
      { name: 'PC4', share: 3 },
      { name: 'PC5', share: 2 },
    ],
    exposures: [
      { ticker: 'AAPL', betas: [0.42, -0.11, 0.08, 0.03, -0.01], rSquared: 0.71 },
      { ticker: 'MSFT', betas: [0.38, -0.06, 0.12, 0.01, 0.04], rSquared: 0.68 },
      { ticker: 'NEWCO', betas: [0.09, 0.31, -0.22, 0.14, 0.07], rSquared: 0.24 },
      { ticker: 'EMBOND', betas: [0.05, 0.18, 0.41, -0.09, 0.02], rSquared: 0.33 },
      { ticker: 'JNJ', betas: [0.29, -0.04, 0.05, 0.11, -0.03], rSquared: 0.52 },
    ],
    excludedAssets: 3,
  },
];

const SIGNALS: readonly AlphaSignal[] = [
  { id: 'sig-mom-12-1', name: '12-1 Momentum', category: 'momentum', ic: 0.041, combined: true },
  { id: 'sig-value-bp', name: 'Book-to-Price', category: 'value', ic: 0.028, combined: true },
  { id: 'sig-size', name: 'Log Market Cap', category: 'size', ic: -0.012, combined: false },
  { id: 'sig-ddm-irr', name: 'DDM Implied IRR', category: 'ddm-irr', ic: 0.036, combined: false },
];

const SCREENED: readonly ScreenedName[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', priceToBook: 1.8, priceToEarnings: 19.4, evToEbitda: 12.1 },
  { ticker: 'JNJ', name: 'Johnson & Johnson', priceToBook: 1.2, priceToEarnings: 14.8, evToEbitda: 9.4 },
  { ticker: 'XOM', name: 'Exxon Mobil Corp.', priceToBook: 0.9, priceToEarnings: 11.2, evToEbitda: 6.3 },
  { ticker: 'HYG', name: 'High Yield Credit ETF', priceToBook: 1.1, priceToEarnings: 13.0, evToEbitda: 8.2 },
];

const FUNDAMENTAL_LAW: FundamentalLawOutcome = {
  informationRatio: 0.58,
  expectedValueAdded: 1.74,
  decayMonths: 4.2,
  turnover: 86,
};

/**
 * Factor models, alpha signals and the fundamentals screen.
 *
 * The HTTP client is not wired yet; this stands in with the same shape and a
 * realistic estimation delay, which is what makes the `Estimating…` state and
 * the per-card status consistency in the spec actually observable.
 */
@Injectable({ providedIn: 'root' })
export class SignalsService {
  private readonly _models = signal<readonly FactorModel[]>(MODELS);
  private readonly _selectedId = signal<string>('pca-statistical');
  private readonly _selectedSignalId = signal<string>('sig-mom-12-1');
  private readonly _error = signal<string | null>(null);

  readonly models = this._models.asReadonly();
  readonly signals = signal<readonly AlphaSignal[]>(SIGNALS).asReadonly();
  readonly screened = signal<readonly ScreenedName[]>(SCREENED).asReadonly();
  readonly fundamentalLaw = signal<FundamentalLawOutcome>(FUNDAMENTAL_LAW).asReadonly();
  readonly error = this._error.asReadonly();

  readonly selected = computed(
    () => this._models().find((m) => m.id === this._selectedId()) ?? null,
  );

  readonly selectedSignal = computed(
    () => this.signals().find((s) => s.id === this._selectedSignalId()) ?? null,
  );

  readonly isEstimating = computed(() => this.selected()?.status === 'estimating');

  select(id: string): void {
    this._selectedId.set(id);
    this._error.set(null);
  }

  selectSignal(id: string): void {
    this._selectedSignalId.set(id);
  }

  /**
   * Changing the source or K invalidates exposures already estimated.
   *
   * The model drops back to draft rather than keeping stale numbers under a
   * new specification — showing exposures that belong to a different model is
   * worse than showing none.
   */
  updateSpecification(patch: { source?: FactorSource; k?: number; centering?: Centering }): void {
    this._models.update((all) =>
      all.map((m) => {
        if (m.id !== this._selectedId()) return m;
        const invalidates = patch.source !== undefined || patch.k !== undefined;
        return {
          ...m,
          ...patch,
          status: invalidates ? 'draft' : m.status,
          exposures: invalidates ? [] : m.exposures,
          variance: invalidates ? [] : m.variance,
        };
      }),
    );
  }

  /** `fail` exercises the collinearity / insufficient-sample error path. */
  async runEstimation(fail = false): Promise<void> {
    const id = this._selectedId();
    this._error.set(null);
    this._models.update((all) =>
      all.map((m) => (m.id === id ? { ...m, status: 'estimating' } : m)),
    );

    await delay(ESTIMATION_MS);

    if (fail) {
      // The last valid estimate is left intact — it is not overwritten.
      this._models.update((all) =>
        all.map((m) => (m.id === id ? { ...m, status: 'draft' } : m)),
      );
      this._error.set(
        'Estimation failed: perfect collinearity between regressors. Reduce K or revise the specification.',
      );
      return;
    }

    const template = MODELS.find((m) => m.id === id);
    this._models.update((all) =>
      all.map((m) =>
        m.id === id
          ? {
              ...m,
              status: 'estimated',
              stale: false,
              lastRun: '2026-08-08 11:24',
              variance: template?.variance ?? m.variance,
              exposures: template?.exposures ?? m.exposures,
            }
          : m,
      ),
    );
  }

  /** Marks every estimated model stale — called when the universe changes. */
  markStale(): void {
    this._models.update((all) =>
      all.map((m) => (m.status === 'estimated' ? { ...m, stale: true } : m)),
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
