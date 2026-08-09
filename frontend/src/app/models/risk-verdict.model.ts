/**
 * TypeScript mirror of the `risk_verdict` domain type and of the deterministic
 * risk measures the verdict is written against (`docs/14 Risk Agent.md`).
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Two facts about the risk agent are encoded in the types themselves rather
 * than left to the code that fills them in:
 *
 * 1. The numbers are computed by a tool, deterministically, and the model only
 *    interprets them. So `RiskVerdict` carries no measure of its own: it holds
 *    a badge, a rationale and a driver list, and nothing that could drift from
 *    what `portopt` returned.
 * 2. Under RiskMetrics a continuous distribution is assumed, and TCE is then
 *    *identically* ES/CVaR. `ParametricReading` therefore has no `tce` field
 *    at all — there is no second number to disagree with. Only the empirical
 *    reading, whose loss distribution is discrete, carries one.
 *
 * Every timestamp in this file is an ISO-8601 UTC instant (`2026-08-01T09:14:00Z`).
 * Display strings are formed where they are shown, never stored twice.
 */

// --- runs -------------------------------------------------------------------

/** Status of one execution of the agent. */
export type RiskRunStatus = 'idle' | 'running' | 'done' | 'error';

export const RISK_RUN_STATUS_LABEL: Record<RiskRunStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  done: 'Done',
  error: 'Error',
};

/** Word and glyph together — a run that failed must read as failed in greyscale. */
export const RISK_RUN_STATUS_ICON: Record<RiskRunStatus, string> = {
  idle: '○',
  running: '◐',
  done: '●',
  error: '✗',
};

export interface RiskRun {
  /** Run number as the orchestrator numbers them, e.g. `'1247'`. */
  id: string;
  /** ISO-8601 UTC instant the run finished. */
  at: string;
  status: RiskRunStatus;
  /**
   * True for the most recent run only. A verdict from a run that is no longer
   * the latest may have been computed against an allocation since replaced,
   * which is what the run picker warns about.
   */
  latest: boolean;
}

/** One row of the run picker. */
export interface RiskRunOption {
  value: string;
  label: string;
}

// --- inputs read from the shared state ---------------------------------------

/** The two `FundState` fields this agent reads. It writes neither. */
export type FundStateInputField = 'allocation' | 'macro_view';

export const FUND_STATE_INPUT_LABEL: Record<FundStateInputField, string> = {
  allocation: 'state.allocation',
  macro_view: 'state.macro_view',
};

/**
 * A field as it was read out of the shared state — no freshness judgement yet.
 *
 * Freshness is a comparison between two inputs, so it cannot be a property of
 * one of them in isolation; it is applied in `UpstreamInput`.
 */
export interface FundStateInput {
  field: FundStateInputField;
  /** The agent that wrote the field. Never the risk agent. */
  writtenBy: string;
  /** ISO-8601 UTC instant of the write. */
  at: string;
  /** One line describing the value, e.g. `'8 positions'`. */
  summary: string;
  /** Position count for the allocation; null for the macro view. */
  positionCount: number | null;
  /** The page that wrote it, for the way back. */
  route: string;
  linkLabel: string;
}

/** A `FundStateInput` with the freshness comparison applied, ready to render. */
export interface UpstreamInput extends FundStateInput {
  /** `'09:12 UTC'` — the stamp as the card shows it. */
  atLabel: string;
  /** True when this input predates the allocation being assessed. */
  stale: boolean;
  /** The warning to show, or null when the input is not behind. */
  staleNote: string | null;
}

/** Data freshness, not a judgement about the macro call itself. */
export const MACRO_STALE_NOTE = 'older than the allocation input';

/** The allocation card says so out loud: this agent consumes, it never produces. */
export const CONSUMED_NOTE = 'consumed here, never produced';

// --- display filters ---------------------------------------------------------

/** The two recommended confidence levels. */
export type ConfidenceLevel = 95 | 99;

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = [95, 99];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  95: '95%',
  99: '99%',
};

export const CONFIDENCE_DEFINITION: Record<ConfidenceLevel, string> = {
  95: 'Losses exceed the 95% VaR on one day in twenty; z₀.₀₅ = −1.6449 under the parametric method.',
  99: 'Losses exceed the 99% VaR on one day in a hundred; z₀.₀₁ = −2.3263 under the parametric method.',
};

export type VarMethod = 'riskmetrics' | 'historical';

export const VAR_METHODS: readonly VarMethod[] = ['riskmetrics', 'historical'];

export const VAR_METHOD_LABEL: Record<VarMethod, string> = {
  riskmetrics: 'RiskMetrics',
  historical: 'Historical',
};

export const VAR_METHOD_DEFINITION: Record<VarMethod, string> = {
  riskmetrics:
    'Parametric — multivariate normal returns, VaR = z·σ + μ. The distribution is continuous by assumption, so TCE coincides with ES/CVaR.',
  historical:
    'Empirical — the VaR is read off the realised returns with no distributional assumption. The loss distribution is discrete, so TCE and ES/CVaR are separate numbers.',
};

// --- the five measures -------------------------------------------------------

export type RiskMeasureId = 'var' | 'es' | 'tce' | 'wce' | 'two-sided';

/** Wireframe order: threshold first, then the tail measures, then two-sided. */
export const RISK_MEASURE_ORDER: readonly RiskMeasureId[] = ['var', 'es', 'tce', 'wce', 'two-sided'];

export const RISK_MEASURE_LABEL: Record<RiskMeasureId, string> = {
  var: 'VaR',
  es: 'ES / CVaR',
  tce: 'TCE',
  wce: 'WCE',
  'two-sided': 'two-sided',
};

/** What the info icon on each card opens. */
export const RISK_MEASURE_DEFINITION: Record<RiskMeasureId, string> = {
  var: 'Value-at-Risk — the smallest loss at the chosen confidence level over the holding period. It says nothing about how much worse the tail gets beyond it.',
  es: 'Expected Shortfall, equivalently CVaR — the average loss given that the VaR threshold is breached. Coherent, and robust as the confidence level moves.',
  tce: 'Tail Conditional Expectation — the mean return conditional on falling below −VaR. Equal to CVaR for a continuous distribution; not subadditive in general.',
  wce: 'Worst Conditional Expectation — coherent, but defined over every event of probability greater than α, so computing it needs the whole probability space.',
  'two-sided':
    'ρ(a,p) = a·σ₁⁺(X) + (1−a)·σₚ⁻(X) − E[X] — a coherent measure combining an upside and a downside moment. It is set by a and p, not by a confidence level.',
};

export const HORIZON_NOTE = '1-day horizon';

/**
 * Shown on the TCE card under RiskMetrics only. The equality is not a
 * coincidence of the data: it follows from assuming a continuous distribution.
 */
export const TCE_COINCIDENCE_NOTE = '= ES/CVaR · continuous distribution assumed';

/** WCE has no value under any method — it is not a gap in the data. */
export const WCE_UNAVAILABLE_NOTE = 'requires the full probability space';

export const TWO_SIDED_PARAMETERS_NOTE = 'a = 0.5, p = 2';

/** Not applicable is a dash, never a blank. */
export const NOT_APPLICABLE = '—';

export interface RiskMeasure {
  id: RiskMeasureId;
  label: string;
  /** Percent return over the horizon. Null when the measure is not computable. */
  value: number | null;
  /** The holding period the value is stated over; null where there is no value. */
  horizon: string | null;
  /** Second line: the coincidence note, the parameters, or why there is no number. */
  annotation: string | null;
  definition: string;
}

/** The five measures for one (confidence, method) pair, plus what the pair implies. */
export interface RiskMeasureSet {
  confidence: ConfidenceLevel;
  method: VarMethod;
  measures: readonly RiskMeasure[];
  /** True exactly when the method assumes a continuous loss distribution. */
  tceEqualsEs: boolean;
  /** The footnote under the grid; it changes with the method. */
  methodNote: string;
}

export const METHOD_FOOTNOTE: Record<VarMethod, string> = {
  riskmetrics:
    "With Method = Historical the loss distribution is discrete: TCE and ES/CVaR may differ, and the '= ES/CVaR' annotation is dropped",
  historical:
    'The empirical loss distribution is discrete: TCE and ES/CVaR are computed separately and differ',
};

// --- what the tool returns for one run ---------------------------------------

/**
 * A parametric reading. It carries no TCE: under a continuous distribution TCE
 * *is* ES, so a separate field could only ever disagree with it.
 */
export interface ParametricReading {
  var: number;
  es: number;
}

/** An empirical reading, where TCE is genuinely a second number. */
export interface EmpiricalReading extends ParametricReading {
  tce: number;
}

/** Everything `portopt` returned for one run, before any display filter. */
export interface RiskReadingTable {
  riskmetrics: Record<ConfidenceLevel, ParametricReading>;
  historical: Record<ConfidenceLevel, EmpiricalReading>;
}

// --- the verdict the model writes --------------------------------------------

export type VerdictState = 'pass' | 'flagged' | 'breach';

export const VERDICT_LABEL: Record<VerdictState, string> = {
  pass: 'PASS',
  flagged: 'FLAGGED',
  breach: 'BREACH',
};

export const VERDICT_ICON: Record<VerdictState, string> = {
  pass: '✓',
  flagged: '!',
  breach: '✗',
};

/** Structurally a `StatusTone`; kept as a literal union so models import nothing. */
export const VERDICT_TONE: Record<VerdictState, 'ok' | 'warn' | 'alert'> = {
  pass: 'ok',
  flagged: 'warn',
  breach: 'alert',
};

/**
 * `state.risk_verdict` as the agent deposits it.
 *
 * Deliberately holds no risk number. The raw disclosure is rendered from the
 * whole computed result rather than from a copy kept here, so nothing on this
 * page can show a figure the tool did not produce.
 */
export interface RiskVerdict {
  state: VerdictState;
  /** Written by the model, from numbers the tool had already computed. */
  rationale: string;
  /** Risk drivers the model flagged, e.g. `'Sector concentration'`. */
  drivers: readonly string[];
  /** ISO-8601 UTC instant of the write to the shared state. */
  at: string;
}

export const MODEL_INTERPRETATION_NOTE =
  'The model reads numbers the tool already computed · it never recomputes them';

// --- the audit log -----------------------------------------------------------

/**
 * The only kind of tool this agent can reach.
 *
 * A single-member union on purpose: an order-placing or spending tool is not
 * representable here because it is not in the registry fixed at build time.
 */
export type ToolCallKind = 'read / compute-only';

export const TOOL_CALL_KIND: ToolCallKind = 'read / compute-only';

export type ToolCallStatus = 'success' | 'error';

export const TOOL_CALL_STATUS_LABEL: Record<ToolCallStatus, string> = {
  success: 'success',
  error: 'error',
};

export const TOOL_CALL_STATUS_ICON: Record<ToolCallStatus, string> = {
  success: '✓',
  error: '✗',
};

export interface ToolCall {
  id: string;
  /** ISO-8601 UTC instant, to the second. */
  at: string;
  tool: string;
  kind: ToolCallKind;
  /** Wall-clock seconds, e.g. `0.42`. */
  durationSeconds: number;
  status: ToolCallStatus;
}

/** The deterministic risk calculation, by name. */
export const PORTOPT = 'portopt';

export const DETERMINISTIC_CALCULATION_NOTE =
  'Tool portopt — invoked automatically by the orchestrator, not chosen by the model';

/** Static text while the tool runs, for `prefers-reduced-motion`. */
export const RUNNING_TOOL_LABEL = 'Running portopt…';

export const FILTER_NOTE = 'Chips filter the display of an already computed result · no recomputation';

export const TRUST_BOUNDARY_NOTES: readonly string[] = [
  'Tools available to this agent are read-only or pure-compute, fixed at build time',
  'No order-placing or spending action is reachable from this page',
];

export const READS_NOTE = 'reads state.allocation + state.macro_view';
export const WRITES_NOTE = 'writes state.risk_verdict';

// --- failure -----------------------------------------------------------------

/**
 * Which half of the run failed.
 *
 * The two are not interchangeable: a calculation failure means there are no
 * numbers, an interpretation failure means there are numbers but no verdict.
 * The error state has to say which.
 */
export type RiskFailurePhase = 'calculation' | 'interpretation';

export const FAILURE_PHASE_LABEL: Record<RiskFailurePhase, string> = {
  calculation: 'Deterministic risk calculation',
  interpretation: 'Model interpretation',
};

export interface RiskAgentError {
  phase: RiskFailurePhase;
  /** Names the failed phase in words, for the ErrorState heading. */
  message: string;
  detail: string;
}

// --- exits -------------------------------------------------------------------

export interface RiskAgentExit {
  label: string;
  route: string;
  /** Filled reads as the page's primary exit; plain as a secondary one. */
  emphasis: 'filled' | 'plain';
}

/** Both exits lead somewhere a downstream action would still face a human gate. */
export const RISK_AGENT_EXITS: readonly RiskAgentExit[] = [
  { label: 'Open in Human Approval Gate', route: '/approvals/approval-gate', emphasis: 'plain' },
  {
    label: 'Open in Guardrail & Kill-Switch',
    route: '/approvals/guardrail-killswitch',
    emphasis: 'filled',
  },
];
