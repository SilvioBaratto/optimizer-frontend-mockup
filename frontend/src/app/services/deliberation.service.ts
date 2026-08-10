import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  AGENT_IDS,
  AGENT_LABEL,
  CURRENT_RUN_ID,
  FIELD_WRITER,
  FUND_STATE_FIELDS,
  RETAINED_RUN_IDS,
  type AgentId,
  type AgentNode,
  type Checkpoint,
  type ConnectionState,
  type FundStateField,
  type FundStateFieldRow,
  type NodeStatus,
  type RunStatus,
  type StreamEvent,
} from '../models/fund-state.model';

/**
 * Milliseconds between simulated stream events. 118 events at this rate
 * compresses the run's three and a half minutes into about fourteen seconds —
 * long enough to watch the nodes turn over one at a time.
 */
const TICK_MS = 120;

/** The field each agent writes, and what it writes there. */
const AGENT_WRITES: Record<AgentId, { field: FundStateField; summary: string; detail: string; count: number | null }> = {
  macro: {
    field: 'macro_view',
    summary: 'regime risk-on',
    detail:
      'Filtered regime probability 0.71 risk-on, 0.19 slow growth, 0.10 crash. Nowcast within one standard error of trend.',
    count: null,
  },
  allocation: {
    field: 'allocation',
    summary: 'target weights',
    detail: 'Target weights over 42 assets, long/short, gross 1.41, net 1.00, tracking error 3.2%.',
    count: null,
  },
  risk: {
    field: 'risk_verdict',
    summary: 'within limits',
    detail:
      'VaR 2.8% and CVaR 4.1% of NAV against limits of 3.5% and 5.0%. No single Euler contribution above the 15% budget.',
    count: null,
  },
  execution: {
    field: 'proposed_orders',
    summary: '12 orders',
    detail: '12 orders, EUR 1.02m traded, scheduled over 4 intervals with hyperbolic decay.',
    count: 12,
  },
};

/** Timestamps the run reproduces, matching the checkpoints in the spec. */
const STEP_TIMES = ['09:10:41Z', '09:11:02Z', '09:12:14Z', '09:13:20Z', '09:14:07Z'];

/** Event id at which each agent's `node.complete` lands. */
const COMPLETE_IDS: Record<AgentId, number> = {
  macro: 81,
  allocation: 94,
  risk: 109,
  execution: 118,
};

const TOTAL_EVENTS = 118;

/**
 * A single dropped connection partway through the run.
 *
 * Streams do drop, and the page has to show that its data survives it. Without
 * one scripted here the reconnect banner, the `Last-Event-ID` replay and the
 * rule that nothing already received gets cleared would all be unreachable.
 */
const DISCONNECT_AT = 88;
const RECONNECT_AT = 108;

function emptyField(field: FundStateField): FundStateFieldRow {
  return {
    field,
    writtenBy: FIELD_WRITER[field],
    set: false,
    count: field === 'proposed_orders' || field === 'approvals' ? 0 : null,
    updated: null,
    summary: null,
    detail: null,
  };
}

/** The five fields as they stand after the first `n` agents have written. */
function fieldsAfter(agentCount: number): FundStateFieldRow[] {
  return FUND_STATE_FIELDS.map((field) => {
    const index = AGENT_IDS.findIndex((a) => AGENT_WRITES[a].field === field);
    // `approvals` has no agent writer at all: only the human gate fills it.
    if (index === -1 || index >= agentCount) return emptyField(field);
    const write = AGENT_WRITES[AGENT_IDS[index]];
    return {
      field,
      writtenBy: FIELD_WRITER[field],
      set: true,
      count: write.count,
      updated: STEP_TIMES[index + 1],
      summary: write.summary,
      detail: write.detail,
    };
  });
}

/**
 * The deliberation of the four agents, and the state they write.
 *
 * The HTTP client is not wired yet; this drives the same signals from a timer.
 * What it models faithfully is the shape of the contract: agents never touch
 * each other, each writes exactly one field, and every write produces a frozen
 * checkpoint that stays readable afterwards. The checkpoint history is the
 * audit record — the same object that decouples the agents (Fondamenti §4).
 *
 * It holds exactly one run, and it says which. Without a run id the audit
 * log's «Fund Deliberation · run #1247» reached a page that could neither
 * confirm nor deny the run it was sent to look at; with one, a reader who
 * arrives asking for a different run gets told so.
 */
@Injectable({ providedIn: 'root' })
export class DeliberationService {
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The run these checkpoints belong to.
   *
   * A signal because the page reads it in derived state, and only one run is
   * ever loaded: the checkpoints below are that run's, and no other run's
   * frozen state exists here to switch to.
   */
  private readonly _runId = signal(CURRENT_RUN_ID);

  /** The runs still retained anywhere in the app, newest first. */
  private readonly _retainedRunIds = signal(RETAINED_RUN_IDS);

  private readonly _status = signal<RunStatus>('idle');
  private readonly _connection = signal<ConnectionState>('closed');
  private readonly _events = signal<readonly StreamEvent[]>([]);
  private readonly _checkpoints = signal<readonly Checkpoint[]>([]);
  private readonly _lastEventId = signal(0);
  private readonly _agentsDone = signal(0);
  private readonly _runningAgent = signal<AgentId | null>(null);
  /** Events buffered while disconnected, replayed on reconnect. */
  private readonly _replayedCount = signal(0);

  readonly runId = this._runId.asReadonly();
  readonly retainedRunIds = this._retainedRunIds.asReadonly();
  readonly status = this._status.asReadonly();
  readonly connection = this._connection.asReadonly();
  readonly events = this._events.asReadonly();
  readonly checkpoints = this._checkpoints.asReadonly();
  readonly lastEventId = this._lastEventId.asReadonly();
  readonly replayedCount = this._replayedCount.asReadonly();

  /** Checkpoint being inspected; null follows the newest. */
  readonly selectedStep = signal<number | null>(null);
  readonly nodeFilter = signal<AgentId | 'all'>('all');
  readonly pauseAutoScroll = signal(false);
  /** Steps ticked for comparison in the audit table. */
  readonly comparisonSteps = signal<readonly number[]>([]);

  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  // --- derived state --------------------------------------------------------

  readonly hasRun = computed(() => this._checkpoints().length > 0);

  readonly latestCheckpoint = computed<Checkpoint | null>(() => {
    const all = this._checkpoints();
    return all.length ? all[all.length - 1] : null;
  });

  /**
   * The checkpoint on screen. Selecting an earlier step freezes the view at
   * that step rather than following the stream — the whole reason the state is
   * checkpointed is that it can be read back exactly as it was.
   */
  readonly activeCheckpoint = computed<Checkpoint | null>(() => {
    const step = this.selectedStep();
    if (step === null) return this.latestCheckpoint();
    return this._checkpoints().find((c) => c.step === step) ?? this.latestCheckpoint();
  });

  readonly isHistoric = computed(() => {
    const active = this.activeCheckpoint();
    const latest = this.latestCheckpoint();
    return active !== null && latest !== null && active.step !== latest.step;
  });

  /** The five field rows, as of the checkpoint being inspected. */
  readonly fields = computed<readonly FundStateFieldRow[]>(
    () => this.activeCheckpoint()?.fields ?? FUND_STATE_FIELDS.map(emptyField),
  );

  /**
   * Node states, as of the checkpoint being inspected.
   *
   * A historic checkpoint shows the nodes as they stood then, so the diagram
   * and the inspector never disagree about which step is on screen.
   */
  readonly nodes = computed<readonly AgentNode[]>(() => {
    const active = this.activeCheckpoint();
    const running = this._runningAgent();
    // Step 1 is the initial state; step n means n−1 agents have written.
    const written = active ? active.step - 1 : 0;

    return AGENT_IDS.map((id, index) => {
      let status: NodeStatus = 'pending';
      let at: string | null = null;
      if (index < written) {
        status = 'done';
        at = STEP_TIMES[index + 1];
      } else if (!this.isHistoric() && running === id) {
        status = 'running';
      }
      return { id, label: AGENT_LABEL[id], status, at };
    });
  });

  readonly proposedOrderCount = computed(() => {
    const row = this.fields().find((f) => f.field === 'proposed_orders');
    return row?.set ? (row.count ?? 0) : 0;
  });

  /**
   * The exit to the human gate opens only once the risk verdict and the orders
   * both exist — and it reads the newest checkpoint, not the one being
   * inspected, because inspecting history must not arm a forward action.
   */
  readonly canSendToGate = computed(() => {
    const latest = this.latestCheckpoint();
    if (!latest) return false;
    const set = (f: FundStateField) => latest.fields.find((r) => r.field === f)?.set ?? false;
    return set('risk_verdict') && set('proposed_orders');
  });

  readonly agentFieldsComplete = computed(() => {
    const latest = this.latestCheckpoint();
    if (!latest) return false;
    return latest.fields
      .filter((f) => f.field !== 'approvals')
      .every((f) => f.set);
  });

  readonly visibleEvents = computed(() => {
    const filter = this.nodeFilter();
    const all = this._events();
    return filter === 'all' ? all : all.filter((e) => e.node === filter);
  });

  readonly comparedCheckpoints = computed(() =>
    this._checkpoints().filter((c) => this.comparisonSteps().includes(c.step)),
  );

  readonly canCompare = computed(() => this.comparisonSteps().length >= 2);

  // --- run lifecycle --------------------------------------------------------

  start(): void {
    if (this._status() === 'running') return;

    this._status.set('running');
    this._connection.set('live');
    this._events.set([]);
    this._lastEventId.set(0);
    this._agentsDone.set(0);
    this._runningAgent.set(AGENT_IDS[0]);
    this._replayedCount.set(0);
    this.selectedStep.set(null);
    this.comparisonSteps.set([]);
    this.cursor = 0;

    // Step 1 — the initial state, before any agent has written to it.
    this._checkpoints.set([
      { step: 1, fieldWritten: null, agent: null, at: STEP_TIMES[0], fields: fieldsAfter(0) },
    ]);
    this.push('stream.notice', null, 'run started · streaming per-node events');

    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    this.cursor += 1;

    if (this.cursor === DISCONNECT_AT) {
      this._connection.set('reconnecting');
      return;
    }
    if (this.cursor > DISCONNECT_AT && this.cursor < RECONNECT_AT) {
      // Events keep arriving at the server; the client is just not hearing them.
      return;
    }
    if (this.cursor === RECONNECT_AT) {
      const replayed = RECONNECT_AT - DISCONNECT_AT;
      this._connection.set('live');
      this._replayedCount.set(replayed);
      this.push(
        'stream.notice',
        null,
        `stream reconnected · replayed from Last-Event-ID ${this._lastEventId()} · ${replayed} events recovered`,
      );
      return;
    }

    const nextId = this._lastEventId() + 1;
    const agentIndex = this._agentsDone();
    const agent = AGENT_IDS[agentIndex];
    if (!agent) return;

    if (nextId === COMPLETE_IDS[agent]) {
      this.completeAgent(agent);
      return;
    }

    // The first event a node emits announces it; the rest are progress.
    const write = AGENT_WRITES[agent];
    const starting = this._events().every((e) => e.node !== agent);
    this.push(
      starting ? 'node.start' : 'node.progress',
      agent,
      starting ? `reading state · will write ${write.field}` : `${write.field} · working`,
    );
  }

  private completeAgent(agent: AgentId): void {
    const index = AGENT_IDS.indexOf(agent);
    const write = AGENT_WRITES[agent];

    this.push('node.complete', agent, `${write.field} → ${write.summary}`);

    // Every write produces a new frozen checkpoint: the audit record and the
    // decoupling are the same object.
    this._checkpoints.update((all) => [
      ...all,
      {
        step: index + 2,
        fieldWritten: write.field,
        agent,
        at: STEP_TIMES[index + 1],
        fields: fieldsAfter(index + 1),
      },
    ]);

    this._agentsDone.set(index + 1);
    const next = AGENT_IDS[index + 1];
    this._runningAgent.set(next ?? null);

    if (!next) {
      this._status.set('complete');
      this._connection.set('closed');
      this.stopTimer();
    }
  }

  private push(event: StreamEvent['event'], node: AgentId | null, summary: string): void {
    const id = Math.min(TOTAL_EVENTS, this._lastEventId() + 1);
    this._lastEventId.set(id);
    this._events.update((all) => [{ id, event, node, summary, at: this.clock() }, ...all]);
  }

  /**
   * Run clock, spread across the 09:10:41Z → 09:14:07Z window the checkpoints
   * sit in, so an event's time and its checkpoint's time agree.
   */
  private clock(): string {
    const start = 9 * 3600 + 10 * 60 + 41;
    const elapsed = Math.round((this.cursor / TOTAL_EVENTS) * 206);
    const t = start + elapsed;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}Z`;
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  // --- selection ------------------------------------------------------------

  selectStep(step: number | null): void {
    this.selectedStep.set(step);
  }

  toggleComparison(step: number): void {
    this.comparisonSteps.update((steps) =>
      steps.includes(step) ? steps.filter((s) => s !== step) : [...steps, step].sort((a, b) => a - b),
    );
  }

  clearComparison(): void {
    this.comparisonSteps.set([]);
  }
}
