/**
 * How this page spells its numbers.
 *
 * One module rather than a helper per region, because the same quantity is
 * printed in several places at once — the turbulence score appears on its card,
 * in the chart's reference point, in the chart's tabular alternative and in the
 * accessible summary — and a second spelling of `2.31` anywhere would be a way
 * for those four to disagree.
 *
 * Two conventions worth stating:
 *
 * - The minus sign is U+2212, never a hyphen: it is the width of a digit, so a
 *   column of `tabular-nums` stays aligned, and a screen reader says "minus".
 * - The chart formatters are module constants, not arrow functions built in a
 *   `computed`. `ValueFormatter` is an input on every chart component; a fresh
 *   arrow on each render would rebuild the ECharts option for nothing.
 */

import type { ValueFormatter } from '../../../shared/charts';

/** U+2212 MINUS SIGN. */
export const MINUS = '−';

function withMinus(text: string): string {
  return text.replace('-', MINUS);
}

/** `2.31`, `−0.86` — a fixed-point figure with a real minus sign. */
export function fixed(value: number, digits: number): string {
  return withMinus(value.toFixed(digits));
}

/** `+1.2` / `−0.4`. The sign is part of the reading and is never dropped. */
export function signed(value: number, digits: number): string {
  return `${value >= 0 ? '+' : MINUS}${Math.abs(value).toFixed(digits)}`;
}

/** `+1.2σ` — a standardised shift. */
export function sigma(value: number, digits = 1): string {
  return `${signed(value, digits)}σ`;
}

/** `+9pp` — a change in a share, in percentage points. */
export function points(value: number, digits = 0): string {
  return `${signed(value * 100, digits)}pp`;
}

/** `2.31` — turbulence, its two components, ρ, λ and the eigen readings. */
export const score: ValueFormatter = (value) => fixed(value, 2);

/** `8.3` — the effective rank and the participation ratio. */
export const oneDecimal: ValueFormatter = (value) => fixed(value, 1);

/** `52%` from a share in [0,1]. */
export const sharePercent: ValueFormatter = (value) => `${withMinus((value * 100).toFixed(0))}%`;

/** `19.0%` from a share in [0,1] — the contribution columns. */
export const shareTenth: ValueFormatter = (value) => `${withMinus((value * 100).toFixed(1))}%`;

/** `7` — a count of observations in a histogram bin. */
export const wholeNumber: ValueFormatter = (value) => String(Math.round(value));

/** `0.312` — an eigenvector loading, which is small and signed. */
export const loading: ValueFormatter = (value) => fixed(value, 3);
