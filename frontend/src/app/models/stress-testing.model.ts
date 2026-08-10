/**
 * TypeScript mirror of the `stress_testing` domain type — the forward and
 * reverse stress tests run on the optimised portfolio
 * (`docs/20 Stress Testing & Scenarios.md`).
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Four facts about the page are carried by the types rather than left to the
 * code that fills them in:
 *
 * 1. **Every result names the parameters it was computed under.** A
 *    `ScenarioResult` carries its own `k`, its own `measure` and its own
 *    `unit`, so a figure produced at k = 5.00 under Regulatory capital can
 *    never be re-labelled by a later move of the toolbar. Changing either
 *    parameter sets `stale` and nothing else: there is no automatic recompute,
 *    and the page badges the result in words until the user re-runs it.
 * 2. **The worst case sits on the boundary of `Ell_k`.** `maha` and
 *    `onBoundary` travel with the result, because `Maha(r_WC) = k` is the
 *    statement that the search used its whole plausibility budget — a
 *    "worst case" strictly inside the ellipsoid would mean the search stopped
 *    early.
 * 3. **Maximum-loss contributions do not sum to one.** `LossContribution.share`
 *    is `LC(i, r) = [CEP(μ) − CEP(μ…r_i…μ)] / [CEP(μ) − CEP(r)]` exactly as
 *    defined, never a normalised share. The residual `1 − Σ MLC` is the
 *    interaction between factors, and its **sign** is the finding: below one
 *    the joint move hurts more than the sum of the individual moves.
 * 4. **An unfixed factor is not "unset".** It is held at its conditional
 *    expected value given the fixed ones — the treatment that maximises the
 *    plausibility of the partial scenario, fixed by the method rather than
 *    chosen by the user. `RiskFactorRow.editable` is therefore always `fixed`.
 *
 * Sign conventions, once, so no field has to repeat them:
 * - `cep` is the conditional expected value of the impact measure, in that
 *   measure's own unit. Positive is a profit.
 * - `loss` is `CEP(r) − CEP(μ)`, i.e. **negative when the scenario hurts**.
 *   The wireframe prints `−3.1 pts` and `−6.6 pts`; these are those numbers.
 * - `maha` is a non-negative number of standard deviations of the multivariate
 *   move. Zero is the expected scenario itself.
 */

// --- toolbar parameters ------------------------------------------------------

/**
 * The measure the impact of a scenario is read against.
 *
 * All six of the measures a stress-testing programme may state its impact in.
 * The page's unit label is a function of this and of nothing else — a CEP
 * printed in `% NAV` under a toolbar reading `Regulatory capital / RWA` is not
 * interpretable, which is the review finding this vocabulary exists to close.
 */
export type ImpactMeasureId =
  | 'asset-values'
  | 'accounting-pnl'
  | 'economic-pnl'
  | 'regulatory-capital'
  | 'economic-capital'
  | 'liquidity-gap';

/** Wireframe order: balance sheet, the two P&Ls, then the three capital views. */
export const IMPACT_MEASURES: readonly ImpactMeasureId[] = [
  'asset-values',
  'accounting-pnl',
  'economic-pnl',
  'regulatory-capital',
  'economic-capital',
  'liquidity-gap',
];

export const IMPACT_MEASURE_LABEL: Record<ImpactMeasureId, string> = {
  'asset-values': 'Asset values',
  'accounting-pnl': 'Accounting P&L',
  'economic-pnl': 'Economic P&L',
  'regulatory-capital': 'Regulatory capital / RWA',
  'economic-capital': 'Economic capital',
  'liquidity-gap': 'Liquidity gap / funding',
};

/**
 * The unit every CEP, loss and target level is stated in, per measure.
 *
 * The page must read this rather than hard-code `% NAV`: the same scenario
 * costs a different number of points of RWA, of NAV and of the funding
 * position, and the three are not interchangeable.
 */
export const IMPACT_MEASURE_UNIT: Record<ImpactMeasureId, string> = {
  'asset-values': '% NAV',
  'accounting-pnl': '% NAV',
  'economic-pnl': '% NAV',
  'regulatory-capital': '% RWA',
  'economic-capital': '% EC',
  'liquidity-gap': '% of 30-day net outflows',
};

export const IMPACT_MEASURE_DEFINITION: Record<ImpactMeasureId, string> = {
  'asset-values': 'Mark-to-market value of the positions held, as a share of net asset value.',
  'accounting-pnl':
    'Profit and loss as it would be recognised in the accounts — realised results and the part of the revaluation that passes through them.',
  'economic-pnl':
    'Profit and loss on a full economic valuation, including the revaluation the accounts do not recognise.',
  'regulatory-capital':
    'Regulatory capital over risk-weighted assets. The scenario moves both the numerator, through losses, and the denominator, through migration.',
  'economic-capital':
    'The capital the house holds against its own measured risk, rather than the regulatory formula.',
  'liquidity-gap':
    'The funding position against the 30-day net outflow the scenario implies. A stress can leave capital intact and still close the funding gap.',
};

/** The unit a factor shock is quoted in. */
export type FactorUnit = '%' | 'bp' | 'pp';

/** Spoken form, for the screen-reader label of a shock field. */
export const FACTOR_UNIT_NAME: Record<FactorUnit, string> = {
  '%': 'percent',
  bp: 'basis points',
  pp: 'percentage points',
};

/** `k`, the Mahalanobis radius. Positive real; the whole range is meaningful. */
export const K_MIN = 0.5;
export const K_MAX = 12;
export const K_STEP = 0.05;
export const K_DEFAULT = 5;

export const K_HINT = 'higher k = more severe, less plausible';

/** How the toolbar names the admissible domain: `Ell_k = { r : Maha(r) <= k }`. */
export const ELLIPSOID_DEFINITION = 'Ell_k = { r : Maha(r) <= k }';

/** Which half of the page is on screen. The toolbar is shared by both. */
export type StressMode = 'forward' | 'reverse';

export const STRESS_MODES: readonly StressMode[] = ['forward', 'reverse'];

export const STRESS_MODE_LABEL: Record<StressMode, string> = {
  forward: 'Forward Stress Test',
  reverse: 'Reverse Stress Test',
};

export const STRESS_MODE_DEFINITION: Record<StressMode, string> = {
  forward: 'Fix the plausibility radius k, search for the worst loss inside it.',
  reverse: 'Fix the outcome, search for the least implausible scenario that produces it.',
};

// --- the systematic risk factors ---------------------------------------------

/**
 * One row of the factor table.
 *
 * `scenarioValue` is what the user typed and is only ever read when `fixed`;
 * `conditionalValue` is `E[r_i | fixed factors]`, which is what an unfixed
 * factor is held at. `effectiveValue` is the one the scenario is actually
 * evaluated at, so the page never has to decide between them.
 */
export interface RiskFactorRow {
  readonly id: string;
  /** `'FX EUR/USD'`. */
  readonly name: string;
  readonly description: string;
  /** The last realised reading, in `lastObservationUnit`. */
  readonly lastObservation: number;
  /** A level for the two rates, a return for equity and FX. */
  readonly lastObservationUnit: FactorUnit;
  /** The unit of a **shock** to this factor — what `scenarioValue` is in. */
  readonly unit: FactorUnit;
  readonly fixed: boolean;
  /** What the user typed. `null` is an empty field, not a zero shock. */
  readonly scenarioValue: number | null;
  /** `E[r_i | fixed]` — where the method puts an unfixed factor. */
  readonly conditionalValue: number;
  /** The value the current partial scenario evaluates this factor at. */
  readonly effectiveValue: number;
  /** Always equal to `fixed`: the conditional treatment is not an option. */
  readonly editable: boolean;
  /** Placeholder for the shock field — a severe but illustrative move. */
  readonly suggestedShock: number;
}

export const UNFIXED_FACTOR_NOTE =
  'Unfixed factors are held at their conditional expected value.';

export const UNFIXED_FACTOR_DETAIL =
  'Among all completions of a partial scenario, the conditional expected value is the one with the highest plausibility — Maha(r_C) = Maha(r_D). Giving an unfixed factor any other value would only make the scenario less plausible, so the treatment is fixed by the method rather than offered as a choice.';

export const CONDITIONAL_VALUE_LABEL = 'cond. E[·]';

export const NOT_EDITABLE_NOTE = 'not editable';

// --- scenario results --------------------------------------------------------

export type ScenarioKind = 'expected' | 'manual' | 'worst-case' | 'reverse';

export const SCENARIO_KIND_LABEL: Record<ScenarioKind, string> = {
  expected: 'Expected (μ)',
  manual: 'Manual',
  'worst-case': 'Worst case',
  reverse: 'Reverse',
};

/** Word and glyph together — a scenario type must read in greyscale. */
export const SCENARIO_KIND_ICON: Record<ScenarioKind, string> = {
  expected: '·',
  manual: '✎',
  'worst-case': '▼',
  reverse: '↩',
};

/** One factor inside a scenario, at the value that scenario gives it. */
export interface ScenarioFactorValue {
  readonly factorId: string;
  readonly name: string;
  readonly value: number;
  readonly unit: FactorUnit;
  /** The user pinned this one. A search result pins nothing. */
  readonly fixed: boolean;
  /** Not pinned, so it sits at its conditional expected value. */
  readonly conditional: boolean;
  /** Carries at least `KEY_FACTOR_SHARE` of the scenario's loss. */
  readonly driver: boolean;
}

/**
 * One evaluated scenario — expected, manual or worst case, one shape for all
 * three so the summary grid and the severity chart read a single type.
 *
 * `stale` is the page's central state: it is set by the toolbar's parameter
 * writers and cleared only by a re-run. Nothing recomputes on its own.
 */
export interface ScenarioResult {
  readonly kind: ScenarioKind;
  /** `'Worst-case scenario — Ell_k, k = 5.00'`. */
  readonly label: string;
  /** `Maha(r)`. Zero for the expected scenario. */
  readonly maha: number;
  /** `CEP(r)`, in `unit`. */
  readonly cep: number;
  /** `CEP(r) − CEP(μ)`. Negative when the scenario hurts. Zero for expected. */
  readonly loss: number;
  /** The measure in force when this was computed — not the one on screen now. */
  readonly measure: ImpactMeasureId;
  /** `IMPACT_MEASURE_UNIT[measure]`, carried so a stale card keeps its unit. */
  readonly unit: string;
  /** The radius in force when this was computed. */
  readonly k: number;
  /** `Maha(r) = k` — the search used its whole plausibility budget. */
  readonly onBoundary: boolean;
  /** `Maha(r) ≤ k`. False for a hand-picked scenario outside the domain. */
  readonly withinEllipsoid: boolean;
  readonly factors: readonly ScenarioFactorValue[];
  /** `'2026-07-31 09:07 UTC'`. */
  readonly computedAt: string;
  /** A toolbar parameter moved after this was computed. Re-run to clear. */
  readonly stale: boolean;
}

/**
 * One bar of the severity comparison.
 *
 * The comparison only means anything at one and the same radius, which is why
 * `k` travels on the bar rather than being read off the toolbar: after a
 * parameter moves and one result is re-run, the bars no longer agree on it, and
 * a figure captioned with the radius currently in the toolbar would be stating
 * something about the bars that is not true of them. Same argument as `unit`.
 */
export interface SeverityBar {
  readonly kind: ScenarioKind;
  readonly label: string;
  readonly cep: number;
  readonly unit: string;
  /** The radius this bar was computed at — not the one on screen now. */
  readonly k: number;
  /** `'Maximum Loss'` on the worst-case bar; null elsewhere. */
  readonly annotation: string | null;
  readonly stale: boolean;
}

// --- maximum loss contributions ----------------------------------------------

/** A factor is a key risk factor once it carries this much of the loss. */
export const KEY_FACTOR_SHARE = 0.1;

/**
 * `LC(i, r)` for the worst-case scenario — the maximum loss contribution.
 *
 * `individualLoss` is the loss the portfolio would take if **only** this factor
 * moved to its worst-case value, and `share` is that loss over the loss of the
 * whole move. The shares are reported exactly as computed: rescaling them to
 * 100% would erase the interaction, which is the one thing this chart is for.
 */
export interface LossContribution {
  readonly factorId: string;
  readonly name: string;
  /** The factor's value in the worst-case scenario. */
  readonly value: number;
  readonly unit: FactorUnit;
  /** `CEP(μ) − CEP(μ…r_i…μ)` in measure points. Negative if the move helps. */
  readonly individualLoss: number;
  /** `LC(i, r_WC)`. Not normalised; may be negative. */
  readonly share: number;
  readonly driver: boolean;
}

/** The sign of `Σ MLC − 1`, which is the sign of the factor interaction. */
export type FactorInteraction = 'negative' | 'positive' | 'none';

export const FACTOR_INTERACTION_LABEL: Record<FactorInteraction, string> = {
  negative: 'negative interaction',
  positive: 'positive interaction',
  none: 'no interaction',
};

/** Word and glyph — the sign is never left to the length of a bar alone. */
export const FACTOR_INTERACTION_ICON: Record<FactorInteraction, string> = {
  negative: '↓',
  positive: '↑',
  none: '=',
};

export const FACTOR_INTERACTION_NOTE: Record<FactorInteraction, string> = {
  negative:
    'Σ MLC is below 100% — the interaction between factors is negative: the loss from the simultaneous move is larger than the sum of the losses each factor would cause alone. This is the dangerous case: reading the factors one at a time understates the damage.',
  positive:
    'Σ MLC is above 100% — the interaction between factors is positive: the loss from the simultaneous move is smaller than the sum of the losses each factor would cause alone.',
  none: 'Σ MLC is 100% — the CEP is additive in the factors over this move and the interaction vanishes.',
};

// --- the scenario library ----------------------------------------------------

/** The library's type filter. `'all'` is the default. */
export type LibraryFilter = 'all' | 'manual' | 'worst-case' | 'reverse';

export const LIBRARY_FILTERS: readonly LibraryFilter[] = [
  'all',
  'manual',
  'worst-case',
  'reverse',
];

export const LIBRARY_FILTER_LABEL: Record<LibraryFilter, string> = {
  all: 'All types',
  manual: 'Manual',
  'worst-case': 'Worst case',
  reverse: 'Reverse',
};

/** A fixed factor value, as stored on a saved row so `Load` can restore it. */
export interface SavedFactorValue {
  readonly factorId: string;
  readonly value: number;
}

/**
 * One row of the scenario library.
 *
 * A saved row stores the parameters as well as the figures, because a scenario
 * only means anything alongside the k and the measure it was run at. `Load`
 * restores those parameters and re-derives the result from them, so a row can
 * never show a figure the current model would not reproduce.
 *
 * `cep` and `loss` are null on a reverse row: a reverse test reports the
 * plausibility needed to reach an outcome, not a profit — the page prints the
 * outcome's short label and an em dash.
 */
export interface SavedScenario {
  readonly id: string;
  readonly name: string;
  readonly kind: Exclude<ScenarioKind, 'expected'>;
  readonly k: number;
  readonly maha: number;
  readonly measure: ImpactMeasureId;
  readonly unit: string;
  readonly cep: number | null;
  readonly loss: number | null;
  /** `'2026-07-30'`. */
  readonly runAt: string;
  readonly fixed: readonly SavedFactorValue[];
  readonly reverse: SavedReverseTarget | null;
}

export interface SavedReverseTarget {
  readonly outcome: ReverseOutcomeId;
  readonly targetLevel: number;
}

// --- the reverse stress test -------------------------------------------------

/** The stress outcome a reverse test starts from. */
export type ReverseOutcomeId = 'capital-ratio-breach' | 'illiquidity' | 'insolvency';

export const REVERSE_OUTCOMES: readonly ReverseOutcomeId[] = [
  'capital-ratio-breach',
  'illiquidity',
  'insolvency',
];

export const REVERSE_OUTCOME_LABEL: Record<ReverseOutcomeId, string> = {
  'capital-ratio-breach': 'Regulatory capital ratio breach',
  illiquidity: 'Illiquidity',
  insolvency: 'Insolvency',
};

/** For the library's Name column — `'Reverse: cap. br.'`. */
export const REVERSE_OUTCOME_SHORT_LABEL: Record<ReverseOutcomeId, string> = {
  'capital-ratio-breach': 'cap. br.',
  illiquidity: 'illiq.',
  insolvency: 'insolv.',
};

/** For the library's CEP column, where a reverse row reports an outcome. */
export const REVERSE_OUTCOME_RESULT_LABEL: Record<ReverseOutcomeId, string> = {
  'capital-ratio-breach': 'breach',
  illiquidity: 'illiquid',
  insolvency: 'insolvent',
};

export const REVERSE_OUTCOME_DEFINITION: Record<ReverseOutcomeId, string> = {
  'capital-ratio-breach':
    'The capital ratio falls to the regulatory minimum. The house is still solvent and still funded, but the buffer is gone.',
  illiquidity:
    'The funding position closes: obligations coming due can no longer be met from available liquidity, whatever the balance sheet says.',
  insolvency: 'Losses exhaust the capital base outright — the survival scenario.',
};

/** One factor of the scenario a reverse search implies. */
export interface ImpliedFactorMove {
  readonly factorId: string;
  readonly name: string;
  readonly value: number;
  readonly unit: FactorUnit;
  /** Carries at least `KEY_FACTOR_SHARE` of the loss that reaches the target. */
  readonly driver: boolean;
}

/**
 * What a reverse search reports.
 *
 * `minimalMaha` is the plausibility the outcome costs: no scenario closer to
 * the centre of the distribution reaches `targetLevel`, and the admissible
 * domain must therefore be widened to at least `k ≥ minimalMaha` before a
 * forward search at this radius would find it.
 */
export interface ReverseResult {
  readonly outcome: ReverseOutcomeId;
  /** The level asked for, in `unit`. */
  readonly targetLevel: number;
  /** Where the outcome's metric stands today, in `unit`. */
  readonly currentLevel: number;
  /** `currentLevel − targetLevel`, in measure points. Always positive. */
  readonly requiredLoss: number;
  /** The least implausible scenario that reaches the target. */
  readonly minimalMaha: number;
  readonly measure: ImpactMeasureId;
  readonly unit: string;
  /** The toolbar's k when the search ran, for the `k ≥ minimalMaha` reading. */
  readonly k: number;
  /** True when the outcome is already reachable inside the current `Ell_k`. */
  readonly withinCurrentRadius: boolean;
  readonly scenario: readonly ImpliedFactorMove[];
  readonly computedAt: string;
  readonly stale: boolean;
}

/** Past this radius a scenario stops being an argument anyone can act on. */
export const REVERSE_MAX_MAHA = K_MAX;

// --- states, errors and copy -------------------------------------------------

/** Which search is in flight, and which section an error belongs above. */
export type StressAction = 'manual' | 'worst-case' | 'reverse';

export const STRESS_ACTION_LABEL: Record<StressAction, string> = {
  manual: 'Evaluate manual scenario',
  'worst-case': 'Run worst-case search',
  reverse: 'Search minimal-plausibility scenario',
};

/** An inline `ErrorState`, rendered above the section that raised it. */
export interface StressError {
  readonly section: StressAction;
  readonly message: string;
  readonly detail: string;
}

/**
 * The fixed factors already sit outside `Ell_k`, so the constrained search has
 * no admissible point at all. An expected outcome of the exercise, not a fault.
 */
export const INFEASIBLE_MESSAGE = 'Search did not converge within Ell_k.';

export const INFEASIBLE_DETAIL =
  'The factors fixed by hand are already less plausible than the radius allows, so no admissible scenario agrees with them. Reduce the fixed constraints or raise the plausibility radius k.';

export const SEARCH_FAILED_MESSAGE = 'The worst-case search did not converge.';

export const SEARCH_FAILED_DETAIL =
  'The optimisation over Ell_k stopped without reaching a stationary point. Retry, or move the plausibility radius and run it again.';

export const EVALUATION_FAILED_MESSAGE = 'The manual scenario could not be evaluated.';

export const EVALUATION_FAILED_DETAIL =
  'The conditional distribution given the fixed factors could not be formed. Retry, or change which factors are fixed.';

export const REVERSE_FAILED_MESSAGE = 'The reverse search did not converge.';

export const REVERSE_FAILED_DETAIL =
  'No scenario reaching the target outcome was found. Retry, or restate the target level.';

export const REVERSE_UNREACHABLE_MESSAGE =
  'The target outcome is not reachable within a plausible radius.';

export const REVERSE_UNREACHABLE_DETAIL = `Reaching it would take a move beyond Maha ${REVERSE_MAX_MAHA.toFixed(
  2,
)}, which is too implausible to argue from. Raise the target level, or read the result as: this outcome is not a stress scenario, it is a different institution.`;

export const REVERSE_TARGET_ABOVE_CURRENT_MESSAGE =
  'The target level is at or above the current reading.';

export const REVERSE_TARGET_ABOVE_CURRENT_DETAIL =
  'A reverse test asks what it would take to fall to a level; this target has already been reached, so no scenario is needed. Enter a level below the current one.';

/** The badge a result carries once a toolbar parameter has moved under it. */
export const STALE_RESULT_BADGE = 'Result not up to date';

export const STALE_RESULT_NOTE =
  'A toolbar parameter changed after this was computed. Nothing is recomputed automatically — re-run the search to bring it up to date.';

export const EMPTY_FORWARD_MESSAGE = 'No scenario evaluated yet.';

export const EMPTY_FORWARD_DETAIL =
  'Fix at least one factor and evaluate a manual scenario, or run the worst-case search over the current Ell_k.';

export const EMPTY_REVERSE_MESSAGE = 'No reverse search run yet.';

export const EMPTY_REVERSE_DETAIL =
  'Choose a target outcome and a target level, then search for the least implausible scenario that reaches it.';

export const EMPTY_LIBRARY_MESSAGE = 'No scenarios saved.';

export const EMPTY_LIBRARY_DETAIL =
  'Saving a manual, worst-case or reverse result keeps it here with the k and the impact measure it was run at.';

export const DELETE_SCENARIO_TITLE = 'Delete this scenario?';

export const DELETE_SCENARIO_MESSAGE =
  'The saved row is removed from the library. The scenario itself can be run again from the same parameters.';

/** What the `Details` link on the MLC chart opens. */
export const LOSS_CONTRIBUTION_NOTE =
  'LC(i, r) is the loss the portfolio would take if only factor i moved to its scenario value, as a share of the loss of the whole move. The shares are shown exactly as computed and are not rescaled to 100%.';

/** Restates the boundary property; never redefines it. */
export const BOUNDARY_NOTE =
  'The worst case sits exactly on the boundary of Ell_k: Maha(r_WC) = k. A point strictly inside would mean the search left plausibility budget unspent.';

export const OUTSIDE_ELLIPSOID_NOTE =
  'This hand-picked scenario is less plausible than the current radius admits — Maha(r) is above k, so it lies outside Ell_k and no worst-case search at this radius would consider it.';
