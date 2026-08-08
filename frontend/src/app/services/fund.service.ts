import { Injectable, computed, signal } from '@angular/core';

import type { ApiConnection, Portfolio } from '../models/portfolio.model';

/** What a page needs to know about an async read, beyond the data itself. */
export type LoadState = 'idle' | 'loading' | 'error';

/** Stand-in latency, so the loading states the specs mandate are reachable. */
const LATENCY_MS = 700;

const PORTFOLIOS: readonly Portfolio[] = [
  {
    id: 'balanced-growth-v3',
    name: 'Balanced Growth v3',
    weightSum: 100,
    valid: true,
    holdings: [
      { instrument: 'US Equities ETF', weight: 32 },
      { instrument: 'EU Equities ETF', weight: 18 },
      { instrument: 'Global Bonds ETF', weight: 28 },
      { instrument: 'Gold ETF', weight: 7 },
      { instrument: 'Cash', weight: 15 },
    ],
  },
  {
    id: 'conservative-income-v2',
    name: 'Conservative Income v2',
    weightSum: 100,
    valid: true,
    holdings: [
      { instrument: 'Global Bonds ETF', weight: 42 },
      { instrument: 'IG Credit ETF', weight: 18 },
      { instrument: 'US Equities ETF', weight: 14 },
      { instrument: 'REIT ETF', weight: 9 },
      { instrument: 'Gold ETF', weight: 5 },
      { instrument: 'Cash', weight: 12 },
    ],
  },
  {
    id: 'aggressive-growth-v1',
    name: 'Aggressive Growth v1',
    weightSum: 100,
    valid: true,
    holdings: [
      { instrument: 'US Equities ETF', weight: 54 },
      { instrument: 'EM Equities ETF', weight: 26 },
      { instrument: 'EU Equities ETF', weight: 16 },
      { instrument: 'Cash', weight: 4 },
    ],
  },
];

/**
 * The frontend's view of the fund API.
 *
 * A driving adapter and nothing more: it holds what the API returned and never
 * derives a figure that feeds a decision. Weight sums and validity arrive from
 * the API rather than being recomputed here — see `portfolio.model.ts`.
 *
 * State is exposed as signals so pages read it without subscription logic
 * scattered through components. The HTTP client is not wired yet; this stands
 * in for it with the same shape and realistic latency, which is what makes the
 * loading and error states in every page spec actually reachable.
 */
@Injectable({ providedIn: 'root' })
export class FundService {
  private readonly _portfolios = signal<readonly Portfolio[]>([]);
  private readonly _activeId = signal<string | null>(null);
  private readonly _state = signal<LoadState>('idle');
  private readonly _connection = signal<ApiConnection>({
    status: 'checking',
    clientVersion: 'v1.4.2',
    endpoint: 'api.fund.internal/v1',
    lastCheck: null,
  });

  /** Every portfolio the fund exposes. */
  readonly portfolios = this._portfolios.asReadonly();
  readonly state = this._state.asReadonly();
  readonly connection = this._connection.asReadonly();

  /** The selected portfolio, shared by the topbar switcher and every page. */
  readonly active = computed(
    () => this._portfolios().find((p) => p.id === this._activeId()) ?? null,
  );

  /** True once a load has completed and returned nothing. */
  readonly isEmpty = computed(
    () => this._state() === 'idle' && this._portfolios().length === 0,
  );

  constructor() {
    void this.load();
    void this.checkConnection();
  }

  /** (Re)reads the portfolio list. Set `fail` to exercise the error state. */
  async load(fail = false): Promise<void> {
    this._state.set('loading');
    await delay(LATENCY_MS);

    if (fail) {
      this._state.set('error');
      this._portfolios.set([]);
      return;
    }

    this._portfolios.set(PORTFOLIOS);
    this._activeId.update((current) => current ?? PORTFOLIOS[0]?.id ?? null);
    this._state.set('idle');
  }

  /**
   * Makes `id` the active portfolio.
   *
   * Everything that shows portfolio context reads `active`, so this single
   * write is what keeps the page list and the topbar switcher in step.
   */
  setActive(id: string): void {
    if (this._portfolios().some((p) => p.id === id)) this._activeId.set(id);
  }

  /**
   * Re-runs only the connectivity probe.
   *
   * Deliberately independent of `load()`: the spec requires the InfoCard's
   * refresh to leave the portfolio panels untouched.
   */
  async checkConnection(fail = false): Promise<void> {
    this._connection.update((c) => ({ ...c, status: 'checking' }));
    await delay(LATENCY_MS);

    this._connection.update((c) => ({
      ...c,
      status: fail ? 'disconnected' : 'connected',
      lastCheck: clockNow(),
      detail: fail ? 'Typed client could not reach the fund API (ECONNREFUSED).' : undefined,
    }));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clockNow(): string {
  return new Date().toTimeString().slice(0, 8);
}
