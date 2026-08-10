/**
 * Presentation helpers shared by the regions of `docs/16 Human Approval Gate.md`.
 *
 * They live beside the page rather than in the model, which stays logic-free,
 * and beside the page rather than in the service, which owns the data and not
 * how it is printed. Three regions print the same trade — the queue card, the
 * detail header and the confirmation dialog — so one spelling of "12,400 sh"
 * and "$2.46M" is written here instead of three near-identical ones there.
 */

/** `12400` → `12,400`. Grouping only, no sign and no decimals. */
function groupDigits(value: number): string {
  return Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Absolute share count with its unit: `12,400 sh`.
 *
 * Unsigned on purpose. The direction of the trade is the `side` printed beside
 * it on every card and in every header, and a second encoding of the same fact
 * is a second thing that can disagree with it.
 */
export function formatShares(quantity: number): string {
  return `${groupDigits(quantity)} sh`;
}

/**
 * Trade value in account currency, at the magnitude the card has room for:
 * `$2.46M`, `$726.0k`, `$940`.
 *
 * Compact rather than exact because the queue is scanned, not reconciled: the
 * decision is about which trade to open, and the exact figure is one line down
 * in the detail header. Never rounded to zero — a trade too small for the
 * chosen unit keeps its digits.
 */
export function formatNotional(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `$${(magnitude / 1_000_000).toFixed(2)}M`;
  if (magnitude >= 1_000) return `$${(magnitude / 1_000).toFixed(1)}k`;
  return `$${groupDigits(magnitude)}`;
}

/** The exact value, for the one place that has the room for it: `$2,460,000`. */
export function formatExactNotional(value: number): string {
  return `$${groupDigits(value)}`;
}
