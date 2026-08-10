/**
 * The derivations behind the detail panel's two figures.
 *
 * They are checked directly rather than through the DOM because the claims are
 * arithmetic, not markup: the holdings path has to start at the whole order and
 * end at zero, and the cost–variance family has to slope the way the theory
 * says it does. A canvas cannot be asked either question.
 */

import { TestBed } from '@angular/core/testing';

import { ExecutionService } from '../../../../services/execution.service';
import {
  costVarianceFrontier,
  intervalLabels,
  naiveHoldings,
  residualHoldings,
} from './order-charts';

/** AAPL BUY +12,400 over five intervals — the wireframe's own example. */
const SCHEDULED = 'TRD-2031';
/** HYG SELL −3,200, no volume profile, no trajectory, no estimates. */
const UNSCHEDULED = 'TRD-2036';

describe('order-charts — holdings path', () => {
  let service: ExecutionService;

  beforeEach(() => {
    service = TestBed.inject(ExecutionService);
  });

  it('when an order is scheduled, the residual path starts at the whole order', () => {
    const order = service.order(SCHEDULED)!;
    const path = residualHoldings(order.trajectory, order.targetQuantityDelta);
    expect(path[0]).toBe(Math.abs(order.targetQuantityDelta));
  });

  it('when an order is scheduled, the residual path closes the position exactly', () => {
    const order = service.order(SCHEDULED)!;
    const path = residualHoldings(order.trajectory, order.targetQuantityDelta);
    expect(path[path.length - 1]).toBe(0);
  });

  it('when an order is scheduled, the residual path never rises', () => {
    const order = service.order(SCHEDULED)!;
    const path = residualHoldings(order.trajectory, order.targetQuantityDelta);
    const rises = path.filter((value, i) => i > 0 && value > path[i - 1]);
    expect(rises).toEqual([]);
  });

  it('when the constant-rate reference is built, its slices are all equal', () => {
    const naive = naiveHoldings(5, 12_400);
    const steps = naive.slice(1).map((value, i) => Math.round(naive[i] - value));
    expect(new Set(steps).size).toBe(1);
  });

  it('when a path is labelled, there is one more label than there are intervals', () => {
    expect(intervalLabels(5)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5']);
  });
});

describe('order-charts — cost–variance frontier', () => {
  let service: ExecutionService;

  beforeEach(() => {
    service = TestBed.inject(ExecutionService);
  });

  it('when an order is priced, the frontier slopes down: more timing risk costs less', () => {
    const points = costVarianceFrontier(service.order(SCHEDULED)!);
    expect(points.length).toBeGreaterThan(2);

    const wrongWay = points.filter(
      (point, i) => i > 0 && (point[0] <= points[i - 1][0] || point[1] >= points[i - 1][1]),
    );
    expect(wrongWay).toEqual([]);
  });

  it("when an order is priced, its published estimates lie inside the frontier's span", () => {
    const order = service.order(SCHEDULED)!;
    const points = costVarianceFrontier(order);
    const risks = points.map((p) => p[0]);
    const costs = points.map((p) => p[1]);

    expect(order.estimatedRiskBps!).toBeGreaterThanOrEqual(Math.min(...risks));
    expect(order.estimatedRiskBps!).toBeLessThanOrEqual(Math.max(...risks));
    expect(order.estimatedShortfallBps!).toBeGreaterThanOrEqual(Math.min(...costs));
    expect(order.estimatedShortfallBps!).toBeLessThanOrEqual(Math.max(...costs));
  });

  it('when scheduling is incomplete, no frontier is produced rather than an invented one', () => {
    expect(costVarianceFrontier(service.order(UNSCHEDULED)!)).toEqual([]);
  });
});
