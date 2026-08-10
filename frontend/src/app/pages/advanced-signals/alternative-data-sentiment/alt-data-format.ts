/**
 * How this page spells its numbers.
 *
 * One module rather than a helper per region, because the same quantity is
 * printed in several places at once — a signal's coverage appears on its grid
 * card, in the detail panel's eyebrow and in its accessible label — and a
 * second spelling of `74%` anywhere would be a way for them to disagree.
 *
 * Every negative sign is U+2212 MINUS SIGN rather than a hyphen: a hyphen is
 * narrower than a digit, so a column of `tabular-nums` stops lining up, and a
 * screen reader reads it as a dash rather than as "minus".
 */

/** U+2212 MINUS SIGN. */
export const MINUS = '−';

/** Not applicable. Never an empty cell. */
export const NOT_APPLICABLE = '—';

/** `toFixed` emits a hyphen-minus; every figure on the page wants the real one. */
function fixMinus(text: string): string {
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

function plus(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

/** `74%` — coverage, which the wireframe prints whole. */
export function percent0(value: number): string {
  return fixMinus(`${Math.round(value)}%`);
}

/** `0.40%` — an out-of-sample R², monthly, which two places do not flatter. */
export function percent2(value: number): string {
  return fixMinus(`${value.toFixed(2)}%`);
}

/** `+0.42%` — a conditional decile return, whose sign is the finding. */
export function signedPercent2(value: number): string {
  return plus(value, percent2(value));
}

/** `−8.1 bp` — a shock response. */
export function signedBasisPoints(value: number): string {
  return plus(value, fixMinus(`${value.toFixed(1)} bp`));
}

/** `−2.64` — a t-statistic, always to two places. */
export function tStatLabel(value: number): string {
  return fixMinus(value.toFixed(2));
}

/** `0.011` — a p-value, at the three places the significance is read from. */
export function pValueLabel(value: number): string {
  return value.toFixed(3);
}

/** `0.021` — an information coefficient. */
export function icLabel(value: number): string {
  return fixMinus(value.toFixed(3));
}

/** `1.35` — an annualised Sharpe ratio. */
export function sharpeLabel(value: number): string {
  return fixMinus(value.toFixed(2));
}

/** `−0.283` — a loading on a principal component. */
export function loadingLabel(value: number): string {
  return fixMinus(value.toFixed(3));
}

/** `D1` … `D10`. */
export function decileLabel(decile: number): string {
  return `D${decile}`;
}
