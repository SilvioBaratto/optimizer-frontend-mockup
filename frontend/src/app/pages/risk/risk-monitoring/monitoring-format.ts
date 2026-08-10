/**
 * How this page spells its numbers.
 *
 * One module rather than a helper per region, because the same figure is
 * printed in four places at once — the drawdown card, the underwater chart, its
 * tabular alternative and the threshold table all show `D(x,t)` — and the units
 * toggle has to move every one of them in step. A second spelling of `6.1%`
 * anywhere on the page would be a way for them to disagree.
 *
 * Two conventions worth stating:
 *
 * - Drawdowns are held as non-negative magnitudes, as `D(x,t)` is defined. The
 *   minus sign is added *here*, at the point of rendering, with U+2212 rather
 *   than a hyphen so it lines up with the digits and is read as "minus".
 * - The absolute reading is `percent/100 × C`, already carried on every
 *   drawdown-bearing shape. These functions choose which of the two fields to
 *   print; they never convert one into the other.
 */

import { type DrawdownUnits } from '../../../models/risk-monitoring.model';

/** U+2212 MINUS SIGN. A hyphen is narrower than a digit and reads as a dash. */
export const MINUS = '−';

/** `6.1%` — drawdowns, limits and utilisation-adjacent figures. */
export function percent1(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** `3.42%` — VaR and CVaR, which the wireframe prints to the basis point. */
export function percent2(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** `€15.3m` — the same fall stated against the capital base. */
export function moneyM(value: number): string {
  return `€${value.toFixed(1)}m`;
}

/** The reading the units toggle currently asks for, unsigned. */
export function drawdownValue(percent: number, abs: number, units: DrawdownUnits): string {
  return units === 'abs' ? moneyM(abs) : percent1(percent);
}

/** The same reading as a fall: `−6.1%` or `−€15.3m`. */
export function signedDrawdown(percent: number, abs: number, units: DrawdownUnits): string {
  return `${MINUS}${drawdownValue(percent, abs, units)}`;
}

/**
 * `61%` — utilisation of a limit.
 *
 * Unit-free by construction: it is a ratio of two numbers measured on the same
 * base, so it reads the same whichever way the units toggle is set.
 */
export function utilisationLabel(value: number): string {
  return `${Math.round(value)}%`;
}

/** `0.95` — α, always to two places, so the slider's readout never twitches. */
export function alphaLabel(alpha: number): string {
  return alpha.toFixed(2);
}

/** `Δ_0.95(x)`, the way the threshold table and the CDaR readout both name it. */
export function deltaLabel(alpha: number): string {
  return `Δ_${alphaLabel(alpha)}(x)`;
}

/** The word after a drawdown figure, as the wireframe prints it. */
export const DRAWDOWN_UNITS_SUFFIX: Record<DrawdownUnits, string> = {
  rel: 'rel.',
  abs: 'abs.',
};

/**
 * Axis and table formatter for a chart drawn below the zero line.
 *
 * The underwater chart plots `−D(x,t)`, so its own values arrive negative and
 * the sign has to survive into the tick labels and into the "View as table"
 * cells — which `ChartPanel` builds with this very function.
 */
export function negativeDrawdownFormatter(units: DrawdownUnits): (value: number) => string {
  return (value) => {
    const magnitude = units === 'abs' ? moneyM(Math.abs(value)) : percent1(Math.abs(value));
    return value < 0 ? `${MINUS}${magnitude}` : magnitude;
  };
}
