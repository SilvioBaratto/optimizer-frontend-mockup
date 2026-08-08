/**
 * TypeScript mirror of the `Portfolio` domain type.
 *
 * A portfolio is an N-vector of weights over the investment choices, where each
 * weight is the share of wealth W placed in that choice and the weights sum to
 * one (`docs/01 Guscio e navigazione.md`, Fondamenti §1). The sum is carried
 * explicitly rather than derived on the client: the frontend never computes a
 * quantity that feeds a decision — it displays what the API returns, including
 * whether the constraint holds.
 */

export interface Holding {
  /** Investment choice X_i — the instrument. */
  instrument: string;
  /** Weight x_i, as a percentage of total wealth. Negative means a short. */
  weight: number;
}

export interface Portfolio {
  id: string;
  name: string;
  holdings: readonly Holding[];
  /** Σ x_i as reported by the API, in percent. */
  weightSum: number;
  /** Whether the API considers the sum-to-one constraint satisfied. */
  valid: boolean;
}

/** Connection state of the typed client against the fund's HTTP API. */
export type ApiConnectionStatus = 'checking' | 'connected' | 'disconnected';

export interface ApiConnection {
  status: ApiConnectionStatus;
  /** Version of the generated typed client. */
  clientVersion: string;
  endpoint: string;
  /** Time of the last connectivity check, `HH:MM:SS`. */
  lastCheck: string | null;
  /** Present when `status` is `disconnected`. */
  detail?: string;
}
