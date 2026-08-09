/**
 * Presentation helpers shared by the regions of `docs/15 Execution & Orders Agent.md`.
 *
 * They live beside the page rather than in the model, which stays logic-free,
 * and beside the page rather than in the service, which owns the data and not
 * how it is printed. Three regions print the same quantities — the table, the
 * detail panel's impact block and its pipeline block — so one spelling of
 * "+12,400" is written here instead of three near-identical ones there.
 */

/** Rendered wherever a number genuinely does not exist. Never an empty cell. */
export const NOT_AVAILABLE = '—';

/**
 * What `—` means in the two estimate columns.
 *
 * An order whose scheduling did not complete has no priced trajectory, so its
 * shortfall and timing risk are unknown rather than zero. The words are the
 * accessible text beside the dash: a screen-reader user hearing "dash" learns
 * nothing, and a fabricated number would be worse than either.
 */
export const UNPRICED_NOTE = 'Not available — scheduling incomplete';

/** `12400` → `12,400`. Grouping only, no sign and no decimals. */
export function groupDigits(value: number): string {
  return Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Signed share delta, always with its sign: `+12,400`, `-8,100`.
 *
 * The sign is the direction of the trade and is the one thing in the cell that
 * must not be inferred from the Side column beside it — the two are printed
 * from the same field and a reader can check them against each other.
 */
export function formatSignedQuantity(delta: number): string {
  return `${delta < 0 ? '-' : '+'}${groupDigits(delta)}`;
}

/** Expected implementation shortfall E, in basis points. */
export function formatShortfall(bps: number | null): string {
  return bps === null ? NOT_AVAILABLE : `+${bps} bps`;
}

/** Timing risk √V of that shortfall — a spread, hence `±`. */
export function formatRisk(bps: number | null): string {
  return bps === null ? NOT_AVAILABLE : `±${bps} bps`;
}

/** `3.1e-7` — impact coefficients are read as orders of magnitude. */
export function formatImpact(value: number): string {
  return value.toExponential(1);
}
