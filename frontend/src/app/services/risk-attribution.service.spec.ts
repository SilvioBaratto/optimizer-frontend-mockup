import { TestBed } from '@angular/core/testing';

import {
  ATTRIBUTION_CONFIDENCES,
  ATTRIBUTION_GROUPINGS,
  ATTRIBUTION_MEASURES,
  ATTRIBUTION_METHODS,
  ESTIMATION_APPROACHES,
  type AttributionMeasure,
  type ComponentContribution,
} from '../models/risk-attribution.model';
import { RiskAttributionService } from './risk-attribution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): RiskAttributionService {
  TestBed.configureTestingModule({});
  return TestBed.inject(RiskAttributionService);
}

/** Runs every pending timer the service scheduled, then lets the promise settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
}

/** Drives one parameter change to completion. */
async function change(work: Promise<void>): Promise<void> {
  await settle();
  await work;
}

function row(service: RiskAttributionService, id: string): ComponentContribution {
  const found = service.rows().find((r) => r.id === id);
  if (!found) throw new Error(`no ${id} row on screen`);
  return found;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Every combination the toolbar can reach, so an invariant is checked against
 * the whole parameter space rather than the default view of it.
 */
async function forEveryCombination(
  service: RiskAttributionService,
  assert: (label: string) => void,
): Promise<void> {
  for (const grouping of ATTRIBUTION_GROUPINGS) {
    await change(service.setGrouping(grouping));
    for (const snapshot of service.snapshots) {
      await change(service.setSnapshot(snapshot.id));
      for (const measure of ATTRIBUTION_MEASURES) {
        await change(service.setMeasure(measure));
        for (const confidence of ATTRIBUTION_CONFIDENCES) {
          await change(service.setConfidence(confidence));
          for (const approach of ESTIMATION_APPROACHES) {
            await change(service.setApproach(approach));
            for (const method of ATTRIBUTION_METHODS) {
              await change(service.setMethod(method));
              assert(`${grouping}/${snapshot.id}/${measure}/${confidence}/${approach}/${method}`);
            }
          }
        }
      }
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Criterion — the full allocation property under Euler
// ===========================================================================

describe('RiskAttributionService — full allocation under Euler', () => {
  it('when the method is Euler, the contributions sum to the economic capital exactly', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      if (service.method() !== 'euler') return;
      const contributions = sum(service.rows().map((r) => r.contribution));
      expect(contributions, label).toBeCloseTo(service.economicCapital(), 6);
    });
  });

  it('when the method is Euler, the sum of contributions covers 100% of EC', async () => {
    const service = setup();
    await change(service.setMethod('euler'));

    expect(service.contributionCoverage()).toBeCloseTo(1, 9);
    expect(service.fullAllocation()).toBe(true);
    expect(service.totals().contributionShare).toBeCloseTo(1, 9);
  });

  it('when the Euler shares are added up, they make one whole', async () => {
    const service = setup();
    await change(service.setMethod('euler'));

    expect(sum(service.rows().map((r) => r.eulerShare))).toBeCloseTo(1, 9);
  });
});

// ===========================================================================
// Criterion — with-without contributions do NOT satisfy full allocation
// ===========================================================================

describe('RiskAttributionService — marginal under-coverage', () => {
  it('when the method is Marginal, the contributions sum to strictly less than EC', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      if (service.method() !== 'marginal') return;
      const contributions = sum(service.rows().map((r) => r.contribution));
      expect(contributions, label).toBeLessThan(service.economicCapital());
    });
  });

  it('when the method is Marginal, the coverage badge reports below 100% and not full allocation', async () => {
    const service = setup();
    await change(service.setMethod('marginal'));

    expect(service.contributionCoverage()).toBeLessThan(1);
    expect(service.contributionCoverage()).toBeGreaterThan(0.5);
    expect(service.fullAllocation()).toBe(false);
  });

  /*
    Rescaling the with-without contributions to 100% is the specific lie this
    page exists to avoid: the rescaled figures are no longer RORAC compatible,
    so the page would be claiming a coherent allocation it is not using. The
    numbers must be the same before and after the method changes.
  */
  it('when the method changes to Marginal, no contribution is rescaled to close the gap', async () => {
    const service = setup();
    await change(service.setMethod('euler'));
    const withWithout = service.rows().map((r) => r.marginal);

    await change(service.setMethod('marginal'));

    expect(service.rows().map((r) => r.marginal)).toEqual(withWithout);
    expect(service.rows().map((r) => r.contribution)).toEqual(withWithout);
    expect(sum(service.rows().map((r) => r.contribution))).toBeLessThan(service.economicCapital());
  });

  it('when a component is measured both ways, its with-without figure never exceeds its Euler figure', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      for (const r of service.rows()) {
        expect(r.marginal, `${label} ${r.id}`).toBeLessThanOrEqual(r.euler + 1e-6);
      }
    });
  });

  it('when the method changes, the economic capital is untouched — it is a property of ρ, not of the split', async () => {
    const service = setup();
    const ec = service.economicCapital();
    const standAlone = service.sumStandAlone();
    const di = service.portfolioDi();

    await change(service.setMethod('marginal'));

    expect(service.economicCapital()).toBe(ec);
    expect(service.sumStandAlone()).toBe(standAlone);
    expect(service.portfolioDi()).toBe(di);
  });
});

// ===========================================================================
// Criterion — Euler contributions are bounded by the stand-alone risk
// ===========================================================================

describe('RiskAttributionService — sub-additivity bound', () => {
  it('when any combination is selected, no Euler contribution exceeds its stand-alone risk', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      for (const r of service.rows()) {
        expect(Math.abs(r.euler), `${label} ${r.id}`).toBeLessThanOrEqual(r.standAlone + 1e-6);
      }
    });
  });

  it('when any combination is selected, the portfolio DI stays at or below 1 and the benefit at or above 0', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      expect(service.portfolioDi(), label).toBeLessThanOrEqual(1);
      expect(service.diversificationBenefit(), label).toBeGreaterThanOrEqual(0);
    });
  });

  it('when a marginal DI is defined, it stays at or below 1', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      for (const r of service.rows()) {
        if (r.marginalDi === null) continue;
        expect(r.marginalDi, `${label} ${r.id}`).toBeLessThanOrEqual(1);
      }
    });
  });
});

// ===========================================================================
// Criterion — one derivation of EC, Σ stand-alone and DI
// ===========================================================================

describe('RiskAttributionService — the TOTAL row is the only source', () => {
  it('when the figures are read, EC and Σ stand-alone are the TOTAL row itself', () => {
    const service = setup();

    expect(service.economicCapital()).toBe(service.totals().euler);
    expect(service.sumStandAlone()).toBe(service.totals().standAlone);
    expect(service.sumMarginal()).toBe(service.totals().marginal);
  });

  it('when the DI and the diversification benefit are read, both come from those same two numbers', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      const totals = service.totals();
      expect(service.portfolioDi(), label).toBe(totals.euler / totals.standAlone);
      expect(service.diversificationBenefit(), label).toBe(1 - totals.euler / totals.standAlone);
    });
  });

  it('when the search filters the table, the totals still describe the whole book', () => {
    const service = setup();
    const ec = service.economicCapital();
    const standAlone = service.sumStandAlone();

    service.search.set('AAPL');

    expect(service.visibleRows().length).toBe(1);
    expect(service.rows().length).toBeGreaterThan(1);
    expect(service.economicCapital()).toBe(ec);
    expect(service.sumStandAlone()).toBe(standAlone);
    expect(service.portfolioDi()).toBe(ec / standAlone);
  });

  it('when the portfolio RORAC is read, it is the expected P&L over the same EC', () => {
    const service = setup();

    expect(service.totals().rorac).toBeCloseTo(
      sum(service.rows().map((r) => r.expectedPnl)) / service.economicCapital(),
      9,
    );
    expect(service.portfolioRorac()).toBe(service.totals().rorac);
  });
});

// ===========================================================================
// Criterion — hedges
// ===========================================================================

describe('RiskAttributionService — hedge components', () => {
  it('when a component hedges the book, its Euler contribution is negative and it is flagged', () => {
    const service = setup();

    const tlt = row(service, 'TLT');
    expect(tlt.euler).toBeLessThan(0);
    expect(tlt.hedge).toBe(true);
    expect(tlt.standAlone).toBeGreaterThan(0);
  });

  it('when a component hedges the book, removing it would raise the risk', () => {
    const service = setup();

    expect(row(service, 'TLT').marginal).toBeLessThan(0);
  });

  it('when a component is flagged as a hedge, its contribution is what makes it one', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      for (const r of service.rows()) {
        expect(r.hedge, `${label} ${r.id}`).toBe(r.contribution < 0);
      }
    });
  });

  it('when the book is grouped by sub-portfolio, the hedging sleeve is still marked', async () => {
    const service = setup();

    await change(service.setGrouping('sub-portfolio'));

    expect(service.rows().some((r) => r.hedge)).toBe(true);
  });
});

// ===========================================================================
// Criterion — RORAC and the marginal DI are undefined, not zero
// ===========================================================================

describe('RiskAttributionService — undefined cells', () => {
  it('when a contribution is negative, the component has no RORAC', () => {
    const service = setup();

    expect(row(service, 'TLT').rorac).toBeNull();
    expect(row(service, 'GLD').rorac).toBeNull();
  });

  it('when a component earns a return but consumes no risk capital, it still has no RORAC', () => {
    const service = setup();

    const gld = row(service, 'GLD');
    expect(gld.expectedPnl).toBeGreaterThan(0);
    expect(gld.rorac).toBeNull();
  });

  it('when a contribution is zero, the component has no RORAC', () => {
    const service = setup();

    const cash = row(service, 'CASH');
    expect(cash.contribution).toBe(0);
    expect(cash.rorac).toBeNull();
  });

  it('when a contribution is positive, RORAC is the expected P&L over it', () => {
    const service = setup();

    const aapl = row(service, 'AAPL');
    expect(aapl.rorac).toBeCloseTo(aapl.expectedPnl / aapl.contribution, 9);
  });

  it('when a component hedges or carries no risk, its marginal DI is undefined', () => {
    const service = setup();

    expect(row(service, 'TLT').marginalDi).toBeNull();
    expect(row(service, 'CASH').marginalDi).toBeNull();
  });

  it('when a component contributes risk, its marginal DI is the Euler figure over the stand-alone one', async () => {
    const service = setup();

    await forEveryCombination(service, (label) => {
      for (const r of service.rows()) {
        if (r.euler <= 0 || r.standAlone <= 0) continue;
        expect(r.marginalDi, `${label} ${r.id}`).toBe(r.euler / r.standAlone);
      }
    });
  });

  /*
    The marginal DI is defined on the Euler contribution — see §7 of the doc —
    so switching the table to the with-without column must not move it. Doc 17
    prints this list, and it would otherwise change meaning under it.
  */
  it('when the method is Marginal, the marginal DI is still the Euler-based index', async () => {
    const service = setup();
    const underEuler = service.rows().map((r) => r.marginalDi);

    await change(service.setMethod('marginal'));

    expect(service.rows().map((r) => r.marginalDi)).toEqual(underEuler);
  });
});

// ===========================================================================
// Criterion — the figures doc 17 reads
// ===========================================================================

describe('RiskAttributionService — the doc 17 contract', () => {
  it('when the marginal DI list is read, every entry is the row it came from', () => {
    const service = setup();

    const entries = service.marginalDiByComponent();
    expect(entries).toHaveLength(service.rows().length);
    for (const entry of entries) {
      const source = row(service, entry.id);
      expect(entry.marginalDi).toBe(source.marginalDi);
      expect(entry.hedge).toBe(source.hedge);
      expect(entry.name).toBe(source.name);
    }
  });

  it('when the grouping changes, the marginal DI list follows the table', async () => {
    const service = setup();

    await change(service.setGrouping('factor'));

    expect(service.marginalDiByComponent().map((e) => e.id)).toEqual(
      service.rows().map((r) => r.id),
    );
  });
});

// ===========================================================================
// Criterion — the wireframe's worked example
// ===========================================================================

describe('RiskAttributionService — the default view', () => {
  it('when the page opens, the toolbar carries the specified defaults', () => {
    const service = setup();

    expect(service.measure()).toBe('volatility');
    expect(service.confidence()).toBe(95);
    expect(service.method()).toBe('euler');
    expect(service.approach()).toBe('empirical');
    expect(service.grouping()).toBe('asset');
    expect(service.displayUnit()).toBe('currency');
    expect(service.snapshot().latest).toBe(true);
    expect(service.state()).toBe('ready');
  });

  it('when the default view is read, the TOTAL row matches the specified figures', () => {
    const service = setup();

    expect(Math.round(service.economicCapital())).toBe(4_182_300);
    expect(Math.round(service.sumStandAlone())).toBe(5_808_800);
    expect(service.portfolioDi()).toBeCloseTo(0.72, 3);
    expect(service.diversificationBenefit()).toBeCloseTo(0.28, 3);
    expect(service.portfolioRorac()).toBeCloseTo(0.098, 4);
    expect(service.totals().weight).toBeCloseTo(1, 9);
  });

  it('when the default view is read, the worked example rows match the specified figures', () => {
    const service = setup();

    const aapl = row(service, 'AAPL');
    expect(aapl.weight).toBeCloseTo(0.082, 6);
    expect(Math.round(aapl.standAlone)).toBe(612_000);
    expect(Math.round(aapl.euler)).toBe(421_300);
    expect(aapl.eulerShare).toBeCloseTo(0.101, 3);
    expect(aapl.rorac).toBeCloseTo(0.142, 3);
    expect(aapl.marginalDi).toBeCloseTo(0.69, 2);

    const msft = row(service, 'MSFT');
    expect(Math.round(msft.euler)).toBe(402_100);
    expect(msft.eulerShare).toBeCloseTo(0.096, 3);

    const tlt = row(service, 'TLT');
    expect(Math.round(tlt.euler)).toBe(-31_500);
    expect(tlt.eulerShare).toBeCloseTo(-0.008, 3);
  });

  it('when the book is listed, it holds the 26 components the wireframe counts', () => {
    const service = setup();

    expect(service.rows()).toHaveLength(26);
  });
});

// ===========================================================================
// Criterion — the chart reads the table
// ===========================================================================

describe('RiskAttributionService — the contribution chart', () => {
  it('when the bars are ordered, they run from the largest Euler contribution down', () => {
    const service = setup();

    const ranked = service.rankedRows().map((r) => r.euler);
    expect(ranked).toEqual([...ranked].sort((a, b) => b - a));
    expect(service.rankedRows()).toHaveLength(service.rows().length);
  });

  it('when the table is searched, the chart still shows the whole book', () => {
    const service = setup();

    service.search.set('AAPL');

    expect(service.visibleRows()).toHaveLength(1);
    expect(service.rankedRows()).toHaveLength(service.rows().length);
  });
});

// ===========================================================================
// Criterion — the factor risk-impact panel
// ===========================================================================

describe('RiskAttributionService — factor risk impact', () => {
  it('when the factor impacts are read, they make one whole and name a residual', () => {
    const service = setup();

    const impacts = service.factorImpacts();
    expect(sum(impacts.map((f) => f.impact))).toBeCloseTo(1, 9);
    expect(impacts.filter((f) => f.residual)).toHaveLength(1);
    for (const f of impacts) {
      expect(f.impact).toBeGreaterThanOrEqual(0);
      expect(f.impact).toBeLessThanOrEqual(1);
    }
  });

  it('when the book is grouped by factor, the panel and the table print the same shares', async () => {
    const service = setup();

    await change(service.setGrouping('factor'));

    const shares = service.rows().map((r) => r.eulerShare);
    expect(service.factorImpacts().map((f) => f.impact)).toEqual(shares);
  });

  it('when the panel groups its factors, the rolled-up impacts still make one whole', () => {
    const service = setup();

    service.factorView.set('factor-group');

    const impacts = service.factorImpacts();
    expect(impacts.length).toBeLessThan(4);
    expect(sum(impacts.map((f) => f.impact))).toBeCloseTo(1, 9);
    expect(impacts.filter((f) => f.residual)).toHaveLength(1);
  });

  it('when the toolbar groups by asset, the factor panel stays readable', () => {
    const service = setup();

    expect(service.grouping()).toBe('asset');
    expect(service.factorImpacts().length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Criterion — the toolbar's inert controls
// ===========================================================================

describe('RiskAttributionService — parameter applicability', () => {
  it('when the measure is Volatility, confidence and estimation approach are disabled with a reason', () => {
    const service = setup();

    expect(service.confidenceEnabled()).toBe(false);
    expect(service.approachEnabled()).toBe(false);
    expect(service.confidenceDisabledReason()).not.toBeNull();
    expect(service.approachDisabledReason()).not.toBeNull();
  });

  it('when the measure is ES, confidence applies but the estimation approach does not', async () => {
    const service = setup();

    await change(service.setMeasure('es'));

    expect(service.confidenceEnabled()).toBe(true);
    expect(service.confidenceDisabledReason()).toBeNull();
    expect(service.approachEnabled()).toBe(false);
    expect(service.approachDisabledReason()).not.toBeNull();
  });

  it('when the measure is VaR, both apply', async () => {
    const service = setup();

    await change(service.setMeasure('var'));

    expect(service.confidenceEnabled()).toBe(true);
    expect(service.approachEnabled()).toBe(true);
    expect(service.approachDisabledReason()).toBeNull();
  });

  it('when the measure is Volatility, the confidence level does not move the numbers', async () => {
    const service = setup();
    const ec = service.economicCapital();

    await change(service.setConfidence(99));

    expect(service.economicCapital()).toBe(ec);
  });

  it('when the measure is ES, a higher confidence level demands more capital', async () => {
    const service = setup();
    await change(service.setMeasure('es'));
    await change(service.setConfidence(90));
    const at90 = service.economicCapital();

    await change(service.setConfidence(99));

    expect(service.economicCapital()).toBeGreaterThan(at90);
  });

  it('when the measure is ES, the estimation approach does not move the numbers', async () => {
    const service = setup();
    await change(service.setMeasure('es'));
    const ec = service.economicCapital();

    await change(service.setApproach('parametric'));

    expect(service.economicCapital()).toBe(ec);
  });

  it('when the measure is VaR, the estimation approach moves the numbers', async () => {
    const service = setup();
    await change(service.setMeasure('var'));
    const ec = service.economicCapital();

    await change(service.setApproach('parametric'));

    expect(service.economicCapital()).not.toBe(ec);
  });

  it('when a tail measure is read at a confidence its sample cannot support, the estimate is flagged uncertain', async () => {
    const service = setup();
    await change(service.setMeasure('es'));

    await change(service.setConfidence(99));
    expect(service.estimateUncertain()).toBe(true);

    await change(service.setConfidence(90));
    expect(service.estimateUncertain()).toBe(false);
  });

  it('when the measure is Volatility, no confidence level makes the estimate uncertain', async () => {
    const service = setup();

    for (const confidence of ATTRIBUTION_CONFIDENCES) {
      await change(service.setConfidence(confidence));
      expect(service.estimateUncertain()).toBe(false);
    }
  });
});

// ===========================================================================
// Criterion — snapshots
// ===========================================================================

describe('RiskAttributionService — snapshots', () => {
  it('when an older snapshot is selected, the page says the reading is not current', async () => {
    const service = setup();
    const older = service.snapshots.find((s) => !s.latest)!;

    await change(service.setSnapshot(older.id));

    expect(service.snapshot().id).toBe(older.id);
    expect(service.snapshotStale()).toBe(true);
  });

  it('when the latest snapshot is selected, nothing is flagged stale', () => {
    const service = setup();

    expect(service.snapshotStale()).toBe(false);
  });

  it('when the snapshot changes, the whole decomposition is recomputed', async () => {
    const service = setup();
    const ec = service.economicCapital();
    const older = service.snapshots.find((s) => !s.latest)!;

    await change(service.setSnapshot(older.id));

    expect(service.economicCapital()).not.toBe(ec);
  });

  it('when an unknown snapshot is asked for, the selection is left alone', async () => {
    const service = setup();
    const current = service.snapshot().id;

    await change(service.setSnapshot('1999-01-01'));

    expect(service.snapshot().id).toBe(current);
  });
});

// ===========================================================================
// Criterion — the $/% toggle formats, it never recomputes
// ===========================================================================

describe('RiskAttributionService — display-only controls', () => {
  it('when the display unit changes, the page stays ready and the numbers are untouched', async () => {
    const service = setup();
    const recompute = vi.spyOn(service, 'recompute');
    const before = service.rows();

    service.displayUnit.set('percent');

    expect(service.state()).toBe('ready');
    expect(service.rows()).toEqual(before);

    await settle();

    expect(service.state()).toBe('ready');
    expect(recompute).not.toHaveBeenCalled();
  });

  it('when the search changes, the page stays ready and never recomputes', async () => {
    const service = setup();
    const recompute = vi.spyOn(service, 'recompute');

    service.search.set('msf');

    expect(service.state()).toBe('ready');
    expect(service.visibleRows().map((r) => r.id)).toEqual(['MSFT']);

    await settle();

    expect(recompute).not.toHaveBeenCalled();
  });

  it('when the search matches nothing, the table empties but the book does not', () => {
    const service = setup();

    service.search.set('nothing here');

    expect(service.visibleRows()).toHaveLength(0);
    expect(service.rows().length).toBeGreaterThan(0);
    expect(service.state()).toBe('ready');
  });

  it('when the factor panel is regrouped, the page stays ready and never recomputes', async () => {
    const service = setup();
    const recompute = vi.spyOn(service, 'recompute');

    service.factorView.set('factor-group');
    await settle();

    expect(service.state()).toBe('ready');
    expect(recompute).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Criterion — loading, error and recovery
// ===========================================================================

describe('RiskAttributionService — lifecycle', () => {
  it('when a parameter changes, the page loads and names the control that is busy', async () => {
    const service = setup();

    const work = service.setMeasure('es');

    expect(service.state()).toBe('loading');
    expect(service.pendingParameter()).toBe('measure');

    await settle();
    await work;

    expect(service.state()).toBe('ready');
    expect(service.pendingParameter()).toBeNull();
  });

  it('when a parameter is set to the value it already has, nothing is recomputed', async () => {
    const service = setup();

    const work = service.setMeasure('volatility');

    expect(service.state()).toBe('ready');

    await settle();
    await work;

    expect(service.state()).toBe('ready');
  });

  it('when the calculation fails, the page shows an error naming the parameter in flight', async () => {
    const service = setup();

    const work = service.recompute(true, 'snapshot');
    await settle();
    await work;

    expect(service.state()).toBe('error');
    expect(service.error()?.message).toBeTruthy();
    expect(service.error()?.detail).toBeTruthy();
    expect(service.error()?.parameter).toBe('snapshot');
  });

  it('when the error is cleared, the page returns to its populated view', async () => {
    const service = setup();

    const work = service.recompute(true);
    await settle();
    await work;
    service.clearError();

    expect(service.error()).toBeNull();
    expect(service.state()).toBe('ready');
  });

  it('when the calculation is retried after a failure, the page loads and recovers', async () => {
    const service = setup();
    const failed = service.recompute(true);
    await settle();
    await failed;

    const retried = service.recompute();
    expect(service.state()).toBe('loading');
    await settle();
    await retried;

    expect(service.state()).toBe('ready');
    expect(service.error()).toBeNull();
  });
});

// ===========================================================================
// Criterion — the empty book
// ===========================================================================

describe('RiskAttributionService — empty', () => {
  it('when no portfolio is selected, the page is empty and says so', () => {
    const service = setup();

    service.selectPortfolio(null);

    expect(service.state()).toBe('empty');
    expect(service.emptyReason()).toBe('no-portfolio');
    expect(service.rows()).toHaveLength(0);
  });

  it('when the book holds a single component, attribution is not defined', () => {
    const service = setup();

    service.selectPortfolio('single-name');

    expect(service.rows()).toHaveLength(1);
    expect(service.state()).toBe('empty');
    expect(service.emptyReason()).toBe('too-few-components');
  });

  it('when no portfolio is selected, changing a parameter does not pretend to compute', async () => {
    const service = setup();
    service.selectPortfolio(null);

    const work = service.setMeasure('es');
    expect(service.state()).toBe('empty');

    await settle();
    await work;

    expect(service.state()).toBe('empty');
    expect(service.error()).toBeNull();
  });
});

// ===========================================================================
// Criterion — the selection shared by the table and the chart
// ===========================================================================

describe('RiskAttributionService — selection', () => {
  it('when a component is selected, the detail reads the row and nothing else', () => {
    const service = setup();

    service.selectComponent('AAPL');

    const detail = service.selectedDetail()!;
    const aapl = row(service, 'AAPL');
    expect(detail.component).toBe(aapl);
    expect(detail.betaToPortfolio).toBe(aapl.eulerShare);
    expect(detail.portfolioRorac).toBe(service.portfolioRorac());
    expect(detail.roracVsPortfolio).toBe('above');
    expect(detail.title).toContain('AAPL');
  });

  it('when a hedge is selected, the detail reports no RORAC comparison', () => {
    const service = setup();

    service.selectComponent('TLT');

    expect(service.selectedDetail()?.roracVsPortfolio).toBeNull();
  });

  it('when the panel is closed, the selection is dropped', () => {
    const service = setup();
    service.selectComponent('AAPL');

    service.selectComponent(null);

    expect(service.selectedComponentId()).toBeNull();
    expect(service.selectedDetail()).toBeNull();
  });

  it('when an unknown component is selected, the selection is left alone', () => {
    const service = setup();
    service.selectComponent('AAPL');

    service.selectComponent('NOT-IN-BOOK');

    expect(service.selectedComponentId()).toBe('AAPL');
  });

  it('when the grouping changes, a selection that no longer exists is dropped', async () => {
    const service = setup();
    service.selectComponent('AAPL');

    await change(service.setGrouping('factor'));

    expect(service.selectedComponentId()).toBeNull();
    expect(service.selectedDetail()).toBeNull();
  });

  it('when the detail title is built, it names the parameters the figures were computed under', async () => {
    const service = setup();
    await change(service.setMeasure('es'));
    service.selectComponent('AAPL');

    const title = service.selectedDetail()!.title;
    expect(title).toContain('ES');
    expect(title).toContain('95%');
    expect(title).toContain('Euler');
  });

  it('when the measure has no confidence level, the title does not print one', () => {
    const service = setup();
    service.selectComponent('AAPL');

    expect(service.selectedDetail()!.title).not.toContain('95%');
  });
});

// ===========================================================================
// Criterion — the grouping rebuilds the rows without moving EC
// ===========================================================================

describe('RiskAttributionService — grouping', () => {
  it('when the grouping changes, the rows change but the total risk does not', async () => {
    const service = setup();
    const ec = service.economicCapital();

    await change(service.setGrouping('sub-portfolio'));

    expect(service.rows().length).not.toBe(26);
    expect(service.economicCapital()).toBeCloseTo(ec, 6);
  });

  it('when the grouping is coarser, less of the diversification is visible', async () => {
    const service = setup();
    const byAsset = service.portfolioDi();

    await change(service.setGrouping('sub-portfolio'));
    const bySleeve = service.portfolioDi();
    await change(service.setGrouping('factor'));

    expect(bySleeve).toBeGreaterThan(byAsset);
    expect(service.portfolioDi()).toBeGreaterThan(bySleeve);
  });

  it('when any grouping is active, the weights still make one whole', async () => {
    const service = setup();

    for (const grouping of ATTRIBUTION_GROUPINGS) {
      await change(service.setGrouping(grouping));
      expect(service.totals().weight, grouping).toBeCloseTo(1, 9);
    }
  });
});

// ===========================================================================
// Criterion — the percent display divides by one published number
// ===========================================================================

describe('RiskAttributionService — percent display', () => {
  it('when percentages are shown, they are the risk figures over net asset value', () => {
    const service = setup();

    expect(service.netAssetValue()).toBeGreaterThan(0);
    expect(service.economicCapital() / service.netAssetValue()).toBeLessThan(1);
  });
});

// ===========================================================================
// Criterion — the measure's sub-additivity is published, not assumed
// ===========================================================================

describe('RiskAttributionService — sub-additivity of the active measure', () => {
  it('when the measure is VaR, the page is told the measure is not sub-additive in general', async () => {
    const service = setup();

    await change(service.setMeasure('var'));

    expect(service.measureIsSubadditive()).toBe(false);
    expect(service.measureSubadditivityNote()).toContain('not sub-additive');
  });

  it('when the measure is Volatility or ES, the page is told the bound holds by construction', async () => {
    const service = setup();
    const subadditive: readonly AttributionMeasure[] = ['volatility', 'es'];

    for (const measure of subadditive) {
      await change(service.setMeasure(measure));
      expect(service.measureIsSubadditive(), measure).toBe(true);
    }
  });
});

// ===========================================================================
// Criterion — every confidence level is reachable
// ===========================================================================

describe('RiskAttributionService — confidence levels', () => {
  it('when the tail measures are read, all three confidence levels produce a decomposition', async () => {
    const service = setup();
    await change(service.setMeasure('var'));

    for (const confidence of ATTRIBUTION_CONFIDENCES) {
      await change(service.setConfidence(confidence));
      expect(service.rows().length, `${confidence}`).toBe(26);
      expect(service.economicCapital(), `${confidence}`).toBeGreaterThan(0);
    }
  });
});
