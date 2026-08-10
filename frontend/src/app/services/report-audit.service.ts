import { Injectable, computed, inject, signal } from '@angular/core';

import type { AgentId } from '../models/fund-state.model';
import {
  AGENT_FILTER_LABEL,
  AUDIT_AGENT_LABEL,
  AUDIT_TABS,
  DATE_RANGE_DAYS,
  DATE_RANGE_LABEL,
  DECISION_TYPE_LABEL,
  EXPORT_FORMAT_LABEL,
  type AgentFilter,
  type AuditDecision,
  type AuditPostureIndicator,
  type AuditTabId,
  type DateRangeId,
  type DecisionParam,
  type DecisionSortKey,
  type DecisionTypeFilter,
  type ExportFormat,
  type OrderIdempotencyRecord,
  type PositionProvenanceRow,
  type PositionSyncRow,
} from '../models/report-audit.model';
import { BROKER_POSTURE_LABEL } from '../models/order.model';
import { ExecutionService } from './execution.service';
import { FundService } from './fund.service';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading state the spec mandates is reachable. */
const LATENCY_MS = 700;

/**
 * The clock the date-range filter is evaluated against.
 *
 * Fixed rather than `Date.now()`: an audit log filtered by "Last 30 days" that
 * silently empties itself as the mock data ages would be a screen that works
 * today and lies next month, and the tests would rot with it.
 */
const AUDIT_TODAY = '2026-08-01';

/** The model the fund is running. One tag, printed exactly as Ollama reports it. */
const MODEL = 'llama3.1:70b';

/**
 * Sampling parameters for a step that is free to reason.
 *
 * Logged with every decision whether or not the model honours a seed — the
 * requirement is model + params + full output, and that requirement does not
 * wait for reproducibility to be settled.
 */
const REASONING_PARAMS: readonly DecisionParam[] = [
  { name: 'temperature', value: '0.7' },
  { name: 'top_p', value: '0.9' },
  { name: 'max_tokens', value: '512' },
];

/**
 * Sampling parameters for the one step that is pinned.
 *
 * An order intent is the only output whose wording is copied onto a ticket, so
 * that step runs at `temperature=0` with a fixed seed and its prompt hash is
 * logged. Every other step leaves the hash unlogged, which is the ordinary
 * case for this deployment — see `NOT_LOGGED_NOTE`.
 */
function pinnedParams(seed: string): readonly DecisionParam[] {
  return [
    { name: 'temperature', value: '0' },
    { name: 'top_p', value: '1' },
    { name: 'seed', value: seed },
    { name: 'max_tokens', value: '512' },
  ];
}

/** The three deliberation runs still retained, newest first. */
const RUN_DATE: Record<string, string> = {
  '1247': '2026-08-01',
  '1246': '2026-07-31',
  '1245': '2026-07-30',
};

interface OrderIntentSeed {
  readonly id: string;
  readonly time: string;
  readonly runId: string;
  readonly tradeId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly quantity: number;
  readonly notional: string;
  readonly intervals: number;
  readonly shortfallBps: number;
  readonly riskBps: number;
  readonly promptHash: string;
  readonly note: string | null;
}

/**
 * One order-intent decision.
 *
 * The figures are the ones `ExecutionService` holds for the same `TRD-…`, so a
 * reader who follows the trade id out of this log lands on a page that says the
 * same thing. Written as a template because these decisions really are one
 * step repeated per instrument; the six of them spelled out longhand would be
 * six places for those figures to drift.
 */
function orderIntent(seed: OrderIntentSeed): AuditDecision {
  const verb = seed.side === 'buy' ? 'Buy' : 'Sell';
  const output = [
    `Order intent ${seed.tradeId}: ${verb.toLowerCase()} ${seed.quantity.toLocaleString('en-US')} ${seed.symbol}, notional EUR ${seed.notional}.`,
    `Scheduled over ${seed.intervals} intervals, front-loaded; estimated implementation shortfall ${seed.shortfallBps} bps against ${seed.riskBps} bps of timing risk.`,
    'No broker adapter is configured, so the intent stops at the human gate and nothing is sent.',
  ];
  if (seed.note) output.splice(2, 0, seed.note);

  return {
    id: seed.id,
    date: RUN_DATE[seed.runId],
    time: seed.time,
    agent: 'execution',
    type: 'order-intent',
    model: MODEL,
    params: pinnedParams(RUN_DATE[seed.runId].replace(/-/g, '')),
    promptHash: seed.promptHash,
    output,
    runId: seed.runId,
    tradeId: seed.tradeId,
  };
}

/**
 * The decision log.
 *
 * Three deliberation runs — #1247, #1246 and #1245, the three the fund pages
 * still hold — each walking the four agents in the order they write the state:
 * macro, allocation, risk, execution. Every row's run id resolves to a run that
 * exists elsewhere in the app and every `TRD-…` to an order `ExecutionService`
 * holds, so the panel's Related links go somewhere.
 *
 * Only the order-intent rows carry a prompt hash. That is the point the page
 * exists to make legible: logging model, params and full output does not
 * require reproducibility, and the absence of a hash on eighteen of these
 * twenty-nine rows is the expected state of the system, not a gap in it.
 */
const SEED_DECISIONS: readonly AuditDecision[] = [
  // --- run #1247 · 2026-08-01 ----------------------------------------------
  {
    id: 'dcn_9f31a2',
    date: '2026-08-01',
    time: '09:10:52',
    agent: 'macro',
    type: 'regime-classification',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Regime: risk-on. Confidence 0.71.',
      'Filtered probabilities — risk-on 0.71, slow growth 0.19, crash 0.10.',
      'Drivers: the nowcast sits within one standard error of trend; credit spreads are stable at 118 bp; breadth is positive across the large-cap universe.',
      'The crash state keeps a non-trivial 0.10 because the filter has not yet unwound the late-July widening; it is not evidence of a turn on its own.',
      'Written to state.macro_view.',
    ],
    runId: '1247',
    tradeId: null,
  },
  {
    id: 'dcn_4c07e8',
    date: '2026-08-01',
    time: '09:11:02',
    agent: 'macro',
    type: 'view-bridge',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Views derived from the risk-on posterior, for Black-Litterman.',
      'Absolute view: US equities +1.8% over a three-month horizon, confidence 0.45.',
      'Relative view: quality over high beta, +0.9%, confidence 0.30.',
      'No view expressed on duration — at this lookback the filter does not separate the two bond states, and a view with no regime behind it is noise dressed as information.',
    ],
    runId: '1247',
    tradeId: null,
  },
  {
    id: 'dcn_b21d55',
    date: '2026-08-01',
    time: '09:12:14',
    agent: 'allocation',
    type: 'weight-proposal',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Target weights over 42 assets.',
      'Gross 1.41, net 1.00, tracking error 3.2%.',
      'Long/short book; the largest single deviation from the benchmark is +2.4% in US equities, taken against the absolute view above.',
      'Written to state.allocation.',
    ],
    runId: '1247',
    tradeId: null,
  },
  {
    id: 'dcn_77ae10',
    date: '2026-08-01',
    time: '09:13:20',
    agent: 'risk',
    type: 'constraint-check',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Verdict: within limits.',
      'VaR 2.8% and CVaR 4.1% of NAV, against limits of 3.5% and 5.0%.',
      'No single Euler contribution above the 15% budget; the largest is US equities at 13.6%.',
      'Written to state.risk_verdict.',
    ],
    runId: '1247',
    tradeId: null,
  },
  {
    id: 'dcn_2e6b94',
    date: '2026-08-01',
    time: '09:13:41',
    agent: 'risk',
    type: 'kill-switch-check',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'No kill-switch condition met.',
      'Drawdown 4.1% against the 12.0% halt threshold; realised volatility 11.2% against 18.0%.',
      'Concentration: EEM would reach 12.4% NAV against the configured 12.0% cap. Raised to the rules engine as a block on that order, not as a halt of the run.',
    ],
    runId: '1247',
    tradeId: null,
  },
  {
    id: 'dcn_5a8f0c',
    date: '2026-08-01',
    time: '09:14:02',
    agent: 'execution',
    type: 'schedule-solve',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Sized turnover from target versus current weights.',
      'AAPL scheduled over 5 intervals given estimated liquidity, front-loaded because the timing risk on the residual position dominates the extra impact of trading early.',
      'HYG and SLV left unscheduled — the intraday volume profile came back short, so no shortfall or risk figure is published for either and both stay at the pre-trade check.',
    ],
    runId: '1247',
    tradeId: null,
  },
  orderIntent({
    id: 'dcn_1b8042',
    time: '09:14:07',
    runId: '1247',
    tradeId: 'TRD-2031',
    symbol: 'AAPL',
    side: 'buy',
    quantity: 12_400,
    notional: '2,460,000',
    intervals: 5,
    shortfallBps: 18,
    riskBps: 6,
    promptHash: 'a1f9c3',
    note: null,
  }),
  orderIntent({
    id: 'dcn_7d20b8',
    time: '09:14:08',
    runId: '1247',
    tradeId: 'TRD-2030',
    symbol: 'MSFT',
    side: 'sell',
    quantity: 4_900,
    notional: '1,980,000',
    intervals: 5,
    shortfallBps: 14,
    riskBps: 5,
    promptHash: '7d20b8',
    note: null,
  }),
  orderIntent({
    id: 'dcn_3e91da',
    time: '09:14:09',
    runId: '1247',
    tradeId: 'TRD-2033',
    symbol: 'EEM',
    side: 'buy',
    quantity: 5_600,
    notional: '231,000',
    intervals: 6,
    shortfallBps: 24,
    riskBps: 9,
    promptHash: '3e91da',
    note: 'Flagged by the rules engine: the single-name concentration limit stops this one at rule validation.',
  }),
  orderIntent({
    id: 'dcn_c05b47',
    time: '09:14:10',
    runId: '1247',
    tradeId: 'TRD-2035',
    symbol: 'SPY',
    side: 'sell',
    quantity: 900,
    notional: '484,000',
    intervals: 4,
    shortfallBps: 5,
    riskBps: 2,
    promptHash: 'c05b47',
    note: null,
  }),
  orderIntent({
    id: 'dcn_9b16fe',
    time: '09:14:11',
    runId: '1247',
    tradeId: 'TRD-2034',
    symbol: 'GLD',
    side: 'buy',
    quantity: 1_800,
    notional: '383,000',
    intervals: 5,
    shortfallBps: 7,
    riskBps: 3,
    promptHash: '9b16fe',
    note: null,
  }),
  orderIntent({
    id: 'dcn_2ad7c9',
    time: '09:14:12',
    runId: '1247',
    tradeId: 'TRD-2039',
    symbol: 'XLE',
    side: 'sell',
    quantity: 2_150,
    notional: '187,000',
    intervals: 6,
    shortfallBps: 16,
    riskBps: 7,
    promptHash: '2ad7c9',
    note: null,
  }),

  // --- run #1246 · 2026-07-31 ----------------------------------------------
  {
    id: 'dcn_a13f77',
    date: '2026-07-31',
    time: '17:36:44',
    agent: 'macro',
    type: 'regime-classification',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Regime: risk-on. Confidence 0.64.',
      'Filtered probabilities — risk-on 0.64, slow growth 0.23, crash 0.13.',
      'Drivers: credit spreads widened 9 bp on the day and the VIX term structure flattened at the front.',
      'The posterior is weaker than the previous run but the ordering of the states is unchanged.',
      'Written to state.macro_view.',
    ],
    runId: '1246',
    tradeId: null,
  },
  {
    id: 'dcn_6b2e19',
    date: '2026-07-31',
    time: '17:37:02',
    agent: 'macro',
    type: 'view-bridge',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Views derived from the risk-on posterior, for Black-Litterman.',
      'Absolute view: US equities +1.2% over a three-month horizon, confidence 0.35.',
      'Confidence cut from the previous run in step with the weaker posterior; the direction is unchanged.',
    ],
    runId: '1246',
    tradeId: null,
  },
  {
    id: 'dcn_c94a03',
    date: '2026-07-31',
    time: '17:38:11',
    agent: 'allocation',
    type: 'weight-proposal',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Target weights over 42 assets.',
      'Gross 1.38, net 1.00, tracking error 3.0%.',
      'The equity overweight is trimmed to +1.9% against the benchmark, following the lower view confidence.',
      'Written to state.allocation.',
    ],
    runId: '1246',
    tradeId: null,
  },
  {
    id: 'dcn_1de8b6',
    date: '2026-07-31',
    time: '17:39:05',
    agent: 'risk',
    type: 'kill-switch-check',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'No kill-switch condition met.',
      'Drawdown 3.6% against the 12.0% halt threshold; realised volatility 10.8% against 18.0%.',
      'No single-name concentration above the cap at these weights.',
    ],
    runId: '1246',
    tradeId: null,
  },
  {
    id: 'dcn_30f5c2',
    date: '2026-07-31',
    time: '17:40:00',
    agent: 'risk',
    type: 'constraint-check',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Verdict: within limits.',
      'Tail measures inside the budget at both confidence levels; the VaR-to-ES gap is in line with the two preceding runs.',
      'Written to state.risk_verdict.',
    ],
    runId: '1246',
    tradeId: null,
  },
  {
    id: 'dcn_88b0e4',
    date: '2026-07-31',
    time: '17:41:36',
    agent: 'execution',
    type: 'schedule-solve',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Sized turnover from target versus current weights.',
      'Three orders scheduled; the ARKK sleeve is traded over 6 intervals because the estimated participation rate would otherwise exceed 12% of interval volume.',
    ],
    runId: '1246',
    tradeId: null,
  },
  orderIntent({
    id: 'dcn_5c47e1',
    time: '17:41:52',
    runId: '1246',
    tradeId: 'TRD-2028',
    symbol: 'TLT',
    side: 'sell',
    quantity: 8_100,
    notional: '726,000',
    intervals: 5,
    shortfallBps: 11,
    riskBps: 4,
    promptHash: '5c47e1',
    note: null,
  }),
  orderIntent({
    id: 'dcn_e83b2f',
    time: '17:41:55',
    runId: '1246',
    tradeId: 'TRD-2025',
    symbol: 'EFA',
    side: 'buy',
    quantity: 9_200,
    notional: '816,000',
    intervals: 6,
    shortfallBps: 19,
    riskBps: 8,
    promptHash: 'e83b2f',
    note: null,
  }),
  orderIntent({
    id: 'dcn_41d0aa',
    time: '17:41:58',
    runId: '1246',
    tradeId: 'TRD-2022',
    symbol: 'ARKK',
    side: 'sell',
    quantity: 1_500,
    notional: '92,000',
    intervals: 6,
    shortfallBps: 21,
    riskBps: 11,
    promptHash: '41d0aa',
    note: null,
  }),

  // --- run #1245 · 2026-07-30 ----------------------------------------------
  {
    id: 'dcn_f402a9',
    date: '2026-07-30',
    time: '18:01:35',
    agent: 'macro',
    type: 'regime-classification',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Regime: risk-on. Confidence 0.69.',
      'Filtered probabilities — risk-on 0.69, slow growth 0.21, crash 0.10.',
      'Drivers: the nowcast is above trend and the breadth measure has been positive for six sessions.',
      'Written to state.macro_view.',
    ],
    runId: '1245',
    tradeId: null,
  },
  {
    id: 'dcn_5c7719',
    date: '2026-07-30',
    time: '18:02:10',
    agent: 'macro',
    type: 'view-bridge',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Views derived from the risk-on posterior, for Black-Litterman.',
      'Absolute view: US equities +1.6% over a three-month horizon, confidence 0.42.',
      'Relative view: quality over high beta, +0.7%, confidence 0.25.',
    ],
    runId: '1245',
    tradeId: null,
  },
  {
    id: 'dcn_e0b348',
    date: '2026-07-30',
    time: '18:03:20',
    agent: 'allocation',
    type: 'weight-proposal',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Target weights over 42 assets.',
      'Gross 1.36, net 1.00, tracking error 2.9%.',
      'Written to state.allocation.',
    ],
    runId: '1245',
    tradeId: null,
  },
  {
    id: 'dcn_9a1c06',
    date: '2026-07-30',
    time: '18:04:12',
    agent: 'risk',
    type: 'kill-switch-check',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'No kill-switch condition met.',
      'Drawdown 3.1% against the 12.0% halt threshold; realised volatility 10.2% against 18.0%.',
    ],
    runId: '1245',
    tradeId: null,
  },
  {
    id: 'dcn_44d7f1',
    date: '2026-07-30',
    time: '18:05:00',
    agent: 'risk',
    type: 'constraint-check',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Verdict: within limits.',
      'VaR 2.6% and CVaR 3.8% of NAV, against limits of 3.5% and 5.0%.',
      'Written to state.risk_verdict.',
    ],
    runId: '1245',
    tradeId: null,
  },
  {
    id: 'dcn_7fe295',
    date: '2026-07-30',
    time: '18:06:41',
    agent: 'execution',
    type: 'schedule-solve',
    model: MODEL,
    params: REASONING_PARAMS,
    promptHash: null,
    output: [
      'Sized turnover from target versus current weights.',
      'Two credit orders scheduled over 5 and 6 intervals; both are inside the participation cap at every interval.',
    ],
    runId: '1245',
    tradeId: null,
  },
  orderIntent({
    id: 'dcn_68fa03',
    time: '18:06:58',
    runId: '1245',
    tradeId: 'TRD-2032',
    symbol: 'LQD',
    side: 'buy',
    quantity: 7_400,
    notional: '794,000',
    intervals: 6,
    shortfallBps: 13,
    riskBps: 5,
    promptHash: '68fa03',
    note: null,
  }),
  orderIntent({
    id: 'dcn_b7c412',
    time: '18:07:03',
    runId: '1245',
    tradeId: 'TRD-2038',
    symbol: 'IEF',
    side: 'buy',
    quantity: 6_750,
    notional: '656,000',
    intervals: 5,
    shortfallBps: 8,
    riskBps: 3,
    promptHash: 'b7c412',
    note: null,
  }),
];

/**
 * What the idempotency tab would show if an adapter were registered.
 *
 * Unreachable in the default posture and deliberately so: with no broker there
 * is no POST to deduplicate and no order state to poll, so `idempotencyRecords`
 * returns nothing at all rather than these. They exist because the requirement
 * is documented now — client-side key, pre-POST deduplication, post-send
 * reconciliation — and a tab that cannot render the requirement it documents is
 * not a record of it.
 */
const SEED_IDEMPOTENCY: readonly OrderIdempotencyRecord[] = [
  {
    id: 'idem-1',
    tradeId: 'TRD-2028',
    symbol: 'TLT',
    idempotencyKey: 'ik_2026-08-01_TRD-2028_9f31a2',
    dedup: 'unique',
    postedAt: '09:45:02',
    reconciliation: 'reconciled',
    reconciliationNote: 'Venue state matches the recorded intent at the third poll.',
  },
  {
    id: 'idem-2',
    tradeId: 'TRD-2025',
    symbol: 'EFA',
    idempotencyKey: 'ik_2026-08-01_TRD-2025_4c07e8',
    dedup: 'unique',
    postedAt: '09:36:11',
    reconciliation: 'pending',
    reconciliationNote:
      'Polling has not yet returned a terminal state; the intent is neither confirmed nor lost.',
  },
  {
    id: 'idem-3',
    tradeId: 'TRD-2025',
    symbol: 'EFA',
    idempotencyKey: 'ik_2026-08-01_TRD-2025_4c07e8',
    dedup: 'duplicate-suppressed',
    postedAt: null,
    reconciliation: 'reconciled',
    reconciliationNote:
      'Resumed execution node replayed the same intent; the key matched an in-flight POST and the duplicate was suppressed before it left the core.',
  },
];

/** Everything a provenance row carries except the position it is about. */
type PositionOrigin = Omit<PositionProvenanceRow, 'id' | 'instrument' | 'weight'>;

const IMPORT_FILE = 'positions-2026-07-28.csv';
const IMPORT_AT = '2026-07-28 08:12 UTC';
const RECORDER = 'm.rossi@fund';

function imported(): PositionOrigin {
  return {
    source: 'csv-import',
    reference: IMPORT_FILE,
    recordedAt: IMPORT_AT,
    recordedBy: RECORDER,
  };
}

/**
 * How each instrument in the fund's vocabulary came to be held.
 *
 * Keyed by instrument rather than written out as a list of rows, because the
 * *positions* are not this service's to invent: `FundService` holds the active
 * portfolio and its weights, and this map only says where each line was
 * recorded from. Listing rows here instead would give the tab a portfolio of
 * its own, and it would go on naming an import file for holdings the fund does
 * not have the moment the reader switches portfolio in the topbar.
 */
const POSITION_ORIGIN: Record<string, PositionOrigin> = {
  'US Equities ETF': imported(),
  'EU Equities ETF': imported(),
  'EM Equities ETF': imported(),
  'Global Bonds ETF': imported(),
  'IG Credit ETF': imported(),
  'REIT ETF': imported(),
  'Gold ETF': {
    source: 'manual',
    reference: 'Entered after the 24 Jul rebalancing; the import file predates the trade.',
    recordedAt: '2026-07-24 16:40 UTC',
    recordedBy: RECORDER,
  },
  Cash: {
    source: 'manual',
    reference: 'Residual after the 28 Jul import was reconciled against the custodian statement.',
    recordedAt: '2026-07-28 08:15 UTC',
    recordedBy: RECORDER,
  },
};

/**
 * A holding whose origin nobody wrote down.
 *
 * Defensive — the map above covers every instrument the fund exposes — and it
 * says so in words rather than leaving three cells the reader has to interpret.
 * "Not recorded" is a fact about the log; a blank is a question about it.
 */
const ORIGIN_UNRECORDED: PositionOrigin = {
  source: 'manual',
  reference: 'No import file or entry note is attached to this line.',
  recordedAt: 'Not recorded',
  recordedBy: 'Not recorded',
};

/** Sync lines a configured adapter would write. Empty in the default posture. */
const SEED_SYNC: readonly PositionSyncRow[] = [
  {
    id: 'sync-1',
    instrument: 'US Equities ETF',
    at: '2026-08-01 09:00 UTC',
    result: 'Broker holding matches the domain position.',
  },
  {
    id: 'sync-2',
    instrument: 'Cash',
    at: '2026-08-01 09:00 UTC',
    result: 'Broker cash differs by EUR 1,240 — flagged, domain value kept.',
  },
];

/** Days between two `YYYY-MM-DD` stamps, `a` being the later one. */
function daysBetween(later: string, earlier: string): number {
  const ms = Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * The audit surface for everything the other eleven pages do.
 *
 * Three things it is careful not to pretend:
 *
 * - it never claims reproducibility. It holds model, params and the full
 *   output of every decision, which is what makes an audit by inspection
 *   possible, and a prompt hash only where a step was actually pinned;
 * - it never invents an order idempotency record. The broker posture is read
 *   from `ExecutionService` — the one signal doc 15's banner, doc 16's decision
 *   sentence and doc 17's step [4] also read — so this page cannot describe a
 *   routing behaviour those pages contradict. With no adapter registered the
 *   idempotency tab and the sync block of the provenance tab are empty, and the
 *   emptiness is stated as the consequence of the posture it is;
 * - it never derives a position from a broker. Positions are the domain's, by
 *   manual entry or CSV import, and the provenance tab says which.
 *
 * The HTTP client is not wired yet; this stands in for it with the same shape
 * and realistic latency, which is what makes the loading and error states the
 * spec mandates reachable.
 */
@Injectable({ providedIn: 'root' })
export class ReportAuditService {
  /** The single source of the broker posture for the whole application. */
  private readonly execution = inject(ExecutionService);
  /** The single source of the active portfolio, which owns the positions. */
  private readonly fund = inject(FundService);

  // --- page state -----------------------------------------------------------

  private readonly _state = signal<PageState>('ready');
  readonly state = this._state.asReadonly();

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly loading = computed(() => this._state() === 'loading');

  /** When the log was last read. */
  private readonly _readAt = signal(`${AUDIT_TODAY} 09:55:00 UTC`);
  readonly readAt = this._readAt.asReadonly();

  /** Mock lever: false makes the next read return an empty log. */
  readonly logHasDecisions = signal(true);

  // --- tab ------------------------------------------------------------------

  readonly tabs = AUDIT_TABS;

  private readonly _tab = signal<AuditTabId>('decision-log');
  readonly tab = this._tab.asReadonly();

  readonly activeTab = computed(
    () => AUDIT_TABS.find((t) => t.id === this._tab()) ?? AUDIT_TABS[0],
  );

  /**
   * Switches view without touching the filters.
   *
   * Agent and date range describe *what the reader is looking for*, not which
   * table they are looking at, so they survive the change; resetting them here
   * would silently widen the set the next tab reports on. Only the page index
   * moves, because page 3 of the decision log is not page 3 of anything else.
   */
  setTab(tab: AuditTabId): void {
    if (this._tab() === tab) return;
    this._tab.set(tab);
    this._page.set(1);
    this._selectedDecisionId.set(null);
    this.clearExportNotice();
  }

  // --- filters --------------------------------------------------------------

  private readonly _agentFilter = signal<AgentFilter>('all');
  readonly agentFilter = this._agentFilter.asReadonly();

  private readonly _decisionTypeFilter = signal<DecisionTypeFilter>('all');
  readonly decisionTypeFilter = this._decisionTypeFilter.asReadonly();

  private readonly _dateRange = signal<DateRangeId>('30d');
  readonly dateRange = this._dateRange.asReadonly();

  /**
   * The search that is actually applied.
   *
   * This only moves when the reader submits, because a query that narrowed the
   * table on every keystroke would re-announce the live count several times
   * per word.
   */
  private readonly _search = signal('');
  readonly search = this._search.asReadonly();

  /**
   * What is currently typed in the field, which is not yet what is searched for.
   *
   * It lives here rather than in the filter component because the reset action
   * belongs to the *table's* empty state, two regions away: with the draft held
   * locally, clearing the filters from there would empty the query and leave
   * the reader's text sitting in a field that no longer applies.
   */
  readonly searchDraft = signal('');

  setAgentFilter(agent: AgentFilter): void {
    if (this._agentFilter() === agent) return;
    this._agentFilter.set(agent);
    this._page.set(1);
    this.clearExportNotice();
  }

  setDecisionTypeFilter(type: DecisionTypeFilter): void {
    if (this._decisionTypeFilter() === type) return;
    this._decisionTypeFilter.set(type);
    this._page.set(1);
    this.clearExportNotice();
  }

  setDateRange(range: DateRangeId): void {
    if (this._dateRange() === range) return;
    this._dateRange.set(range);
    this._page.set(1);
    this.clearExportNotice();
  }

  /**
   * Applied on submit only — Enter in the field, or the Search button.
   *
   * Takes the draft when called with nothing, so the two submit paths cannot
   * apply two different strings.
   */
  applySearch(query?: string): void {
    const next = (query ?? this.searchDraft()).trim();
    this.searchDraft.set(next);
    if (this._search() === next) return;
    this._search.set(next);
    this._page.set(1);
    this.clearExportNotice();
  }

  readonly filtersActive = computed(
    () =>
      this._agentFilter() !== 'all' ||
      this._decisionTypeFilter() !== 'all' ||
      this._dateRange() !== '30d' ||
      this._search() !== '',
  );

  clearFilters(): void {
    this._agentFilter.set('all');
    this._decisionTypeFilter.set('all');
    this._dateRange.set('30d');
    this._search.set('');
    this.searchDraft.set('');
    this._page.set(1);
    this.clearExportNotice();
  }

  // --- decisions ------------------------------------------------------------

  private readonly _decisions = signal<readonly AuditDecision[]>(SEED_DECISIONS);
  readonly decisions = this._decisions.asReadonly();

  readonly totalCount = computed(() => this._decisions().length);

  /** True when nothing has ever been logged — a different state from "no match". */
  readonly logIsEmpty = computed(() => this._decisions().length === 0);

  private readonly _sortKey = signal<DecisionSortKey>('time');
  readonly sortKey = this._sortKey.asReadonly();

  /** Newest first: an audit log is read from the most recent decision backwards. */
  private readonly _sortAscending = signal(false);
  readonly sortAscending = this._sortAscending.asReadonly();

  setSort(key: DecisionSortKey): void {
    if (this._sortKey() === key) {
      this._sortAscending.update((asc) => !asc);
      return;
    }
    this._sortKey.set(key);
    this._sortAscending.set(key === 'time' ? false : true);
  }

  readonly filteredDecisions = computed<readonly AuditDecision[]>(() => {
    const agent = this._agentFilter();
    const type = this._decisionTypeFilter();
    const window = DATE_RANGE_DAYS[this._dateRange()];
    const query = this._search().toLowerCase();

    const matched = this._decisions().filter((decision) => {
      if (agent !== 'all' && decision.agent !== agent) return false;
      if (type !== 'all' && decision.type !== type) return false;
      if (window !== null && daysBetween(AUDIT_TODAY, decision.date) > window) return false;
      if (query === '') return true;
      return this.searchCorpus(decision).includes(query);
    });

    const direction = this._sortAscending() ? 1 : -1;
    const key = this._sortKey();
    return [...matched].sort((a, b) => direction * compareDecisions(a, b, key));
  });

  readonly filteredCount = computed(() => this.filteredDecisions().length);

  /** Free text runs over everything the panel would show, not just the row. */
  private searchCorpus(decision: AuditDecision): string {
    return [
      decision.id,
      AUDIT_AGENT_LABEL[decision.agent],
      DECISION_TYPE_LABEL[decision.type],
      decision.model,
      decision.promptHash ?? '',
      decision.tradeId ?? '',
      `run #${decision.runId}`,
      ...decision.output,
    ]
      .join(' ')
      .toLowerCase();
  }

  // --- pagination -----------------------------------------------------------

  readonly pageSizes: readonly number[] = [10, 25, 50];

  private readonly _pageSize = signal(25);
  readonly pageSize = this._pageSize.asReadonly();

  private readonly _page = signal(1);

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredCount() / this._pageSize())),
  );

  /** Clamped, so a filter that shortens the set cannot strand the reader past the end. */
  readonly page = computed(() => Math.min(this._page(), this.pageCount()));

  setPage(page: number): void {
    this._page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  setPageSize(size: number): void {
    if (this._pageSize() === size) return;
    this._pageSize.set(size);
    this._page.set(1);
  }

  readonly visibleDecisions = computed<readonly AuditDecision[]>(() => {
    const size = this._pageSize();
    const start = (this.page() - 1) * size;
    return this.filteredDecisions().slice(start, start + size);
  });

  // --- empty states ---------------------------------------------------------

  /**
   * Which of the two empty states applies, if either.
   *
   * They are genuinely different situations and only one of them has a way out:
   * `no-match` offers a reset because there are filters to clear, `no-log`
   * does not, because offering a reset that clears nothing is a control that
   * lies about what it does.
   */
  readonly emptyReason = computed<'no-log' | 'no-match' | null>(() => {
    if (this._state() !== 'ready' && this._state() !== 'empty') return null;
    if (this.logIsEmpty()) return 'no-log';
    return this.filteredCount() === 0 ? 'no-match' : null;
  });

  // --- broker posture -------------------------------------------------------

  readonly brokerPosture = this.execution.brokerPosture;
  readonly brokerConfigured = this.execution.brokerConfigured;

  readonly brokerPostureLabel = computed(() => BROKER_POSTURE_LABEL[this.brokerPosture()]);

  /**
   * The four audit-posture indicators.
   *
   * The last one is derived from the broker posture rather than written down,
   * so the day an adapter is registered this card stops claiming there is none
   * without anybody editing this file.
   */
  readonly postureIndicators = computed<readonly AuditPostureIndicator[]>(() => {
    const configured = this.brokerConfigured();
    const adapter = this.execution.broker().adapter;
    return [
      {
        id: 'decision-logging',
        label: 'Decision logging',
        state: 'Active',
        on: true,
        detail: 'model + params + output, per decision',
      },
      {
        id: 'reproducibility',
        label: 'Reproducibility',
        state: 'Not guaranteed',
        on: false,
        detail: 'depends on the Ollama model chosen',
      },
      {
        id: 'llm-validation',
        label: 'LLM validation',
        state: 'At the LLM port',
        on: true,
        detail: 'grammar-constrained retry',
      },
      {
        id: 'broker-idempotency',
        label: 'Broker idempotency',
        state: configured ? 'Configured' : 'Not configured',
        on: configured,
        detail: configured
          ? `client-side key, pre-POST deduplication and reconciliation polling against ${adapter ?? 'the configured adapter'}`
          : 'no broker set in the default posture',
      },
    ];
  });

  /** The provenance line under the indicators. Reads the same posture signal. */
  readonly positionsSourceLine = computed(() =>
    this.brokerConfigured()
      ? 'manual entry or CSV import — a configured broker synchronises this state, it is never its source'
      : 'manual entry or CSV import — no broker configured to sync',
  );

  // --- orders & idempotency -------------------------------------------------

  /**
   * Idempotency records. Empty until an adapter exists to produce them.
   *
   * Not "empty because the read failed" and not "empty because a filter is too
   * narrow": with no broker there is no POST, so there is no key, no
   * deduplication result and nothing to reconcile.
   */
  readonly idempotencyRecords = computed<readonly OrderIdempotencyRecord[]>(() =>
    this.brokerConfigured() ? SEED_IDEMPOTENCY : [],
  );

  readonly idempotencyCount = computed(() => this.idempotencyRecords().length);

  /** Why the tab is empty, in the posture's own words. */
  readonly idempotencyEmptyReason = computed(
    () =>
      `${this.brokerPostureLabel()} — the default posture. No order intent has been POSTed, so there is no ` +
      'idempotency key to record, nothing to deduplicate before a send and no order state to reconcile after one.',
  );

  // --- positions provenance -------------------------------------------------

  /** The portfolio these positions belong to, named so the tab cannot be misread. */
  readonly activePortfolioName = computed(() => this.fund.active()?.name ?? null);

  /**
   * The fund has not answered yet, so there is nothing to show provenance for.
   *
   * Distinct from "no positions": the panel renders placeholders here and an
   * empty state there. `FundService` loads on construction with the same
   * stand-in latency as everything else, so this is a real frame the reader
   * sees rather than a theoretical one.
   */
  readonly positionsPending = computed(
    () => this.fund.state() === 'loading' && this.fund.active() === null,
  );

  /**
   * Where each position of the **active** portfolio came from.
   *
   * Derived from `FundService.active()` rather than seeded here. The topbar
   * switcher is on this page like every other, and a provenance tab holding
   * its own copy of one portfolio would go on naming a CSV file, a timestamp
   * and a person for five holdings the fund stopped holding the moment the
   * reader switched — which is precisely the claim this tab exists to make
   * truthfully. Weights are the domain's; only the origin is this map's.
   */
  readonly positions = computed<readonly PositionProvenanceRow[]>(() => {
    const active = this.fund.active();
    if (!active) return [];
    return active.holdings.map((holding) => ({
      id: `pos-${active.id}-${holding.instrument.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      instrument: holding.instrument,
      weight: holding.weight,
      ...(POSITION_ORIGIN[holding.instrument] ?? ORIGIN_UNRECORDED),
    }));
  });

  readonly positionCount = computed(() => this.positions().length);

  /** Sync lines exist only where an adapter does; the positions themselves do not. */
  readonly syncRows = computed<readonly PositionSyncRow[]>(() =>
    this.brokerConfigured() ? SEED_SYNC : [],
  );

  readonly syncEmptyReason = computed(
    () =>
      `${this.brokerPostureLabel()} — the default posture. Positions are owned by the domain and entered by hand ` +
      'or imported from CSV, so there is no broker holding to compare them against.',
  );

  // --- the live summary -----------------------------------------------------

  /**
   * The CollectionStatBar's sentence, per tab.
   *
   * Assembled here rather than in the page because the count, the view and the
   * scope are one claim about one collection, and three components rejoining
   * three fragments would eventually word it three ways.
   */
  readonly statParts = computed<readonly string[]>(() => {
    const tab = this.activeTab();

    /*
      While the log is being re-read the bar says so instead of repeating the
      count from the last read.

      It is a polite live region sitting directly above a table that has been
      blanked to skeletons and a posture card showing placeholders. A count
      announced there is a claim about a record nothing on screen is currently
      backing — the "no partial content while loading" rule applies to the one
      figure on this page a reader would quote, not only to the rows. The
      region itself stays mounted, per `CollectionStatBar`: an `@if` would
      insert it at the same moment as its text and nothing would be announced.
    */
    if (this._state() === 'loading') return ['Reading the audit log…', tab.title];

    switch (tab.id) {
      case 'decision-log':
        return [
          `${this.filteredCount()} ${tab.noun}`,
          tab.title,
          AGENT_FILTER_LABEL[this._agentFilter()],
          DATE_RANGE_LABEL[this._dateRange()],
        ];
      case 'orders-idempotency':
        return [`${this.idempotencyCount()} ${tab.noun}`, tab.title, this.brokerPostureLabel()];
      case 'positions-provenance':
        // The portfolio is named: these positions are the active one's, and the
        // topbar can change which that is while the reader is on this tab.
        return [
          `${this.positionCount()} ${tab.noun}`,
          tab.title,
          this.activePortfolioName() ?? '',
          'manual entry or CSV import',
        ];
    }
  });

  // --- selection ------------------------------------------------------------

  private readonly _selectedDecisionId = signal<string | null>(null);
  readonly selectedDecisionId = this._selectedDecisionId.asReadonly();

  readonly selectedDecision = computed<AuditDecision | null>(() => {
    const id = this._selectedDecisionId();
    return id === null ? null : (this._decisions().find((d) => d.id === id) ?? null);
  });

  select(id: string): void {
    if (this._decisions().some((d) => d.id === id)) this._selectedDecisionId.set(id);
  }

  clearSelection(): void {
    this._selectedDecisionId.set(null);
  }

  /** Where a decision's Related link goes, and what it is called. */
  runLabel(decision: AuditDecision): string {
    return `Fund Deliberation · run #${decision.runId}`;
  }

  // --- export ---------------------------------------------------------------

  /**
   * The last export's receipt, and only while it is still true.
   *
   * It names a count, a view and a format — "Exported 29 decisions from
   * Decision Log as CSV" — so it is a claim about the set on screen, not a
   * transient toast. Every setter that moves the query or the tab calls
   * `clearExportNotice()`, because the moment the reader narrows to six rows
   * or switches to Positions Provenance that sentence describes a file they
   * can no longer see the source of, and a stale receipt beside a changed
   * table is the page telling them something untrue about its own record.
   */
  private readonly _exportNotice = signal<string | null>(null);
  readonly exportNotice = this._exportNotice.asReadonly();

  /** How many rows the export would carry — the filtered set of the active tab. */
  readonly exportRowCount = computed(() => {
    switch (this._tab()) {
      case 'decision-log':
        return this.filteredCount();
      case 'orders-idempotency':
        return this.idempotencyCount();
      case 'positions-provenance':
        return this.positionCount();
    }
  });

  /**
   * Produces a derived file. It changes no audit state, which is the whole
   * reason it can sit in a row with no confirmation step.
   */
  exportActiveSet(format: ExportFormat): void {
    const tab = this.activeTab();
    const rows = this.exportRowCount();
    this._exportNotice.set(
      `Exported ${rows} ${tab.noun} from ${tab.title} as ${EXPORT_FORMAT_LABEL[format]}. The audit log is unchanged.`,
    );
  }

  clearExportNotice(): void {
    this._exportNotice.set(null);
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Re-reads the audit log.
   *
   * Filters, sort and tab survive it — they are the reader's query, not the
   * server's answer. The selection does not: a panel left open over a record
   * that may have been re-read underneath is a worse answer than a closed one.
   */
  async refresh(fail = false): Promise<void> {
    if (this._state() === 'loading') return;
    this._state.set('loading');
    this._errorMessage.set(null);
    this._selectedDecisionId.set(null);
    this.clearExportNotice();

    await delay(LATENCY_MS);

    if (fail) {
      this._state.set('error');
      this._errorMessage.set('Unable to load the audit log.');
      return;
    }

    if (!this.logHasDecisions()) this._decisions.set([]);
    else if (this._decisions().length === 0) this._decisions.set(SEED_DECISIONS);

    this._readAt.set(`${AUDIT_TODAY} ${clockNow()} UTC`);
    this._state.set(this._decisions().length === 0 ? 'empty' : 'ready');
  }

  clearError(): void {
    this._errorMessage.set(null);
    if (this._state() === 'error') {
      this._state.set(this._decisions().length === 0 ? 'empty' : 'ready');
    }
  }
}

/** Ordering within one sortable column, ascending. */
function compareDecisions(a: AuditDecision, b: AuditDecision, key: DecisionSortKey): number {
  switch (key) {
    case 'time':
      return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    case 'agent':
      return (
        AUDIT_AGENT_LABEL[a.agent].localeCompare(AUDIT_AGENT_LABEL[b.agent]) ||
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );
    case 'decision':
      return (
        DECISION_TYPE_LABEL[a.type].localeCompare(DECISION_TYPE_LABEL[b.type]) ||
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );
    case 'model':
      return (
        a.model.localeCompare(b.model) ||
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );
  }
}

/** Convenience for callers that hold an agent id and want the audit spelling. */
export function auditAgentLabel(agent: AgentId): string {
  return AUDIT_AGENT_LABEL[agent];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `HH:MM:SS` in UTC — every stamp this service prints carries a ` UTC` suffix. */
function clockNow(): string {
  return new Date().toISOString().slice(11, 19);
}
