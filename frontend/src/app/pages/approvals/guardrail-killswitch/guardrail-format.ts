/**
 * The page's number formatting, in one place.
 *
 * Five regions print thresholds, weights and diversification indices, and the
 * one thing a guardrail page cannot afford is the same quantity rendered two
 * ways — `8%` beside `8.0% NAV` reads as two different limits. Not-applicable
 * is a dash everywhere, never a blank and never a zero: a limit with no
 * threshold is a predicate, not a bound of nothing.
 */

import { LIMIT_UNIT_LABEL, type HardLimit } from '../../../models/guardrail.model';

/** Not applicable. Never an empty cell, never `0`. */
export const NOT_APPLICABLE = '—';

/** `0.28` → `28.0%`. Weights arrive as fractions of NAV. */
export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** `0.94` → `0.94`. A diversification index is a ratio, printed at two places. */
export function ratio(value: number | null): string {
  return value === null ? NOT_APPLICABLE : value.toFixed(2);
}

/**
 * `8` → `8.0% NAV`.
 *
 * One decimal, matching the validator messages exactly: the form prints
 * `threshold must be a non-negative number, got -3.0` verbatim, so the card
 * beside it must not say `-3`.
 */
export function thresholdText(limit: Pick<HardLimit, 'threshold' | 'unit'>): string {
  if (limit.threshold === null) return NOT_APPLICABLE;
  const value = limit.threshold.toFixed(1);
  if (limit.unit === 'pct-nav') return `${value}${LIMIT_UNIT_LABEL['pct-nav']}`;
  if (limit.unit === 'absolute') return `${value} ${LIMIT_UNIT_LABEL.absolute}`;
  return value;
}
