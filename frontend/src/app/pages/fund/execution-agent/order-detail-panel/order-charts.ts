/**
 * The two figures the detail panel draws, derived from one order.
 *
 * Pure functions rather than component members: the trajectory chart, the
 * cost–variance chart and their tests all read the same derivations, and a
 * derivation that only exists inside a template expression cannot be checked
 * against the theory it claims to implement.
 *
 * Nothing here invents a number the agent did not publish. The residual-holdings
 * path is the order's own `trajectory` read as a running remainder, and the
 * cost–variance family is calibrated so the order's published `E` and `√V` are
 * exactly the point marked on it — the curve says how the trade-off moves
 * around the chosen schedule, never what the chosen schedule costs.
 */

import type { Point } from '../../../../shared/charts';
import type { ProposedOrder } from '../../../../models/order.model';

/**
 * Holdings still to trade after each interval: `x_0 = |ΔQ|`, `x_N = 0`.
 *
 * Almgren–Chriss plots the holdings path, not the slice sizes, because the
 * timing risk is carried by what is still open — `V(x) = σ² Σ τ x_k²`. The
 * slices are what the agent published; this reads them as the remainder, so
 * the chart and the sparkline cannot disagree.
 */
export function residualHoldings(trajectory: readonly number[], total: number): number[] {
  const path = [Math.abs(total)];
  let left = Math.abs(total);
  for (const slice of trajectory) {
    left -= slice;
    path.push(left);
  }
  return path;
}

/**
 * The λ → 0 reference: the same block traded at a constant rate.
 *
 * Minimum expected cost and maximum timing risk — the naive strategy the
 * chosen schedule is judged against, and the point at which the efficient
 * frontier has a horizontal tangent.
 */
export function naiveHoldings(intervals: number, total: number): number[] {
  if (intervals <= 0) return [];
  const size = Math.abs(total);
  return Array.from({ length: intervals + 1 }, (_, i) => size * (1 - i / intervals));
}

/** `t0 … tN`, one more label than there are intervals — the path starts at t0. */
export function intervalLabels(intervals: number): string[] {
  return Array.from({ length: intervals + 1 }, (_, i) => `t${i}`);
}

/**
 * Raw cost and risk of a slice list, in the model's own units.
 *
 * Cost is `Σ n_k²`, the temporary-impact term that actually depends on how the
 * block is spread; risk is `√(Σ x_k²)` over the intervals after the first,
 * which is the variance of the shortfall. Both are unscaled — see below.
 */
function rawCostAndRisk(slices: readonly number[], total: number): { cost: number; risk: number } {
  let left = Math.abs(total);
  let cost = 0;
  let variance = 0;
  for (const slice of slices) {
    cost += slice * slice;
    left -= slice;
    variance += left * left;
  }
  return { cost, risk: Math.sqrt(variance) };
}

/** Front-loaded geometric slice list, the family the frontier is swept over. */
function geometricSlices(total: number, intervals: number, decay: number): number[] {
  const weights = Array.from({ length: intervals }, (_, i) => decay ** i);
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return weights.map((w) => (Math.abs(total) * w) / sum);
}

/**
 * The trading-rate family swept to draw the frontier, slowest-decay first.
 *
 * A decay near 1 is the naive constant rate (cheapest, riskiest); a small decay
 * front-loads the block (dearest, safest). Sorted ascending so the returned
 * points run left to right along the risk axis.
 */
const DECAY_FAMILY: readonly number[] = [
  0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.84, 0.9, 0.94, 0.97, 0.995,
];

/**
 * The cost–variance frontier around this order's chosen schedule.
 *
 * Points are `(√V, E)` in basis points. The family is computed in the model's
 * raw units and then scaled by the single factor that puts the order's own
 * schedule at its published `(√V, E)` — so the axis units are the ones the
 * table prints, and the marked point is the agent's estimate rather than a
 * re-derivation of it.
 *
 * Empty when the order has no priced trajectory: there is nothing to place on
 * a frontier, and drawing one anyway would be the fabricated number the spec
 * forbids.
 */
export function costVarianceFrontier(order: ProposedOrder): Point[] {
  const { estimatedShortfallBps: cost, estimatedRiskBps: risk } = order;
  const intervals = order.trajectory.length;
  if (cost === null || risk === null || intervals === 0) return [];

  const total = Math.abs(order.targetQuantityDelta);
  const chosen = rawCostAndRisk(order.trajectory, total);
  if (chosen.cost === 0 || chosen.risk === 0) return [];

  const costScale = cost / chosen.cost;
  const riskScale = risk / chosen.risk;

  return DECAY_FAMILY.map((decay) => {
    const sample = rawCostAndRisk(geometricSlices(total, intervals, decay), total);
    return [sample.risk * riskScale, sample.cost * costScale] as Point;
  });
}
