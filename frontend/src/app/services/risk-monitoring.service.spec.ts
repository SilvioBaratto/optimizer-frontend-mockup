import { TestBed } from '@angular/core/testing';

import {
  CAPITAL_BASE_EUR_M,
  CONFIDENCE_LEVELS,
  DRAWDOWN_LIMITS,
  DRAWDOWN_MEASURE_ORDER,
  HOLDING_PERIODS,
  LOOKBACK_WINDOWS,
  VAR_METHODS,
  type DrawdownMeasureId,
  type DrawdownThresholdRow,
} from '../models/risk-monitoring.model';
import { RiskMonitoringService } from './risk-monitoring.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): RiskMonitoringService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(RiskMonitoringService);
}

function row(service: RiskMonitoringService, measure: DrawdownMeasureId): DrawdownThresholdRow {
  const found = service.thresholds().find((r) => r.measure === measure);
  if (!found) throw new Error(`no ${measure} row in the threshold table`);
  return found;
}

function drawdowns(service: RiskMonitoringService): readonly number[] {
  return service.underwaterSeries().map((p) => p.drawdown);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ===========================================================================
// Criterion — VaR ≤ CVaR, everywhere it is shown
// ===========================================================================

describe('RiskMonitoringService — VaR and CVaR ordering', () => {
  it('when any confidence, method and holding period are chosen, CVaR is never below VaR', async () => {
    const service = setup();

    for (const method of VAR_METHODS) {
      for (const confidence of CONFIDENCE_LEVELS) {
        for (const holding of HOLDING_PERIODS) {
          service.setMethod(method);
          service.setConfidence(confidence);
          service.setHoldingPeriod(holding);

          const readings = service.readings();
          expect(readings.var).toBeGreaterThan(0);
          expect(readings.cvar).toBeGreaterThanOrEqual(readings.var);
        }
      }
    }

    await service.settled();
  });

  it('when the trend is drawn, CVaR is at or above VaR at every point of the series', async () => {
    const service = setup();

    for (const method of VAR_METHODS) {
      for (const confidence of CONFIDENCE_LEVELS) {
        for (const window of LOOKBACK_WINDOWS) {
          service.setMethod(method);
          service.setConfidence(confidence);
          service.setLookback(window);

          const points = service.varCvarTrend();
          expect(points.length).toBeGreaterThan(0);
          for (const point of points) {
            expect(point.cvar).toBeGreaterThanOrEqual(point.var);
          }
        }
      }
    }

    await service.settled();
  });

  it('when the trend ends, its last point is the current reading', () => {
    const service = setup();

    const points = service.varCvarTrend();
    const last = points[points.length - 1];

    expect(last.var).toBeCloseTo(service.readings().var, 9);
    expect(last.cvar).toBeCloseTo(service.readings().cvar, 9);
  });

  it('when the page opens, it shows the 95% historical one-day reading from the spec', () => {
    const service = setup();

    expect(service.confidence()).toBe(95);
    expect(service.method()).toBe('historical');
    expect(service.holdingPeriodDays()).toBe(1);
    expect(service.readings().var).toBeCloseTo(3.42, 2);
    expect(service.readings().cvar).toBeCloseTo(4.87, 2);
  });
});

// ===========================================================================
// Criterion — Δ₀(x) = AvDD and Δ₁(x) = MaxDD
// ===========================================================================

describe('RiskMonitoringService — the CDaR curve interpolates the elementary measures', () => {
  it('when the CDaR curve is sampled, its left endpoint is the average drawdown', () => {
    const service = setup();
    const curve = service.cdarCurve();

    expect(curve[0].alpha).toBe(0);
    expect(curve[0].value).toBe(service.drawdownSummary().averageDrawdown);
  });

  it('when the CDaR curve is sampled, its right endpoint is the maximum drawdown', () => {
    const service = setup();
    const curve = service.cdarCurve();
    const last = curve[curve.length - 1];

    expect(last.alpha).toBe(1);
    expect(last.value).toBe(service.drawdownSummary().maxDrawdown);
  });

  /*
    The endpoints above are only worth asserting if AvDD and MaxDD are really
    the mean and the peak of the path — otherwise the identity would hold
    between two numbers that are both wrong.
  */
  it('when the average drawdown is read, it is the time average of the drawdown series', () => {
    const service = setup();

    expect(service.drawdownSummary().averageDrawdown).toBeCloseTo(average(drawdowns(service)), 9);
    expect(service.drawdownSummary().averageDrawdown).toBeCloseTo(7.2, 6);
  });

  it('when the maximum drawdown is read, it is the peak of the drawdown series', () => {
    const service = setup();

    expect(service.drawdownSummary().maxDrawdown).toBe(Math.max(...drawdowns(service)));
    expect(service.drawdownSummary().maxDrawdown).toBeCloseTo(18.4, 6);
  });

  it('when the slider is driven to either end, Δ_α lands on AvDD and on MaxDD', () => {
    const service = setup();
    const summary = service.drawdownSummary();

    service.setCdarAlpha(0);
    expect(service.cdarValue()).toBe(summary.averageDrawdown);

    service.setCdarAlpha(1);
    expect(service.cdarValue()).toBe(summary.maxDrawdown);
  });

  it('when α rises, Δ_α never falls', () => {
    const service = setup();
    const curve = service.cdarCurve();

    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].value).toBeGreaterThanOrEqual(curve[i - 1].value);
      expect(curve[i].alpha).toBeGreaterThan(curve[i - 1].alpha);
    }
  });

  it('when α is 0.95, Δ_α is the mean of the worst 5% of the drawdowns', () => {
    const service = setup();
    const sorted = [...drawdowns(service)].sort((a, b) => b - a);
    const tail = 0.05 * sorted.length;
    const whole = Math.floor(tail);
    const expected =
      (sorted.slice(0, whole).reduce((s, v) => s + v, 0) + (tail - whole) * sorted[whole]) / tail;

    expect(service.cdarAt(0.95)).toBeCloseTo(expected, 9);
    expect(service.cdarAt(0.95)).toBeCloseTo(9.8, 1);
  });
});

// ===========================================================================
// Criterion — the drawdown returns to exactly zero at every new high
// ===========================================================================

describe('RiskMonitoringService — the underwater curve', () => {
  it('when the fund is at a new running maximum, its drawdown is exactly zero', () => {
    const service = setup();
    const series = service.underwaterSeries();
    const highs = series.filter((p) => p.cumulativeReturn === p.runningMax);

    expect(highs.length).toBeGreaterThanOrEqual(3);
    for (const point of highs) {
      expect(point.drawdown).toBe(0);
      expect(point.drawdownAbs).toBe(0);
      expect(point.newHigh).toBe(true);
    }
  });

  it('when the fund is below its running maximum, its drawdown is strictly positive', () => {
    const service = setup();

    for (const point of service.underwaterSeries()) {
      if (point.cumulativeReturn < point.runningMax) {
        expect(point.drawdown).toBeGreaterThan(0);
        expect(point.newHigh).toBe(false);
      }
    }
  });

  it('when the path is walked, the running maximum never falls and never trails the return', () => {
    const service = setup();
    const series = service.underwaterSeries();

    for (let i = 0; i < series.length; i++) {
      expect(series[i].runningMax).toBeGreaterThanOrEqual(series[i].cumulativeReturn);
      expect(series[i].drawdown).toBeCloseTo(series[i].runningMax - series[i].cumulativeReturn, 9);
      if (i > 0) expect(series[i].runningMax).toBeGreaterThanOrEqual(series[i - 1].runningMax);
    }
  });

  it('when the time underwater is reported, it counts the observations since the last high', () => {
    const service = setup();
    const series = service.underwaterSeries();
    const lastHigh = series.map((p) => p.newHigh).lastIndexOf(true);

    expect(service.drawdownSummary().daysUnderwater).toBe(series.length - 1 - lastHigh);
    expect(service.drawdownSummary().daysUnderwater).toBe(47);
    expect(service.readings().daysUnderwater).toBe(47);
    expect(service.drawdownSummary().lastHighAt).toBe(series[lastHigh].date);
  });

  it('when the current drawdown is read, it is the last point of the underwater curve', () => {
    const service = setup();
    const series = service.underwaterSeries();

    expect(service.readings().currentDrawdown).toBe(series[series.length - 1].drawdown);
    expect(service.readings().currentDrawdown).toBeCloseTo(6.1, 6);
  });
});

// ===========================================================================
// Criterion — moving α moves the CDaR readout and nothing else
// ===========================================================================

describe('RiskMonitoringService — the CDaR level', () => {
  it('when the page opens, α is 0.95', () => {
    const service = setup();

    expect(service.cdarAlpha()).toBe(0.95);
  });

  it('when α moves, the current readings do not change', () => {
    const service = setup();
    const before = service.readings();

    service.setCdarAlpha(0.4);

    expect(service.readings()).toEqual(before);
  });

  it('when α moves, the trend and the underwater curve do not change', () => {
    const service = setup();
    const trend = service.varCvarTrend();
    const underwater = service.underwaterSeries();

    service.setCdarAlpha(0.2);

    expect(service.varCvarTrend()).toBe(trend);
    expect(service.underwaterSeries()).toBe(underwater);
  });

  it('when α moves, only the CDaR row of the threshold table follows it', () => {
    const service = setup();
    const maxdd = row(service, 'maxdd');
    const avdd = row(service, 'avdd');
    const cdar = row(service, 'cdar');

    service.setCdarAlpha(0.5);

    expect(row(service, 'maxdd')).toEqual(maxdd);
    expect(row(service, 'avdd')).toEqual(avdd);
    expect(row(service, 'cdar').current).not.toBe(cdar.current);
    expect(row(service, 'cdar').alpha).toBe(0.5);
  });

  it('when α moves, the page never enters loading', async () => {
    const service = setup();

    service.setCdarAlpha(0.33);
    expect(service.state()).toBe('ready');

    await service.settled();
    expect(service.state()).toBe('ready');
  });

  it('when α is dragged past either end, it is clamped to [0, 1]', () => {
    const service = setup();

    service.setCdarAlpha(1.4);
    expect(service.cdarAlpha()).toBe(1);

    service.setCdarAlpha(-0.2);
    expect(service.cdarAlpha()).toBe(0);
  });
});

// ===========================================================================
// Criterion — the drawdown units are presentation, nothing else
// ===========================================================================

describe('RiskMonitoringService — drawdown units', () => {
  it('when the page opens, drawdowns are shown as a percentage', () => {
    const service = setup();

    expect(service.drawdownUnits()).toBe('rel');
  });

  it('when the units change, the page does not enter loading', async () => {
    const service = setup();

    service.setDrawdownUnits('abs');
    expect(service.state()).toBe('ready');

    await service.settled();
    expect(service.state()).toBe('ready');
  });

  it('when the units change, no figure on the page is recomputed', () => {
    const service = setup();
    const readings = service.readings();
    const summary = service.drawdownSummary();
    const thresholds = service.thresholds();

    service.setDrawdownUnits('abs');

    expect(service.readings()).toEqual(readings);
    expect(service.drawdownSummary()).toEqual(summary);
    expect(service.thresholds()).toEqual(thresholds);
  });

  it('when a drawdown is read in money, it is the same fraction of the capital base', () => {
    const service = setup();
    const summary = service.drawdownSummary();

    expect(summary.maxDrawdownAbs).toBeCloseTo(
      (summary.maxDrawdown / 100) * CAPITAL_BASE_EUR_M,
      9,
    );
    expect(summary.averageDrawdownAbs).toBeCloseTo(
      (summary.averageDrawdown / 100) * CAPITAL_BASE_EUR_M,
      9,
    );
  });
});

// ===========================================================================
// Criterion — the lookback window changes one chart's extent and nothing else
// ===========================================================================

describe('RiskMonitoringService — the lookback window', () => {
  it('when the window shortens, the trend keeps its most recent points and loses its oldest', () => {
    const service = setup();
    const year = service.varCvarTrend();

    service.setLookback('3M');
    const quarter = service.varCvarTrend();

    expect(quarter.length).toBeLessThan(year.length);
    expect(quarter[quarter.length - 1]).toEqual(year[year.length - 1]);
    expect(quarter[0]).toEqual(year[year.length - quarter.length]);
  });

  it('when the window changes, the readings and the drawdown figures are untouched', async () => {
    const service = setup();
    const readings = service.readings();
    const underwater = service.underwaterSeries();

    service.setLookback('6M');

    expect(service.state()).toBe('ready');
    expect(service.readings()).toEqual(readings);
    expect(service.underwaterSeries()).toBe(underwater);

    await service.settled();
    expect(service.state()).toBe('ready');
  });
});

// ===========================================================================
// Criterion — confidence, method and holding period recompute
// ===========================================================================

describe('RiskMonitoringService — recomputation', () => {
  it('when the confidence level changes, the page loads and the readings get more severe', async () => {
    const service = setup();
    const before = service.readings().var;

    service.setConfidence(99);
    expect(service.state()).toBe('loading');

    await service.settled();

    expect(service.state()).toBe('ready');
    expect(service.readings().var).toBeGreaterThan(before);
    expect(service.confidence()).toBe(99);
  });

  it('when the method changes, the page loads and the readings change', async () => {
    const service = setup();
    const before = service.readings().var;

    service.setMethod('parametric');
    expect(service.state()).toBe('loading');

    await service.settled();

    expect(service.state()).toBe('ready');
    expect(service.readings().var).not.toBe(before);
  });

  it('when the holding period changes, the readings scale with the square root of time', async () => {
    const service = setup();
    const oneDay = service.readings();

    service.setHoldingPeriod(5);
    await service.settled();
    const fiveDay = service.readings();

    expect(fiveDay.var).toBeCloseTo(oneDay.var * Math.sqrt(5), 9);
    expect(fiveDay.cvar).toBeCloseTo(oneDay.cvar * Math.sqrt(5), 9);
  });

  it('when a parameter changes, the drawdown path is untouched — it is not a tail measure', async () => {
    const service = setup();
    const underwater = service.underwaterSeries();
    const summary = service.drawdownSummary();

    service.setConfidence(90);
    service.setMethod('parametric');
    service.setHoldingPeriod(10);
    await service.settled();

    expect(service.underwaterSeries()).toBe(underwater);
    expect(service.drawdownSummary()).toEqual(summary);
  });

  it('when a parameter is set to the value it already has, nothing is recomputed', async () => {
    const service = setup();
    const asOf = service.readings().asOf;

    service.setConfidence(95);

    expect(service.state()).toBe('ready');
    await service.settled();
    expect(service.readings().asOf).toBe(asOf);
  });
});

// ===========================================================================
// Criterion — an insufficient sample is reported, never worked around
// ===========================================================================

describe('RiskMonitoringService — insufficient history', () => {
  it('when the historical method is read at 99%, the sample is flagged as too short', async () => {
    const service = setup();

    service.setConfidence(99);
    await service.settled();

    expect(service.insufficientHistory()).toBe(true);
    expect(service.insufficientHistoryNote()).not.toBeNull();
    expect(service.insufficientHistoryNote()).toContain('Parametric');
  });

  it('when the sample is too short, the method is not switched for the user', async () => {
    const service = setup();

    service.setConfidence(99);
    await service.settled();

    expect(service.method()).toBe('historical');
    expect(service.readings().method).toBe('historical');
    expect(service.varCvarTrend().length).toBeGreaterThan(0);
  });

  it('when the parametric method is chosen, no sample-size warning is raised at any level', async () => {
    const service = setup();
    service.setMethod('parametric');

    for (const confidence of CONFIDENCE_LEVELS) {
      service.setConfidence(confidence);
      expect(service.insufficientHistory()).toBe(false);
      expect(service.insufficientHistoryNote()).toBeNull();
    }

    await service.settled();
  });

  it('when a longer holding period thins the sample, the same warning is raised', async () => {
    const service = setup();

    expect(service.insufficientHistory()).toBe(false);

    service.setHoldingPeriod(10);
    await service.settled();

    expect(service.insufficientHistory()).toBe(true);
  });
});

// ===========================================================================
// Criterion — near-coincident VaR and CVaR are annotated, not redefined
// ===========================================================================

describe('RiskMonitoringService — the near-coincidence annotation', () => {
  it('when the page opens, the two measures are far enough apart to need no note', () => {
    const service = setup();

    expect(service.tailCoincidence()).toBe(false);
    expect(service.tailCoincidenceNote()).toBeNull();
  });

  it('when the gap between the two narrows, the trend is annotated and neither is redefined', async () => {
    const service = setup();

    service.setMethod('parametric');
    service.setConfidence(99);
    await service.settled();

    expect(service.tailCoincidence()).toBe(true);
    expect(service.tailCoincidenceNote()).not.toBeNull();
    // Still two distinct, correctly ordered measures — only the gap is small.
    expect(service.readings().cvar).toBeGreaterThan(service.readings().var);
  });
});

// ===========================================================================
// Criterion — the threshold table
// ===========================================================================

describe('RiskMonitoringService — the drawdown threshold table', () => {
  it('when the table is built, it holds the three measures in wireframe order', () => {
    const service = setup();

    expect(service.thresholds().map((r) => r.measure)).toEqual([...DRAWDOWN_MEASURE_ORDER]);
  });

  it('when a row is read, its utilisation is the current value over its configured limit', () => {
    const service = setup();

    for (const entry of service.thresholds()) {
      expect(entry.limit).toBeCloseTo(DRAWDOWN_LIMITS[entry.measure].nu * 100, 9);
      expect(entry.utilisation).toBeCloseTo((entry.current / entry.limit) * 100, 9);
      expect(entry.limitAbs).toBeCloseTo((entry.limit / 100) * CAPITAL_BASE_EUR_M, 9);
    }
  });

  it('when the page opens, the rows carry the readings the spec shows', () => {
    const service = setup();

    expect(row(service, 'maxdd').current).toBeCloseTo(18.4, 6);
    expect(row(service, 'maxdd').utilisation).toBeCloseTo(61.33, 1);
    expect(row(service, 'avdd').current).toBeCloseTo(7.2, 6);
    expect(row(service, 'avdd').utilisation).toBeCloseTo(72, 1);
    expect(row(service, 'cdar').current).toBeCloseTo(9.8, 1);
    expect(row(service, 'cdar').utilisation).toBeCloseTo(69.9, 1);
  });

  it('when a measure sits inside its configured warning band, the row reads Warning', () => {
    const service = setup();

    // 72% of the limit, against a band configured at 70%.
    expect(row(service, 'avdd').status).toBe('warning');
    expect(row(service, 'avdd').warnAt).toBe(0.7);
  });

  it('when a measure sits below its configured warning band, the row reads OK', () => {
    const service = setup();

    // 69.9% of the limit, against a band configured at 75%.
    expect(row(service, 'cdar').status).toBe('ok');
  });

  it('when α is driven to 1, the CDaR row reports the maximum drawdown and breaches its limit', () => {
    const service = setup();

    service.setCdarAlpha(1);

    expect(row(service, 'cdar').current).toBe(service.drawdownSummary().maxDrawdown);
    expect(row(service, 'cdar').utilisation).toBeGreaterThan(100);
    expect(row(service, 'cdar').status).toBe('breach');
  });

  it('when the CDaR row is rendered, its symbol names the α it was read at', () => {
    const service = setup();

    expect(row(service, 'cdar').symbol).toContain('0.95');

    service.setCdarAlpha(0.5);
    expect(row(service, 'cdar').symbol).toContain('0.50');
  });
});

// ===========================================================================
// Criterion — refresh, failure and the stale readings it leaves behind
// ===========================================================================

describe('RiskMonitoringService — refresh', () => {
  it('when the calculation runs, the loading state is reachable', async () => {
    const service = setup();

    const pending = service.refresh();
    expect(service.state()).toBe('loading');

    await pending;
    expect(service.state()).toBe('ready');
  });

  it('when the calculation succeeds, the as-of stamp moves', async () => {
    const service = setup();
    const before = service.readings().asOf;

    await service.refresh();

    expect(service.readings().asOf).not.toBe(before);
    expect(service.readings().asOf.endsWith(' UTC')).toBe(true);
  });

  it('when the calculation fails, the error is raised and the last readings stay readable', async () => {
    const service = setup();
    const before = service.readings();
    const thresholds = service.thresholds();

    await service.refresh(true);

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).not.toBeNull();
    expect(service.errorDetail()).not.toBeNull();
    expect(service.readings()).toEqual(before);
    expect(service.thresholds()).toEqual(thresholds);
    expect(service.varCvarTrend().length).toBeGreaterThan(0);
    expect(service.stale()).toBe(true);
  });

  it('when the error is cleared, the page returns to its populated view', async () => {
    const service = setup();
    await service.refresh(true);

    service.clearError();

    expect(service.errorMessage()).toBeNull();
    expect(service.errorDetail()).toBeNull();
    expect(service.state()).toBe('ready');
    expect(service.stale()).toBe(false);
  });
});

// ===========================================================================
// Criterion — no portfolio, no dashboard
// ===========================================================================

describe('RiskMonitoringService — portfolio scope', () => {
  it('when no portfolio is selected, the page is empty', () => {
    const service = setup();

    service.selectPortfolio(null);

    expect(service.state()).toBe('empty');
  });

  it('when no portfolio is selected, refreshing does nothing', async () => {
    const service = setup();
    service.selectPortfolio(null);

    await service.refresh();

    expect(service.state()).toBe('empty');
    expect(service.errorMessage()).toBeNull();
  });
});

// ===========================================================================
// Criterion — the alert log points back at the charts above it
// ===========================================================================

describe('RiskMonitoringService — the alert log', () => {
  it('when the log is read, it runs newest first', () => {
    const service = setup();
    const stamps = service.alertLog().map((entry) => entry.at);

    expect(stamps.length).toBeGreaterThan(3);
    expect([...stamps].sort().reverse()).toEqual(stamps);
  });

  it('when an entry is stamped, its day is an observation of the drawdown series', () => {
    const service = setup();
    const days = new Set(service.underwaterSeries().map((p) => p.date));

    for (const entry of service.alertLog()) {
      expect(days.has(entry.at.slice(0, 10))).toBe(true);
    }
  });

  it('when an entry is opened, it names the measure, the value and the threshold', () => {
    const service = setup();

    for (const entry of service.alertLog()) {
      expect(entry.detail).toBeDefined();
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });

  it('when the panel is truncated, it shows the three newest alerts', () => {
    const service = setup();

    expect(service.recentAlerts()).toEqual(service.alertLog().slice(0, 3));
  });
});
