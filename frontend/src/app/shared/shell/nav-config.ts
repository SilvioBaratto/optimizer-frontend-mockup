/**
 * The sidebar's structure: 8 sections over 24 rows, plus two ungrouped entries.
 *
 * This is the single source of truth for primary navigation — the shell is one
 * shared component and no page redraws a piece of it. Order and labels come
 * from the `## Guscio` drawing that every page spec in `docs/` repeats
 * identically; keep them in step with that drawing rather than reordering here.
 *
 * The workspace template caps `PrimaryNavList` at 3-5 entries and consolidates
 * beyond that. The optimizer knowingly diverges: all 25 domain pages have to be
 * reachable, and the divergence is recorded under "Divergenza documentata" in
 * `docs/template/00`. Below `md` this renders as a hamburger drawer, never a
 * bottom bar.
 */

export interface NavLink {
  label: string;
  /** Absolute route path. */
  route: string;
}

export interface NavSection {
  /** Uppercase group heading, or null for an ungrouped top-level row. */
  label: string | null;
  links: NavLink[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: null,
    links: [{ label: 'Dashboard', route: '/dashboard' }],
  },
  {
    label: 'BUILD',
    links: [
      { label: 'Universe & Data', route: '/build/universe-data' },
      { label: 'Signals & Factors', route: '/build/signals-factors' },
      { label: 'Views Builder', route: '/build/views-builder' },
      { label: 'Objective & Constraints', route: '/build/objective-constraints' },
      { label: 'Run & Solver Diagnostics', route: '/build/run-solver-diagnostics' },
    ],
  },
  {
    label: 'RESULTS',
    links: [
      { label: 'Results & Frontier', route: '/results/results-frontier' },
      { label: 'Backtest & Validation', route: '/results/backtest-validation' },
      { label: 'Review & Rebalancing', route: '/results/review-rebalancing' },
    ],
  },
  {
    label: 'FUND',
    links: [
      { label: 'Fund Deliberation', route: '/fund/deliberation' },
      { label: 'Macro & Regimes Agent', route: '/fund/macro-agent' },
      { label: 'Allocation Agent', route: '/fund/allocation-agent' },
      { label: 'Risk Agent', route: '/fund/risk-agent' },
      { label: 'Execution & Orders Agent', route: '/fund/execution-agent' },
    ],
  },
  {
    label: 'APPROVALS',
    links: [
      { label: 'Human Approval Gate', route: '/approvals/approval-gate' },
      { label: 'Guardrail & Kill-Switch', route: '/approvals/guardrail-killswitch' },
    ],
  },
  {
    label: 'RISK',
    links: [
      { label: 'Risk Monitoring', route: '/risk/risk-monitoring' },
      { label: 'Risk Attribution', route: '/risk/risk-attribution' },
      { label: 'Stress Testing & Scenarios', route: '/risk/stress-testing' },
      { label: 'Turbulence & Systemic Risk', route: '/risk/turbulence-systemic' },
    ],
  },
  {
    label: 'ADVANCED SIGNALS',
    links: [
      { label: 'Alternative Data & Sentiment', route: '/advanced-signals/alternative-data-sentiment' },
      { label: 'Market Regimes', route: '/advanced-signals/market-regimes' },
      { label: 'Factor Timing & Rotation', route: '/advanced-signals/factor-timing-rotation' },
    ],
  },
  {
    label: null,
    links: [{ label: 'Report', route: '/report' }],
  },
];

/** Flat list of every navigable page, for breadcrumb and title lookups. */
export const NAV_LINKS: readonly NavLink[] = NAV_SECTIONS.flatMap((s) => s.links);

/** The section heading a route sits under, for `Section › Page` breadcrumbs. */
export function sectionLabelFor(route: string): string | null {
  return NAV_SECTIONS.find((s) => s.links.some((l) => l.route === route))?.label ?? null;
}
