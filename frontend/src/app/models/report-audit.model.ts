/**
 * TypeScript mirror of the audit surface: agent decisions, order idempotency
 * records and position provenance.
 *
 * `docs/24 Report & Audit trail.md`. Three things this file is careful about,
 * because the page is read by someone checking what the system did rather than
 * by someone driving it:
 *
 * - a decision carries the model, the parameters and the **full** output. The
 *   log is the audit surface — it works by inspection, not by replay;
 * - a missing prompt hash is a value, not a gap. `null` here means "the model
 *   this decision was produced with does not guarantee reproducibility, so no
 *   prompt hash was logged", which is the expected case, and the constants
 *   below give it a word so it never renders as an empty cell;
 * - an idempotency key and a reconciliation poll only exist once a broker
 *   adapter does. The types exist so the tab has something to render the day
 *   one is registered; the emptiness before that is a posture, not a bug, and
 *   it is read from `ExecutionService.brokerPosture()` rather than stated here.
 *
 * Agent ids come from `fund-state.model.ts` — the four agents that write the
 * fund state are the four agents that appear in this log, and a fifth
 * vocabulary would let the two drift.
 */

import type { AgentId } from './fund-state.model';

// --- tabs -------------------------------------------------------------------

export type AuditTabId = 'decision-log' | 'orders-idempotency' | 'positions-provenance';

export interface AuditTab {
  readonly id: AuditTabId;
  /** The tab's own label, as the wireframe spells it. */
  readonly label: string;
  /** The heading the panel carries, for readers who never see the strip. */
  readonly title: string;
  /** What the tab counts, singular is not needed — every count here is plural. */
  readonly noun: string;
}

export const AUDIT_TABS: readonly AuditTab[] = [
  { id: 'decision-log', label: 'Decision Log', title: 'Decision Log', noun: 'decisions' },
  {
    id: 'orders-idempotency',
    label: 'Orders & Idempotency',
    title: 'Orders & Idempotency',
    noun: 'order intents',
  },
  {
    id: 'positions-provenance',
    label: 'Positions Provenance',
    title: 'Positions Provenance',
    noun: 'positions',
  },
];

// --- agents -----------------------------------------------------------------

/**
 * The agent names as the sidebar and the wireframe spell them.
 *
 * `AGENT_LABEL` in `fund-state.model.ts` is the short form the deliberation
 * graph draws inside a node box; an audit row has room for the full name and
 * the reader is matching it against the sidebar they navigated from.
 */
export const AUDIT_AGENT_LABEL: Record<AgentId, string> = {
  macro: 'Macro & Regimes',
  allocation: 'Allocation Agent',
  risk: 'Risk Agent',
  execution: 'Execution & Orders',
};

export type AgentFilter = AgentId | 'all';

export const AGENT_FILTERS: readonly AgentFilter[] = [
  'all',
  'macro',
  'allocation',
  'risk',
  'execution',
];

export const AGENT_FILTER_LABEL: Record<AgentFilter, string> = {
  all: 'All agents',
  macro: AUDIT_AGENT_LABEL.macro,
  allocation: AUDIT_AGENT_LABEL.allocation,
  risk: AUDIT_AGENT_LABEL.risk,
  execution: AUDIT_AGENT_LABEL.execution,
};

// --- decision types ---------------------------------------------------------

/**
 * What kind of call the agent was making.
 *
 * One entry per step that reaches the LLM port. A deterministic tool call is
 * not a decision and is not logged here — it has no model and no output to
 * inspect.
 */
export type DecisionType =
  | 'regime-classification'
  | 'view-bridge'
  | 'weight-proposal'
  | 'constraint-check'
  | 'kill-switch-check'
  | 'schedule-solve'
  | 'order-intent';

export const DECISION_TYPES: readonly DecisionType[] = [
  'regime-classification',
  'view-bridge',
  'weight-proposal',
  'constraint-check',
  'kill-switch-check',
  'schedule-solve',
  'order-intent',
];

export const DECISION_TYPE_LABEL: Record<DecisionType, string> = {
  'regime-classification': 'Regime classification',
  'view-bridge': 'View bridge to Black-Litterman',
  'weight-proposal': 'Weight proposal',
  'constraint-check': 'Constraint check',
  'kill-switch-check': 'Kill-switch check',
  'schedule-solve': 'Trade schedule solved',
  'order-intent': 'Order intent drafted',
};

/** Which agent owns each kind of decision. One writer per step, as in the state. */
export const DECISION_TYPE_AGENT: Record<DecisionType, AgentId> = {
  'regime-classification': 'macro',
  'view-bridge': 'macro',
  'weight-proposal': 'allocation',
  'constraint-check': 'risk',
  'kill-switch-check': 'risk',
  'schedule-solve': 'execution',
  'order-intent': 'execution',
};

export type DecisionTypeFilter = DecisionType | 'all';

export const DECISION_TYPE_FILTERS: readonly DecisionTypeFilter[] = ['all', ...DECISION_TYPES];

export const DECISION_TYPE_FILTER_LABEL: Record<DecisionTypeFilter, string> = {
  all: 'All decisions',
  ...DECISION_TYPE_LABEL,
};

// --- date range -------------------------------------------------------------

export type DateRangeId = 'today' | '7d' | '30d' | 'all';

export const DATE_RANGES: readonly DateRangeId[] = ['today', '7d', '30d', 'all'];

export const DATE_RANGE_LABEL: Record<DateRangeId, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

/** Window width in days; `null` is unbounded. `today` is the current day only. */
export const DATE_RANGE_DAYS: Record<DateRangeId, number | null> = {
  today: 0,
  '7d': 7,
  '30d': 30,
  all: null,
};

// --- a decision -------------------------------------------------------------

export interface DecisionParam {
  readonly name: string;
  readonly value: string;
}

export interface AuditDecision {
  /** `dcn_…`, the id the log was written under. */
  readonly id: string;
  /** Calendar day, `YYYY-MM-DD`, in UTC like every other stamp in the app. */
  readonly date: string;
  /** `HH:MM:SS` UTC. */
  readonly time: string;
  readonly agent: AgentId;
  readonly type: DecisionType;
  /** The Ollama model that produced the output, exactly as it was tagged. */
  readonly model: string;
  readonly params: readonly DecisionParam[];
  /**
   * Hash of the prompt, when one was logged.
   *
   * `null` is the ordinary case and not an error: a hash is only worth logging
   * where the step was pinned to a fixed seed and `temperature=0`, and whether
   * that is even honoured depends on the Ollama model. See `NOT_LOGGED_*`.
   */
  readonly promptHash: string | null;
  /** The full output, one entry per paragraph. Never truncated in the panel. */
  readonly output: readonly string[];
  /** The deliberation run this decision belongs to — a run the fund pages know. */
  readonly runId: string;
  /** The trade this decision drafted, when it drafted one. */
  readonly tradeId: string | null;
}

/**
 * How a not-logged prompt hash reads.
 *
 * Rendered as the glyph with the label as its accessible name, styled like any
 * other cell: it is the expected state for a model without a reproducibility
 * guarantee, so it is neither a warning nor a blank a screen reader would read
 * as a missing value.
 */
export const NOT_LOGGED_GLYPH = '—';
export const NOT_LOGGED_LABEL = 'not logged';
export const NOT_LOGGED_NOTE =
  'not logged — reproducibility is not guaranteed for this model, so no prompt hash was recorded';

/** What a logged hash means, and what it still does not promise. */
export const HASH_LOGGED_NOTE =
  'logged — this step was pinned to a fixed seed, so the prompt can be identified; bit-exact replay still depends on the model';

export type DecisionSortKey = 'time' | 'agent' | 'decision' | 'model';

// --- audit posture ----------------------------------------------------------

export type PostureIndicatorId =
  | 'decision-logging'
  | 'reproducibility'
  | 'llm-validation'
  | 'broker-idempotency';

/**
 * One row of the posture card.
 *
 * `on` chooses the glyph and nothing else — the state is always written out as
 * a word beside it, so the card is readable in greyscale and by a reader who
 * never sees the glyph at all.
 */
export interface AuditPostureIndicator {
  readonly id: PostureIndicatorId;
  readonly label: string;
  /** «Active», «Not guaranteed», «At the LLM port», «Not configured». */
  readonly state: string;
  readonly on: boolean;
  readonly detail: string;
}

export const POSTURE_ON_GLYPH = '●';
export const POSTURE_OFF_GLYPH = '○';

/** Shown in place of the indicators when the posture read itself failed. */
export const POSTURE_UNAVAILABLE_GLYPH = '!';
export const POSTURE_UNAVAILABLE_LABEL = 'Status unavailable';

// --- orders & idempotency ---------------------------------------------------

/** The result of the deduplication check made before the POST. */
export type DeduplicationResult = 'unique' | 'duplicate-suppressed';

export const DEDUPLICATION_LABEL: Record<DeduplicationResult, string> = {
  unique: 'Unique — sent',
  'duplicate-suppressed': 'Duplicate — suppressed',
};

export const DEDUPLICATION_GLYPH: Record<DeduplicationResult, string> = {
  unique: '✓',
  'duplicate-suppressed': '⊘',
};

/**
 * Where the post-send reconciliation poll got to.
 *
 * `pending` is a real answer and the one the spec calls out: an order polled
 * while the venue has not yet settled it reads "Pending reconciliation" rather
 * than being reported as either filled or lost.
 */
export type ReconciliationState = 'pending' | 'reconciled' | 'mismatch';

export const RECONCILIATION_LABEL: Record<ReconciliationState, string> = {
  pending: 'Pending reconciliation',
  reconciled: 'Reconciled',
  mismatch: 'Mismatch — held',
};

export const RECONCILIATION_GLYPH: Record<ReconciliationState, string> = {
  pending: '○',
  reconciled: '✓',
  mismatch: '!',
};

export interface OrderIdempotencyRecord {
  readonly id: string;
  /** The proposed order this intent came from — a `TRD-…` the fund pages know. */
  readonly tradeId: string;
  readonly symbol: string;
  /** Generated client-side, before the POST, and reused on every retry. */
  readonly idempotencyKey: string;
  readonly dedup: DeduplicationResult;
  /** `HH:MM:SS` of the POST; null when deduplication suppressed it. */
  readonly postedAt: string | null;
  readonly reconciliation: ReconciliationState;
  readonly reconciliationNote: string;
}

// --- positions provenance ---------------------------------------------------

/** Positions are owned by the domain. These are the only two ways one arrives. */
export type PositionSource = 'manual' | 'csv-import';

export const POSITION_SOURCE_LABEL: Record<PositionSource, string> = {
  manual: 'Manual entry',
  'csv-import': 'CSV import',
};

export const POSITION_SOURCE_GLYPH: Record<PositionSource, string> = {
  manual: '✎',
  'csv-import': '↥',
};

export interface PositionProvenanceRow {
  readonly id: string;
  /** The investment choice, named as `portfolio.model.ts` names it. */
  readonly instrument: string;
  /** Weight x_i in percent, as the domain holds it. */
  readonly weight: number;
  readonly source: PositionSource;
  /** The CSV file, or the note left with the manual entry. */
  readonly reference: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
}

/** One line of the broker sync log — only ever non-empty with an adapter registered. */
export interface PositionSyncRow {
  readonly id: string;
  readonly instrument: string;
  readonly at: string;
  readonly result: string;
}

// --- export -----------------------------------------------------------------

export type ExportFormat = 'csv' | 'pdf';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'pdf'];

export const EXPORT_FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: 'CSV',
  pdf: 'PDF',
};
