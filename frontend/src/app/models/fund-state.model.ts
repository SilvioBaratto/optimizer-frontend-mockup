/**
 * TypeScript mirror of `FundState` and the deliberation that writes it.
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows.
 *
 * The shape is deliberately narrow: `FundState` is a frozen dataclass with
 * exactly five fields, each written by exactly one participant. Adding a sixth
 * field here, or letting two writers share one, would describe a system the
 * backend does not have.
 */

export type AgentStatus = 'active' | 'needs-review' | 'idle' | 'failed';

/** One of the fund's four agents, as summarised on the dashboard. */
export interface AgentSummary {
  id: string;
  name: string;
  status: AgentStatus;
  /** Time of the agent's last update, `HH:MM`. */
  updatedAt: string;
  /** Agent's own page in the FUND section. */
  route: string;
}

// --- run identity ----------------------------------------------------------

/**
 * The deliberation runs the orchestrator still retains, newest first.
 *
 * A run id is the only token that crosses a page boundary: the audit log names
 * one on every decision, the risk agent keeps a verdict per run, and a link
 * from either of those arrives here carrying it. Naming the retained set once,
 * in the model both sides already read, is what lets a page that receives an
 * id say something true about it instead of assuming it means the run on
 * screen.
 *
 * Retained is not the same as loaded. Only the newest run's checkpoints are
 * held live — see `CURRENT_RUN_ID`.
 */
export const RETAINED_RUN_IDS: readonly string[] = ['1247', '1246', '1245'];

/**
 * The run whose checkpoints the deliberation view holds.
 *
 * Derived from the retained list rather than written out a second time: the
 * newest retained run is by definition the one being deliberated, and a second
 * literal would be free to drift away from the first.
 */
export const CURRENT_RUN_ID: string = RETAINED_RUN_IDS[0];

// --- deliberation ----------------------------------------------------------

/** The four agents, in the order they run. */
export type AgentId = 'macro' | 'allocation' | 'risk' | 'execution';

export const AGENT_IDS: readonly AgentId[] = ['macro', 'allocation', 'risk', 'execution'];

export const AGENT_LABEL: Record<AgentId, string> = {
  macro: 'Macro',
  allocation: 'Allocation',
  risk: 'Risk',
  execution: 'Execution',
};

/** Each agent's own detail page, which stays the place to inspect its work. */
export const AGENT_ROUTE: Record<AgentId, string> = {
  macro: '/fund/macro-agent',
  allocation: '/fund/allocation-agent',
  risk: '/fund/risk-agent',
  execution: '/fund/execution-agent',
};

/**
 * A node's state within a run.
 *
 * Always rendered with an icon and a word, never colour alone — a run that has
 * failed and one still pending must be distinguishable in greyscale.
 */
export type NodeStatus = 'pending' | 'running' | 'done' | 'failed';

export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  pending: 'pending',
  running: 'running',
  done: 'done',
  failed: 'failed',
};

export const NODE_STATUS_ICON: Record<NodeStatus, string> = {
  pending: '○',
  running: '●',
  done: '✓',
  failed: '✗',
};

export interface AgentNode {
  id: AgentId;
  label: string;
  status: NodeStatus;
  /** When the node last wrote to the state; null while it never has. */
  at: string | null;
}

/** The five fields of `FundState`, named exactly as the contract names them. */
export type FundStateField =
  | 'macro_view'
  | 'allocation'
  | 'risk_verdict'
  | 'proposed_orders'
  | 'approvals';

export const FUND_STATE_FIELDS: readonly FundStateField[] = [
  'macro_view',
  'allocation',
  'risk_verdict',
  'proposed_orders',
  'approvals',
];

/**
 * Who writes each field. The human gate writes `approvals` and nothing else;
 * no agent can, which is the point of keeping it in the same object.
 */
export const FIELD_WRITER: Record<FundStateField, string> = {
  macro_view: 'macro agent',
  allocation: 'allocation agent',
  risk_verdict: 'risk agent',
  proposed_orders: 'execution agent',
  approvals: 'human gate',
};

export interface FundStateFieldRow {
  field: FundStateField;
  writtenBy: string;
  /** Empty is the initial value — `None`, or an empty tuple for the two tuples. */
  set: boolean;
  /** Element count, for the two tuple-valued fields. */
  count: number | null;
  updated: string | null;
  /** One-line summary of the value, available only once the field is set. */
  summary: string | null;
  /** The longer form behind "view field detail". */
  detail: string | null;
}

/** One saved step of the frozen state — the audit record (Fondamenti §4). */
export interface Checkpoint {
  step: number;
  /** Null for step 1, the initial state, which no agent wrote. */
  fieldWritten: FundStateField | null;
  agent: AgentId | null;
  at: string;
  /** The five field rows exactly as they stood when this step was saved. */
  fields: readonly FundStateFieldRow[];
}

export type StreamEventKind = 'node.start' | 'node.progress' | 'node.complete' | 'stream.notice';

export interface StreamEvent {
  /** Monotonic; the value replayed against on reconnect. */
  id: number;
  event: StreamEventKind;
  node: AgentId | null;
  summary: string;
  at: string;
}

export type RunStatus = 'idle' | 'running' | 'complete' | 'failed';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'IDLE — no active run',
  running: 'RUNNING',
  complete: 'COMPLETE',
  failed: 'FAILED',
};

export type ConnectionState = 'live' | 'reconnecting' | 'closed';
