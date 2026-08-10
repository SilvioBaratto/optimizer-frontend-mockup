import { Injectable, computed, signal } from '@angular/core';

import {
  FAILURE_PHASE_LABEL,
  HORIZON_NOTE,
  MACRO_STALE_NOTE,
  METHOD_FOOTNOTE,
  PORTOPT,
  RISK_MEASURE_DEFINITION,
  RISK_MEASURE_LABEL,
  TCE_COINCIDENCE_NOTE,
  TOOL_CALL_KIND,
  TWO_SIDED_PARAMETERS_NOTE,
  VAR_METHOD_LABEL,
  VERDICT_LABEL,
  WCE_UNAVAILABLE_NOTE,
  type ConfidenceLevel,
  type FundStateInput,
  type RiskAgentError,
  type RiskFailurePhase,
  type RiskMeasure,
  type RiskMeasureSet,
  type RiskReadingTable,
  type RiskRun,
  type RiskRunOption,
  type RiskVerdict,
  type ToolCall,
  type UpstreamInput,
  type VarMethod,
} from '../models/risk-verdict.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const ASSESSMENT_MS = 900;

/**
 * Everything the deterministic tool returned for one run, plus the verdict the
 * model then wrote about it.
 *
 * One object per run because the run picker changes the whole view: a verdict
 * belongs to the numbers it was written against, and showing last week's
 * rationale beside today's measures would misrepresent both.
 */
interface RiskRunSnapshot {
  run: RiskRun;
  readings: RiskReadingTable;
  /**
   * ρ(a = 0.5, p = 2). It is keyed by method but not by confidence: the
   * two-sided measure is set by a and p and has no confidence level at all —
   * only the sample it is measured on changes it.
   */
  twoSided: Record<VarMethod, number>;
  verdict: RiskVerdict;
  toolCalls: readonly ToolCall[];
}

/**
 * Three runs of the agent, newest first.
 *
 * The percentages are one-day portfolio returns. Within every run they satisfy
 * the ordering the theory requires — ES ≤ TCE ≤ VaR ≤ 0 — and 99% is uniformly
 * more severe than 95%. Under `historical` the empirical loss distribution is
 * discrete, so TCE sits strictly between VaR and ES; under `riskmetrics` there
 * is no TCE row at all, because the continuous assumption makes it ES.
 */
const SNAPSHOTS: readonly RiskRunSnapshot[] = [
  {
    run: { id: '1247', at: '2026-08-01T09:14:00Z', status: 'done', latest: true },
    readings: {
      riskmetrics: {
        95: { var: -2.71, es: -3.86 },
        99: { var: -3.87, es: -4.93 },
      },
      historical: {
        95: { var: -2.84, es: -4.12, tce: -3.97 },
        99: { var: -4.35, es: -6.08, tce: -5.71 },
      },
    },
    twoSided: { riskmetrics: -2.15, historical: -2.28 },
    verdict: {
      state: 'flagged',
      rationale:
        'Tail severity elevated vs. prior run; concentration in two sectors drives the gap between VaR and ES.',
      drivers: ['Sector concentration', 'Tail asymmetry'],
      at: '2026-08-01T09:14:03Z',
    },
    toolCalls: [
      {
        id: 'tc-1247-1',
        at: '2026-08-01T09:14:01Z',
        tool: 'market_data',
        kind: TOOL_CALL_KIND,
        durationSeconds: 0.18,
        status: 'success',
      },
      {
        id: 'tc-1247-2',
        at: '2026-08-01T09:14:02Z',
        tool: PORTOPT,
        kind: TOOL_CALL_KIND,
        durationSeconds: 0.42,
        status: 'success',
      },
    ],
  },
  {
    run: { id: '1246', at: '2026-07-31T17:40:00Z', status: 'done', latest: false },
    readings: {
      riskmetrics: {
        95: { var: -2.44, es: -3.28 },
        99: { var: -3.49, es: -4.19 },
      },
      historical: {
        95: { var: -2.51, es: -3.44, tce: -3.33 },
        99: { var: -3.72, es: -4.86, tce: -4.61 },
      },
    },
    twoSided: { riskmetrics: -1.98, historical: -2.06 },
    verdict: {
      state: 'pass',
      rationale:
        'Tail measures inside the budget at both confidence levels; the VaR-to-ES gap is in line with the two preceding runs.',
      drivers: ['Rate duration'],
      at: '2026-07-31T17:40:02Z',
    },
    toolCalls: [
      {
        id: 'tc-1246-1',
        at: '2026-07-31T17:39:58Z',
        tool: 'market_data',
        kind: TOOL_CALL_KIND,
        durationSeconds: 0.21,
        status: 'success',
      },
      {
        id: 'tc-1246-2',
        at: '2026-07-31T17:39:59Z',
        tool: PORTOPT,
        kind: TOOL_CALL_KIND,
        durationSeconds: 0.39,
        status: 'success',
      },
    ],
  },
  {
    run: { id: '1245', at: '2026-07-30T18:05:00Z', status: 'done', latest: false },
    readings: {
      riskmetrics: {
        95: { var: -2.38, es: -3.16 },
        99: { var: -3.4, es: -4.05 },
      },
      historical: {
        95: { var: -2.45, es: -3.31, tce: -3.21 },
        99: { var: -3.61, es: -4.68, tce: -4.44 },
      },
    },
    twoSided: { riskmetrics: -1.93, historical: -2.01 },
    verdict: {
      state: 'pass',
      rationale:
        'No measure within reach of its limit, and no single sector accounts for more than a fifth of the tail.',
      drivers: [],
      at: '2026-07-30T18:05:02Z',
    },
    toolCalls: [
      {
        id: 'tc-1245-1',
        at: '2026-07-30T18:04:57Z',
        tool: 'market_data',
        kind: TOOL_CALL_KIND,
        durationSeconds: 0.16,
        status: 'success',
      },
      {
        id: 'tc-1245-2',
        at: '2026-07-30T18:04:58Z',
        tool: PORTOPT,
        kind: TOOL_CALL_KIND,
        durationSeconds: 0.44,
        status: 'success',
      },
    ],
  },
];

const LATEST_RUN_ID = SNAPSHOTS[0].run.id;

/**
 * The shared state as the agent found it.
 *
 * The macro view is seventeen minutes behind the allocation, which is the
 * freshness edge case the page has to surface — and it is derived from these
 * two timestamps, never asserted as a flag.
 */
const ALLOCATION_INPUT: FundStateInput = {
  field: 'allocation',
  writtenBy: 'Allocation Agent',
  at: '2026-08-01T09:12:00Z',
  summary: '8 positions',
  positionCount: 8,
  route: '/fund/allocation-agent',
  linkLabel: 'Open in Allocation Agent',
};

const MACRO_INPUT: FundStateInput = {
  field: 'macro_view',
  writtenBy: 'Macro & Regimes Agent',
  at: '2026-08-01T08:55:00Z',
  summary: 'Bull 62% · six asset-class views',
  positionCount: null,
  route: '/fund/macro-agent',
  linkLabel: 'Open in Macro & Regimes',
};

const FAILURE_MESSAGE: Record<RiskFailurePhase, string> = {
  calculation:
    'The deterministic risk calculation failed: portopt returned no result for the proposed allocation.',
  interpretation:
    'The model interpretation failed: the risk measures were produced, but the model wrote no verdict.',
};

const FAILURE_DETAIL: Record<RiskFailurePhase, string> = {
  calculation:
    'Nothing was written to state.risk_verdict. The measures below are from the last successful run.',
  interpretation:
    'Nothing was written to state.risk_verdict. The measures below are the ones the model was given.',
};

/**
 * The risk agent's page state.
 *
 * The measures are computed once per run by a tool; the confidence level and
 * the VaR method are filters over that result and nothing else. They are
 * therefore plain signals feeding a `computed()`, with no path from either of
 * them into `recompute()` — the one property of this service that the page's
 * whole claim about determinism rests on.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the loading and error states in
 * the page spec actually reachable.
 */
@Injectable({ providedIn: 'root' })
export class RiskAgentService {
  // --- display filters ------------------------------------------------------

  /** Display-only. Changing it re-reads a computed result; it never re-runs one. */
  readonly confidence = signal<ConfidenceLevel>(95);

  /** Display-only, on the same terms as `confidence`. */
  readonly method = signal<VarMethod>('riskmetrics');

  // --- runs -----------------------------------------------------------------

  private readonly _runs = signal<readonly RiskRun[]>(SNAPSHOTS.map((s) => s.run));
  /** The agent's past executions, newest first. */
  readonly runs = this._runs.asReadonly();

  private readonly _selectedRunId = signal<string | null>(LATEST_RUN_ID);
  readonly selectedRunId = this._selectedRunId.asReadonly();

  /**
   * The run on screen, or null when there is none.
   *
   * The history is consulted as well as the id, so an empty history really is
   * empty: the page's second empty cause — the agent has not run for this
   * portfolio yet — is a different situation from a missing allocation and has
   * to be reachable on its own.
   */
  private readonly snapshot = computed<RiskRunSnapshot | null>(() => {
    const id = this._selectedRunId();
    if (id === null || !this._runs().some((run) => run.id === id)) return null;
    return SNAPSHOTS.find((s) => s.run.id === id) ?? null;
  });

  readonly selectedRun = computed<RiskRun | null>(() => this.snapshot()?.run ?? null);

  /** `'2026-08-01 09:14 UTC'` — the stamp the breadcrumb and the picker show. */
  readonly selectedRunLabel = computed<string | null>(() => {
    const run = this.selectedRun();
    return run ? utcStamp(run.at) : null;
  });

  readonly runOptions = computed<readonly RiskRunOption[]>(() =>
    this.runs().map((run) => ({
      value: run.id,
      label: run.latest ? `Latest run — ${utcStamp(run.at)}` : `Run #${run.id} — ${utcStamp(run.at)}`,
    })),
  );

  /** A verdict from a superseded run is still a verdict — but it is not current. */
  readonly viewingHistoricalRun = computed(() => {
    const run = this.selectedRun();
    return run !== null && !run.latest;
  });

  readonly historicalRunNote = computed<string | null>(() => {
    const run = this.selectedRun();
    if (!run || run.latest) return null;
    return `Viewing run #${run.id} — state.allocation may have been replaced since this verdict was written`;
  });

  selectRun(id: string): void {
    if (this._runs().some((run) => run.id === id)) this._selectedRunId.set(id);
  }

  /**
   * Empties the run history — the agent has not run for this portfolio yet.
   *
   * The counterpart of `readFundState`: that models the missing *input*, this
   * models the missing *output*. Both land on the empty state, and the page
   * says something different in each because the next step is different.
   */
  clearRuns(): void {
    this._runs.set([]);
    this._selectedRunId.set(null);
  }

  // --- what was read from the shared state ----------------------------------

  private readonly _allocation = signal<FundStateInput | null>(ALLOCATION_INPUT);
  private readonly _macro = signal<FundStateInput | null>(MACRO_INPUT);

  /**
   * Re-points the agent at a different read of the shared state.
   *
   * Passing a null allocation models the prerequisite that has not been met
   * yet — the allocation agent has not written — which is the page's empty
   * state. The real client would set this from the `FundState` payload.
   */
  readFundState(allocation: FundStateInput | null, macro: FundStateInput | null): void {
    this._allocation.set(allocation);
    this._macro.set(macro);
  }

  /**
   * Freshness, derived from the two timestamps rather than stored.
   *
   * A stored flag would be a second copy of a comparison, free to disagree
   * with the stamps printed beside it.
   */
  readonly macroStale = computed(() => {
    const macro = this._macro();
    const allocation = this._allocation();
    if (!macro || !allocation) return false;
    return Date.parse(macro.at) < Date.parse(allocation.at);
  });

  readonly allocationInput = computed<UpstreamInput | null>(() => {
    const raw = this._allocation();
    if (!raw) return null;
    // The allocation is the reference point of the comparison, so it is never
    // the input that is behind.
    return { ...raw, atLabel: utcTime(raw.at), stale: false, staleNote: null };
  });

  readonly macroInput = computed<UpstreamInput | null>(() => {
    const raw = this._macro();
    if (!raw) return null;
    const stale = this.macroStale();
    return {
      ...raw,
      atLabel: utcTime(raw.at),
      stale,
      staleNote: stale ? MACRO_STALE_NOTE : null,
    };
  });

  /** The two input cards, in wireframe order, minus anything not yet written. */
  readonly inputs = computed<readonly UpstreamInput[]>(() =>
    [this.allocationInput(), this.macroInput()].filter((i): i is UpstreamInput => i !== null),
  );

  // --- the deterministic calculation ----------------------------------------

  readonly toolCalls = computed<readonly ToolCall[]>(() => this.snapshot()?.toolCalls ?? []);

  /** The `portopt` call the 'Deterministic risk calculation' card reports. */
  readonly calculation = computed<ToolCall | null>(
    () => this.toolCalls().find((c) => c.tool === PORTOPT) ?? null,
  );

  /** `'09:14:02 UTC'`, to the second, as the audit table shows it. */
  readonly calculationAtLabel = computed<string | null>(() => {
    const call = this.calculation();
    return call ? utcClock(call.at) : null;
  });

  // --- the measures ---------------------------------------------------------

  /**
   * The five measures for the selected (confidence, method) pair.
   *
   * A `computed()`, deliberately: the pair selects a view of a result the tool
   * already produced. Nothing here can start a run.
   */
  readonly measureSet = computed<RiskMeasureSet | null>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return null;
    return buildMeasureSet(snapshot, this.confidence(), this.method());
  });

  readonly measures = computed<readonly RiskMeasure[]>(() => this.measureSet()?.measures ?? []);

  /** `'Risk metrics · 95% · RiskMetrics'` — the SectionLabel over the grid. */
  readonly measuresLabel = computed(() => {
    const set = this.measureSet();
    if (!set) return 'Risk metrics';
    return `Risk metrics · ${set.confidence}% · ${VAR_METHOD_LABEL[set.method]}`;
  });

  // --- the verdict ----------------------------------------------------------

  readonly verdict = computed<RiskVerdict | null>(() => this.snapshot()?.verdict ?? null);

  /**
   * `state.risk_verdict` as written, for the disclosure.
   *
   * It carries every combination the tool computed, not the one on screen: the
   * chips filter what is displayed, and a filter has no business rewriting the
   * object the agent deposited in the shared state.
   */
  readonly rawVerdict = computed<string | null>(() => {
    const snapshot = this.snapshot();
    return snapshot ? buildRawVerdict(snapshot) : null;
  });

  // --- lifecycle ------------------------------------------------------------

  private readonly _running = signal(false);
  readonly running = this._running.asReadonly();

  private readonly _error = signal<RiskAgentError | null>(null);
  readonly error = this._error.asReadonly();

  readonly state = computed<PageState>(() => {
    if (this._running()) return 'loading';
    if (this._error()) return 'error';
    if (!this.allocationInput() || !this.snapshot()) return 'empty';
    return 'ready';
  });

  /** No allocation, nothing to assess. Re-entering while running is refused too. */
  readonly canRun = computed(() => this.allocationInput() !== null && !this._running());

  /**
   * Re-runs the assessment: the deterministic tool first, then the model's
   * interpretation of what it returned.
   *
   * `fail` picks which of the two halves fails, because the error state has to
   * name it — no numbers at all is a different situation from numbers with no
   * verdict. `recompute(true)` fails the calculation, the earlier of the two.
   */
  async recompute(fail: boolean | RiskFailurePhase = false): Promise<void> {
    if (!this.canRun()) return;

    this._running.set(true);
    this._error.set(null);

    await delay(ASSESSMENT_MS);

    if (fail) {
      const phase: RiskFailurePhase = fail === true ? 'calculation' : fail;
      this._error.set({
        phase,
        message: `${FAILURE_PHASE_LABEL[phase]} — ${FAILURE_MESSAGE[phase]}`,
        detail: FAILURE_DETAIL[phase],
      });
      this._running.set(false);
      return;
    }

    // A completed run enters the history and becomes the current one, whichever
    // run was being inspected — and whether or not there was a history at all.
    this._runs.set(SNAPSHOTS.map((s) => s.run));
    this._selectedRunId.set(LATEST_RUN_ID);
    this._running.set(false);
  }

  clearError(): void {
    this._error.set(null);
  }
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Builds the five cards for one (confidence, method) pair.
 *
 * The whole rule of the page lives in the branch below. Under `riskmetrics` a
 * continuous distribution is assumed, so TCE is read from the ES field — there
 * is no parametric TCE to read — and the coincidence is annotated. Under
 * `historical` the loss distribution is discrete and TCE is its own number, so
 * the annotation is dropped. WCE is null either way: it is defined over every
 * event of probability greater than α, and that is not a computation the tool
 * can perform from a sample.
 */
function buildMeasureSet(
  snapshot: RiskRunSnapshot,
  confidence: ConfidenceLevel,
  method: VarMethod,
): RiskMeasureSet {
  const continuous = method === 'riskmetrics';

  let varValue: number;
  let es: number;
  let tce: number;
  if (continuous) {
    const reading = snapshot.readings.riskmetrics[confidence];
    varValue = reading.var;
    es = reading.es;
    tce = reading.es;
  } else {
    const reading = snapshot.readings.historical[confidence];
    varValue = reading.var;
    es = reading.es;
    tce = reading.tce;
  }

  const measures: readonly RiskMeasure[] = [
    {
      id: 'var',
      label: RISK_MEASURE_LABEL.var,
      value: varValue,
      horizon: HORIZON_NOTE,
      annotation: null,
      definition: RISK_MEASURE_DEFINITION.var,
    },
    {
      id: 'es',
      label: RISK_MEASURE_LABEL.es,
      value: es,
      horizon: HORIZON_NOTE,
      annotation: null,
      definition: RISK_MEASURE_DEFINITION.es,
    },
    {
      id: 'tce',
      label: RISK_MEASURE_LABEL.tce,
      value: tce,
      horizon: HORIZON_NOTE,
      annotation: continuous ? TCE_COINCIDENCE_NOTE : null,
      definition: RISK_MEASURE_DEFINITION.tce,
    },
    {
      id: 'wce',
      label: RISK_MEASURE_LABEL.wce,
      value: null,
      horizon: null,
      annotation: WCE_UNAVAILABLE_NOTE,
      definition: RISK_MEASURE_DEFINITION.wce,
    },
    {
      id: 'two-sided',
      label: RISK_MEASURE_LABEL['two-sided'],
      value: snapshot.twoSided[method],
      horizon: HORIZON_NOTE,
      annotation: TWO_SIDED_PARAMETERS_NOTE,
      definition: RISK_MEASURE_DEFINITION['two-sided'],
    },
  ];

  return {
    confidence,
    method,
    measures,
    tceEqualsEs: continuous,
    methodNote: METHOD_FOOTNOTE[method],
  };
}

/** Percent return to the decimal fraction the stored object holds. */
function fraction(percent: number): number {
  return Number((percent / 100).toFixed(4));
}

function buildRawVerdict(snapshot: RiskRunSnapshot): string {
  const { readings, twoSided, verdict } = snapshot;
  return JSON.stringify(
    {
      verdict: VERDICT_LABEL[verdict.state],
      written_by: 'risk_agent',
      written_at: verdict.at,
      computed_by: PORTOPT,
      horizon_days: 1,
      measures: {
        riskmetrics: {
          '95': parametric(readings.riskmetrics[95]),
          '99': parametric(readings.riskmetrics[99]),
        },
        historical: {
          '95': empirical(readings.historical[95]),
          '99': empirical(readings.historical[99]),
        },
      },
      two_sided: {
        a: 0.5,
        p: 2,
        riskmetrics: fraction(twoSided.riskmetrics),
        historical: fraction(twoSided.historical),
      },
      drivers: verdict.drivers,
      rationale: verdict.rationale,
    },
    null,
    2,
  );
}

function parametric(reading: { var: number; es: number }) {
  return {
    var: fraction(reading.var),
    es: fraction(reading.es),
    // The continuous assumption, spelled out in the stored object too.
    tce: fraction(reading.es),
    wce: null,
  };
}

function empirical(reading: { var: number; es: number; tce: number }) {
  return {
    var: fraction(reading.var),
    es: fraction(reading.es),
    tce: fraction(reading.tce),
    wce: null,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
// Instants are sliced rather than parsed: the stored form is already UTC, and
// a Date would drag the runner's timezone into a label that must not move.

/** `'2026-08-01T09:14:00Z'` → `'2026-08-01 09:14 UTC'`. */
function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** `'2026-08-01T09:12:00Z'` → `'09:12 UTC'`. */
function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

/** `'2026-08-01T09:14:02Z'` → `'09:14:02 UTC'`. */
function utcClock(iso: string): string {
  return `${iso.slice(11, 19)} UTC`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
