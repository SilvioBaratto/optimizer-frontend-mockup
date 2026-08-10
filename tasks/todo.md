# TODO — pages 14 → 25

Plan: `tasks/plan.md`. Docs 12 and 13 are already built; the 12 stubs below are the work.

Per-task definition of done: model → service → sub-components → page template → all four states (empty / loading / error / populated) → `npm run typecheck` clean → keyboard pass → 320px with no horizontal scroll.

---

## Phase 0 — clear the deck

- [x] Land or stash the uncommitted working-tree diff (89 files, +1061/−671: mobile bleed, viewport lock, tab alignment). Do not build on top of it.

## Phase 1 — shared kit

- [x] **T1.1** `shared/key-metrics-row` — 2–4 labelled figures in one bordered row; stacks at 320px *(used by 18, 19, 25)*
- [x] **T1.2** `shared/segmented-control` — `role="radiogroup"`, roving tabindex, ←/→/Home/End, `aria-checked`, disabled-with-reason *(14, 18, 19, 22, 23, 25)*
- [x] **T1.3** `shared/filter-chip-bar` — search + projected chips + live count in `aria-live="polite"`; scroll-snap below sm *(14, 15, 16, 17, 21, 23, 24)*
- [x] **T1.4** `shared/collection-stat-bar` — `count · category · scope`, `aria-live="polite"` *(16, 21, 24)*
- [x] **T1.5** `shared/event-log-panel` — timestamped, collapsible, `(entrySelected)` output *(15, 18)*
- [x] **T1.6** Sortable-header idiom: `aria-sort` + inner `<button>`; first use lands in T2.2, record it in plan §2
- [ ] Add all five to the `pages/components/` gallery

> **CHECKPOINT A** — `npm run typecheck && npm run lint && npm run test:ci`. Review the kit before any page imports it.

## Phase 2 — Fund agents

- [x] **T2.1 · doc 14 · Risk Agent** — `models/risk-verdict.model.ts`, `services/risk-agent.service.ts`, `pages/fund/risk-agent/`
  - [x] RiskMetrics ⟹ TCE mirrors ES/CVaR with the coincidence note + `aria-describedby`; Historical ⟹ note gone, values may differ
  - [x] WCE renders `—` ("requires the full probability space")
  - [x] Confidence/Method chips filter only — no loading state on change
  - [x] Re-run disabled without `state.allocation`, reason exposed; progress via `aria-live`
  - [x] Freshness `[!]` when macro input is older than the allocation input
  - [x] Empty / loading / error-naming-the-failed-phase
- [x] **T2.2 · doc 15 · Execution & Orders Agent** — `models/order.model.ts`, `services/execution.service.ts`, `pages/fund/execution-agent/`
  - [x] **Owns `proposed_orders` + broker posture** — Phases 4 and 7 read these signals
  - [x] Incomplete scheduling ⟹ `—` in both estimate columns, cannot leave pre-trade
  - [x] Blocked order shows the reason as text beside `✕`
  - [x] Stale-target warning when the latest fund state differs
  - [x] Sortable headers with `aria-sort` (delivers T1.6)
  - [x] Slide-over with 4 tabs; roving tablist; inactive panel out of the a11y tree; focus to heading on open
  - [x] No approve/reject/send control on this page

> **CHECKPOINT B** — walk `/fund/deliberation → macro → allocation → risk → execution`: one run id, consistent timestamps, each agent naming its state field.

## Phase 3 — Risk monitoring & attribution

- [x] **T3.1 · doc 18 · Risk Monitoring** — `models/risk-monitoring.model.ts`, `services/risk-monitoring.service.ts`, `pages/risk/risk-monitoring/`
  - [x] Invariants under test: `VaR ≤ CVaR`, `Δ_0 = AvDD`, `Δ_1 = MaxDD`
  - [x] α slider updates readout + marker + highlighted row only; `aria-valuetext`, Home/End reach 0 and 1
  - [x] Drawdown-units toggle moves the metric card, the underwater chart and the threshold table together
  - [x] Insufficient history ⟹ inline note suggesting Parametric, no silent fallback
  - [x] Error keeps last known values, greyed, "stale data", with Retry
  - [x] Event-log entry click highlights the matching chart point
- [x] **T3.2 · doc 19 · Risk Attribution** — `models/risk-attribution.model.ts`, `services/risk-attribution.service.ts`, `pages/risk/risk-attribution/`
  - [x] **Owns EC, Σ stand-alone, DI** — doc 17 reads these signals
  - [x] Marginal ⟹ sum < 100% with an explicit badge; never silently normalised
  - [x] Volatility ⟹ Confidence + Estimation approach visible-but-disabled with reasons
  - [x] Hedge rows marked `▼` + "hedge"; undefined RORAC ⟹ `—`
  - [x] TOTAL row sticky through pagination
  - [x] Table ↔ chart selection synchronised; slide-over focus + Esc return
  - [x] Test: Euler sums to EC, Marginal does not

> **CHECKPOINT C** — 18 and 19 agree on the current portfolio's risk figures.

## Phase 4 — Approvals

- [x] **T4.1 · doc 17 · Guardrail & Kill-Switch** — `models/guardrail.model.ts`, `services/guardrail.service.ts`, `pages/approvals/guardrail-killswitch/`
  - [x] **Fix the spec's blocking finding (`docs/17:13-18`)**: on a failed kill-switch write the dialog stays open, shows a blocking error, keeps the reason, offers Retry; the hero card does not update until confirmed
  - [x] Toggle first in tab order; `role="alertdialog"`; focus opens on the reason field; reason required; `aria-live="assertive"` on state change
  - [x] Step [4] reads the broker posture from `execution.service`; pipeline counts derive from the shared order array
  - [x] DI figures read `risk-attribution.service`
  - [x] Disabling a kill-switch-scoped limit demands the same reason-and-confirm flow
  - [x] Limit save runs the same validators; rejection shows the original error in full
  - [x] Per-region error does not take down its neighbours
  - [x] Test: forced write failure leaves the dialog open and the state unchanged
- [x] **T4.2 · doc 16 · Human Approval Gate** — extend `models/approval.model.ts`, `services/approval-gate.service.ts`, `pages/approvals/approval-gate/`
  - [x] Queue is a projection of `execution.service`'s orders; each trade on exactly one step
  - [x] Test: with no broker configured, no trade can sit at step Broker Adapter
  - [x] Decision sentence derived from the posture signal, never written twice
  - [x] Approve/Reject enabled only at Human Gate; otherwise `aria-disabled` + reason, decision row absent
  - [x] Confirm dialog summarises routed-vs-manual; initial focus Cancel; on confirm the panel swaps to the historical-outcome card
  - [x] Missing rule-validation result ⟹ "result pending"
  - [x] `role="grid"` queue, ↑/↓ + Enter
  - [x] Refresh preserves filters and selection

> **CHECKPOINT D** — approve a trade in 16; confirm 17's counters/audit and 15's order stage all moved.

## Phase 5 — Stress & systemic

- [x] **T5.1 · doc 20 · Stress Testing & Scenarios** — `models/stress-testing.model.ts`, `services/stress-testing.service.ts`, `pages/risk/stress-testing/`
  - [x] Reverse tab replaces DataTable + SectionCardGrid + both ChartPanels; Toolbar shared
  - [x] Unfixed factors held at conditional expected value, not editable
  - [x] Changing Impact measure or k marks results **stale with a text badge**, no auto-recompute
  - [x] `Σ MLC ≠ 100%` prints the interaction-sign note in text
  - [x] Infeasible search ⟹ inline ErrorState + Retry
  - [x] Library delete behind `app-confirm-dialog`
  - [x] k slider and number input are one value, both `aria-valuetext`-labelled
- [x] **T5.2 · doc 25 · Turbulence & Systemic Risk** — `models/turbulence.model.ts`, `services/turbulence.service.ts`, `pages/risk/turbulence-systemic/`
  - [x] χ² threshold is a function of the asset count, not a constant
  - [x] Correlation surprise pair-only; X ≠ Y enforced; single-asset case stated
  - [x] `Partial coverage — N/M assets` badge; stale-snapshot age beside the as-of stamp
  - [x] Per-panel error + Retry, neighbours unaffected
  - [x] `SectionNav` scroll links keyboard-operable
  - [x] `[table]` bound on all 8 ChartPanels; measure render, `@defer` below-fold panels if needed

> **CHECKPOINT E** — RISK section complete; cross-navigate 18 → 19 / 20 / 25 with the portfolio scope surviving every hop.

## Phase 6 — Advanced signals

- [x] **T6.1 · doc 22 · Market Regimes** — `models/market-regimes.model.ts` (imports `RegimeState` from `macro-regime.model.ts`), `services/market-regimes.service.ts`, `pages/advanced-signals/market-regimes/`
  - [x] Three state vocabularies stay separate: 4-state VAR, 2-state value Markov, momentum UP/DOWN — no shared colours or aligned rows
  - [x] ContextBridgeCard direction is `computed()` from the dominant state, never settable
  - [x] Size Premium `Recovery` uses `CategorySeries.pattern`, not 0
  - [x] Hamilton model ⟹ hero / path / statistics drop to two states; premium panels keep their own
  - [x] Missing series ⟹ `n/d` in those correlation cells
  - [x] "Stale vintage" badge; low filter confidence disables Preview/Send
- [x] **T6.2 · doc 23 · Factor Timing & Rotation** — `models/factor-timing.model.ts`, `services/factor-timing.service.ts`, `pages/advanced-signals/factor-timing-rotation/`
  - [x] Regime card reads T6.1's service; cross-link to `/advanced-signals/market-regimes`
  - [x] Market timing = dotted "not measured" marker, not a zero bar; expected-utility gain in a visually separate box
  - [x] No variant flagged "recommended"
  - [x] Insufficient history ⟹ excluded from the composite and labelled
  - [x] Trend-vs-valuation conflict marks its row and feeds the callout by reference
  - [x] Guardrail banner dismisses for the session only
  - [x] "Stale" badge when signals outrun the rebalancing interval
- [x] **T6.3 · doc 21 · Alternative Data & Sentiment** — `models/alt-data-sentiment.model.ts`, `services/alt-data-sentiment.service.ts`, `pages/advanced-signals/alternative-data-sentiment/`
  - [x] Three tabs; the two non-default tabs swap the content area while ScopeSwitcher / TabBar / footer stay put
  - [x] Enter drives the detail card, Space toggles include — two different things; `role="option"` + `aria-selected`
  - [x] Failed feed ⟹ error badge with last-good time, card still selectable
  - [x] Per-card method controls update the detail immediately, no save step
  - [x] Footer CTA disabled at zero; navigates to `/build/views-builder` with candidates preloaded
  - [x] Partial-coverage and staleness badges

> **CHECKPOINT F** — 22 and 23 share one regime reading; both "send to Views Builder" paths land cleanly.

## Phase 7 — Report

- [ ] **T7.1 · doc 24 · Report & Audit trail** — `models/report-audit.model.ts`, `services/report-audit.service.ts`, `pages/report/`
  - [ ] Rows name run ids and agents that exist upstream, so Related links resolve
  - [ ] Prompt hash `—` with `aria-label="not logged"` — expected data, not an error
  - [ ] Orders & Idempotency and the Positions sync block empty **by posture**, reading `execution.service`
  - [ ] Filters apply immediately; search waits for Enter/Search; CollectionStatBar announces
  - [ ] Two distinct empty states (filtered vs never-logged)
  - [ ] Tab change preserves Agent + Date range
  - [ ] Slide-over `role="dialog" aria-modal="true"`, focus trap, Copy, focus returns to the row
  - [ ] Loading blanks the whole view — no partial content

> **CHECKPOINT G** — `npm run typecheck && npm run lint && npm run test:ci && npm run build`.

## Deferred to the final sweep

- [ ] `app-entity-card`'s projected action slot is `flex shrink-0`, so it is sized at max-content and a `flex-wrap` child handed to it can never wrap. Doc 17 hit this as 163px of horizontal scroll at 320px and worked around it by moving actions into an `ActionButtonRow` beneath the card. Fix the shared component so later pages cannot hit it, then check the workaround is still wanted.
- [ ] `SectionCardGrid`'s label uses `.eyebrow`, which uppercases, so doc 14 renders `RISKMETRICS` where its wireframe writes `RiskMetrics`. Decide whether the label should preserve case.
- [ ] Add the five Phase 1 shared components to the `pages/components/` gallery.

## Final sweep (once, over all 25 pages)

- [ ] Build, lint and tests clean; no new warnings
- [ ] Four states reachable on every new page via each service's `fail` flag
- [ ] 320 / 768 / 1024 / 1440 — no horizontal page scroll
- [ ] Keyboard: skip link, tab order, radiogroups, every dialog and slide-over traps + Esc + focus return
- [ ] Greyscale screenshot pass — no status readable by colour alone
- [ ] `prefers-reduced-motion` stops skeleton pulse and panel transitions
- [ ] Cross-page contracts (plan §4) — no figure disagrees between owner and readers
- [ ] All 24 sidebar rows resolve; no stub template remains
- [ ] Audit docs 12 and 13 against their specs for anything the newer pages surfaced
