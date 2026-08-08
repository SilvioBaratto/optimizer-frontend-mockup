/**
 * TypeScript mirror of the approval domain type.
 *
 * Authorisation lives in `approvals` inside `FundState`, never in component
 * state: the frontend shows what is being approved and collects the signature.
 */

export interface PendingApproval {
  id: string;
  /** Human-readable subject, e.g. "Rebalance proposal #A-118". */
  title: string;
  /** What kind of decision is being asked for. */
  kind: string;
}
