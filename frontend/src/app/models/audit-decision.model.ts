/**
 * TypeScript mirror of the audit-trail entry type.
 */

/** One entry of the dashboard's recent-activity feed. */
export interface ActivityEntry {
  id: string;
  /** `HH:MM` of the event. */
  at: string;
  description: string;
  /** Page that explains the event — the run, the agent, the review. */
  route: string;
}
