# Build conventions — read this before writing any page

Contract for the twelve pages of docs 14–25. `tasks/plan.md` has the phase order and the
cross-page data contracts; this file is the how.

---

## 1. Angular rules (the linter enforces most of them)

- Standalone components. **Never write `standalone: true`** — it is the default and lint rejects it.
- `ChangeDetectionStrategy.OnPush` on every component.
- `input()` / `output()` / `model()` functions, never decorators. `inject()`, never constructor injection.
- Native control flow `@if` / `@for` / `@switch`. Never `*ngIf` / `*ngFor`.
- `class` / `style` bindings. Never `ngClass` / `ngStyle`.
- No `@HostBinding` / `@HostListener` — use the decorator's `host` object.
- Signals for state, `computed()` for derived state. Never copy signal→signal in an `effect()`.
- Component selectors: `app-kebab-case`. Attribute directives: `[appCamelCase]`. Lint enforces both.
- Give every component a host display: `host: { class: 'block' }` or `'flex flex-col gap-6'`.
  A custom element defaults to `display: inline`, which breaks `.surface-card`'s negative
  inline margin and makes `position: sticky` a no-op.

## 2. Files

```
pages/<section>/<page>/
  <page>.ts / .html / .css        page component; host: { class: 'flex flex-col gap-6' }
  <region>/<region>.ts / .html    one folder per region that owns state or exceeds ~80 template lines
models/<name>.model.ts            interfaces + const label/glyph maps. No logic.
services/<name>.service.ts        @Injectable({ providedIn: 'root' }), signal-backed
```

Exemplars to imitate, in order of usefulness:
`pages/fund/macro-agent/` (tabs, 7 region sub-components) · `pages/results/backtest-validation/` ·
`services/macro-regime.service.ts` · `models/fund-state.model.ts` ·
`pages/results/results-frontier/risk-contribution-table/risk-contribution-table.html` (the table idiom).

**The shell renders the `<h1>` and the breadcrumb from the route.** Page templates start at `<h2>`.
Routes and sidebar rows for all 25 pages already exist — do not touch `*.routes.ts` or `nav-config.ts`.

## 3. The shared kit — reuse, never re-invent

| Spec region | Component | Import from `shared/…` |
|---|---|---|
| `Toolbar`, sticky header | `<app-page-context-bar [compact] [heading] [layout]>` | `page-context-bar/page-context-bar` |
| `KeyMetricsRow` | `<app-key-metrics-row [metrics]>` + projected slot | `key-metrics-row/key-metrics-row` |
| `InfoCard` | `<app-info-card [title]>`, or project `<h3 appCardTitle>` for markup titles | `info-card/info-card` |
| `HeroStatCard` | `<app-hero-stat-card [title] [eyebrow]>` | `hero-stat-card/hero-stat-card` |
| `SectionCardGrid` / `SectionLabel` | `<app-section-card-grid [label] [columns] [ordered]>` | `section-card-grid/section-card-grid` |
| `EntityCard` | `<app-entity-card [title] [meta] [route] [selectable] [current] (selected)>` | `entity-card/entity-card` |
| `StatusBadge` | `<app-status-badge [label] [tone]>` | `status-badge/status-badge` |
| `StatusBanner` | `<app-status-banner [variant] [message] [timestamp] (dismissed) (retried)>` | `status-banner/status-banner` |
| `FilterChipBar` | `<app-filter-chip-bar [searchLabel] [searchPlaceholder] [searchValue] (searchChange) [count] [total] [countNoun] [summary]>` + projected controls | `filter-chip-bar/filter-chip-bar` |
| `CollectionStatBar` | `<app-collection-stat-bar [parts]>` | `collection-stat-bar/collection-stat-bar` |
| `EventLogPanel` | `<app-event-log-panel [entries] [label] [collapsible] [(expanded)] (entrySelected) [emptyMessage]>` + projected actions | `event-log-panel/event-log-panel` |
| radiogroup / segmented control | `<app-segmented-control [options] [value] [label] (valueChange)>` | `segmented-control/segmented-control` |
| `ActionButtonRow` | `<app-action-button-row [align]>` | `action-button-row/action-button-row` |
| `CrossPageLink` | `<app-cross-page-link [label] [route] [emphasis]>` | `cross-page-link/cross-page-link` |
| `RefreshControl` | `<app-refresh-control [label] [busy] (refresh)>` | `refresh-control/refresh-control` |
| `EmptyState` / `ErrorState` / `RetryButton` | `<app-empty-state [title] [detail]>` / `<app-error-state [message] [detail] [cause] (retry)>` / `<app-retry-button>` | `empty-state/` `error-state/` `retry-button/` |
| `SkeletonBlock` | `<app-skeleton-block [height] [width] [lines]>` | `skeleton-block/skeleton-block` |
| `DetailPanel — slide-over` | `<app-slide-over>` | `ui/slide-over/slide-over` |
| confirmation | `<app-confirm-dialog [open] [title] [message] [confirmLabel] [destructive] (confirmed) (cancelled)>` | `confirm-dialog/confirm-dialog` |
| `Pagination` | `<ui-pagination>` | `ui/pagination/pagination` |
| `TabBar` | `ui-tabs` / `ui-tab` / `ui-tab-panel`, **or** the roving tablist in `pages/fund/macro-agent/macro-agent.html:96-131` when the tab must live in the URL | `ui/tabs/tabs` |
| charts | `ChartPanelComponent`, `Line/Bar/Scatter/Frontier/Histogram/BulletChartComponent` | `charts` (barrel) |
| math symbols | `<app-math-var [expr] [label]>` | `math/math-var` |
| buttons / selects | `appButton="primary\|secondary\|ghost\|danger\|danger-outline"` + `size`, `appSelect` | `ui/button/button.directive`, `ui/select/select.directive` |

Exported shapes:

```ts
type StatusTone = 'neutral' | 'ok' | 'warn' | 'alert' | 'active' | 'pending';
interface KeyMetric { label: string; value: string; note?: string; badge?: { label: string; tone: StatusTone } }
interface SegmentedOption { value: string; label: string; disabled?: boolean; disabledReason?: string }
interface LogEntry { readonly id: string; readonly at: string; readonly text: string; readonly detail?: string }
```

## 4. Tables are hand-rolled, not a component

`ui-table` takes `Record<string, unknown>` cells and cannot express alignment, sortable headers or a
totals row. **Do not use it.** Copy the idiom from
`pages/results/results-frontier/risk-contribution-table/risk-contribution-table.html`:

```html
<div class="table-scroll">
  <table class="w-full min-w-3xl text-sm">
    <caption class="sr-only">What this table shows, in a sentence.</caption>
    <thead><tr class="table-head-row">
      <th scope="col" class="px-4 py-2 text-left font-medium">Component</th>
      <th scope="col" class="px-2 py-2 text-right font-medium">Weight</th>
    </tr></thead>
    <tbody>
      <tr class="table-row">
        <th scope="row" class="px-4 py-1.5 text-left font-normal">AAPL</th>
        <td class="px-2 py-1.5 text-right tabular-nums">8.2%</td>
      </tr>
    </tbody>
  </table>
</div>
```

`.table-scroll`, `.table-head-row`, `.table-row` live in `src/styles.css`. Numbers are right-aligned
and `tabular-nums`. Not-applicable is `—`, never an empty cell.

**Sortable headers** — docs 15, 19 and 24 require them:

```html
<th scope="col" [attr.aria-sort]="sortKey() === 'weight' ? (ascending() ? 'ascending' : 'descending') : 'none'"
    class="px-2 py-2 text-right font-medium">
  <button type="button" class="min-h-11" (click)="toggleSort('weight')">Weight</button>
</th>
```

## 5. Charts

`<app-chart-panel>` already supplies the **"View as table"** toggle whenever `[table]` is bound with a
`ChartTable`. Almost every spec demands that alternative — bind it, never hand-roll a second table
beside the chart.

- `CategorySeries.pattern: true` renders a hatched fill meaning **"not measured"**, distinct from
  zero. Docs 22 (Size Premium's Recovery row) and 23 (market timing has no out-of-sample IR) both
  need exactly this.
- `RefLine` / `RefBand` / `RefPoint` cover threshold lines, outlier bands and "current reading"
  markers. Doc 25 needs all three.
- `data: (number | null)[]` — `null` renders as a gap, not zero.

## 6. Services

`@Injectable({ providedIn: 'root' })`, signal-backed, deterministic mock data as module constants.
Model on `services/macro-regime.service.ts`. **No HTTP** — `HttpClient` is wired nowhere but
`services/chat.ts`.

Every service exposes:
- the data as readonly signals
- a state signal: `'empty' | 'loading' | 'ready' | 'error'`
- the toolbar parameter signals the page writes
- `async refresh(fail = false)` / `recompute(fail = false)` with `await delay(LATENCY_MS)` so the
  loading state the spec mandates is actually reachable, and a `fail` flag so the error state is too
  (precedent: `FundService.load(fail)`)
- `clearError()`

Derive, never duplicate. Two signals holding the same quantity will drift; use `computed()`.

## 7. Models

Interfaces plus `const` maps. Status vocabularies pair a **word and a glyph**, per
`models/fund-state.model.ts`:

```ts
export type NodeStatus = 'pending' | 'running' | 'done' | 'failed';
export const NODE_STATUS_LABEL: Record<NodeStatus, string> = { … };
export const NODE_STATUS_ICON: Record<NodeStatus, string> = { pending: '○', running: '●', done: '✓', failed: '✗' };
```

## 8. Accessibility is the acceptance criteria

Each doc's `### Accessibilità` section is normative. The invariant subset:

- Headings start at `<h2>`, no skipped levels.
- **No information in colour alone.** Every status pairs an icon or a word with the colour.
- Loading = `SkeletonBlock` at the final content's height, container `aria-busy="true"`. Never a
  spinner for content.
- Empty = icon + title + one explanatory line + an action.
- Error = message + recovery action. `role="alert"` for an action failure, `role="status"` for a
  load failure.
- Charts expose the tabular alternative and an `ariaLabel` summarising the current reading.
- Slide-overs and dialogs trap focus, close on Esc, and **return focus to the opener**.
- Destructive actions never fire on first click — `app-confirm-dialog`, initial focus on Cancel.
- Tap targets ≥ 44px (`min-h-11`).
- 320 / 768 / 1024 / 1440px with no horizontal **page** scroll. Wide tables scroll inside
  `.table-scroll`.
- Design tokens only — `text-text`, `text-text-secondary`, `bg-surface`, `bg-surface-raised`,
  `bg-surface-inset`, `border-border`, `border-border-control`, `text-primary`. Never a raw hex.
- Tailwind v4 scans source for literal class strings: an interpolated `` `lg:grid-cols-${n}` `` is
  invisible and its rule is silently never emitted. Write classes out in full.

## 9. Testing

TDD: the spec file comes first and must fail for the right reason before you implement.

- Layout follows `shared/ui/pagination/pagination.spec.ts`.
- Names read "when \<situation\>, \<expected outcome\>".
- Test **behaviour through the DOM** — `host.querySelector`, real `KeyboardEvent`s — never a signal
  the component owns. A test that would still pass with the feature deleted is worse than none.
- A spec rendering `<lucide-icon>` needs `providers: [ICON_PROVIDER]` from `app/icons`.
- Service invariants stated in a doc get their own unit test (e.g. doc 18's `VaR ≤ CVaR`,
  doc 19's Euler contributions summing to EC).

Commands, all of which must be clean before reporting done:

```
cd frontend && npm run typecheck && npm run lint && npm run test:ci
```

The baseline is 100% green, so any failure is yours.

## 10. Lane discipline

- Create only the files your task lists. Other agents work concurrently in other folders.
- **Never run any git command.** The orchestrator commits.
- Do not edit shared files outside your folder. If you think you must, say so in your report instead.
- The docs' `## Fondamenti di dominio` sections are background, not UI. Only `### Wireframe`,
  `### Regioni`, `### Campi e controlli`, `### Stati`, `### Interazioni` and `### Accessibilità`
  are buildable.
