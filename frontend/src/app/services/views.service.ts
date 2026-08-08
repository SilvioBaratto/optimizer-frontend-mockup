import { Injectable, computed, signal } from '@angular/core';

import type {
  BlackLittermanResult,
  InvestorView,
  ViewStatus,
} from '../models/macro-view.model';

const LATENCY_MS = 700;

/** Assets come from the upstream universe; fixed here for the mock. */
export const VIEW_ASSETS = ['Asset 1', 'Asset 2', 'Asset 3'] as const;

/** Maximum number of views N — one per asset in the universe. */
export const MAX_VIEWS = VIEW_ASSETS.length;

const INITIAL_VIEWS: readonly InvestorView[] = [
  { id: 'v1', type: 'absolute', asset: 'Asset 1', againstAsset: null, q: 6.0, omega: 0.0004 },
  { id: 'v2', type: 'relative', asset: 'Asset 2', againstAsset: 'Asset 3', q: 2.0, omega: 0.0009 },
];

/** Equilibrium, and the posterior once the views are blended in. */
const RESULT: BlackLittermanResult = {
  returns: [
    { asset: 'Asset 1', prior: 3.4, posterior: 5.32 },
    { asset: 'Asset 2', prior: 4.2, posterior: 4.78 },
    { asset: 'Asset 3', prior: 2.63, posterior: 2.81 },
  ],
  weights: [
    { asset: 'Asset 1', prior: 50.0, posterior: 62.7 },
    { asset: 'Asset 2', prior: 30.0, posterior: 23.0 },
    { asset: 'Asset 3', prior: 20.0, posterior: 14.3 },
  ],
  uncertainty: [
    { asset: 'Asset 1', prior: 0.0225, posterior: 0.000296 },
    { asset: 'Asset 2', prior: 0.04, posterior: 0.001302 },
    { asset: 'Asset 3', prior: 0.0324, posterior: 0.001219 },
  ],
};

/** Classifies a view without mutating it. */
export function statusOf(view: InvestorView): ViewStatus {
  const missing =
    !view.asset ||
    view.q === null ||
    view.omega === null ||
    (view.type === 'relative' && !view.againstAsset);
  if (missing) return 'incomplete';

  const sameAsset = view.type === 'relative' && view.asset === view.againstAsset;
  const badOmega = (view.omega ?? 0) <= 0;
  return sameAsset || badOmega ? 'invalid' : 'complete';
}

/**
 * Investor views and the resulting posterior.
 *
 * The HTTP client is not wired yet; this stands in with the same shape. Saving
 * deliberately keeps the user's edits on failure — the spec is explicit that a
 * failed write must not discard anything the user typed.
 */
@Injectable({ providedIn: 'root' })
export class ViewsService {
  private readonly _views = signal<readonly InvestorView[]>(INITIAL_VIEWS);
  /** Last saved snapshot, so Discard has something to return to. */
  private readonly _saved = signal<readonly InvestorView[]>(INITIAL_VIEWS);
  private readonly _saving = signal(false);
  private readonly _loading = signal(false);

  readonly views = this._views.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly result = signal<BlackLittermanResult>(RESULT).asReadonly();

  /** Risk aversion a — read-only here; it is set upstream. */
  readonly riskAversion = 2.5;

  readonly isDirty = computed(
    () => JSON.stringify(this._views()) !== JSON.stringify(this._saved()),
  );

  /** Only complete views enter P, Q and Ω. */
  readonly contributing = computed(() =>
    this._views().filter((v) => statusOf(v) === 'complete'),
  );

  readonly hasInvalid = computed(() =>
    this._views().some((v) => statusOf(v) !== 'complete'),
  );

  readonly atCapacity = computed(() => this._views().length >= MAX_VIEWS);

  add(view: Omit<InvestorView, 'id'>): void {
    const id = `v${Date.now()}`;
    this._views.update((all) => [...all, { ...view, id }]);
  }

  update(id: string, patch: Partial<InvestorView>): void {
    this._views.update((all) => all.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  remove(id: string): void {
    this._views.update((all) => all.filter((v) => v.id !== id));
  }

  /** Returns to the last saved snapshot. */
  discard(): void {
    this._views.set(this._saved());
  }

  /** Resolves true on success. The caller shows the banner. */
  async save(fail = false): Promise<boolean> {
    this._saving.set(true);
    await delay(LATENCY_MS);
    this._saving.set(false);

    // On failure nothing is touched — the edits stay exactly as typed.
    if (fail) return false;

    this._saved.set(this._views());
    return true;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
