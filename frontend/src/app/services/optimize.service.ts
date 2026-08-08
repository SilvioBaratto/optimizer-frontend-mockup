import { Injectable, signal } from '@angular/core';

import type { PendingApproval } from '../models/approval.model';
import type { ActivityEntry } from '../models/audit-decision.model';
import type { AgentSummary } from '../models/fund-state.model';
import type {
  AllocationPhase,
  OperationalCondition,
  OptimizationRun,
} from '../models/optimization-run.model';

export type LoadState = 'loading' | 'ready' | 'error';

/** Stand-in latency, so the loading states the spec mandates are reachable. */
const LATENCY_MS = 650;

/**
 * Everything the dashboard reads, in one snapshot.
 *
 * Grouped rather than fetched per-region because the spec's error state draws
 * the distinction between the whole page failing and one section failing —
 * which needs the sections to be individually addressable but jointly loaded.
 */
export interface DashboardSnapshot {
  run: OptimizationRun | null;
  phases: readonly AllocationPhase[];
  conditions: readonly OperationalCondition[];
  agents: readonly AgentSummary[];
  approvals: readonly PendingApproval[];
  activity: readonly ActivityEntry[];
}

const PHASES: readonly AllocationPhase[] = [
  { step: 1, name: 'Asset Classes', status: 'completed' },
  { step: 2, name: 'Asset Assumptions', status: 'completed' },
  { step: 3, name: 'Strategic AA', status: 'completed' },
  { step: 4, name: 'Tactical AA', status: 'current' },
  { step: 5, name: 'Short-term Review', status: 'pending' },
  { step: 6, name: 'Long-term Review', status: 'pending' },
  { step: 7, name: 'Ex-post Analysis', status: 'pending' },
];

const CONDITIONS: readonly OperationalCondition[] = [
  {
    id: 'performance',
    name: 'Performance',
    status: 'ok',
    detail: 'Realised performance is consistent with the assumptions used in the last run.',
  },
  {
    id: 'stability',
    name: 'Stability of relations',
    status: 'ok',
    detail: 'Estimated relations between asset classes have held over the evaluation window.',
  },
  {
    id: 'dependence',
    name: 'Dependence',
    status: 'watch',
    detail:
      'Cross-asset dependence has risen over the last three weeks and is approaching the level where diversification stops paying.',
  },
  {
    id: 'sensitivity',
    name: 'Sensitivity',
    status: 'ok',
    detail: 'Allocation is not unduly sensitive to small changes in the input estimates.',
  },
  {
    id: 'rebalancing',
    name: 'Rebalancing',
    status: 'ok',
    detail: 'Rebalancing frequency and cost remain inside the configured bounds.',
  },
  {
    id: 'errors',
    name: 'Errors & Frauds',
    status: 'alert',
    detail:
      'A reconciliation break was reported on the custodian feed and has not yet been cleared.',
  },
];

const AGENTS: readonly AgentSummary[] = [
  {
    id: 'macro',
    name: 'Macro & Regimes Agent',
    status: 'active',
    updatedAt: '18:41',
    route: '/fund/macro-agent',
  },
  {
    id: 'allocation',
    name: 'Allocation Agent',
    status: 'active',
    updatedAt: '18:39',
    route: '/fund/allocation-agent',
  },
  {
    id: 'risk',
    name: 'Risk Agent',
    status: 'needs-review',
    updatedAt: '18:20',
    route: '/fund/risk-agent',
  },
  {
    id: 'execution',
    name: 'Execution & Orders Agent',
    status: 'idle',
    updatedAt: '17:02',
    route: '/fund/execution-agent',
  },
];

const APPROVALS: readonly PendingApproval[] = [
  { id: 'a-118', title: 'Rebalance proposal #A-118', kind: 'Rebalance' },
  { id: 'ks-04', title: 'Kill-switch override request', kind: 'Override' },
];

const ACTIVITY: readonly ActivityEntry[] = [
  {
    id: 'act-1',
    at: '18:42',
    description: 'Optimization run completed',
    route: '/build/run-solver-diagnostics',
  },
  {
    id: 'act-2',
    at: '18:20',
    description: 'Risk Agent flagged rising dependence',
    route: '/fund/risk-agent',
  },
  {
    id: 'act-3',
    at: '17:55',
    description: 'Tactical AA step updated',
    route: '/results/review-rebalancing',
  },
];

/** Frontier sampled by the solver, in (risk, return) — risk is Var(R) in %. */
const FRONTIER = [
  { risk: 0.28, expectedReturn: 2.4 },
  { risk: 0.36, expectedReturn: 3.4 },
  { risk: 0.5, expectedReturn: 4.4 },
  { risk: 0.7, expectedReturn: 5.4 },
  { risk: 0.96, expectedReturn: 6.3 },
  { risk: 1.28, expectedReturn: 7.1 },
  { risk: 1.66, expectedReturn: 7.8 },
];

function runFor(portfolioId: string): OptimizationRun {
  // Small per-portfolio offset so switching scope visibly changes the page.
  const shift = portfolioId.length % 3;
  return {
    completedAt: '2026-07-31 18:42',
    stale: shift === 2,
    metrics: {
      expectedReturn: 6.8 - shift * 0.4,
      risk: {
        variance: 9.4 - shift * 0.5,
        'semi-variance': 5.1 - shift * 0.3,
        'mad-squared': 7.6 - shift * 0.4,
      },
    },
    frontier: FRONTIER,
    current: { risk: 1.12, expectedReturn: 6.8 - shift * 0.4 },
    dominatedBy: shift === 1 ? 0 : 3,
  };
}

/**
 * Dashboard reads against the optimizer API.
 *
 * The HTTP client is not wired yet; this stands in with the same shape and
 * realistic latency, which is what makes the loading and error states in the
 * spec actually reachable rather than theoretical.
 */
@Injectable({ providedIn: 'root' })
export class OptimizeService {
  private readonly _snapshot = signal<DashboardSnapshot | null>(null);
  private readonly _state = signal<LoadState>('loading');
  /** Set when only the activity feed failed, per the partial-failure state. */
  private readonly _activityFailed = signal(false);

  readonly snapshot = this._snapshot.asReadonly();
  readonly state = this._state.asReadonly();
  readonly activityFailed = this._activityFailed.asReadonly();

  /**
   * Loads the dashboard for one portfolio.
   *
   * `fail` and `failActivity` exercise the two error shapes the spec
   * distinguishes: the whole page, and a single section.
   */
  async load(portfolioId: string, opts: { fail?: boolean; failActivity?: boolean } = {}): Promise<void> {
    this._state.set('loading');
    this._activityFailed.set(false);
    await delay(LATENCY_MS);

    if (opts.fail) {
      this._snapshot.set(null);
      this._state.set('error');
      return;
    }

    this._activityFailed.set(Boolean(opts.failActivity));
    this._snapshot.set({
      run: runFor(portfolioId),
      phases: PHASES,
      conditions: CONDITIONS,
      agents: AGENTS,
      approvals: APPROVALS,
      activity: opts.failActivity ? [] : ACTIVITY,
    });
    this._state.set('ready');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
