/**
 * How this page spells its numbers.
 *
 * One module rather than a helper per region, because the same figure is
 * printed in several places at once — the worst case's CEP appears on its card,
 * on the severity chart, in that chart's tabular alternative and again on the
 * library row it is saved to — and every one of them has to read the same. A
 * second spelling of `−2.4% RWA` anywhere on the page would be a way for them
 * to disagree.
 *
 * Three conventions worth stating:
 *
 * - The minus sign is U+2212, not a hyphen: it is the width of a digit, so
 *   columns of `tabular-nums` line up, and a screen reader says "minus".
 * - A **unit belongs to the figure it was computed with**, never to the toolbar.
 *   `measureValue` therefore takes the unit as an argument and every caller
 *   passes the `unit` carried on the result object, so a stale card keeps
 *   saying `% RWA` while the selector above it reads `Asset values`.
 * - A factor's *shock* and a factor's *last observation* are different
 *   quantities and are spelled differently: a shock is signed, because its
 *   direction is the whole content of a scenario, and a level is not.
 */

import type { FactorUnit, RiskFactorRow } from '../../../models/stress-testing.model';

/** U+2212 MINUS SIGN. A hyphen is narrower than a digit and reads as a dash. */
export const MINUS = '−';

/** Not applicable — never an empty cell. */
export const NOT_APPLICABLE = '—';

/**
 * `+4.2`, `−6.6`, `+0.0` — a signed figure at a fixed precision.
 *
 * Rounded before the sign is chosen, so a value of −0.04 at one decimal prints
 * `+0.0` rather than `−0.0`: a scenario that moves nothing has no direction.
 */
export function signed(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  const magnitude = Math.abs(rounded).toFixed(decimals);
  return rounded < 0 ? `${MINUS}${magnitude}` : `+${magnitude}`;
}

/**
 * The same minus sign in a label the service composed.
 *
 * `ScenarioResult.label` and `SavedScenario.name` are built upstream from
 * `toFixed`, so a negative shock arrives spelled with an ASCII hyphen while
 * every figure this page formats uses U+2212. This is display normalisation and
 * nothing else: it rewrites a hyphen only where one stands directly in front of
 * a digit, so hyphenated words and `Ell_k` are untouched, and it is applied to
 * the card title and the library row together so the two cannot disagree.
 */
export function normaliseMinus(label: string): string {
  return label.replace(/-(?=\d)/g, MINUS);
}

/** `5.00` — a Mahalanobis distance, always to two places. */
export function mahaLabel(value: number): string {
  return value.toFixed(2);
}

/** `5.00` — the plausibility radius, spelled exactly as `Maha` is. */
export function kLabel(value: number): string {
  return value.toFixed(2);
}

/**
 * `+4.2% RWA` — a CEP or a target level, in the unit it was computed in.
 *
 * The unit is an argument rather than a lookup on the current selector: that is
 * the whole of the review finding this page had to close.
 */
export function measureValue(value: number, unit: string): string {
  return `${signed(value, 1)}${unit}`;
}

/** `13.3% RWA` — a level that is a reading rather than a move, so unsigned. */
export function measureLevel(value: number, unit: string): string {
  return `${value.toFixed(1)}${unit}`;
}

/** `−6.6 pts` — a loss against the expected scenario, in measure points. */
export function lossPoints(value: number): string {
  return `${signed(value, 1)} pts`;
}

/** How precisely a shock in each unit is worth quoting. */
const SHOCK_DECIMALS: Record<FactorUnit, number> = { '%': 1, bp: 0, pp: 2 };

/** `−18.0%`, `+75bp`, `+0.50pp` — a factor shock, always signed. */
export function shockLabel(value: number, unit: FactorUnit): string {
  return `${signed(value, SHOCK_DECIMALS[unit])}${unit}`;
}

/**
 * `+0.3%`, `3.10%`, `142bp` — the last realised reading of a factor.
 *
 * A factor whose shock is quoted in per cent is a return, and the sign of the
 * last one matters; a factor whose shock is quoted in points is a level, and
 * `+3.10%` for a ten-year yield would read as a move rather than a rate.
 */
export function observationLabel(row: RiskFactorRow): string {
  if (row.unit === '%') return `${signed(row.lastObservation, 1)}${row.lastObservationUnit}`;
  const decimals = row.lastObservationUnit === 'bp' ? 0 : 2;
  return `${row.lastObservation.toFixed(decimals)}${row.lastObservationUnit}`;
}

/** `68.4%` — a loss contribution, or their sum. Never rescaled on the way. */
export function shareLabel(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** The same share as a chart datum: percentage points, not a fraction. */
export function sharePoints(value: number): number {
  return value * 100;
}
