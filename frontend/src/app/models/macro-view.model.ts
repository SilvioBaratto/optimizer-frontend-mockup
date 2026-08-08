/**
 * TypeScript mirror of the investor-view domain types.
 *
 * A view is an opinion held against market equilibrium, and the theory admits
 * exactly two shapes: an absolute expected return for one asset, or a relative
 * statement that one asset outperforms another. Nothing else is representable,
 * which is why `ViewType` is a closed pair rather than an open string.
 *
 * The posterior quantities (r_BL, x_BL, V_BL) are produced by the estimator
 * behind the API. P and Ω are different in kind: they are a rearrangement of
 * what the user typed, not an estimate, so the page assembles them directly.
 */

export type ViewType = 'absolute' | 'relative';

/**
 * A view is excluded from the computation while incomplete, and blocks saving
 * while invalid — the two are not the same and the spec treats them apart.
 */
export type ViewStatus = 'complete' | 'incomplete' | 'invalid';

export interface InvestorView {
  id: string;
  type: ViewType;
  /** Asset the view is about, or the long leg of a relative view. */
  asset: string | null;
  /** Short leg; relative views only. Must differ from `asset`. */
  againstAsset: string | null;
  /** Expected return Q, in percent. */
  q: number | null;
  /** View variance Ω. Lower means more confidence. Must be > 0. */
  omega: number | null;
}

/** Per-asset equilibrium value against its posterior counterpart. */
export interface PosteriorComparison {
  asset: string;
  prior: number;
  posterior: number;
}

export interface BlackLittermanResult {
  /** Π* — equilibrium implied returns, and r_BL after blending the views. */
  returns: readonly PosteriorComparison[];
  /** x_M — market weights, and x_BL from the posterior distribution. */
  weights: readonly PosteriorComparison[];
  /** Diagonals of V and V_BL. */
  uncertainty: readonly PosteriorComparison[];
}
