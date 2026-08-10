# Implementation plan — pages 14 → 25

Source specs: `docs/14 Risk Agent.md` … `docs/25 Turbulence & Systemic Risk.md`
Style specs: `docs/template/00 Guscio, design token e libreria di pattern.md`, `docs/template/01 Wireframe — specifica di stile.md`
Conventions: `frontend/.claude/CLAUDE.md`

---

## 1. Scope

The request says "pages from 12 to the end". Measured on disk, 12 and 13 are **already built**:

| Doc | Page | Route | State |
|---|---|---|---|
| 12 | Macro & Regimes Agent | `/fund/macro-agent` | built — 190-line template, 7 region sub-components, `macro-regime.service.ts` (473 lines) |
| 13 | Allocation Agent | `/fund/allocation-agent` | built — 157-line template, 6 region sub-components, `allocation-agent.service.ts` (855 lines) |

The 12 remaining pages are all **1-line HTML stubs with a 12-line component class**:

| Doc | Page | Folder | Regions in spec |
|---|---|---|---|
| 14 | Risk Agent | `pages/fund/risk-agent/` | 13 |
| 15 | Execution & Orders Agent | `pages/fund/execution-agent/` | 5 |
| 16 | Human Approval Gate | `pages/approvals/approval-gate/` | 9 |
| 17 | Guardrail & Kill-Switch | `pages/approvals/guardrail-killswitch/` | 9 |
| 18 | Risk Monitoring | `pages/risk/risk-monitoring/` | 8 |
| 19 | Risk Attribution | `pages/risk/risk-attribution/` | 6 |
| 20 | Stress Testing & Scenarios | `pages/risk/stress-testing/` | 7 |
| 21 | Alternative Data & Sentiment | `pages/advanced-signals/alternative-data-sentiment/` | 14 |
| 22 | Market Regimes | `pages/advanced-signals/market-regimes/` | 11 |
| 23 | Factor Timing & Rotation | `pages/advanced-signals/factor-timing-rotation/` | 7 |
| 24 | Report & Audit trail | `pages/report/` | 8 |
| 25 | Turbulence & Systemic Risk | `pages/risk/turbulence-systemic/` | 14 |

**Already wired, do not redo:** every route (`*.routes.ts` in each section folder), every sidebar entry (`shared/shell/nav-config.ts` lists all 25), the breadcrumb, and the `<h1>` — the shell renders the page title from the route, so page templates start at `<h2>`.

**Out of scope:** the uncommitted working-tree diff (89 files, +1061/−671) carrying the mobile-bleed / viewport / tab-alignment work. Land or stash it before starting; building on top of an unlanded restyle means every new page gets reviewed twice.

---

## 2. Ground rules (extracted from the 13 built pages — do not re-derive)

### File layout per page

```
pages/<section>/<page>/
  <page>.ts            component class, ChangeDetectionStrategy.OnPush, host: { class: 'flex flex-col gap-6' }
  <page>.html          regions in spec order, headings start at <h2>
  <page>.css           only if a region needs something Tailwind cannot express
  <region>/            one folder per spec region heavy enough to own state
    <region>.ts
    <region>.html
```

A region gets its own sub-component when it owns state or exceeds ~80 template lines. `macro-agent` (7 sub-components) and `backtest-validation` (3) are the reference shapes.

### Component vocabulary — reuse, never re-invent

| Spec region name | Existing component | Import path |
|---|---|---|
| `Toolbar`, sticky header | `app-page-context-bar` (`[compact]`, `[heading]`, `[layout]`) | `shared/page-context-bar/page-context-bar` |
| `InfoCard` | `app-info-card` (`[title]`, `[card-title]` slot) | `shared/info-card/info-card` |
| `HeroStatCard` | `app-hero-stat-card` (`[title]`, `[eyebrow]`) | `shared/hero-stat-card/hero-stat-card` |
| `SectionCardGrid`, `SectionLabel` | `app-section-card-grid` (`[label]`, `[columns]`, `[ordered]`) | `shared/section-card-grid/section-card-grid` |
| `EntityCard` | `app-entity-card` (`[title] [meta] [route] [selectable] [current]`, `(selected)`) | `shared/entity-card/entity-card` |
| `StatusBadge` | `app-status-badge` (`[label]`, `[tone]`: neutral/ok/warn/alert/active/pending) | `shared/status-badge/status-badge` |
| `StatusBanner` | `app-status-banner` (`[variant]`, `[message]`, `(dismissed)`, `(retried)`) | `shared/status-banner/status-banner` |
| `ActionButtonRow` | `app-action-button-row` (`[align]`) | `shared/action-button-row/action-button-row` |
| `CrossPageLink` | `app-cross-page-link` (`[label] [route] [emphasis]`) | `shared/cross-page-link/cross-page-link` |
| `RefreshControl` | `app-refresh-control` (`[label] [busy]`, `(refresh)`) | `shared/refresh-control/refresh-control` |
| `EmptyState` / `ErrorState` / `RetryButton` | `app-empty-state` / `app-error-state` / `app-retry-button` | `shared/*` |
| `SkeletonBlock` | `app-skeleton-block` (`[height] [width] [lines]`) | `shared/skeleton-block/skeleton-block` |
| `DetailPanel — slide-over` | `app-slide-over` | `shared/ui/slide-over/slide-over` |
| confirmation dialog | `app-confirm-dialog` (`[open] [title] [message] [confirmLabel] [destructive]`) | `shared/confirm-dialog/confirm-dialog` |
| `Pagination` | `ui-pagination` | `shared/ui/pagination/pagination` |
| `TabBar` | `ui-tabs` / `ui-tab` / `ui-tab-panel`, **or** the hand-rolled roving tablist in `macro-agent.html:96-131` when the tab must live in the URL | `shared/ui/tabs/tabs` |
| every `ChartPanel` | `shared/charts` barrel — `LineChartComponent`, `BarChartComponent`, `ScatterChartComponent`, `HistogramChartComponent`, `BulletChartComponent`, `FrontierChartComponent` | `shared/charts` |
| math symbols in labels | `app-math-var` (`[expr] [label]`) | `shared/math/math-var` |
| buttons / selects | `appButton="primary\|secondary\|ghost\|danger\|danger-outline"` + `size`, `appSelect` | `shared/ui/button/button.directive`, `shared/ui/select/select.directive` |

### DataTable idiom — hand-rolled, not a component

Every built page hand-rolls its tables. Copy `pages/results/results-frontier/risk-contribution-table/risk-contribution-table.html`:

```html
<div class="table-scroll">
  <table class="w-full min-w-3xl text-sm">
    <caption class="sr-only">…what the table shows, in a sentence…</caption>
    <thead><tr class="table-head-row">
      <th scope="col" class="px-4 py-2 text-left font-medium">…</th>
      <th scope="col" class="px-2 py-2 text-right font-medium">…</th>
    </tr></thead>
    <tbody>
      <tr class="table-row"><th scope="row" class="px-4 py-1.5 text-left font-normal">…</th>…</tr>
    </tbody>
  </table>
</div>
```

`.table-scroll`, `.table-head-row`, `.table-row` are defined in `src/styles.css`. Numbers right-aligned and `tabular-nums`; `—` for not-applicable, never a blank cell. **Do not use `ui-table`** — it takes `Record<string, unknown>` cells and cannot express alignment, sortable headers, or a totals row.

New requirement across docs 15/19/24: **sortable headers**. There is currently zero `aria-sort` in the codebase. Sortable `<th>` gets `[attr.aria-sort]="'ascending' | 'descending' | 'none'"` with a `<button>` inside it carrying the click. Establish it once in Phase 2 (doc 15) and copy.

### Charts

`app-chart-panel` already supplies the **"View as table"** toggle whenever `[table]` is bound with a `ChartTable`. Most specs demand this alternative — bind `[table]`, never hand-roll a second table beside the chart. `CategorySeries.pattern` renders a hatched fill for "not measured" (docs 22 §Size Premium Recovery row, 23 §market timing) — that is the distinction from a zero value and it is already built. `RefLine` / `RefBand` / `RefPoint` cover the χ² threshold, outlier bands and "current reading" markers doc 25 asks for.

### Services

One service per page, `@Injectable({ providedIn: 'root' })`, signal-backed, deterministic mock data as module constants, `await delay(LATENCY_MS)` so the loading state is reachable. Reference: `services/macro-regime.service.ts`. `HttpClient` is wired nowhere except `services/chat.ts`; **do not add HTTP**.

Expose at minimum: the data signal, a `PageState`-style status (`'empty' | 'loading' | 'ready' | 'error'`), the toolbar parameter signals, `recompute()` / `refresh()`, `clearError()`.

### Models

`models/<name>.model.ts`, interfaces only + `const` label/icon maps. Eight files are TODO stubs (`export {}`) waiting for exactly these pages:

`risk-verdict` (14) · `order` (15) · `approval` — has a 3-field starter (16) · `guardrail` (17) · `risk-monitoring` (18) · `risk-attribution` (19) · `stress-testing` (20) · `turbulence` (25)

Four are missing entirely and must be created: `market-regimes.model.ts` (22), `alt-data-sentiment.model.ts` (21), `factor-timing.model.ts` (23), `report-audit.model.ts` (24).

Pattern for status vocabularies — from `fund-state.model.ts`:

```ts
export type NodeStatus = 'pending' | 'running' | 'done' | 'failed';
export const NODE_STATUS_LABEL: Record<NodeStatus, string> = { … };
export const NODE_STATUS_ICON: Record<NodeStatus, string> = { pending: '○', running: '●', done: '✓', failed: '✗' };
```

Icon **and** word, always. Every spec repeats "mai solo colore".

### Accessibility floor — non-negotiable, every page

Each spec's `### Accessibilità` section is the acceptance criteria. The invariant subset:

- One `<h2>`-rooted heading tree; no skipped levels; the shell owns the `<h1>`.
- Focus visible everywhere; tab order = reading order.
- No information in colour alone — every badge pairs icon + text.
- Loading = `SkeletonBlock` at the final content's height with `aria-busy="true"`; never a spinner for content.
- Empty = icon + title + one explanatory line + an action.
- Error = message + recovery action; `role="alert"` for an action failure, `role="status"` for a load failure.
- Charts expose the tabular alternative and an `ariaLabel` summarising the current reading.
- Segmented controls are `role="radiogroup"` + `role="radio"` + `aria-checked`, arrow-key navigable with roving tabindex.
- Slide-over / dialog: focus trap, Esc closes, focus returns to the opener.
- Destructive actions never fire on first click — `app-confirm-dialog`, initial focus on Cancel.
- 320 / 768 / 1024 / 1440px with no horizontal page scroll; wide tables scroll inside `.table-scroll`.
- `prefers-reduced-motion` kills transitions and skeleton pulse.

---

## 3. Shared-kit gap analysis (Phase 1)

Five spec regions recur across the twelve pages and have **no** component today. Building them once, first, is what keeps twelve pages from growing twelve dialects.

| New component | Consumers | Shape |
|---|---|---|
| `shared/key-metrics-row` | 18, 19, 25 | One card, 2–4 labelled figures in a row; `rows: {label, value, note?, badge?}[]`; collapses to a column below `sm`. Not N × `app-stat-card` — the specs draw a single bordered row. |
| `shared/filter-chip-bar` | 14, 15, 16, 17, 21, 23, 24 | Search field + projected chips/selects + a **live result count** in `aria-live="polite"`. Doc template §"Regioni live": changing counts without announcing the total is a silent change. |
| `shared/segmented-control` | 14, 18, 19, 22, 23, 25 | Generic `role="radiogroup"`, roving tabindex, arrow + Home/End, `aria-checked`, selected marked by a solid border as well as colour. `objective-constraints.page.html` has the only existing `role="radiogroup"` — lift the pattern, don't fork it. |
| `shared/collection-stat-bar` | 16, 21, 24 | `count · category · scope` line, `aria-live="polite"`. |
| `shared/event-log-panel` | 15, 18 | Timestamped entries, collapsible, "view all" affordance, entry click emits an output so the page can highlight the matching chart point. |

Reuse without change: `app-slide-over` (DetailPanel), `ui-pagination`, `ui-tabs`, `app-confirm-dialog`, `app-chart-panel`'s table toggle.

Deliberately **not** built shared: `StepTracker` (one consumer, doc 16 — keep local to `approval-gate/`), a generic `DataTable` (the hand-rolled idiom is the house style and a generic table would lose right-alignment, totals rows and per-cell `app-math-var`).

---

## 4. Cross-page data contracts

These are the reason the phase order is what it is. Two pages showing the same quantity from two mock sources will drift, and the specs call that out explicitly.

| Fact | Owner | Readers | Rule |
|---|---|---|---|
| `proposed_orders` (the 14-order list, stages, symbols, sizes) | `services/execution.service.ts` (doc 15) | 16 approval queue, 17 pipeline counters, 24 order rows | 16's queue is a projection of the same array. A trade cannot be at a stage in 16 that 17's counters do not reflect. |
| Broker posture (`not configured` by default) | `services/execution.service.ts` | 15 banner, 16 banner + decision copy, 17 step [4], 24 idempotency card | One signal. Doc 16 §Regioni: the decision sentence "is derived unambiguously from the posture in the StatusBanner, it does not introduce an independent claim". |
| Kill-switch state | `services/guardrail.service.ts` (doc 17) | 17 hero, 16 pre-check result, 14 trust-boundary card | Single writer, 17. |
| Portfolio DI `DI_ρ(X)` and marginal DI per component | `services/risk-attribution.service.ts` (doc 19) | 19 KeyMetricsRow + table, 17 DI InfoCard + marginal grid | 17 must read 19's service. Both specs print `DI(X)` and a component list; two mocks would give two numbers. |
| `EC = ρ(X)` and `Σ stand-alone` | `services/risk-attribution.service.ts` | 19 KeyMetricsRow, 19 chart's "diversification benefit" | Doc 19 §Regioni: the two figures derive from the TOTAL row "so they can never diverge between panels". Compute once, `computed()` everywhere else. |
| Dominant regime state | `services/market-regimes.service.ts` (doc 22) | 22 HeroStatCard → 22 ContextBridgeCard, 23 "Regime & Market State" InfoCard | Doc 22: the bridge direction is "always recomputed from the dominant state in HeroStatCard: never set independently". Doc 23: "the same shared engine invoked by Macro & Regimes Agent". Derive, never duplicate. |
| Regime state names / expected durations | existing `models/macro-regime.model.ts` | 12, 22, 23 | Import the existing `RegimeState` vocabulary. Do not define a second Crash/Slow-growth/Bull/Recovery list. |
| Decision-log entries (agent, model, params, output) | `services/report-audit.service.ts` (doc 24) | 24 table + detail panel | Rows must name run ids and agents that exist in the fund services, so the "Related → Fund Deliberation run #482" link is not a dead end. Built last for that reason. |
| Run identity / active portfolio | existing `services/fund.service.ts` | all | `fund.service.active` is already the shared portfolio scope. Add nothing that shadows it. |

---

## 5. Dependency graph

```
Phase 1  shared kit ─────────────────────────────────────────────┐
                                                                 │
Phase 2  14 Risk Agent ──┐                                       │
         15 Execution ───┼── proposed_orders, broker posture ──┐ │
                         │                                     │ │
Phase 3  18 Risk Monitoring                                    │ │
         19 Risk Attribution ── DI, EC ──┐                     │ │
                                         │                     │ │
Phase 4  17 Guardrail ◄──────────────────┘                     │ │
         16 Approval Gate ◄────────────────────────────────────┘ │
                                                                 │
Phase 5  20 Stress Testing        25 Turbulence ◄────────────────┘
                                                                 │
Phase 6  22 Market Regimes ── dominant state ──┐                 │
         23 Factor Timing ◄────────────────────┘                 │
         21 Alternative Data                                     │
                                                                 │
Phase 7  24 Report & Audit ◄── reads run ids from all of the above
```

---

## 6. Tasks

Every task is one vertical slice: model → service → sub-components → page → verify. A task is done when the page renders all four states, not when the happy path renders.

### Phase 1 — shared kit

**T1.1 `KeyMetricsRow`**
Files: `shared/key-metrics-row/{key-metrics-row.ts,.html}`
Accept: `rows` input of `{label, value, note?, badge?}`; single bordered surface; 2/3/4-up at `sm`/`lg`, stacked at 320px; values `tabular-nums`; optional `app-status-badge` slot per cell.
Verify: render in `pages/components/` gallery; 320px shows one column, no overflow.

**T1.2 `SegmentedControl`**
Files: `shared/segmented-control/{segmented-control.ts,.html}`
Accept: `options: {value, label, disabled?, disabledReason?}[]`, `value` model, `label` for `aria-labelledby`; `role="radiogroup"`; ←/→/Home/End move and select; roving tabindex; selected carries a solid border + `aria-checked="true"`; a disabled option keeps `aria-disabled` and exposes its reason via `aria-describedby` (doc 19 requires disabled-but-visible controls).
Verify: keyboard-only pass — arrows cycle, Tab exits the group, screen-reader announces checked state.

**T1.3 `FilterChipBar`**
Files: `shared/filter-chip-bar/{filter-chip-bar.ts,.html}`
Accept: projected content for chips/selects, optional `type="search"` field with a label, `count`/`total` inputs rendered into `aria-live="polite"`; chips are `aria-pressed` toggles; horizontal `scroll-snap` below `sm`, never truncated.
Verify: changing a chip announces the new total; 320px scrolls the chip row, page does not.

**T1.4 `CollectionStatBar`**
Files: `shared/collection-stat-bar/{collection-stat-bar.ts,.html}`
Accept: `parts: string[]` joined with `·`; `aria-live="polite"`; no focus stealing.

**T1.5 `EventLogPanel`**
Files: `shared/event-log-panel/{event-log-panel.ts,.html}`
Accept: `entries: {id, at, text, detail?}[]`; collapsible with `aria-expanded`; `(entrySelected)` output; "View all" affordance as a projected slot; empty state built in.

**T1.6 Sortable-header idiom**
No component. Add the `aria-sort` + inner `<button>` markup to one table in T2.2 and record it in this file's §2 as the reference.

> **CHECKPOINT A** — `npm run typecheck && npm run lint && npm run test:ci`. All five components appear in `pages/components/`. Reviewed before any page consumes them; changing a shared component after eight pages import it is the expensive mistake this checkpoint exists to prevent.

---

### Phase 2 — Fund agents

**T2.1 — doc 14, Risk Agent**
Files: `models/risk-verdict.model.ts`, `services/risk-agent.service.ts`, `pages/fund/risk-agent/{risk-agent.ts,.html}` + sub-components `run-selector/`, `upstream-inputs/`, `risk-measures/`, `verdict-card/`, `tool-call-log/`.
Regions: Breadcrumb strip (`app-page-context-bar`: reads `state.allocation` + `state.macro_view`, writes `state.risk_verdict`, run status + id + UTC stamp) · HeroStatCard run picker + "Re-run risk assessment" · SectionLabel "INPUT FROM FUNDSTATE" · SectionCardGrid of 2 read-only EntityCards with cross-page links to `/fund/allocation-agent` and `/fund/macro-agent` · InfoCard "deterministic risk calculation" (tool `portopt`, 09:14:02 UTC, 0.42s) · FilterChipBar with two segmented controls (Confidence 95/99, Method RiskMetrics/Historical) · SectionCardGrid of 5 measure InfoCards (VaR, ES/CVaR, TCE, WCE, two-sided) · InfoCard RiskVerdict with `StatusBadge` FLAGGED + driver badges + raw-object disclosure · InfoCard tool-call log (collapsed) · InfoCard trust boundary · ActionButtonRow to `/approvals/approval-gate` and `/approvals/guardrail-killswitch`.
Accept:
- Method = RiskMetrics ⟹ TCE card shows the ES/CVaR value with the "= ES/CVaR · continuous distribution assumed" annotation, linked to both cards by `aria-describedby`. Method = Historical ⟹ the annotation disappears and TCE may differ. This coupling is the page's whole point.
- WCE renders `—` with "requires the full probability space", not a number.
- Chips filter an already-computed result: switching confidence or method must **not** enter the loading state.
- Re-run disabled when `state.allocation` is absent, with the reason in a tooltip and `aria-describedby`; progress announced through `aria-live="polite"`.
- Macro input older than the allocation input ⟹ freshness `[!]` badge on that EntityCard.
- Empty (no run / no allocation), loading (skeletons at measure-card height, `Running portopt…`), error naming which phase failed (calculation vs interpretation).
Verify: `npm run typecheck`; toggle both chips and confirm no network/loading flicker; keyboard-only pass through the two radiogroups; 320px has no horizontal scroll.

**T2.2 — doc 15, Execution & Orders Agent**
Files: `models/order.model.ts`, `services/execution.service.ts`, `pages/fund/execution-agent/{execution-agent.ts,.html}` + `orders-table/`, `order-detail-panel/`, `run-log/`.
Regions: Toolbar (agent status, writes `proposed_orders`, "all tools read-only or pure-compute", Refresh, full trace) · StatusBanner broker adapter · FilterChipBar (symbol search, Stage, Side, live counts "14 orders · 3 pending approval · 1 blocked") · DataTable of proposed orders (Symbol, Side, Target ΔQty, Schedule sparkline, Est. E, Est. √V, Stage) · DetailPanel slide-over with 4 tabs (Trajectory, Cost–Variance Frontier, Pipeline & Approval, Impact Parameters) · EventLogPanel of the last run's tool calls + reasoning excerpt.
Accept:
- **This task owns the shared order data.** `order.model.ts` defines the order, its stage (`pre-trade | rule-validation | human-gate | broker-adapter`), side, quantities, estimates; `execution.service.ts` owns the array and the broker posture signal. Phases 4 and 7 read them.
- Incomplete scheduling ⟹ both estimate columns render `—` / "n/a — scheduling incomplete", and that order cannot leave the pre-trade stage.
- A blocked order shows the blocking reason as text next to `✕`, not the icon alone.
- Stale-target warning when the latest fund state carries a different target portfolio than the one that generated the list.
- Sortable column headers (first use of the `aria-sort` idiom — this is T1.6's deliverable).
- Trajectory chart: chosen schedule vs constant-rate reference, with `[table]` bound so "View as table" works. Cost–Variance tab: `FrontierChartComponent` with the chosen schedule marked.
- Tabs are `role="tablist"` with ←/→/Home/End; the inactive panel is removed from the a11y tree; opening the panel moves focus to its heading; `aria-expanded` + `aria-controls` on the row toggle.
- No approve/reject/send control exists on this page. Only cross-page links out.
Verify: `npm run typecheck && npm run test:ci`; sort each column and confirm `aria-sort` flips; open the slide-over by keyboard, Esc returns focus to the row.

> **CHECKPOINT B** — the FUND section is complete (11, 12, 13, 14, 15). Walk `/fund/deliberation → macro → allocation → risk → execution` and confirm the four-agent story reads consistently: same run id, same timestamps, each agent naming the state field it writes.

---

### Phase 3 — Risk monitoring & attribution

**T3.1 — doc 18, Risk Monitoring**
Files: `models/risk-monitoring.model.ts`, `services/risk-monitoring.service.ts`, `pages/risk/risk-monitoring/{risk-monitoring.ts,.html}` + `drawdown-thresholds/`, `cdar-curve/`.
Regions: Toolbar (Confidence 90/95/99, Method Parametric/Historical, Holding period, Lookback window, Drawdown units Abs/Rel%, Refresh, as-of stamp) · KeyMetricsRow (VaR, CVaR/ES, current drawdown, time underwater) · ChartPanel VaR & CVaR trend · ChartPanel underwater/drawdown · ChartPanel CDaR curve `Δ_α(x)` with an α slider · DataTable drawdown thresholds (Measure, Current, Limit, Utilization, Status) · EventLogPanel alert & breach log · RelatedPagesList to 19, 20, 25.
Accept:
- `VaR ≤ CVaR` always. `Δ_0(x) = AvDD` and `Δ_1(x) = MaxDD` at the curve's endpoints — assert these in a unit test on the service, they are the page's stated invariants.
- The α slider updates only the readout, the curve marker and the highlighted CDaR row — it does not recompute anything else. `role="slider"` with `aria-valuemin/max/now` and `aria-valuetext` "α = 0.95, Δ = 9.8%"; Home/End reach 0 and 1.
- Drawdown-units toggle updates the KeyMetricsRow card, the underwater chart and the threshold table together.
- Insufficient history for Historical at the chosen β ⟹ inline note on the VaR/CVaR card suggesting Parametric — not a silent fallback.
- Error state keeps the last known values visible, greyed, labelled "stale data", with Retry.
- Clicking an event-log entry highlights the corresponding chart point (this is `EventLogPanel`'s `(entrySelected)` output earning its keep).
Verify: `npm run test:ci` including the endpoint-invariant test; slider by keyboard only.

**T3.2 — doc 19, Risk Attribution**
Files: `models/risk-attribution.model.ts`, `services/risk-attribution.service.ts`, `pages/risk/risk-attribution/{risk-attribution.ts,.html}` + `contribution-table/`, `factor-risk-impact/`, `component-detail-panel/`.
Regions: Toolbar (Risk measure, Confidence, Method Euler/Marginal, Estimation approach, Group by, As-of, component search, $/% toggle, Export) · KeyMetricsRow (Total risk EC, Sum of contributions, Portfolio DI, allocation rule badge) · DataTable by component with sticky TOTAL row and pagination · ChartPanel Euler contributions · FactorRiskImpactPanel · DetailPanel slide-over per component.
Accept:
- **This task owns EC, Σ stand-alone and DI.** Expose them as service signals; KeyMetricsRow, the chart's "diversification benefit", the TOTAL row and doc 17's InfoCard all read the same signals. No second computation anywhere.
- Method = Marginal ⟹ "Sum of contributions" shows < 100% with an explicit badge that with-without contributions do not satisfy full allocation. **Never silently normalise to 100%.**
- Risk measure = Volatility ⟹ Confidence and Estimation approach stay visible but disabled, each with its reason on `aria-describedby` (layout stability is specified).
- Negative (hedge) contributions marked with `▼` + the word "hedge", not colour.
- RORAC undefined at zero/negative contribution ⟹ `—`, not a misleading number.
- TOTAL row stays visible with pagination active.
- Table ↔ chart selection is synchronised both ways; opening the slide-over focuses its close button; Esc returns focus to the originating row or bar.
Verify: `npm run typecheck && npm run test:ci`; unit-test that Euler contributions sum to EC and that Marginal does not.

> **CHECKPOINT C** — 18 and 19 agree on the current portfolio's risk figures. 19's service is the single source of DI/EC before Phase 4 consumes it.

---

### Phase 4 — Approvals

**T4.1 — doc 17, Guardrail & Kill-Switch**
Files: `models/guardrail.model.ts`, `services/guardrail.service.ts`, `pages/approvals/guardrail-killswitch/{guardrail-killswitch.ts,.html}` + `kill-switch-card/`, `hard-limits-grid/`, `limit-form-dialog/`, `guardrail-audit-trail/`.
Regions: HeroStatCard kill-switch (state, last change, author, "deterministic pre-check runs before any LLM routing", primary toggle) · SectionLabel + SectionCardGrid of the 4 pipeline steps with today's counts · SectionLabel + "Add limit" · SectionCardGrid of configured hard limits (scope, Pydantic validator kind, threshold, OK/BREACH, Edit / Enabled / View log) · InfoCard portfolio DI + link to 19 · SectionCardGrid marginal DI per component · FilterChipBar over the audit trail · SectionCardGrid audit-trail events with Load more.
Accept:
- **The spec carries a blocking review finding at `docs/17:13-18` — implement its proposed fix.** If the engage/disengage write fails, the confirm dialog **stays open**, shows a blocking error ("Could not confirm: the kill-switch was NOT changed, current state unchanged"), keeps the typed reason, and offers Retry. The hero card must not update until the backend confirms. A silent write failure here reads as "trading halted" when it is not.
- Kill-switch toggle is first in the tab order after the skip link. Its dialog is `role="alertdialog"`, traps focus, opens focus on the reason field, requires a non-empty reason, returns focus to the toggle. State changes announce through `aria-live="assertive"`.
- Step [4] Broker Adapter reads "not configured" from `execution.service`'s posture signal (T2.2) — not a literal.
- Pipeline counts derive from the shared order array.
- DI figures come from `risk-attribution.service` (T3.2).
- Disabling a kill-switch-scoped limit demands the same reason-and-confirm flow as the global switch.
- A limit save runs the same validators and, on rejection, shows the original error message in full inside the form.
- Empty (no limits configured — the copy is given verbatim in the spec), per-region loading, per-region error that does not take down its neighbours.
Verify: `npm run test:ci` with a test that forces the write to fail and asserts the dialog stays open and the hero state is unchanged. Keyboard: Tab from skip link lands on the toggle.

**T4.2 — doc 16, Human Approval Gate**
Files: extend `models/approval.model.ts`, `services/approval-gate.service.ts`, `pages/approvals/approval-gate/{approval-gate.ts,.html}` + `step-tracker/` (local), `approval-queue/`, `trade-detail-panel/`, `decision-form/`.
Regions: StatusBanner broker posture · FilterChipBar (Step default "Human Gate", Status default "Pending", search, Refresh) · CollectionStatBar · SectionCardGrid approval queue as selectable EntityCards · DetailPanel header · StepTracker of the four mandatory steps · InfoCard automated checks (pre-check + rule validation) · ActionButtonRow decision (posture sentence, optional note, Reject outline, Approve filled) · InfoCard audit trail · InfoCard past outcome.
Accept:
- Queue is a projection of `execution.service`'s orders. Every trade sits on exactly one of the four steps.
- With posture = no broker configured, **no** trade can be at step Broker Adapter — verify the invariant in a test, the spec calls for it explicitly.
- The decision sentence is derived from the posture signal, never written twice.
- Approve/Reject are enabled only at the Human Gate step; otherwise `aria-disabled` (not hidden) with the reason on `aria-describedby`, and the decision row is absent from the panel.
- Both open `app-confirm-dialog` summarising the expected outcome (routed to broker vs authorised for manual placement); initial focus on Cancel; Confirm submits, the card leaves the Pending filter, and the panel swaps the decision row for the historical-outcome InfoCard with the automatic/manual distinction spelled out.
- Missing rule-validation result ⟹ "result pending", never a fabricated pass/fail.
- The grid is `role="grid"` with ↑/↓ between cards and Enter to open.
- Refresh preserves filters and selection.
Verify: `npm run test:ci` incl. the no-broker/no-step-4 invariant; keyboard-only approve flow end to end.

> **CHECKPOINT D** — approve a trade in 16, then confirm 17's pipeline counters and audit trail moved and 15's order stage advanced. If any of the three disagrees, the shared contract is broken, not the UI.

---

### Phase 5 — Stress & systemic

**T5.1 — doc 20, Stress Testing & Scenarios**
Files: `models/stress-testing.model.ts`, `services/stress-testing.service.ts`, `pages/risk/stress-testing/{stress-testing.ts,.html}` + `factor-scenario-table/`, `scenario-summary/`, `scenario-library/`, `reverse-stress-panel/`.
Regions: Toolbar (Impact measure, plausibility radius k as number + slider, Save scenario, Run worst-case search) · TabBar Forward/Reverse · DataTable systematic risk factors with Fix checkboxes · SectionCardGrid three scenario summary cards · ChartPanel severity comparison · ChartPanel maximum-loss contribution · ScenarioLibrary · ReverseStressPanel.
Accept:
- Reverse tab replaces the DataTable, the SectionCardGrid and both ChartPanels; the Toolbar stays shared.
- Unfixed factors are held at the conditional expected value and are **not editable** — a fixed treatment, not an option.
- Changing Impact measure or k after a result marks every shown result **stale with a text badge**, with no automatic recompute, until the user re-runs.
- `Σ MLC ≠ 100%` prints an explicit note on the sign of the interaction; the bar lengths alone do not carry it.
- Infeasible search ⟹ inline `ErrorState` above the affected section with the given copy and Retry.
- Library row delete goes through `app-confirm-dialog`.
- k slider and number input are two views of one value, both `aria-valuetext`-labelled.
Verify: `npm run typecheck`; change k after a run and confirm every panel is badged stale; delete a row and confirm the dialog.

**T5.2 — doc 25, Turbulence & Systemic Risk**
Files: `models/turbulence.model.ts`, `services/turbulence.service.ts`, `pages/risk/turbulence-systemic/{turbulence-systemic.ts,.html}` + `current-reading-grid/`, `turbulence-chart/`, `correlation-inspector/`, `absorption-panel/`, `pc1-growth/`, `eigenvalue-spectrum/`, `participation-ratio/`, `pc1-contribution-table/`.
Regions (14 — the largest page): KeyMetricsRow as-of bar · SectionLabel CURRENT READING · SectionCardGrid of 6 indicator EntityCards · SectionNav jump links · Toolbar (range 6M/1Y/3Y/5Y/Max, χ² threshold and outlier bands toggle) · ChartPanel turbulence & decomposition · ChartPanel pairwise correlation-surprise inspector · DataTable top contributors · ChartPanel absorption ratio · ChartPanel effective rank · ChartPanel PC1 growth · ChartPanel eigenvalue spectrum vs the Wishart `γ₊` bound · ChartPanel participation ratio · DataTable asset contribution to PC1 · InfoCard placement note.
Accept:
- The χ² threshold is a function of the current asset count, not a screen constant — the note says so and the code must match.
- Correlation surprise is defined for a **pair only**; Asset X ≠ Asset Y is enforced, and the single-asset case is stated, not hidden.
- Partial coverage ⟹ `Partial coverage — N/M assets` badge beside the value, never a silently hidden panel.
- Stale snapshot ⟹ data age beside the as-of stamp.
- Per-panel error with Retry; one failed panel does not block the others.
- `SectionNav` links scroll without reloading and work from the keyboard.
- Chart-heavy page: bind `[table]` on every `ChartPanel`; verify no layout thrash at 320px.
Verify: `npm run typecheck`; measure initial render — if eight ECharts instances on one route hurt, defer the below-fold panels behind `@defer`, which is the intended lever.

> **CHECKPOINT E** — the RISK section is complete (18, 19, 20, 25). Cross-navigate from 18's `RelatedPagesList` to each sibling and back; the portfolio scope must survive every hop.

---

### Phase 6 — Advanced signals

**T6.1 — doc 22, Market Regimes**
Files: `models/market-regimes.model.ts` (importing `RegimeState` from the existing `macro-regime.model.ts`), `services/market-regimes.service.ts`, `pages/advanced-signals/market-regimes/{market-regimes.ts,.html}` + `probability-path/`, `regime-statistics/`, `correlation-diagnostic/`, `macro-nowcast/`, `momentum-state/`, `size-premium/`, `value-premium/`, `regime-view-bridge/`.
Accept:
- **Three separate state vocabularies must not be blended:** the 4-state VAR (HeroStatCard, Probability Path, Regime Statistics, Size Premium), the 2-state Markov of the value premium, and momentum's UP/DOWN. No shared colours, no aligned rows, separate headings. This is the page's most-repeated spec constraint.
- ContextBridgeCard direction is `computed()` from the dominant state — never a settable signal.
- Size Premium's `Recovery` cell renders as not-specified via `CategorySeries.pattern`, not as 0.
- Regime model = Hamilton 2-state ⟹ HeroStatCard, Probability Path and Regime Statistics drop to two states; Size and Value premium panels keep their own vocabularies.
- Universe without Large/Small or Equity/Bond series ⟹ `n/d` in those correlation cells, never an estimate.
- Nowcast vintage older than the filter reference date ⟹ "Stale vintage" text badge.
- Low filter confidence ⟹ warning text in the diagnostics footer and Preview/Send disabled while the estimate is invalid.
Verify: `npm run typecheck`; switch models and confirm the three vocabularies stay independent; confirm the bridge cannot contradict the hero card.

**T6.2 — doc 23, Factor Timing & Rotation**
Files: `models/factor-timing.model.ts`, `services/factor-timing.service.ts`, `pages/advanced-signals/factor-timing-rotation/{factor-timing-rotation.ts,.html}` + `regime-market-state/`, `value-spread/`, `factor-signals-table/`, `timing-comparison-panel/`.
Accept:
- The "Regime & Market State" InfoCard reads T6.1's service — the spec names it the same shared engine, and the ActionButtonRow links across to `/advanced-signals/market-regimes`.
- `TimingComparisonPanel`: market timing has **no out-of-sample IR** and renders as a dotted marker, not a zero-length bar. The expected-utility gain sits in a visually separate box with its own heading — a different measure, not comparable on the IR axis.
- No variant is highlighted as "recommended".
- Factors with insufficient history show "insufficient history" and are excluded from the composite.
- A trend-vs-valuation conflict marks its row and feeds the anti-extrapolation callout in the Value Spread card by reference, without duplicating the banner text.
- Guardrail `StatusBanner` dismisses for the session only, and returns on a new session or a new conflict.
- Signals computed beyond the selected rebalancing interval get a "Stale" badge.
Verify: `npm run typecheck`; confirm the dotted "not measured" marker is distinguishable in greyscale.

**T6.3 — doc 21, Alternative Data & Sentiment**
Files: `models/alt-data-sentiment.model.ts`, `services/alt-data-sentiment.service.ts`, `pages/advanced-signals/alternative-data-sentiment/{alternative-data-sentiment.ts,.html}` + `signal-library/`, `signal-detail/`, `cross-sectional-panel/`, `ml-aggregation-panel/`.
Accept:
- Three tabs; Signal Library default. Cross-Sectional and ML Aggregation replace FilterChipBar/SectionCardGrid/HeroStatCard with ParameterPanel/DataTable/ChartPanel, while ScopeSwitcher, TabBar and the footer stay put.
- **Selection and inclusion are two different things.** Enter makes a card drive the detail card; Space toggles its include checkbox without changing which card drives the detail. Cards are `role="option"` with `aria-selected`.
- A failed feed shows an error badge with the last-good timestamp and the card **stays selectable** with partial data.
- Per-card method controls (10-K Tone dictionary/weighting, News daily/weekly) update the detail card immediately, with no explicit save.
- The `[!]` note "73.8% of H4N negative words are not negative in a financial context" belongs to the 10-K Tone card.
- Footer: CollectionStatBar + primary "Send N to Views Builder →", disabled at zero, navigating to `/build/views-builder` with the selected signals preloaded as candidates.
- Partial coverage and staleness badges as specified.
Verify: `npm run typecheck && npm run test:ci`; keyboard test that Space and Enter do different things.

> **CHECKPOINT F** — ADVANCED SIGNALS complete. Confirm 22 → 23 share one regime reading and that both "send to Views Builder" paths land on `/build/views-builder` without error.

---

### Phase 7 — Report

**T7.1 — doc 24, Report & Audit trail**
Files: `models/report-audit.model.ts`, `services/report-audit.service.ts`, `pages/report/{report.ts,.html}` + `decision-log-table/`, `decision-detail-panel/`, `audit-posture-card/`.
Regions: TabBar (Decision Log / Orders & Idempotency / Positions Provenance) · ActionButtonRow Export CSV/PDF · FilterChipBar (Agent, Decision type, Date range, search + Search button) · InfoCard audit posture (4 indicators + positions provenance) · CollectionStatBar · DataTable decision log · Pagination · DetailPanel slide-over.
Accept:
- Rows name agents and run ids that exist in the fund services, so "Related → Fund Deliberation run #…" resolves.
- Prompt hash `—` is the **expected** state for a model without reproducibility: `aria-label="not logged"`, styled as data, never as an error or a gap.
- Orders & Idempotency and the sync block in Positions Provenance stay **empty by posture**, not by error, while no broker is configured — read the posture signal from `execution.service`.
- Filters apply immediately; the search field waits for Enter or the Search button; every change updates the `aria-live` CollectionStatBar.
- Two distinct empty states: "No decisions match these filters" + Reset, and "No decisions logged yet" with no reset action.
- Tab change preserves Agent and Date-range filters where applicable.
- Slide-over is `role="dialog" aria-modal="true"` with focus trap; Copy copies the full output; close returns focus to the originating row.
- Loading blanks the whole view — the spec forbids showing partial content here.
Verify: `npm run typecheck && npm run test:ci`; deep-link with prefilled Agent/Date filters and confirm they apply.

> **CHECKPOINT G — final** — `npm run typecheck && npm run lint && npm run test:ci && npm run build`. Then the cross-cutting sweep in §7.

---

## 7. Final verification sweep

Run once, over all 25 pages, not per task:

1. **Build & tests** — `npm run typecheck && npm run lint && npm run test:ci && npm run build`. Zero warnings introduced.
2. **Four states** — every new page reachable in empty, loading, error and populated. Services expose a `fail` flag the way `fund.service.load(fail)` does; use it rather than editing code to see an error state.
3. **Breakpoints** — 320 / 768 / 1024 / 1440. No horizontal page scroll; wide tables scroll inside `.table-scroll`; charts reflow.
4. **Keyboard** — skip link works; tab order matches reading order; every radiogroup arrow-navigates; every slide-over and dialog traps focus, closes on Esc, and returns focus.
5. **Greyscale** — screenshot each page desaturated. Every status still readable. This catches colour-only encoding faster than reading the markup.
6. **Reduced motion** — `prefers-reduced-motion: reduce` stops skeleton pulses and panel transitions.
7. **Cross-page consistency** — walk the contracts in §4 and confirm no figure disagrees between its owner and its readers.
8. **Nav** — all 24 sidebar rows resolve; no stub remains; `/report` and `/dashboard` still land correctly.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| The uncommitted 89-file restyle collides with 12 new pages | Land or stash it before T1.1. Non-negotiable. |
| Twelve services drifting into twelve mock dialects | §4 contracts; Checkpoints B, C, D, F exist to catch drift at the seam. |
| Doc 25 mounts 8 ECharts instances on one route | Measure at T5.2; `@defer` the below-fold panels if needed. |
| Doc 17's spec has a known blocking review finding | Implement the proposed fix (T4.1 first acceptance criterion) rather than the flawed text. |
| Docs 12 and 22 both model regimes | 22 imports `RegimeState` from `models/macro-regime.model.ts`; a second Crash/Bull vocabulary is a review-blocking defect. |
| A shared component changing after eight pages import it | Checkpoint A reviews the kit before any page consumes it. |
| Scope creep from the specs' `## Fondamenti di dominio` sections | Those sections are context, not UI. Only `### Wireframe`, `### Regioni`, `### Campi e controlli`, `### Stati`, `### Interazioni`, `### Accessibilità` are buildable. |

---

## 9. Effort shape

Rough relative weight by region count and chart load, for sequencing rather than estimation:

- Heavy: 25 (14 regions, 8 charts), 21 (14 regions, 3 tabs), 22 (11 regions, 7 charts), 17 (9 regions + kill-switch flow)
- Medium: 14, 16, 19, 20, 23, 24
- Lighter: 15, 18

Phases 2–7 are independently shippable: each ends with a section of the sidebar fully live.
