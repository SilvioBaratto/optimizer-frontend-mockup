/**
 * Presentation helpers shared by the six regions of `docs/19 Risk Attribution.md`.
 *
 * They live beside the page rather than in the model, which stays logic-free,
 * and beside the page rather than in the service, which owns the numbers and
 * not how they are spelled. Five regions print the same quantities — the
 * KeyMetricsRow, the table, its TOTAL row, the contribution chart and the
 * detail panel — so one spelling of `$4,182,300` is written here instead of
 * five near-identical ones there.
 *
 * Nothing in here decides anything: every function is a pure formatter over a
 * figure the service already computed. `—` is the only value any of them can
 * invent, and it is invented only where the service handed back `null`.
 */

import { UNDEFINED_CELL, type DisplayUnit } from '../../../models/risk-attribution.model';

/** Rendered wherever a quantity genuinely does not exist. Never an empty cell. */
export const NOT_APPLICABLE = UNDEFINED_CELL;

/** `4182300` → `4,182,300`. Grouping only — no sign, no decimals. */
export function groupDigits(value: number): string {
  return Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Account currency, whole units: `$612,000`, `-$31,500`.
 *
 * The sign is taken from the *rounded* figure so a contribution of -0.2 prints
 * `$0` rather than `-$0`.
 */
export function currency(value: number): string {
  return `${Math.round(value) < 0 ? '-' : ''}$${groupDigits(value)}`;
}

/** A fraction as a percentage with one decimal: `10.1%`, `-0.8%`. */
export function share(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Always signed. The diversification benefit reads `+28.0%`, and a negative one
 * — which only a non-sub-additive measure can produce — has to read `-3.1%`
 * rather than being quietly hidden.
 */
export function signedShare(fraction: number): string {
  const percent = fraction * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

/** Two decimals, or the dash when the index is undefined. */
export function ratio(value: number | null): string {
  return value === null ? NOT_APPLICABLE : value.toFixed(2);
}

/** A percentage, or the dash — RORAC on a zero or negative contribution. */
export function optionalShare(value: number | null): string {
  return value === null ? NOT_APPLICABLE : share(value);
}

/**
 * A risk figure in the unit the toolbar's `$ / %` switch selects.
 *
 * `%` is the figure over net asset value, which is the reading a manager
 * already has a feel for. Over EC the stand-alone total would print `138.9%`,
 * which is `1/DI` wearing a percent sign.
 */
export function riskAmount(value: number, unit: DisplayUnit, netAssetValue: number): string {
  if (unit === 'currency') return currency(value);
  return share(netAssetValue === 0 ? 0 : value / netAssetValue);
}
