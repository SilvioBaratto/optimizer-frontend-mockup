/**
 * How this page spells its numbers.
 *
 * One module rather than a helper per region, because the same quantity is
 * printed in more than one place — the momentum row's tilt appears in the
 * signal table, in the extrapolation callout and in the snapshot the primary
 * action hands over — and a second spelling of `+4` anywhere would be a way for
 * them to disagree.
 *
 * Every negative sign is U+2212 MINUS SIGN rather than a hyphen: a hyphen is
 * narrower than a digit, so a column of `tabular-nums` stops lining up, and a
 * screen reader reads it as a dash rather than as "minus".
 */

import {
  VALUE_SPREAD_BASE_YEAR,
  type ValueSpreadMetric,
  type ValueSpreadReading,
} from '../../../models/factor-timing.model';

/** U+2212 MINUS SIGN. */
export const MINUS = '−';

/** `toFixed` emits a hyphen-minus; every figure on the page wants the real one. */
function fixMinus(text: string): string {
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

function plus(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

/** `16%` — a portfolio weight, which the wireframe prints whole. */
export function percent0(value: number): string {
  return fixMinus(`${Math.round(value)}%`);
}

/** `12.4%` — an annualised premium. */
export function percent1(value: number): string {
  return fixMinus(`${value.toFixed(1)}%`);
}

/** `+4` / `−3` / `0` — a tilt in percentage points. */
export function signedPoints(value: number): string {
  return plus(value, fixMinus(String(Math.round(value))));
}

/** `+0.30` / `−0.29` — a driver score on the −1 … +1 scale. */
export function score2(value: number): string {
  return plus(value, fixMinus(value.toFixed(2)));
}

/** `0.42` — an information ratio, always two places. */
export function ratio2(value: number): string {
  return fixMinus(value.toFixed(2));
}

/** `+1.26` — an expected-utility gain, whose sign is part of the finding. */
export function signedGain(value: number): string {
  return plus(value, fixMinus(value.toFixed(2)));
}

/** `+8.4%` — a rolling excess return against the market. */
export function signedPercent1(value: number): string {
  return plus(value, percent1(value));
}

/** `−0.62 SD` / `63rd pct` / `0.35×` — the value spread in the selected metric. */
export function valueSpreadLabel(reading: ValueSpreadReading): string {
  switch (reading.metric) {
    case 'z-score':
      return `${plus(reading.display, fixMinus(reading.display.toFixed(2)))} SD`;
    case 'percentile':
      return `${ordinal(Math.round(reading.display))} pct`;
    default:
      return `${fixMinus(reading.display.toFixed(2))}×`;
  }
}

/** `1st`, `2nd`, `63rd`, `11th`. */
export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** The caption under the band: what the marker is positioned against. */
export function bandCaption(metric: ValueSpreadMetric, bandSd: number): string {
  const measure =
    metric === 'z-score'
      ? 'standard deviations'
      : metric === 'percentile'
        ? 'percentile rank'
        : 'the ratio spread';
  return `Position on the historical band, ${VALUE_SPREAD_BASE_YEAR} mean to ±${bandSd} SD, read in ${measure}.`;
}

/** `—` for anything a row does not have. Never an empty cell. */
export const NOT_APPLICABLE = '—';
