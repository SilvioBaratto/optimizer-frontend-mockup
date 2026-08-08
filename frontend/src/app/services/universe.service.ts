import { Injectable, computed, signal } from '@angular/core';

import {
  type CovarianceDiagnostics,
  type CovarianceEstimator,
  type DataFrequency,
  type ReturnEstimate,
  type UniverseAsset,
  type ValidationNotice,
  type WinsorizedObservation,
} from '../models/universe.model';

export type LoadState = 'loading' | 'ready' | 'error';

/** Stand-in latency, so the recalculation states the spec mandates are real. */
const LATENCY_MS = 550;

const ASSETS: readonly UniverseAsset[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', assetClass: 'Equity', sector: 'Technology', historyFrom: '2004-01', observations: 270, status: 'ok', included: true },
  { ticker: 'MSFT', name: 'Microsoft Corp.', assetClass: 'Equity', sector: 'Technology', historyFrom: '2004-01', observations: 270, status: 'ok', included: true },
  { ticker: 'NEWCO', name: 'NewCo Holdings', assetClass: 'Equity', sector: 'Industrials', historyFrom: '2022-03', observations: 29, status: 'short', included: true },
  { ticker: 'EMBOND', name: 'EM Bond Fund', assetClass: 'Fixed income', sector: 'Sovereign', historyFrom: '2009-06', observations: 197, status: 'gaps', included: true },
  { ticker: 'DELIST', name: 'Delisted Co.', assetClass: 'Equity', sector: 'Materials', historyFrom: '2004-01', observations: 142, status: 'unavailable', included: false },
  { ticker: 'JNJ', name: 'Johnson & Johnson', assetClass: 'Equity', sector: 'Health care', historyFrom: '2004-01', observations: 270, status: 'ok', included: true },
  { ticker: 'XOM', name: 'Exxon Mobil Corp.', assetClass: 'Equity', sector: 'Energy', historyFrom: '2004-01', observations: 270, status: 'ok', included: true },
  { ticker: 'TLT', name: 'US Treasury 20Y ETF', assetClass: 'Fixed income', sector: 'Sovereign', historyFrom: '2004-01', observations: 270, status: 'ok', included: true },
  { ticker: 'GLD', name: 'Gold Trust', assetClass: 'Commodity', sector: 'Precious metals', historyFrom: '2005-02', observations: 257, status: 'ok', included: true },
  { ticker: 'VNQ', name: 'US REIT ETF', assetClass: 'Real estate', sector: 'REIT', historyFrom: '2004-10', observations: 261, status: 'ok', included: true },
  { ticker: 'EFA', name: 'Developed ex-US ETF', assetClass: 'Equity', sector: 'Diversified', historyFrom: '2004-01', observations: 270, status: 'ok', included: true },
  { ticker: 'HYG', name: 'High Yield Credit ETF', assetClass: 'Fixed income', sector: 'Credit', historyFrom: '2007-04', observations: 231, status: 'ok', included: true },
];

const WINSORIZED: readonly WinsorizedObservation[] = [
  { ticker: 'NEWCO', at: '2022-11', rawReturn: -38.4, replacement: 'set to x_(i+1)', deltaMean: -0.6, deltaSd: -1.1 },
  { ticker: 'EMBOND', at: '2020-03', rawReturn: -21.7, replacement: 'set to x_(i+1)', deltaMean: -0.2, deltaSd: -0.4 },
  { ticker: 'AAPL', at: '2020-03', rawReturn: 19.9, replacement: 'set to x_(N-i)', deltaMean: -0.1, deltaSd: -0.3 },
];

const ESTIMATES: readonly ReturnEstimate[] = [
  { ticker: 'AAPL', mean: 14.2, sd: 34.0, observations: 270, standardError: 2.07, confidenceInterval: [10.1, 18.3], wide: false },
  { ticker: 'MSFT', mean: 12.6, sd: 28.4, observations: 270, standardError: 1.73, confidenceInterval: [9.1, 16.1], wide: false },
  { ticker: 'NEWCO', mean: 21.0, sd: 41.0, observations: 29, standardError: 7.61, confidenceInterval: [5.8, 36.2], wide: true },
  { ticker: 'EMBOND', mean: 4.8, sd: 11.2, observations: 197, standardError: 0.8, confidenceInterval: [3.2, 6.4], wide: false },
  { ticker: 'DELIST', mean: null, sd: null, observations: null, standardError: null, confidenceInterval: null, wide: false },
  { ticker: 'JNJ', mean: 8.1, sd: 17.4, observations: 270, standardError: 1.06, confidenceInterval: [6.0, 10.2], wide: false },
  { ticker: 'XOM', mean: 7.4, sd: 24.9, observations: 270, standardError: 1.52, confidenceInterval: [4.4, 10.4], wide: false },
  { ticker: 'TLT', mean: 3.9, sd: 13.8, observations: 270, standardError: 0.84, confidenceInterval: [2.2, 5.6], wide: false },
  { ticker: 'GLD', mean: 6.7, sd: 16.1, observations: 257, standardError: 1.0, confidenceInterval: [4.7, 8.7], wide: false },
  { ticker: 'VNQ', mean: 6.2, sd: 22.7, observations: 261, standardError: 1.41, confidenceInterval: [3.4, 9.0], wide: false },
  { ticker: 'EFA', mean: 5.5, sd: 18.3, observations: 270, standardError: 1.11, confidenceInterval: [3.3, 7.7], wide: false },
  { ticker: 'HYG', mean: 5.1, sd: 10.4, observations: 231, standardError: 0.68, confidenceInterval: [3.7, 6.5], wide: false },
];

const SPECTRUM = [
  { index: 1, sample: 0.184, shrunk: 0.131 },
  { index: 2, sample: 0.092, shrunk: 0.081 },
  { index: 3, sample: 0.061, shrunk: 0.058 },
  { index: 4, sample: 0.048, shrunk: 0.047 },
  { index: 5, sample: 0.039, shrunk: 0.04 },
  { index: 6, sample: 0.031, shrunk: 0.033 },
];

/**
 * Universe construction and estimation reads.
 *
 * The HTTP client is not wired yet; this stands in with the same shape and
 * realistic latency. `recalculating` is separate from the initial load because
 * the spec is explicit that changing the window, source or frequency puts the
 * dependent panels back into a per-row loading state while the controls stay
 * interactive.
 */
@Injectable({ providedIn: 'root' })
export class UniverseService {
  private readonly _assets = signal<readonly UniverseAsset[]>(ASSETS);
  private readonly _estimates = signal<readonly ReturnEstimate[]>(ESTIMATES);
  private readonly _state = signal<LoadState>('ready');
  private readonly _recalculating = signal(false);
  private readonly _estimator = signal<CovarianceEstimator>('nonlinear');
  private readonly _frequency = signal<DataFrequency>('monthly');

  readonly assets = this._assets.asReadonly();
  readonly estimates = this._estimates.asReadonly();
  readonly state = this._state.asReadonly();
  readonly recalculating = this._recalculating.asReadonly();
  readonly estimator = this._estimator.asReadonly();
  readonly frequency = this._frequency.asReadonly();
  readonly winsorized = signal<readonly WinsorizedObservation[]>(WINSORIZED).asReadonly();

  /** Universe size p — only included assets count. */
  readonly universeSize = computed(() => this._assets().filter((a) => a.included).length);

  /** Total observations n in the selected window. */
  readonly observations = computed(() => (this._frequency() === 'monthly' ? 294 : 6174));

  readonly pOverN = computed(() => this.universeSize() / this.observations());

  readonly diagnostics = computed<CovarianceDiagnostics>(() => {
    const estimator = this._estimator();
    return {
      pOverN: this.pOverN(),
      conditionNumber: 18.4,
      invertible: this.universeSize() < this.observations(),
      spectrum: SPECTRUM,
      shrinkageIntensity: estimator === 'linear' ? 0.27 : null,
      perEigenvalue: estimator === 'nonlinear' ? { average: 0.31, min: 0.09, max: 0.58 } : null,
      dcc: estimator === 'dcc' ? { alpha: 0.021, beta: 0.968 } : null,
    };
  });

  /**
   * Validation notices, derived from the estimates the API returned.
   *
   * The wording is deliberately conditional: "cannot establish the sign" is
   * only true when the interval actually contains zero. NEWCO's interval is
   * wide but entirely positive, so it gets the width warning and not the sign
   * claim — the spec calls this out as an edge case to get right.
   */
  readonly notices = computed<ValidationNotice[]>(() => {
    const out: ValidationNotice[] = [];

    for (const e of this._estimates()) {
      if (!e.wide || !e.confidenceInterval) continue;
      const [low, high] = e.confidenceInterval;
      const spansZero = low < 0 && high > 0;
      out.push({
        id: `wide-${e.ticker}`,
        severity: 'warning',
        message: spansZero
          ? `${e.ticker}: only ${e.observations} observations, 95% CI [${low}%, ${high}%] includes zero — the sign of the expected return cannot be established.`
          : `${e.ticker}: only ${e.observations} observations, 95% CI very wide [${low}%, ${high}%].`,
      });
    }

    const withGaps = this._assets().filter((a) => a.status === 'gaps').length;
    if (withGaps > 0) {
      out.push({
        id: 'gaps',
        severity: 'warning',
        message: `Frequency mismatch: ${withGaps} asset${withGaps > 1 ? 's have' : ' has'} gaps against the selected ${this._frequency()} grid.`,
      });
    }

    for (const a of this._assets().filter((x) => x.status === 'unavailable')) {
      out.push({
        id: `unavailable-${a.ticker}`,
        severity: 'warning',
        message: `${a.ticker}: data unavailable from the selected source.`,
        retryTicker: a.ticker,
      });
    }

    const { invertible } = this.diagnostics();
    out.push({
      id: 'invertible',
      severity: invertible ? 'ok' : 'blocking',
      message: invertible
        ? 'Sample covariance matrix invertible (p < n).'
        : 'Sample covariance matrix is not invertible (p ≥ n) — reduce the universe or lengthen the window.',
    });

    return out;
  });

  /** Continue is gated on this, per the spec. */
  readonly hasBlockingWarning = computed(() =>
    this.notices().some((n) => n.severity === 'blocking'),
  );

  readonly lastRefresh = '2026-07-30 18:02';

  setEstimator(estimator: CovarianceEstimator): void {
    this._estimator.set(estimator);
  }

  /** Changing frequency invalidates the dependent panels. */
  async setFrequency(frequency: DataFrequency): Promise<void> {
    this._frequency.set(frequency);
    await this.recalculate();
  }

  toggleAsset(ticker: string, included: boolean): void {
    this._assets.update((all) =>
      all.map((a) => (a.ticker === ticker ? { ...a, included } : a)),
    );
  }

  async remove(tickers: readonly string[]): Promise<void> {
    this._assets.update((all) => all.filter((a) => !tickers.includes(a.ticker)));
    this._estimates.update((all) => all.filter((e) => !tickers.includes(e.ticker)));
    await this.recalculate();
  }

  /** Retries one ticker's fetch without touching the other rows. */
  async retry(ticker: string): Promise<void> {
    this._recalculating.set(true);
    await delay(LATENCY_MS);
    this._assets.update((all) =>
      all.map((a) => (a.ticker === ticker ? { ...a, status: 'ok', included: true } : a)),
    );
    this._recalculating.set(false);
  }

  async reset(): Promise<void> {
    this._assets.set(ASSETS);
    this._estimates.set(ESTIMATES);
    this._estimator.set('nonlinear');
    this._frequency.set('monthly');
    await this.recalculate();
  }

  /** Dependent panels go back to a per-row loading state. */
  private async recalculate(): Promise<void> {
    this._recalculating.set(true);
    await delay(LATENCY_MS);
    this._recalculating.set(false);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
