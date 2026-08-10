/**
 * How this page spells its numbers.
 *
 * One module rather than a helper per region, because the same quantity is
 * printed in several places at once — the dominant state's probability appears
 * in the hero card, in the bridge card's "derived from" line and in the
 * diagnostics footer — and a second spelling of `58%` anywhere would be a way
 * for them to disagree.
 *
 * Every negative sign is U+2212 MINUS SIGN rather than a hyphen: a hyphen is
 * narrower than a digit, so a column of `tabular-nums` stops lining up, and a
 * screen reader reads it as a dash rather than as "minus".
 */

import {
  CORRELATION_NOTE_LABEL,
  type CorrelationCell,
} from '../../../models/market-regimes.model';

/** U+2212 MINUS SIGN. */
export const MINUS = '−';

/** `toFixed` emits a hyphen-minus; every figure on the page wants the real one. */
function fixMinus(text: string): string {
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

function plus(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

/** `58%` — probabilities, which the wireframe prints whole. */
export function percent0(value: number): string {
  return fixMinus(`${Math.round(value)}%`);
}

/** `12.4%` — annualised premia and monthly moments. */
export function percent1(value: number): string {
  return fixMinus(`${value.toFixed(1)}%`);
}

/** `+0.93%` — the momentum profits, which the substance fixes to the basis point. */
export function percent2(value: number): string {
  return fixMinus(`${value.toFixed(2)}%`);
}

/** `+1.4%` — a figure whose sign is the finding. */
export function signedPercent1(value: number): string {
  return plus(value, percent1(value));
}

/** `+0.93%` with its sign forced. */
export function signedPercent2(value: number): string {
  return plus(value, percent2(value));
}

/** `+0.2pp` — the revision of the nowcast against its prior vintage. */
export function signedVintageDelta(value: number): string {
  return plus(value, fixMinus(`${value.toFixed(1)}pp`));
}

/** `+0.15pp` — one release's news, which the substance fixes to two places. */
export function signedNews(value: number): string {
  return plus(value, fixMinus(`${value.toFixed(2)}pp`));
}

/** `+100 bp` / `−61 bp` — the size premium, monthly. */
export function signedBasisPoints(value: number): string {
  return plus(value, fixMinus(`${Math.round(value)} bp`));
}

/** `2 mo` — an expected duration. */
export function monthsLabel(value: number): string {
  return `${value} mo`;
}

/** `0.82` / `−0.40` — a correlation, always to two places. */
export function correlationLabel(value: number): string {
  return fixMinus(value.toFixed(2));
}

/**
 * What a correlation cell prints.
 *
 * `CorrelationCell` carries exactly one of a value and a reason there is none,
 * so this never has to choose between them: `—` is "the domain substance does
 * not fix this pair for this regime", `n/d` is "the selected universe has no
 * such pair", and `+ positive` is a sign the substance fixes without a
 * magnitude. None of the three is ever a zero, because a zero correlation is a
 * claim and no claim was made.
 */
export function correlationCellLabel(cell: CorrelationCell): string {
  if (cell.value !== null) return correlationLabel(cell.value);
  return cell.note === null ? CORRELATION_NOTE_LABEL['not-fixed'] : CORRELATION_NOTE_LABEL[cell.note];
}

/** `0.00` / `−1.50` — θ, in standard deviations, always to two places. */
export function thetaLabel(value: number): string {
  return fixMinus(value.toFixed(2));
}

/** `78%` — a share held on 0–1. */
export function shareLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** `1.2` — a Sharpe ratio. */
export function sharpeLabel(value: number): string {
  return fixMinus(value.toFixed(1));
}

/** `−1,284.6` — the sample log-likelihood, grouped as the wireframe prints it. */
export function logLikelihoodLabel(value: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(1).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? MINUS : ''}${grouped}.${fraction}`;
}
